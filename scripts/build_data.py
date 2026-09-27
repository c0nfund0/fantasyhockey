#!/usr/bin/env python3
"""Build the static data files the site reads (data/*.json).

Sources (all public, no keys):
  - MoneyPuck season summaries: advanced skater/goalie/team stats (Corsi, xG, on-ice sh%/sv%, TOI splits)
  - NHL API (api-web.nhle.com / api.nhle.com/stats): rosters + bios, standings, schedule, counting stats
  - ESPN fantasy: ADP, positional eligibility, injury status + return dates

Run:  python3 scripts/build_data.py            (re-downloads only sources whose cache has expired)
      python3 scripts/build_data.py --fresh    (ignore cache)
In production scripts/serve.py runs this every 30 minutes; per-source TTLs below decide what is refetched.
"""
import csv
import datetime as dt
import io
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
CACHE = os.path.join(ROOT, "scripts", ".cache")
FRESH = "--fresh" in sys.argv
MIN, HOUR, DAY = 60, 3600, 86400
CACHE_TTL = 6 * HOUR
# how stale each source may get before it is downloaded again
TTL = {
    "past": 7 * DAY,          # completed seasons: effectively static
    "cur_mp": 3 * HOUR,       # MoneyPuck current season (they update overnight)
    "cur_nhl": 1 * HOUR,      # NHL current-season stats
    "standings": 1 * HOUR,
    "rosters": 3 * HOUR,      # signings, call-ups, waivers
    "schedule": 12 * HOUR,
    "espn_players": 3 * HOUR, # ADP / eligibility
    "injuries": 20 * MIN,
}

SEASON = 2026                      # season starting year being projected (2026-27)
HIST = [2023, 2024, 2025]          # the "last 3 seasons" shown in the dashboard
CAREER = list(range(2019, 2026))   # seasons used for career norms
WEIGHTS = {2025: 5, 2024: 4, 2023: 3}
AGE_REF = dt.date(SEASON + 1, 1, 1)

TEAMS = ["ANA", "BOS", "BUF", "CAR", "CBJ", "CGY", "CHI", "COL", "DAL", "DET", "EDM", "FLA", "LAK", "MIN",
         "MTL", "NJD", "NSH", "NYI", "NYR", "OTT", "PHI", "PIT", "SEA", "SJS", "STL", "TBL", "TOR", "UTA",
         "VAN", "VGK", "WPG", "WSH"]


# ---------------------------------------------------------------- fetching

def fetch(url, headers=None, cache_name=None, ttl=CACHE_TTL):
    os.makedirs(CACHE, exist_ok=True)
    name = cache_name or re.sub(r"[^A-Za-z0-9]+", "_", url)[-150:]
    path = os.path.join(CACHE, name)
    if not FRESH and os.path.exists(path) and time.time() - os.path.getmtime(path) < ttl:
        with open(path, "rb") as f:
            return f.read()
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                body = r.read()
            with open(path, "wb") as f:
                f.write(body)
            return body
        except urllib.error.HTTPError as e:
            if e.code == 404:
                return None
            time.sleep(1 + attempt)
        except Exception:
            time.sleep(1 + attempt)
    print("  ! failed:", url, file=sys.stderr)
    if os.path.exists(path):   # fall back to the last good download rather than dropping the source
        print("    using stale cache", file=sys.stderr)
        with open(path, "rb") as f:
            return f.read()
    return None


def fetch_json(url, **kw):
    body = fetch(url, **kw)
    return json.loads(body) if body else None


def fetch_csv(url, ttl=CACHE_TTL):
    body = fetch(url, ttl=ttl)
    if not body or body.lstrip().startswith(b"<"):
        return []
    return list(csv.DictReader(io.StringIO(body.decode("utf-8"))))


def f(x, d=0.0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return d


def norm_name(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z]", "", s)


def r(x, n=2):
    return None if x is None else round(x, n)


def safe_div(a, b):
    return a / b if b else None


# ---------------------------------------------------------------- loaders

def load_moneypuck():
    sk, go, tm = {}, {}, {}
    for y in CAREER + [SEASON]:
        ttl = TTL["cur_mp"] if y == SEASON else TTL["past"]
        rows = fetch_csv(f"https://moneypuck.com/moneypuck/playerData/seasonSummary/{y}/regular/skaters.csv", ttl)
        for row in rows:
            key = (int(row["playerId"]), y)
            sk.setdefault(key, {})[row["situation"]] = row
        for row in fetch_csv(f"https://moneypuck.com/moneypuck/playerData/seasonSummary/{y}/regular/goalies.csv", ttl):
            go.setdefault((int(row["playerId"]), y), {})[row["situation"]] = row
        if y in HIST + [SEASON]:
            for row in fetch_csv(f"https://moneypuck.com/moneypuck/playerData/seasonSummary/{y}/regular/teams.csv", ttl):
                tm.setdefault((row["team"], y), {})[row["situation"]] = row
        print(f"  moneypuck {y}: {len(rows)} skater rows")
    return sk, go, tm


def nhl_stats(kind, report, season):
    sid = f"{season}{season + 1}"
    out, start = [], 0
    while True:
        url = (f"https://api.nhle.com/stats/rest/en/{kind}/{report}?limit=100&start={start}"
               f"&sort=playerId&cayenneExp=seasonId={sid}%20and%20gameTypeId=2")
        d = fetch_json(url, ttl=TTL["cur_nhl"] if season == SEASON else TTL["past"])
        if not d or not d.get("data"):
            break
        out += d["data"]
        start += 100
        if start >= d.get("total", 0):
            break
    return {row["playerId"]: row for row in out}


def load_rosters():
    players = {}
    for t in TEAMS:
        d = fetch_json(f"https://api-web.nhle.com/v1/roster/{t}/{SEASON}{SEASON + 1}", ttl=TTL["rosters"]) or {}
        for grp in ("forwards", "defensemen", "goalies"):
            for p in d.get(grp, []):
                players[p["id"]] = {
                    "id": p["id"],
                    "name": f'{p["firstName"]["default"]} {p["lastName"]["default"]}',
                    "team": t,
                    "pos": {"L": "LW", "R": "RW"}.get(p["positionCode"], p["positionCode"]),
                    "num": p.get("sweaterNumber"),
                    "shoots": p.get("shootsCatches"),
                    "hIn": p.get("heightInInches"), "hCm": p.get("heightInCentimeters"),
                    "wLb": p.get("weightInPounds"), "wKg": p.get("weightInKilograms"),
                    "born": p.get("birthDate"),
                    "country": p.get("birthCountry"),
                    "img": p.get("headshot"),
                }
    return players


def load_standings():
    """Final standings of the last completed season, plus live standings if the new season is underway."""
    final = None
    for day in ("2026-04-18", "2026-04-17", "2026-04-16", "2026-04-15"):
        d = fetch_json(f"https://api-web.nhle.com/v1/standings/{day}", ttl=30 * DAY)
        if d and d.get("standings"):
            final = d["standings"]
            break
    now = (fetch_json("https://api-web.nhle.com/v1/standings/now", ttl=TTL["standings"]) or {}).get("standings") or []
    return final or [], now


def load_schedule():
    games = {}
    for t in TEAMS:
        d = fetch_json(f"https://api-web.nhle.com/v1/club-schedule-season/{t}/{SEASON}{SEASON + 1}", ttl=TTL["schedule"]) or {}
        for g in d.get("games", []):
            if g.get("gameType") != 2:
                continue
            games[g["id"]] = {"id": g["id"], "d": g["gameDate"], "t": g["startTimeUTC"],
                              "h": g["homeTeam"]["abbrev"], "a": g["awayTeam"]["abbrev"]}
    return sorted(games.values(), key=lambda g: (g["t"], g["id"]))


ESPN_SLOTS = {0: "C", 1: "LW", 2: "RW", 4: "D", 5: "G"}


def load_espn():
    filt = json.dumps({"players": {"limit": 1500, "sortDraftRanks": {"sortPriority": 100, "sortAsc": True, "value": "STANDARD"}}})
    d = fetch_json(f"https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/{SEASON + 1}/segments/0/leaguedefaults/1?view=kona_player_info",
                   headers={"x-fantasy-filter": filt}, cache_name="espn_players.json", ttl=TTL["espn_players"]) or {"players": []}
    by_name = {}
    for p in d["players"]:
        pl = p["player"]
        own = pl.get("ownership") or {}
        adp = own.get("averageDraftPosition")
        by_name.setdefault(norm_name(pl["fullName"]), []).append({
            "elig": [ESPN_SLOTS[s] for s in pl.get("eligibleSlots", []) if s in ESPN_SLOTS],
            "adp": r(adp, 1) if adp and adp < 250 else None,
            "own": r(own.get("percentOwned"), 1),
            "espnStatus": pl.get("injuryStatus"),
        })
    inj = {}
    d = fetch_json("https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/injuries", cache_name="espn_injuries.json", ttl=TTL["injuries"]) or {}
    for t in d.get("injuries", []):
        for i in t.get("injuries", []):
            det = i.get("details") or {}
            inj[norm_name(i["athlete"]["displayName"])] = {
                "status": i.get("status"),
                "type": det.get("type"),
                "ret": det.get("returnDate"),
                "note": i.get("shortComment") if i.get("shortComment") not in (None, "out") else None,
                "updated": (i.get("date") or "")[:10],
            }
    return by_name, inj


# ---------------------------------------------------------------- per-season skater lines

def skater_season(mp, nhl, rt):
    """Merge one season of MoneyPuck (advanced) + NHL (counting) into a compact dict."""
    a = mp.get("all")
    if not a:
        return None
    gp = f(a["games_played"])
    if gp <= 0:
        return None
    e5 = mp.get("5on5") or {}
    pp = mp.get("5on4") or {}
    oif_g, oif_s = f(e5.get("OnIce_F_goals")), f(e5.get("OnIce_F_shotsOnGoal"))
    oia_g, oia_s = f(e5.get("OnIce_A_goals")), f(e5.get("OnIce_A_shotsOnGoal"))
    oish = safe_div(oif_g, oif_s)
    oisv = 1 - oia_g / oia_s if oia_s else None
    g = nhl.get("goals", f(a["I_F_goals"])) if nhl else f(a["I_F_goals"])
    ast = nhl.get("assists") if nhl else f(a["I_F_primaryAssists"]) + f(a["I_F_secondaryAssists"])
    sog = f(a["I_F_shotsOnGoal"])
    return {
        "team": a["team"],
        "gp": int(gp),
        "toi": r(f(a["icetime"]) / gp / 60, 2),                  # minutes per game, all situations
        "pptoi": r(f(pp.get("icetime")) / gp / 60, 2),           # 5on4 minutes per game
        "ev": r(f(e5.get("icetime")) / gp / 60, 2),
        "cf": r(f(e5.get("onIce_corsiPercentage")) * 100, 1),
        "xgf": r(f(e5.get("onIce_xGoalsPercentage")) * 100, 1),
        "ixg": r(f(a["I_F_xGoals"]), 1),
        "g": int(g), "a": int(ast), "p": int(g + ast),
        "sog": int(sog),
        "sh": r(safe_div(g, sog) * 100, 1) if sog else None,
        "oish": r(oish * 100, 1) if oish is not None else None,
        "oisv": r(oisv * 100, 1) if oisv is not None else None,
        "pdo": r((oish + oisv) * 1000, 0) if oish is not None and oisv is not None else None,
        "pim": int(nhl.get("penaltyMinutes", f(a["penalityMinutes"])) if nhl else f(a["penalityMinutes"])),
        "hit": int(f(a["I_F_hits"])),
        "blk": int(f(a["shotsBlockedByPlayer"])),
        "fow": int(f(a["faceoffsWon"])), "fol": int(f(a["faceoffsLost"])),
        "ppp": int(nhl["ppPoints"]) if nhl else int(f(pp.get("I_F_points"))),
        "ppg": int(nhl["ppGoals"]) if nhl else int(f(pp.get("I_F_goals"))),
        "shp": int(nhl["shPoints"]) if nhl else 0,
        "gwg": int(nhl["gameWinningGoals"]) if nhl else 0,
        "pm": int(nhl["plusMinus"]) if nhl else 0,
        "tk": int(f(a["I_F_takeaways"])),
        "_e5": (oif_g, oif_s, oia_g, oia_s),
    }


def goalie_season(mp, nhl):
    a = (mp or {}).get("all")
    if not nhl and not a:
        return None
    gp = int(nhl["gamesPlayed"]) if nhl else int(f(a["games_played"]))
    if gp <= 0:
        return None
    ga_mp, xga = (f(a["goals"]), f(a["xGoals"])) if a else (None, None)
    sa = int(nhl["shotsAgainst"]) if nhl else None
    return {
        "team": (a or {}).get("team") or (nhl or {}).get("teamAbbrevs", "").split(",")[-1],
        "gp": gp,
        "gs": int(nhl["gamesStarted"]) if nhl else gp,
        "w": int(nhl["wins"]) if nhl else None,
        "l": int(nhl["losses"]) if nhl else None,
        "otl": int(nhl.get("otLosses") or 0) if nhl else None,
        "so": int(nhl["shutouts"]) if nhl else None,
        "sa": sa,
        "sv": int(nhl["saves"]) if nhl else None,
        "ga": int(nhl["goalsAgainst"]) if nhl else None,
        "svp": r(f(nhl["savePct"]) * 100, 2) if nhl and nhl.get("savePct") is not None else None,
        "gaa": r(f(nhl["goalsAgainstAverage"]), 2) if nhl else None,
        "toi": r(f(nhl["timeOnIce"]) / 60, 0) if nhl else None,
        "gsax": r(xga - ga_mp, 1) if a else None,
        "xsvp": r((1 - xga / f(a["unblocked_shot_attempts"])) * 100, 2) if a and f(a["unblocked_shot_attempts"]) else None,
    }


# ---------------------------------------------------------------- projections

def age_on(born):
    if not born:
        return None
    b = dt.date.fromisoformat(born)
    return AGE_REF.year - b.year - ((AGE_REF.month, AGE_REF.day) < (b.month, b.day))


def age_mult(age):
    if age is None:
        return 1.0
    table = {19: 1.12, 20: 1.10, 21: 1.08, 22: 1.06, 23: 1.04, 24: 1.03, 25: 1.015, 26: 1.0, 27: 1.0, 28: 1.0,
             29: 0.99, 30: 0.98, 31: 0.965, 32: 0.95, 33: 0.935}
    if age in table:
        return table[age]
    return 1.12 if age < 19 else max(0.75, 0.935 - 0.025 * (age - 33))


def league_rates(seasons_by_player, positions):
    """Per-60 league means by position group, used as the regression prior."""
    acc = {}
    for pid, seasons in seasons_by_player.items():
        grp = "D" if positions.get(pid) == "D" else "F"
        for y, s in seasons.items():
            if y not in HIST or s["gp"] < 20:
                continue
            a = acc.setdefault(grp, {"toi": 0, "g": 0, "a": 0, "sog": 0, "hit": 0, "blk": 0, "pim": 0, "shp": 0,
                                     "ppp": 0, "pptoi": 0, "fow": 0, "gwg": 0})
            mins = s["toi"] * s["gp"]
            a["toi"] += mins
            a["pptoi"] += s["pptoi"] * s["gp"]
            for k in ("g", "a", "sog", "hit", "blk", "pim", "shp", "ppp", "fow", "gwg"):
                a[k] += s[k]
    out = {}
    for grp, a in acc.items():
        out[grp] = {k: a[k] / a["toi"] * 60 for k in ("g", "a", "sog", "hit", "blk", "pim", "shp", "fow")}
        out[grp]["sh"] = a["g"] / a["sog"]
        out[grp]["ppp_per_ppmin"] = a["ppp"] / a["pptoi"] if a["pptoi"] else 0
        out[grp]["gwg_per_g"] = a["gwg"] / a["g"] if a["g"] else 0.15
    return out


def project_skater(p, seasons, lg, injury_games):
    hist = [(y, seasons[y]) for y in HIST if y in seasons]
    if not hist:
        return None
    grp = "D" if p["pos"] == "D" else "F"
    L = lg[grp]
    W = lambda y: WEIGHTS[y]
    wtoi = sum(W(y) * s["toi"] * s["gp"] for y, s in hist)          # weighted minutes
    wgp = sum(W(y) * s["gp"] for y, s in hist)
    prior_min = 250.0

    def rate(k):  # regressed per-60
        return (sum(W(y) * s[k] for y, s in hist) + L[k] / 60 * prior_min) / (wtoi + prior_min) * 60

    am = age_mult(p.get("age"))
    toi = sum(W(y) * s["toi"] * s["gp"] for y, s in hist) / wgp
    if p.get("age") and p["age"] <= 23:
        toi *= 1.03
    elif p.get("age") and p["age"] >= 33:
        toi *= 0.97
    pptoi = sum(W(y) * s["pptoi"] * s["gp"] for y, s in hist) / wgp

    # games played: availability history blended toward a healthy-regular baseline
    avail = sum(W(y) * min(1, s["gp"] / 82) for y, s in hist) / sum(W(y) for y, _ in hist)
    gp = 82 * (0.6 * avail + 0.4 * 0.9)
    if hist[-1][0] != 2025:          # did not play last season
        gp *= 0.8
    gp = max(10.0, min(82.0, gp - injury_games))

    minutes = toi * gp
    sog = rate("sog") * am * minutes / 60
    wsog = sum(W(y) * s["sog"] for y, s in hist)
    wg = sum(W(y) * s["g"] for y, s in hist)
    sh = (wg + L["sh"] * 120) / (wsog + 120)
    goals = sog * sh
    assists = rate("a") * am * minutes / 60
    wpp = sum(W(y) * s["pptoi"] * s["gp"] for y, s in hist)
    ppp_rate = (sum(W(y) * s["ppp"] for y, s in hist) + L["ppp_per_ppmin"] * 60) / (wpp + 60) if wpp else L["ppp_per_ppmin"]
    ppp = ppp_rate * am * pptoi * gp
    pm_pg = sum(W(y) * s["pm"] for y, s in hist) / wgp * 0.5
    proj = {
        "gp": gp, "toi": toi, "pptoi": pptoi,
        "g": goals, "a": assists, "p": goals + assists,
        "sog": sog, "ppp": min(ppp, (goals + assists) * 0.75),
        "shp": rate("shp") * minutes / 60,
        "gwg": goals * L["gwg_per_g"],
        "pm": pm_pg * gp,
        "pim": rate("pim") * minutes / 60,
        "hit": rate("hit") * minutes / 60,
        "blk": rate("blk") * minutes / 60,
        "fow": rate("fow") * minutes / 60 if p["pos"] == "C" or sum(s["fow"] for _, s in hist) > 100 else 0,
        "sh": sh * 100,
    }
    # underlying: same model but goals from individual xG instead of actual shooting
    wixg = sum(W(y) * s["ixg"] for y, s in hist)
    xg_rate = wixg / wtoi * 60 if wtoi else 0
    proj["xg"] = xg_rate * am * minutes / 60
    return {k: r(v, 1) for k, v in proj.items()}


def project_goalie(p, seasons, team_ptpct, injury_games, lg_sv):
    hist = [(y, seasons[y]) for y in HIST if y in seasons and seasons[y].get("sa")]
    if not hist:
        return None
    W = lambda y: WEIGHTS[y]
    wsa = sum(W(y) * s["sa"] for y, s in hist)
    wsv = sum(W(y) * s["sv"] for y, s in hist)
    svp = (wsv + lg_sv * 2500) / (wsa + 2500)
    wgs = sum(W(y) * s["gs"] for y, s in hist)
    gs_share = sum(W(y) * s["gs"] / 82 for y, s in hist) / sum(W(y) for y, _ in hist)
    gs = max(3.0, min(65.0, 82 * gs_share - injury_games * gs_share))
    sa_pg = wsa / sum(W(y) * s["gp"] for y, s in hist)
    own_w = sum(W(y) * (s["w"] or 0) for y, s in hist) / wgs if wgs else 0.45
    team_w = 0.5 + (team_ptpct - 0.55) * 1.1 if team_ptpct else 0.5
    wpgs = 0.5 * own_w + 0.5 * team_w
    so_rate = (sum(W(y) * (s["so"] or 0) for y, s in hist) + 0.06 * 40) / (wgs + 40)
    gp = gs * 1.04
    return {k: r(v, 2 if k in ("svp", "gaa") else 1) for k, v in {
        "gp": gp, "gs": gs, "w": gs * wpgs, "l": gs * (1 - wpgs) * 0.78, "otl": gs * (1 - wpgs) * 0.22,
        "sa": sa_pg * gp, "sv": sa_pg * gp * svp, "ga": sa_pg * gp * (1 - svp),
        "svp": svp * 100, "gaa": sa_pg * (1 - svp), "so": gs * so_rate,
    }.items()}


# ---------------------------------------------------------------- roles, lines, teams

def season_roles(seasons_by_player, positions):
    """Per season, each player's team-relative usage tier (Top-6 F / Top-4 D / PP1 ...)."""
    roles = {}
    for y in HIST:
        by_team = {}
        for pid, ss in seasons_by_player.items():
            s = ss.get(y)
            if s and s["gp"] >= 20:
                by_team.setdefault(s["team"], []).append((pid, s))
        for team, lst in by_team.items():
            fw = sorted([x for x in lst if positions.get(x[0]) != "D"], key=lambda x: -x[1]["toi"])
            dm = sorted([x for x in lst if positions.get(x[0]) == "D"], key=lambda x: -x[1]["toi"])
            pp = sorted(lst, key=lambda x: -x[1]["pptoi"])
            for i, (pid, _) in enumerate(fw):
                roles.setdefault(pid, {})[y] = {"ev": "Top-6 F" if i < 6 else "Middle-6 F" if i < 9 else "Bottom-6 F"}
            for i, (pid, _) in enumerate(dm):
                roles.setdefault(pid, {})[y] = {"ev": "Top-pair D" if i < 2 else "Top-4 D" if i < 4 else "Bottom-pair D"}
            for i, (pid, s) in enumerate(pp):
                roles[pid][y]["pp"] = "PP1" if i < 5 and s["pptoi"] > 1.0 else "PP2" if i < 10 and s["pptoi"] > 0.4 else "-"
    return roles


def usage_key(p):
    s = p.get("last")
    return (s["toi"] if s else 0) + (0.001 * (p.get("proj") or {}).get("p", 0))


def build_lines(team, roster, age_of):
    fw = [p for p in roster if p["pos"] in ("C", "LW", "RW")]
    dm = [p for p in roster if p["pos"] == "D"]
    gl = [p for p in roster if p["pos"] == "G"]
    fw.sort(key=usage_key, reverse=True)
    dm.sort(key=usage_key, reverse=True)
    top12 = fw[:12]
    cs = [p for p in top12 if p["pos"] == "C"]
    ws = [p for p in top12 if p["pos"] != "C"]
    # if a team is short on natural centers, the highest-usage wingers slide to C
    while len(cs) < 4 and ws:
        cs.append(ws.pop(0))
    extras = cs[4:]
    cs = cs[:4]
    ws = ws + extras
    lines = []
    for i in range(4):
        pair = ws[2 * i:2 * i + 2]
        lw = next((p for p in pair if p["pos"] == "LW"), pair[0] if pair else None)
        rw = next((p for p in pair if p is not lw), None)
        lines.append({"LW": lw and lw["id"], "C": cs[i]["id"] if i < len(cs) else None, "RW": rw and rw["id"]})
    pairs = [{"LD": dm[2 * i]["id"] if 2 * i < len(dm) else None,
              "RD": dm[2 * i + 1]["id"] if 2 * i + 1 < len(dm) else None} for i in range(3)]
    sk = sorted([p for p in fw + dm if p.get("last")], key=lambda p: -p["last"]["pptoi"])
    pp1 = [p["id"] for p in sk[:5]]
    pp2 = [p["id"] for p in sk[5:10]]
    gl.sort(key=lambda p: -((p.get("proj") or {}).get("gs") or 0))
    used = {x for l in lines for x in l.values()} | {x for pr in pairs for x in pr.values()}
    return {
        "lines": lines, "pairs": pairs, "pp1": pp1, "pp2": pp2,
        "g": [p["id"] for p in gl[:2]],
        "extra": [p["id"] for p in fw + dm if p["id"] not in used],
    }


def slot_of(pid, ln):
    for i, l in enumerate(ln["lines"]):
        if pid in l.values():
            return ("F", i + 1)
    for i, pr in enumerate(ln["pairs"]):
        if pid in pr.values():
            return ("D", i + 1)
    return (None, None)


def ev_tier(kind, n):
    if kind == "F":
        return "Top-6 F" if n <= 2 else "Middle-6 F" if n == 3 else "Bottom-6 F"
    if kind == "D":
        return "Top-pair D" if n == 1 else "Top-4 D" if n == 2 else "Bottom-pair D"
    return None


def main():
    os.makedirs(DATA, exist_ok=True)
    print("rosters…")
    roster = load_rosters()
    print(f"  {len(roster)} rostered players")
    print("moneypuck…")
    mp_sk, mp_go, mp_tm = load_moneypuck()
    print("nhl stats…")
    nhl_sum, nhl_gl = {}, {}
    for y in CAREER + [SEASON]:
        nhl_sum[y] = nhl_stats("skater", "summary", y) if y in HIST + [SEASON] else {}
        nhl_gl[y] = nhl_stats("goalie", "summary", y) if y in HIST + [SEASON] else {}
    print("standings, schedule, espn…")
    final_st, now_st = load_standings()
    schedule = load_schedule()
    espn, injuries = load_espn()

    for p in roster.values():
        p["age"] = age_on(p["born"])

    # ---- seasons
    positions = {pid: p["pos"] for pid, p in roster.items()}
    for (pid, y), rows in mp_sk.items():
        if pid not in positions and "all" in rows:
            positions[pid] = {"L": "LW", "R": "RW"}.get(rows["all"]["position"], rows["all"]["position"])
    seasons_all = {}
    career_raw = {}
    for (pid, y), rows in mp_sk.items():
        if y > 2025:
            continue
        s = skater_season(rows, nhl_sum.get(y, {}).get(pid), None)
        if not s:
            continue
        seasons_all.setdefault(pid, {})[y] = s
        c = career_raw.setdefault(pid, [0] * 8)
        oif_g, oif_s, oia_g, oia_s = s["_e5"]
        for i, v in enumerate((s["g"], s["sog"], oif_g, oif_s, oia_g, oia_s, s["ixg"], s["gp"])):
            c[i] += v

    lg = league_rates({k: v for k, v in seasons_all.items()}, positions)
    lg_sv_num = sum(g["saves"] for y in HIST for g in nhl_gl[y].values())
    lg_sv_den = sum(g["shotsAgainst"] for y in HIST for g in nhl_gl[y].values())
    lg_sv = lg_sv_num / lg_sv_den
    roles = season_roles(seasons_all, positions)

    # ---- team ptpct (for goalie wins + outlook)
    st_final = {s["teamAbbrev"]["default"]: s for s in final_st}
    st_now = {s["teamAbbrev"]["default"]: s for s in now_st if s.get("gamesPlayed", 0) > 0 and s.get("seasonId") == int(f"{SEASON}{SEASON + 1}")}

    def team_ptpct(t):
        a = st_final.get(t, {}).get("pointPctg", 0.5)
        n = st_now.get(t)
        if n:
            w = min(1.0, n["gamesPlayed"] / 60)
            return a * (1 - w) + n["pointPctg"] * w
        return a

    # ---- injuries: games missed from today until return date
    today = dt.date.today().isoformat()
    team_dates = {}
    for g in schedule:
        team_dates.setdefault(g["h"], []).append(g["d"])
        team_dates.setdefault(g["a"], []).append(g["d"])

    def games_missed(team, inj):
        if not inj:
            return 0
        st = inj["status"]
        if inj.get("ret"):
            return sum(1 for d in team_dates.get(team, []) if today <= d < inj["ret"])
        return {"Day-To-Day": 1, "Out": 5, "Injured Reserve": 15, "Suspension": 3}.get(st, 0)

    # ---- assemble players
    out_players = []
    for pid, p in roster.items():
        key = norm_name(p["name"])
        e = espn.get(key, [])
        if len(e) > 1:
            e = [x for x in e if (p["pos"] in x["elig"])] or e
        e = e[0] if e else {}
        inj = injuries.get(key)
        miss = games_missed(p["team"], inj)
        rec = {k: p[k] for k in ("id", "name", "team", "pos", "num", "shoots", "hIn", "hCm", "wLb", "wKg", "born", "age", "country", "img")}
        rec["elig"] = sorted(set(e.get("elig") or []) | {p["pos"]}, key="C LW RW D G".split().index)
        rec["adp"] = e.get("adp")
        rec["own"] = e.get("own")
        if inj:
            inj = dict(inj, gamesMissed=miss)
            rec["inj"] = inj
        if p["pos"] == "G":
            ss = {}
            for y in HIST:
                g = goalie_season(mp_go.get((pid, y)), nhl_gl[y].get(pid))
                if g:
                    ss[y] = g
            car_sa = car_sv = car_gsax = 0
            for y in CAREER:
                a = (mp_go.get((pid, y)) or {}).get("all")
                if a:
                    car_gsax += f(a["xGoals"]) - f(a["goals"])
                    car_sa += f(a["ongoal"])
                    car_sv += f(a["ongoal"]) - f(a["goals"])
            rec["seasons"] = {str(y): s for y, s in ss.items()}
            rec["career"] = {"svp": r(car_sv / car_sa * 100, 2) if car_sa else None, "gsax": r(car_gsax, 1)}
            rec["proj"] = project_goalie(p, ss, team_ptpct(p["team"]), miss, lg_sv)
            cur = goalie_season(mp_go.get((pid, SEASON)), nhl_gl[SEASON].get(pid))
            if cur:
                rec["cur"] = cur
            rec["last"] = ss.get(2025)
        else:
            ss = seasons_all.get(pid, {})
            hist = {y: {k: v for k, v in s.items() if not k.startswith("_")} for y, s in ss.items() if y in HIST}
            rec["seasons"] = {str(y): s for y, s in hist.items()}
            c = career_raw.get(pid)
            if c and c[7] >= 20:
                g, sog, ofg, ofs, oag, oas, ixg, cgp = c
                rec["career"] = {
                    "gp": int(cgp),
                    "sh": r(g / sog * 100, 1) if sog else None,
                    "oish": r(ofg / ofs * 100, 1) if ofs else None,
                    "oisv": r((1 - oag / oas) * 100, 1) if oas else None,
                    "pdo": r((ofg / ofs + 1 - oag / oas) * 1000, 0) if ofs and oas else None,
                    "gax": r(g - ixg, 1),
                }
            rec["roles"] = {str(y): v for y, v in roles.get(pid, {}).items()}
            rec["proj"] = project_skater(p, hist, lg, miss)
            cur_mp = mp_sk.get((pid, SEASON))
            cur = skater_season(cur_mp, nhl_sum[SEASON].get(pid), None) if cur_mp else None
            if not cur and nhl_sum[SEASON].get(pid):
                n = nhl_sum[SEASON][pid]
                cur = {"gp": n["gamesPlayed"], "g": n["goals"], "a": n["assists"], "p": n["points"], "sog": n["shots"],
                       "ppp": n["ppPoints"], "shp": n["shPoints"], "gwg": n["gameWinningGoals"], "pm": n["plusMinus"],
                       "pim": n["penaltyMinutes"], "toi": r(n["timeOnIcePerGame"] / 60, 2)}
            if cur:
                cur.pop("_e5", None)
                rec["cur"] = cur
            rec["last"] = hist.get(2025) or (hist[max(hist)] if hist else None)
        out_players.append(rec)

    by_id = {p["id"]: p for p in out_players}

    # ---- teams
    teams_out = {}
    ev_rates = {}
    for t in TEAMS:
        row = (mp_tm.get((t, 2025)) or {}).get("5on5")
        if row:
            it = f(row["iceTime"]) / 3600
            ev_rates[t] = {
                "xgf60": f(row["xGoalsFor"]) / it, "xga60": f(row["xGoalsAgainst"]) / it,
                "cf60": f(row["shotAttemptsFor"]) / it, "ca60": f(row["shotAttemptsAgainst"]) / it,
                "xgpct": f(row["xGoalsPercentage"]) * 100,
            }
        allrow = (mp_tm.get((t, 2025)) or {}).get("all")
        if allrow:
            gp = f(allrow["games_played"])
            ev_rates.setdefault(t, {})
            ev_rates[t]["gf_pg"] = f(allrow["goalsFor"]) / gp
            ev_rates[t]["ga_pg"] = f(allrow["goalsAgainst"]) / gp
    ev_vals = [v["xgf60"] + v["xga60"] for v in ev_rates.values() if "xgf60" in v]
    ev_mean = sum(ev_vals) / len(ev_vals)
    ev_sd = (sum((x - ev_mean) ** 2 for x in ev_vals) / len(ev_vals)) ** 0.5

    overrides_path = os.path.join(DATA, "overrides.json")
    overrides = json.load(open(overrides_path)) if os.path.exists(overrides_path) else {}
    coach_changes = overrides.get("coachingChanges", {})

    for t in TEAMS:
        roster_t = [p for p in out_players if p["team"] == t]
        ln = build_lines(t, roster_t, None)
        sf = st_final.get(t, {})
        now = st_now.get(t)
        er = ev_rates.get(t, {})
        z = ((er.get("xgf60", ev_mean / 2) + er.get("xga60", ev_mean / 2)) - ev_mean) / ev_sd if ev_sd else 0
        env = "High-event" if z > 0.7 else "Low-event" if z < -0.7 else "Neutral"
        ptp = team_ptpct(t)
        xgp = er.get("xgpct", 50)
        top18 = sorted([p for p in roster_t if p["pos"] != "G" and p.get("last")], key=lambda p: -p["last"]["toi"])[:18]
        avg_age = sum(p["age"] or 27 for p in top18) / len(top18) if top18 else None
        prev = st_final.get(t, {}).get("pointPctg", 0.5)
        if ptp >= 0.600 and xgp >= 51:
            outlook = "Established contender"
        elif ptp >= 0.520 or (xgp >= 52 and ptp >= 0.48):
            outlook = "Bubble / contender"
        elif ptp < 0.450 or (avg_age or 28) < 27.0:
            outlook = "Rebuilding / tanking"
        else:
            outlook = "Bubble / contender"   # veteran core coming off a poor season: retool, not rebuild
        teams_out[t] = {
            "abbrev": t,
            "name": (sf.get("teamName") or {}).get("default", t),
            "division": sf.get("divisionName"),
            "conference": sf.get("conferenceName"),
            "last": {"gp": sf.get("gamesPlayed"), "pts": sf.get("points"), "ptpct": r(prev, 3),
                     "gd": sf.get("goalDifferential"), "w": sf.get("wins"), "l": sf.get("losses"), "otl": sf.get("otLosses")},
            "now": {"gp": now["gamesPlayed"], "pts": now["points"], "ptpct": r(now["pointPctg"], 3), "gd": now["goalDifferential"]} if now else None,
            "outlook": outlook,
            "outlookScore": {"ptpct": r(ptp, 3), "xgpct": r(xgp, 1), "avgAge": r(avg_age, 1)},
            "env": env, "envZ": r(z, 2),
            "rates": {k: r(v, 2) for k, v in er.items()},
            "coachChange": coach_changes.get(t),
            **ln,
        }

    # ---- role security (current slot, seasons held, threats)
    for t, tm in teams_out.items():
        newcomers = {p["id"] for p in out_players if p["team"] == t and p.get("last") and p["last"].get("team") not in (t, None)
                     and not (t == "UTA" and p["last"].get("team") in ("ARI", "UTA"))}
        rookies = {p["id"] for p in out_players if p["team"] == t and p["pos"] != "G"
                   and (p.get("age") or 30) <= 23 and sum((s.get("gp") or 0) for s in p.get("seasons", {}).values()) < 60}
        for pid in [x for x in by_id if by_id[x]["team"] == t]:
            p = by_id[pid]
            if p["pos"] == "G":
                role = "Starter" if tm["g"] and tm["g"][0] == pid else "Backup" if pid in tm["g"] else "Depth"
                threats = []
                if role == "Starter" and len(tm["g"]) > 1:
                    b = by_id[tm["g"][1]]
                    bs, ss = (b.get("proj") or {}).get("svp") or 0, (p.get("proj") or {}).get("svp") or 0
                    if bs >= ss - 0.2:
                        threats.append(f"{b['name']} projects within 0.2 SV% points — tandem risk")
                if pid in newcomers:
                    threats.append("New to team — starter's net not yet established")
                p["role"] = {"slot": role, "pp": None, "held": None, "threats": threats, "security": "Low" if threats else "High" if role == "Starter" else "Medium"}
                continue
            kind, n = slot_of(pid, tm)
            tier = ev_tier(kind, n) if kind else "Extra / press box"
            pp = "PP1" if pid in tm["pp1"] else "PP2" if pid in tm["pp2"] else None
            held = 0
            if pid not in newcomers:
                for y in reversed(HIST):
                    rr = p.get("roles", {}).get(str(y))
                    if rr and rr.get("ev") == tier and (pp is None or rr.get("pp") == pp):
                        held += 1
                    else:
                        break
            threats = []
            group = "D" if p["pos"] == "D" else "F"
            if pid in newcomers:
                threats.append(f"Newcomer (from {p['last']['team']}) — role unproven with {t}")
            for other in newcomers - {pid}:
                o = by_id[other]
                if o["pos"] == "G" or ("D" if o["pos"] == "D" else "F") != group or not o.get("last") or not p.get("last"):
                    continue
                if o["last"]["toi"] >= p["last"]["toi"] * 0.9 and kind and n <= (2 if group == "F" else 2):
                    threats.append(f"{o['name']} (acquired from {o['last']['team']}) played {o['last']['toi']:.1f} min/gp last season")
                if pp and o["last"]["pptoi"] >= p["last"]["pptoi"] * 0.8 and o["last"]["pptoi"] > 1:
                    threats.append(f"{o['name']} brings {o['last']['pptoi']:.1f} PP min/gp — {pp} slot pressure")
            for rk in rookies - {pid}:
                o = by_id[rk]
                if ("D" if o["pos"] == "D" else "F") == group and kind and ((group == "F" and n in (2, 3)) or (group == "D" and n in (2, 3))):
                    threats.append(f"Rookie push: {o['name']} (age {o['age']})")
            if tm.get("coachChange"):
                threats.append(f"Coaching change: {tm['coachChange']}")
            if (p.get("age") or 0) >= 34:
                threats.append("Age 34+: usage typically trimmed")
            threats = threats[:4]
            score = held * 2 - len(threats) * 1.5 + (1 if pp == "PP1" else 0)
            security = "High" if score >= 4 else "Medium" if score >= 1 else "Low"
            p["role"] = {"slot": tier if not kind else f"{'L' if kind == 'F' else 'Pair '}{n}" if kind == "F" else f"Pair {n}",
                         "tier": tier, "pp": pp, "held": held, "threats": threats, "security": security}
            if kind == "F":
                p["role"]["slot"] = f"Line {n}"

    for p in out_players:
        p.pop("last", None)
        p.pop("roles", None) if p["pos"] == "G" else None

    now_iso = dt.datetime.now(dt.timezone.utc).replace(microsecond=0).isoformat()
    meta = {
        "generated": now_iso,
        "season": f"{SEASON}-{str(SEASON + 1)[2:]}",
        "hist": [f"{y}-{str(y + 1)[2:]}" for y in HIST],
        "histKeys": [str(y) for y in HIST],
        "careerSeasons": f"{CAREER[0]}-{str(CAREER[-1] + 1)[2:]}",
        "seasonStarted": any("cur" in p for p in out_players),
        "league": {"F": {k: r(v, 4) for k, v in lg["F"].items()}, "D": {k: r(v, 4) for k, v in lg["D"].items()}, "svp": r(lg_sv * 100, 2)},
        "sources": ["MoneyPuck.com (advanced stats)", "NHL API (rosters, bios, schedule, standings, counting stats)",
                    "ESPN (ADP, eligibility, injuries)"],
    }
    # never replace good data with the output of a broken run
    problems = []
    if len(out_players) < 600:
        problems.append(f"only {len(out_players)} players")
    if len(schedule) < 1000:
        problems.append(f"only {len(schedule)} games")
    if sum(1 for p in out_players if p.get("proj")) < 500:
        problems.append("projections missing (stats source down?)")
    if problems:
        print("ABORT, keeping existing data: " + "; ".join(problems), file=sys.stderr)
        sys.exit(2)
    dump("players.json", out_players)
    dump("teams.json", teams_out)
    dump("schedule.json", schedule)
    dump("meta.json", meta)
    if not os.path.exists(overrides_path):
        dump("overrides.json", {"_help": "Manual context the feeds don't provide. coachingChanges: {\"TEAM\": \"note\"}",
                                "coachingChanges": {}})
    print(f"done: {len(out_players)} players, {len(schedule)} games")


def dump(name, obj):
    # write-then-rename so the web server never serves a half-written file
    final = os.path.join(DATA, name)
    tmp = final + ".tmp"
    with open(tmp, "w") as fh:
        json.dump(obj, fh, separators=(",", ":"), default=lambda o: None)
    os.replace(tmp, final)
    print(f"  wrote data/{name} ({os.path.getsize(os.path.join(DATA, name)) // 1024} KB)")


if __name__ == "__main__":
    main()
