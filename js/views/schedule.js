// Games per week for every team + my roster, playoff weeks highlighted, game times in the chosen timezone.
import { D, playoffWeeks, currentWeekIndex } from '../data.js';
import { esc, fmt } from '../format.js';
import { state, update } from '../store.js';
import { teamChip } from '../ui.js';
import { committed, sandbox } from '../roster.js';

function rosterWeekly(ids) {
  const out = new Array(D.weeks.length).fill(0);
  for (const id of ids) {
    const p = D.byId.get(id);
    const tg = D.teamGamesByWeek[p?.team];
    if (tg) tg.forEach((n, i) => { out[i] += n; });
  }
  return out;
}

export function render() {
  const weeks = D.weeks;
  const po = new Set(playoffWeeks());
  const which = state.ui.schedRoster || 'committed';
  const ids = which === 'sandbox' ? sandbox() : committed();
  const mine = rosterWeekly(ids);
  // compare full weeks only (first/last weeks are often partial)
  const full = mine.filter((_, i) => i > 0 && i < weeks.length - 1);
  const avg = full.length ? full.reduce((a, b) => a + b, 0) / full.length : 0;
  const myTeams = new Set(ids.map(id => D.byId.get(id)?.team));
  const sel = state.ui.week ?? currentWeekIndex();
  const teams = Object.keys(D.teamGamesByWeek).sort((a, b) => {
    const pa = [...po].reduce((s, w) => s + (D.teamGamesByWeek[a][w - 1] || 0), 0);
    const pb = [...po].reduce((s, w) => s + (D.teamGamesByWeek[b][w - 1] || 0), 0);
    return pb - pa || a.localeCompare(b);
  });
  const hdr = weeks.map((w, i) => `<th class="${po.has(w.n) ? 'po' : ''} ${i === sel ? 'selw' : ''}" data-action="pick-week" data-w="${i}" title="${fmt.day(w.start)} – ${fmt.day(w.end)}">${po.has(w.n) ? 'PO ' : ''}${w.n}<div class="tiny muted">${fmt.day(w.start, { day: 'numeric', month: 'numeric' })}</div></th>`).join('');
  const myRow = ids.length ? `<tr class="myrow"><th>My roster <span class="tiny muted">(${which})</span></th>${mine.map((n, i) => {
    const low = i > 0 && i < weeks.length - 1 && n < avg * 0.85;
    const high = n > avg * 1.15;
    return `<td class="num ${low ? 'lowwk' : high ? 'highwk' : ''} ${po.has(weeks[i].n) ? 'po' : ''}" title="${low ? 'Fewer games than your average week' : ''}">${n}</td>`;
  }).join('')}<td class="num">${[...po].reduce((s, w) => s + (mine[w - 1] || 0), 0)}</td></tr>` : '';
  const rows = teams.map(t => `<tr class="${myTeams.has(t) ? 'mine' : ''}"><th>${teamChip(t)}</th>${D.teamGamesByWeek[t].map((n, i) => `<td class="num g${Math.min(n, 5)} ${po.has(weeks[i].n) ? 'po' : ''}">${n || ''}</td>`).join('')}<td class="num strong">${[...po].reduce((s, w) => s + (D.teamGamesByWeek[t][w - 1] || 0), 0)}</td></tr>`).join('');
  const lowWeeks = mine.map((n, i) => [n, i]).filter(([n, i]) => ids.length && i > 0 && i < weeks.length - 1 && n < avg * 0.85);
  const poLow = lowWeeks.filter(([, i]) => po.has(weeks[i].n));

  const w = weeks[sel];
  const days = {};
  for (const g of w?.games || []) (days[g.d] ||= []).push(g);

  return `<div class="view-head row between wrap">
      <div><h1>Schedule</h1><p class="muted">Games per fantasy week (weeks start ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][state.league.weekStart]}). Playoff weeks marked <span class="po-key">PO</span>. Times shown in <b>${esc(state.settings.tz)}</b> (${esc(fmt.tzLabel())}).</p></div>
      <div class="btnrow">
        <label class="small">Roster <select data-change="sched-roster"><option value="committed" ${which === 'committed' ? 'selected' : ''}>Committed</option><option value="sandbox" ${which === 'sandbox' ? 'selected' : ''}>Sandbox</option></select></label>
      </div>
    </div>
    ${ids.length ? `<section class="card">
      <p>Your roster averages <b>${fmt.num(avg, 1)}</b> player-games per full week.
      ${poLow.length ? `<span class="flag bad">Light playoff week${poLow.length > 1 ? 's' : ''}: ${poLow.map(([n, i]) => `wk ${weeks[i].n} (${n})`).join(', ')}</span>` : po.size ? '<span class="flag ok">No light playoff weeks.</span>' : ''}
      ${lowWeeks.length ? `<span class="small muted">Light weeks overall: ${lowWeeks.map(([n, i]) => `wk ${weeks[i].n} (${n})`).join(', ')}</span>` : ''}</p>
    </section>` : '<p class="muted">Add players to your roster to see your roster’s games per week.</p>'}
    <section class="card">
      <div class="tablewrap sched"><table class="grid sched"><thead><tr><th>Team</th>${hdr}<th title="Games in your playoff weeks">PO</th></tr></thead><tbody>${myRow}${rows}</tbody></table></div>
      <p class="tiny muted">Teams sorted by playoff-week games. Click a week number for its game list. Change playoff weeks in League settings.</p>
    </section>
    ${w ? `<section class="card">
      <div class="row between wrap"><h3>Week ${w.n}: ${fmt.day(w.start)} – ${fmt.day(w.end)}</h3>
        <div class="btnrow"><button data-action="pick-week" data-w="${Math.max(0, sel - 1)}">← Prev</button><button data-action="pick-week" data-w="${currentWeekIndex()}">Current</button><button data-action="pick-week" data-w="${Math.min(weeks.length - 1, sel + 1)}">Next →</button></div></div>
      <div class="days">${Object.entries(days).map(([d, gs]) => `<div class="day"><h4>${fmt.day(d)} <span class="muted tiny">${gs.length} game${gs.length > 1 ? 's' : ''}${gs.length <= 5 ? ' · light night' : ''}</span></h4>
        <ul class="plain">${gs.map(g => `<li class="${myTeams.has(g.h) || myTeams.has(g.a) ? 'mine' : ''}"><span class="gtime">${fmt.time(g.t)}</span> ${g.a} @ ${g.h}${fmt.localDay(g.t) !== fmt.day(d) ? ` <span class="tiny muted">(${fmt.localDay(g.t)} local)</span>` : ''}</li>`).join('')}</ul></div>`).join('')}</div>
    </section>` : ''}`;
}

export const actions = {
  'pick-week': (_, el) => update(s => { s.ui.week = +el.dataset.w; }),
};
