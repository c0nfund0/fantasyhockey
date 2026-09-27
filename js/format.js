// Every displayed measurement goes through here so unit/locale/timezone toggles apply app-wide instantly.
import { state } from './store.js';

const nfCache = new Map();
function nf(d) {
  const k = `${state.settings.locale}|${d}`;
  if (!nfCache.has(k)) nfCache.set(k, new Intl.NumberFormat(state.settings.locale, { minimumFractionDigits: d, maximumFractionDigits: d }));
  return nfCache.get(k);
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const fmt = {
  num(v, d = 0) { return v == null || Number.isNaN(v) ? '—' : nf(d).format(v); },
  signed(v, d = 0) { return v == null ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d).format(Math.abs(v)); },
  // v is in percent units (e.g. 91.23)
  pct(v, d = 1) {
    if (v == null) return '—';
    if (state.settings.pct === 'dec') return nf(d + 2).format(v / 100).replace(/^0(?=[.,])/, '');
    return nf(d).format(v) + '%';
  },
  // difference between two percentages, in points
  pctDiff(v, d = 1) {
    if (v == null) return '—';
    if (state.settings.pct === 'dec') return (v > 0 ? '+' : v < 0 ? '−' : '') + nf(d + 2).format(Math.abs(v) / 100).replace(/^0(?=[.,])/, '');
    return fmt.signed(v, d) + ' pts';
  },
  pdo(v) { return v == null ? '—' : state.settings.pct === 'dec' ? nf(3).format(v / 1000) : nf(0).format(v); },
  pdoDiff(v) { return v == null ? '—' : state.settings.pct === 'dec' ? fmt.signed(v / 1000, 3) : fmt.signed(v, 0); },
  // minutes (float) → mm:ss or decimal minutes
  toi(min) {
    if (min == null) return '—';
    if (state.settings.toi === 'dec') return nf(1).format(min);
    const s = Math.round(min * 60);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  },
  toiUnit() { return state.settings.toi === 'dec' ? 'min' : 'm:ss'; },
  height(p) {
    if (!p.hCm) return '—';
    if (state.settings.height === 'cm') return `${nf(0).format(p.hCm)} cm`;
    return `${Math.floor(p.hIn / 12)}′${p.hIn % 12}″`;
  },
  weight(p) {
    if (!p.wKg) return '—';
    return state.settings.weight === 'kg' ? `${nf(0).format(p.wKg)} kg` : `${nf(0).format(p.wLb)} lb`;
  },
  dateTime(iso, opts = {}) {
    return new Intl.DateTimeFormat(state.settings.locale, {
      timeZone: state.settings.tz, weekday: 'short', day: 'numeric', month: 'short',
      hour: '2-digit', minute: '2-digit', hourCycle: state.settings.clock === '12' ? 'h12' : 'h23', ...opts,
    }).format(new Date(iso));
  },
  time(iso) {
    return new Intl.DateTimeFormat(state.settings.locale, {
      timeZone: state.settings.tz, hour: '2-digit', minute: '2-digit', hourCycle: state.settings.clock === '12' ? 'h12' : 'h23',
    }).format(new Date(iso));
  },
  localDay(iso) {
    return new Intl.DateTimeFormat(state.settings.locale, { timeZone: state.settings.tz, weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(iso));
  },
  // plain calendar date string (YYYY-MM-DD), not timezone-shifted
  day(ymd, opts = { weekday: 'short', day: 'numeric', month: 'short' }) {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Intl.DateTimeFormat(state.settings.locale, { timeZone: 'UTC', ...opts }).format(new Date(Date.UTC(y, m - 1, d)));
  },
  tzLabel() {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: state.settings.tz, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find(p => p.type === 'timeZoneName')?.value || state.settings.tz;
  },
};

export function normName(s) {
  return s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}
