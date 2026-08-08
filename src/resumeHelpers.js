// Pure data helpers for the role editor. No React, no DOM — unit-testable in isolation.
//
// Three invariants live here because four unguarded call sites depend on them:
//   1. every bullet has variants[0] populated  (App.jsx:298, :389, :547; render-pdf.py:92)
//   2. every role has >= 1 position            (App.jsx:469 reads positions[0])
//   3. positions[].dates is always a string    (App.jsx:469 calls .split on it)
// render-pdf.py is defensive about all three; App.jsx is not. App.jsx is the binding
// constraint, so these are guaranteed here rather than relying on the renderer.

/** Globally-unique id. crypto.randomUUID needs a secure context; 127.0.0.1 qualifies.
 *  Ids must be unique across ALL bullets, not just within a position — showDiff is a
 *  flat map keyed by bullet id (App.jsx:550) and VariantCard uses it as a React key. */
export function newId(prefix) {
  const uuid =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}_${uuid.replace(/-/g, '').slice(0, 12)}`;
}

export function makeBullet(text = '') {
  // variants[0] is ALWAYS the Default and is never removed. Invariant 1.
  return { id: newId('b'), active: 0, variants: [{ text, label: 'Default' }] };
}

export function makeAncillaryItem(text = '') {
  // Static personal info — just {id, text}, no variants/active (spec D2, D4).
  return { id: newId('anc'), text };
}

export function makePosition() {
  // dates must be a string, not undefined. Invariant 3.
  // NOTE: the sidebar splits dates on an EN DASH (–, U+2013), not a hyphen.
  return { title: '', dates: '', bullets: [makeBullet('')] };
}

export function makeRole() {
  // Always ships one position. Invariant 2.
  return { id: newId('role'), company: '', location: '', positions: [makePosition()] };
}

const nonEmpty = s => typeof s === 'string' && s.trim().length > 0;

export function isRoleValid(draft) {
  if (!draft || !nonEmpty(draft.company)) return false;
  if (!Array.isArray(draft.positions) || draft.positions.length === 0) return false;
  if (!draft.positions.every(p => nonEmpty(p.title))) return false;
  const bullets = draft.positions.flatMap(p => p.bullets || []);
  return bullets.some(b => nonEmpty(b.variants?.[0]?.text));
}

/** Commit-time cleanup: drop empty bullets, enforce the invariants.
 *  Never touches variants[1..n] or reorders them — tailored variants are sacred (spec D2). */
export function normalizeRole(draft) {
  return {
    ...draft,
    id: draft.id || newId('role'),
    company: (draft.company || '').trim(),
    location: (draft.location || '').trim(),
    positions: draft.positions.map(p => ({
      ...p,
      title: (p.title || '').trim(),
      dates: typeof p.dates === 'string' ? p.dates.trim() : '',
      bullets: (p.bullets || [])
        .filter(b => nonEmpty(b.variants?.[0]?.text))
        .map(b => ({
          ...b,
          id: b.id || newId('b'),
          // Clamp active into range without reordering or dropping variants.
          active: Math.min(Math.max(b.active ?? 0, 0), b.variants.length - 1),
        })),
    })),
  };
}

/** Move roles[from] to index `to`. Returns the new array plus an indexMap so the caller
 *  can remap `view` — which is the selected role INDEX (App.jsx:403), not an id. Without
 *  the remap, reordering silently jumps the selection to a different company. */
export function moveRole(roles, from, to) {
  const identity = roles.map((_, i) => i);
  if (to < 0 || to >= roles.length || from === to) {
    return { roles: [...roles], indexMap: identity };
  }
  const next = [...roles];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);

  const indexMap = roles.map(r => next.indexOf(r));
  return { roles: next, indexMap };
}
