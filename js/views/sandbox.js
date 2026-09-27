// Roster sandbox (hypothetical moves) and the separate commit step.
import { D, playoffWeeks } from '../data.js';
import { esc, fmt, normName } from '../format.js';
import { state, update, CATS } from '../store.js';
import { valueOf } from '../value.js';
import { disparityFlags, balance } from '../analysis.js';
import { plink, teamChip, injBadge, posLabel, ppChip, flagChip, catFmt, toast } from '../ui.js';
import { sandbox, committed, totals, addOp, removeOp, commitOps, describeOp } from '../roster.js';

function activeCats() {
  const L = state.league;
  return CATS.filter(c => L.format === 'points' ? L.cats[c.key].pts : L.cats[c.key].on);
}

function playoffGames(ids) {
  const weeks = playoffWeeks();
  let n = 0;
  for (const id of ids) {
    const p = D.byId.get(id);
    const tg = D.teamGamesByWeek[p?.team];
    if (tg) for (const w of weeks) n += tg[w - 1] || 0;
  }
  return n;
}

function fpts(t) {
  const L = state.league;
  return CATS.reduce((s, c) => s + (c.ratio ? 0 : (t[c.key] || 0) * (L.cats[c.key].pts || 0)), 0);
}

function impactTable(before, after) {
  const tb = totals(before), ta = totals(after);
  const nWeeks = D.weeks.length || 25;
  const rows = activeCats().map(c => {
    const b = tb[c.key], a = ta[c.key];
    const d = a != null && b != null ? a - b : null;
    const good = d == null || Math.abs(d) < 1e-9 ? '' : (d > 0) !== !!c.low ? 'pos' : 'neg';
    const dFmt = d == null ? '—' : c.key === 'svp' ? fmt.pctDiff(d, 2) : c.key === 'gaa' ? fmt.signed(d, 2) : fmt.signed(d, 0);
    const wk = d == null || c.ratio ? '' : fmt.signed(d / nWeeks, 1);
    return `<tr><th title="${esc(c.name)}">${c.label}</th><td class="num">${catFmt(c.key, b)}</td><td class="num">${catFmt(c.key, a)}</td><td class="num ${good}">${dFmt}</td><td class="num muted">${wk}</td></tr>`;
  });
  const vb = before.reduce((s, id) => s + (valueOf(D.byId.get(id))?.vorp || 0), 0);
  const va = after.reduce((s, id) => s + (valueOf(D.byId.get(id))?.vorp || 0), 0);
  const pb = playoffGames(before), pa = playoffGames(after);
  const extra = [
    state.league.format === 'points' ? ['Fantasy pts', fmt.num(fpts(tb)), fmt.num(fpts(ta)), fpts(ta) - fpts(tb), 0] : null,
    ['Total value', fmt.num(vb, 1), fmt.num(va, 1), va - vb, 1],
    [`Playoff-week games (wk ${playoffWeeks().join(', ')})`, fmt.num(pb), fmt.num(pa), pa - pb, 0],
  ].filter(Boolean).map(([l, b, a, d, dp]) => `<tr class="sum"><th>${l}</th><td class="num">${b}</td><td class="num">${a}</td><td class="num ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${fmt.signed(d, dp)}</td><td></td></tr>`);
  return `<div class="tablewrap"><table class="grid compact impact"><thead><tr><th>Category</th><th>Committed</th><th>Sandbox</th><th>Δ season</th><th>Δ / week</th></tr></thead><tbody>${rows.join('')}${extra.join('')}</tbody></table></div>`;
}

function balancePanel(ids) {
  const b = balance(ids);
  if (!b.n) return '<p class="muted small">Add players to see division/conference balance.</p>';
  const L = state.league;
  const bar = (obj, thr) => Object.entries(obj).sort((x, y) => y[1] - x[1]).map(([k, v]) => {
    const pct = v / b.n * 100;
    return `<div class="bar ${pct > thr ? 'over' : ''}"><span>${esc(k)}</span><div><i style="width:${pct}%"></i></div><b>${v} · ${fmt.num(pct, 0)}%</b></div>`;
  }).join('');
  const warn = b.n < 6 ? [] : [
    ...Object.entries(b.div).filter(([, v]) => v / b.n * 100 > L.divWarn).map(([k, v]) => `Overloaded on the ${k} division (${v} of ${b.n}). Those teams play each other often, so your players share game nights and opponents, and one slump or schedule quirk hits several of them at once.`),
    ...Object.entries(b.conf).filter(([, v]) => v / b.n * 100 > L.confWarn).map(([k, v]) => `Overloaded on the ${k} conference (${v} of ${b.n}). Start times cluster, and a conference-wide schedule gap (e.g. All-Star/holiday blocks) hits most of your roster.`),
  ];
  return `<h4>Division</h4>${bar(b.div, L.divWarn)}<h4>Conference</h4>${bar(b.conf, L.confWarn)}
    ${warn.map(w => `<p class="flag warn">${esc(w)}</p>`).join('') || (b.n >= 6 ? '<p class="flag ok">Balanced across divisions and conferences.</p>' : '')}
    <p class="tiny muted">Warn above ${L.divWarn}% in one division / ${L.confWarn}% in one conference (League settings)${b.n < 6 ? '; checks start at 6 players' : ''}.</p>`;
}

function searchResults(roster) {
  const q = (state.ui.sbSearch || '').trim().toLowerCase();
  if (q.length < 2) return '';
  const inTrade = state.ui.tradeIn || [];
  const res = D.players.filter(p => !roster.includes(p.id) && p.name.toLowerCase().includes(q)).slice(0, 8);
  return `<ul class="plain results">${res.map(p => `<li>${plink(p)} <span class="muted tiny">${posLabel(p)} · ${p.team} · val ${fmt.num(valueOf(p)?.vorp, 1)}</span> ${injBadge(p)}
    <button class="sm" data-action="sb-add" data-id="${p.id}">Add</button>
    <button class="sm" data-action="trade-in" data-id="${p.id}" ${inTrade.includes(p.id) ? 'disabled' : ''}>+ Trade target</button></li>`).join('') || '<li class="muted small">No matches off your roster.</li>'}</ul>`;
}

export function render() {
  const before = committed(), after = sandbox();
  const ops = state.roster.ops;
  const tOut = (state.ui.tradeOut || []).filter(id => after.includes(id));
  const tIn = state.ui.tradeIn || [];
  const rosterRows = after.map(id => D.byId.get(id)).filter(Boolean)
    .sort((a, b) => (a.pos === 'G') - (b.pos === 'G') || (valueOf(b)?.vorp ?? -99) - (valueOf(a)?.vorp ?? -99));
  const flagged = rosterRows.map(p => [p, disparityFlags(p)]).filter(([, f]) => f.length);
  const div = id => D.teams[D.byId.get(id)?.team]?.division || '';

  return `<div class="view-head row between wrap">
      <div><h1>Roster sandbox</h1><p class="muted">Try adds, drops and trades here. Nothing touches your real league. When you’re ready, go to <b>Commit</b>.</p></div>
      <div class="btnrow"><button data-action="sb-reset" ${ops.length ? '' : 'disabled'}>Reset sandbox</button><button class="primary" data-action="goto" data-view="commit">Commit step (${ops.length} pending) →</button></div>
    </div>
    <div class="sb-grid">
      <div>
        <section class="card">
          <h3>Stage a move</h3>
          <input type="search" placeholder="Search free agents / trade targets…" value="${esc(state.ui.sbSearch || '')}" data-change="sb-search" aria-label="Search players">
          ${searchResults(after)}
          <div class="trade">
            <div><h4>Trade away</h4>${tOut.map(id => `<span class="pill">${esc(D.byId.get(id).name)} <button class="x" data-action="trade-out-rm" data-id="${id}" aria-label="Remove">×</button></span>`).join('') || '<span class="muted tiny">Tick players in your roster below</span>'}</div>
            <div><h4>Receive</h4>${tIn.map(id => `<span class="pill">${esc(D.byId.get(id).name)} <button class="x" data-action="trade-in-rm" data-id="${id}" aria-label="Remove">×</button></span>`).join('') || '<span class="muted tiny">Search above, then “+ Trade target”</span>'}</div>
            <button class="primary" data-action="trade-stage" ${tOut.length && tIn.length ? '' : 'disabled'}>Stage trade</button>
          </div>
        </section>

        <section class="card">
          <h3>Pending sandbox moves</h3>
          ${ops.length ? `<ol class="ops">${ops.map(o => `<li>${esc(describeOp(o))} <button class="sm" data-action="op-rm" data-key="${o.key}">Undo</button></li>`).join('')}</ol>` : '<p class="muted small">None yet.</p>'}
        </section>

        <section class="card">
          <h3>Sandbox roster <span class="muted small">${after.length} players (${before.length} committed)</span></h3>
          ${after.length ? `<div class="tablewrap"><table class="grid compact">
            <thead><tr><th title="Trade away">⇄</th><th>Player</th><th>Team</th><th>Pos</th><th>Div</th><th>GP</th><th>P / W</th><th>Value</th><th>Status</th><th></th></tr></thead>
            <tbody>${rosterRows.map(p => `<tr class="${before.includes(p.id) ? '' : 'added'}">
              <td><input type="checkbox" data-change="trade-out" value="${p.id}" ${tOut.includes(p.id) ? 'checked' : ''} aria-label="Trade away ${esc(p.name)}"></td>
              <td>${plink(p)} ${injBadge(p)} ${ppChip(p.role)}</td><td>${teamChip(p.team)}</td><td>${posLabel(p)}</td><td class="tiny">${esc(div(p.id))}</td>
              <td class="num">${fmt.num(p.proj?.gp)}</td><td class="num">${p.pos === 'G' ? fmt.num(p.proj?.w) + ' W' : fmt.num(p.proj?.p)}</td>
              <td class="num strong">${fmt.num(valueOf(p)?.vorp, 1)}</td>
              <td>${before.includes(p.id) ? '' : '<span class="badge good">new</span>'}${disparityFlags(p).length ? `<span class="badge warn" title="${esc(disparityFlags(p).map(f => f.text).join('\n'))}">flag</span>` : ''}</td>
              <td><button class="sm" data-action="sb-drop" data-id="${p.id}">Drop</button></td></tr>`).join('')}</tbody></table></div>`
            : '<p class="muted">Your roster is empty. Draft players in Draft mode, set your roster in Commit → “Sync with league”, or add players here.</p>'}
          ${before.filter(id => !after.includes(id)).length ? `<p class="small">Leaving: ${before.filter(id => !after.includes(id)).map(id => plink(D.byId.get(id))).join(', ')}</p>` : ''}
        </section>
      </div>
      <aside>
        <section class="card"><h3>Projected impact by category</h3>${impactTable(before, after)}</section>
        <section class="card"><h3>Division / conference balance</h3>${balancePanel(after)}</section>
        <section class="card"><h3>Disparity flags</h3>
          ${flagged.length ? flagged.map(([p, fl]) => `<div class="dflag"><b>${plink(p)}</b>${fl.map(flagChip).join('')}</div>`).join('') : '<p class="muted small">No rostered player is underperforming projection or contradicting the 3-year trend.</p>'}
          ${D.meta.seasonStarted ? '' : '<p class="tiny muted">Underperformance flags turn on once the regular season has games (pipeline pulls current stats each run).</p>'}
        </section>
      </aside>
    </div>`;
}

export function renderCommit() {
  const ops = state.roster.ops;
  const L = state.league;
  const sel = state.ui.commitSel || [];
  return `<div class="view-head"><h1>Commit moves</h1>
    <p class="muted">Separate from the sandbox. Make each move in your real league first, tick it, then commit. Committing updates the roster this app treats as your real one; it does not contact your league platform.</p></div>
    <section class="card">
      <div class="row between wrap"><h3>Pending moves</h3>
      ${L.url ? `<a class="button" href="${esc(L.url)}" target="_blank" rel="noopener">Open my league ↗</a>` : '<span class="muted small">Add your league URL in League settings for a quick link.</span>'}</div>
      ${ops.length ? `<ul class="plain commit">${ops.map(o => `<li><label><input type="checkbox" data-change="commit-sel" value="${o.key}" ${sel.includes(o.key) ? 'checked' : ''}> ${esc(describeOp(o))}</label></li>`).join('')}</ul>
      <input type="text" placeholder="Note (optional, e.g. waiver claim #3)" data-change="commit-note" value="${esc(state.ui.commitNote || '')}">
      <div class="btnrow"><button class="primary" data-action="commit" ${sel.length ? '' : 'disabled'}>I made these ${sel.length || ''} move(s) in my league: commit</button></div>`
      : '<p class="muted">No pending moves. Build them in the Sandbox.</p>'}
    </section>
    <section class="card">
      <h3>Sync with league</h3>
      <p class="small muted">Paste your real roster (one player per line, names as they appear anywhere) to replace the committed roster, e.g. at the start of the season or after moves made elsewhere.</p>
      <textarea rows="6" data-change="sync-text" placeholder="Connor McDavid&#10;Cale Makar&#10;…">${esc(state.ui.syncText || '')}</textarea>
      <div class="btnrow"><button data-action="sync">Replace committed roster</button></div>
    </section>
    <section class="card">
      <h3>History</h3>
      ${state.roster.history.length ? `<ul class="plain">${state.roster.history.map(h => `<li><span class="muted small">${fmt.dateTime(h.ts)}</span> ${h.ops.map(o => esc(describeOp(o))).join('; ')}${h.note ? ` <i class="muted">(${esc(h.note)})</i>` : ''}</li>`).join('')}</ul>` : '<p class="muted small">Nothing committed yet.</p>'}
    </section>`;
}

export const actions = {
  'sb-add': id => {
    if (sandbox().includes(id)) return;
    const ops = state.roster.ops;
    const undo = ops.find(o => o.type === 'drop' && o.id === id);
    if (undo) removeOp(undo.key); else addOp({ type: 'add', id });
    toast(`Sandbox: added ${D.byId.get(id).name}`);
  },
  'sb-drop': id => {
    const undo = state.roster.ops.find(o => o.type === 'add' && o.id === id);
    if (undo) removeOp(undo.key); else addOp({ type: 'drop', id });
  },
  'sb-reset': () => update(s => { s.roster.ops = []; s.ui.tradeIn = []; s.ui.tradeOut = []; }),
  'op-rm': (_, el) => removeOp(el.dataset.key),
  'trade-in': id => update(s => { s.ui.tradeIn = [...new Set([...(s.ui.tradeIn || []), id])]; }),
  'trade-in-rm': id => update(s => { s.ui.tradeIn = (s.ui.tradeIn || []).filter(x => x !== id); }),
  'trade-out-rm': id => update(s => { s.ui.tradeOut = (s.ui.tradeOut || []).filter(x => x !== id); }),
  'trade-stage': () => {
    const out = (state.ui.tradeOut || []).filter(id => sandbox().includes(id));
    addOp({ type: 'trade', out, in: state.ui.tradeIn || [] });
    update(s => { s.ui.tradeIn = []; s.ui.tradeOut = []; });
  },
  commit: () => {
    commitOps(state.ui.commitSel || [], state.ui.commitNote);
    update(s => { s.ui.commitSel = []; s.ui.commitNote = ''; });
    toast('Committed');
  },
  sync: () => {
    const lines = (state.ui.syncText || '').split('\n').map(x => x.trim()).filter(Boolean);
    const ids = [], missed = [];
    for (const l of lines) {
      const n = normName(l);
      const p = D.players.find(x => x._name === n) || D.players.find(x => x._name.includes(n) || n.includes(x._name));
      if (p) ids.push(p.id); else missed.push(l);
    }
    if (!ids.length) { toast('No players matched'); return; }
    if (!confirm(`Replace committed roster with ${ids.length} players?${missed.length ? `\nNot matched: ${missed.join(', ')}` : ''}`)) return;
    update(s => {
      s.roster.history.unshift({ ts: new Date().toISOString(), ops: [], note: `Synced ${ids.length} players from league` });
      s.roster.committed = [...new Set(ids)];
      s.roster.ops = [];
      s.ui.syncText = '';
    });
  },
};

export function onChange(key, el) {
  if (key === 'sb-search') update(s => { s.ui.sbSearch = el.value; });
  if (key === 'trade-out') update(s => { const set = new Set(s.ui.tradeOut || []); el.checked ? set.add(+el.value) : set.delete(+el.value); s.ui.tradeOut = [...set]; });
  if (key === 'commit-sel') update(s => { const set = new Set(s.ui.commitSel || []); el.checked ? set.add(el.value) : set.delete(el.value); s.ui.commitSel = [...set]; });
  if (key === 'commit-note') update(s => { s.ui.commitNote = el.value; }, { render: false });
  if (key === 'sync-text') update(s => { s.ui.syncText = el.value; }, { render: false });
}
