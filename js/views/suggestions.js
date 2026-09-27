// Suggestions view: automatic recommendations with the reasoning behind each.
import { D } from '../data.js';
import { esc, fmt } from '../format.js';
import { state, update } from '../store.js';
import { rosterSuggestions } from '../suggest.js';
import { plink, teamChip, injBadge, posLabel, toast } from '../ui.js';
import { addOp } from '../roster.js';
import { valueOf } from '../value.js';

const reason = r => `<li class="r-${r.kind}">${esc(r.text)}</li>`;

export function card(s) {
  return `<article class="card sugg">
    <div class="row between wrap"><div><span class="stype">${esc(s.type)}</span><h4>${esc(s.title)}</h4></div>
      <div class="btnrow">
        ${s.ops ? `<button class="primary sm" data-action="sg-try" data-sid="${esc(s.id)}">Try in sandbox</button>` : ''}
        ${s.type === 'Add / drop' || s.type === 'Streamer' || s.type === 'Playoff schedule' ? `<button class="sm" data-action="sg-taken" data-id="${s.players[0].id}" title="This player is already on another team in my league">Taken in my league</button>` : ''}
        <button class="sm" data-action="sg-dismiss" data-sid="${esc(s.id)}">Dismiss</button>
      </div></div>
    <div class="splayers">${s.players.map(p => `<span>${plink(p)} ${teamChip(p.team)} <span class="muted tiny">${posLabel(p)} · val ${fmt.num(valueOf(p)?.vorp, 1)}</span> ${injBadge(p)}</span>`).join('')}</div>
    <ul class="reasons">${s.reasons.map(reason).join('')}</ul>
  </article>`;
}

let lastItems = [];

export function render() {
  const res = rosterSuggestions();
  lastItems = res.items;
  const sg = state.suggest;
  const head = `<div class="view-head row between wrap"><div><h1>Suggestions</h1>
    <p class="muted">Recalculated automatically from your committed roster, league scoring, schedule, injuries and luck indicators whenever data or settings change. Each one explains why.</p></div>
    <div class="btnrow">
      <label class="small"><input type="checkbox" data-change="sg-hideowned" ${sg.hideOwned ? 'checked' : ''}> Hide players owned in 85%+ of ESPN leagues</label>
      ${sg.dismissed.length || sg.taken.length ? `<button class="sm" data-action="sg-reset">Restore ${sg.dismissed.length} dismissed / ${sg.taken.length} taken</button>` : ''}
    </div></div>
    <p class="tiny muted">The app can’t see other teams’ rosters in your league. Players drafted by others on the Draft board are excluded automatically; use “Taken in my league” for the rest.</p>`;
  if (!res.ready) {
    return `${head}<section class="card"><p>Suggestions need your roster (at least 5 players). Draft in <a href="#draft">Draft mode</a> (it shows a suggested pick there), or paste your roster in <a href="#commit">Commit → Sync with league</a>.</p></section>`;
  }
  const weak = res.weak.slice(0, 3).filter(w => w.ratio < 1);
  const er = state.espn.myRoster || [];
  const cm = new Set(state.roster.committed);
  const espnDiff = er.length && (er.length !== cm.size || er.some(id => !cm.has(id)));
  const strong = res.weak.slice(-3).reverse().filter(w => w.ratio > 1);
  return `${head}
    ${espnDiff ? `<section class="card flag warn"><b>Your ESPN roster differs from the committed roster here</b> (${er.length} on ESPN vs ${cm.size} here). <button class="sm" data-action="espn-roster">Use my ESPN roster</button></section>` : ''}
    <section class="card"><h3>Your category profile</h3>
      <p class="small">Compared with an average team in a ${state.league.teams}-team league:
      ${weak.length ? `weakest <b>${weak.map(w => `${w.label} (${fmt.num(Math.abs(w.ratio) * 100, 0)}%)`).join(', ')}</b>` : 'no weak categories'}${strong.length ? `; strongest ${strong.map(w => `${w.label} (${fmt.num(Math.abs(w.ratio) * 100, 0)}%)`).join(', ')}` : ''}.
      Suggestions that lift weak categories get priority.</p></section>
    ${res.items.length ? res.items.map(card).join('') : '<section class="card"><p class="muted">No suggestions right now. Your roster beats every available option by your league’s scoring.</p></section>'}`;
}

export const count = () => { try { return rosterSuggestions().items.length; } catch { return 0; } };

export const actions = {
  'sg-try': (_, el) => {
    const s = lastItems.find(x => x.id === el.dataset.sid);
    if (!s?.ops) return;
    s.ops.forEach(o => addOp(o));
    toast('Staged in sandbox');
    location.hash = 'sandbox';
  },
  'sg-dismiss': (_, el) => update(st => { st.suggest.dismissed.push(el.dataset.sid); }),
  'sg-taken': id => { update(st => { st.suggest.taken.push(id); }); toast(`${D.byId.get(id).name} marked as taken`); },
  'sg-reset': () => update(st => { st.suggest.dismissed = []; st.suggest.taken = []; }),
};
