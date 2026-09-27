// Committed roster (mirrors the real league) vs sandbox (committed + hypothetical moves).
import { state, update, CATS } from './store.js';
import { D } from './data.js';

export function applyOps(base, ops) {
  const set = new Set(base);
  for (const o of ops) {
    if (o.type === 'add') set.add(o.id);
    if (o.type === 'drop') set.delete(o.id);
    if (o.type === 'trade') { o.out.forEach(i => set.delete(i)); o.in.forEach(i => set.add(i)); }
  }
  return [...set];
}

export const committed = () => state.roster.committed;
export const sandbox = () => applyOps(state.roster.committed, state.roster.ops);

export function addOp(op) {
  update(s => { s.roster.ops.push({ ...op, key: Date.now() + Math.random().toString(36).slice(2, 6) }); });
}
export function removeOp(key) {
  update(s => { s.roster.ops = s.roster.ops.filter(o => o.key !== key); });
}

export function commitOps(keys, note) {
  update(s => {
    const chosen = s.roster.ops.filter(o => keys.includes(o.key));
    s.roster.committed = applyOps(s.roster.committed, chosen);
    s.roster.ops = s.roster.ops.filter(o => !keys.includes(o.key))
      // drop sandbox ops that no longer make sense against the new committed roster
      .filter(o => o.type !== 'add' || !s.roster.committed.includes(o.id))
      .filter(o => o.type !== 'drop' || s.roster.committed.includes(o.id));
    s.roster.history.unshift({ ts: new Date().toISOString(), ops: chosen, note: note || '' });
  });
}

// Projected category totals for a set of player ids.
export function totals(ids) {
  const t = Object.fromEntries(CATS.map(c => [c.key, 0]));
  let sa = 0, sv = 0, ga = 0, ggp = 0;
  for (const id of ids) {
    const p = D.byId.get(id);
    if (!p?.proj) continue;
    if (p.pos === 'G') {
      for (const k of ['w', 'sv', 'ga', 'so', 'gs']) t[k] += p.proj[k] || 0;
      sa += p.proj.sa || 0; sv += p.proj.sv || 0; ga += p.proj.ga || 0; ggp += p.proj.gp || 0;
    } else {
      for (const c of CATS) if (c.grp === 'S') t[c.key] += p.proj[c.key] || 0;
    }
  }
  t.svp = sa ? sv / sa * 100 : null;
  t.gaa = ggp ? ga / ggp : null;
  return t;
}

export function describeOp(o) {
  const n = id => D.byId.get(id)?.name || id;
  if (o.type === 'add') return `Add ${n(o.id)}`;
  if (o.type === 'drop') return `Drop ${n(o.id)}`;
  return `Trade ${o.out.map(n).join(', ')} for ${o.in.map(n).join(', ')}`;
}
