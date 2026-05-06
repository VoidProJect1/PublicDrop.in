#!/usr/bin/env python3
"""
Run with: sudo /opt/publicdrop-api/venv/bin/python3 install_admin.py
Patches publicdrop_api_server.py to add admin dashboard.
Does NOT touch meta.json, live.json, or any data files.
"""
import shutil, os, sys
from pathlib import Path

TARGET = Path("/opt/publicdrop-api/publicdrop_api_server.py")
BACKUP = Path("/opt/publicdrop-api/publicdrop_api_server.py.bak")

# ── Safety: backup original ────────────────────────────────────────────────
if not BACKUP.exists():
    shutil.copy2(TARGET, BACKUP)
    print(f"✅ Backup saved to {BACKUP}")
else:
    print(f"ℹ️  Backup already exists at {BACKUP}")

ADMIN_BLOCK = '''
# ════════════════════════════════════════════════════════════════════════════
# ADMIN DASHBOARD — injected by install_admin.py
# ════════════════════════════════════════════════════════════════════════════
import os as _os, shutil as _shutil, threading as _adm_threading
from collections import defaultdict as _defaultdict
from datetime import datetime as _dt, timezone as _tz
import subprocess as _subprocess

ADMIN_PASSWORD  = "Pd#905078"
RATE_LIMIT_FILE = Path("/opt/publicdrop-api/data/rate_limits.json")
STATS_FILE      = Path("/opt/publicdrop-api/data/admin_stats.json")

# ── Runtime stats ─────────────────────────────────────────────────────────
_total_requests   = 0
_unique_ips       = set()
_endpoint_hits    = _defaultdict(int)
_ip_hits          = _defaultdict(int)
_launch_time      = time.time()
_stats_lock       = _adm_threading.Lock()

# ── Rate limiting ─────────────────────────────────────────────────────────
# { ip: {"limit": 120, "premium": False, "note": ""} }
_rate_cfg         = {}
_rate_windows     = _defaultdict(list)   # ip -> [timestamps]
_rate_lock        = _adm_threading.Lock()
_GLOBAL_LIMIT     = 120   # default req/min per IP

def _load_rate_cfg():
    global _rate_cfg, _GLOBAL_LIMIT
    try:
        if RATE_LIMIT_FILE.exists():
            d = json.load(open(RATE_LIMIT_FILE))
            _GLOBAL_LIMIT = d.get("global_limit", 120)
            _rate_cfg     = d.get("ips", {})
    except Exception as e:
        log.error(f"rate cfg load: {e}")

def _save_rate_cfg():
    try:
        d = {"global_limit": _GLOBAL_LIMIT, "ips": _rate_cfg}
        tmp = str(RATE_LIMIT_FILE) + ".tmp"
        with open(tmp, "w") as f: json.dump(d, f, indent=2)
        _os.replace(tmp, RATE_LIMIT_FILE)
    except Exception as e:
        log.error(f"rate cfg save: {e}")

_load_rate_cfg()

def _is_rate_limited(ip):
    with _rate_lock:
        now   = time.time()
        limit = _rate_cfg.get(ip, {}).get("limit", _GLOBAL_LIMIT)
        wins  = _rate_windows[ip]
        # keep only last 60 seconds
        _rate_windows[ip] = [t for t in wins if now - t < 60]
        if len(_rate_windows[ip]) >= limit:
            return True
        _rate_windows[ip].append(now)
        return False

def _is_blocked(ip):
    return _rate_cfg.get(ip, {}).get("blocked", False)

# ── Request tracking middleware ────────────────────────────────────────────
_orig_dispatch = app.wsgi_app

def _tracking_middleware(environ, start_response):
    from flask import request as _req
    ip = environ.get("HTTP_X_REAL_IP") or environ.get("REMOTE_ADDR", "unknown")
    path = environ.get("PATH_INFO", "")

    # skip admin itself from rate limiting
    if not path.startswith("/APIv3/admin"):
        if _is_blocked(ip):
            body = b\'{"error":"Your IP has been blocked."}\' 
            start_response("403 Forbidden", [
                ("Content-Type","application/json"),
                ("Access-Control-Allow-Origin","*")
            ])
            return [body]
        if _is_rate_limited(ip):
            body = b\'{"error":"Rate limit exceeded. Try again in 60 seconds."}\' 
            start_response("429 Too Many Requests", [
                ("Content-Type","application/json"),
                ("Access-Control-Allow-Origin","*"),
                ("Retry-After","60")
            ])
            return [body]

    with _stats_lock:
        global _total_requests
        _total_requests += 1
        _unique_ips.add(ip)
        _endpoint_hits[path] += 1
        _ip_hits[ip] += 1

    return _orig_dispatch(environ, start_response)

app.wsgi_app = _tracking_middleware

# ── Helpers ────────────────────────────────────────────────────────────────
def _sys_stats():
    try:
        import psutil
        cpu  = psutil.cpu_percent(interval=0.2)
        ram  = psutil.virtual_memory()
        disk = psutil.disk_usage("/opt/publicdrop-api/data")
        logo_dir = Path("/opt/publicdrop-api/data/logos")
        logo_count = len(list(logo_dir.glob("*"))) if logo_dir.exists() else 0
        return {
            "cpu_pct":       cpu,
            "ram_used_mb":   round(ram.used / 1024**2),
            "ram_total_mb":  round(ram.total / 1024**2),
            "ram_pct":       ram.percent,
            "disk_used_mb":  round(disk.used / 1024**2),
            "disk_total_mb": round(disk.total / 1024**2),
            "disk_pct":      round(disk.used / disk.total * 100, 1),
            "logo_count":    logo_count,
        }
    except Exception as e:
        return {"error": str(e)}

def _svc_status(name):
    try:
        r = _subprocess.run(
            ["systemctl", "is-active", name],
            capture_output=True, text=True, timeout=3
        )
        return r.stdout.strip()
    except Exception:
        return "unknown"

def _uptime_str(seconds):
    seconds = int(seconds)
    d, r = divmod(seconds, 86400)
    h, r = divmod(r, 3600)
    m, s = divmod(r, 60)
    parts = []
    if d: parts.append(f"{d}d")
    if h: parts.append(f"{h}h")
    if m: parts.append(f"{m}m")
    parts.append(f"{s}s")
    return " ".join(parts)

def _admin_required():
    from flask import session as _sess, redirect
    if not _sess.get("admin_ok"):
        return redirect("/APIv3/admin/access")
    return None

app.secret_key = "pd_adm_x9k2_secret_2026"

# ══════════════════════════════════════════════════════════════════════════
# ADMIN ROUTES
# ══════════════════════════════════════════════════════════════════════════

@app.route("/APIv3/admin/access", methods=["GET","POST"])
def admin_access():
    from flask import session as _sess, redirect, request as _req
    err = ""
    if _req.method == "POST":
        if _req.form.get("pw","") == ADMIN_PASSWORD:
            _sess["admin_ok"] = True
            return redirect("/APIv3/admin/dashboard")
        err = "Incorrect password."
    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PublicDrop Admin</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{margin:0;padding:0;box-sizing:border-box;}}
:root{{
  --bg:#131210;--paper:#181714;--surface:#1F1E1A;--surface2:#272521;
  --border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.11);
  --t1:#F0EDE6;--t2:#9B9590;--t3:#5C5750;
  --accent:#1A56DB;--accentb:rgba(26,86,219,.15);
  --up:#1A7A4A;--dn:#C0392B;
  --ff:'Geist',sans-serif;--fm:'Geist Mono',monospace;
  --r:10px;--pill:999px;
}}
body{{font-family:var(--ff);background:var(--bg);color:var(--t1);
     display:flex;align-items:center;justify-content:center;min-height:100vh;}}
.wrap{{width:100%;max-width:400px;padding:24px;}}
.logo{{text-align:center;margin-bottom:32px;}}
.logo-mark{{width:44px;height:44px;background:var(--t1);border-radius:10px;
           display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;}}
.logo-mark svg{{width:22px;height:22px;color:var(--bg);}}
.logo h1{{font-size:20px;font-weight:700;letter-spacing:-.4px;}}
.logo p{{font-size:13px;color:var(--t2);margin-top:4px;}}
.card{{background:var(--surface);border:1px solid var(--border2);
       border-radius:14px;padding:28px;box-shadow:0 8px 32px rgba(0,0,0,.4);}}
label{{font-size:12px;font-weight:600;color:var(--t2);letter-spacing:.3px;
       text-transform:uppercase;display:block;margin-bottom:8px;}}
input[type=password]{{
  width:100%;padding:11px 14px;background:var(--surface2);
  border:1px solid var(--border2);border-radius:var(--r);
  color:var(--t1);font-family:var(--fm);font-size:14px;outline:none;
  transition:border .2s,box-shadow .2s;
}}
input[type=password]:focus{{border-color:var(--accent);box-shadow:0 0 0 3px var(--accentb);}}
.btn{{
  width:100%;margin-top:16px;padding:12px;
  background:var(--t1);color:var(--bg);
  border:none;border-radius:var(--pill);
  font-family:var(--ff);font-size:14px;font-weight:700;
  cursor:pointer;transition:opacity .18s,transform .18s;letter-spacing:.1px;
}}
.btn:hover{{opacity:.85;transform:translateY(-1px);}}
.err{{margin-top:12px;padding:10px 14px;background:rgba(192,57,43,.12);
      border:1px solid rgba(192,57,43,.25);border-radius:var(--r);
      color:#E87070;font-size:13px;}}
.footer{{text-align:center;margin-top:20px;font-size:12px;color:var(--t3);}}
</style>
</head>
<body>
<div class="wrap">
  <div class="logo">
    <div class="logo-mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <h1>PublicDrop Admin</h1>
    <p>Enter your password to continue</p>
  </div>
  <div class="card">
    <form method="POST">
      <label>Admin Password</label>
      <input type="password" name="pw" placeholder="••••••••••" autofocus>
      {"<div class=\\"err\\">⚠ " + err + "</div>" if err else ""}
      <button class="btn" type="submit">Access Dashboard →</button>
    </form>
  </div>
  <div class="footer">publicdrop.in · Restricted Access</div>
</div>
</body>
</html>"""
    return _cors(app.response_class(response=html, mimetype="text/html"))


@app.route("/APIv3/admin/dashboard")
def admin_dashboard():
    from flask import session as _sess, redirect
    if not _sess.get("admin_ok"):
        return redirect("/APIv3/admin/access")

    sys   = _sys_stats()
    uptime = _uptime_str(time.time() - _launch_time)
    meta_svc  = _svc_status("publicdrop-meta")
    live_svc  = _svc_status("publicdrop-live")
    api_svc   = _svc_status("publicdrop-apiv3")

    top_ips = sorted(_ip_hits.items(), key=lambda x: x[1], reverse=True)[:10]
    top_eps = sorted(_endpoint_hits.items(), key=lambda x: x[1], reverse=True)[:8]

    meta_size = Path("/opt/publicdrop-api/data/meta.json").stat().st_size // 1024 if Path("/opt/publicdrop-api/data/meta.json").exists() else 0
    live_size = Path("/opt/publicdrop-api/data/live.json").stat().st_size // 1024 if Path("/opt/publicdrop-api/data/live.json").exists() else 0

    rate_rows = ""
    for ip2, cfg2 in _rate_cfg.items():
        blocked   = cfg2.get("blocked", False)
        premium   = cfg2.get("premium", False)
        lim       = cfg2.get("limit", _GLOBAL_LIMIT)
        note      = cfg2.get("note", "")
        badge     = '<span class="badge badge-dn">Blocked</span>' if blocked else ('<span class="badge badge-up">Premium</span>' if premium else '<span class="badge badge-neu">Custom</span>')
        rate_rows += f"""<tr>
          <td class="mono">{ip2}</td>
          <td>{badge}</td>
          <td class="mono">{lim}/min</td>
          <td class="t3">{note or "—"}</td>
          <td>
            <button class="tbtn tbtn-dn" onclick="doBlock('{ip2}',{str(not blocked).lower()})">
              {"Unblock" if blocked else "Block"}
            </button>
            <button class="tbtn tbtn-acc" onclick="setLimit('{ip2}')">Limit</button>
            <button class="tbtn" onclick="removeIP('{ip2}')">Remove</button>
          </td>
        </tr>"""

    top_ip_rows = "".join(
        f"<tr><td class='mono'>{ip2}</td><td class='mono'>{cnt}</td></tr>"
        for ip2, cnt in top_ips
    )
    top_ep_rows = "".join(
        f"<tr><td class='mono'>{ep}</td><td class='mono'>{cnt}</td></tr>"
        for ep, cnt in top_eps
    )

    svc_badge = lambda s: '<span class="badge badge-up">●&nbsp;Active</span>' if s == "active" else f'<span class="badge badge-dn">●&nbsp;{s}</span>'

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PublicDrop Admin Dashboard</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300;400;500;600;700;800&family=Geist+Mono:wght@400;500;600&family=Instrument+Serif:ital@0;1&display=swap" rel="stylesheet">
<style>
*,*::before,*::after{{margin:0;padding:0;box-sizing:border-box;}}
:root{{
  --bg:#131210;--paper:#181714;--surface:#1F1E1A;--surface2:#272521;--surface3:#302E29;
  --border:rgba(255,255,255,.07);--border2:rgba(255,255,255,.11);--border3:rgba(255,255,255,.18);
  --t1:#F0EDE6;--t2:#9B9590;--t3:#5C5750;
  --accent:#1A56DB;--accentb:rgba(26,86,219,.15);--accentbr:rgba(26,86,219,.3);
  --up:#1A7A4A;--upb:rgba(26,122,74,.12);--upbr:rgba(26,122,74,.3);
  --dn:#C0392B;--dnb:rgba(192,57,43,.12);--dnbr:rgba(192,57,43,.3);
  --gold:#B8960C;--goldb:rgba(184,150,12,.12);
  --ff:'Geist',sans-serif;--fm:'Geist Mono',monospace;
  --r:10px;--rs:7px;--pill:999px;
  --sha:0 2px 12px rgba(0,0,0,.5),0 8px 28px rgba(0,0,0,.35);
}}
body{{font-family:var(--ff);background:var(--bg);color:var(--t1);min-height:100vh;}}
a{{text-decoration:none;color:inherit;}}
/* ── Layout ── */
.topbar{{
  background:rgba(31,30,26,.94);border-bottom:1px solid var(--border2);
  backdrop-filter:blur(20px);padding:0 24px;height:54px;
  display:flex;align-items:center;justify-content:space-between;
  position:sticky;top:0;z-index:100;
}}
.topbar-left{{display:flex;align-items:center;gap:10px;}}
.logo-mark{{width:32px;height:32px;background:var(--t1);border-radius:7px;
           display:flex;align-items:center;justify-content:center;}}
.logo-mark svg{{width:16px;height:16px;color:var(--bg);}}
.topbar h1{{font-size:15px;font-weight:700;letter-spacing:-.3px;}}
.topbar-right{{display:flex;align-items:center;gap:8px;}}
.topbar-pill{{font-size:11px;font-weight:600;padding:4px 10px;border-radius:var(--pill);
             background:var(--upb);color:var(--up);border:1px solid var(--upbr);}}
.logout-btn{{font-size:12px;font-weight:600;padding:6px 14px;border-radius:var(--pill);
            background:var(--surface2);border:1px solid var(--border2);color:var(--t2);
            cursor:pointer;transition:all .18s;}}
.logout-btn:hover{{color:var(--dn);border-color:var(--dnbr);}}
.main{{max-width:1400px;margin:0 auto;padding:24px;}}
/* ── Section titles ── */
.sec-title{{font-size:11px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;
           color:var(--t3);margin-bottom:12px;margin-top:28px;}}
.sec-title:first-child{{margin-top:0;}}
/* ── Cards grid ── */
.grid{{display:grid;gap:12px;}}
.grid-4{{grid-template-columns:repeat(4,1fr);}}
.grid-3{{grid-template-columns:repeat(3,1fr);}}
.grid-2{{grid-template-columns:repeat(2,1fr);}}
@media(max-width:900px){{.grid-4,.grid-3{{grid-template-columns:repeat(2,1fr);}}.grid-2{{grid-template-columns:1fr;}}}}
@media(max-width:500px){{.grid-4,.grid-3,.grid-2{{grid-template-columns:1fr;}}}}
.card{{background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:18px 20px;}}
.card-label{{font-size:11px;font-weight:600;color:var(--t2);letter-spacing:.3px;text-transform:uppercase;margin-bottom:8px;}}
.card-val{{font-size:26px;font-weight:800;font-family:var(--fm);letter-spacing:-.5px;}}
.card-sub{{font-size:12px;color:var(--t2);margin-top:4px;}}
/* ── Progress bar ── */
.pbar-wrap{{margin-top:10px;}}
.pbar-bg{{background:var(--surface2);border-radius:var(--pill);height:6px;overflow:hidden;}}
.pbar-fill{{height:100%;border-radius:var(--pill);transition:width .6s;}}
.pbar-label{{font-size:11px;color:var(--t2);margin-top:5px;font-family:var(--fm);}}
/* ── Service status ── */
.svc-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;}}
@media(max-width:600px){{.svc-grid{{grid-template-columns:1fr;}}}}
.svc-card{{background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:16px 18px;display:flex;align-items:center;justify-content:space-between;}}
.svc-name{{font-size:13px;font-weight:600;}}
.svc-desc{{font-size:11px;color:var(--t3);margin-top:2px;}}
/* ── Badge ── */
.badge{{font-size:10px;font-weight:700;padding:3px 8px;border-radius:var(--pill);letter-spacing:.2px;}}
.badge-up{{background:var(--upb);color:var(--up);border:1px solid var(--upbr);}}
.badge-dn{{background:var(--dnb);color:#E87070;border:1px solid var(--dnbr);}}
.badge-neu{{background:var(--surface3);color:var(--t2);border:1px solid var(--border2);}}
.badge-acc{{background:var(--accentb);color:#6B9FFF;border:1px solid var(--accentbr);}}
/* ── Tables ── */
.tbl-wrap{{background:var(--surface);border:1px solid var(--border2);border-radius:14px;overflow:hidden;}}
table{{width:100%;border-collapse:collapse;}}
th{{font-size:11px;font-weight:700;color:var(--t3);letter-spacing:.4px;text-transform:uppercase;
   padding:10px 16px;background:var(--surface2);text-align:left;border-bottom:1px solid var(--border2);}}
td{{padding:11px 16px;font-size:13px;border-bottom:1px solid var(--border);}}
tr:last-child td{{border-bottom:none;}}
tr:hover td{{background:var(--surface2);}}
.mono{{font-family:var(--fm);font-size:12px;}}
.t3{{color:var(--t3);}}
/* ── Action buttons in table ── */
.tbtn{{font-size:11px;font-weight:600;padding:4px 10px;border-radius:var(--pill);
      cursor:pointer;border:1px solid var(--border2);background:var(--surface2);
      color:var(--t2);transition:all .15s;margin-right:4px;}}
.tbtn:hover{{border-color:var(--border3);color:var(--t1);}}
.tbtn-dn{{color:#E87070;border-color:var(--dnbr);background:var(--dnb);}}
.tbtn-dn:hover{{background:var(--dn);color:#fff;}}
.tbtn-acc{{color:#6B9FFF;border-color:var(--accentbr);background:var(--accentb);}}
.tbtn-acc:hover{{background:var(--accent);color:#fff;}}
.tbtn-up{{color:var(--up);border-color:var(--upbr);background:var(--upb);}}
.tbtn-up:hover{{background:var(--up);color:#fff;}}
/* ── Control panel ── */
.ctrl-card{{background:var(--surface);border:1px solid var(--border2);border-radius:14px;padding:20px;}}
.ctrl-row{{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px;}}
.ctrl-row:last-child{{margin-bottom:0;}}
.ctrl-label{{font-size:12px;font-weight:600;color:var(--t2);min-width:160px;}}
.ctrl-input{{
  padding:8px 12px;background:var(--surface2);border:1px solid var(--border2);
  border-radius:var(--r);color:var(--t1);font-family:var(--fm);font-size:13px;
  outline:none;transition:border .2s,box-shadow .2s;width:180px;
}}
.ctrl-input:focus{{border-color:var(--accent);box-shadow:0 0 0 3px var(--accentb);}}
.ctrl-btn{{
  padding:8px 18px;border-radius:var(--pill);font-family:var(--ff);font-size:13px;
  font-weight:700;cursor:pointer;border:none;transition:all .18s;
}}
.ctrl-btn-acc{{background:var(--accent);color:#fff;}}
.ctrl-btn-acc:hover{{opacity:.85;transform:translateY(-1px);}}
.ctrl-btn-dn{{background:var(--dn);color:#fff;}}
.ctrl-btn-dn:hover{{opacity:.85;}}
.ctrl-btn-up{{background:var(--up);color:#fff;}}
.ctrl-btn-up:hover{{opacity:.85;}}
.ctrl-btn-neu{{background:var(--surface2);color:var(--t1);border:1px solid var(--border2);}}
.ctrl-btn-neu:hover{{border-color:var(--border3);}}
/* ── Toast ── */
#TOAST{{
  position:fixed;bottom:24px;right:24px;z-index:999;
  background:var(--surface);border:1px solid var(--border2);
  border-radius:var(--r);padding:12px 18px;font-size:13px;font-weight:500;
  box-shadow:var(--sha);opacity:0;transform:translateY(10px);
  transition:opacity .25s,transform .25s;pointer-events:none;max-width:320px;
}}
#TOAST.show{{opacity:1;transform:translateY(0);}}
/* ── Divider ── */
.div{{border:none;border-top:1px solid var(--border);margin:8px 0;}}
</style>
</head>
<body>
<div class="topbar">
  <div class="topbar-left">
    <div class="logo-mark">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
      </svg>
    </div>
    <h1>PublicDrop Admin</h1>
    <span class="topbar-pill">● Live</span>
  </div>
  <div class="topbar-right">
    <span style="font-size:12px;color:var(--t3);">Uptime: <span style="font-family:var(--fm);color:var(--t2);">{uptime}</span></span>
    <a href="/APIv3/admin/logout"><button class="logout-btn">Sign Out</button></a>
  </div>
</div>

<div class="main">

  <!-- ── Overview Stats ── -->
  <div class="sec-title">Overview</div>
  <div class="grid grid-4">
    <div class="card">
      <div class="card-label">Total Requests</div>
      <div class="card-val">{_total_requests:,}</div>
      <div class="card-sub">Since API launch</div>
    </div>
    <div class="card">
      <div class="card-label">Unique IPs</div>
      <div class="card-val">{len(_unique_ips):,}</div>
      <div class="card-sub">Distinct callers</div>
    </div>
    <div class="card">
      <div class="card-label">Total Coins</div>
      <div class="card-val">{len(_meta):,}</div>
      <div class="card-sub">In meta.json</div>
    </div>
    <div class="card">
      <div class="card-label">Live Prices</div>
      <div class="card-val">{len(_live):,}</div>
      <div class="card-sub">Cached coins</div>
    </div>
  </div>

  <!-- ── System Resources ── -->
  <div class="sec-title">System Resources</div>
  <div class="grid grid-3">
    <div class="card">
      <div class="card-label">CPU Usage</div>
      <div class="card-val">{sys.get('cpu_pct',0):.1f}<span style="font-size:16px;color:var(--t2)">%</span></div>
      <div class="pbar-wrap">
        <div class="pbar-bg"><div class="pbar-fill" style="width:{sys.get('cpu_pct',0):.1f}%;background:{'var(--dn)' if sys.get('cpu_pct',0)>80 else 'var(--accent)'};"></div></div>
        <div class="pbar-label">Oracle Linux 9 · Always Free VM</div>
      </div>
    </div>
    <div class="card">
      <div class="card-label">RAM Usage</div>
      <div class="card-val">{sys.get('ram_pct',0):.1f}<span style="font-size:16px;color:var(--t2)">%</span></div>
      <div class="pbar-wrap">
        <div class="pbar-bg"><div class="pbar-fill" style="width:{sys.get('ram_pct',0):.1f}%;background:{'var(--dn)' if sys.get('ram_pct',0)>85 else 'var(--up)'};"></div></div>
        <div class="pbar-label">{sys.get('ram_used_mb',0):,} MB / {sys.get('ram_total_mb',0):,} MB</div>
      </div>
    </div>
    <div class="card">
      <div class="card-label">Storage Usage</div>
      <div class="card-val">{sys.get('disk_pct',0):.1f}<span style="font-size:16px;color:var(--t2)">%</span></div>
      <div class="pbar-wrap">
        <div class="pbar-bg"><div class="pbar-fill" style="width:{sys.get('disk_pct',0):.1f}%;background:{'var(--dn)' if sys.get('disk_pct',0)>85 else 'var(--gold)'};"></div></div>
        <div class="pbar-label">{sys.get('disk_used_mb',0):,} MB used · {sys.get('logo_count',0):,} logos · meta {meta_size} KB · live {live_size} KB</div>
      </div>
    </div>
  </div>

  <!-- ── Services ── -->
  <div class="sec-title">Services</div>
  <div class="svc-grid">
    <div class="svc-card">
      <div>
        <div class="svc-name">publicdrop-apiv3</div>
        <div class="svc-desc">Gunicorn · Port 7780</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        {svc_badge(api_svc)}
        <div style="display:flex;gap:6px;">
          <button class="tbtn tbtn-up" onclick="svcAction('restart','publicdrop-apiv3')">Restart</button>
          <button class="tbtn tbtn-dn" onclick="svcAction('stop','publicdrop-apiv3')">Stop</button>
        </div>
      </div>
    </div>
    <div class="svc-card">
      <div>
        <div class="svc-name">publicdrop-live</div>
        <div class="svc-desc">CG Tiered + CMC + F&G</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        {svc_badge(live_svc)}
        <div style="display:flex;gap:6px;">
          <button class="tbtn tbtn-up" onclick="svcAction('restart','publicdrop-live')">Restart</button>
          <button class="tbtn tbtn-dn" onclick="svcAction('stop','publicdrop-live')">Stop</button>
        </div>
      </div>
    </div>
    <div class="svc-card">
      <div>
        <div class="svc-name">publicdrop-meta</div>
        <div class="svc-desc">Monthly CMC + CoinGecko</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:6px;">
        {svc_badge(meta_svc)}
        <div style="display:flex;gap:6px;">
          <button class="tbtn tbtn-up" onclick="svcAction('restart','publicdrop-meta')">Restart</button>
          <button class="tbtn tbtn-dn" onclick="svcAction('stop','publicdrop-meta')">Stop</button>
        </div>
      </div>
    </div>
  </div>

  <!-- ── Rate Limiting ── -->
  <div class="sec-title">Rate Limiting & Access Control</div>
  <div class="ctrl-card" style="margin-bottom:12px;">
    <div class="ctrl-row">
      <span class="ctrl-label">Global Limit (req/min)</span>
      <input class="ctrl-input" id="GLOBAL_LIM" type="number" value="{_GLOBAL_LIMIT}" min="1" max="10000">
      <button class="ctrl-btn ctrl-btn-acc" onclick="setGlobalLimit()">Apply Global Limit</button>
    </div>
    <hr class="div">
    <div class="ctrl-row">
      <span class="ctrl-label">Add IP Rule</span>
      <input class="ctrl-input" id="NEW_IP" type="text" placeholder="e.g. 1.2.3.4">
      <input class="ctrl-input" id="NEW_LIM" type="number" placeholder="Limit/min" min="1">
      <input class="ctrl-input" id="NEW_NOTE" type="text" placeholder="Note (optional)" style="width:140px;">
      <button class="ctrl-btn ctrl-btn-up" onclick="addPremium()">Add Premium</button>
      <button class="ctrl-btn ctrl-btn-dn" onclick="addBlock()">Block IP</button>
    </div>
  </div>

  <div class="tbl-wrap">
    <table>
      <thead><tr><th>IP Address</th><th>Type</th><th>Limit</th><th>Note</th><th>Actions</th></tr></thead>
      <tbody id="RATE_TBODY">
        {rate_rows if rate_rows else "<tr><td colspan='5' class='t3' style='text-align:center;padding:20px;'>No custom IP rules yet</td></tr>"}
      </tbody>
    </table>
  </div>

  <!-- ── Top IPs & Endpoints ── -->
  <div class="sec-title">Traffic Analytics</div>
  <div class="grid grid-2">
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Top IP Addresses</th><th>Requests</th></tr></thead>
        <tbody>{top_ip_rows if top_ip_rows else "<tr><td colspan='2' class='t3' style='text-align:center;padding:16px;'>No data yet</td></tr>"}</tbody>
      </table>
    </div>
    <div class="tbl-wrap">
      <table>
        <thead><tr><th>Top Endpoints</th><th>Hits</th></tr></thead>
        <tbody>{top_ep_rows if top_ep_rows else "<tr><td colspan='2' class='t3' style='text-align:center;padding:16px;'>No data yet</td></tr>"}</tbody>
      </table>
    </div>
  </div>

  <div style="height:40px;"></div>
</div>

<div id="TOAST"></div>

<script>
function toast(msg, ok=true) {{
  const t = document.getElementById('TOAST');
  t.textContent = msg;
  t.style.borderColor = ok ? 'rgba(26,122,74,.3)' : 'rgba(192,57,43,.3)';
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}}

async function api(url, body) {{
  try {{
    const r = await fetch(url, {{
      method: 'POST',
      headers: {{'Content-Type':'application/json'}},
      body: JSON.stringify(body)
    }});
    return await r.json();
  }} catch(e) {{ return {{error: e.toString()}}; }}
}}

async function setGlobalLimit() {{
  const lim = parseInt(document.getElementById('GLOBAL_LIM').value);
  if (!lim || lim < 1) {{ toast('Enter a valid limit', false); return; }}
  const r = await api('/APIv3/admin/api/global-limit', {{limit: lim}});
  r.ok ? toast(`✅ Global limit set to ${{lim}}/min`) : toast('❌ ' + r.error, false);
}}

async function addPremium() {{
  const ip  = document.getElementById('NEW_IP').value.trim();
  const lim = parseInt(document.getElementById('NEW_LIM').value) || 0;
  const note = document.getElementById('NEW_NOTE').value.trim();
  if (!ip) {{ toast('Enter an IP address', false); return; }}
  const r = await api('/APIv3/admin/api/ip-rule', {{ip, limit: lim || null, premium: true, note}});
  r.ok ? (toast(`✅ Premium added: ${{ip}}`), setTimeout(()=>location.reload(),1000)) : toast('❌ ' + r.error, false);
}}

async function addBlock() {{
  const ip = document.getElementById('NEW_IP').value.trim();
  const note = document.getElementById('NEW_NOTE').value.trim();
  if (!ip) {{ toast('Enter an IP address', false); return; }}
  if (!confirm(`Block ${{ip}}? They will get 403 errors.`)) return;
  const r = await api('/APIv3/admin/api/ip-rule', {{ip, blocked: true, note}});
  r.ok ? (toast(`🚫 Blocked: ${{ip}}`), setTimeout(()=>location.reload(),1000)) : toast('❌ ' + r.error, false);
}}

async function doBlock(ip, block) {{
  const r = await api('/APIv3/admin/api/ip-rule', {{ip, blocked: block}});
  r.ok ? (toast(block ? `🚫 Blocked: ${{ip}}` : `✅ Unblocked: ${{ip}}`), setTimeout(()=>location.reload(),1000)) : toast('❌ ' + r.error, false);
}}

async function setLimit(ip) {{
  const lim = prompt(`New req/min limit for ${{ip}}:`);
  if (!lim) return;
  const r = await api('/APIv3/admin/api/ip-rule', {{ip, limit: parseInt(lim), premium: true}});
  r.ok ? (toast(`✅ Limit updated: ${{ip}} → ${{lim}}/min`), setTimeout(()=>location.reload(),1000)) : toast('❌ ' + r.error, false);
}}

async function removeIP(ip) {{
  if (!confirm(`Remove rule for ${{ip}}?`)) return;
  const r = await api('/APIv3/admin/api/remove-ip', {{ip}});
  r.ok ? (toast(`Removed: ${{ip}}`), setTimeout(()=>location.reload(),1000)) : toast('❌ ' + r.error, false);
}}

async function svcAction(action, svc) {{
  if (action === 'stop' && !confirm(`Stop ${{svc}}? API calls will fail.`)) return;
  const r = await api('/APIv3/admin/api/service', {{action, service: svc}});
  r.ok ? (toast(`✅ ${{svc}} ${{action}}ed`), setTimeout(()=>location.reload(),2000)) : toast('❌ ' + r.error, false);
}}

// Auto refresh every 30s
setTimeout(() => location.reload(), 30000);
</script>
</body>
</html>"""
    return _cors(app.response_class(response=html, mimetype="text/html"))


@app.route("/APIv3/admin/logout")
def admin_logout():
    from flask import session as _sess, redirect
    _sess.clear()
    return redirect("/APIv3/admin/access")


@app.route("/APIv3/admin/api/global-limit", methods=["POST"])
def admin_global_limit():
    from flask import session as _sess, request as _req
    if not _sess.get("admin_ok"):
        return jsonify({"error": "Unauthorized"}), 403
    global _GLOBAL_LIMIT
    data = _req.get_json() or {}
    lim  = data.get("limit")
    if not lim or not isinstance(lim, int) or lim < 1:
        return jsonify({"error": "Invalid limit"}), 400
    _GLOBAL_LIMIT = lim
    _save_rate_cfg()
    return _cors(jsonify({"ok": True, "global_limit": _GLOBAL_LIMIT}))


@app.route("/APIv3/admin/api/ip-rule", methods=["POST"])
def admin_ip_rule():
    from flask import session as _sess, request as _req
    if not _sess.get("admin_ok"):
        return jsonify({"error": "Unauthorized"}), 403
    data    = _req.get_json() or {}
    ip      = data.get("ip", "").strip()
    if not ip:
        return jsonify({"error": "IP required"}), 400
    entry   = _rate_cfg.get(ip, {})
    if "limit"   in data and data["limit"]: entry["limit"]   = int(data["limit"])
    if "blocked" in data:                  entry["blocked"]  = bool(data["blocked"])
    if "premium" in data:                  entry["premium"]  = bool(data["premium"])
    if "note"    in data:                  entry["note"]     = str(data["note"])
    if not entry.get("limit"): entry["limit"] = _GLOBAL_LIMIT
    _rate_cfg[ip] = entry
    _save_rate_cfg()
    return _cors(jsonify({"ok": True, "ip": ip, "rule": entry}))


@app.route("/APIv3/admin/api/remove-ip", methods=["POST"])
def admin_remove_ip():
    from flask import session as _sess, request as _req
    if not _sess.get("admin_ok"):
        return jsonify({"error": "Unauthorized"}), 403
    data = _req.get_json() or {}
    ip   = data.get("ip","").strip()
    _rate_cfg.pop(ip, None)
    _save_rate_cfg()
    return _cors(jsonify({"ok": True}))


@app.route("/APIv3/admin/api/service", methods=["POST"])
def admin_service():
    from flask import session as _sess, request as _req
    if not _sess.get("admin_ok"):
        return jsonify({"error": "Unauthorized"}), 403
    data    = _req.get_json() or {}
    action  = data.get("action","")
    service = data.get("service","")
    ALLOWED_SVCS    = {"publicdrop-meta","publicdrop-live","publicdrop-apiv3"}
    ALLOWED_ACTIONS = {"start","stop","restart"}
    if service not in ALLOWED_SVCS or action not in ALLOWED_ACTIONS:
        return jsonify({"error": "Invalid service or action"}), 400
    try:
        _subprocess.run(["sudo","systemctl",action,service], timeout=10, check=True)
        return _cors(jsonify({"ok": True}))
    except Exception as e:
        return _cors(jsonify({"error": str(e)}))
# ════════════════════════════════════════════════════════════════════════════
# END ADMIN DASHBOARD
# ════════════════════════════════════════════════════════════════════════════
'''

# ── Inject admin block before "if __name__" ────────────────────────────────
content = TARGET.read_text()

MARKER = '# ── Entrypoint ──'
if MARKER not in content:
    print("❌ Could not find injection point in api server. Aborting.")
    sys.exit(1)

if "admin_access" in content:
    print("ℹ️  Admin block already injected. Re-injecting cleanly...")
    # Remove old admin block
    start = content.find("\n# ════════════════════════════════════════════════════════════════════════════\n# ADMIN DASHBOARD")
    end   = content.find("\n# END ADMIN DASHBOARD")
    if start != -1 and end != -1:
        end_full = content.find("\n", end + len("\n# END ADMIN DASHBOARD") + 50) + 1
        content  = content[:start] + content[end_full:]

content = content.replace(MARKER, ADMIN_BLOCK + "\n" + MARKER)

# ── Write safely ──────────────────────────────────────────────────────────
tmp = str(TARGET) + ".tmp"
with open(tmp, "w") as f:
    f.write(content)

# ── Syntax check before replacing ─────────────────────────────────────────
import ast, subprocess
try:
    ast.parse(content)
    print("✅ Syntax OK")
except SyntaxError as e:
    print(f"❌ Syntax error: {e}")
    os.unlink(tmp)
    sys.exit(1)

os.replace(tmp, TARGET)
print("✅ Admin dashboard injected into publicdrop_api_server.py")

# ── Install psutil ─────────────────────────────────────────────────────────
subprocess.run(
    ["/opt/publicdrop-api/venv/bin/pip", "install", "psutil", "--quiet"],
    check=False
)
print("✅ psutil installed")

# ── Add sudo rule for systemctl ────────────────────────────────────────────
sudoers_line = "publicdrop ALL=(ALL) NOPASSWD: /bin/systemctl start publicdrop-*, /bin/systemctl stop publicdrop-*, /bin/systemctl restart publicdrop-*\n"
sudoers_file = Path("/etc/sudoers.d/publicdrop-admin")
if not sudoers_file.exists():
    sudoers_file.write_text(sudoers_line)
    sudoers_file.chmod(0o440)
    print("✅ Sudoers rule added")

print("\n✅ All done! Restart the API:")
print("   sudo systemctl restart publicdrop-apiv3")
print("\n🌐 Dashboard: https://publicdrop.in/APIv3/admin/access")
print("🔑 Password:  Pd#905078")
