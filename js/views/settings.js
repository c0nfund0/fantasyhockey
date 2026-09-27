// Global display & localization settings (apply app-wide instantly) + data status.
import { D, refreshInjuries } from '../data.js';
import { esc, fmt } from '../format.js';
import { state, update } from '../store.js';
import { toast } from '../ui.js';

const COMMON_TZ = ['Europe/Helsinki', 'Europe/Stockholm', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago',
  'America/Denver', 'America/Los_Angeles', 'America/Toronto', 'America/Vancouver', 'Asia/Tokyo', 'Australia/Sydney', 'UTC'];

export function tzOptions(cur) {
  let all = [];
  try { all = Intl.supportedValuesOf('timeZone'); } catch { all = COMMON_TZ; }
  const rest = all.filter(z => !COMMON_TZ.includes(z));
  return `<optgroup label="Common">${COMMON_TZ.map(z => `<option ${z === cur ? 'selected' : ''}>${z}</option>`).join('')}</optgroup>
    <optgroup label="All">${rest.map(z => `<option ${z === cur ? 'selected' : ''}>${z}</option>`).join('')}</optgroup>`;
}

const seg = (key, opts) => `<div class="seg">${opts.map(([v, l]) => `<label><input type="radio" name="${key}" value="${v}" data-change="set:${key}" ${state.settings[key] === v ? 'checked' : ''}> ${l}</label>`).join('')}</div>`;

export function render() {
  const s = state.settings;
  const sample = D.players.find(p => p.name === 'Connor McDavid') || D.players[0];
  const g = D.schedule.find(x => x.d >= new Date().toISOString().slice(0, 10)) || D.schedule[0];
  const live = state.liveInjuries;
  return `<div class="view-head"><h1>Display & localization</h1><p class="muted">Global settings. Every table, profile and schedule updates instantly, no reload.</p></div>
    <div class="cols2">
      <section class="card">
        <h3>Time</h3>
        <label>Timezone for all game times <select data-change="set:tz">${tzOptions(s.tz)}</select></label>
        <div class="btnrow"><button data-action="tz-browser">Use this device’s timezone</button><button data-action="tz-helsinki">Reset to Helsinki</button></div>
        <h4>Clock</h4>${seg('clock', [['24', '24-hour'], ['12', '12-hour']])}
        <h4>Number & date format</h4>
        <select data-change="set:locale">${[['en-GB', 'English (UK) 1,234.5 · 27 Sept'], ['en-US', 'English (US) 1,234.5 · Sep 27'], ['fi-FI', 'Suomi 1 234,5 · 27. syysk.'], ['sv-SE', 'Svenska 1 234,5'], ['de-DE', 'Deutsch 1.234,5']].map(([v, l]) => `<option value="${v}" ${s.locale === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
      </section>
      <section class="card">
        <h3>Units & formats</h3>
        <h4>Height</h4>${seg('height', [['cm', 'Centimetres'], ['ftin', 'Feet / inches']])}
        <h4>Weight</h4>${seg('weight', [['kg', 'Kilograms'], ['lb', 'Pounds']])}
        <h4>Ice time</h4>${seg('toi', [['mmss', 'mm:ss (21:34)'], ['dec', 'Decimal minutes (21.6)']])}
        <h4>Percentages</h4>${seg('pct', [['pct', 'Percent (91.2%)'], ['dec', 'Decimal (.912)']])}
      </section>
    </div>
    <section class="card preview">
      <h3>Preview</h3>
      ${sample ? `<p>${esc(sample.name)}: ${fmt.height(sample)}, ${fmt.weight(sample)}, projected TOI ${fmt.toi(sample.proj?.toi)}, shooting ${fmt.pct(sample.proj?.sh)}, ${fmt.num(1234.5, 1)} sample number.</p>` : ''}
      ${g ? `<p>Next game: ${g.a} @ ${g.h}, ${fmt.dateTime(g.t)} (${esc(fmt.tzLabel())})</p>` : ''}
    </section>
    <section class="card">
      <h3>Data</h3>
      <p class="small">Built ${D.meta.generated ? fmt.dateTime(D.meta.generated) : '—'} for ${esc(D.meta.season)}. Sources: ${D.meta.sources.map(esc).join('; ')}.</p>
      <p class="small">Injuries: ${live && live.fetched > D.meta.generated ? `live from ESPN, fetched ${fmt.dateTime(live.fetched)} (${Object.keys(live.byName).length} entries)` : 'from the last data build'}.
        <button data-action="refresh-inj">Refresh injuries now</button></p>
      <p class="tiny muted">Stats, projections, lines, standings and team outlook refresh when the data build runs (see README). Injuries can also refresh live from here.</p>
      <h4>Backup</h4>
      <p class="small muted">Your league settings, rosters and draft board live in this browser. Export them to move to another device.</p>
      <div class="btnrow"><button data-action="export">Export app state</button><label class="button">Import… <input type="file" accept="application/json" data-change="import" hidden></label></div>
    </section>`;
}

export function onChange(key, el) {
  const [, name] = key.split(':');
  update(s => { s.settings[name] = el.value; });
}

export const actions = {
  'tz-browser': () => update(s => { s.settings.tz = Intl.DateTimeFormat().resolvedOptions().timeZone; }),
  'tz-helsinki': () => update(s => { s.settings.tz = 'Europe/Helsinki'; }),
  'refresh-inj': async () => {
    try { const n = await refreshInjuries(); toast(`Injuries refreshed: ${n} entries`); }
    catch (e) { toast(`Injury refresh failed: ${e.message}`); }
  },
  export: () => {
    const blob = new Blob([JSON.stringify({ ...state, liveInjuries: null }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'puck-ledger-state.json';
    a.click();
    URL.revokeObjectURL(a.href);
  },
};

export async function importState(file) {
  const obj = JSON.parse(await file.text());
  if (!obj.league || !obj.settings) throw new Error('Not a Puck Ledger export');
  update(s => { s.settings = obj.settings; s.league = obj.league; s.roster = obj.roster || s.roster; s.draft = obj.draft || s.draft; });
}
