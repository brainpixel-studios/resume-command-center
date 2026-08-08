"""Pagination behavior for render-pdf.py. Synthetic data only — no PII.

render-pdf.py cannot be imported (the hyphen in its filename is not a valid Python
identifier), so every assertion goes through the CLI — which is also exactly how
server.mjs invokes it.
"""

import io
import json
import pathlib
import re
import shutil
import subprocess
import sys

import pypdf
import pytest

from tests.fixtures import make_resume

ROOT = pathlib.Path(__file__).resolve().parent.parent
SCRIPT = ROOT / "render-pdf.py"


def render(data, tmp_path, name="out.pdf"):
    """Run render-pdf.py as a subprocess exactly as server.mjs does."""
    out = tmp_path / name
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(out)],
        input=json.dumps(data).encode(),
        capture_output=True,
    )
    assert proc.returncode == 0, f"render failed: {proc.stderr.decode()}"
    return out.read_bytes()


def page_count(pdf_bytes):
    return len(pypdf.PdfReader(io.BytesIO(pdf_bytes)).pages)


def pdf_text(pdf_bytes):
    reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
    return "\n".join(p.extract_text() for p in reader.pages)


def norm(s):
    """Collapse whitespace — pypdf injects line breaks into justified text."""
    return re.sub(r"\s+", " ", s).strip()


def test_no_hardcoded_role_id_in_source():
    """The 'acme_role' page-break hardcode must be gone."""
    src = SCRIPT.read_text()
    assert "'acme_role'" not in src and '"acme_role"' not in src, "hardcoded role id still present"
    assert "Regional Director" not in src, "hardcoded title substring still present"
    assert "page_break_inserted" not in src, "hardcoded break flag still present"


def test_small_resume_fits_two_pages(tmp_path):
    data = make_resume(n_roles=2, n_bullets_per_pos=3)
    assert page_count(render(data, tmp_path)) <= 2


def test_large_resume_forced_to_two_pages(tmp_path):
    """Force-fit (D4): spacing tightens so a big resume still lands on 2 pages.

    Fixture size is calibrated, not arbitrary. Measured against the pre-change renderer:
        3 x 4 -> 1 page    5 x 6 -> 2 pages    6 x 8 -> 3 pages    12 x 8 -> 5 pages
    6 x 8 is the smallest measured size that overflows NATURALLY, so this test fails
    unless the fit loop actually compresses. A 5 x 6 fixture (the first draft) passed
    with no fit loop at all — vacuous.
    """
    data = make_resume(n_roles=6, n_bullets_per_pos=8)
    assert page_count(render(data, tmp_path)) <= 2


def test_header_repeats_on_later_pages(tmp_path):
    """Header on page 2+ must not depend on any hardcoded break."""
    data = make_resume(n_roles=5, n_bullets_per_pos=6)
    pdf = render(data, tmp_path)
    reader = pypdf.PdfReader(io.BytesIO(pdf))
    assert len(reader.pages) >= 2, "need a 2-page doc to test the repeat"
    assert "TEST PERSON" in norm(reader.pages[1].extract_text()).upper()


def test_all_bullet_text_present(tmp_path):
    """Content parity: every bullet's active variant reaches the PDF."""
    data = make_resume(n_roles=3, n_bullets_per_pos=4)
    text = norm(pdf_text(render(data, tmp_path)))
    for role in data["roles"]:
        for pos in role["positions"]:
            for b in pos["bullets"]:
                snippet = norm(b["variants"][0]["text"])[:30]
                assert snippet in text, f"missing bullet: {snippet}"


def test_role_order_preserved(tmp_path):
    """roles[] order drives PDF order — required by the reorder feature."""
    data = make_resume(n_roles=3, n_bullets_per_pos=2)
    text = norm(pdf_text(render(data, tmp_path)))
    positions = [text.find(r["company"]) for r in data["roles"]]
    assert all(p != -1 for p in positions), "a company is missing from the PDF"
    assert positions == sorted(positions), "roles rendered out of order"


def test_empty_variants_bullet_does_not_crash(tmp_path):
    """Renderer is defensive (render-pdf.py:91) — App.jsx is not, but the PDF must survive."""
    data = make_resume(n_roles=1, n_bullets_per_pos=2)
    data["roles"][0]["positions"][0]["bullets"][0]["variants"] = []
    render(data, tmp_path, "empty.pdf")  # must not raise


# ─────────────────────── fit loop (spec D5) ───────────────────────

def render_meta(data, tmp_path, name="fit.pdf"):
    """Render and return render-pdf.py's JSON contract."""
    out = tmp_path / name
    proc = subprocess.run(
        [sys.executable, str(SCRIPT), str(out)],
        input=json.dumps(data).encode(), capture_output=True,
    )
    assert proc.returncode == 0, proc.stderr.decode()
    return json.loads(proc.stdout.decode())


def test_fit_prefers_spacing_over_type(tmp_path):
    """D5: spacing is the primary lever — type must stay 1.0 while spacing can still absorb.

    6 x 8 overflows naturally (3 pages) but is expected to fit via spacing alone.
    """
    result = render_meta(make_resume(n_roles=6, n_bullets_per_pos=8), tmp_path)
    assert result["pages"] <= 2
    assert result["typeScale"] == 1.0, "type was scaled before spacing was exhausted"


def test_fit_reports_overflow_honestly(tmp_path):
    """A resume too big for any scale must report >2 pages, not shrink into illegibility."""
    result = render_meta(make_resume(n_roles=12, n_bullets_per_pos=8), tmp_path, "big.pdf")
    if result["pages"] > 2:
        assert result["typeScale"] >= 0.94, "shrank below the readability floor"


def test_cli_emits_json_contract(tmp_path):
    """server.mjs parses this — the contract must hold."""
    result = render_meta(make_resume(n_roles=2, n_bullets_per_pos=3), tmp_path, "c.pdf")
    assert set(result) >= {"path", "pages", "spacing", "typeScale"}


def test_small_resume_uses_no_compression(tmp_path):
    """A resume that already fits must not be compressed at all."""
    result = render_meta(make_resume(n_roles=2, n_bullets_per_pos=3), tmp_path, "small.pdf")
    assert result["spacing"] == 1.0 and result["typeScale"] == 1.0


# ─────────────────── grow-to-fill (2026-07-16, spacing-led) ───────────────────
# Extends D5: when a resume lands on 2 pages but page 2 is under-full, spacing opens
# up to fill both pages. Whitespace only — the body size (type) is never grown.

def test_short_two_page_resume_grows_to_fill(tmp_path):
    """5x5 is naturally 2 pages with page 2 ~50% full — spacing must grow to fill it."""
    result = render_meta(make_resume(n_roles=5, n_bullets_per_pos=5), tmp_path, "grow.pdf")
    assert result["pages"] == 2
    assert result["spacing"] > 1.0, "spacing did not grow to fill the under-full page 2"
    assert result["fill"] >= 0.85, f"page 2 left under-filled: {result['fill']}"


def test_grow_is_spacing_only_never_type(tmp_path):
    """Operator choice: fill with whitespace, never a larger body font."""
    result = render_meta(make_resume(n_roles=5, n_bullets_per_pos=5), tmp_path, "grow2.pdf")
    assert result["typeScale"] == 1.0, "type was scaled up; growth must be spacing-only"


def test_grow_never_overflows_to_third_page(tmp_path):
    """Filling an under-full page 2 must never spill onto a 3rd page."""
    for nb in (4, 5):
        result = render_meta(make_resume(n_roles=5, n_bullets_per_pos=nb), tmp_path, f"g{nb}.pdf")
        assert result["pages"] <= 2, f"5x{nb} overflowed to page {result['pages']} while growing"


def test_natural_one_pager_not_padded(tmp_path):
    """A resume that fits on one page stays a clean 1-pager — not stretched onto two."""
    result = render_meta(make_resume(n_roles=3, n_bullets_per_pos=4), tmp_path, "one.pdf")
    assert result["pages"] == 1
    assert result["spacing"] == 1.0, "a natural 1-pager was padded with spacing"


def test_fill_bottom_justifies_every_page(tmp_path):
    """Vertical-justify (operator req 2026-07-18): each page fills to the bottom margin so
    the trailing slack matches the top/side margins — without spilling to another page."""
    result = render_meta(make_resume(n_roles=6, n_bullets_per_pos=8), tmp_path, "just.pdf")
    assert result["pages"] == 2, f"justify must not add pages: {result['pages']}"
    assert min(result["fills"]) >= 0.93, f"a page left under-filled: {result['fills']}"


def test_fill_fraction_reported(tmp_path):
    """Fill is part of the telemetry contract and is a sane [0, 1] value."""
    result = render_meta(make_resume(n_roles=5, n_bullets_per_pos=5), tmp_path, "fill.pdf")
    assert "fill" in result and 0.0 <= result["fill"] <= 1.0


def test_telemetry_reports_per_page_fills(tmp_path):
    """fit_and_render exposes a per-page fill list so page-1 fill is testable."""
    result = render_meta(make_resume(n_roles=5, n_bullets_per_pos=5), tmp_path, "fills.pdf")
    assert isinstance(result.get("fills"), list)
    assert len(result["fills"]) == result["pages"]
    assert all(0.0 <= f <= 1.0 for f in result["fills"])
    assert result["fill"] == result["fills"][-1]


def test_positions_are_not_split_across_pages(tmp_path):
    """Each POSITION (its title + all its bullets) stays on one page. The unit kept
    together is the position/function, NOT the whole company: two positions of one
    company MAY land on different pages, but neither is split mid-bullet. Operator pref
    2026-07-17 — bundle each title+role+bullets; don't compress a company onto one page.
    A position taller than a full page is reportlab's only forced-split exception.
    """
    data = make_resume(n_roles=4, n_bullets_per_pos=5, n_positions=2)
    reader = pypdf.PdfReader(io.BytesIO(render(data, tmp_path, "together.pdf")))
    page_texts = [norm(p.extract_text()) for p in reader.pages]
    assert len(page_texts) >= 2, "need a 2-page doc to exercise splitting"
    for ri in range(len(data["roles"])):
        for pi in range(2):
            # every bullet of position ri_pi carries a unique "item {ri}_{pi}_{bi}" marker
            markers = [f"item {ri}_{pi}_{bi}" for bi in range(5)]
            pages_used = sorted({i for i, t in enumerate(page_texts) for m in markers if m in t})
            assert len(pages_used) == 1, f"position {ri}_{pi} split across pages {pages_used}"


# ─────────────────────── ancillary section (spec Part 2) ───────────────────────
# Synthetic values ONLY — ancillary content is user data kept in localStorage only,
# and must never land in this committed file (see the tests/fixtures.py header).

def _with_ancillary(items):
    data = make_resume(n_roles=2, n_bullets_per_pos=3)
    data["ancillary"] = items
    return data


def test_ancillary_renders_after_education(tmp_path):
    data = _with_ancillary([{"id": "a1", "text": "Spelunking"},
                            {"id": "a2", "text": "Falconry"}])
    text = norm(pdf_text(render(data, tmp_path, "anc.pdf")))
    assert "ANCILLARY" in text
    assert "Spelunking" in text and "Falconry" in text
    assert text.find("ANCILLARY") > text.find("EDUCATION"), "ancillary must follow education"


def test_ancillary_absent_and_empty_render_no_section(tmp_path):
    # Absent key (default make_resume has none)
    text_absent = norm(pdf_text(render(make_resume(n_roles=2, n_bullets_per_pos=3), tmp_path, "no_anc.pdf")))
    assert "ANCILLARY" not in text_absent
    # Present but empty
    text_empty = norm(pdf_text(render(_with_ancillary([]), tmp_path, "empty_anc.pdf")))
    assert "ANCILLARY" not in text_empty


def test_ancillary_escapes_markup(tmp_path):
    data = _with_ancillary([{"id": "a1", "text": "R&D <lead>"}])
    # Must not raise, and the text survives (escaped) in the PDF.
    text = norm(pdf_text(render(data, tmp_path, "esc_anc.pdf")))
    assert "R&D" in text


def test_education_sports_render_as_grid_items(tmp_path):
    """Collegiate activities entered one per line each become their own item in the shared
    2-column grid (like Core Competencies). Content is preserved and markup is escaped."""
    data = make_resume(n_roles=1, n_bullets_per_pos=2)
    data["education"][0]["sports"] = "Tennis (SCAC & varsity)\nLacrosse"
    text = norm(pdf_text(render(data, tmp_path, "sports.pdf")))
    assert "Tennis (SCAC & varsity)" in text   # split preserved + '&' escaped/round-tripped
    assert "Lacrosse" in text


def test_competency_items_render(tmp_path):
    """Guard the shared-grid refactor: Core Competencies items still all render."""
    text = norm(pdf_text(render(make_resume(n_roles=2, n_bullets_per_pos=3), tmp_path, "comp.pdf")))
    assert "CORE COMPETENCIES" in text
    assert "Competency 0" in text and "Competency 5" in text


# ─────────────── bullet-rhythm consistency (operator req 2026-07-17) ───────────────
# Every bullet row must share ONE vertical advance across the whole document. The grid
# sections (competencies / education activities / ancillary) go through two_column_bullets;
# job + achievement bullets go through the main-flow 'bullet' style. reportlab DROPS a
# Paragraph's spaceAfter inside a table cell, so grid rows were 2pt tighter than main
# bullets — the operator's reported inconsistency. We measure the layout primitives
# directly, which needs the module object; render-pdf.py is loaded via importlib (the
# hyphen only blocks a bare `import render-pdf`; spec_from_file_location is the workaround).
import importlib.util as _ilu
from reportlab.platypus import Paragraph as _Paragraph


def _render_mod():
    spec = _ilu.spec_from_file_location("render_pdf_mod", SCRIPT)
    mod = _ilu.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _main_bullet_advance(styles, width=400.0):
    p = _Paragraph("<bullet>&bull;</bullet> One line item", styles["bullet"])
    _, h = p.wrap(width, 1000)
    return h + styles["bullet"].spaceAfter  # a frame advances by height then spaceAfter


def _grid_row_advance(mod, styles, width=400.0, rows=3):
    items = ["One line item"] * (rows * 2)  # 2 cols -> `rows` rows of one-line cells
    t = mod.two_column_bullets(items, styles, width)
    _, th = t.wrap(width, 1000)
    return th / rows


def test_grid_bullet_rhythm_matches_main_bullets():
    """Grid rows and main-flow bullets must advance by the same amount, at normal AND
    compressed spacing (locks the invariant across both fit levers)."""
    mod = _render_mod()
    for spacing, type_scale in ((1.0, 1.0), (0.95, 1.0), (0.94, 0.94)):
        styles = mod.build_styles(spacing, type_scale)
        main = _main_bullet_advance(styles)
        grid = _grid_row_advance(mod, styles)
        assert abs(main - grid) < 0.25, (
            f"bullet rhythm mismatch at spacing={spacing} type={type_scale}: "
            f"main={main:.2f}pt grid={grid:.2f}pt (grid tighter by {main - grid:.2f}pt)"
        )


# ─────────────── section-separator (gray-bar) symmetry ───────────────
# The gray HRFlowable separators must sit vertically CENTERED in their gap — equal whitespace
# above and below (operator req 2026-07-18). Two coupled guards: rule() owning SYMMETRIC
# padding (the baseline half), and boundary() giving each rule equal productive flex above
# and below so vertical-justify inflates both sides by the same `per` (the justify half —
# the part that silently regresses if a flex is added or removed on only one side of a rule).

def test_rule_is_symmetric():
    """Baseline half: the separator owns equal space above and below itself, at every
    spacing. If this drifts, bars ride high or low even before vertical-justify."""
    mod = _render_mod()
    for spacing in (1.0, 0.95, 0.8):
        r = mod.rule(spacing)
        assert abs(r.spaceBefore - r.spaceAfter) < 1e-9, (
            f"rule() asymmetric at spacing={spacing}: "
            f"spaceBefore={r.spaceBefore} spaceAfter={r.spaceAfter}"
        )


def _find_rule_bars(pgm_path):
    """Parse a binary P5 PGM (pdftoppm -gray). Return (w, h, pixels, [(top, bottom), ...])
    where each band is a full-width light-gray (#CCCCCC) horizontal rule. Pure python."""
    raw = pathlib.Path(pgm_path).read_bytes()
    assert raw[:2] == b"P5", raw[:2]
    idx, toks = 2, []
    while len(toks) < 3:                       # header: P5 <w> <h> <maxval>
        while raw[idx] in b" \t\n\r":
            idx += 1
        s = idx
        while raw[idx] not in b" \t\n\r":
            idx += 1
        toks.append(int(raw[s:idx]))
    w, h, _maxval = toks
    idx += 1                                   # one whitespace byte before the raster
    pix = raw[idx:idx + w * h]
    gray_rows = []
    for y in range(h):
        run = best = 0
        base = y * w
        for x in range(w):
            if 184 <= pix[base + x] <= 224:    # #CCCCCC (204) +/- anti-alias band
                run += 1
                best = max(best, run)
            else:
                run = 0
        if best >= 0.5 * w:                    # a rule spans the content width
            gray_rows.append(y)
    bars = []
    for y in gray_rows:                        # merge anti-aliased adjacent rows into a band
        if bars and y - bars[-1][1] <= 2:
            bars[-1][1] = y
        else:
            bars.append([y, y])
    return w, h, pix, bars


def _ink_rows_gap(pix, w, h, start, step):
    """Count whitespace rows from `start`, moving by `step`, until a row with >=3 dark
    (ink) pixels. That distance is the gap from a rule to the nearest text."""
    y, d = start, 0
    while 0 <= y < h:
        base = y * w
        if sum(1 for x in range(w) if pix[base + x] < 90) >= 3:
            break
        d += 1
        y += step
    return d


@pytest.mark.skipif(shutil.which("pdftoppm") is None, reason="poppler/pdftoppm not installed")
def test_section_separators_vertically_centered(tmp_path):
    """Justify half, end-to-end: on a filled 2-page render every gray separator has ~equal
    whitespace above and below. The regression this guards — a flex added/removed on one
    side of a rule — drives one side 15-20pt off; the operator-approved state is ~1-2pt, so
    a 5pt threshold catches the regression with margin while tolerating raster/AA noise."""
    data = make_resume(n_roles=6, n_bullets_per_pos=8)   # same 2-page fixture as the justify test
    out = tmp_path / "bars.pdf"
    proc = subprocess.run([sys.executable, str(SCRIPT), str(out)],
                          input=json.dumps(data).encode(), capture_output=True)
    assert proc.returncode == 0, proc.stderr.decode()
    subprocess.run(["pdftoppm", "-gray", "-r", "150", str(out), str(tmp_path / "pg")], check=True)
    px_per_pt = 150 / 72.0
    seen = 0
    for pgm in sorted(tmp_path.glob("pg-*.pgm")):
        w, h, pix, bars = _find_rule_bars(pgm)
        assert bars, f"no gray rules detected in {pgm.name}"
        for top, bot in bars:
            above = _ink_rows_gap(pix, w, h, top - 1, -1) / px_per_pt
            below = _ink_rows_gap(pix, w, h, bot + 1, +1) / px_per_pt
            seen += 1
            assert abs(above - below) < 5.0, (
                f"{pgm.name} rule at rows {top}-{bot} not centered: "
                f"above={above:.2f}pt below={below:.2f}pt (delta {below - above:+.2f}pt)"
            )
    assert seen >= 4, f"expected several separators to check, found {seen}"
