// Team context pane: lines, PP units, injuries, role security, outlook, event environment.
import { D } from '../data.js';
import { esc, fmt } from '../format.js';
import { OUTLOOK_NOTES, envNote, outlookFreshness, injuryInfo } from '../analysis.js';
import { plink, injBadge, secChip, ppChip } from '../ui.js';
import { state } from '../store.js';
import { valueOf } from '../value.js';

function cell(id) {
  const p = D.byId.get(id);
  if (!p) return '<span class="muted">—</span>';
  return `<div class="lcell">${plink(p)} ${injBadge(p)} ${ppChip(p.role)} ${secChip(p.role)}<div class="muted tiny">${fmt.toi(p.proj?.toi)} TOI · ${p.proj ? fmt.num(p.proj.p) + ' pts proj' : 'no proj'}</div></div>`;
}

export function renderTeam(abbrev, { popout = false } = {}) {
  const t = D.teams[abbrev];
  if (!t) return '<p>Pick a team.</p>';
  const fr = outlookFreshness();
  const roster = D.players.filter(p => p.team === abbrev);
  const injured = roster.map(p => [p, injuryInfo(p)]).filter(([, i]) => i);
  const stars = roster.filter(p => p.pos !== 'G' && p.proj).sort((a, b) => b.proj.p - a.proj.p).slice(0, 3);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = D.schedule.filter(g => (g.h === abbrev || g.a === abbrev) && g.d >= today).slice(0, 6);
  const sel = `<select data-change="pane-team" aria-label="Team">${Object.values(D.teams).sort((a, b) => a.name.localeCompare(b.name)).map(x => `<option value="${x.abbrev}" ${x.abbrev === abbrev ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>`;
  const ln = t.lines.map((l, i) => `<tr><th>L${i + 1}</th><td>${cell(l.LW)}</td><td>${cell(l.C)}</td><td>${cell(l.RW)}</td></tr>`).join('');
  const pr = t.pairs.map((l, i) => `<tr><th>P${i + 1}</th><td>${cell(l.LD)}</td><td>${cell(l.RD)}</td></tr>`).join('');
  const unit = ids => ids.map(id => D.byId.get(id)).filter(Boolean).map(p => `<li>${plink(p)} <span class="muted tiny">${p.pos} · ${fmt.toi(p.proj?.pptoi)} PP/gp</span> ${injBadge(p)}</li>`).join('');
  const gl = t.g.map((id, i) => { const p = D.byId.get(id); return p ? `<li><b>${i ? 'Backup' : 'Starter'}</b> ${plink(p)} ${injBadge(p)} ${secChip(p.role)} <span class="muted tiny">${fmt.num(p.proj?.gs)} GS · ${fmt.pct(p.proj?.svp, 2)} proj</span></li>` : ''; }).join('');
  const sec = roster.filter(p => p.role && p.pos !== 'G').sort((a, b) => (valueOf(b)?.vorp ?? -99) - (valueOf(a)?.vorp ?? -99)).slice(0, 14);

  return `
  <div class="pane-head">
    ${sel}
    <div class="pane-btns">
      ${popout ? '' : `<button data-action="pane-popout" title="Open in a separate window">Pop out ↗</button><button data-action="pane-close" title="Hide team pane" aria-label="Close">✕</button>`}
    </div>
  </div>
  <div class="pane-body">
    <div class="tname"><h2>${esc(t.name)}</h2><span class="muted">${esc(t.division || '')} · ${esc(t.conference || '')}</span></div>

    <section class="card">
      <div class="row between"><h3>Team outlook</h3><span class="tag ${t.outlook.split(' ')[0].toLowerCase()}">${esc(t.outlook)}</span></div>
      <p class="small">${esc(OUTLOOK_NOTES[t.outlook])}</p>
      ${stars.length ? `<p class="small">Projections this affects most: ${stars.map(plink).join(', ')}.</p>` : ''}
      <p class="muted tiny">Basis: ${fmt.num(t.outlookScore.ptpct * 100, 1)}% points pace${t.now ? ` (blends ${t.now.gp} GP this season)` : ' (last season)'}, ${fmt.pct(t.outlookScore.xgpct)} 5v5 xGF, core age ${fmt.num(t.outlookScore.avgAge, 1)}.
      Last season ${t.last.w}-${t.last.l}-${t.last.otl}, ${t.last.pts} pts, GD ${fmt.signed(t.last.gd)}.
      As of ${fr.gen ? fmt.dateTime(fr.gen.toISOString(), { weekday: undefined }) : '—'}.</p>
      ${fr.deadline ? '<p class="flag warn">Trade-deadline window: outlook can flip fast. Standings refresh hourly.</p>' : fr.stale ? '<p class="flag warn">Data hasn’t refreshed for a while. The server’s auto-refresh may be failing (check container logs).</p>' : ''}
      ${t.coachChange ? `<p class="flag warn">Coaching change: ${esc(t.coachChange)}</p>` : ''}
    </section>

    <section class="card">
      <div class="row between"><h3>Scoring environment</h3><span class="tag env">${esc(t.env)}</span></div>
      <p class="small">${esc(envNote(t))}</p>
      <div class="kv tiny">
        <span>xGF/60 <b>${fmt.num(t.rates.xgf60, 2)}</b></span><span>xGA/60 <b>${fmt.num(t.rates.xga60, 2)}</b></span>
        <span>CF/60 <b>${fmt.num(t.rates.cf60, 1)}</b></span><span>CA/60 <b>${fmt.num(t.rates.ca60, 1)}</b></span>
        <span>GF/gp <b>${fmt.num(t.rates.gf_pg, 2)}</b></span><span>GA/gp <b>${fmt.num(t.rates.ga_pg, 2)}</b></span>
      </div>
    </section>

    <section class="card">
      <h3>Projected lines</h3>
      <p class="muted tiny">Derived from last season’s ice-time usage with the current roster; newcomers slotted by their prior usage. Chips: <span class="pp pp1">PP1</span> <span class="pp pp2">PP2</span>, then role security.</p>
      <div class="tablewrap"><table class="lines"><thead><tr><th></th><th>LW</th><th>C</th><th>RW</th></tr></thead><tbody>${ln}</tbody></table></div>
      <div class="tablewrap"><table class="lines"><thead><tr><th></th><th>LD</th><th>RD</th></tr></thead><tbody>${pr}</tbody></table></div>
      <h4>Goalies</h4><ul class="plain">${gl}</ul>
    </section>

    <section class="card">
      <h3>Power play</h3>
      <div class="cols2 tight"><div><h4><span class="pp pp1">PP1</span></h4><ul class="plain">${unit(t.pp1)}</ul></div>
      <div><h4><span class="pp pp2">PP2</span></h4><ul class="plain">${unit(t.pp2)}</ul></div></div>
    </section>

    <section class="card">
      <h3>Injuries</h3>
      ${injured.length ? `<ul class="plain">${injured.map(([p, i]) => `<li>${plink(p)} <span class="badge ${i.status === 'Day-To-Day' ? 'warn' : 'bad'}">${esc(i.label)}</span> ${esc(i.type || '')}
        ${i.ret ? `· back ~${fmt.day(i.ret)} (${i.games} GP)` : '· no timeline'}
        <div class="tiny">Usage-cliff risk: <b class="${i.cliff === 'High' ? 'neg' : i.cliff === 'Medium' ? 'warnc' : ''}">${i.cliff}</b>. ${esc(i.why)}</div></li>`).join('')}</ul>` : '<p class="muted small">No reported injuries.</p>'}
    </section>

    <section class="card">
      <h3>Role security</h3>
      <table class="grid compact"><thead><tr><th>Player</th><th>Slot</th><th>Held</th><th>Security</th></tr></thead><tbody>
      ${sec.map(p => `<tr><td>${plink(p)}</td><td>${esc(p.role.slot)} ${ppChip(p.role)}</td><td>${p.role.held} yr</td><td>${secChip(p.role)}${p.role.threats.length ? `<div class="tiny muted">${p.role.threats.map(esc).join('<br>')}</div>` : ''}</td></tr>`).join('')}
      </tbody></table>
      <p class="muted tiny">“Held” = consecutive seasons in the same usage tier (and PP unit) with this team. Coaching changes come from data/overrides.json.</p>
    </section>

    <section class="card">
      <h3>Next games <span class="muted tiny">(${esc(fmt.tzLabel())})</span></h3>
      <ul class="plain">${upcoming.map(g => `<li>${fmt.dateTime(g.t)} · ${g.h === abbrev ? 'vs' : '@'} ${g.h === abbrev ? g.a : g.h}</li>`).join('') || '<li class="muted">No upcoming games.</li>'}</ul>
    </section>
  </div>`;
}
