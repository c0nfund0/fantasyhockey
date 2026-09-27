// Shared rendering helpers.
import { D } from './data.js';
import { esc, fmt } from './format.js';
import { injuryInfo } from './analysis.js';
import { state, update, CATS } from './store.js';

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export function plink(p) {
  return `<a href="#" class="plink" data-pid="${p.id}">${esc(p.name)}</a>`;
}

export function teamChip(abbrev) {
  return `<button class="teamchip" data-team="${abbrev}" title="Open ${esc(D.teams[abbrev]?.name || abbrev)} in team context pane">${abbrev}</button>`;
}

export function injBadge(p) {
  if (p.offRoster) return `<span class="badge bad" title="Not on any NHL roster since ${esc(p.offSince || '')} (minors, waivers or unsigned). Projection assumes a return.">Off NHL roster</span>`;
  const i = injuryInfo(p);
  if (!i) return '';
  const cls = i.status === 'Day-To-Day' ? 'warn' : 'bad';
  const ret = i.ret ? ` · back ~${fmt.day(i.ret, { day: 'numeric', month: 'short' })}` : '';
  return `<span class="badge ${cls}" title="${esc(i.type || '')}${esc(ret)}">${esc(i.label)}</span>`;
}

export function posLabel(p) { return p.elig.join('/'); }

export function flagChip(f) {
  return `<span class="flag ${f.kind}">${esc(f.text)}</span>`;
}

export function secChip(role) {
  if (!role) return '';
  const cls = { High: 'good', Medium: 'warn', Low: 'bad' }[role.security] || '';
  const held = role.held != null ? `${role.held} season${role.held === 1 ? '' : 's'} in role` : '';
  const tip = [held, ...(role.threats || [])].filter(Boolean).join('\n');
  return `<span class="sec ${cls}" title="${esc(tip)}">${esc(role.security)}</span>`;
}

export function ppChip(role) {
  return role?.pp ? `<span class="pp ${role.pp.toLowerCase()}">${role.pp}</span>` : '';
}

// Sortable table: cols = [{k, label, get(p), fmt(v,p), cls, title}]
export function table(id, rows, cols, { sortKey, sortDir = -1, limit = 400, rowCls } = {}) {
  const st = (state.ui.sort ||= {})[id] || { k: sortKey, d: sortDir };
  const col = cols.find(c => c.k === st.k) || cols.find(c => c.k === sortKey);
  const sorted = col?.get ? [...rows].sort((a, b) => {
    const va = col.get(a), vb = col.get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * st.d;
  }) : rows;
  const head = cols.map(c => `<th class="${c.cls || ''} ${c.get ? 'sortable' : ''} ${st.k === c.k ? (st.d > 0 ? 'asc' : 'desc') : ''}" ${c.get ? `data-sort="${id}:${c.k}"` : ''} title="${esc(c.title || '')}">${c.label}</th>`).join('');
  const body = sorted.slice(0, limit).map(p => `<tr class="${rowCls ? rowCls(p) : ''}">${cols.map(c => `<td class="${c.cls || ''}">${c.fmt ? c.fmt(c.get ? c.get(p) : null, p) : esc(c.get(p))}</td>`).join('')}</tr>`).join('');
  const more = sorted.length > limit ? `<div class="muted small">Showing ${limit} of ${sorted.length}. Narrow with filters.</div>` : '';
  return `<div class="tablewrap"><table class="grid" id="t-${id}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>${more}`;
}

export function onSortClick(e) {
  const th = e.target.closest('[data-sort]');
  if (!th) return false;
  const [id, k] = th.dataset.sort.split(':');
  update(s => {
    const cur = (s.ui.sort ||= {})[id];
    s.ui.sort[id] = { k, d: cur && cur.k === k ? -cur.d : -1 };
  });
  return true;
}

// projection stat cell formatting per category
export function catFmt(key, v) {
  if (v == null) return '—';
  if (key === 'svp') return fmt.pct(v, 2);
  if (key === 'gaa') return fmt.num(v, 2);
  if (key === 'pm') return fmt.signed(v, 0);
  return fmt.num(v, 0);
}

export const catByKey = Object.fromEntries(CATS.map(c => [c.key, c]));

export function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('show'), 10);
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2600);
}
