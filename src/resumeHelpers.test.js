import { describe, it, expect } from 'vitest';
import {
  newId, makeBullet, makePosition, makeRole,
  isRoleValid, normalizeRole, moveRole, makeAncillaryItem,
} from './resumeHelpers';

describe('newId', () => {
  it('produces unique ids across rapid calls', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newId('b')));
    expect(ids.size).toBe(500);
  });
  it('applies the prefix', () => {
    expect(newId('role')).toMatch(/^role_/);
  });
});

describe('makeBullet', () => {
  it('always populates variants[0] as Default', () => {
    const b = makeBullet('hello');
    expect(b.variants[0]).toEqual({ text: 'hello', label: 'Default' });
    expect(b.active).toBe(0);
  });
  it('has a unique id', () => {
    expect(makeBullet('a').id).not.toBe(makeBullet('a').id);
  });
});

describe('makePosition', () => {
  it('defaults dates to a STRING, never undefined (App.jsx:469 splits on it)', () => {
    expect(typeof makePosition().dates).toBe('string');
  });
});

describe('makeRole', () => {
  it('always has at least one position (App.jsx:469 reads positions[0])', () => {
    expect(makeRole().positions.length).toBeGreaterThanOrEqual(1);
  });
  it('positions[0].dates is a string', () => {
    expect(typeof makeRole().positions[0].dates).toBe('string');
  });
});

describe('isRoleValid', () => {
  const valid = () => ({
    id: 'r1', company: 'Acme', location: '',
    positions: [{ title: 'Director', dates: '2024 – Present', bullets: [makeBullet('did a thing')] }],
  });

  it('accepts a complete role', () => {
    expect(isRoleValid(valid())).toBe(true);
  });
  it('rejects an empty company', () => {
    expect(isRoleValid({ ...valid(), company: '  ' })).toBe(false);
  });
  it('rejects zero positions', () => {
    expect(isRoleValid({ ...valid(), positions: [] })).toBe(false);
  });
  it('rejects a position with an empty title', () => {
    const r = valid(); r.positions[0].title = '';
    expect(isRoleValid(r)).toBe(false);
  });
  it('rejects a role with no non-empty bullets', () => {
    const r = valid(); r.positions[0].bullets = [makeBullet('   ')];
    expect(isRoleValid(r)).toBe(false);
  });
  it('accepts an empty location and empty dates', () => {
    const r = valid(); r.location = ''; r.positions[0].dates = '';
    expect(isRoleValid(r)).toBe(true);
  });
});

describe('normalizeRole', () => {
  it('drops empty bullets', () => {
    const r = {
      id: 'r', company: 'Acme', location: '',
      positions: [{ title: 'T', dates: '', bullets: [makeBullet('keep'), makeBullet('   ')] }],
    };
    expect(normalizeRole(r).positions[0].bullets).toHaveLength(1);
  });
  it('guarantees dates is a string when undefined', () => {
    const r = {
      id: 'r', company: 'Acme', location: '',
      positions: [{ title: 'T', bullets: [makeBullet('x')] }],
    };
    expect(typeof normalizeRole(r).positions[0].dates).toBe('string');
  });
  it('preserves existing variants and active index (D2: never touch tailored variants)', () => {
    const b = makeBullet('default text');
    b.variants.push({ text: 'tailored', label: 'Ops' });
    b.active = 1;
    const r = {
      id: 'r', company: 'Acme', location: '',
      positions: [{ title: 'T', dates: '', bullets: [b] }],
    };
    const out = normalizeRole(r);
    expect(out.positions[0].bullets[0].variants).toHaveLength(2);
    expect(out.positions[0].bullets[0].variants[1]).toEqual({ text: 'tailored', label: 'Ops' });
    expect(out.positions[0].bullets[0].active).toBe(1);
  });
  it('clamps an out-of-range active index', () => {
    const b = makeBullet('only one');
    b.active = 7;
    const r = {
      id: 'r', company: 'Acme', location: '',
      positions: [{ title: 'T', dates: '', bullets: [b] }],
    };
    expect(normalizeRole(r).positions[0].bullets[0].active).toBe(0);
  });
  it('trims company/location/title/dates', () => {
    const r = {
      id: 'r', company: '  Acme  ', location: '  TX  ',
      positions: [{ title: '  T  ', dates: '  2024  ', bullets: [makeBullet('x')] }],
    };
    const out = normalizeRole(r);
    expect(out.company).toBe('Acme');
    expect(out.location).toBe('TX');
    expect(out.positions[0].title).toBe('T');
    expect(out.positions[0].dates).toBe('2024');
  });
});

describe('moveRole', () => {
  const roles = () => [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

  it('moves a role down', () => {
    expect(moveRole(roles(), 0, 1).roles.map(r => r.id)).toEqual(['b', 'a', 'c']);
  });
  it('moves a role up', () => {
    expect(moveRole(roles(), 2, 1).roles.map(r => r.id)).toEqual(['a', 'c', 'b']);
  });
  it('is a no-op at the boundaries', () => {
    expect(moveRole(roles(), 0, -1).roles.map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(moveRole(roles(), 2, 3).roles.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
  it('reports an indexMap so the caller can remap the selected view (App.jsx:403)', () => {
    // view is the selected role INDEX; moving 0->1 means a viewer on role 0 must follow to 1.
    expect(moveRole(roles(), 0, 1).indexMap[0]).toBe(1);
    expect(moveRole(roles(), 0, 1).indexMap[1]).toBe(0);
    expect(moveRole(roles(), 0, 1).indexMap[2]).toBe(2);
  });
  it('does not mutate the input array', () => {
    const orig = roles();
    moveRole(orig, 0, 2);
    expect(orig.map(r => r.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('makeAncillaryItem', () => {
  // Synthetic value only — ancillary content is user data kept in localStorage only.
  it('mints an item with the given text and a unique id', () => {
    const a = makeAncillaryItem('Spelunking');
    expect(a.text).toBe('Spelunking');
    expect(typeof a.id).toBe('string');
    expect(a.id.length).toBeGreaterThan(0);
    expect(makeAncillaryItem('x').id).not.toBe(makeAncillaryItem('x').id);
  });

  it('defaults text to empty string', () => {
    expect(makeAncillaryItem().text).toBe('');
  });
});
