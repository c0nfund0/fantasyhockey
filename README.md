# Puck Ledger: fantasy hockey draft & roster manager

A web app for fantasy hockey drafting and in-season roster management. Static front end (no build step) plus a tiny Python server that keeps the data fresh.

- **Suggestions**: automatic add/drop upgrades, sell-high / regression watch, buy-low trade targets, injury/IR moves, next-week streamers, playoff-schedule swaps and division-balance fixes, each with its reasoning and a one-click “Try in sandbox”. Draft mode shows a suggested pick with reasons.
- **Players / stats dashboard**: 3 seasons of advanced stats (CF%, xGF%, ixG, TOI, PP TOI, SH%, on-ice SH%/SV%, PDO), the current-season projection, luck/regression indicators vs career norms, 3-year trend vs projection gaps, height/weight with unit toggle.
- **Team context pane** (docked, or popped out into its own window and kept in sync): projected lines and pairs, PP1/PP2, injuries with return timeline and usage-cliff risk, role security (seasons held and threats), team outlook tag with distortion note and freshness, high/low-event environment.
- **Schedule**: games per fantasy week for every team and for your roster, playoff weeks highlighted, light-week warnings, game times in any timezone (default Europe/Helsinki).
- **League config**: format (H2H cats / roto / points), roster slots, categories and weights. All values recompute live, including mid-draft.
- **Sandbox → Commit**: stage adds/drops/trades, see category impact, division/conference balance and disparity flags, then commit separately once done in the real league.
- **Draft mode**: best available overall and by position under your scoring, value vs ESPN ADP (discount/reach), "likely gone" before your next pick, scarcity and tier-break warnings.
- **Help**: a Help page (fantasy hockey basics, strategy, step-by-step use of every page, how the numbers work, FAQ) and hover help on every button, control, column and chip.
- **Display settings**: timezone, cm/ft-in, kg/lb, TOI mm:ss/decimal, % vs decimal, number/date locale, 12/24h. All apply instantly.

User state (league settings, rosters, draft board) is stored in the browser's localStorage. Use *Display → Export/Import* to move it between devices.

## Deploy

The `Containerfile` builds an image that runs `scripts/serve.py`: it serves the site on `$PORT` **and keeps
`data/` fresh by itself**. No cron, CI job or manual refresh is needed.

- A background thread runs `scripts/build_data.py` at startup and every `REFRESH_MINUTES` (default 30).
- Each run re-downloads only sources whose cache has expired: injuries ~20 min, current-season stats and
  standings hourly, rosters/ADP ~3 h, schedule 12 h, past seasons weekly.
- Files are written atomically, a failed source falls back to its last good download, and a run that looks
  broken (too few players/games/projections) is discarded, so the site keeps serving the previous data.
- Open browser tabs poll `data/meta.json` (every 5 min and when the tab regains focus) and swap in new data
  without a reload.
- Every response carries `Cache-Control: no-cache` plus a content-hash `ETag`, so browsers always revalidate:
  a new deploy is picked up on the next load, while unchanged files return a cheap `304`. Open tabs poll
  `/version.json` and show a "New version available: Reload" banner after a deploy.
- Refresh results are logged to stdout (`data refresh ok …` / `FAILED …`).

The `data/` baked into the image is only the starting point. For the download cache and data to survive
container restarts, mount a volume on `/app/data` and `/app/scripts/.cache` (optional).

Local run: `PORT=8000 python3 scripts/serve.py`, then open http://localhost:8000.
A manual build is still possible: `python3 scripts/build_data.py [--fresh]`.

Sources: MoneyPuck (advanced stats), NHL API (rosters, bios, schedule, standings, counting stats), ESPN (ADP, positional eligibility, injuries).

Manual context the feeds don't provide goes in `data/overrides.json`:

```json
{ "coachingChanges": { "TOR": "New head coach, PP units likely reshuffled" } }
```

## How the numbers are made

- **Projection**: 3-season weighted (5/4/3) per-60 rates, regressed toward the league mean for the position group, age curve, projected TOI and PP TOI, games-played from availability history minus current injury games. Goals = shots × regressed shooting %. Goalies: regressed SV%, starts share, team-adjusted win rate.
- **Value**: points leagues use fantasy points; category leagues use weighted z-scores against the draftable pool (ratio cats volume-weighted), then value over replacement by position after simulating every team's slots. Goalie value gets an adjustable volatility discount (League settings, default 25%).
- **Lines / PP units**: derived from last season's TOI and PP TOI with the current roster, not scraped line combinations. They are a strong baseline; training-camp changes won't show until players log NHL minutes.
- **Team outlook**: points % (blends in the current season as games accrue) + 5v5 xG% + core age.

## License

GNU General Public License v3.0 or later. See [LICENSE](LICENSE).
