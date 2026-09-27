// Player stats dashboard: bio, 3 seasons of advanced stats, projection, luck, trend gap.
import { D } from '../data.js';
import { esc, fmt } from '../format.js';
import { luck, trend, paceGap, injuryInfo } from '../analysis.js';
import { valueOf, adpNote } from '../value.js';
import { state, CATS } from '../store.js';
import { teamChip, injBadge, posLabel, flagChip, secChip, ppChip, catFmt } from '../ui.js';
import { sandbox, committed } from '../roster.js';

function skaterSeasons(p) {
  const keys = D.meta.histKeys;
  const cols = [
    ['GP', s => fmt.num(s.gp)], ['Team', s => esc(s.team)],
    [`TOI (${fmt.toiUnit()})`, s => fmt.toi(s.toi), 'Average ice time per game, all situations'],
    [`PP TOI`, s => fmt.toi(s.pptoi), 'Power-play (5v4) ice time per game'],
    ['CF%', s => fmt.pct(s.cf), '5v5 Corsi for %: share of shot attempts while on ice'],
    ['xGF%', s => fmt.pct(s.xgf), '5v5 expected-goals share while on ice'],
    ['ixG', s => fmt.num(s.ixg, 1), 'Individual expected goals'],
    ['G', s => fmt.num(s.g)], ['A', s => fmt.num(s.a)], ['P', s => fmt.num(s.p)],
    ['SOG', s => fmt.num(s.sog)], ['SH%', s => fmt.pct(s.sh)],
    ['oiSH%', s => fmt.pct(s.oish), '5v5 on-ice shooting %'], ['oiSV%', s => fmt.pct(s.oisv), '5v5 on-ice save %'],
    ['PDO', s => fmt.pdo(s.pdo), 'oiSH% + oiSV% at 5v5'],
    ['PPP', s => fmt.num(s.ppp)], ['+/-', s => fmt.signed(s.pm)], ['PIM', s => fmt.num(s.pim)],
    ['HIT', s => fmt.num(s.hit)], ['BLK', s => fmt.num(s.blk)],
  ];
  if (p.pos === 'C') cols.push(['FOW', s => fmt.num(s.fow)]);
  const rows = keys.map((k, i) => {
    const s = p.seasons?.[k];
    return `<tr><th>${D.meta.hist[i]}</th>${s ? cols.map(c => `<td>${c[1](s)}</td>`).join('') : `<td colspan="${cols.length}" class="muted">Did not play in the NHL</td>`}</tr>`;
  });
  if (p.cur) rows.push(`<tr class="cur"><th>${D.meta.season} to date</th>${cols.map(c => `<td>${c[1](p.cur)}</td>`).join('')}</tr>`);
  const pr = p.proj;
  if (pr) {
    const cells = {
      GP: fmt.num(pr.gp), Team: esc(p.team), [`TOI (${fmt.toiUnit()})`]: fmt.toi(pr.toi), 'PP TOI': fmt.toi(pr.pptoi), 'ixG': fmt.num(pr.xg, 1),
      G: fmt.num(pr.g), A: fmt.num(pr.a), P: fmt.num(pr.p), SOG: fmt.num(pr.sog), 'SH%': fmt.pct(pr.sh), PPP: fmt.num(pr.ppp),
      '+/-': fmt.signed(pr.pm), PIM: fmt.num(pr.pim), HIT: fmt.num(pr.hit), BLK: fmt.num(pr.blk), FOW: fmt.num(pr.fow),
    };
    rows.push(`<tr class="proj"><th>${D.meta.season} projection</th>${cols.map(c => `<td>${cells[c[0]] ?? '<span class="muted">—</span>'}</td>`).join('')}</tr>`);
  }
  return `<div class="tablewrap"><table class="grid compact"><thead><tr><th>Season</th>${cols.map(c => `<th title="${esc(c[2] || '')}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function goalieSeasons(p) {
  const cols = [['GP', s => fmt.num(s.gp)], ['GS', s => fmt.num(s.gs)], ['Team', s => esc(s.team || p.team)], ['W', s => fmt.num(s.w)],
    ['L', s => fmt.num(s.l)], ['OTL', s => fmt.num(s.otl)], ['SV%', s => fmt.pct(s.svp, 2)], ['GAA', s => fmt.num(s.gaa, 2)],
    ['SO', s => fmt.num(s.so)], ['SA', s => fmt.num(s.sa)], ['GSAx', s => fmt.signed(s.gsax, 1), 'Goals saved above expected (MoneyPuck)']];
  const rows = D.meta.histKeys.map((k, i) => {
    const s = p.seasons?.[k];
    return `<tr><th>${D.meta.hist[i]}</th>${s ? cols.map(c => `<td>${c[1](s)}</td>`).join('') : `<td colspan="${cols.length}" class="muted">Did not play in the NHL</td>`}</tr>`;
  });
  if (p.cur) rows.push(`<tr class="cur"><th>${D.meta.season} to date</th>${cols.map(c => `<td>${c[1](p.cur)}</td>`).join('')}</tr>`);
  if (p.proj) rows.push(`<tr class="proj"><th>${D.meta.season} projection</th>${cols.map(c => `<td>${c[0] === 'GSAx' ? '—' : c[1]({ ...p.proj, team: p.team })}</td>`).join('')}</tr>`);
  return `<div class="tablewrap"><table class="grid compact"><thead><tr><th>Season</th>${cols.map(c => `<th title="${esc(c[2] || '')}">${c[0]}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

function spark(vals, w = 120, h = 32) {
  const v = vals.filter(x => x != null);
  if (v.length < 2) return '';
  const mn = Math.min(...v), mx = Math.max(...v), rg = mx - mn || 1;
  const pts = vals.map((x, i) => `${(i / (vals.length - 1)) * (w - 8) + 4},${h - 4 - ((x - mn) / rg) * (h - 8)}`);
  return `<svg class="spark" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><polyline points="${pts.join(' ')}" fill="none" stroke="currentColor" stroke-width="2"/>${pts.map(pt => `<circle cx="${pt.split(',')[0]}" cy="${pt.split(',')[1]}" r="2.5" fill="currentColor"/>`).join('')}</svg>`;
}

export function renderProfile(p) {
  const v = valueOf(p);
  const adp = adpNote(p);
  const inj = injuryInfo(p);
  const lk = luck(p);
  const tr = trend(p);
  const pg = paceGap(p);
  const team = D.teams[p.team];
  const role = p.role;
  const onRoster = committed().includes(p.id), inSandbox = sandbox().includes(p.id);
  const activeCats = CATS.filter(c => state.league.format === 'points' ? state.league.cats[c.key].pts : state.league.cats[c.key].on);
  const zCells = v?.z ? activeCats.filter(c => (c.grp === 'G') === (p.pos === 'G')).map(c => {
    const z = v.z[c.key] ?? 0;
    return `<div class="zc ${z > 0.5 ? 'pos' : z < -0.5 ? 'neg' : ''}"><span>${c.label}</span><b>${fmt.signed(z, 1)}</b></div>`;
  }).join('') : '';

  return `
  <div class="profile">
    <header class="phead">
      ${p.img ? `<img src="${esc(p.img)}" alt="" class="mug" loading="lazy" onerror="this.remove()">` : ''}
      <div>
        <h2>${esc(p.name)} ${p.num ? `<span class="muted">#${p.num}</span>` : ''}</h2>
        <div class="meta">
          ${teamChip(p.team)} <span>${posLabel(p)}</span>
          <span>Age ${p.age ?? '—'}</span>
          <span title="Height">${fmt.height(p)}</span>
          <span title="Weight">${fmt.weight(p)}</span>
          ${p.shoots ? `<span>${p.pos === 'G' ? 'Catches' : 'Shoots'} ${p.shoots}</span>` : ''}
          ${injBadge(p)}
        </div>
        <div class="meta">
          ${role ? `<span>Role: <b>${esc(role.slot)}</b></span> ${ppChip(role)} <span>Security ${secChip(role)}</span>` : ''}
          ${team ? `<span class="tag ${team.outlook.split(' ')[0].toLowerCase()}">${esc(team.outlook)}</span> <span class="tag env">${esc(team.env)}</span>` : ''}
        </div>
      </div>
      <div class="pvalue">
        ${v ? `<div class="big">#${v.rank}</div><div class="muted small">your league rank</div>
        <div>Value ${fmt.num(v.vorp, state.league.format === 'points' ? 0 : 2)} <span class="muted small">over repl. ${v.bestPos}</span></div>` : '<div class="muted">No projection</div>'}
        ${adp ? `<div class="adp ${adp.kind}">${esc(adp.text)}</div>` : p.adp ? '' : '<div class="muted small">No ADP</div>'}
        <div class="btnrow">
          ${inSandbox ? `<button data-action="sb-drop" data-id="${p.id}">Drop in sandbox</button>` : `<button data-action="sb-add" data-id="${p.id}">Add in sandbox</button>`}
          ${onRoster ? '<span class="badge good">On your roster</span>' : ''}
        </div>
      </div>
    </header>

    ${inj ? `<section class="card injury"><h3>Injury status</h3>
      <p><b>${esc(inj.label)}</b>${inj.type ? `: ${esc(inj.type)}` : ''}${inj.ret ? ` · estimated return <b>${fmt.day(inj.ret)}</b> (${inj.games ?? '?'} team games)` : ' · no return timeline'}</p>
      <p>Usage-cliff risk on return: <span class="badge ${inj.cliff === 'High' ? 'bad' : inj.cliff === 'Medium' ? 'warn' : 'good'}">${inj.cliff}</span> ${esc(inj.why)}</p>
      ${inj.note ? `<p class="muted small">${esc(inj.note)}</p>` : ''}
    </section>` : ''}

    <section class="card">
      <h3>Last 3 seasons + ${D.meta.season} projection</h3>
      ${p.pos === 'G' ? goalieSeasons(p) : skaterSeasons(p)}
      ${zCells ? `<div class="zrow"><span class="muted small">Category impact (z-score in your league):</span>${zCells}</div>` : ''}
    </section>

    <div class="cols2">
      <section class="card">
        <h3>Luck / regression indicators</h3>
        ${lk ? `<p><span class="verdict ${lk.kind}">${esc(lk.verdict)}</span> <span class="muted small">${esc(lk.basis)} vs career (${D.meta.careerSeasons})</span></p>
        <table class="grid compact luck"><thead><tr><th>Metric</th><th>${esc(lk.basis)}</th><th>Career</th><th>Gap</th><th></th></tr></thead><tbody>
          ${lk.items.map(i => `<tr title="${esc(i.note)}"><td>${i.label}</td><td>${i.val}</td><td>${i.norm}</td><td class="${i.dir}">${i.diff}</td><td>${i.dir === 'high' ? '<span class="flag bad">unsustainable</span>' : i.dir === 'low' ? '<span class="flag good">bounce-back</span>' : ''}</td></tr>`).join('')}
        </tbody></table>` : '<p class="muted">Not enough NHL history for career norms.</p>'}
      </section>
      <section class="card">
        <h3>3-year trend vs projection</h3>
        ${tr && tr.series?.length ? `
          <div class="sparks">
            <div><span class="muted small">Pts/60</span>${spark(tr.series.map(s => s.p60))}<b>${fmt.signed(tr.t.p60 * 100, 0)}%/yr</b></div>
            <div><span class="muted small">ixG/60</span>${spark(tr.series.map(s => s.xg60))}<b>${fmt.signed(tr.t.xg60 * 100, 0)}%/yr</b></div>
            <div><span class="muted small">xGF%</span>${spark(tr.series.map(s => s.xgf))}<b>${fmt.signed(tr.t.xgf, 1)}/yr</b></div>
          </div>
          <p class="small">Pts/82: 3-yr avg <b>${fmt.num(tr.avgP82)}</b> · last season <b>${fmt.num(tr.lastP82)}</b> · projection <b>${fmt.num(tr.projP82)}</b></p>
          ${tr.flags.length ? tr.flags.map(flagChip).join('') : '<span class="flag ok">Projection is consistent with the 3-year underlying trend.</span>'}`
        : `<p class="muted">${esc(tr?.note || (p.pos === 'G' ? 'Goalie trend: see SV% vs career in luck indicators.' : 'No projection.'))}</p>`}
        ${pg ? `<div style="margin-top:.5rem">${flagChip(pg)}</div>` : ''}
      </section>
    </div>

    ${role && role.threats?.length ? `<section class="card"><h3>Role threats</h3><ul>${role.threats.map(t => `<li>${esc(t)}</li>`).join('')}</ul></section>` : ''}
    ${!p.proj ? '<p class="muted small">No projection: no NHL games in the last 3 seasons.</p>' : ''}
  </div>`;
}
