// Loads the static data built by scripts/build_data.py and derives lookup tables.
import { state, update } from './store.js';
import { normName } from './format.js';

export const D = { players: [], byId: new Map(), teams: {}, schedule: [], meta: {}, weeks: [], teamGamesByWeek: {} };

export async function loadData() {
  const get = n => fetch(`data/${n}.json`, { cache: 'no-cache' }).then(r => r.json());
  const [players, teams, schedule, meta] = await Promise.all(['players', 'teams', 'schedule', 'meta'].map(get));
  D.byId = new Map();
  D.players = players;
  D.teams = teams;
  D.schedule = schedule;
  D.meta = meta;
  for (const p of players) {
    D.byId.set(p.id, p);
    p._name = normName(p.name);
  }
  buildWeeks();
}

// Fantasy weeks (league week start, default Monday) keyed by the game's NHL calendar date.
export function buildWeeks() {
  const ws = state.league.weekStart;
  if (!D.schedule.length) return;
  const first = D.schedule[0].d;
  const last = D.schedule[D.schedule.length - 1].d;
  const toUTC = ymd => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
  const iso = t => new Date(t).toISOString().slice(0, 10);
  let start = toUTC(first);
  while (new Date(start).getUTCDay() !== ws) start -= 86400000;
  const weeks = [];
  for (let t = start; t <= toUTC(last); t += 7 * 86400000) {
    weeks.push({ n: weeks.length + 1, start: iso(t), end: iso(t + 6 * 86400000), games: [] });
  }
  const idx = ymd => Math.floor((toUTC(ymd) - start) / (7 * 86400000));
  const byTeam = {};
  for (const g of D.schedule) {
    const w = idx(g.d);
    weeks[w].games.push(g);
    for (const t of [g.h, g.a]) {
      byTeam[t] ??= new Array(weeks.length).fill(0);
      byTeam[t][w]++;
    }
  }
  D.weeks = weeks;
  D.teamGamesByWeek = byTeam;
}

export function playoffWeeks() {
  const pw = state.league.playoffWeeks;
  if (pw && pw.length) return pw;
  const n = D.weeks.length;
  return [n - 2, n - 1, n].filter(x => x > 0);
}

export function currentWeekIndex() {
  const today = new Date().toISOString().slice(0, 10);
  const i = D.weeks.findIndex(w => today <= w.end);
  return i < 0 ? D.weeks.length - 1 : i;
}

// Effective injury: live-refreshed ESPN data (if fetched after the build) wins over the baked-in one.
export function injuryOf(p) {
  const live = state.liveInjuries;
  if (live && live.fetched > (D.meta.generated || '')) return live.byName[p._name] || null;
  return p.inj || null;
}

export async function refreshInjuries() {
  const r = await fetch('https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries');
  if (!r.ok) throw new Error(`ESPN responded ${r.status}`);
  const d = await r.json();
  const byName = {};
  for (const t of d.injuries || []) {
    for (const i of t.injuries || []) {
      const det = i.details || {};
      byName[normName(i.athlete.displayName)] = {
        status: i.status, type: det.type, ret: det.returnDate,
        note: i.shortComment && i.shortComment !== 'out' ? i.shortComment : null,
        updated: (i.date || '').slice(0, 10),
      };
    }
  }
  update(s => { s.liveInjuries = { fetched: new Date().toISOString(), byName }; });
  return Object.keys(byName).length;
}

export const lastSeasonKey = () => D.meta.histKeys[D.meta.histKeys.length - 1];
