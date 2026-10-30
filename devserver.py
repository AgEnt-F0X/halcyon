"""Halcyon — Architectural Core dev + telemetry server (Python stdlib only).

Static file serving with proper MIME types, plus a small full-stack layer:
  GET  /api/projects  -> public repos for the portfolio user, enriched with
                         language/topics/stars/forks/size + latest GitHub
                         Actions status when GITHUB_TOKEN is available + the
                         raw README.md text for every repo. Identity repos
                         (halcyon / the owner account) are filtered out —
                         Halcyon is the framework, never a project card.
  GET  /api/tree      -> ?repo=NAME  full file tree (git/trees?recursive=1)
  GET  /api/file      -> ?repo=NAME&path=PATH  raw text file content
  GET  /api/pulse     -> visitor "hype" counters per project.
  POST /api/pulse     -> increment a project's hype counter.

Everything GitHub is cached under .cache/ with a 10-minute TTL and a
stale-cache fallback so the site never 500s.
"""
import http.server
import socketserver
import json
import os
import re
import threading
import time
import urllib.request
import urllib.error
import urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(ROOT, ".cache")
GITHUB_USER = "AgEnt-F0X"
TTL = 600  # seconds
PORT = int(os.environ.get("PORT", "8430"))

_LOCK = threading.Lock()


def _identity_repo(name):
    k = (name or "").strip().lower()
    return (not k or k == "halcyon" or k == GITHUB_USER.lower()
            or "halcyon" in k or GITHUB_USER.lower() in k)


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    # ---- plumbing -------------------------------------------------------
    def end_headers(self):
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):  # quieter logs
        if "/api/" in (self.path or ""):
            super().log_message(fmt, *args)

    def send_json(self, payload, status=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def read_body_json(self):
        try:
            length = int(self.headers.get("Content-Length", "0") or 0)
            if length <= 0 or length > 64 * 1024:
                return {}
            return json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, json.JSONDecodeError):
            return {}

    def query_params(self):
        q = self.path.split("?", 1)
        out = {}
        if len(q) == 2:
            for pair in q[1].split("&"):
                if "=" in pair:
                    k, v = pair.split("=", 1)
                    out[urllib.parse.unquote_plus(k)] = urllib.parse.unquote_plus(v)
        return out

    # ---- routing --------------------------------------------------------
    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/api/projects":
            return self.api_projects()
        if path == "/api/tree":
            return self.api_tree()
        if path == "/api/file":
            return self.api_file()
        if path == "/api/pulse":
            return self.api_pulse_get()
        return super().do_GET()

    def do_POST(self):
        path = self.path.split("?")[0]
        if path == "/api/pulse":
            return self.api_pulse_post()
        self.send_json({"error": "not found"}, 404)

    def do_OPTIONS(self):  # CORS preflight
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    # ---- github plumbing --------------------------------------------------
    def github_token(self):
        token = os.environ.get("GITHUB_TOKEN")
        if token:
            return token
        env_path = os.path.join(ROOT, ".env")
        if os.path.exists(env_path):
            try:
                with open(env_path, "r", encoding="utf-8") as fh:
                    for line in fh:
                        line = line.strip()
                        if line.startswith("GITHUB_TOKEN="):
                            value = line.split("=", 1)[1].strip().strip('"').strip("'")
                            if value:
                                return value
            except OSError:
                pass
        return None

    def fetch_raw(self, url, token=None, accept_json=True, max_bytes=1_500_000):
        req = urllib.request.Request(url, headers={
            "User-Agent": "halcyon-portfolio/2.0",
            "Accept": "application/vnd.github+json" if accept_json else "text/plain, */*",
        })
        if token:
            req.add_header("Authorization", "Bearer " + token)
        with urllib.request.urlopen(req, timeout=12) as res:
            data = res.read(max_bytes)
        return data

    def fetch_json(self, url, token=None):
        return json.loads(self.fetch_raw(url, token, True).decode("utf-8"))

    # ---- cache helpers ------------------------------------------------------
    def read_cache(self, name):
        path = os.path.join(CACHE_DIR, name)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "r", encoding="utf-8") as fh:
                return json.load(fh)
        except (OSError, json.JSONDecodeError):
            return None

    def read_cache_fresh(self, name, ttl=TTL):
        data = self.read_cache(name)
        if data is None:
            return None
        path = os.path.join(CACHE_DIR, name)
        try:
            if (time.time() - os.path.getmtime(path)) > ttl:
                return None
        except OSError:
            return None
        return data

    def write_cache(self, name, payload):
        os.makedirs(CACHE_DIR, exist_ok=True)
        path = os.path.join(CACHE_DIR, name)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as fh:
            json.dump(payload, fh)
        os.replace(tmp, path)

    def safe_name(self, repo):
        return re.sub(r"[^A-Za-z0-9._-]", "_", repo)[:80]

    # ---- README fetch -------------------------------------------------------
    def fetch_readme(self, full_name, branch, token):
        """Raw README.md text for a repo; cached 10 min. Returns text or ''."""
        cache_name = "readme_%s.json" % self.safe_name(full_name)
        fresh = self.read_cache_fresh(cache_name)
        if fresh is not None and "markdown" in fresh:
            return fresh["markdown"]
        candidates = ["README.md", "readme.md", "Readme.md", "README.MD", "README.txt", "README"]
        markdown = ""
        for name in candidates:
            try:
                raw = self.fetch_raw(
                    "https://raw.githubusercontent.com/%s/%s/%s" % (full_name, branch, name),
                    token, accept_json=False)
                markdown = raw.decode("utf-8", "replace")
                break
            except (urllib.error.URLError, urllib.error.HTTPError, OSError):
                continue
        with _LOCK:
            self.write_cache(cache_name, {"markdown": markdown, "at": time.time()})
        return markdown

    # ---- Actions status ------------------------------------------------------
    def actions_status(self, repo_full_name, token):
        """Latest GitHub Actions run conclusion; graceful fallback when no token."""
        if not token:
            return "unknown"
        try:
            data = self.fetch_json(
                "https://api.github.com/repos/%s/actions/runs?per_page=1" % repo_full_name,
                token,
            )
            runs = data.get("workflow_runs") or []
            if not runs:
                return "none"
            run = runs[0]
            status = run.get("conclusion") or run.get("status") or "unknown"
            return {
                "success": "passing", "failure": "failing", "cancelled": "cancelled",
                "startup_failure": "failing", "in_progress": "running",
                "queued": "running", "pending": "running",
            }.get(str(status).lower(), str(status).lower())
        except (urllib.error.URLError, OSError, ValueError):
            return "unknown"

    def enrich_repo(self, repo, token):
        full = repo.get("full_name") or ("%s/%s" % (GITHUB_USER, repo.get("name")))
        branch = repo.get("default_branch") or "main"
        return {
            "id": repo.get("id"),
            "name": repo.get("name"),
            "fullName": full,
            "branch": branch,
            "description": repo.get("description") or "",
            "language": repo.get("language") or "Code",
            "topics": repo.get("topics") or [],
            "stars": repo.get("stargazers_count", 0),
            "forks": repo.get("forks_count", 0),
            "size": repo.get("size", 0),
            "updatedAt": repo.get("pushed_at") or repo.get("updated_at"),
            "htmlUrl": repo.get("html_url"),
            "cloneUrl": repo.get("clone_url"),
            "homepage": repo.get("homepage") or "",
            "archived": bool(repo.get("archived")),
            "actions": self.actions_status(full, token),
            "readme": self.fetch_readme(full, branch, token),
        }

    # ---- /api/projects --------------------------------------------------------
    def api_projects(self):
        token = self.github_token()
        cache_name = "github_repos.json"
        cached = self.read_cache(cache_name)
        fresh = self.read_cache_fresh(cache_name)
        if fresh is not None and isinstance(fresh.get("projects"), list) and fresh["projects"]:
            payload = dict(fresh)
            payload["fromCache"] = True
            return self.send_json(payload)
        try:
            repos = self.fetch_json(
                "https://api.github.com/users/%s/repos?sort=updated&per_page=100" % GITHUB_USER,
                token,
            )
            projects = [self.enrich_repo(r, token)
                        for r in repos
                        if not r.get("private") and not _identity_repo(r.get("name"))]
            payload = {"user": GITHUB_USER, "fetchedAt": int(time.time()), "fromCache": False,
                       "live": True, "projects": projects}
            with _LOCK:
                self.write_cache(cache_name, payload)
            return self.send_json(payload)
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
            # never 500: fall back to the last good cache, even if stale
            if cached is not None and isinstance(cached.get("projects"), list):
                payload = dict(cached)
                payload["fromCache"] = True
                payload["live"] = False
                payload["error"] = str(exc)[:160]
                return self.send_json(payload)
            return self.send_json({"user": GITHUB_USER, "live": False, "fromCache": False,
                                   "projects": [], "error": str(exc)[:160]}, 200)

    # ---- /api/tree --------------------------------------------------------------
    def api_tree(self):
        params = self.query_params()
        repo = params.get("repo", "").strip()
        if not repo or "/" in repo or len(repo) > 100:
            return self.send_json({"error": "repo required"}, 400)
        cache_name = "tree_%s.json" % self.safe_name(repo)
        fresh = self.read_cache_fresh(cache_name)
        if fresh is not None:
            return self.send_json(fresh)
        token = self.github_token()
        # discover the default branch, then walk the tree
        try:
            info = self.fetch_json("https://api.github.com/repos/%s/%s" % (GITHUB_USER, repo), token)
            branch = info.get("default_branch") or "main"
            data = self.fetch_json(
                "https://api.github.com/repos/%s/%s/git/trees/%s?recursive=1" % (GITHUB_USER, repo, branch),
                token,
            )
        except (urllib.error.URLError, urllib.error.HTTPError, OSError, ValueError) as exc:
            return self.send_json({"repo": repo, "tree": [], "live": False, "error": str(exc)[:160]})
        tree = []
        for item in (data.get("tree") or [])[:2000]:
            tree.append({
                "path": item.get("path", ""),
                "type": item.get("type", "blob"),  # blob | tree
                "size": item.get("size", 0) or 0,
            })
        payload = {"repo": repo, "branch": branch, "live": True, "fetchedAt": int(time.time()), "tree": tree}
        with _LOCK:
            self.write_cache(cache_name, payload)
        return self.send_json(payload)

    # ---- /api/file ----------------------------------------------------------------
    def api_file(self):
        params = self.query_params()
        repo = params.get("repo", "").strip()
        path = params.get("path", "").strip()
        if not repo or "/" in repo or not path or ".." in path or len(path) > 300:
            return self.send_json({"error": "repo and path required"}, 400)
        cache_name = "file_%s_%s.json" % (self.safe_name(repo), self.safe_name(path))
        fresh = self.read_cache_fresh(cache_name)
        if fresh is not None:
            return self.send_json(fresh)
        token = self.github_token()
        try:
            info = self.fetch_json("https://api.github.com/repos/%s/%s" % (GITHUB_USER, repo), token)
            branch = info.get("default_branch") or "main"
            raw = self.fetch_raw(
                "https://raw.githubusercontent.com/%s/%s/%s/%s" % (GITHUB_USER, repo, branch, path),
                token, accept_json=False, max_bytes=400_000,
            )
            text = raw.decode("utf-8", "replace")
            truncated = len(raw) >= 400_000
        except (urllib.error.URLError, urllib.error.HTTPError, OSError) as exc:
            return self.send_json({"repo": repo, "path": path, "content": None,
                                   "error": str(exc)[:160]}, 200)
        payload = {"repo": repo, "path": path, "content": text, "truncated": truncated,
                   "fetchedAt": int(time.time())}
        with _LOCK:
            self.write_cache(cache_name, payload)
        return self.send_json(payload)

    # ---- /api/pulse ---------------------------------------------------------------
    def read_pulses(self):
        data = self.read_cache("pulse.json")
        if isinstance(data, dict) and isinstance(data.get("pulses"), dict):
            return data["pulses"]
        return {}

    def api_pulse_get(self):
        return self.send_json({"pulses": self.read_pulses()})

    def api_pulse_post(self):
        body = self.read_body_json()
        repo = str(body.get("repo", "")).strip()
        if not repo or len(repo) > 120:
            return self.send_json({"error": "repo required"}, 400)
        delta = 1
        if isinstance(body.get("delta"), int):
            delta = max(-5, min(5, body["delta"]))
        with _LOCK:
            pulses = self.read_pulses()
            pulses[repo] = max(0, pulses.get(repo, 0) + delta)
            self.write_cache("pulse.json", {"pulses": pulses, "at": time.time()})
        return self.send_json({"pulses": pulses, "boosted": repo})


# serve .glsl and friends correctly; Python 3.13 dropped some entries
extensions_map = http.server.SimpleHTTPRequestHandler.extensions_map.copy()
extensions_map.update({
    ".js": "text/javascript; charset=utf-8",
    ".mjs": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".glsl": "text/plain; charset=utf-8",
    ".webmanifest": "application/manifest+json",
})


class HalcyonServer(Handler):
    extensions_map = extensions_map


class ThreadingTCPServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True


if __name__ == "__main__":
    os.makedirs(CACHE_DIR, exist_ok=True)
    with ThreadingTCPServer(("127.0.0.1", PORT), HalcyonServer) as httpd:
        print("Halcyon Architectural Core on http://localhost:%d  (GitHub user: %s)" % (PORT, GITHUB_USER))
        httpd.serve_forever()
