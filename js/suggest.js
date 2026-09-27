// Automatic suggestions, each with the reasoning behind it.
import { D, playoffWeeks, currentWeekIndex } from './data.js';
import { fmt } from './format.js';
import { state, CATS, subscribe } from './store.js';
import { valueOf, adpNote } from './value.js';
import { luck, trend, injuryInfo, balance } from './analysis.js';
import { committed, totals } from './roster.js';
import { allocate, pickSlot, START_SLOTS, usable } from './slots.js';

const pts = () => state.league.format === 'points';
const gainThreshold = () => (pts() ? 12 : 0.6);
const v = p => valueOf(p)?.vorp ?? -99;
const LONG_INJURY_GAMES = 5;

// Players this league can't use: drafted by others, or marked taken by the user.
export function unavailableIds() {
  return new Set([...state.draft.picks.filter(p => !p.me && p.id).map(p => p.id), ...(state.suggest?.taken || []), ...(state.espn?.owned || [])]);
}

// Free-agent pool approximation: not on my roster, not known-taken, and (optionally) not near-universally owned.
export function freeAgents() {
  const mine = new Set(committed());
  const un = unavailableIds();
  const hideOwned = state.suggest?.hideOwned ?? true;
  return D.players.filter(p => p.proj && valueOf(p) && !p.offRoster && !mine.has(p.id) && !un.has(p.id) && !(hideOwned && (p.own ?? 0) >= 85));
}

function activeCountingCats() {
  const L = state.league;
  return CATS.filter(c => !c.ratio && (pts() ? L.cats[c.key].pts : L.cats[c.key].on && L.cats[c.key].w));
}

// My projected totals vs an average team in this league, per category (weakest first).
export function catProfile(ids) {
  const L = state.league;
  const size = Object.entries(L.slots).filter(([k]) => k !== 'IR').reduce((s, [, n]) => s + n, 0);
  const pool = D.players.filter(p => valueOf(p)).sort((a, b) => v(b) - v(a)).slice(0, L.teams * size);
  const lg = totals(pool.map(p => p.id));
  const me = totals(ids);
  return activeCountingCats().map(c => ({
    key: c.key, label: c.label,
    ratio: lg[c.key] ? (me[c.key] / (lg[c.key] / L.teams)) * (c.low ? -1 : 1) : 1,
  })).sort((a, b) => a.ratio - b.ratio);
}

function catDeltaReasons(before, after, weak) {
  const tb = totals(before), ta = totals(after);
  const nW = D.weeks.length || 25;
  const deltas = activeCountingCats().map(c => ({ c, d: (ta[c.key] - tb[c.key]) * (c.low ? -1 : 1) }));
  const weakKeys = new Set(weak.slice(0, 3).filter(w => w.ratio < 0.97).map(w => w.key));
  const ups = deltas.filter(x => x.d > 0.5).sort((a, b) => b.d - a.d).slice(0, 4);
  const downs = deltas.filter(x => x.d < -0.5).sort((a, b) => a.d - b.d).slice(0, 2);
  const out = [];
  if (ups.length) {
    const hitsWeak = ups.filter(x => weakKeys.has(x.c.key));
    out.push({ kind: 'good', text: `Category gains: ${ups.map(x => `${x.c.label} ${fmt.signed(x.d)} (${fmt.signed(x.d / nW, 1)}/wk)`).join(', ')}.` });
    if (hitsWeak.length) out.push({ kind: 'good', text: `Targets your weakest categor${hitsWeak.length > 1 ? 'ies' : 'y'}: ${hitsWeak.map(x => x.c.label).join(', ')}.` });
  }
  if (downs.length) out.push({ kind: 'warn', text: `Costs you: ${downs.map(x => `${x.c.label} ${fmt.signed(x.d)}`).join(', ')}.` });
  return out;
}

function roleReasons(p) {
  const r = [];
  const role = p.role;
  if (role?.pp === 'PP1') r.push({ kind: 'good', text: `${role.pp} role${role.held ? ` held ${role.held} season${role.held > 1 ? 's' : ''}` : ''}: the power play drives fantasy scoring.` });
  if (role?.security === 'High' && role.slot) r.push({ kind: 'good', text: `Secure role (${role.slot}, security High).` });
  if (role?.security === 'Low') r.push({ kind: 'warn', text: `Role is not secure: ${role.threats?.[0] || 'contested slot'}.` });
  const lk = luck(p);
  if (lk?.kind === 'good') r.push({ kind: 'good', text: `Buy-low: ${lk.items.filter(i => i.dir === 'low').map(i => `${i.label} ${i.diff} vs career`).join(', ')}. Production should rebound.` });
  if (lk?.kind === 'bad') r.push({ kind: 'warn', text: `Luck-inflated: ${lk.items.filter(i => i.dir === 'high').map(i => `${i.label} ${i.diff}`).join(', ')}.` });
  const tr = trend(p);
  const tf = tr?.flags?.find(f => f.kind === 'good' || f.kind === 'bad');
  if (tf) r.push({ kind: tf.kind === 'good' ? 'good' : 'warn', text: tf.text });
  const team = D.teams[p.team];
  if (team?.env === 'High-event' && p.pos !== 'G') r.push({ kind: 'good', text: `Plays in a high-event environment (${team.abbrev}), which boosts counting stats.` });
  return r;
}

function gamesIn(team, weekIdx) { return D.teamGamesByWeek[team]?.[weekIdx] || 0; }
function playoffGames(team) { return playoffWeeks().reduce((s, w) => s + gamesIn(team, w - 1), 0); }

function sharesSlot(a, b) {
  if (a.pos === 'G' || b.pos === 'G') return a.pos === b.pos;
  if (a.elig.some(e => b.elig.includes(e))) return true;
  return (state.league.slots.UTIL || 0) > 0;   // any skater can fill UTIL
}

function dropReason(d) {
  if (d.offRoster) return `${d.name} is no longer on an NHL roster (since ${d.offSince}).`;
  const i = injuryInfo(d);
  if (i && (i.games ?? 0) >= LONG_INJURY_GAMES) return `${d.name} is ${i.label.toLowerCase()} (~${i.games} games).`;
  const lk = luck(d);
  if (lk?.kind === 'bad') return `${d.name} carries regression risk (${lk.verdict.toLowerCase()}).`;
  if (d.role?.security === 'Low') return `${d.name}'s role is under threat.`;
  return `${d.name} is your lowest-value player at a shared position (${fmt.num(v(d), 1)}).`;
}

let cached = null;
subscribe(() => { cached = null; });

export function rosterSuggestions() {
  if (!cached) cached = buildRosterSuggestions();
  return cached;
}

function buildRosterSuggestions() {
  const ids = committed();
  const all = ids.map(id => D.byId.get(id)).filter(p => p?.proj);
  const dead = all.filter(p => !usable(p));      // e.g. goalies in a league with 0 G slots
  const mine = all.filter(p => usable(p));
  if (mine.length < 5) return { ready: false, items: [] };
  const weak = catProfile(ids);
  const fa = freeAgents().sort((a, b) => v(b) - v(a)).slice(0, 200);
  const items = [];
  const nextW = Math.min(D.weeks.length - 1, currentWeekIndex() + 1);

  // 0. players who can never score in this league's lineup
  const usedReps = new Set();
  for (const p of dead) {
    const rep = fa.find(c => usable(c) && !usedReps.has(c.id));
    if (rep) usedReps.add(rep.id);
    items.push({
      id: `dead:${p.id}`, type: 'Unusable', title: `Drop ${p.name}${rep ? `, add ${rep.name}` : ''}`, score: 20, players: rep ? [p, rep] : [p],
      ops: rep ? [{ type: 'drop', id: p.id }, { type: 'add', id: rep.id }] : [{ type: 'drop', id: p.id }],
      reasons: [
        { kind: 'bad', text: `Your league has no starting slot for a ${p.pos} (League → Roster positions), so ${p.name} can never score for you and only uses a roster spot.` },
        rep ? { kind: 'good', text: `Best available player who fits your lineup: ${rep.name} (${rep.elig.join('/')}, value ${fmt.num(v(rep), 1)}).` } : null,
        { kind: 'info', text: 'If your league does use this position, fix the roster slots in League settings instead.' },
      ].filter(Boolean),
    });
  }

  // 1. add/drop upgrades
  const usedDrops = new Set();
  for (const c of fa) {
    const drops = mine.filter(d => !usedDrops.has(d.id) && sharesSlot(c, d)).sort((a, b) => v(a) - v(b));
    const d = drops[0];
    if (!d) continue;
    const gain = v(c) - v(d);
    if (gain < gainThreshold()) continue;
    usedDrops.add(d.id);
    const after = ids.filter(x => x !== d.id).concat(c.id);
    const reasons = [
      { kind: 'good', text: `${fmt.signed(gain, pts() ? 0 : 2)} value over ${d.name} under your league scoring.` },
      ...catDeltaReasons(ids, after, weak),
      ...roleReasons(c),
      { kind: 'info', text: `Why drop: ${dropReason(d)}` },
    ];
    const pg = playoffGames(c.team) - playoffGames(d.team);
    if (pg) reasons.push({ kind: pg > 0 ? 'good' : 'warn', text: `${fmt.signed(pg)} games in your playoff weeks.` });
    if (c.own != null) reasons.push({ kind: 'info', text: `Rostered in ${fmt.num(c.own, 0)}% of ESPN leagues. Check they're free in yours.` });
    items.push({ id: `up:${c.id}:${d.id}`, type: 'Add / drop', title: `Add ${c.name}, drop ${d.name}`, score: gain * (pts() ? 0.1 : 3), reasons, ops: [{ type: 'add', id: c.id }, { type: 'drop', id: d.id }], players: [c, d] });
    if (items.length >= 6) break;
  }

  // 2. sell-high: valuable rostered players whose production looks unsustainable
  for (const p of mine) {
    const lk = luck(p);
    const tf = trend(p)?.flags?.find(f => f.kind === 'bad');
    if (!(lk?.kind === 'bad' || tf) || v(p) <= 0) continue;
    const reasons = [];
    if (lk?.kind === 'bad') lk.items.filter(i => i.dir === 'high').forEach(i => reasons.push({ kind: 'warn', text: `${i.label} ${i.val} vs career ${i.norm} (${i.diff}). ${i.note}` }));
    if (tf) reasons.push({ kind: 'warn', text: tf.text });
    const elite = valueOf(p).rank <= state.league.teams;
    reasons.push({ kind: 'info', text: elite
      ? `Still a top-${state.league.teams} asset (#${valueOf(p).rank}). Keep them unless an offer pays full elite value; just expect some cooling.`
      : `Current value rank #${valueOf(p).rank}. Trade while name value is high; target a buy-low player of similar value.` });
    items.push({ id: `sell:${p.id}`, type: elite ? 'Regression watch' : 'Sell high', title: elite ? `Expect ${p.name} to cool off` : `Shop ${p.name}`, score: 2 + v(p) * (pts() ? 0.02 : 0.3), reasons, players: [p] });
  }

  // 3. buy-low trade targets (may be on other teams in your league)
  const myIds = new Set(ids);
  const buys = D.players.filter(p => p.proj && !myIds.has(p.id) && luck(p)?.kind === 'good' && valueOf(p)?.rank <= state.league.teams * 8)
    .sort((a, b) => v(b) - v(a)).slice(0, 4);
  const un = unavailableIds();
  const draftedBy = new Map(state.draft.picks.map((pk, i) => [pk.id, i + 1]));
  for (const p of buys) {
    const lk = luck(p);
    const owned = un.has(p.id);
    items.push({
      id: `buy:${p.id}`, type: owned ? 'Buy low (trade)' : 'Buy low (available)',
      title: owned ? `Trade for ${p.name}` : `Pick up ${p.name}`, score: 1.5 + v(p) * (pts() ? 0.02 : 0.25), players: [p],
      ops: owned ? null : [{ type: 'add', id: p.id }],
      reasons: [
        owned
          ? { kind: 'info', text: draftedBy.has(p.id) ? `On another team in your league (drafted at pick ${draftedBy.get(p.id)}): a trade target, not a free agent.` : 'Marked as taken in your league: a trade target.' }
          : { kind: 'good', text: 'Not drafted or marked taken in your league, so you may be able to add them directly.' },
        ...lk.items.filter(i => i.dir === 'low').map(i => ({ kind: 'good', text: `${i.label} ${i.val} vs career ${i.norm} (${i.diff}). ${i.note}` })),
        ...roleReasons(p).filter(r => !r.text.startsWith('Buy-low')),
        { kind: 'info', text: `Your league rank #${valueOf(p).rank}. The owner may value them on last season's box score.` },
      ],
    });
  }

  // 4. injuries on my roster
  for (const p of mine) {
    const i = injuryInfo(p);
    if (!i || (i.games ?? (i.status === 'Injured Reserve' ? 99 : 0)) < LONG_INJURY_GAMES) continue;
    const rep = fa.find(c => c.elig.some(e => p.elig.includes(e)));
    const reasons = [
      { kind: 'bad', text: `${i.label}${i.type ? ` (${i.type})` : ''}: ${i.ret ? `expected back ${fmt.day(i.ret)}, ~${i.games} games` : 'no return timeline'}.` },
      { kind: i.cliff === 'High' ? 'bad' : 'info', text: `Usage-cliff risk on return: ${i.cliff}. ${i.why}` },
    ];
    if (state.league.slots.IR) reasons.push({ kind: 'good', text: `Your league has ${state.league.slots.IR} IR slot(s): stash rather than drop.` });
    if (rep) reasons.push({ kind: 'info', text: `Best available fill-in at ${p.elig.join('/')}: ${rep.name} (value ${fmt.num(v(rep), 1)}).` });
    items.push({ id: `inj:${p.id}:${i.ret || ''}`, type: 'Injury', title: `${p.name}: ${state.league.slots.IR ? 'move to IR' : 'replace'}${rep ? ` and add ${rep.name}` : ''}`, score: 4, reasons, ops: rep ? [{ type: 'add', id: rep.id }] : null, players: rep ? [p, rep] : [p] });
  }

  // 5. streamers for next week (4-game teams)
  const nw = D.weeks[nextW];
  if (nw) {
    const heavy = fa.filter(p => p.pos !== 'G' && gamesIn(p.team, nextW) >= 4).slice(0, 3);
    const low = mine.filter(p => p.pos !== 'G' && gamesIn(p.team, nextW) <= 2).sort((a, b) => v(a) - v(b));
    heavy.forEach((p, k) => {
      // only stream over a player of comparable value, never a core piece
      const d = low[k] && v(low[k]) <= v(p) + gainThreshold() ? low[k] : null;
      const days = nw.games.filter(g => g.h === p.team || g.a === p.team).map(g => fmt.day(g.d, { weekday: 'short' })).join(', ');
      items.push({
        id: `stream:${nextW}:${p.id}`, type: 'Streamer', title: `Stream ${p.name} in week ${nw.n}`, score: 1.2 + k * -0.1, players: d ? [p, d] : [p],
        ops: d ? [{ type: 'add', id: p.id }, { type: 'drop', id: d.id }] : [{ type: 'add', id: p.id }],
        reasons: [
          { kind: 'good', text: `${p.team} plays ${gamesIn(p.team, nextW)} games in week ${nw.n} (${days}).` },
          d ? { kind: 'info', text: `${d.name}'s team plays only ${gamesIn(d.team, nextW)} and has similar value. Swapping gains ${gamesIn(p.team, nextW) - gamesIn(d.team, nextW)} player-games.` }
            : { kind: 'info', text: 'None of your low-value players is a like-for-like drop. Use an open bench spot, or skip if your roster is full of keepers.' },
          ...roleReasons(p).slice(0, 2),
        ].filter(Boolean),
      });
    });
  }

  // 6. playoff-schedule swaps: rostered player with a light playoff schedule vs a similar-value free agent with more games
  const avgPo = playoffWeeks().length * 3.5;
  for (const p of mine.filter(p => playoffGames(p.team) <= avgPo - 2).sort((a, b) => playoffGames(a.team) - playoffGames(b.team)).slice(0, 2)) {
    const alt = fa.find(c => sharesSlot(c, p) && v(c) >= v(p) * (v(p) > 0 ? 0.85 : 1.15) && playoffGames(c.team) >= playoffGames(p.team) + 2);
    if (!alt) continue;
    items.push({
      id: `po:${p.id}:${alt.id}`, type: 'Playoff schedule', title: `Swap ${p.name} for ${alt.name} before your playoffs`, score: 1, players: [alt, p],
      ops: [{ type: 'add', id: alt.id }, { type: 'drop', id: p.id }],
      reasons: [
        { kind: 'warn', text: `${p.team} plays only ${playoffGames(p.team)} games in your playoff weeks (${playoffWeeks().join(', ')}).` },
        { kind: 'good', text: `${alt.team} plays ${playoffGames(alt.team)}, with similar value (${fmt.num(v(alt), 1)} vs ${fmt.num(v(p), 1)}).` },
        { kind: 'info', text: 'Best made just before the trade deadline or playoff start; no need to act yet in October.' },
      ],
    });
  }

  // 7. division/conference overload
  const b = balance(ids);
  const L = state.league;
  for (const [div, n] of Object.entries(b.div)) {
    if (b.n < 6 || n / b.n * 100 <= L.divWarn) continue;
    const inDiv = mine.filter(p => D.teams[p.team]?.division === div).sort((a, b) => v(a) - v(b));
    const d = inDiv[0];
    const alt = d && fa.find(c => sharesSlot(c, d) && D.teams[c.team]?.division !== div && v(c) >= v(d));
    items.push({
      id: `bal:${div}:${d?.id}`, type: 'Balance', title: alt ? `Diversify: swap ${d.name} for ${alt.name}` : `Too many ${div} players`, score: 0.8, players: alt ? [alt, d] : inDiv,
      ops: alt ? [{ type: 'add', id: alt.id }, { type: 'drop', id: d.id }] : null,
      reasons: [
        { kind: 'warn', text: `${n} of ${b.n} rostered players (${fmt.num(n / b.n * 100, 0)}%) are in the ${div} division, over your ${L.divWarn}% limit.` },
        { kind: 'info', text: 'Division rivals play each other often: shared game nights, and one team’s slump or goalie hot streak hits several of your players at once.' },
        alt ? { kind: 'good', text: `${alt.name} (${alt.team}, ${D.teams[alt.team]?.division}) is equal or better value (${fmt.num(v(alt), 1)} vs ${fmt.num(v(d), 1)}).` } : null,
      ].filter(Boolean),
    });
  }

  const dismissed = new Set(state.suggest?.dismissed || []);
  return { ready: true, weak, items: items.filter(s => !dismissed.has(s.id)).sort((a, b) => b.score - a.score) };
}

// ---- draft: recommended pick(s) now
export function draftSuggestions(ds, avail) {
  const L = state.league;
  if (ds.full) return [];
  const { open } = allocate([...ds.mine].sort((a, b) => v(b) - v(a)));
  const slotLabel = k => ({ F: 'F (forward)', UTIL: 'UTIL (any skater)', BN: 'bench' }[k] || k);
  const filled = k => `${L.slots[k] - open[k]}/${L.slots[k]}`;
  const weak = ds.mine.length >= 4 ? catProfile(ds.mine.map(p => p.id)) : [];
  // where each candidate would go; players with no open slot at all are never suggested
  const placed = avail.slice(0, 150).map(p => ({ p, slot: pickSlot(p, open) })).filter(x => x.slot);
  // fill starting slots first; only when every starting slot is taken do bench picks come up
  const starters = placed.filter(x => START_SLOTS.includes(x.slot));
  const pool = (starters.length ? starters : placed).slice(0, 40);
  const cands = pool.map(x => x.p);
  const slotOf = new Map(pool.map(x => [x.p.id, x.slot]));
  const top = v(cands[0] || {}) || 1;
  const scored = cands.map(p => {
    const reasons = [];
    let s = v(p);
    const unit = pts() ? top * 0.06 : 0.5;
    const rank = cands.indexOf(p);
    if (rank === 0) reasons.push({ kind: 'good', text: 'Highest value left among players who fit an open slot on your roster.' });
    else reasons.push({ kind: 'info', text: `Value ${fmt.num(v(p), pts() ? 0 : 2)}, #${rank + 1} available.` });
    const slot = slotOf.get(p.id);
    if (slot === 'BN') reasons.push({ kind: 'info', text: `Your starting slots are full; this is a bench pick (bench ${filled('BN')}).` });
    else reasons.push({ kind: 'good', text: `Fills an open ${slotLabel(slot)} starting slot (${filled(slot)} filled).` });
    if (p.adp && ds.after && p.adp > ds.after + 3) { s -= unit; reasons.push({ kind: 'warn', text: `ESPN ADP ${fmt.num(p.adp, 0)} is after your following pick (#${ds.after}), so you can likely wait on them.` }); }
    else if (p.adp && ds.after && p.adp < ds.after) { s += unit * 0.5; reasons.push({ kind: 'good', text: `Won't last: ADP ${fmt.num(p.adp, 0)} comes before your following pick (#${ds.after}).` }); }
    const an = adpNote(p);
    if (an?.kind === 'discount') reasons.push({ kind: 'good', text: an.text + '.' });
    if (p.role?.pp === 'PP1' && p.pos === 'C') { s += unit * 0.3; reasons.push({ kind: 'good', text: 'PP1 center: the scarcest skater archetype.' }); }
    if (p.pos === 'D' && p.role?.pp === 'PP1') { s += unit * 0.3; reasons.push({ kind: 'good', text: 'PP1 quarterback D: few of these exist.' }); }
    if (weak.length && p.pos !== 'G') {
      const helps = weak.slice(0, 3).filter(w => w.ratio < 0.97 && (valueOf(p)?.z?.[w.key] ?? 0) > 0.8);
      if (helps.length) { s += unit * 0.4 * helps.length; reasons.push({ kind: 'good', text: `Strong in your weakest categories: ${helps.map(h => h.label).join(', ')}.` }); }
    }
    const i = injuryInfo(p);
    if (i) { s -= unit * ((i.games ?? 10) / 10); reasons.push({ kind: 'bad', text: `${i.label}${i.games != null ? `, ~${i.games} games out` : ''}.` }); }
    const lk = luck(p);
    if (lk?.kind === 'bad') { s -= unit * 0.4; reasons.push({ kind: 'warn', text: `Regression risk: ${lk.items.filter(x => x.dir === 'high').map(x => x.label).join(', ')} above career norms.` }); }
    if (lk?.kind === 'good') { s += unit * 0.3; reasons.push({ kind: 'good', text: 'Buy-low: last season was unlucky vs career norms.' }); }
    return { p, s, reasons };
  });
  return scored.sort((a, b) => b.s - a.s).slice(0, 3);
}
