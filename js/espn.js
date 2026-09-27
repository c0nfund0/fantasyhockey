// ESPN league sync: draft picks (live during the draft), teams, roster slots, other teams' rosters.
// Calls go through the site's /api/espn proxy (needed for private-league cookies); falls back to ESPN
// directly for public leagues when the proxy isn't there (plain static hosting).
import { D } from './data.js';
import { state, update } from './store.js';

const SLOT_IDS = { 0: 'C', 1: 'LW', 2: 'RW', 3: 'F', 4: 'D', 5: 'G', 6: 'UTIL', 7: 'BN', 8: 'IR' };

export function leagueIdFromUrl(url) {
  const m = String(url || '').match(/leagueId=(\d+)/i) || String(url || '').match(/^\s*(\d{3,})\s*$/);
  return m ? m[1] : null;
}
export const espnSeason = () => Number((D.meta.season || '').slice(0, 4)) + 1;   // "2026-27" → 2027

let byEspn = null, byEspnKey = null;
function playerByEspnId(eid) {
  if (byEspnKey !== D.meta.generated) {
    byEspn = new Map(D.players.filter(p => p.espnId).map(p => [p.espnId, p]));
    byEspnKey = D.meta.generated;
  }
  return byEspn.get(eid) || null;
}

async function fetchLeague(views) {
  const id = leagueIdFromUrl(state.league.url);
  if (!id) throw new Error('Add your ESPN league URL (it contains leagueId=…) in League settings.');
  const e = state.espn || {};
  const qs = `league=${id}&season=${espnSeason()}&${views.map(v => `view=${v}`).join('&')}`;
  let r;
  try {
    r = await fetch(`api/espn?${qs}`, { headers: { 'X-Espn-S2': e.s2 || '', 'X-Espn-Swid': e.swid || '' }, cache: 'no-store' });
  } catch { r = null; }
  if (!r || r.status === 404 && !(r.headers.get('content-type') || '').includes('json')) {
    // no proxy (static host): public leagues can be read directly
    r = await fetch(`https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/${espnSeason()}/segments/0/leagues/${id}?${views.map(v => `view=${v}`).join('&')}`);
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(body.error || body.messages?.[0] || `ESPN responded ${r.status}`);
  return body;
}

const teamName = t => t.name || [t.location, t.nickname].filter(Boolean).join(' ') || t.abbrev || `Team ${t.id}`;

// Which team is mine: explicit choice, else the team whose owner matches the SWID cookie.
function myTeamId(league) {
  if (state.espn?.teamId) return state.espn.teamId;
  const swid = (state.espn?.swid || '').toUpperCase();
  if (!swid) return null;
  const t = (league.teams || []).find(t => (t.owners || []).some(o => String(o).toUpperCase() === swid));
  return t ? t.id : null;
}

export async function connect() {
  const lg = await fetchLeague(['mTeam', 'mSettings']);
  const teams = (lg.teams || []).map(t => ({ id: t.id, name: teamName(t), abbrev: t.abbrev }));
  const mine = myTeamId(lg);
  update(s => {
    s.espn.teams = teams;
    s.espn.leagueName = lg.settings?.name || '';
    if (mine && !s.espn.teamId) s.espn.teamId = mine;
    s.espn.error = null;
  });
  await sync();   // re-read picks now that we know which team is yours
  return { teams, mine: state.espn.teamId };
}

// Roster slots + team count from ESPN settings.
export async function importSettings() {
  const lg = await fetchLeague(['mSettings', 'mTeam']);
  const counts = lg.settings?.rosterSettings?.lineupSlotCounts || {};
  const slots = { C: 0, LW: 0, RW: 0, F: 0, D: 0, UTIL: 0, G: 0, BN: 0, IR: 0 };
  let known = 0;
  for (const [sid, n] of Object.entries(counts)) {
    const k = SLOT_IDS[sid];
    if (k) { slots[k] += n; known += n; }
  }
  const size = lg.settings?.size || (lg.teams || []).length;
  update(s => {
    if (known) s.league.slots = slots;
    if (size) s.league.teams = size;
    if (lg.settings?.name) s.league.name = lg.settings.name;
  });
  return { slots: known ? slots : null, teams: size };
}

// Pull draft picks + other teams' rosters. Returns a short status.
export async function sync() {
  const lg = await fetchLeague(['mDraftDetail', 'mSettings', 'mTeam', 'mRoster']);
  const mine = myTeamId(lg);
  const dd = lg.draftDetail || {};
  const picks = (dd.picks || []).filter(p => p.playerId > 0).sort((a, b) => a.overallPickNumber - b.overallPickNumber);
  const mapped = picks.map(p => {
    const pl = playerByEspnId(p.playerId);
    return { id: pl ? pl.id : null, espnId: p.playerId, me: mine != null && p.teamId === mine, team: p.teamId };
  });
  // players on other teams' current rosters (covers in-season adds, drops and trades)
  const owned = [];
  const myRoster = [];
  for (const t of lg.teams || []) {
    for (const e of t.roster?.entries || []) {
      const pl = playerByEspnId(e.playerId);
      if (!pl) continue;
      (t.id === mine ? myRoster : owned).push(pl.id);
    }
  }
  const order = lg.settings?.draftSettings?.pickOrder || [];
  const size = lg.settings?.size || (lg.teams || []).length;
  update(s => {
    s.espn.lastSync = new Date().toISOString();
    s.espn.error = null;
    s.espn.draftState = dd.drafted ? 'complete' : dd.inProgress ? 'live' : 'scheduled';
    s.espn.owned = owned;
    s.espn.myRoster = myRoster;
    s.espn.unmapped = mapped.filter(p => !p.id).length;
    if (mapped.length || dd.inProgress || dd.drafted) s.draft.picks = mapped;   // ESPN is the source of truth
    if (size) s.league.teams = size;
    if (mine && order.includes(mine)) s.league.draftSlot = order.indexOf(mine) + 1;
    // your ESPN picks join your committed roster (never removes anything)
    const set = new Set(s.roster.committed);
    for (const p of mapped) if (p.me && p.id) set.add(p.id);
    s.roster.committed = [...set];
  });
  return { picks: mapped.length, state: dd.drafted ? 'complete' : dd.inProgress ? 'live' : 'scheduled', mine };
}

// ---- automatic polling: fast while a draft is live or the Draft page is open, slow otherwise
let timer = null;
export function startAutoSync(isDraftView) {
  clearTimeout(timer);
  const e = state.espn || {};
  if (!e.auto || !leagueIdFromUrl(state.league.url)) return;
  const fast = e.draftState === 'live' || isDraftView();
  const since = e.lastSync ? Date.now() - Date.parse(e.lastSync) : Infinity;
  const every = fast ? 15e3 : 10 * 60e3;
  timer = setTimeout(async () => {
    try { await sync(); } catch (err) { update(s => { s.espn.error = err.message; s.espn.lastSync = new Date().toISOString(); }); }
    startAutoSync(isDraftView);
  }, Math.max(0, every - since));
}

export function applyMyEspnRoster() {
  update(s => {
    s.roster.history.unshift({ ts: new Date().toISOString(), ops: [], note: `Synced ${s.espn.myRoster.length} players from ESPN` });
    s.roster.committed = [...s.espn.myRoster];
    s.roster.ops = [];
  });
}
