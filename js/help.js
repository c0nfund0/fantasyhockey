// Hover help for every control, plus a lightweight tooltip that appears faster than the native one.
// Explicit title="" attributes in the views (contextual details) win; this map fills in everything else.

const ACTION = {
  'draft-me': 'You drafted this player. Adds them to your committed roster and advances the pick counter.',
  'draft-other': 'Another team drafted this player. Removes them from best-available lists and suggestions.',
  'draft-undo': 'Undo the last pick recorded on the draft board.',
  'draft-reset': 'Clear the whole draft board. Players you drafted stay on your committed roster.',
  'sb-add': 'Add this player to the sandbox. Hypothetical only: your real roster is not changed until you commit.',
  'sb-drop': 'Drop this player in the sandbox (hypothetical). Undo any time from “Pending sandbox moves”.',
  'sb-reset': 'Throw away every hypothetical move and return the sandbox to your committed roster.',
  'op-rm': 'Undo this sandbox move.',
  'trade-in': 'Add this player to the “Receive” side of a trade you are building.',
  'trade-in-rm': 'Remove from the trade.',
  'trade-out-rm': 'Remove from the trade.',
  'trade-stage': 'Stage the trade in the sandbox so you can see its category impact before proposing it for real.',
  commit: 'Apply the ticked moves to your committed roster. Do this after you have made them in your real league; the app never contacts your league.',
  sync: 'Replace your committed roster with the pasted list, e.g. at season start or after moves made elsewhere.',
  goto: 'Go to the Commit step to finalize sandbox moves.',
  'league-reset': 'Restore all league settings to defaults (12-team H2H categories).',
  export: 'Download your settings, rosters and draft board as a JSON backup.',
  'refresh-inj': 'Fetch the latest injury report from ESPN right now (the server also refreshes it every ~20 minutes).',
  'tz-browser': 'Show game times in this device’s timezone.',
  'tz-helsinki': 'Show game times in Helsinki time (the default).',
  'pick-week': 'Show the game list for this fantasy week.',
  'pane-popout': 'Open the team context pane in its own window, e.g. on a second monitor. It stays in sync with this window.',
  'pane-close': 'Hide the team context pane. Reopen it with “Team pane” in the header.',
  'toggle-pane': 'Show or hide the team context pane (lines, PP units, injuries, role security, outlook).',
  'toggle-height': 'Switch height between centimetres and feet/inches everywhere, instantly.',
  'toggle-weight': 'Switch weight between kilograms and pounds everywhere, instantly.',
  'toggle-toi': 'Switch ice time between mm:ss and decimal minutes.',
  'toggle-pct': 'Switch percentages between 91.2% and .912 style.',
  'profile-close': 'Close the player profile (Esc).',
  'sg-try': 'Stage this suggestion’s moves in the sandbox so you can check the impact before doing anything real.',
  'sg-taken': 'This player is already on another team in your league. Hide them from suggestions.',
  'sg-dismiss': 'Hide this suggestion. It returns if you restore dismissed suggestions.',
  'sg-reset': 'Bring back dismissed suggestions and players you marked as taken.',
  'reload-app': 'Load the new version of the app. Your settings and rosters are kept.',
  'help-jump': 'Jump to this section.',
  'espn-connect': 'Read the league from ESPN and list its teams so you can pick yours.',
  'espn-import': 'Copy roster positions (C/LW/RW/F/D/UTIL/G/bench/IR) and number of teams from your ESPN league settings.',
  'espn-sync': 'Pull the latest draft picks and every team’s roster from ESPN now.',
  'espn-sync-now': 'Pull the latest draft picks from ESPN now (auto-sync also runs every 15 seconds on this page).',
  'espn-roster': 'Replace the committed roster here with your current ESPN roster.',
};

const CHANGE = {
  'filter:players:q': 'Filter by player name.',
  'filter:players:pos': 'Filter by position eligibility. Multi-position players appear under each position.',
  'filter:players:team': 'Show one NHL team.',
  'filter:players:flag': 'Show only players with a signal: buy-low, sell-high, projection-vs-trend gaps, injuries or your roster.',
  'draft-filter': 'Find any available player on the board.',
  'draft-slot': 'Your pick position in round 1. Used for snake-draft math (“your next pick”, “likely gone”).',
  'sb-search': 'Search free agents or trade targets (anyone not on your sandbox roster).',
  'trade-out': 'Tick to put this player on the “Trade away” side of a trade.',
  'commit-sel': 'Tick once you have made this move in your real league.',
  'commit-note': 'Optional note stored in your move history.',
  'sync-text': 'One player per line. Names are matched loosely (accents and punctuation ignored).',
  'sched-roster': 'Count games for your committed roster or for the sandbox version.',
  'pane-team': 'Pick the team shown in the context pane. Clicking any team chip also switches it.',
  'sg-hideowned': 'Most leagues roster anyone owned in 85%+ of ESPN leagues, so they are rarely really available.',
  'proj-only-scored': 'Hide projected stats your league does not count in player profiles. Past seasons always show everything.',
  'po-week': 'Tick your league’s fantasy playoff weeks. Schedule and suggestions weigh games in these weeks.',
  import: 'Restore a backup exported from this app.',
  'espn:s2': 'Only for private leagues: the espn_s2 cookie from a browser logged in to ESPN.',
  'espn:swid': 'Only for private leagues: the SWID cookie ({…}). Also used to find your team automatically.',
  'espn:teamId': 'Your team in the ESPN league. Picks by this team are marked as yours.',
  'espn:auto': 'Keep draft picks and other teams’ rosters in sync with ESPN automatically.',
  'league:format': 'H2H categories: win each category weekly. Roto: season-long category ranks. Points: every stat is worth fixed points.',
  'league:name': 'Just a label.',
  'league:teams': 'Number of teams. Drives replacement level: more teams = shallower free-agent pool = scarcity matters more.',
  'league:draftSlot': 'Your first-round pick position.',
  'league:url': 'Your league page. For ESPN leagues (URL contains leagueId=) this also enables automatic draft and roster sync.',
  'league:weekStart': 'Day your fantasy week starts (most platforms: Monday).',
  'league:divWarn': 'Warn when more than this share of your roster plays in one division.',
  'league:confWarn': 'Warn when more than this share of your roster plays in one conference.',
  'league:goalieDiscount': 'Haircut on goalie value because save % and wins are the least predictable stats year to year.',
  'set:tz': 'Timezone for every game time in the app. Default: Europe/Helsinki.',
  'set:clock': '24-hour or 12-hour clock.',
  'set:locale': 'Number and date formatting (decimal separator, month names).',
  'set:height': 'Height units everywhere.',
  'set:weight': 'Weight units everywhere.',
  'set:toi': 'Ice time as mm:ss or decimal minutes.',
  'set:pct': 'Percentages as 91.2% or .912.',
};
const CHANGE_PREFIX = {
  'cat-on:': 'Count this category in your league. Untick to ignore (“punt”) it.',
  'w:': 'Weight (category leagues: 1 = normal, 2 = double, 0.5 = half) or points per unit (points leagues). Rankings update live.',
  'slot:': 'Starting slots per team at this position. F = any forward, UTIL = any skater, BN = bench, IR = injured reserve.',
};

const SORT = {
  rank: 'Overall rank in your league (skaters and goalies) by value over replacement.',
  name: 'Player. Click for the full stats dashboard.',
  team: 'NHL team. Click the chip to open that team in the context pane.',
  pos: 'Fantasy position eligibility (from ESPN). PP1/PP2 chip = projected power-play unit.',
  val: 'Value over replacement under YOUR league settings. How much better than the best freely available player at the same position.',
  adp: 'ESPN average draft position: where the market takes this player.',
  adpn: 'ADP minus your rank. Positive (green) = discount: you can get them later than they are worth. Negative (red) = reach.',
  age: 'Age on 1 January of this season.',
  ht: 'Height (toggle cm / ft-in in the header).',
  wt: 'Weight (toggle kg / lb in the header).',
  gp: 'Projected games played (availability history, minus current injury).',
  toi: 'Projected average ice time per game, all situations.',
  g: 'Projected goals.', a: 'Projected assists.', p: 'Projected points.', ppp: 'Projected power-play points.',
  sog: 'Projected shots on goal.', hit: 'Projected hits.', blk: 'Projected blocked shots.', pim: 'Projected penalty minutes.',
  gs: 'Projected games started.', w: 'Projected wins.', svp: 'Projected save percentage.', gaa: 'Projected goals-against average.', so: 'Projected shutouts.',
  luck: 'Luck check: last season’s PDO, on-ice SH%/SV%, shooting % and goals vs xG compared with the player’s career norms.',
  trend: 'Flags where the projection disagrees with the 3-year underlying trend (points/60, ixG/60, xGF%).',
};

const CLASS = [
  ['.pp.pp1', 'First power-play unit: the biggest single driver of fantasy points.'],
  ['.pp.pp2', 'Second power-play unit: fewer PP minutes, less upside.'],
  ['.sec', 'Role security: how safe the player’s line/PP slot is (seasons held vs threats).'],
  ['.tag.rebuilding', 'Rebuilding/tanking team: stars get big minutes, but wins and +/- suffer and veterans may be traded.'],
  ['.tag.bubble', 'Bubble team: could buy or sell at the trade deadline, so recheck around early March.'],
  ['.tag.established', 'Established contender: deep lineup spreads minutes; veterans may rest late in the season.'],
  ['.tag.env', 'Scoring environment: high-event teams inflate counting stats, low-event teams suppress them.'],
  ['.adp.discount', 'Your league values this player above the market: a bargain at ADP.'],
  ['.adp.reach', 'The market values this player above your league scoring: you would be reaching at ADP.'],
  ['.need', 'Starting slots filled / available at this position.'],
  ['.stype', 'Suggestion type.'],
  ['.plink', 'Open the player’s stats dashboard.'],
  ['.lowwk', 'Your roster plays noticeably fewer games than usual this week.'],
  ['.flag.bad', 'Warning.'],
];

const NAV = {
  players: 'Every player with league-specific value, projections, luck and trend signals.',
  suggestions: 'Automatic roster suggestions, each with the reasoning behind it.',
  draft: 'Draft assistant: suggested pick, best available by position, value vs ADP, scarcity warnings.',
  sandbox: 'Try adds, drops and trades hypothetically and see the category impact.',
  commit: 'Finalize moves you have made in your real league.',
  schedule: 'Games per fantasy week for every team and your roster; playoff weeks highlighted.',
  league: 'Your league’s format, roster slots, categories and weights. Drives every value in the app.',
  settings: 'Timezone, units and number formats.',
  help: 'How to play fantasy hockey and how to use this tool.',
};

function setTip(el, text) {
  if (!text || el.hasAttribute('title') || el.dataset.tip) return;
  el.dataset.tip = text;
}

export function applyHelp(root = document) {
  root.querySelectorAll('[data-action]').forEach(el => setTip(el, ACTION[el.dataset.action]));
  root.querySelectorAll('[data-change]').forEach(el => {
    const k = el.dataset.change;
    const text = CHANGE[k] || Object.entries(CHANGE_PREFIX).find(([p]) => k.startsWith(p))?.[1];
    setTip(el, text);
    const lab = el.closest('label');
    if (lab) setTip(lab, text);
  });
  root.querySelectorAll('[data-sort]').forEach(el => setTip(el, SORT[el.dataset.sort.split(':')[1]]));
  root.querySelectorAll('nav a[href^="#"]').forEach(el => setTip(el, NAV[el.getAttribute('href').slice(1)]));
  for (const [sel, text] of CLASS) root.querySelectorAll(sel).forEach(el => setTip(el, text));
}

// ---- tooltip: shows title/data-tip after a short delay, works with keyboard focus too
let tipEl, timer, current;
function show(el) {
  if (el.hasAttribute('title')) { el.dataset.tip = el.getAttribute('title'); el.removeAttribute('title'); }
  const text = el.dataset.tip;
  if (!text) return;
  tipEl ||= Object.assign(document.createElement('div'), { className: 'tooltip', role: 'tooltip' });
  tipEl.textContent = text;
  (el.closest('dialog') || document.body).appendChild(tipEl);
  const r = el.getBoundingClientRect();
  const w = Math.min(320, window.innerWidth - 16);
  tipEl.style.maxWidth = `${w}px`;
  tipEl.classList.add('show');
  const tr = tipEl.getBoundingClientRect();
  let top = r.bottom + 6;
  if (top + tr.height > window.innerHeight - 8) top = r.top - tr.height - 6;
  const left = Math.max(8, Math.min(r.left + r.width / 2 - tr.width / 2, window.innerWidth - tr.width - 8));
  tipEl.style.top = `${top}px`;
  tipEl.style.left = `${left}px`;
}
function hide() { clearTimeout(timer); current = null; tipEl?.classList.remove('show'); }

function target(e) { return e.target.closest?.('[data-tip], [title]'); }
document.addEventListener('mouseover', e => {
  const el = target(e);
  if (el === current) return;
  hide();
  if (!el) return;
  current = el;
  timer = setTimeout(() => show(el), 280);
});
document.addEventListener('focusin', e => { const el = target(e); if (el) { hide(); current = el; timer = setTimeout(() => show(el), 400); } });
document.addEventListener('focusout', hide);
document.addEventListener('scroll', hide, true);
document.addEventListener('click', hide, true);
