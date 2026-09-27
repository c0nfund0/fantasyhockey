// Player value under the user's league settings (not generic rankings).
//  - points leagues: projected fantasy points
//  - category leagues (H2H / roto): weighted z-scores against the draftable pool; ratio cats volume-weighted
// Then value over replacement (VORP) by simulating how many players the league's slots actually consume.
import { CATS, state } from './store.js';
import { D } from './data.js';

let cache = { key: null, res: null };

export function statOf(p, k) {
  const pr = p.proj;
  if (!pr) return 0;
  return pr[k] ?? 0;
}

function activeCats(L) {
  return CATS.filter(c => L.format === 'points' ? L.cats[c.key].pts : L.cats[c.key].on && L.cats[c.key].w);
}

function mean(a) { return a.reduce((s, x) => s + x, 0) / (a.length || 1); }
function sd(a, m) { return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length || 1)) || 1; }

function zScores(pool, cats, all) {
  const out = new Map(all.map(p => [p.id, {}]));
  for (const c of cats) {
    const grpPool = pool.filter(p => (p.pos === 'G') === (c.grp === 'G'));
    const grpAll = all.filter(p => (p.pos === 'G') === (c.grp === 'G'));
    let val;
    if (c.ratio) {
      // contribution relative to pool average, scaled by the volume that drives the ratio
      const m = mean(grpPool.map(p => statOf(p, c.key)));
      val = p => c.key === 'svp' ? (statOf(p, 'svp') - m) / 100 * statOf(p, 'sa') : (m - statOf(p, 'gaa')) * statOf(p, 'gp') / 60 * 10;
    } else {
      val = p => statOf(p, c.key) * (c.low ? -1 : 1);
    }
    const vs = grpPool.map(val);
    const m = mean(vs), s = sd(vs, m);
    for (const p of grpAll) out.get(p.id)[c.key] = (val(p) - m) / s;
  }
  return out;
}

export function computeValues() {
  const L = state.league;
  const key = JSON.stringify([L.format, L.teams, L.slots, L.cats, L.goalieDiscount, D.meta.generated, D.players.length]);
  if (cache.key === key) return cache.res;

  const cats = activeCats(L);
  const all = D.players.filter(p => p.proj);
  const skCats = cats.filter(c => c.grp === 'S');
  const gCats = cats.filter(c => c.grp === 'G');
  const T = L.teams;
  const skSlots = ['C', 'LW', 'RW', 'F', 'D', 'UTIL'].reduce((s, k) => s + (L.slots[k] || 0), 0);
  const nSk = Math.max(20, T * (skSlots + Math.round((L.slots.BN || 0) * 0.75)));
  const nG = Math.max(4, T * ((L.slots.G || 0) + Math.round((L.slots.BN || 0) * 0.25)));

  const raw = new Map();
  let z = new Map();
  if (L.format === 'points') {
    for (const p of all) {
      let v = 0;
      for (const c of cats) if ((p.pos === 'G') === (c.grp === 'G')) v += statOf(p, c.key) * L.cats[c.key].pts;
      raw.set(p.id, v);
    }
  } else {
    // two passes: pool by a simple proxy, then pool by the first-pass z-sum
    let pool = [
      ...all.filter(p => p.pos !== 'G').sort((a, b) => statOf(b, 'p') - statOf(a, 'p')).slice(0, nSk),
      ...all.filter(p => p.pos === 'G').sort((a, b) => statOf(b, 'w') - statOf(a, 'w')).slice(0, nG),
    ];
    for (let pass = 0; pass < 2; pass++) {
      z = zScores(pool, cats, all);
      for (const p of all) {
        const zz = z.get(p.id);
        let v = 0;
        for (const c of (p.pos === 'G' ? gCats : skCats)) v += (zz[c.key] || 0) * L.cats[c.key].w;
        raw.set(p.id, v);
      }
      pool = [
        ...all.filter(p => p.pos !== 'G').sort((a, b) => raw.get(b.id) - raw.get(a.id)).slice(0, nSk),
        ...all.filter(p => p.pos === 'G').sort((a, b) => raw.get(b.id) - raw.get(a.id)).slice(0, nG),
      ];
    }
  }

  // replacement level: greedily fill every team's starting slots + bench, best raw value first
  const cap = {};
  for (const k of ['C', 'LW', 'RW', 'F', 'D', 'UTIL', 'G', 'BN']) cap[k] = T * (L.slots[k] || 0);
  const gBench = Math.round(cap.BN * 0.25);
  let gBenchUsed = 0;
  const sorted = [...all].sort((a, b) => raw.get(b.id) - raw.get(a.id));
  const taken = new Set();
  for (const p of sorted) {
    const el = p.elig;
    let slot = null;
    const dedicated = el.filter(e => cap[e] > 0).sort((a, b) => cap[a] - cap[b]);
    if (dedicated.length) slot = dedicated[0];
    else if (p.pos !== 'G' && p.pos !== 'D' && cap.F > 0) slot = 'F';
    else if (p.pos !== 'G' && cap.UTIL > 0) slot = 'UTIL';
    else if (cap.BN > 0 && (p.pos !== 'G' || gBenchUsed < gBench)) { slot = 'BN'; if (p.pos === 'G') gBenchUsed++; }
    if (slot) { cap[slot]--; taken.add(p.id); }
    if (Object.values(cap).every(v => v <= 0)) break;
  }
  const repl = {};
  for (const pos of ['C', 'LW', 'RW', 'D', 'G']) {
    const best = sorted.find(p => !taken.has(p.id) && p.elig.includes(pos));
    repl[pos] = best ? raw.get(best.id) : 0;
  }

  const res = new Map();
  for (const p of all) {
    const v = raw.get(p.id);
    let bestPos = p.pos, vorp = -Infinity;
    for (const e of p.elig) {
      if (repl[e] == null) continue;
      if (v - repl[e] > vorp) { vorp = v - repl[e]; bestPos = e; }
    }
    // goalie projections are the least stable year to year; haircut positive value by the league setting
    if (p.pos === 'G' && vorp > 0) vorp *= 1 - (L.goalieDiscount ?? 25) / 100;
    res.set(p.id, { raw: v, vorp, bestPos, z: z.get(p.id) || null });
  }
  const ranked = [...res.entries()].sort((a, b) => b[1].vorp - a[1].vorp);
  ranked.forEach(([, r], i) => { r.rank = i + 1; });
  for (const pos of ['C', 'LW', 'RW', 'D', 'G']) {
    ranked.filter(([id]) => D.byId.get(id).elig.includes(pos)).forEach(([, r], i) => { (r.posRank ??= {})[pos] = i + 1; });
  }
  cache = { key, res: { values: res, repl, cats, taken } };
  return cache.res;
}

export const valueOf = p => computeValues().values.get(p.id);

export function adpNote(p) {
  const v = valueOf(p);
  if (!v || !p.adp) return null;
  const diff = Math.round(p.adp - v.rank);
  const thr = Math.max(6, v.rank * 0.15);
  if (diff >= thr) return { kind: 'discount', diff, text: `Discount: market ADP ${Math.round(p.adp)}, your rank ${v.rank}` };
  if (diff <= -thr) return { kind: 'reach', diff, text: `Reach at ADP: market ADP ${Math.round(p.adp)}, your rank ${v.rank}` };
  return { kind: 'fair', diff, text: `In line with ADP ${Math.round(p.adp)}` };
}
