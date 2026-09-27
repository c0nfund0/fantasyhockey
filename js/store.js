// App state: settings, league config, rosters, draft board. Persisted to localStorage and
// synced across windows (the popped-out team pane) via the `storage` event.

const KEY = 'puckledger:v1';

export const CATS = [
  { key: 'g', label: 'G', name: 'Goals', grp: 'S' },
  { key: 'a', label: 'A', name: 'Assists', grp: 'S' },
  { key: 'p', label: 'PTS', name: 'Points', grp: 'S' },
  { key: 'pm', label: '+/-', name: 'Plus/minus', grp: 'S' },
  { key: 'pim', label: 'PIM', name: 'Penalty minutes', grp: 'S' },
  { key: 'ppp', label: 'PPP', name: 'Power-play points', grp: 'S' },
  { key: 'shp', label: 'SHP', name: 'Short-handed points', grp: 'S' },
  { key: 'gwg', label: 'GWG', name: 'Game-winning goals', grp: 'S' },
  { key: 'ht', label: 'HAT', name: 'Hat tricks (3+ goal games)', grp: 'S' },
  { key: 'sog', label: 'SOG', name: 'Shots on goal', grp: 'S' },
  { key: 'hit', label: 'HIT', name: 'Hits', grp: 'S' },
  { key: 'blk', label: 'BLK', name: 'Blocked shots', grp: 'S' },
  { key: 'fow', label: 'FOW', name: 'Faceoffs won', grp: 'S' },
  { key: 'w', label: 'W', name: 'Wins', grp: 'G' },
  { key: 'gaa', label: 'GAA', name: 'Goals-against average', grp: 'G', ratio: true, low: true },
  { key: 'svp', label: 'SV%', name: 'Save percentage', grp: 'G', ratio: true },
  { key: 'sv', label: 'SV', name: 'Saves', grp: 'G' },
  { key: 'ga', label: 'GA', name: 'Goals against', grp: 'G', low: true },
  { key: 'so', label: 'SO', name: 'Shutouts', grp: 'G' },
  { key: 'gs', label: 'GS', name: 'Games started', grp: 'G' },
];

const CAT_DEFAULTS = {
  // [on in category leagues, category weight, points-league value]
  g: [1, 1, 3], a: [1, 1, 2], p: [0, 1, 0], pm: [1, 1, 0.5], pim: [0, 1, 0], ppp: [1, 1, 1], shp: [0, 1, 1],
  gwg: [0, 1, 0], ht: [0, 1, 5], sog: [1, 1, 0.4], hit: [1, 1, 0.3], blk: [1, 1, 0.4], fow: [0, 1, 0],
  w: [1, 1, 4], gaa: [1, 1, 0], svp: [1, 1, 0], sv: [0, 1, 0.2], ga: [0, 1, -2], so: [1, 1, 3], gs: [0, 1, 0],
};

export const SLOT_KEYS = ['C', 'LW', 'RW', 'F', 'D', 'UTIL', 'G', 'BN', 'IR'];

function defaults() {
  const cats = {};
  for (const c of CATS) {
    const [on, w, pts] = CAT_DEFAULTS[c.key];
    cats[c.key] = { on: !!on, w, pts };
  }
  return {
    settings: {
      tz: 'Europe/Helsinki',
      height: 'cm',
      weight: 'kg',
      toi: 'mmss',       // mmss | dec
      pct: 'pct',        // pct (91.2%) | dec (.912)
      locale: 'en-GB',   // number/date formatting
      clock: '24',       // 24 | 12
    },
    league: {
      name: 'My league',
      format: 'h2hcat',  // h2hcat | roto | points
      teams: 12,
      slots: { C: 2, LW: 2, RW: 2, F: 0, D: 4, UTIL: 1, G: 2, BN: 4, IR: 2 },
      cats,
      playoffWeeks: null,   // null = last 3 weeks of the season
      weekStart: 1,         // 1 = Monday
      divWarn: 35,          // % of roster in one division before warning
      confWarn: 65,
      url: '',
      draftSlot: 1,
      projOnlyScored: true, // profile projection row: hide stats the league doesn't score
      goalieDiscount: 25,   // % haircut on goalie value for year-to-year volatility
    },
    roster: { committed: [], ops: [], history: [] },
    draft: { picks: [] },   // [{id, me}]
    ui: { view: 'players', team: 'TOR', pane: typeof window !== 'undefined' && window.innerWidth > 1280, playerFilter: {} },
    suggest: { dismissed: [], taken: [], hideOwned: true },
    liveInjuries: null,     // {fetched, byName}
  };
}

function merge(base, over) {
  if (!over || typeof over !== 'object' || Array.isArray(base)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) {
    out[k] = base && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? merge(base[k], over[k]) : over[k];
  }
  return out;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return merge(defaults(), JSON.parse(raw));
  } catch (e) { /* storage unavailable */ }
  return defaults();
}

export let state = load();
const subs = new Set();

export function subscribe(fn) { subs.add(fn); }

export function update(fn, { render = true } = {}) {
  fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  if (render) subs.forEach(s => s());
}

export function resetLeague() {
  update(s => { s.league = defaults().league; });
}

export function resetAll() {
  state = defaults();
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
  subs.forEach(s => s());
}

window.addEventListener('storage', e => {
  if (e.key !== KEY) return;
  state = load();
  subs.forEach(s => s());
});
