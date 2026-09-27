// Draft mode: best available by position under custom scoring, value vs ADP, scarcity warnings, live weights.
import { D } from '../data.js';
import { esc, fmt } from '../format.js';
import { state, update, CATS } from '../store.js';
import { valueOf, adpNote, computeValues } from '../value.js';
import { plink, teamChip, injBadge, ppChip, posLabel, toast } from '../ui.js';
import { draftSuggestions } from '../suggest.js';

const POS = ['C', 'LW', 'RW', 'D', 'G'];

function snake(T, slot) {
  return n => { const r = Math.ceil(n / T); return r % 2 ? (r - 1) * T + slot : (r - 1) * T + (T - slot + 1); };
}

export function draftState() {
  const T = state.league.teams;
  const picks = state.draft.picks;
  const cur = picks.length + 1;
  const pickOfRound = snake(T, Math.min(T, Math.max(1, state.league.draftSlot)));
  let next = null;
  for (let r = 1; r < 60; r++) { const n = pickOfRound(r); if (n >= cur) { next = n; break; } }
  let after = null;
  for (let r = 1; r < 60; r++) { const n = pickOfRound(r); if (n > next) { after = n; break; } }
  const taken = new Set(picks.map(p => p.id));
  const mine = picks.filter(p => p.me).map(p => D.byId.get(p.id)).filter(Boolean);
  return { T, cur, round: Math.ceil(cur / T), next, after, taken, mine };
}

function available(taken) {
  return D.players.filter(p => p.proj && !taken.has(p.id) && valueOf(p)).sort((a, b) => valueOf(b).vorp - valueOf(a).vorp);
}

function row(p, ds, showPos = true) {
  const v = valueOf(p);
  const n = adpNote(p);
  const gone = p.adp && ds.next && p.adp < ds.next - 0.5 && ds.next !== ds.cur;
  return `<tr class="${gone ? 'likely-gone' : ''}">
    <td class="num muted">${v.rank}</td>
    <td>${plink(p)} ${injBadge(p)} ${ppChip(p.role)}</td>
    <td>${teamChip(p.team)}</td>
    ${showPos ? `<td>${posLabel(p)}</td>` : ''}
    <td class="num strong">${fmt.num(v.vorp, state.league.format === 'points' ? 0 : 2)}</td>
    <td class="num">${p.adp ? fmt.num(p.adp, 1) : '—'}</td>
    <td>${n ? `<span class="adp ${n.kind}" title="${esc(n.text)}">${n.kind === 'discount' ? `Discount ${fmt.signed(n.diff)}` : n.kind === 'reach' ? `Reach ${fmt.signed(n.diff)}` : '≈ ADP'}</span>` : ''}${gone ? '<span class="tiny muted" title="ADP is earlier than your next pick"> likely gone</span>' : ''}</td>
    <td class="btns"><button class="sm primary" data-action="draft-me" data-id="${p.id}" title="I drafted this player">Mine</button><button class="sm" data-action="draft-other" data-id="${p.id}" title="Another team drafted this player">Taken</button></td>
  </tr>`;
}

const head = (showPos = true) => `<thead><tr><th>#</th><th>Player</th><th>Team</th>${showPos ? '<th>Pos</th>' : ''}<th title="Value over replacement, your scoring">Value</th><th>ADP</th><th>vs ADP</th><th></th></tr></thead>`;

function scarcity(ds, avail) {
  const all = D.players.filter(p => p.proj);
  const groups = [
    ['True PP1 centers', p => p.pos === 'C' && p.role?.pp === 'PP1'],
    ['Top-line wingers', p => (p.pos === 'LW' || p.pos === 'RW') && p.role?.slot === 'Line 1'],
    ['Top-pair D', p => p.pos === 'D' && p.role?.slot === 'Pair 1'],
    ['PP1 quarterback D', p => p.pos === 'D' && p.role?.pp === 'PP1'],
    ['Starting goalies', p => p.role?.slot === 'Starter'],
  ];
  const T = ds.T;
  const roundsDone = Math.max(1, (ds.cur - 1) / T);
  const picksUntilNext = ds.next ? ds.next - ds.cur : 0;
  const out = [];
  for (const [label, fn] of groups) {
    const total = all.filter(fn).length;
    const left = avail.filter(fn);
    const takenN = total - left.length;
    const pace = takenN / roundsDone;
    const roundsLeft = pace ? left.length / pace : Infinity;
    let lvl = 'ok', msg = `${left.length} of ${total} left`;
    if (left.length <= Math.ceil(T / 3)) { lvl = 'bad'; msg += '. Nearly gone'; }
    else if (roundsLeft <= 2.5 || left.length <= T * 0.75) { lvl = 'warn'; msg += `. At ${fmt.num(pace, 1)}/round, gone in ~${fmt.num(roundsLeft, 1)} rounds`; }
    out.push({ label, lvl, msg, top: left.slice(0, 3) });
  }
  // tier breaks: value you'd expect to still find at your next pick vs the best available now
  const tiers = [];
  for (const pos of POS) {
    const pl = avail.filter(p => p.elig.includes(pos));
    if (pl.length < 2) continue;
    const best = valueOf(pl[0]).vorp;
    const expected = pl[Math.min(pl.length - 1, Math.round(picksUntilNext / POS.length))];
    const ev = valueOf(expected).vorp;
    const drop = best - ev;
    const scale = Math.abs(best) || 1;
    if (picksUntilNext > 0 && drop / scale > 0.25 && drop > (state.league.format === 'points' ? 15 : 0.6)) {
      tiers.push(`${pos}: best now ${pl[0].name} (${fmt.num(best, 1)}); by your next pick expect about ${expected.name} (${fmt.num(ev, 1)})`);
    }
  }
  return { out, tiers };
}

function needs(ds) {
  const slots = state.league.slots;
  const have = {};
  for (const p of ds.mine) for (const e of p.elig) have[e] = (have[e] || 0) + 1;
  return POS.map(pos => {
    const need = (slots[pos] || 0);
    const got = have[pos] || 0;
    return `<span class="need ${got >= need ? 'met' : ''}">${pos} ${got}/${need}</span>`;
  }).join('');
}

function weightsPanel() {
  const L = state.league;
  const pts = L.format === 'points';
  const cats = CATS.filter(c => pts ? L.cats[c.key].pts : L.cats[c.key].on);
  return `<div class="weights">${cats.map(c => `<label title="${esc(c.name)}"><span>${c.label}</span>
    <input type="number" step="${pts ? 0.1 : 0.25}" value="${pts ? L.cats[c.key].pts : L.cats[c.key].w}" data-change="w:${c.key}" aria-label="${esc(c.name)} weight"></label>`).join('')}</div>
    <p class="tiny muted">${pts ? 'Points per stat' : 'Category weights (1 = normal, 0 = punt)'}. Rankings update as you type. Full settings in League.</p>`;
}

function suggestedPicks(ds, avail) {
  const sug = draftSuggestions(ds, avail);
  if (!sug.length) return '';
  return `<section class="card sugg-pick"><h3>Suggested pick${ds.next === ds.cur ? ' (you’re on the clock)' : ` for #${ds.next}`}</h3>
    <div class="spicks">${sug.map((x, i) => `<div class="spick ${i === 0 ? 'best' : ''}">
      <div class="row between"><div>${i === 0 ? '<span class="stype">Best fit</span>' : `<span class="stype alt">Alt ${i}</span>`} ${plink(x.p)} ${teamChip(x.p.team)} <span class="muted tiny">${posLabel(x.p)}</span></div>
      <button class="sm primary" data-action="draft-me" data-id="${x.p.id}">Draft</button></div>
      <ul class="reasons">${x.reasons.map(r => `<li class="r-${r.kind}">${esc(r.text)}</li>`).join('')}</ul></div>`).join('')}</div>
  </section>`;
}

export function render() {
  computeValues();
  const ds = draftState();
  const avail = available(ds.taken);
  const f = state.ui.draftFilter || '';
  const visible = f ? avail.filter(p => p.name.toLowerCase().includes(f.toLowerCase())) : avail;
  const sc = scarcity(ds, avail);
  const last = state.draft.picks.at(-1);
  return `<div class="view-head row between wrap">
      <div><h1>Draft mode</h1><p class="muted">Ranked by your league scoring, not ADP. ADP from ESPN (${D.players.filter(p => p.adp).length} players).</p></div>
      <div class="draftbar">
        <div><span class="muted small">Pick</span> <b>${ds.cur}</b> <span class="muted small">(round ${ds.round})</span></div>
        <div><span class="muted small">Your next</span> <b>${ds.next ?? '—'}</b>${ds.next === ds.cur ? ' <span class="badge good">On the clock</span>' : ` <span class="muted small">in ${ds.next - ds.cur} picks</span>`}</div>
        <label class="small">Your slot <input type="number" min="1" max="${ds.T}" value="${state.league.draftSlot}" data-change="draft-slot" style="width:4em"></label>
        <button data-action="draft-undo" ${last ? '' : 'disabled'}>Undo${last ? ` ${esc(D.byId.get(last.id)?.name.split(' ').at(-1) || '')}` : ''}</button>
        <button data-action="draft-reset" class="danger">Reset</button>
      </div>
    </div>

    <div class="draft-grid">
      <div>
        ${suggestedPicks(ds, avail)}
        <section class="card">
          <div class="row between wrap"><h3>Best available overall</h3><input type="search" placeholder="Find player…" value="${esc(f)}" data-change="draft-filter" aria-label="Find player"></div>
          <div class="tablewrap"><table class="grid compact">${head()}<tbody>${visible.slice(0, 25).map(p => row(p, ds)).join('')}</tbody></table></div>
        </section>
        <div class="posgrid">
          ${POS.map(pos => `<section class="card"><h3>${pos}</h3><div class="tablewrap"><table class="grid compact">${head(false)}<tbody>${avail.filter(p => p.elig.includes(pos)).slice(0, 8).map(p => row(p, ds, false)).join('')}</tbody></table></div></section>`).join('')}
        </div>
      </div>
      <aside>
        <section class="card">
          <h3>Scarcity warnings</h3>
          <ul class="plain scarcity">${sc.out.map(s => `<li class="${s.lvl}"><b>${s.label}</b>: ${esc(s.msg)}${s.top.length ? `<div class="tiny muted">Best left: ${s.top.map(p => esc(p.name)).join(', ')}</div>` : ''}</li>`).join('')}</ul>
          ${sc.tiers.length ? `<h4>Tier breaks before your next pick</h4><ul class="plain">${sc.tiers.map(t => `<li class="flag warn">${esc(t)}</li>`).join('')}</ul>` : ''}
        </section>
        <section class="card">
          <h3>Live scoring weights</h3>
          ${weightsPanel()}
        </section>
        <section class="card">
          <h3>My team <span class="muted small">(${ds.mine.length})</span></h3>
          <div class="needs">${needs(ds)}</div>
          <ul class="plain">${ds.mine.map(p => `<li>${plink(p)} <span class="muted tiny">${posLabel(p)} · ${p.team}</span></li>`).join('') || '<li class="muted small">No picks yet. “Mine” also adds the player to your committed roster.</li>'}</ul>
        </section>
      </aside>
    </div>`;
}

export const actions = {
  'draft-me': id => {
    update(s => { s.draft.picks.push({ id, me: true }); if (!s.roster.committed.includes(id)) s.roster.committed.push(id); });
    toast(`Drafted ${D.byId.get(id).name}`);
  },
  'draft-other': id => update(s => { s.draft.picks.push({ id, me: false }); }),
  'draft-undo': () => update(s => {
    const p = s.draft.picks.pop();
    if (p?.me) s.roster.committed = s.roster.committed.filter(x => x !== p.id);
  }),
  'draft-reset': () => {
    if (!confirm('Clear all draft picks? Players you drafted stay on your committed roster.')) return;
    update(s => { s.draft.picks = []; });
  },
};
