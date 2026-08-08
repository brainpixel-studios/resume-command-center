#!/usr/bin/env python3
"""Render a resume PDF from JSON data. Called by server.mjs via subprocess.

Pagination is content-driven — no role id or title is special-cased. Target is 2 pages,
achieved by the fit loop (see fit_and_render); overflow is reported, never hidden.
"""

import json
import sys
from xml.sax.saxutils import escape
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
from reportlab.lib.colors import HexColor
from reportlab.platypus import (
    BaseDocTemplate, PageTemplate, Frame, NextPageTemplate, Paragraph, Spacer,
    HRFlowable, Table, TableStyle, KeepTogether,
)

# Uniform page margin — the SAME inset on all four sides (top/bottom/left/right) so the
# whitespace border reads balanced. All frame + header geometry derives from this one value;
# change it here and every edge tracks together. (2026-07-18, operator: equal whitespace all around)
MARGIN = 0.5 * inch
GRAY = HexColor("#555555")
BLACK = HexColor("#000000")
RULE_COLOR = HexColor("#CCCCCC")
BODY_COLOR = HexColor("#333333")

def build_styles(spacing=1.0, type_scale=1.0):
    """Build paragraph styles.

    spacing    — PRIMARY fit lever (leading / spaceAfter / spaceBefore). Invisible to
                 readability, so it is exhausted before type is touched at all.
    type_scale — LAST-RESORT lever. Applied UNIFORMLY to every fontSize so the type
                 hierarchy stays proportional. Floor 0.94. See spec D5.

    Colors are never scaled. leftIndent/firstLineIndent stay fixed — scaling indents
    with type makes bullets visibly ragged across scales.
    """
    def fs(v):   # font size — uniform type scale only
        return v * type_scale

    def ld(v):   # leading — tracks type, then tightens with spacing
        return v * type_scale * spacing

    def sp(v):   # spaceAfter / spaceBefore — pure spacing lever
        return v * spacing

    return {
        'name': ParagraphStyle('Name', fontName='Helvetica-Bold', fontSize=fs(14), alignment=TA_CENTER, spaceAfter=sp(2), textColor=BLACK, leading=ld(16)),
        # spaceAfter is the whitespace ABOVE the header/contact rule; tuned to 3 (from 6) to
        # match rule()'s symmetric padding and the section spaceBefore below it, so the header
        # separator is centered like every section separator. (2026-07-18)
        'contact': ParagraphStyle('Contact', fontName='Helvetica', fontSize=fs(8.5), alignment=TA_CENTER, spaceAfter=sp(3), textColor=GRAY, leading=ld(11)),
        # spaceBefore is the whitespace BELOW a section separator rule (a section header
        # only ever follows a rule), so it is tuned with rule()'s symmetric padding to keep
        # the bar centered in its gap rather than riding high. Reduced 6->3 as the baseline
        # half of the centered-separator work; total boundary gap is held by boundary()'s
        # flexes so pagination is unaffected. (2026-07-18)
        'section': ParagraphStyle('Section', fontName='Helvetica-Bold', fontSize=fs(9), spaceAfter=sp(3), spaceBefore=sp(3), textColor=BLACK, leading=ld(11)),
        'company': ParagraphStyle('Company', fontName='Helvetica-Bold', fontSize=fs(9), spaceAfter=0, textColor=BLACK, leading=ld(11)),
        'title': ParagraphStyle('Title', fontName='Helvetica-Oblique', fontSize=fs(8.5), spaceAfter=sp(2), textColor=BLACK, leading=ld(10.5)),
        # Bullets and body are JUSTIFIED — flush on BOTH the left and right margins. The
        # bullet hangs at the margin via the <bullet> tag; firstLineIndent=0 keeps the first
        # line aligned with the wrapped lines below it, so there is no staircase indent past
        # line 1. One left edge, one right edge — unified across every bullet. (2026-07-17)
        'bullet': ParagraphStyle('Bullet', fontName='Helvetica', fontSize=fs(8), leftIndent=14, firstLineIndent=0, spaceAfter=sp(2), textColor=BODY_COLOR, leading=ld(10.5), alignment=TA_JUSTIFY),
        'body': ParagraphStyle('Body', fontName='Helvetica', fontSize=fs(8), spaceAfter=sp(4), textColor=BODY_COLOR, leading=ld(10.5), alignment=TA_JUSTIFY),
        'comp_label': ParagraphStyle('CompLabel', fontName='Helvetica-Bold', fontSize=fs(8), textColor=BLACK, leading=ld(10)),
        'dates': ParagraphStyle('Dates', fontName='Helvetica', fontSize=fs(8), alignment=2, textColor=GRAY, leading=ld(10)),
        'location': ParagraphStyle('Location', fontName='Helvetica', fontSize=fs(8), alignment=2, textColor=GRAY, leading=ld(10)),
    }

def rule(spacing=1.0):
    # spaceAfter/spaceBefore track the fit loop's spacing lever, same as every paragraph
    # gap (build_styles.sp), so section separators stay proportional to bullet rhythm at
    # every compression level instead of reading looser as spacing tightens. (2026-07-17)
    #
    # SYMMETRIC (spaceBefore == spaceAfter): the bar owns equal whitespace above and below
    # itself. This is the baseline half of the centered-separator work — the total owned
    # space is unchanged (was 2+4, now 3+3 = 6*spacing) so page geometry is untouched, but
    # the bar no longer sits low in its own padding. The justify half (equal productive flex
    # above and below each rule) is in make_story.boundary(). (2026-07-18)
    return HRFlowable(width="100%", thickness=0.5, color=RULE_COLOR,
                      spaceAfter=3 * spacing, spaceBefore=3 * spacing)

def header_block(h, styles, spacing=1.0):
    """Name + contact + rule — used on both pages."""
    return [
        Paragraph(h.get('name', '').upper(), styles['name']),
        Paragraph(f"{h.get('location', '')} | {h.get('phone', '')} | {h.get('email', '')}", styles['contact']),
        rule(spacing),
    ]

def role_block(role, pos, styles, doc_width, spacing=1.0):
    """Render a single position within a role.

    The whole position — company/title header + ALL its bullets — binds in ONE
    KeepTogether so a single job/function never splits across a page boundary (operator
    pref 2026-07-17). The trailing spacer stays outside so it can be dropped at a break.
    See the KeepTogether comment on the return for the full rationale and constraints.
    """
    company_text = f"<b>{role.get('company', '')}</b>"
    loc_text = role.get('location', '')
    title_text = pos.get('title', '')
    if pos.get('note'):
        title_text += f" ({pos['note']})"
    if pos.get('descriptor'):
        title_text += f" — {pos['descriptor']}"

    # Company + location
    t = Table(
        [[Paragraph(company_text, styles['company']), Paragraph(loc_text, styles['location'])]],
        colWidths=[doc_width * 0.65, doc_width * 0.35],
    )
    t.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))

    # Title + dates
    t2 = Table(
        [[Paragraph(title_text, styles['title']), Paragraph(pos.get('dates', ''), styles['dates'])]],
        colWidths=[doc_width * 0.65, doc_width * 0.35],
    )
    t2.setStyle(TableStyle([
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 1),
    ]))
    # Bullets
    head = [t, t2]
    bullet_flowables = []
    for bullet in pos.get('bullets', []):
        bv = bullet.get('variants', [])
        ba = bullet.get('active', 0)
        if bv:
            txt = bv[min(ba, len(bv) - 1)].get('text', '')
            bullet_flowables.append(Paragraph(f"<bullet>&bull;</bullet> {txt}", styles['bullet']))
    # Keep the WHOLE position together — company header + title + ALL its bullets — in one
    # KeepTogether, so a single job/function never splits across a page boundary. A company
    # with multiple positions is NOT bound as one unit: each position is its own bundle, so
    # two positions of the same company may land on different pages (operator pref
    # 2026-07-17 — don't compress a company onto one page; bundle each title+role+bullets).
    # The inter-position gap is added by build_pdf as a flex spacer OUTSIDE this group, so it
    # can be dropped at a page break (and expanded by vertical-justify). A position taller
    # than a full page is the only case reportlab must split (it has no choice).
    return [KeepTogether([*head, *bullet_flowables])]

def two_column_bullets(texts, styles, doc_width):
    """Lay out a flat list of strings as a 2-column bulleted grid with no gridlines.

    The shared layout primitive for Core Competencies, Ancillary, and collegiate
    activities. It reuses the SAME `bullet` style and <bullet> tag as the main document
    bullets, so font, glyph, hanging indent, and vertical rhythm are identical — the only
    difference from a full-width bullet is the column. LEFTPADDING=0 lands column 1 on the
    document margin so grid bullets line up with the rest of the document. Text is
    HTML-escaped here — pass raw strings. An odd count leaves the last right cell empty.
    """
    def cell(text):
        return Paragraph(f"<bullet>&bull;</bullet> {escape(text)}", styles['bullet'])

    rows = []
    for i in range(0, len(texts), 2):
        right = cell(texts[i + 1]) if i + 1 < len(texts) else Paragraph("", styles['bullet'])
        rows.append([cell(texts[i]), right])

    col_width = doc_width * 0.5
    # reportlab DROPS a Paragraph's spaceAfter inside a table cell, so grid rows would pack
    # 2pt tighter than main-flow bullets (which advance by leading + spaceAfter). To keep one
    # bullet rhythm across the whole document, put that spaceAfter back as BOTTOMPADDING —
    # read from the shared bullet style so it tracks the fit loop's spacing lever. (2026-07-17)
    row_gap = styles['bullet'].spaceAfter
    t = Table(rows, colWidths=[col_width, col_width])
    t.setStyle(TableStyle([
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),          # column 1 lands on the document margin
        ('RIGHTPADDING', (0, 0), (-1, -1), 8),         # column gutter
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), row_gap),  # match main-bullet row advance
    ]))
    return t


def competency_table(comp_groups, styles, doc_width, spacing=1.0):
    """Render competency groups: a label row per group, then that group's items in the
    shared 2-column bulleted grid (see two_column_bullets)."""
    elements = [Paragraph("CORE COMPETENCIES", styles['section'])]
    for group in comp_groups:
        active_items = [i['text'] for i in group.get('items', []) if i.get('active', True)]
        if not active_items:
            continue
        elements.append(Paragraph(f"{group.get('label', '')}:", styles['comp_label']))
        elements.append(two_column_bullets(active_items, styles, doc_width))
        elements.append(Spacer(1, 2 * spacing))  # inter-group gap tracks the spacing lever
    return elements

class _FillDocTemplate(BaseDocTemplate):
    """BaseDocTemplate that records how full each page ended up.

    The fit loop needs to GROW short resumes to fill both pages, and page count alone
    can't tell a 30%-full page 2 from a 95%-full one. After each flowable is placed,
    reportlab leaves the frame's y-cursor (`_y`) at the top of the remaining space, so
    the lowest cursor reached on a page is where its content ends. Fill fraction is the
    used height over the frame height, computed against whichever frame that page used
    (page 1's tall frame vs pages 2+'s header-inset frame), so it stays honest across
    templates. Private reportlab attributes (`_y`, `_y1`) are load-bearing here — see
    the fit-metric validation in the pagination tests.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._page_used = {}          # page number -> fill fraction in [0, 1]
        self._frame_h = {}            # page number -> that page's frame height (pt)
        self._flex_page = {}          # flex_idx -> page it landed on (vertical-justify)
        self._flex_order = {}         # flex_idx -> placement order
        self._flex_base = {}          # flex_idx -> its natural (unjustified) height
        self._last_content_order = {}  # page -> placement order of its last CONTENT flowable
        self._place = 0

    def afterFlowable(self, flowable):
        fr = self.frame
        if fr is None or not fr.height:
            return
        used = (fr._y1 + fr.height) - fr._y  # frame top minus current cursor
        self._page_used[self.page] = max(0.0, min(1.0, used / fr.height))
        self._frame_h[self.page] = fr.height
        self._place += 1
        idx = getattr(flowable, 'flex_idx', None)  # tag set by build_pdf's flex spacers
        if idx is not None:
            self._flex_page[idx] = self.page
            self._flex_order[idx] = self._place
            self._flex_base[idx] = getattr(flowable, 'flex_base', 0.0)
        else:
            self._last_content_order[self.page] = self._place

    def page_fills(self):
        """Return [fill_page1, fill_page2, ...] in page order. Empty doc -> []."""
        return [self._page_used[p] for p in sorted(self._page_used)]


JUSTIFY_BUFFER = 1.0  # pt of slack left below the last line when filling a page (rounding guard)


def build_pdf(data, output_path, spacing=1.0, type_scale=1.0, fill_bottom=False):
    """Render the resume. Returns (page_count, page_fills).

    page_fills is a per-page list of fill fractions in [0, 1] (see _FillDocTemplate).
    Pagination is content-driven: no role id or title is special-cased. The header
    repeats on pages 2+ via the 'later' PageTemplate's onPage callback.

    fill_bottom — vertical-justify: after pagination settles, inflate section/inter-position
    gaps so each page's content reaches the bottom margin (last line ~JUSTIFY_BUFFER above
    it). Bullet gaps are never touched, so the bullet rhythm is preserved.
    """
    styles = build_styles(spacing, type_scale)
    h = data.get('header', {})
    doc_width = letter[0] - 2 * MARGIN

    # A canvas string is drawn from its BASELINE, so drawing the running header at the
    # top-margin line would push its cap-height UP into the margin — landing higher than
    # page 1's name, which is a flowable whose cap sits just BELOW the frame top. Drop the
    # header baseline by ~one header-font-size so both pages' names start at the same
    # position, and grow header_reserve by the same amount so content clears the rule.
    # (2026-07-18; coefficient tuned to align page-1 and page-2 name tops within ~1pt.)
    header_drop = 11.3 * type_scale

    def draw_later_header(canvas, doc):
        """Draw name + contact at the top of every page after the first."""
        canvas.saveState()
        y = letter[1] - MARGIN - header_drop
        canvas.setFont('Helvetica-Bold', 11 * type_scale)
        canvas.setFillColor(BLACK)
        canvas.drawCentredString(letter[0] / 2, y, h.get('name', '').upper())
        canvas.setFont('Helvetica', 7.5 * type_scale)
        canvas.setFillColor(GRAY)
        contact = f"{h.get('location', '')} | {h.get('phone', '')} | {h.get('email', '')}"
        canvas.drawCentredString(letter[0] / 2, y - 11 * type_scale, contact)
        canvas.setStrokeColor(RULE_COLOR)
        canvas.setLineWidth(0.5)
        canvas.line(MARGIN, y - 18 * type_scale, letter[0] - MARGIN, y - 18 * type_scale)
        canvas.restoreState()

    def make_doc():
        doc = _FillDocTemplate(
            output_path, pagesize=letter,
            leftMargin=MARGIN, rightMargin=MARGIN,
            topMargin=MARGIN, bottomMargin=MARGIN,
        )
        # Page 1: full-height frame — the header is a flowable, as before.
        first_frame = Frame(
            MARGIN, MARGIN, doc_width, letter[1] - 2 * MARGIN, id='first',
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        # Pages 2+: frame inset to leave room for the callback-drawn header (grown by
        # header_drop so the lowered header still clears the frame content by the same gap).
        header_reserve = 26 * type_scale + header_drop
        later_frame = Frame(
            MARGIN, MARGIN, doc_width, letter[1] - 2 * MARGIN - header_reserve, id='later',
            leftPadding=0, rightPadding=0, topPadding=0, bottomPadding=0,
        )
        doc.addPageTemplates([
            PageTemplate(id='first', frames=[first_frame]),
            PageTemplate(id='later', frames=[later_frame], onPage=draw_later_header),
        ])
        return doc

    def make_story(inject):
        # Vertical-justify hook: a zero-height Spacer at each SECTION and INTER-POSITION
        # boundary — never a bullet gap, so the bullet rhythm is untouched. `inject` maps a
        # flex index to extra height; the fill pass inflates these to push content down to
        # the bottom margin. Indices are assigned in document order and reset here, so they
        # are stable across the measure pass and the final pass.
        inj = inject or {}
        flex_n = [0]

        def flex(base=0.0):
            # `base` is the natural gap here (0 at section boundaries, one inter-position gap
            # between jobs). inject overrides it: productive gaps grow (base + share), and a
            # trailing gap (last job before a break) collapses to 0 so it adds no bottom
            # whitespace. Without inject (measure pass / normal render), the base is used.
            k = flex_n[0]
            flex_n[0] += 1
            s = Spacer(1, max(0.0, inj.get(k, base)))
            s.flex_idx = k
            s.flex_base = base
            return s

        def boundary():
            # Emit a section separator that stays vertically CENTERED in its gap under
            # vertical-justify. The invariant: exactly one productive flex ABOVE the rule and
            # one BELOW, so (flexes_below - flexes_above) == 0 at the bar and the fill pass
            # inflates both sides by the same `per`. Without the flex_above, justify loads
            # only the bottom and the bar drifts up (the pre-2026-07-18 behavior); a stray
            # extra flex on one side drifts it the other way. Baseline symmetry (no justify)
            # comes from rule() being symmetric + the reduced section spaceBefore. Every
            # section boundary in this story goes through here so all bars behave identically.
            #
            # base=1.5*spacing on BOTH flexes restores most of the per-boundary gap that the
            # reduced section spaceBefore (6->3) gave up. Net measure-pass change is small
            # (~10*spacing shorter overall, incl. the removed Experience trailing gap), which
            # can only RELAX the SHRINK/GROW tier by a step, never tighten it — page count
            # holds. The real resume's tier is unchanged; a resume sitting exactly on a tier
            # boundary may render one step looser (a benign direction). Equal bases keep the
            # baseline centered; justify adds the same `per` to each.
            story.append(flex(base=1.5 * spacing))  # whitespace ABOVE the bar (productive)
            story.append(rule(spacing))             # the gray bar
            story.append(flex(base=1.5 * spacing))  # whitespace BELOW the bar (productive)

        # BaseDocTemplate uses the FIRST template for every page unless the story switches.
        # NextPageTemplate applies from the NEXT page onward, so page 1 keeps 'first' (tall
        # flowable header) and pages 2+ get 'later' (callback-drawn header). Without this,
        # the header never repeats and the layout looks broken for no visible reason.
        story = [NextPageTemplate('later')]

        # Header (page 1 only — pages 2+ get it from the 'later' template callback)
        story.extend(header_block(h, styles, spacing))

        # Summary
        summary = data.get('summary', {})
        variants = summary.get('variants', [])
        active = summary.get('active', 0)
        if variants:
            story.append(Paragraph("PROFESSIONAL SUMMARY", styles['section']))
            text = variants[min(active, len(variants) - 1)].get('text', '')
            for para in text.split('\n\n'):
                if para.strip():
                    story.append(Paragraph(para.strip(), styles['body']))
            boundary()

        # Experience — no role id or title is special-cased; pagination falls out of
        # KeepTogether + the fit loop.
        roles = data.get('roles', [])
        if roles:
            story.append(Paragraph("PROFESSIONAL EXPERIENCE", styles['section']))
            positions = [(role, pos) for role in roles for pos in role.get('positions', [])]
            for i, (role, pos) in enumerate(positions):
                story.extend(role_block(role, pos, styles, doc_width, spacing))
                # inter-position gap (base 4*spacing) BETWEEN jobs only — expandable by
                # justify, dropped to 0 at a page break (never a bullet gap). It is NOT
                # emitted after the LAST position: boundary() supplies the single productive
                # flex above the rule, so the separator keeps equal flex counts on both sides
                # and stays centered. (Emitting it here too would put 2 flexes above / 1 below
                # and drift the bar down — the Experience rule is the canary for that bug.)
                if i < len(positions) - 1:
                    story.append(flex(base=4 * spacing))
            boundary()

        # Achievements
        achievements = data.get('achievements', [])
        if achievements:
            story.append(Paragraph("SELECTED ACHIEVEMENTS", styles['section']))
            for ach in achievements:
                av = ach.get('variants', [])
                aa = ach.get('active', 0)
                if av:
                    txt = av[min(aa, len(av) - 1)].get('text', '')
                    story.append(Paragraph(f"<bullet>&bull;</bullet> {txt}", styles['bullet']))
            boundary()

        # Competencies (2-column tables)
        comp_groups = data.get('competencyGroups', [])
        if comp_groups:
            story.extend(competency_table(comp_groups, styles, doc_width, spacing))
            boundary()

        # Education
        education = data.get('education', [])
        # Ancillary presence decides Education's trailing gap: when Ancillary follows, its
        # boundary() supplies the flex ABOVE the separator (so Education doesn't also emit
        # one — that would double the above-rule flex and drift the bar down). When Education
        # is the last section, it keeps its own trailing flex so justify can fill the page.
        ancillary = [a['text'] for a in data.get('ancillary', []) if a.get('text')]
        if education:
            story.append(Paragraph("EDUCATION", styles['section']))
            for edu in education:
                t = Table(
                    [[Paragraph(f"<b>{edu.get('school', '')}</b>", styles['company']),
                      Paragraph(edu.get('location', ''), styles['location'])]],
                    colWidths=[doc_width * 0.65, doc_width * 0.35],
                )
                t.setStyle(TableStyle([
                    ('ALIGN', (1, 0), (1, 0), 'RIGHT'), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
                    ('LEFTPADDING', (0, 0), (-1, -1), 0), ('RIGHTPADDING', (0, 0), (-1, -1), 0),
                    ('TOPPADDING', (0, 0), (-1, -1), 0), ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
                ]))
                story.append(t)
                story.append(Paragraph(edu.get('degree', ''), styles['title']))
                # Collegiate activities: one per line in the free-text field, each becomes an
                # item in the shared 2-column grid (like Core Competencies) so it reads unified.
                sports_items = [s.strip() for s in edu.get('sports', '').split('\n') if s.strip()]
                if sports_items:
                    story.append(two_column_bullets(sports_items, styles, doc_width))
            if not ancillary:
                story.append(flex())  # trailing fill only when the doc ends at Education

        # Ancillary — supplementary personal info in the shared 2-column grid (see
        # two_column_bullets), matching Core Competencies. Rendered last; Education gains a
        # separator rule only when this section is present. Absent/empty -> section omitted.
        if ancillary:
            boundary()  # flex above / rule / flex below — centers the Ancillary separator
            story.append(Paragraph("ANCILLARY", styles['section']))
            story.append(two_column_bullets(ancillary, styles, doc_width))

        return story

    if not fill_bottom:
        doc = make_doc()
        doc.build(make_story(None))
        return doc.page, doc.page_fills()

    # Vertical-justify: measure where breaks fall and how much slack each page has, then
    # inflate that page's flex spacers to push its content down to ~JUSTIFY_BUFFER above the
    # bottom margin. Adding <= slack of space cannot move a break (the last block slides into
    # space that was already empty), so one measure pass + one rebuild is exact and can't
    # spill to another page. A natural 1-pager is left alone — nothing to fill.
    measure = make_doc()
    measure.build(make_story(None))
    if measure.page <= 1:
        return measure.page, measure.page_fills()

    fills = measure.page_fills()
    by_page = {}
    for k, pg in measure._flex_page.items():
        # Only a flex gap with CONTENT below it on the same page can push content down toward
        # the bottom margin. A trailing gap (last flowable on its page — e.g. after the final
        # job before a page break) can't fill; it's handled separately below.
        if measure._flex_order.get(k, 0) < measure._last_content_order.get(pg, 0):
            by_page.setdefault(pg, []).append(k)
    productive = {k for ks in by_page.values() for k in ks}
    # Space freed per page by collapsing its trailing gap(s) — added back to that page's fill
    # budget so it is redistributed ABOVE the content (pushing the last line down) instead of
    # being left as dead bottom whitespace.
    freed = {}
    for k, base in measure._flex_base.items():
        if k not in productive and base > 0:
            pg = measure._flex_page.get(k)
            freed[pg] = freed.get(pg, 0.0) + base
    inject = {}
    for pg, idxs in by_page.items():
        fill = fills[pg - 1] if 0 <= pg - 1 < len(fills) else 1.0
        slack = measure._frame_h.get(pg, 0.0) * (1.0 - fill)
        budget = max(0.0, slack + freed.get(pg, 0.0) - JUSTIFY_BUFFER)
        per = budget / len(idxs) if (idxs and budget > 0) else 0.0
        for k in idxs:
            inject[k] = measure._flex_base.get(k, 0.0) + per  # keep the base gap, add fill
    # Collapse the trailing gap(s) themselves so a job-ending page matches a section-ending one.
    for k, base in measure._flex_base.items():
        if k not in productive and base > 0:
            inject[k] = 0.0

    final = make_doc()
    final.build(make_story(inject))
    return final.page, final.page_fills()


# Fit ladder (spec D5, operator-ratified 2026-07-15; grow-to-fill added 2026-07-16).
#
# SHRINK (content > 2 pages): spacing is the PRIMARY lever — invisible to readability, so
# it is exhausted at every type scale before type is touched. Type is LAST-RESORT, applied
# uniformly so the hierarchy stays proportional. Floor 0.94 -> bullets 8.0pt becomes 7.5pt;
# never shrink past this: overflow beats illegibility.
SHRINK_SPACING = [1.0, 0.95, 0.90, 0.85, 0.80]
SHRINK_TYPE = [1.0, 0.97, 0.94]
# GROW (2 pages, but page 2 under-full): fill with WHITESPACE ONLY — spacing up, type held
# at 1.0 (operator choice 2026-07-16: keep the 8pt body, don't enlarge it). Ceiling 1.50.
# The render that best fills the last page without spilling to a 3rd wins.
GROW_SPACING = [1.05, 1.10, 1.15, 1.20, 1.25, 1.30, 1.35, 1.40, 1.45, 1.50]
FILL_TARGET = 0.90  # a last page at/above this reads as filled; stop growing once reached
MAX_PAGES = 2


def _last_fill(fills):
    return fills[-1] if fills else 0.0


def _telemetry(pages, spacing, type_scale, fills):
    return {'pages': pages, 'spacing': spacing, 'typeScale': type_scale,
            'fill': _last_fill(fills), 'fills': fills}


def _finalize(data, output_path, spacing, type_scale):
    """Render the winning scale with vertical-justify so each page fills to the bottom
    margin, then report telemetry. The fit-chosen spacing/type stay in the report; only
    pages/fills come from the justified build (build_pdf leaves a 1-pager unfilled)."""
    pages, fills = build_pdf(data, output_path, spacing, type_scale, fill_bottom=True)
    return _telemetry(pages, spacing, type_scale, fills)


def fit_and_render(data, output_path):
    """Render at the scale that best fills exactly MAX_PAGES. Returns fit telemetry.

    Three regimes, keyed off the natural (1.0/1.0) render:
      • > 2 pages                    -> SHRINK on the D5 ladder (spacing first, type last).
      • 2 pages with page 2 under-full -> GROW spacing to fill both (type held at 1.0).
      • already-full 2 pages, or a natural 1-pager -> leave untouched.

    Two reportlab constraints drive the build -> measure -> retry shape:
      1. Flowables are CONSUMED by doc.build(), so the story is rebuilt from `data` on
         every attempt (build_pdf constructs its own).
      2. Page count AND fill are only knowable after a build.

    Overflow is reported, never hidden: if nothing fits, render at the floor and return
    the real page count so the UI can tell the operator to trim.
    """
    base_pages, base_fills = build_pdf(data, output_path, 1.0, 1.0)

    # SHRINK — too big for 2 pages. Unchanged from spec D5: return the largest scale that
    # fits, spacing exhausted before type at each tier.
    if base_pages > MAX_PAGES:
        for type_scale in SHRINK_TYPE:
            for spacing in SHRINK_SPACING:
                if type_scale == 1.0 and spacing == 1.0:
                    pages, fills = base_pages, base_fills  # reuse the natural render
                else:
                    pages, fills = build_pdf(data, output_path, spacing, type_scale)
                if pages <= MAX_PAGES:
                    return _finalize(data, output_path, spacing, type_scale)
        # Nothing fit — the floor render is on disk. Report the real page count honestly.
        return _telemetry(pages, spacing, type_scale, fills)

    # GROW — fill an under-full page 2 with whitespace. Only when there IS a second page
    # to fill; a natural 1-pager is kept clean rather than padded onto two.
    best = {'pages': base_pages, 'spacing': 1.0, 'typeScale': 1.0, 'fills': base_fills}
    if base_pages == MAX_PAGES and _last_fill(base_fills) < FILL_TARGET:
        for spacing in GROW_SPACING:
            pages, fills = build_pdf(data, output_path, spacing, 1.0)
            if pages > MAX_PAGES:
                break  # monotonic: more spacing only spills further onto a 3rd page
            if _last_fill(fills) > _last_fill(best['fills']):
                best = {'pages': pages, 'spacing': spacing, 'typeScale': 1.0, 'fills': fills}
            if _last_fill(fills) >= FILL_TARGET:
                break
    # Final render: vertical-justify fills each page's bottom to the margin, and also
    # re-renders the winner so the on-disk file matches the returned telemetry.
    return _finalize(data, output_path, best['spacing'], best['typeScale'])


if __name__ == '__main__':
    data = json.loads(sys.stdin.read())
    output = sys.argv[1] if len(sys.argv) > 1 else '/tmp/resume.pdf'
    result = fit_and_render(data, output)
    result['path'] = output
    print(json.dumps(result))
