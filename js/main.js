import { D, loadData, refreshInjuries, buildWeeks } from './data.js';
import { state, update, subscribe } from './store.js';
import { esc, fmt } from './format.js';
import { $, onSortClick, toast } from './ui.js';
import { renderProfile } from './views/profile.js';
import { renderTeam } from './views/team.js';
import * as players from './views/players.js';
import * as draft from './views/draft.js';
import * as sandboxV from './views/sandbox.js';
import * as schedule from './views/schedule.js';
import * as league from './views/league.js';
import * as settings from './views/settings.js';
import { tzOptions } from './views/settings.js';

const VIEWS = {
  players: { label: 'Players', render: players.render },
  draft: { label: 'Draft', render: draft.render },
  sandbox: { label: 'Sandbox', render: sandboxV.render },
  commit: { label: 'Commit', render: sandboxV.renderCommit },
  schedule: { label: 'Schedule', render: schedule.render },
  league: { label: 'League', render: league.render },
  settings: { label: 'Display', render: settings.render },
};
const ACTIONS = { ...draft.actions, ...sandboxV.actions, ...schedule.actions, ...league.actions, ...settings.actions };

const params = new URLSearchParams(location.search);
const POPOUT = params.get('pane') === 'team';
let profileId = null;
let popWin = null;

const view = () => (VIEWS[location.hash.slice(1)] ? location.hash.slice(1) : 'players');

function header() {
  const s = state.settings;
  return `<div class="brand"><span class="logo" aria-hidden="true">◆</span> Puck Ledger <span class="muted small">${esc(D.meta.season)}</span></div>
    <nav>${Object.entries(VIEWS).map(([k, v]) => `<a href="#${k}" class="${view() === k ? 'on' : ''}">${v.label}${k === 'commit' && state.roster.ops.length ? ` <span class="count">${state.roster.ops.length}</span>` : ''}</a>`).join('')}</nav>
    <div class="quick">
      <label class="tz" title="Timezone for game times"><span aria-hidden="true">🕒</span><select data-change="set:tz" aria-label="Timezone">${tzOptions(s.tz)}</select></label>
      <button data-action="toggle-height" title="Height units">${s.height === 'cm' ? 'cm' : 'ft-in'}</button>
      <button data-action="toggle-weight" title="Weight units">${s.weight}</button>
      <button data-action="toggle-pane" class="${state.ui.pane ? 'on' : ''}" title="Team context pane">Team pane</button>
    </div>`;
}

function captureFocus() {
  const a = document.activeElement;
  if (!a || !a.dataset?.change) return null;
  return { key: a.dataset.change, value: a.value, start: a.selectionStart, end: a.selectionEnd, type: a.type };
}
function restoreFocus(f) {
  if (!f) return;
  const el = [...document.querySelectorAll(`[data-change="${CSS.escape(f.key)}"]`)].find(e => e.type !== 'radio' && e.type !== 'checkbox' || e.value === f.value);
  if (!el) return;
  el.focus();
  try { if (f.start != null) el.setSelectionRange(f.start, f.end); } catch { /* not a text input */ }
}

let queued = false;
function render() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => {
    queued = false;
    const f = captureFocus();
    const paneEl = $('#pane .pane-body');
    const paneScroll = paneEl ? paneEl.scrollTop : 0;
    const dlgBody = $('#profile .dlg-body');
    const dlgScroll = dlgBody ? dlgBody.scrollTop : 0;

    if (POPOUT) {
      document.body.classList.add('popout');
      $('#pane').innerHTML = renderTeam(state.ui.team, { popout: true });
      document.title = `${D.teams[state.ui.team]?.name || 'Team'} · Puck Ledger`;
    } else {
      $('#top').innerHTML = header();
      $('#main').innerHTML = VIEWS[view()].render();
      const showPane = state.ui.pane;
      document.body.classList.toggle('with-pane', showPane);
      $('#pane').innerHTML = showPane ? renderTeam(state.ui.team) : '';
    }
    const np = $('#pane .pane-body');
    if (np) np.scrollTop = paneScroll;
    renderProfileDlg();
    const nd = $('#profile .dlg-body');
    if (nd) nd.scrollTop = dlgScroll;
    restoreFocus(f);
  });
}

function renderProfileDlg() {
  const dlg = $('#profile');
  const p = profileId && D.byId.get(profileId);
  if (!p) { if (dlg.open) dlg.close(); return; }
  const st = state.settings;
  dlg.innerHTML = `<div class="dlg-bar"><span class="muted tiny">Units</span>
    <button class="sm" data-action="toggle-height" title="Height units">${st.height === 'cm' ? 'cm' : 'ft-in'}</button>
    <button class="sm" data-action="toggle-weight" title="Weight units">${st.weight}</button>
    <button class="sm" data-action="toggle-toi" title="Ice time format">${st.toi === 'dec' ? 'min.dec' : 'mm:ss'}</button>
    <button class="sm" data-action="toggle-pct" title="Percentage format">${st.pct === 'dec' ? '.912' : '91.2%'}</button>
    <button data-action="profile-close" aria-label="Close">✕</button></div><div class="dlg-body">${renderProfile(p)}</div>`;
  if (!dlg.open) dlg.showModal();
}

function openTeam(abbrev) {
  update(s => { s.ui.team = abbrev; if (!POPOUT && !(popWin && !popWin.closed)) s.ui.pane = true; });
}

const GLOBAL_ACTIONS = {
  goto: (_, el) => { location.hash = el.dataset.view; },
  'profile-close': () => { profileId = null; render(); },
  'pane-close': () => update(s => { s.ui.pane = false; }),
  'toggle-pane': () => update(s => { s.ui.pane = !s.ui.pane; }),
  'pane-popout': () => {
    popWin = window.open(`${location.pathname}?pane=team`, 'puckledger-team', 'width=520,height=900');
    if (popWin) update(s => { s.ui.pane = false; });
    else toast('Pop-up blocked. Allow pop-ups for this site.');
  },
  'toggle-height': () => update(s => { s.settings.height = s.settings.height === 'cm' ? 'ftin' : 'cm'; }),
  'toggle-weight': () => update(s => { s.settings.weight = s.settings.weight === 'kg' ? 'lb' : 'kg'; }),
  'toggle-toi': () => update(s => { s.settings.toi = s.settings.toi === 'dec' ? 'mmss' : 'dec'; }),
  'toggle-pct': () => update(s => { s.settings.pct = s.settings.pct === 'dec' ? 'pct' : 'dec'; }),
};

document.addEventListener('click', e => {
  if (onSortClick(e)) return;
  const pl = e.target.closest('[data-pid]');
  if (pl) { e.preventDefault(); profileId = +pl.dataset.pid; render(); return; }
  const tm = e.target.closest('[data-team]');
  if (tm) { e.preventDefault(); openTeam(tm.dataset.team); return; }
  const ac = e.target.closest('[data-action]');
  if (ac && !ac.disabled) {
    e.preventDefault();
    const fn = GLOBAL_ACTIONS[ac.dataset.action] || ACTIONS[ac.dataset.action];
    if (fn) fn(ac.dataset.id ? +ac.dataset.id : null, ac);
  }
});

$('#profile').addEventListener('close', () => { profileId = null; });
$('#profile').addEventListener('click', e => { if (e.target.id === 'profile') { profileId = null; render(); } });

function onChange(e) {
  const el = e.target.closest('[data-change]');
  if (!el) return;
  const key = el.dataset.change;
  const textual = ['text', 'search', 'number', 'url', 'textarea'].includes(el.type) || el.tagName === 'TEXTAREA';
  if (e.type === 'input' && !textual) return;
  if (e.type === 'change' && textual) return;
  if (key.startsWith('filter:')) players.onChange(key, el.value);
  else if (key === 'pane-team') update(s => { s.ui.team = el.value; });
  else if (/^(w|league|slot|cat-on):/.test(key) || key === 'po-week') league.onChange(key, el);
  else if (key.startsWith('set:')) settings.onChange(key, el);
  else if (key === 'draft-slot') update(s => { s.league.draftSlot = +el.value || 1; });
  else if (key === 'draft-filter') update(s => { s.ui.draftFilter = el.value; });
  else if (key === 'sched-roster') update(s => { s.ui.schedRoster = el.value; });
  else if (key === 'import' && el.files[0]) settings.importState(el.files[0]).then(() => { buildWeeks(); toast('Imported'); }).catch(err => toast(err.message));
  else sandboxV.onChange(key, el);
}
document.addEventListener('input', onChange);
document.addEventListener('change', onChange);
window.addEventListener('hashchange', () => { window.scrollTo(0, 0); render(); });

subscribe(render);

(async function boot() {
  try {
    await loadData();
  } catch (e) {
    $('#main').innerHTML = `<div class="card"><h2>Data not found</h2><p>Run <code>python3 scripts/build_data.py</code> to generate <code>data/*.json</code>, then serve this folder over HTTP.</p><pre>${esc(e.message)}</pre></div>`;
    return;
  }
  if (params.get('team') && D.teams[params.get('team')]) update(s => { s.ui.team = params.get('team'); }, { render: false });
  render();
  // injuries change daily: refresh live if the baked-in data is older than 6h
  const age = Date.now() - Date.parse(D.meta.generated || 0);
  const liveAge = state.liveInjuries ? Date.now() - Date.parse(state.liveInjuries.fetched) : Infinity;
  if (!POPOUT && age > 6 * 3600e3 && liveAge > 6 * 3600e3) refreshInjuries().catch(() => {});
})();
