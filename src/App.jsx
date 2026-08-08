import { useState, useEffect, useCallback, useRef } from "react";
import { makeRole, makePosition, makeBullet, makeAncillaryItem, isRoleValid, normalizeRole, moveRole } from "./resumeHelpers";

const STORAGE_KEY = 'rcc_public_v1';

const INITIAL_DATA = {
  header: {
    name: 'Jordan Ellis',
    location: 'Austin, TX',
    phone: '(555) 010-0142',
    email: 'jordan.ellis@example.com',
  },
  jobTarget: { role: '', company: '', description: '', keywords: [] },
  summary: {
    active: 0,
    variants: [
      { label: 'Default', text: 'Operations leader with 10+ years scaling cross-functional teams and delivery systems. Translates ambiguous mandates into measurable programs, pairing data-driven planning with hands-on execution.' },
    ],
  },
  roles: [
    {
      id: 'role_seed_1',
      company: 'Northwind Logistics',
      location: 'Austin, TX',
      positions: [
        {
          title: 'Director of Operations',
          dates: '2021 – Present',
          bullets: [
            { id: 'b_seed_1', active: 0, variants: [{ label: 'Default', text: 'Led a 24-person operations organization across three regions, cutting order-to-delivery time by 31% in 18 months.' }] },
            { id: 'b_seed_2', active: 0, variants: [{ label: 'Default', text: 'Introduced a demand-forecasting workflow that reduced stockouts by 42% while holding inventory flat.' }] },
            { id: 'b_seed_3', active: 0, variants: [{ label: 'Default', text: 'Rebuilt the vendor-scorecard process and renegotiated the top 12 contracts for $1.4M in annual savings.' }] },
          ],
        },
      ],
    },
    {
      id: 'role_seed_2',
      company: 'Brightline Software',
      location: 'Remote',
      positions: [
        {
          title: 'Senior Program Manager',
          dates: '2017 – 2021',
          bullets: [
            { id: 'b_seed_4', active: 0, variants: [{ label: 'Default', text: 'Shipped a customer-onboarding platform adopted by 200+ enterprise accounts in its first year.' }] },
            { id: 'b_seed_5', active: 0, variants: [{ label: 'Default', text: 'Coordinated eight engineering teams through a zero-downtime billing migration serving 1.1M users.' }] },
          ],
        },
      ],
    },
  ],
  achievements: [
    { id: 'ach_seed_1', active: 0, variants: [{ label: 'Default', text: 'Named to the 2023 Supply Chain 40-Under-40 for regional distribution innovation.' }] },
    { id: 'ach_seed_2', active: 0, variants: [{ label: 'Default', text: 'Speaker, LogiCon 2022 — "Forecasting Under Uncertainty."' }] },
  ],
  competencyGroups: [
    { id: 'cg_seed_1', label: 'Operations', items: [
      { id: 'c_seed_1', text: 'Supply Chain Strategy', active: true },
      { id: 'c_seed_2', text: 'Process Optimization', active: true },
      { id: 'c_seed_3', text: 'Vendor Management', active: true },
    ] },
    { id: 'cg_seed_2', label: 'Leadership', items: [
      { id: 'c_seed_4', text: 'Team Building', active: true },
      { id: 'c_seed_5', text: 'Cross-Functional Delivery', active: true },
      { id: 'c_seed_6', text: 'Stakeholder Alignment', active: true },
    ] },
  ],
  education: [
    { id: 'edu_seed_1', school: 'University of Texas at Austin', location: 'Austin, TX', degree: 'B.S. in Industrial Engineering', sports: 'Varsity Rowing\nEngineering Student Council' },
  ],
  ancillary: [
    { id: 'anc_seed_1', text: 'Fluent in Spanish' },
    { id: 'anc_seed_2', text: 'Certified Scrum Master (CSM)' },
  ],
};

// --- Backend ---
const BACKEND_URL = 'http://127.0.0.1:4010';
async function postComplete(system, userMsg, provider) {
  const res = await fetch(`${BACKEND_URL}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, system, prompt: userMsg }),
  });
  if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || `HTTP ${res.status}`); }
  const { text } = await res.json();
  return text;
}
async function checkBackend() { try { return (await fetch(`${BACKEND_URL}/health`)).ok; } catch { return false; } }

// --- Storage ---
function loadData() { try { const r = localStorage.getItem(STORAGE_KEY); return r ? JSON.parse(r) : null; } catch { return null; } }
function saveData(d) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(d)); } catch {} }

// --- Preview Component (PDF via backend) ---
function ResumePreview({ data, backendUp }) {
  const [pdfUrl, setPdfUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const generatePdf = async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const blob = await res.blob();
      if (pdfUrl) URL.revokeObjectURL(pdfUrl);
      setPdfUrl(URL.createObjectURL(blob));
    } catch (e) { setError(e.message); }
    setLoading(false);
  };

  useEffect(() => { if (backendUp) generatePdf(); }, []);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-line">
        <button onClick={generatePdf} disabled={loading || !backendUp}
          className="px-4 py-2 bg-heading text-white rounded-lg text-xs hover:bg-body disabled:opacity-40 font-medium">
          {loading ? 'Rendering...' : '↻ Refresh Preview'}
        </button>
        {pdfUrl && (
          <a href={pdfUrl} download={`${(data?.header?.name || 'Resume').split(' ').pop()}_Resume_${new Date().toISOString().slice(0,10)}.pdf`}
            className="px-4 py-2 bg-accent text-white rounded-lg text-xs hover:bg-accent-strong font-medium">
            ↓ Download PDF
          </a>
        )}
        {error && <span className="text-xs text-danger">{error}</span>}
        <span className="text-xs text-faint ml-auto">Zero tokens — rendered locally via reportlab</span>
      </div>
      <div className="flex-1 bg-line-strong">
        {pdfUrl ? (
          <iframe src={pdfUrl} className="w-full h-full border-0" title="Resume Preview" />
        ) : (
          <div className="flex items-center justify-center h-full text-muted text-sm">
            {loading ? 'Generating PDF...' : 'Click "Refresh Preview" to render'}
          </div>
        )}
      </div>
    </div>
  );
}

// --- Variant Bullet Component (reused for bullets + achievements) ---
function VariantCard({ bullet, onGenerate, onAdd, onSetActive, onDelete, showDiff, onToggleDiff, apiReady, hasJD }) {
  const activeVar = bullet.variants[bullet.active];
  const defaultVar = bullet.variants[0];
  const isDiff = showDiff && bullet.variants.length > 1 && bullet.active !== 0;
  return (
    <div className="bg-white rounded-xl border border-line overflow-hidden shadow-sm">
      {isDiff ? (
        <div className="grid grid-cols-2 divide-x divide-fill">
          <div className="p-3"><div className="text-xs font-bold text-faint uppercase tracking-wider mb-1">Default</div><p className="text-muted leading-relaxed text-xs">{defaultVar.text}</p></div>
          <div className="p-3 bg-accent-fill-faint"><div className="text-xs font-bold text-accent uppercase tracking-wider mb-1">{activeVar.label}</div><p className="text-strong leading-relaxed text-xs">{activeVar.text}</p></div>
        </div>
      ) : (
        <div className="p-3">
          <div className="flex gap-2"><span className="text-line-strong mt-0.5 shrink-0 leading-none">•</span><p className="text-strong leading-relaxed text-xs flex-1">{activeVar.text}</p></div>
          {bullet.variants.length > 1 && <div className="mt-1 ml-4"><span className="inline-flex items-center gap-1 text-xs bg-accent-fill text-accent px-2 py-0.5 rounded-full font-medium"><span className="w-1 h-1 bg-accent-strong rounded-full"></span>{activeVar.label}</span></div>}
        </div>
      )}
      <div className="border-t border-fill bg-paper px-3 py-2 flex items-center gap-1.5 flex-wrap">
        <button onClick={onGenerate} disabled={!apiReady} className="text-xs px-2.5 py-1 bg-heading text-white rounded-lg hover:bg-body disabled:opacity-40 font-medium">✦ Generate{hasJD ? ' for Target' : ''}</button>
        <button onClick={onAdd} className="text-xs px-2.5 py-1 bg-white text-dim border border-line-strong rounded-lg hover:bg-fill">+ Add</button>
        {bullet.variants.length > 1 && bullet.active !== 0 && <button onClick={onToggleDiff} className={`text-xs px-2.5 py-1 border rounded-lg ${isDiff ? 'bg-accent-fill text-accent border-accent-line' : 'bg-white text-muted border-line'}`}>{isDiff ? '↔ Hide' : '↔ Compare'}</button>}
        {bullet.variants.map((v, vi) => (
          <div key={vi} className={`group flex items-center gap-1 text-xs px-2 py-0.5 rounded-lg border cursor-pointer ${vi === bullet.active ? 'bg-heading text-white border-heading' : 'bg-white text-muted border-line hover:border-faint'}`} onClick={() => onSetActive(vi)}>
            <span>{v.label}</span>
            {vi !== 0 && vi !== bullet.active && <span onClick={e => { e.stopPropagation(); onDelete(vi); }} className="opacity-0 group-hover:opacity-100 text-faint hover:text-danger ml-0.5">×</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Main App ---
export default function App() {
  const [data, setData] = useState(null);
  const [view, setView] = useState('jd');
  const [loading, setLoading] = useState(true);
  const [genModal, setGenModal] = useState(null); // { type, ri?, pi?, bi?, ai? }
  const [generating, setGenerating] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [addModal, setAddModal] = useState(null);
  const [roleEditor, setRoleEditor] = useState(null); // { mode: 'add'|'edit', ri, draft }
  const [newText, setNewText] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [exportOpen, setExportOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [jdDraft, setJdDraft] = useState({ role: '', company: '', description: '' });
  const [backendUp, setBackendUp] = useState(false);
  const [providers, setProviders] = useState([]);
  const [providerId, setProviderId] = useState('');
  const [showDiff, setShowDiff] = useState({});
  const [batchProgress, setBatchProgress] = useState(null);

  useEffect(() => {
    const s = loadData(); setData(s || INITIAL_DATA); setLoading(false);
    checkBackend().then(setBackendUp);
    fetch(`${BACKEND_URL}/providers`).then(r => r.json()).then(list => {
      setProviders(list);
      setProviderId(list.find(p => p.available)?.id || list[0]?.id || '');
    }).catch(() => {});
    const i = setInterval(() => checkBackend().then(setBackendUp), 10000);
    return () => clearInterval(i);
  }, []);
  useEffect(() => { if (data && !loading) saveData(data); }, [data, loading]);

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(''), 2500); };
  const upd = fn => setData(d => { const nd = JSON.parse(JSON.stringify(d)); fn(nd); return nd; });

  // Route every AI call through the currently-selected provider.
  const callClaude = (system, userMsg) => postComplete(system, userMsg, providerId);

  // --- Variant helpers ---
  const setBulletActive = (ri, pi, bi, vi) => upd(d => { d.roles[ri].positions[pi].bullets[bi].active = vi; });
  const addBulletVariant = (ri, pi, bi, text, label) => upd(d => { const b = d.roles[ri].positions[pi].bullets[bi]; b.variants.push({ text, label }); b.active = b.variants.length - 1; });
  const delBulletVariant = (ri, pi, bi, vi) => upd(d => { const b = d.roles[ri].positions[pi].bullets[bi]; if (b.variants.length <= 1) return; b.variants.splice(vi, 1); b.active = Math.min(b.active, b.variants.length - 1); });

  const setAchActive = (ai, vi) => upd(d => { d.achievements[ai].active = vi; });
  const addAchVariant = (ai, text, label) => upd(d => { const a = d.achievements[ai]; a.variants.push({ text, label }); a.active = a.variants.length - 1; });
  const delAchVariant = (ai, vi) => upd(d => { const a = d.achievements[ai]; if (a.variants.length <= 1) return; a.variants.splice(vi, 1); a.active = Math.min(a.active, a.variants.length - 1); });

  const setSummaryActive = (vi) => upd(d => { d.summary.active = vi; });
  const addSummaryVariant = (text, label) => upd(d => { d.summary.variants.push({ text, label }); d.summary.active = d.summary.variants.length - 1; });

  // --- Role structure (add / edit / reorder) ---
  const openAddRole = () => setRoleEditor({ mode: 'add', ri: null, draft: makeRole() });
  const openEditRole = ri => setRoleEditor({ mode: 'edit', ri, draft: JSON.parse(JSON.stringify(data.roles[ri])) });

  const commitRole = () => {
    const clean = normalizeRole(roleEditor.draft);
    const { mode, ri } = roleEditor;
    const newIndex = data.roles.length; // pre-push length == the appended role's index
    upd(d => {
      if (mode === 'add') d.roles.push(clean);
      else d.roles[ri] = clean;
    });
    if (mode === 'add') setView(newIndex);
    setRoleEditor(null);
    showToast(mode === 'add' ? 'Job added' : 'Job saved');
  };

  // `view` doubles as the selected role INDEX (see selRole), so a swap MUST remap it —
  // otherwise reordering silently jumps the selection to a different company.
  const reorderRole = (from, to) => {
    const { roles: next, indexMap } = moveRole(data.roles, from, to);
    if (indexMap[from] === from) return; // no-op at a boundary
    upd(d => { d.roles = next; });
    if (typeof view === 'number') setView(indexMap[view]);
  };

  // Draft mutations — these touch roleEditor.draft only, never committed data.
  const draftUpd = fn => setRoleEditor(re => { const nd = JSON.parse(JSON.stringify(re)); fn(nd.draft); return nd; });
  const setDraftField = (field, val) => draftUpd(dr => { dr[field] = val; });
  const setDraftPos = (pi, field, val) => draftUpd(dr => { dr.positions[pi][field] = val; });
  // D2: the editor writes variants[0] (the Default) ONLY. Tailored variants and the
  // active index are never read or written here.
  const setDraftBullet = (pi, bi, text) => draftUpd(dr => { dr.positions[pi].bullets[bi].variants[0].text = text; });
  const addDraftBullet = pi => draftUpd(dr => { dr.positions[pi].bullets.push(makeBullet('')); });
  const addDraftPosition = () => draftUpd(dr => { dr.positions.push(makePosition()); });
  // Removal is offered ONLY for rows added in this unsaved session — removing something
  // not yet committed is not a delete, so this honours spec D3 (no delete).
  const removeDraftBullet = (pi, bi) => draftUpd(dr => { dr.positions[pi].bullets.splice(bi, 1); });
  const removeDraftPosition = pi => draftUpd(dr => { dr.positions.splice(pi, 1); });

  const toggleComp = (gid, cid) => upd(d => { const g = d.competencyGroups.find(x => x.id === gid); const c = g?.items.find(x => x.id === cid); if (c) c.active = !c.active; });
  const updateEducation = (eid, field, val) => upd(d => { const e = d.education.find(x => x.id === eid); if (e) e[field] = val; });

  // Ancillary — flat {id, text} list; writing the first item creates the array (D7 default).
  const addAncillary = () => upd(d => { d.ancillary = [...(d.ancillary || []), makeAncillaryItem('')]; });
  const updateAncillary = (id, val) => upd(d => { const it = (d.ancillary || []).find(x => x.id === id); if (it) it.text = val; });
  const removeAncillary = id => upd(d => { d.ancillary = (d.ancillary || []).filter(x => x.id !== id); });

  const saveJD = () => { upd(d => { d.jobTarget = { ...jdDraft, keywords: data?.jobTarget?.keywords || [] }; }); showToast('Saved'); };
  const clearJD = () => { upd(d => { d.jobTarget = { role: '', company: '', description: '', keywords: [] }; }); setJdDraft({ role: '', company: '', description: '' }); showToast('Cleared'); };

  const exportData = () => { const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = `rcc-${new Date().toISOString().slice(0,10)}.json`; a.click(); URL.revokeObjectURL(u); showToast('Exported'); };
  const importData = () => { const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json'; inp.onchange = async e => { try { const p = JSON.parse(await e.target.files[0].text()); if (p.roles) { setData(p); showToast('Imported'); } } catch { showToast('Failed'); } }; inp.click(); };

  // --- AI ---
  const SYS = 'You are an expert resume writer. You rewrite and tailor resume content to be concise, specific, and achievement-oriented, matching the candidate\'s experience to the target role. Preserve factual accuracy and never invent credentials.';

  const genBulletText = async (ri, pi, bi) => {
    const b = data.roles[ri].positions[pi].bullets[bi]; const r = data.roles[ri]; const p = r.positions[pi]; const jt = data.jobTarget;
    return await callClaude(SYS, `Rewrite this resume bullet${jt.role ? ` for a "${jt.role}" role` : ''}${jt.company ? ` at ${jt.company}` : ''}.
Rules: Keep ALL facts, numbers, metrics IDENTICAL. Adjust framing for the audience. Max 2-3 lines. No excessive em-dashes. Return ONLY the bullet.
${jt.description ? `Job Description:\n${jt.description.substring(0, 1500)}\n\n` : ''}Context: ${r.company} (${p.title}).
Original:\n${b.variants[0].text}`);
  };

  const genAchText = async (ai) => {
    const a = data.achievements[ai]; const jt = data.jobTarget;
    return await callClaude(SYS, `Rewrite this achievement bullet${jt.role ? ` for a "${jt.role}" role` : ''}.
Rules: Keep ALL facts and numbers IDENTICAL. Adjust framing. Max 1-2 lines. Return ONLY the bullet.
${jt.description ? `Job Description:\n${jt.description.substring(0, 1500)}\n\n` : ''}Original:\n${a.variants[0].text}`);
  };

  const genSummaryText = async () => {
    const jt = data.jobTarget;
    return await callClaude(SYS, `Rewrite this professional summary${jt.role ? ` for a "${jt.role}" role` : ''}${jt.company ? ` at ${jt.company}` : ''}.
Rules: Keep all factual claims identical. Adjust emphasis and keywords for the target audience. Two paragraphs max. Return ONLY the summary.
${jt.description ? `Job Description:\n${jt.description.substring(0, 1500)}\n\n` : ''}Original:\n${data.summary.variants[0].text}`);
  };

  const genCompetencies = async () => {
    const jt = data.jobTarget;
    const txt = await callClaude(SYS, `Given this job description, generate grouped core competencies for the resume. Return JSON as an array of objects: [{label: "Group Name", items: ["comp1", "comp2", ...]}, ...]. 4-6 groups, 3-5 items each. Use industry terminology. Return ONLY valid JSON.
Job Description:\n${jt.description.substring(0, 2000)}`);
    return JSON.parse(txt.replace(/```json|```/g, '').trim());
  };

  // Single generate (via modal)
  const generate = async () => {
    if (!genModal) return; setGenerating(true);
    const label = data.jobTarget.role || 'Tailored';
    try {
      if (genModal.type === 'bullet') {
        const txt = await genBulletText(genModal.ri, genModal.pi, genModal.bi);
        if (txt) addBulletVariant(genModal.ri, genModal.pi, genModal.bi, txt, label);
      } else if (genModal.type === 'achievement') {
        const txt = await genAchText(genModal.ai);
        if (txt) addAchVariant(genModal.ai, txt, label);
      } else if (genModal.type === 'summary') {
        const txt = await genSummaryText();
        if (txt) addSummaryVariant(txt, label);
      }
      showToast('Generated');
    } catch (e) { showToast(`Failed: ${e.message}`); }
    setGenerating(false); setGenModal(null);
  };

  // Batch
  const batchGenerate = useCallback(async () => {
    if (!data.jobTarget.description || batchProgress) return;
    const label = data.jobTarget.role || 'Tailored';
    const jobs = [];
    // Summary
    jobs.push({ type: 'summary', name: 'Professional Summary' });
    // Bullets
    data.roles.forEach((r, ri) => r.positions.forEach((p, pi) => p.bullets.forEach((_b, bi) => jobs.push({ type: 'bullet', ri, pi, bi, name: `${r.company} bullet ${bi + 1}` }))));
    // Achievements
    data.achievements.forEach((_a, ai) => jobs.push({ type: 'achievement', ai, name: `Achievement ${ai + 1}` }));
    // Competencies
    jobs.push({ type: 'competencies', name: 'Core Competencies' });

    const total = jobs.length;
    setBatchProgress({ total, done: 0, current: '' });

    for (let i = 0; i < jobs.length; i++) {
      const j = jobs[i];
      setBatchProgress({ total, done: i, current: j.name });
      try {
        if (j.type === 'summary') {
          const txt = await genSummaryText();
          if (txt) upd(d => { const ex = d.summary.variants.findIndex(v => v.label === label); if (ex > 0) d.summary.variants.splice(ex, 1); d.summary.variants.push({ text: txt, label }); d.summary.active = d.summary.variants.length - 1; });
        } else if (j.type === 'bullet') {
          const txt = await genBulletText(j.ri, j.pi, j.bi);
          if (txt) upd(d => { const b = d.roles[j.ri].positions[j.pi].bullets[j.bi]; const ex = b.variants.findIndex(v => v.label === label); if (ex > 0) b.variants.splice(ex, 1); b.variants.push({ text: txt, label }); b.active = b.variants.length - 1; });
        } else if (j.type === 'achievement') {
          const txt = await genAchText(j.ai);
          if (txt) upd(d => { const a = d.achievements[j.ai]; const ex = a.variants.findIndex(v => v.label === label); if (ex > 0) a.variants.splice(ex, 1); a.variants.push({ text: txt, label }); a.active = a.variants.length - 1; });
        } else if (j.type === 'competencies') {
          const groups = await genCompetencies();
          if (Array.isArray(groups)) upd(d => { d.competencyGroups = groups.map((g, gi) => ({ id: `cg_gen_${gi}`, label: g.label, items: (g.items || []).map((c, ci) => ({ id: `c_gen_${gi}_${ci}`, text: c, active: true })) })); });
        }
      } catch (e) { console.error(`Batch [${j.name}]:`, e.message); }
    }
    setBatchProgress(null);
    showToast(`Done — ${total} sections tailored`);
    const diffs = {};
    data.roles.forEach(r => r.positions.forEach(p => p.bullets.forEach(b => { if (b.variants.length > 1) diffs[b.id] = true; })));
    data.achievements.forEach(a => { if (a.variants.length > 1) diffs[a.id] = true; });
    if (data.summary.variants.length > 1) diffs['summary'] = true;
    setShowDiff(diffs);
  }, [data, batchProgress, providerId]);

  const analyzeJD = async () => {
    if (!data.jobTarget.description) return; setAnalyzing(true);
    const allText = data.roles.flatMap(r => r.positions.flatMap(p => p.bullets.map(b => b.variants[b.active].text))).join('\n');
    try {
      const txt = await callClaude('You are an ATS expert.', `Analyze JD vs resume. Return JSON: {"mustHave": [...up to 6], "present": [...up to 6], "topPriority": "..."}\nJD:\n${data.jobTarget.description}\nBullets:\n${allText}\nReturn ONLY JSON.`);
      upd(d => { d.jobTarget.keywords = JSON.parse(txt.replace(/```json|```/g, '')); }); showToast('Done');
    } catch (e) { showToast(`Failed: ${e.message}`); }
    setAnalyzing(false);
  };

  const toggleDiff = id => setShowDiff(p => ({ ...p, [id]: !p[id] }));

  if (loading) return <div className="flex items-center justify-center h-screen text-muted text-sm">Loading...</div>;

  const jt = data.jobTarget;
  const hasJD = jt.role || jt.company || jt.description;
  const selRole = typeof view === 'number' ? data.roles[view] : null;
  const apiReady = backendUp;

  return (
    <div className="flex h-screen bg-fill font-sans text-sm overflow-hidden">
      {toast && <div className="fixed top-4 right-4 bg-heading text-white px-4 py-2 rounded shadow-lg z-50 text-xs">{toast}</div>}
      {!apiReady && <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-warning-fill border border-warning-line-strong text-warning px-4 py-2 rounded-lg shadow-lg z-50 text-xs font-medium">⚠ Backend offline — run <code className="bg-warning-fill-strong px-1 rounded">node server.mjs</code></div>}
      {providers.length > 0 && (
        <div className="fixed top-4 right-4 z-50">
          <select
            value={providerId}
            onChange={e => setProviderId(e.target.value)}
            title="Which AI model handles ✦ generation"
            className="text-xs border border-line rounded-lg px-2 py-1 bg-white text-body shadow-sm"
          >
            {providers.map(p => (
              <option key={p.id} value={p.id} disabled={!p.available}>
                {p.label}{p.available ? '' : ` — ${p.hint}`}
              </option>
            ))}
          </select>
        </div>
      )}
      {batchProgress && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 bg-white border border-accent-line shadow-xl rounded-xl px-6 py-4 z-50 w-96">
          <div className="flex justify-between mb-2"><span className="text-xs font-bold">Tailoring Resume</span><span className="text-xs text-muted">{batchProgress.done}/{batchProgress.total}</span></div>
          <div className="w-full bg-fill rounded-full h-2 mb-2"><div className="bg-accent h-2 rounded-full transition-all" style={{ width: `${(batchProgress.done / batchProgress.total) * 100}%` }} /></div>
          <div className="text-xs text-faint truncate">{batchProgress.current}</div>
        </div>
      )}

      {/* Generate Modal */}
      {genModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="font-bold text-heading mb-3">Generate Tailored Variant</div>
            {hasJD && <div className="bg-success-fill border border-success-line rounded-lg px-3 py-2 text-xs text-success mb-4">✓ {jt.role}{jt.company ? ` at ${jt.company}` : ''}</div>}
            <div className="flex gap-2 justify-end">
              <button onClick={() => setGenModal(null)} className="px-4 py-2 text-sm text-dim">Cancel</button>
              <button onClick={generate} disabled={generating || !apiReady} className="px-5 py-2 bg-heading text-white rounded-lg text-sm hover:bg-body disabled:opacity-40 font-medium">{generating ? 'Generating...' : '✦ Generate'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {addModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-md">
            <div className="font-bold text-heading mb-4">Add Custom Variant</div>
            <input className="w-full border rounded-lg px-3 py-2 text-sm mb-3" placeholder="Label" value={newLabel} onChange={e => setNewLabel(e.target.value)} />
            <textarea className="w-full border rounded-lg px-3 py-2 text-sm h-28 resize-none mb-4" value={newText} onChange={e => setNewText(e.target.value)} />
            <div className="flex gap-2 justify-end">
              <button onClick={() => { setAddModal(null); setNewText(''); setNewLabel(''); }} className="px-4 py-2 text-sm text-dim">Cancel</button>
              <button onClick={() => { if (!newText.trim()) return; if (addModal.type === 'bullet') addBulletVariant(addModal.ri, addModal.pi, addModal.bi, newText.trim(), newLabel || 'Custom'); else if (addModal.type === 'achievement') addAchVariant(addModal.ai, newText.trim(), newLabel || 'Custom'); else if (addModal.type === 'summary') addSummaryVariant(newText.trim(), newLabel || 'Custom'); setAddModal(null); setNewText(''); setNewLabel(''); showToast('Added'); }} disabled={!newText.trim()} className="px-5 py-2 bg-heading text-white rounded-lg text-sm disabled:opacity-40 font-medium">Add</button>
            </div>
          </div>
        </div>
      )}

      {/* Role Editor */}
      {roleEditor && (() => {
        const committed = roleEditor.mode === 'edit' ? data.roles[roleEditor.ri] : null;
        // A row is "new" if it does not exist in committed data — only those get an ×.
        const isNewPos = pi => !committed || pi >= committed.positions.length;
        const isNewBullet = (pi, bi) =>
          !committed || pi >= committed.positions.length || bi >= committed.positions[pi].bullets.length;
        const valid = isRoleValid(roleEditor.draft);
        return (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40 p-4">
            <div className="bg-white rounded-xl shadow-2xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto">
              <div className="font-bold text-heading mb-4">{roleEditor.mode === 'add' ? 'Add Job' : 'Edit Job'}</div>

              <div className="grid grid-cols-2 gap-3 mb-4">
                <div>
                  <label className="text-xs font-semibold text-muted">Company</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={roleEditor.draft.company}
                    onChange={e => setDraftField('company', e.target.value)} />
                </div>
                <div>
                  <label className="text-xs font-semibold text-muted">Location</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={roleEditor.draft.location}
                    onChange={e => setDraftField('location', e.target.value)} />
                </div>
              </div>

              {roleEditor.draft.positions.map((pos, pi) => (
                <div key={pi} className="border-t border-fill pt-3 mb-3">
                  <div className="flex justify-between items-center mb-2">
                    <div className="text-xs font-bold text-muted uppercase tracking-wider">Position {pi + 1}</div>
                    {isNewPos(pi) && roleEditor.draft.positions.length > 1 && (
                      <button onClick={() => removeDraftPosition(pi)} className="text-xs text-faint hover:text-danger">✕ remove</button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-3 mb-2">
                    <div>
                      <label className="text-xs font-semibold text-muted">Title</label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" value={pos.title}
                        onChange={e => setDraftPos(pi, 'title', e.target.value)} />
                    </div>
                    <div>
                      {/* The sidebar splits this on an EN DASH (–). A hyphen renders the whole string. */}
                      <label className="text-xs font-semibold text-muted">Dates <span className="text-faint font-normal">(use – not -)</span></label>
                      <input className="w-full border rounded-lg px-3 py-2 text-sm" value={pos.dates}
                        placeholder="2024 – Present"
                        onChange={e => setDraftPos(pi, 'dates', e.target.value)} />
                    </div>
                  </div>
                  <label className="text-xs font-semibold text-muted">Bullets</label>
                  {pos.bullets.map((b, bi) => (
                    <div key={b.id} className="flex gap-2 items-start mb-2">
                      <textarea className="flex-1 border rounded-lg px-3 py-2 text-sm h-16 resize-none"
                        value={b.variants[0].text}
                        onChange={e => setDraftBullet(pi, bi, e.target.value)} />
                      {isNewBullet(pi, bi) && pos.bullets.length > 1 && (
                        <button onClick={() => removeDraftBullet(pi, bi)} className="text-xs text-faint hover:text-danger mt-2">✕</button>
                      )}
                      {!isNewBullet(pi, bi) && b.variants.length > 1 && (
                        <span className="text-xs text-faint mt-2 whitespace-nowrap" title="Editing the Default — your tailored variants are preserved">
                          {b.variants.length - 1} variant{b.variants.length > 2 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  ))}
                  <button onClick={() => addDraftBullet(pi)} className="text-xs px-2.5 py-1 bg-white text-dim border border-line-strong rounded-lg hover:bg-fill">+ Add bullet</button>
                </div>
              ))}

              <button onClick={addDraftPosition} className="text-xs px-2.5 py-1 bg-white text-dim border border-line-strong rounded-lg hover:bg-fill mb-4">+ Add position</button>

              <div className="flex gap-2 justify-end border-t border-fill pt-4">
                <button onClick={() => setRoleEditor(null)} className="px-4 py-2 text-sm text-dim">Cancel</button>
                <button onClick={commitRole} disabled={!valid}
                  className="px-5 py-2 bg-heading text-white rounded-lg text-sm disabled:opacity-40 font-medium">Save</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Sidebar */}
      <div className="w-48 bg-accent-fill border-r border-line flex flex-col shrink-0">
        <div className="p-3 border-b border-fill">
          <div className="text-xs font-bold uppercase tracking-widest text-faint">Resume</div>
          <div className="text-base font-bold text-heading">Command Center</div>
        </div>
        <div className="flex-1 overflow-y-auto py-1">
          {[
            { key: 'jd', icon: '🎯', label: 'Job Target', sub: hasJD ? jt.role || 'Loaded' : 'None' },
            { key: 'summary', icon: '📄', label: 'Summary', sub: data.summary.variants.length > 1 ? `${data.summary.variants.length - 1} variant${data.summary.variants.length > 2 ? 's' : ''}` : '' },
            { key: 'preview', icon: '👁', label: 'Preview', sub: '' },
          ].map(n => (
            <button key={n.key} onClick={() => { setView(n.key); if (n.key === 'jd') setJdDraft({ role: jt.role, company: jt.company, description: jt.description }); }}
              className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${view === n.key ? 'bg-white border-accent' : 'border-transparent hover:bg-paper'}`}>
              <div className={`font-semibold text-xs ${view === n.key ? 'text-heading' : 'text-dim'}`}>{n.icon} {n.label}</div>
              {n.sub && <div className="text-xs text-faint">{n.sub}</div>}
            </button>
          ))}
          <div className="mx-3 my-2 border-t border-line"></div>
          {data.roles.map((r, i) => (
            <div key={r.id} className={`group flex items-center border-l-2 transition-colors ${view === i ? 'bg-white border-accent' : 'border-transparent hover:bg-paper'}`}>
              <button onClick={() => setView(i)} className="flex-1 text-left px-3 py-2.5 min-w-0">
                <div className={`font-semibold text-xs truncate ${view === i ? 'text-heading' : 'text-dim'}`}>{r.company}</div>
                {/* positions[0] and .dates are guaranteed by normalizeRole (invariants 2 + 3) */}
                <div className="text-xs text-faint">{r.positions[0].dates.split('–')[0].trim()}</div>
              </button>
              <div className="flex flex-col pr-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => reorderRole(i, i - 1)} disabled={i === 0}
                  className="text-[10px] leading-none px-1 text-faint hover:text-heading disabled:opacity-20" title="Move up">▲</button>
                <button onClick={() => reorderRole(i, i + 1)} disabled={i === data.roles.length - 1}
                  className="text-[10px] leading-none px-1 text-faint hover:text-heading disabled:opacity-20" title="Move down">▼</button>
              </div>
            </div>
          ))}
          <button onClick={openAddRole} className="w-full text-left px-3 py-2 text-xs text-muted hover:bg-paper hover:text-heading">+ Add Job</button>
          <div className="mx-3 my-2 border-t border-line"></div>
          {['achievements', 'competencies', 'education', 'ancillary'].map(k => (
            <button key={k} onClick={() => setView(k)} className={`w-full text-left px-3 py-2.5 border-l-2 transition-colors ${view === k ? 'bg-white border-accent' : 'border-transparent hover:bg-paper'}`}>
              <div className={`font-semibold text-xs capitalize ${view === k ? 'text-heading' : 'text-dim'}`}>{k === 'achievements' ? '🏆 Achievements' : k === 'competencies' ? '◆ Competencies' : k === 'education' ? '🎓 Education' : '🧩 Ancillary'}</div>
            </button>
          ))}
        </div>
        <div className="p-2 border-t border-fill space-y-1.5">
          {hasJD && jt.description && <button onClick={batchGenerate} disabled={!apiReady || !!batchProgress} className="w-full bg-accent text-white text-xs py-2 rounded-lg hover:bg-accent-strong disabled:opacity-40 font-medium">{batchProgress ? `${batchProgress.done}/${batchProgress.total}...` : '✦ Tailor Entire Resume'}</button>}
          <div className="flex gap-1">
            <button onClick={exportData} className="flex-1 bg-white text-dim text-xs py-1.5 rounded-lg border border-line">💾</button>
            <button onClick={importData} className="flex-1 bg-white text-dim text-xs py-1.5 rounded-lg border border-line">📂</button>
            <button onClick={() => { if (window.confirm('Reset?')) { setData(INITIAL_DATA); setView('jd'); setShowDiff({}); showToast('Reset'); }}} className="flex-1 bg-white text-faint text-xs py-1.5 rounded-lg border border-line hover:text-danger">↺</button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto">

        {/* JD */}
        {view === 'jd' && (
          <div className="p-6 max-w-4xl mx-auto space-y-5">
            <div><h2 className="font-bold text-heading text-xl">Job Target</h2><p className="text-xs text-muted">Paste JD → Save → hit "✦ Tailor Entire Resume" in sidebar.</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div><label className="block text-xs font-semibold text-body mb-1">Role</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={jdDraft.role} onChange={e => setJdDraft(d => ({ ...d, role: e.target.value }))} /></div>
              <div><label className="block text-xs font-semibold text-body mb-1">Company</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={jdDraft.company} onChange={e => setJdDraft(d => ({ ...d, company: e.target.value }))} /></div>
            </div>
            <div><label className="block text-xs font-semibold text-body mb-1">Job Description</label><textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none" style={{ height: 200 }} value={jdDraft.description} onChange={e => setJdDraft(d => ({ ...d, description: e.target.value }))} /></div>
            <div className="flex gap-3">
              <button onClick={saveJD} disabled={!jdDraft.role && !jdDraft.description} className="px-5 py-2 bg-heading text-white rounded-lg text-sm disabled:opacity-40 font-medium">Save</button>
              {hasJD && jt.description && <button onClick={analyzeJD} disabled={analyzing || !apiReady} className="px-5 py-2 bg-white border text-body rounded-lg text-sm">{analyzing ? 'Analyzing...' : '✦ Analyze Gaps'}</button>}
              {hasJD && <button onClick={clearJD} className="px-4 py-2 text-danger-soft text-sm">Clear</button>}
            </div>
            {jt.keywords?.topPriority && <div className="bg-warning-fill border border-warning-line rounded-lg p-3"><div className="text-xs font-bold text-warning uppercase mb-1">Top Gap</div><div className="text-sm text-warning-strong">{jt.keywords.topPriority}</div></div>}
            {jt.keywords?.mustHave?.length > 0 && <div className="grid grid-cols-2 gap-4">
              <div className="bg-danger-fill border border-danger-line rounded-lg p-3"><div className="text-xs font-bold text-danger uppercase mb-1">Missing</div>{jt.keywords.mustHave.map((k,i) => <div key={i} className="text-xs text-danger">• {k}</div>)}</div>
              {jt.keywords.present?.length > 0 && <div className="bg-success-fill border border-success-line-soft rounded-lg p-3"><div className="text-xs font-bold text-success uppercase mb-1">Covered</div>{jt.keywords.present.map((k,i) => <div key={i} className="text-xs text-success">• {k}</div>)}</div>}
            </div>}
          </div>
        )}

        {/* Summary */}
        {view === 'summary' && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <h2 className="font-bold text-heading text-xl">Professional Summary</h2>
            <VariantCard bullet={data.summary} onGenerate={() => setGenModal({ type: 'summary' })} onAdd={() => { setAddModal({ type: 'summary' }); setNewText(data.summary.variants[data.summary.active].text); setNewLabel(''); }} onSetActive={vi => setSummaryActive(vi)} onDelete={vi => upd(d => { if (d.summary.variants.length <= 1) return; d.summary.variants.splice(vi, 1); d.summary.active = Math.min(d.summary.active, d.summary.variants.length - 1); })} showDiff={showDiff['summary']} onToggleDiff={() => toggleDiff('summary')} apiReady={apiReady} hasJD={hasJD} />
          </div>
        )}

        {/* Preview */}
        {view === 'preview' && (
          <div className="h-full">
            <ResumePreview data={data} backendUp={backendUp} />
          </div>
        )}

        {/* Role View */}
        {typeof view === 'number' && selRole && (
          <div className="p-6 max-w-4xl mx-auto space-y-5">
            <div>
              <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                  <div><h2 className="font-bold text-heading text-xl">{selRole.company}</h2><div className="text-xs text-muted">{selRole.location}</div></div>
                  <button onClick={() => openEditRole(view)} className="text-xs px-2.5 py-1 bg-white text-dim border border-line-strong rounded-lg hover:bg-fill">Edit</button>
                </div>
                <div className="text-right">{selRole.positions.map((p, i) => <div key={i} className="text-sm text-muted"><span className="font-semibold text-heading text-lg">{p.title}</span> · {p.dates}</div>)}</div>
              </div>
              {hasJD && <div className="mt-2 inline-flex items-center gap-1.5 text-xs bg-success-fill text-success px-2.5 py-1 rounded-full"><span className="w-1.5 h-1.5 rounded-full bg-success"></span>Target: {jt.role}</div>}
            </div>
            {selRole.positions.map((pos, pi) => (
              <div key={pi}>
                {selRole.positions.length > 1 && <div className="text-xs font-bold text-muted uppercase tracking-wider mb-2">{pos.title}{pos.note ? ` (${pos.note})` : ''} · {pos.dates}</div>}
                {pos.descriptor && <div className="text-xs text-faint italic mb-2 bg-paper px-3 py-2 rounded-lg">{pos.descriptor}</div>}
                <div className="space-y-2">
                  {pos.bullets.map((b, bi) => (
                    <VariantCard key={b.id} bullet={b}
                      onGenerate={() => setGenModal({ type: 'bullet', ri: view, pi, bi })}
                      onAdd={() => { setAddModal({ type: 'bullet', ri: view, pi, bi }); setNewText(b.variants[b.active].text); setNewLabel(''); }}
                      onSetActive={vi => setBulletActive(view, pi, bi, vi)}
                      onDelete={vi => delBulletVariant(view, pi, bi, vi)}
                      showDiff={showDiff[b.id]} onToggleDiff={() => toggleDiff(b.id)}
                      apiReady={apiReady} hasJD={hasJD} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Achievements */}
        {view === 'achievements' && (
          <div className="p-6 max-w-3xl mx-auto space-y-3">
            <h2 className="font-bold text-heading text-xl">Selected Achievements</h2>
            {data.achievements.map((a, ai) => (
              <VariantCard key={a.id} bullet={a}
                onGenerate={() => setGenModal({ type: 'achievement', ai })}
                onAdd={() => { setAddModal({ type: 'achievement', ai }); setNewText(a.variants[a.active].text); setNewLabel(''); }}
                onSetActive={vi => setAchActive(ai, vi)}
                onDelete={vi => delAchVariant(ai, vi)}
                showDiff={showDiff[a.id]} onToggleDiff={() => toggleDiff(a.id)}
                apiReady={apiReady} hasJD={hasJD} />
            ))}
          </div>
        )}

        {/* Competencies */}
        {view === 'competencies' && (
          <div className="p-6 max-w-3xl mx-auto space-y-4">
            <div className="flex justify-between items-start">
              <h2 className="font-bold text-heading text-xl">Core Competencies</h2>
              {hasJD && jt.description && <button onClick={async () => { setAnalyzing(true); try { const g = await genCompetencies(); if (Array.isArray(g)) upd(d => { d.competencyGroups = g.map((x, i) => ({ id: `cg_g_${i}`, label: x.label, items: (x.items||[]).map((c, j) => ({ id: `c_g_${i}_${j}`, text: c, active: true })) })); }); showToast('Generated'); } catch (e) { showToast(`Failed: ${e.message}`); } setAnalyzing(false); }} disabled={analyzing || !apiReady} className="px-4 py-2 bg-accent text-white rounded-lg text-xs disabled:opacity-40 font-medium">{analyzing ? '...' : '✦ Auto-Generate'}</button>}
            </div>
            {data.competencyGroups.map(g => (
              <div key={g.id} className="bg-white rounded-xl border border-line p-4">
                <div className="font-semibold text-xs text-body mb-2">{g.label}</div>
                <div className="grid grid-cols-2 gap-1">
                  {g.items.map(c => (
                    <label key={c.id} className={`flex items-center gap-2 text-xs px-2 py-1.5 rounded cursor-pointer hover:bg-paper ${c.active ? 'text-strong' : 'text-faint line-through'}`}>
                      <input type="checkbox" checked={c.active} onChange={() => toggleComp(g.id, c.id)} className="accent-heading" />
                      {c.text}
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Education */}
        {view === 'education' && (
          <div className="p-6 max-w-2xl mx-auto space-y-5">
            <h2 className="font-bold text-heading text-xl">Education</h2>
            {data.education.map(e => (
              <div key={e.id} className="bg-white rounded-xl border border-line p-4 space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-body mb-1">School</label>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" value={e.school} onChange={ev => updateEducation(e.id, 'school', ev.target.value)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs font-semibold text-body mb-1">Location</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={e.location} onChange={ev => updateEducation(e.id, 'location', ev.target.value)} /></div>
                  <div><label className="block text-xs font-semibold text-body mb-1">Degree</label><input className="w-full border rounded-lg px-3 py-2 text-sm" value={e.degree} onChange={ev => updateEducation(e.id, 'degree', ev.target.value)} /></div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-body mb-1">Collegiate Sports / Activities <span className="text-faint font-normal">(one per line)</span></label>
                  <textarea className="w-full border rounded-lg px-3 py-2 text-sm resize-none h-16" placeholder={"e.g.\nVarsity Soccer (4 years)\nTeam Captain (Senior Year)"}
                    value={e.sports} onChange={ev => updateEducation(e.id, 'sports', ev.target.value)} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Ancillary */}
        {view === 'ancillary' && (
          <div className="p-6 max-w-2xl mx-auto space-y-5">
            <div>
              <h2 className="font-bold text-heading text-xl">Ancillary</h2>
              <p className="text-xs text-muted mt-1">Sports, hobbies, languages, interests — rendered as a compact 2-column section at the end of the resume.</p>
            </div>
            <div className="space-y-2">
              {(data.ancillary || []).map(item => (
                <div key={item.id} className="flex items-center gap-2">
                  <input className="flex-1 border rounded-lg px-3 py-2 text-sm" value={item.text}
                    placeholder="e.g. Marathon Running (Boston 2019)"
                    onChange={ev => updateAncillary(item.id, ev.target.value)} />
                  <button onClick={() => removeAncillary(item.id)} className="text-faint hover:text-danger px-2" title="Remove">×</button>
                </div>
              ))}
            </div>
            <button onClick={addAncillary} className="mt-2 text-xs px-2.5 py-1 bg-white text-dim border border-line-strong rounded-lg hover:bg-fill">+ Add item</button>
          </div>
        )}
      </div>
    </div>
  );
}
