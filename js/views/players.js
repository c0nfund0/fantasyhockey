// All players with league-specific value, projections, luck and trend flags.
import { D } from '../data.js';
import { esc, fmt } from '../format.js';
import { state, update } from '../store.js';
import { valueOf, adpNote } from '../value.js';
import { luck, trend } from '../analysis.js';
import { table, plink, teamChip, injBadge, posLabel, ppChip } from '../ui.js';
import { committed } from '../roster.js';

export function filters(scope, extra = '') {
  const f = state.ui.playerFilter[scope] || {};
  const teams = Object.keys(D.teams).sort();
  return `<div class="filters">
    <input type="search" placeholder="Search player…" value="${esc(f.q || '')}" data-change="filter:${scope}:q" aria-label="Search">
    <select data-change="filter:${scope}:pos" aria-label="Position">${['SK', 'C', 'LW', 'RW', 'D', 'G'].map(x => `<option value="${x}" ${(f.pos || 'SK') === x ? 'selected' : ''}>${x === 'SK' ? 'All skaters' : x}</option>`).join('')}</select>
    <select data-change="filter:${scope}:team" aria-label="Team"><option value="">All teams</option>${teams.map(t => `<option ${f.team === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
    ${extra}
  </div>`;
}

export function applyFilter(scope, list) {
  const f = state.ui.playerFilter[scope] || {};
  const pos = f.pos || 'SK';
  const q = (f.q || '').toLowerCase();
  return list.filter(p => (pos === 'SK' ? p.pos !== 'G' : p.elig.includes(pos))
    && (!f.team || p.team === f.team)
    && (!q || p.name.toLowerCase().includes(q)));
}

export function isGoalieFilter(scope) { return (state.ui.playerFilter[scope]?.pos) === 'G'; }

export function valueCols() {
  const pts = state.league.format === 'points';
  return [
    { k: 'val', label: 'Value', get: p => valueOf(p)?.vorp, fmt: v => fmt.num(v, pts ? 0 : 2), cls: 'num strong', title: 'Value over replacement under your league settings' },
    { k: 'adp', label: 'ADP', get: p => p.adp, fmt: v => fmt.num(v, 1), cls: 'num', title: 'ESPN average draft position' },
    { k: 'adpn', label: 'vs ADP', get: p => adpNote(p)?.diff, fmt: (v, p) => { const n = adpNote(p); return n ? `<span class="adp ${n.kind}" title="${esc(n.text)}">${n.kind === 'fair' ? '≈' : fmt.signed(n.diff)}</span>` : ''; }, cls: 'num', title: 'ADP minus your rank. Positive = discount, negative = reach.' },
  ];
}

export function skaterCols() {
  return [
    { k: 'g', label: 'G', get: p => p.proj?.g, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'a', label: 'A', get: p => p.proj?.a, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'p', label: 'P', get: p => p.proj?.p, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'ppp', label: 'PPP', get: p => p.proj?.ppp, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'sog', label: 'SOG', get: p => p.proj?.sog, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'hit', label: 'HIT', get: p => p.proj?.hit, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'blk', label: 'BLK', get: p => p.proj?.blk, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'pim', label: 'PIM', get: p => p.proj?.pim, fmt: v => fmt.num(v), cls: 'num' },
  ];
}
export function goalieCols() {
  return [
    { k: 'gs', label: 'GS', get: p => p.proj?.gs, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'w', label: 'W', get: p => p.proj?.w, fmt: v => fmt.num(v), cls: 'num' },
    { k: 'svp', label: 'SV%', get: p => p.proj?.svp, fmt: v => fmt.pct(v, 2), cls: 'num' },
    { k: 'gaa', label: 'GAA', get: p => p.proj?.gaa, fmt: v => fmt.num(v, 2), cls: 'num' },
    { k: 'so', label: 'SO', get: p => p.proj?.so, fmt: v => fmt.num(v, 1), cls: 'num' },
  ];
}

const luckOrder = { bad: 0, warn: 1, ok: 2, info: 3, good: 4 };

export function render() {
  const f = state.ui.playerFilter.players || {};
  const flagSel = `<select data-change="filter:players:flag" aria-label="Flags">
    ${[['', 'Any signal'], ['buy', 'Buy-low candidates'], ['sell', 'Sell-high / regression risk'], ['gap', 'Trend vs projection gap'], ['inj', 'Injured'], ['mine', 'My roster']].map(([v, l]) => `<option value="${v}" ${f.flag === v ? 'selected' : ''}>${l}</option>`).join('')}
  </select>`;
  let list = applyFilter('players', D.players);
  if (f.flag === 'buy') list = list.filter(p => luck(p)?.kind === 'good');
  if (f.flag === 'sell') list = list.filter(p => luck(p)?.kind === 'bad');
  if (f.flag === 'gap') list = list.filter(p => (trend(p)?.flags || []).some(x => x.kind === 'bad' || x.kind === 'good'));
  if (f.flag === 'inj') list = list.filter(p => injBadge(p));
  if (f.flag === 'mine') list = list.filter(p => committed().includes(p.id));
  const g = isGoalieFilter('players');
  const cols = [
    { k: 'rank', label: '#', title: 'Overall rank in your league (skaters and goalies)', get: p => valueOf(p)?.rank, fmt: v => v ?? '—', cls: 'num muted' },
    { k: 'name', label: 'Player', get: p => p.name, fmt: (v, p) => `${plink(p)} ${injBadge(p)}` },
    { k: 'team', label: 'Team', get: p => p.team, fmt: v => teamChip(v) },
    { k: 'pos', label: 'Pos', get: p => posLabel(p), fmt: (v, p) => `${v} ${ppChip(p.role)}` },
    ...valueCols(),
    { k: 'age', label: 'Age', get: p => p.age, fmt: v => v ?? '—', cls: 'num' },
    { k: 'ht', label: 'Ht', get: p => p.hCm, fmt: (v, p) => fmt.height(p), cls: 'num' },
    { k: 'wt', label: 'Wt', get: p => p.wKg, fmt: (v, p) => fmt.weight(p), cls: 'num' },
    { k: 'gp', label: 'GP', get: p => p.proj?.gp, fmt: v => fmt.num(v), cls: 'num' },
    ...(g ? [] : [{ k: 'toi', label: 'TOI', get: p => p.proj?.toi, fmt: v => fmt.toi(v), cls: 'num' }]),
    ...(g ? goalieCols() : skaterCols()),
    { k: 'luck', label: 'Luck', get: p => luckOrder[luck(p)?.kind] ?? 2, fmt: (v, p) => { const l = luck(p); return l && l.kind !== 'ok' ? `<span class="flag ${l.kind} tiny" title="${esc(l.basis)}">${esc(l.verdict)}</span>` : ''; } },
    { k: 'trend', label: 'Trend gap', get: p => (trend(p)?.flags || []).filter(x => x.kind === 'bad' || x.kind === 'good').length, fmt: (v, p) => (trend(p)?.flags || []).filter(x => x.kind === 'bad' || x.kind === 'good').map(x => `<span class="flag ${x.kind} tiny" title="${esc(x.text)}">${x.kind === 'bad' ? 'Proj > trend' : 'Proj < trend'}</span>`).join('') },
  ];
  return `<div class="view-head"><h1>Players</h1><p class="muted">Projections for ${D.meta.season}, valued with <b>your</b> league settings (${esc(state.league.format === 'points' ? 'points' : state.league.format === 'roto' ? 'rotisserie' : 'H2H categories')}, ${state.league.teams} teams). Click a player for the full stats dashboard.</p></div>
    ${filters('players', flagSel)}
    ${table('players', list, cols, { sortKey: 'val', limit: 300 })}`;
}

export function onChange(key, value) {
  const [, scope, field] = key.split(':');
  update(s => { (s.ui.playerFilter[scope] ||= {})[field] = value; });
}
