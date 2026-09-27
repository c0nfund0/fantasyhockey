#!/usr/bin/env python3
"""Serve the site and keep data/ fresh: one process, no cron needed.

A background thread runs scripts/build_data.py at startup and then every REFRESH_MINUTES (default 30).
build_data.py only re-downloads sources whose per-source cache has expired, so frequent runs are cheap,
and it refuses to overwrite data if a run looks broken. Open browser tabs poll data/meta.json and pick up
new data by themselves.

Env: PORT (default 8000), REFRESH_MINUTES (default 30).
"""
import functools
import http.server
import os
import subprocess
import sys
import threading
import time

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


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # data changes underneath the page; make browsers revalidate it instead of caching
        if self.path.split("?")[0].startswith("/data/"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        # the build cache and tooling are not part of the site
        if self.path.startswith(("/scripts", "/.git", "/Containerfile")):
            self.send_error(404)
            return
        super().do_GET()

    def log_message(self, fmt, *args):
        pass  # keep container logs to refresh events


if __name__ == "__main__":
    threading.Thread(target=refresher, daemon=True).start()
    server = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), functools.partial(Handler, directory=ROOT))
    log(f"serving {ROOT} on :{PORT}, refreshing data every {EVERY // 60} min")
    server.serve_forever()
