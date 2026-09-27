#!/usr/bin/env python3
"""Serve the site and keep data/ fresh: one process, no cron needed.

A background thread runs scripts/build_data.py at startup and then every REFRESH_MINUTES (default 30).
build_data.py only re-downloads sources whose per-source cache has expired, so frequent runs are cheap,
and it refuses to overwrite data if a run looks broken. Open browser tabs poll data/meta.json and pick up
new data by themselves.

Env: PORT (default 8000), REFRESH_MINUTES (default 30).
"""
import functools
import hashlib
import http.server
import json
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = int(os.environ.get("PORT", "8000"))
EVERY = max(5, int(os.environ.get("REFRESH_MINUTES", "30"))) * 60
BUILD = os.path.join(ROOT, "scripts", "build_data.py")


def log(*a):
    print(time.strftime("%Y-%m-%d %H:%M:%S"), *a, flush=True)


def refresher():
    while True:
        started = time.time()
        try:
            r = subprocess.run([sys.executable, BUILD], cwd=ROOT, capture_output=True, text=True, timeout=20 * 60)
            tail = (r.stdout.strip().splitlines() or [""])[-1]
            if r.returncode == 0:
                log(f"data refresh ok in {time.time() - started:.0f}s: {tail}")
            else:
                log(f"data refresh FAILED (exit {r.returncode}), keeping previous data:\n{r.stderr[-2000:]}")
        except Exception as e:  # never let the refresher die
            log(f"data refresh error: {e!r}")
        time.sleep(max(60, EVERY - (time.time() - started)))


def app_version():
    """Content hash of the front-end files; changes whenever a new version is deployed."""
    h = hashlib.sha1()
    for base in ("index.html", "css", "js"):
        path = os.path.join(ROOT, base)
        files = [path] if os.path.isfile(path) else sorted(
            os.path.join(d, f) for d, _, fs in os.walk(path) for f in fs)
        for fp in files:
            with open(fp, "rb") as fh:
                h.update(fp.encode() + fh.read())
    return h.hexdigest()[:12]


APP_VERSION = app_version()
_etags = {}


def etag_for(fs_path):
    """Strong ETag from file content (mtimes can survive a rebuild unchanged)."""
    st = os.stat(fs_path)
    key = (fs_path, st.st_mtime_ns, st.st_size)
    if key not in _etags:
        with open(fs_path, "rb") as fh:
            _etags[key] = '"' + hashlib.sha1(fh.read()).hexdigest()[:16] + '"'
    return _etags[key]


ESPN_API = "https://lm-api-reads.fantasy.espn.com/apis/v3/games/fhl/seasons/{season}/segments/0/leagues/{league}"
ESPN_VIEWS = {"mDraftDetail", "mTeam", "mSettings", "mRoster"}


def espn_league(query, headers):
    """Fetch an ESPN fantasy hockey league. Private leagues need the user's espn_s2 + SWID cookies,
    which the app sends as headers; they are forwarded to ESPN only and never stored."""
    q = urllib.parse.parse_qs(query)
    league, season = q.get("league", [""])[0], q.get("season", [""])[0]
    if not league.isdigit() or not season.isdigit():
        return 400, {"error": "league and season must be numeric"}
    views = [v for v in q.get("view", []) if v in ESPN_VIEWS] or ["mTeam"]
    url = ESPN_API.format(season=season, league=league) + "?" + urllib.parse.urlencode([("view", v) for v in views])
    req_headers = {"User-Agent": "Mozilla/5.0", "Accept": "application/json"}
    s2, swid = headers.get("X-Espn-S2", "").strip(), headers.get("X-Espn-Swid", "").strip()
    if s2 and swid:
        req_headers["Cookie"] = f"espn_s2={s2}; SWID={swid}"
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=req_headers), timeout=20) as r:
            return 200, json.loads(r.read())
    except urllib.error.HTTPError as e:
        msg = {401: "League is private: add your espn_s2 and SWID cookies in League settings.",
               404: "League not found for this season. Check the league ID."}.get(e.code, f"ESPN responded {e.code}")
        return e.code, {"error": msg}
    except Exception as e:
        return 502, {"error": f"Could not reach ESPN: {e}"}


class Handler(http.server.SimpleHTTPRequestHandler):
    etag = None

    def end_headers(self):
        # Every response must be revalidated: new deploys and refreshed data show up on the next load,
        # while unchanged files still come back as cheap 304s.
        self.send_header("Cache-Control", "no-cache")
        if self.etag:
            self.send_header("ETag", self.etag)
        super().end_headers()

    def do_GET(self):
        path = self.path.split("?")[0]
        # the build cache and tooling are not part of the site
        if path.startswith(("/scripts", "/.git", "/Containerfile")):
            self.send_error(404)
            return
        if path == "/api/espn":
            code, obj = espn_league(urllib.parse.urlparse(self.path).query, self.headers)
            body = json.dumps(obj).encode()
            self.send_response(code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/version.json":
            body = json.dumps({"version": APP_VERSION}).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        fs_path = self.translate_path(path)
        if os.path.isdir(fs_path):
            fs_path = os.path.join(fs_path, "index.html")
        if os.path.isfile(fs_path):
            self.etag = etag_for(fs_path)
            if self.headers.get("If-None-Match") == self.etag:
                self.send_response(304)
                self.end_headers()
                return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # keep container logs to refresh events


if __name__ == "__main__":
    threading.Thread(target=refresher, daemon=True).start()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), functools.partial(Handler, directory=ROOT))
    log(f"serving {ROOT} (version {APP_VERSION}) on :{PORT}, refreshing data every {EVERY // 60} min")
    server.serve_forever()
