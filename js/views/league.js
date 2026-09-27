// League configuration: format, roster slots, categories + weights, playoff weeks.
import { D, playoffWeeks, buildWeeks } from '../data.js';
import { esc, fmt } from '../format.js';
import { state, update, CATS, SLOT_KEYS, resetLeague } from '../store.js';
import { valueOf } from '../value.js';
import { plink, posLabel } from '../ui.js';

export function render() {
  const L = state.league;
  const pts = L.format === 'points';
  const po = new Set(playoffWeeks());
  const top = D.players.filter(p => valueOf(p)).sort((a, b) => valueOf(a).rank - valueOf(b).rank).slice(0, 15);
  const catRows = g => CATS.filter(c => c.grp === g).map(c => {
    const cc = L.cats[c.key];
    return `<tr><td><label>${pts ? '' : `<input type="checkbox" data-change="cat-on:${c.key}" ${cc.on ? 'checked' : ''}> `}<b>${c.label}</b> <span class="muted small">${esc(c.name)}</span></label></td>
      <td>${pts ? `<input type="number" step="0.1" value="${cc.pts}" data-change="w:${c.key}" aria-label="${esc(c.name)} points">` : `<input type="number" step="0.1" value="${cc.w}" data-change="w:${c.key}" ${cc.on ? '' : 'disabled'} aria-label="${esc(c.name)} weight">`}</td></tr>`;
  }).join('');
  return `<div class="view-head row between wrap"><div><h1>League configuration</h1><p class="muted">Every value and ranking in the app is recalculated from these settings, live, including mid-draft.</p></div>
    <button data-action="league-reset" class="danger">Reset to defaults</button></div>
    <div class="cols2">
      <div>
        <section class="card">
          <h3>Format</h3>
          <div class="seg">${[['h2hcat', 'Head-to-head categories'], ['roto', 'Rotisserie (season-long)'], ['points', 'Head-to-head points']].map(([v, l]) => `<label><input type="radio" name="fmt" value="${v}" data-change="league:format" ${L.format === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>
          <div class="formgrid">
            <label>League name <input type="text" value="${esc(L.name)}" data-change="league:name"></label>
            <label>Teams <input type="number" min="4" max="32" value="${L.teams}" data-change="league:teams"></label>
            <label>Your draft slot <input type="number" min="1" max="${L.teams}" value="${L.draftSlot}" data-change="league:draftSlot"></label>
            <label>League URL <input type="url" placeholder="https://…" value="${esc(L.url)}" data-change="league:url"></label>
          </div>
        </section>
        <section class="card">
          <h3>Roster positions</h3>
          <div class="slots">${SLOT_KEYS.map(k => `<label><span>${k === 'F' ? 'F (C/LW/RW)' : k === 'UTIL' ? 'UTIL (any skater)' : k === 'BN' ? 'Bench' : k}</span><input type="number" min="0" max="10" value="${L.slots[k] || 0}" data-change="slot:${k}"></label>`).join('')}</div>
        </section>
        <section class="card">
          <h3>${pts ? 'Points per stat' : 'Scoring categories & weights'}</h3>
          <p class="tiny muted">${pts ? 'Negative values subtract (e.g. GA −2).' : 'Weight 1 = standard, in steps of 0.1. Raise to prioritize, e.g. 0.5 to de-emphasize, untick to ignore (punt). Ratio categories (SV%, GAA) are weighted by volume.'}</p>
          <div class="cols2 tight"><table class="cats"><thead><tr><th>Skaters</th><th>${pts ? 'Pts' : 'Weight'}</th></tr></thead><tbody>${catRows('S')}</tbody></table>
          <table class="cats"><thead><tr><th>Goalies</th><th>${pts ? 'Pts' : 'Weight'}</th></tr></thead><tbody>${catRows('G')}</tbody></table></div>
        </section>
      </div>
      <div>
        <section class="card">
          <h3>Schedule & playoffs</h3>
          <label class="small">Fantasy week starts <select data-change="league:weekStart">${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((d, i) => `<option value="${i}" ${L.weekStart === i ? 'selected' : ''}>${d}</option>`).join('')}</select></label>
          <p class="small">Playoff weeks <span class="muted tiny">(${L.playoffWeeks?.length ? 'custom' : 'default: last 3'})</span></p>
          <div class="weekpick">${D.weeks.slice(-10).map(w => `<label title="${fmt.day(w.start)} – ${fmt.day(w.end)}"><input type="checkbox" data-change="po-week" value="${w.n}" ${po.has(w.n) ? 'checked' : ''}> ${w.n}<span class="tiny muted">${fmt.day(w.start, { day: 'numeric', month: 'numeric' })}</span></label>`).join('')}</div>
        </section>
        <section class="card">
          <h3>Roster balance warnings</h3>
          <div class="formgrid">
            <label>Max % in one division <input type="number" min="10" max="100" value="${L.divWarn}" data-change="league:divWarn"></label>
            <label>Max % in one conference <input type="number" min="50" max="100" value="${L.confWarn}" data-change="league:confWarn"></label>
          </div>
        </section>
        <section class="card">
          <h3>Player profiles</h3>
          <label class="small"><input type="checkbox" data-change="proj-only-scored" ${L.projOnlyScored !== false ? 'checked' : ''}> Projections: only show stats my league scores</label>
          <p class="tiny muted">Goals, assists, points and ice time are always projected. PIM, hits, blocks, PPP, SOG, +/-, faceoffs (and goalie W, SV%, GAA, SO) appear only when scored above. Past seasons always show everything.</p>
        </section>
        <section class="card">
          <h3>Goalie volatility discount</h3>
          <label class="small">Reduce goalie value by <input type="number" min="0" max="80" step="5" value="${L.goalieDiscount ?? 25}" data-change="league:goalieDiscount"> %</label>
          <p class="tiny muted">Save % and wins swing more year to year than any skater stat, so raw z-scores overrate goalies relative to where they are drafted. 0 = trust the projection fully.</p>
        </section>
        <section class="card">
          <h3>Top 15 under these settings</h3>
          <ol class="toplist">${top.map(p => `<li>${plink(p)} <span class="muted tiny">${posLabel(p)} · ${p.team}</span> <b class="num">${fmt.num(valueOf(p).vorp, pts ? 0 : 2)}</b></li>`).join('')}</ol>
        </section>
      </div>
    </div>`;
}

export function onChange(key, el) {
  const [kind, name] = key.split(':');
  const num = v => (v === '' || Number.isNaN(+v) ? 0 : +v);
  if (kind === 'league') {
    const numeric = ['teams', 'draftSlot', 'weekStart', 'divWarn', 'confWarn', 'goalieDiscount'];
    update(s => { s.league[name] = numeric.includes(name) ? num(el.value) : el.value; }, { render: !['name', 'url'].includes(name) });
    if (name === 'weekStart') { buildWeeks(); update(s => { s.league.playoffWeeks = null; }); }
  }
  if (key === 'proj-only-scored') update(s => { s.league.projOnlyScored = el.checked; });
  if (kind === 'slot') update(s => { s.league.slots[name] = num(el.value); });
  if (kind === 'cat-on') update(s => { s.league.cats[name].on = el.checked; });
  if (kind === 'w') update(s => { s.league.cats[name][s.league.format === 'points' ? 'pts' : 'w'] = num(el.value); });
  if (kind === 'po-week') {
    update(s => {
      const set = new Set(playoffWeeks());
      el.checked ? set.add(+el.value) : set.delete(+el.value);
      s.league.playoffWeeks = [...set].sort((a, b) => a - b);
    });
  }
}

export const actions = {
  'league-reset': () => { if (confirm('Reset league settings to defaults?')) { resetLeague(); buildWeeks(); } },
};
