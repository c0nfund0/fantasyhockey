// Roster-slot logic shared by valuation, draft mode and suggestions.
import { state } from './store.js';

const DEDICATED = ['C', 'LW', 'RW', 'D', 'G'];
export const START_SLOTS = ['C', 'LW', 'RW', 'F', 'D', 'UTIL', 'G'];
export const isForward = p => p.pos !== 'D' && p.pos !== 'G';

// Starting slots this player could fill in an empty lineup.
export function startSlotsFor(p, slots = state.league.slots) {
  const out = p.elig.filter(e => DEDICATED.includes(e) && (slots[e] || 0) > 0);
  if (isForward(p) && (slots.F || 0) > 0) out.push('F');
  if (p.pos !== 'G' && (slots.UTIL || 0) > 0) out.push('UTIL');
  return out;
}

// Can this player ever score for a team in this league?
export const usable = (p, slots = state.league.slots) => startSlotsFor(p, slots).length > 0;

export const rosterSize = (slots = state.league.slots) =>
  Object.entries(slots).filter(([k]) => k !== 'IR').reduce((s, [, n]) => s + (n || 0), 0);

// Place players into slots like a lineup: dedicated position first, then F, then UTIL, then bench.
// Returns remaining capacity per slot. Best players (input order) get starting slots first.
export function allocate(players, slots = state.league.slots) {
  const open = Object.fromEntries([...START_SLOTS, 'BN'].map(k => [k, slots[k] || 0]));
  const placed = [];
  for (const p of players) {
    const slot = pickSlot(p, open);
    if (slot) open[slot]--;
    placed.push({ p, slot });
  }
  return { open, placed };
}

// Where would this player go given the currently open slots? (null = no room at all)
export function pickSlot(p, open) {
  const ded = p.elig.filter(e => DEDICATED.includes(e) && open[e] > 0).sort((a, b) => open[a] - open[b]);
  if (ded.length) return ded[0];
  if (isForward(p) && open.F > 0) return 'F';
  if (p.pos !== 'G' && open.UTIL > 0) return 'UTIL';
  if (open.BN > 0 && usable(p)) return 'BN';
  return null;
}
