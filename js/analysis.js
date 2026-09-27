// Luck/regression indicators, trend-vs-projection gaps, in-season disparities, injury risk, team context notes.
import { D, injuryOf, lastSeasonKey } from './data.js';
import { fmt } from './format.js';
import { subscribe } from './store.js';

// results depend on settings (formatting) and live injuries, so drop the cache on any state change
const memo = new Map();
subscribe(() => memo.clear());
const memoize = (name, fn) => p => {
  const k = name + p.id;
  if (!memo.has(k)) memo.set(k, fn(p));
  return memo.get(k);
};

// ---- luck: last season (or current season once it has enough games) vs career norms
export const luck = memoize('luck', p => {
  const car = p.career;
  const cur = p.cur && p.cur.gp >= 15 && p.cur.pdo != null ? p.cur : null;
  const s = cur || p.seasons?.[lastSeasonKey()];
  if (!s || !car) return null;
  const basis = cur ? `${D.meta.season} to date` : `${D.meta.hist.at(-1)}`;
  const items = [];
  const add = (label, val, norm, diff, hiThr, fmtV, fmtD, note) => {
    if (val == null || norm == null) return;
    const dir = diff >= hiThr ? 'high' : diff <= -hiThr ? 'low' : 'normal';
    items.push({ label, val: fmtV(val), norm: fmtV(norm), diff: fmtD(diff), dir, note });
  };
  if (p.pos === 'G') {
    add('SV%', s.svp, car.svp, s.svp - car.svp, 0.8, v => fmt.pct(v, 2), v => fmt.pctDiff(v, 2), 'Goalie save % swings year to year; career level is the better guide.');
  } else {
    add('PDO', s.pdo, car.pdo, s.pdo - car.pdo, 15, fmt.pdo, fmt.pdoDiff, 'On-ice SH% + SV% at 5v5. Regresses hard toward the player’s norm.');
    add('On-ice SH%', s.oish, car.oish, s.oish - car.oish, 1.5, v => fmt.pct(v), v => fmt.pctDiff(v), 'Teammates’ finishing while on ice. Inflates assists when high.');
    add('On-ice SV%', s.oisv, car.oisv, s.oisv - car.oisv, 1.5, v => fmt.pct(v), v => fmt.pctDiff(v), 'Goaltending behind the player. Drives +/- and is mostly luck.');
    if (s.sog >= 60) add('Shooting %', s.sh, car.sh, s.sh - car.sh, 3, v => fmt.pct(v), v => fmt.pctDiff(v), 'Individual finishing vs career. Goals follow this down or up.');
    if (s.ixg != null && car.gax != null && car.gp) {
      const exp = car.gax * (s.gp / car.gp);
      add('Goals − xG', s.g - s.ixg, exp, (s.g - s.ixg) - exp, 5, v => fmt.signed(v, 1), v => fmt.signed(v, 1), 'Goals above expected vs the player’s usual finishing edge.');
    }
  }
  const hi = items.filter(i => i.dir === 'high').length;
  const lo = items.filter(i => i.dir === 'low').length;
  let verdict = 'Sustainable', kind = 'ok';
  if (hi >= 2 && hi > lo) { verdict = 'Regression risk: sell-high'; kind = 'bad'; }
  else if (lo >= 2 && lo > hi) { verdict = 'Buy-low candidate'; kind = 'good'; }
  else if (hi === 1 && lo === 0) { verdict = 'Mild luck boost'; kind = 'warn'; }
  else if (lo === 1 && hi === 0) { verdict = 'Mild bad luck'; kind = 'info'; }
  return { basis, items, verdict, kind };
});

function slope(ys) {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const mx = (n - 1) / 2, my = ys.reduce((a, b) => a + b, 0) / n;
  const num = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
  const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
  return den ? num / den : 0;
}

// ---- 3-year underlying trend vs this season's projection
export const trend = memoize('trend', p => {
  if (p.pos === 'G' || !p.proj) return null;
  const ss = D.meta.histKeys.map(k => p.seasons?.[k]).filter(s => s && s.gp >= 20);
  if (ss.length < 2) return { series: [], flags: [], note: 'Fewer than two NHL seasons of 20+ GP: no reliable 3-year trend.' };
  const series = ss.map(s => ({
    p60: s.p / (s.toi * s.gp) * 60,
    xg60: s.ixg / (s.toi * s.gp) * 60,
    xgf: s.xgf, toi: s.toi, p82: s.p / s.gp * 82,
  }));
  const rel = k => { const vals = series.map(x => x[k]); const m = vals.reduce((a, b) => a + b, 0) / vals.length; return m ? slope(vals) / m : 0; };
  const t = { p60: rel('p60'), xg60: rel('xg60'), xgf: slope(series.map(x => x.xgf)), toi: rel('toi') };
  const projP82 = p.proj.p / p.proj.gp * 82;
  const lastP82 = series.at(-1).p82;
  const avgP82 = series.reduce((a, x) => a + x.p82, 0) / series.length;
  const flags = [];
  const underlyingDown = t.xg60 < -0.06 || t.xgf < -1.5;
  const underlyingUp = t.xg60 > 0.06 || t.xgf > 1.5;
  if (t.p60 < -0.08 && underlyingDown && projP82 > lastP82 * 1.03) {
    flags.push({ kind: 'bad', text: `3-yr trend is declining (pts/60 ${fmt.signed(t.p60 * 100, 0)}%/yr, underlying play down), but the projection (${fmt.num(projP82)} pts/82) sits above last season’s ${fmt.num(lastP82)} pace. Likely optimistic.` });
  }
  if (t.p60 > 0.08 && underlyingUp && projP82 < lastP82 * 0.97) {
    flags.push({ kind: 'good', text: `3-yr trend is rising (pts/60 ${fmt.signed(t.p60 * 100, 0)}%/yr, underlying play up), but the projection (${fmt.num(projP82)} pts/82) is below last season’s ${fmt.num(lastP82)} pace. The weighted average may be too conservative.` });
  }
  if (t.p60 > 0.08 && underlyingDown) {
    flags.push({ kind: 'warn', text: 'Points rising while underlying xG/60 and xGF% fall. Results are outrunning process.' });
  }
  if (t.p60 < -0.08 && underlyingUp) {
    flags.push({ kind: 'info', text: 'Points falling while underlying play improves. Production should recover.' });
  }
  if (p.proj.g - p.proj.xg >= 5) {
    flags.push({ kind: 'warn', text: `Projected goals (${fmt.num(p.proj.g, 1)}) lean on finishing above individual xG (${fmt.num(p.proj.xg, 1)}).` });
  }
  if (Math.abs(projP82 - avgP82) / (avgP82 || 1) > 0.2 && avgP82 > 15) {
    flags.push({ kind: 'info', text: `Projection (${fmt.num(projP82)} pts/82) differs from the 3-yr average (${fmt.num(avgP82)}) by more than 20%. Check age, team or role change.` });
  }
  if (t.toi < -0.06) flags.push({ kind: 'warn', text: `Ice time shrinking ${fmt.num(Math.abs(t.toi) * 100, 0)}%/yr over the window.` });
  return { series, t, flags, projP82, lastP82, avgP82 };
});

// ---- in-season: current production vs projection
export function paceGap(p) {
  const c = p.cur;
  if (!c || !p.proj || c.gp < 8) return null;
  if (p.pos === 'G') {
    if (c.svp == null) return null;
    const d = c.svp - p.proj.svp;
    return d <= -1 ? { kind: 'bad', text: `SV% ${fmt.pct(c.svp, 2)} vs projected ${fmt.pct(p.proj.svp, 2)}. Underperforming.` }
      : d >= 1 ? { kind: 'warn', text: `SV% ${fmt.pct(c.svp, 2)} well above projected ${fmt.pct(p.proj.svp, 2)}. Expect cooling.` } : null;
  }
  const pace = c.p / c.gp * 82, proj = p.proj.p / p.proj.gp * 82;
  const d = (pace - proj) / (proj || 1);
  if (d <= -0.25) return { kind: 'bad', text: `Pacing ${fmt.num(pace)} pts/82 vs projected ${fmt.num(proj)} (${fmt.signed(d * 100, 0)}%). Underperforming.` };
  if (d >= 0.25) return { kind: 'warn', text: `Pacing ${fmt.num(pace)} pts/82 vs projected ${fmt.num(proj)} (${fmt.signed(d * 100, 0)}%). Check luck indicators before trusting it.` };
  return null;
}

// Flags for the sandbox: underperformance + trend contradictions + luck
export function disparityFlags(p) {
  const out = [];
  const pg = paceGap(p);
  if (pg) out.push(pg);
  const tr = trend(p);
  if (tr) out.push(...tr.flags.filter(f => f.kind === 'bad' || f.kind === 'good'));
  const lk = luck(p);
  if (lk && (lk.kind === 'bad' || lk.kind === 'good')) out.push({ kind: lk.kind, text: `${lk.verdict} (${lk.basis})` });
  return out;
}

// ---- injury
export const injuryInfo = memoize('inj', p => {
  const inj = injuryOf(p);
  if (!inj) return null;
  const today = new Date().toISOString().slice(0, 10);
  let games = null;
  if (inj.ret) games = D.schedule.filter(g => (g.h === p.team || g.a === p.team) && g.d >= today && g.d < inj.ret).length;
  const days = inj.ret ? Math.round((Date.parse(inj.ret) - Date.parse(today)) / 86400000) : null;
  const long = inj.status === 'Injured Reserve' || (days != null && days > 14);
  const role = p.role || {};
  let cliff = 'Low', why = 'Short absence; role should be intact.';
  if (inj.status === 'Suspension') { cliff = 'Low'; why = 'Suspension: role typically restored on return.'; }
  else if (long && (role.security !== 'High' || (role.threats || []).length)) { cliff = 'High'; why = 'Long absence and the role was already contested. Expect reduced TOI/PP time on return.'; }
  else if (long) { cliff = 'Medium'; why = 'Long absence: first 3-5 games back usually carry trimmed minutes.'; }
  else if (inj.status === 'Out' && role.pp) { cliff = 'Medium'; why = `Replacement will audition on ${role.pp} while out.`; }
  const label = { 'Day-To-Day': 'Questionable (DTD)', 'Injured Reserve': 'IR', Out: 'Out', Suspension: 'Suspended' }[inj.status] || inj.status;
  return { ...inj, label, games, days, cliff, why };
});

// ---- team context
export const OUTLOOK_NOTES = {
  'Rebuilding / tanking': 'Stars on rebuilding teams soak up TOI and PP1 time, which inflates volume stats, but +/-, GWG and goalie wins are suppressed. At the deadline, veterans can be sold (role/linemate change) and late-season tanking thins the support around the star.',
  'Bubble / contender': 'Direction is unsettled. If they buy at the deadline, new PP talent can dilute a star’s PP share; if they sell, supporting scorers leave. Recheck around the trade deadline (early March), when this tag can flip.',
  'Established contender': 'Deep lineups spread TOI and PP time, so counting stats cap below a star’s talent. Once a playoff spot is locked, veterans may be rested in the final weeks, which overlaps fantasy playoffs.',
};

export function envNote(t) {
  const r = t.rates || {};
  const sum = (r.xgf60 || 0) + (r.xga60 || 0);
  if (t.env === 'High-event') return `High-event: ${fmt.num(sum, 2)} combined xG/60 at 5v5 (league-high tier). Inflates skater counting stats (points, shots, +/- swings) independent of skill, and hurts goalie GAA.`;
  if (t.env === 'Low-event') return `Low-event: ${fmt.num(sum, 2)} combined xG/60 at 5v5. Suppresses counting stats for skaters regardless of skill, but helps goalie GAA/SV%.`;
  return `Neutral environment: ${fmt.num(sum, 2)} combined xG/60 at 5v5.`;
}

export function outlookFreshness() {
  const gen = D.meta.generated ? new Date(D.meta.generated) : null;
  const ageDays = gen ? (Date.now() - gen) / 86400000 : Infinity;
  const md = new Date().toISOString().slice(5, 10);
  const deadline = md >= '02-10' && md <= '03-15';
  return { gen, ageDays, stale: ageDays > (deadline ? 1.5 : 7), deadline };
}

// ---- roster composition
export function balance(ids) {
  const div = {}, conf = {};
  const ps = ids.map(id => D.byId.get(id)).filter(Boolean);
  for (const p of ps) {
    const t = D.teams[p.team];
    if (!t) continue;
    div[t.division] = (div[t.division] || 0) + 1;
    conf[t.conference] = (conf[t.conference] || 0) + 1;
  }
  return { n: ps.length, div, conf };
}
