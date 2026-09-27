// Help: how fantasy hockey works, strategy, and how to use every part of this tool.
import { D } from '../data.js';
import { esc } from '../format.js';
import { state } from '../store.js';

const SECTIONS = [
  ['basics', 'Fantasy hockey in 5 minutes'],
  ['formats', 'League formats & scoring'],
  ['season', 'The season: draft, waivers, trades, playoffs'],
  ['stats', 'Stats that matter (and what the jargon means)'],
  ['strategy', 'Strategy playbook'],
  ['start', 'Getting started with this tool'],
  ['draftday', 'Draft day workflow'],
  ['inseason', 'In-season workflow'],
  ['pages', 'Page-by-page reference'],
  ['numbers', 'How the numbers are calculated'],
  ['data', 'Data sources & freshness'],
  ['faq', 'FAQ'],
];

const sec = (id, title, body) => `<section class="card help-sec" id="help-${id}"><h2>${esc(title)}</h2>${body}</section>`;

export function render() {
  const L = state.league;
  return `<div class="view-head"><h1>Help</h1>
    <p class="muted">How fantasy hockey works, how to win at it, and how to use Puck Ledger. Hover any button, column or chip in the app for a short explanation.</p></div>
    <div class="help-grid">
      <nav class="help-toc card" aria-label="Help contents">
        <h3>Contents</h3>
        <ol>${SECTIONS.map(([id, t]) => `<li><a href="#help" data-action="help-jump" data-target="help-${id}">${esc(t)}</a></li>`).join('')}</ol>
      </nav>
      <div class="help-body">

${sec('basics', SECTIONS[0][1], `
<p>In fantasy hockey you manage a team of real NHL players. Each night those players’ real stats (goals, assists, shots, hits, saves…) turn into fantasy production for your team. You compete against other managers in your league over the NHL season.</p>
<ul>
  <li><b>Your league</b> is usually 8–14 teams of friends or strangers on a platform like Yahoo, ESPN or Fantrax.</li>
  <li><b>Your roster</b> has starting slots by position: centers (C), left wings (LW), right wings (RW), defensemen (D), goalies (G), often a utility slot (UTIL, any skater), plus bench (BN) and injured reserve (IR).</li>
  <li><b>Only starters score.</b> Players on your bench earn nothing that day, so you set a lineup (daily or weekly depending on the league).</li>
  <li><b>You build the roster in a draft</b> before the season, then improve it all season by picking up free agents (waivers) and making trades.</li>
  <li><b>The goal</b> is to finish top of the standings and win the fantasy playoffs, which run over the last few weeks of the NHL regular season.</li>
</ul>`)}

${sec('formats', SECTIONS[1][1], `
<dl class="help-dl">
  <dt>Head-to-head categories (H2H cats)</dt>
  <dd>Each week you face one opponent. Every scoring category (e.g. G, A, +/-, PPP, SOG, HIT, W, GAA, SV%, SO) is a separate mini-match; win 6 of 10 categories and your weekly record is 6-4-0. Balanced rosters win; you can also deliberately <i>punt</i> (ignore) a category to dominate the rest.</dd>
  <dt>Rotisserie (roto)</dt>
  <dd>Season-long. Teams are ranked 1…N in every category by season totals and the ranks are summed. No weekly matchups, no playoffs luck; every stat counts all season, so volume and consistency win.</dd>
  <dt>Head-to-head points</dt>
  <dd>Every stat is worth fixed points (e.g. goal 3, assist 2, shot 0.4, win 4). Highest weekly total wins. Simple, and it favors players who fill many columns: high-shot, high-hit, power-play players and workhorse goalies.</dd>
</dl>
<p><b>Ratio categories</b> (GAA, SV%) are averages, not totals: one bad goalie start can hurt them, and in H2H you can protect them by not starting a shaky goalie late in the week.</p>
<p>Your current setup: <b>${esc(L.format === 'points' ? 'H2H points' : L.format === 'roto' ? 'Rotisserie' : 'H2H categories')}</b>, ${L.teams} teams. Change it in <a href="#league">League</a>.</p>`)}

${sec('season', SECTIONS[2][1], `
<ol>
  <li><b>Draft</b> (before the season). Most leagues use a <i>snake</i> draft: the order reverses every round, so pick 1 has picks 1, 24, 25, 48… in a 12-team league. Some use auctions.</li>
  <li><b>Weekly lineups.</b> Start players who play the most games that week, and bench injured players or those without games.</li>
  <li><b>Waivers / free agents.</b> Unrostered players can be added any time (dropped players pass through a short waiver period first). This is where hot streaks, injury replacements and schedule “streamers” come from.</li>
  <li><b>Trades</b> between managers, usually with a review period. The best trades sell a player whose stats are luck-inflated and buy one who has been unlucky.</li>
  <li><b>IR.</b> Players listed as injured can go to IR slots so they don’t block a roster spot.</li>
  <li><b>Trade deadline</b> (NHL, early March): real trades change players’ linemates and power-play roles overnight.</li>
  <li><b>Fantasy playoffs</b>: the last ~3 weeks of the NHL season. Games in those weeks matter most, so plan your roster’s schedule for them.</li>
</ol>`)}

${sec('stats', SECTIONS[3][1], `
<dl class="help-dl">
  <dt>TOI / ATOI</dt><dd>Average ice time per game. More minutes = more chances. The best early sign of a changing role.</dd>
  <dt>PP TOI, PP1 / PP2</dt><dd>Power-play time. Roughly a quarter to a third of a star’s points come on the power play, and the first unit (PP1) gets most of that time. A move onto or off PP1 is one of the biggest swings in fantasy value.</dd>
  <dt>Corsi (CF%)</dt><dd>Share of all shot attempts taken by the player’s team while they are on the ice at 5-on-5. Above 50% = the team controls play with them out there.</dd>
  <dt>Expected goals (xG, xGF%, ixG)</dt><dd>Shot quality: each shot is valued by its chance of scoring (distance, angle, rebound…). xGF% = team’s share of expected goals with the player on ice; ixG = the player’s own expected goals. Process, not results, and more predictive than goals.</dd>
  <dt>Shooting % (SH%)</dt><dd>Goals ÷ shots. Most players have a stable career level; a season far above it usually comes back down.</dd>
  <dt>On-ice SH% / SV%, PDO</dt><dd>Teammates’ shooting % and the goalie’s save % while the player is on the ice at 5v5. PDO is their sum (≈1000 on average). High PDO inflates points and +/-, and it is mostly luck that regresses.</dd>
  <dt>Regression, buy-low, sell-high</dt><dd>Luck evens out. A player with a PDO or shooting % far above their norm is a <b>sell-high</b>; one far below is a <b>buy-low</b>, especially if their shots and xG are steady.</dd>
  <dt>High-event vs low-event teams</dt><dd>Some teams play wide-open hockey (many chances both ways), which inflates everyone’s counting stats; tight defensive teams suppress them.</dd>
  <dt>GSAx</dt><dd>Goals saved above expected: how many goals a goalie prevented compared with an average goalie facing the same shots.</dd>
</dl>`)}

${sec('strategy', SECTIONS[4][1], `
<ul>
  <li><b>Draft for your league, not for ADP.</b> Default rankings assume a generic format. A hits-and-blocks league makes physical defensemen valuable; a points league with shot points rewards volume shooters. Puck Ledger ranks by your exact settings.</li>
  <li><b>Role beats talent on the margin.</b> Prefer the PP1, top-line player with secure ice time over the more skilled player stuck on the third line.</li>
  <li><b>Positional scarcity.</b> There are only ~30 true PP1 centers and a handful of power-play quarterback defensemen. When a tier is about to run out, take the last good one; the next tier is a big step down.</li>
  <li><b>Don’t overpay for goalies early</b> unless they are elite and have a secure starting job. Goalie stats are the most volatile year to year.</li>
  <li><b>Buy low, sell high.</b> Use luck indicators, not last season’s box score, to decide who to trade for and away.</li>
  <li><b>Play the schedule.</b> A 4-game week beats a 2-game week. In daily leagues, stream players from teams with 4 games or who play on light nights (few games, so free roster spots).</li>
  <li><b>Plan for the playoffs early.</b> By the trade deadline, favor players whose teams play many games in your playoff weeks.</li>
  <li><b>Watch team context.</b> A rebuilding team can trade away a star’s linemates; a coaching change can reshuffle PP units; an injury opens a PP1 spot for someone else.</li>
  <li><b>Balance.</b> Too many players from one division or conference means shared off-nights and correlated slumps.</li>
</ul>`)}

${sec('start', SECTIONS[5][1], `
<ol>
  <li><b>Set up your league</b> in <a href="#league">League</a>: format, number of teams, your draft slot, roster positions, scoring categories (and weights or point values), playoff weeks. Everything in the app recalculates from this.</li>
  <li><b>Set your display preferences</b> in <a href="#settings">Display</a>: timezone (Helsinki by default), cm/ft-in, kg/lb, ice time format, percentages, number format. The header has quick toggles too.</li>
  <li><b>Load your roster.</b> Either draft in <a href="#draft">Draft</a> (your picks become your roster) or, if your draft is done, paste your roster in <a href="#commit">Commit → Sync with league</a>.</li>
  <li><b>Check <a href="#suggestions">Suggestions</a></b> regularly: it recalculates whenever data or your settings change.</li>
</ol>
<p class="small muted">Your data is stored in this browser. Use Display → Export/Import to move it to another device.</p>`)}

${sec('draftday', SECTIONS[6][1], `
<ol>
  <li><b>ESPN league?</b> Paste the league URL in <a href="#league">League</a> (and for a private league, the espn_s2 and SWID cookies), click <b>Connect</b>, choose your team and click <b>Import roster slots</b>. During the draft, picks then arrive automatically every 15 seconds, your draft slot is set from ESPN’s draft order, and players you pick join your roster. Skip the manual steps below.</li>
  <li>Otherwise open <a href="#draft">Draft</a> and set <b>Your slot</b>.</li>
  <li>As picks happen, click <b>Taken</b> on players other managers draft and <b>Mine</b>/<b>Draft</b> on yours. Use the search box to find anyone quickly; <b>Undo</b> fixes mistakes.</li>
  <li>When you’re on the clock, read the <b>Suggested pick</b> card: it weighs value under your scoring, open roster slots, whether the player will last to your next pick (ADP), scarcity, injury and regression risk, and explains each factor.</li>
  <li>Scan <b>Best available by position</b> and the <b>vs ADP</b> column: “Discount +20” means the market takes the player ~20 picks later than you value them, so you can often wait. Faded rows are <i>likely gone</i> before your next pick.</li>
  <li>Watch <b>Scarcity warnings</b> and <b>Tier breaks</b>: they tell you when a position group (PP1 centers, top-pair D, starting goalies) is drying up.</li>
  <li>Changed your mind about a category? Edit <b>Live scoring weights</b> mid-draft (e.g. raise HIT to 1.5 or set +/- to 0 to punt it) and every ranking updates instantly.</li>
</ol>`)}

${sec('inseason', SECTIONS[7][1], `
<ol>
  <li><b>Suggestions</b> lists recommended moves with reasons: add/drop upgrades, sell-high and buy-low trade ideas, injury/IR moves, next-week streamers, playoff-schedule swaps and division balance fixes. Click <b>Try in sandbox</b> to test one, <b>Taken in my league</b> if the player isn’t available, or <b>Dismiss</b>.</li>
  <li>In the <b>Sandbox</b>, stage adds, drops and trades. The right side shows the change in every category (season and per week), total value, playoff-week games, division/conference balance and any disparity flags.</li>
  <li>Make the move in your real league, then go to <b>Commit</b>, tick the moves you made and commit. The sandbox and your real roster are kept separate until you do.</li>
  <li>Use <b>Schedule</b> each week: your roster’s games per week (light weeks in red), every team’s games, and the day-by-day game list with times in your timezone.</li>
  <li>Keep the <b>Team pane</b> open (or pop it out to a second screen) to see lines, PP units, injuries, role security and team outlook for any team; click a team chip anywhere to switch.</li>
</ol>`)}

${sec('pages', SECTIONS[8][1], `
<dl class="help-dl">
  <dt>Players</dt><dd>All players with projections and value under your settings. Filter by name, position, team or signal (buy-low, sell-high, trend gap, injured, my roster). Click column headers to sort, and a name for the full profile.</dd>
  <dt>Player profile</dt><dd>Bio (height/weight in your units), injury and usage-cliff risk, role and security, the last 3 seasons of advanced stats (CF%, xGF%, ixG, TOI, PP TOI, SH%, on-ice SH%/SV%, PDO…) plus this season’s projection (only the stats your league scores, if enabled in League), your league’s category z-scores, luck indicators vs career, and the 3-year trend vs projection panel.</dd>
  <dt>Team pane</dt><dd>Projected lines and D pairs, PP1/PP2, goalies, injuries with return timelines, role security (seasons in role, threats such as newcomers, rookies, coaching changes), team outlook (rebuilding / bubble / established contender) with how it can distort a star’s projection, scoring environment, next games.</dd>
  <dt>Suggestions</dt><dd>Automatic, explained recommendations based on your committed roster.</dd>
  <dt>Draft</dt><dd>Suggested pick, best available overall and by position, value vs ADP, scarcity and tier warnings, live weights, your team’s filled slots.</dd>
  <dt>Sandbox / Commit</dt><dd>Hypothetical moves and their impact, then a separate step to record moves you actually made.</dd>
  <dt>Schedule</dt><dd>Games per fantasy week for every team and for your roster, playoff weeks, light weeks and nights, game times in your timezone.</dd>
  <dt>League</dt><dd>Format, teams, slots, categories and weights, playoff weeks, balance thresholds, goalie discount, profile projection filter.</dd>
  <dt>Display</dt><dd>Timezone, clock, number format, units for height/weight/ice time/percentages, data status, backup.</dd>
</dl>`)}

${sec('numbers', SECTIONS[9][1], `
<dl class="help-dl">
  <dt>Projections</dt><dd>Last 3 seasons weighted 5/4/3 (most recent heaviest), converted to per-60-minute rates, pulled toward the league average for small samples, adjusted for age, then multiplied by projected ice time and games. Goals = projected shots × a shooting % pulled toward the player’s and league’s norms. Power-play points scale with projected PP time. Goalies: save % pulled toward league average, share of starts, wins from the goalie’s and team’s win rates.</dd>
  <dt>Value</dt><dd>Points leagues: projected fantasy points. Category leagues: for each category, how many standard deviations the player is above the average draftable player (z-score), times your weight, summed. Ratio stats are weighted by volume (a .920 over 60 starts beats .920 over 10).</dd>
  <dt>Value over replacement</dt><dd>The app fills every team’s starting slots and bench with the best players, then compares each player with the best one left over at their position. That’s why a mediocre-looking defenseman can outrank a better forward in a deep league.</dd>
  <dt>Luck indicators</dt><dd>Last season (or this season after 15 games) vs the player’s career (since ${esc(D.meta.careerSeasons || '2019')}): PDO ±15, on-ice SH%/SV% ±1.5 pts, shooting % ±3 pts, goals vs xG ±5 relative to their usual finishing. Two or more high = regression risk; two or more low = buy-low.</dd>
  <dt>Trend vs projection</dt><dd>Slopes of points/60, ixG/60 and xGF% over the 3 seasons. Flags when the projection runs against a clear trend, when points and underlying play disagree, or when projected goals lean on finishing above xG.</dd>
  <dt>Lines, PP units, role security</dt><dd>Derived from last season’s ice time with the current roster (newcomers slotted by their usage elsewhere). Security combines seasons held in the same tier/PP unit with threats: newcomers with similar minutes, rookies pushing up, coaching changes, age 34+.</dd>
  <dt>Team outlook</dt><dd>Points % (blending in this season as games are played), 5v5 xG share and core age. Refreshes hourly with standings, so it can flip at the trade deadline.</dd>
  <dt>Usage-cliff risk</dt><dd>How likely a player returning from injury is to come back to reduced minutes or a lost PP spot: long absences plus an already-contested role = High.</dd>
</dl>`)}

${sec('data', SECTIONS[10][1], `
<ul>
  <li><b>MoneyPuck</b>: advanced stats (Corsi, xG, on-ice stats, ice time splits).</li>
  <li><b>NHL API</b>: rosters, height/weight, schedule, standings, box-score stats.</li>
  <li><b>ESPN</b>: average draft position, positional eligibility, injuries and return dates.</li>
</ul>
<p>The server refreshes automatically: injuries about every 20 minutes, current-season stats and standings hourly, rosters and ADP every few hours. Open pages pick up new data and new app versions on their own. Last data update: <b>${D.meta.generated ? new Date(D.meta.generated).toLocaleString(state.settings.locale, { timeZone: state.settings.tz }) : '—'}</b>.</p>`)}

${sec('faq', SECTIONS[11][1], `
<dl class="help-dl">
  <dt>Does committing a move change my real league?</dt><dd>No. The app never logs into your league. Make the move on your platform, then commit it here so the app knows your real roster.</dd>
  <dt>Why does a suggestion name a player who’s already owned in my league?</dt><dd>For ESPN leagues with sync on, other teams’ rosters are read from ESPN and excluded automatically. Otherwise the app only knows players drafted by others on the Draft board; click <b>Taken in my league</b> for the rest.</dd>
  <dt>Why is my ranking different from ESPN/Yahoo?</dt><dd>It uses your exact categories, weights and roster slots and values players over replacement. The vs ADP column shows where you and the market disagree.</dd>
  <dt>The lines look wrong for a team.</dt><dd>They are derived from last season’s usage, so training-camp changes appear once players log NHL minutes.</dd>
  <dt>Can I use it on my phone?</dt><dd>Yes. Your data lives in each browser separately; use Export/Import to copy it.</dd>
  <dt>I see a “New version” banner.</dt><dd>A new version of the app was deployed. Click Reload; your settings and rosters are kept.</dd>
</dl>`)}
      </div>
    </div>`;
}

export const actions = {
  'help-jump': (_, el) => document.getElementById(el.dataset.target)?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
};
