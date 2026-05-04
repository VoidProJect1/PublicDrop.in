#!/bin/bash
# PublicDrop — Minimal Usage Dashboard (Disk + IPs + Requests only)
# Run: bash <(curl -s https://raw.githubusercontent.com/VoidProJect1/PublicDrop.in/main/usage_dashboard.sh)

INSTALL_DIR="/opt/publicdrop-api"

echo "================================================"
echo " PublicDrop — Usage Dashboard Setup"
echo "================================================"

# Step 1: Patch api_server.py
echo "[1/3] Patching api_server.py..."
python3 << 'PATCHEOF'
f = "/opt/publicdrop-api/api_server.py"
content = open(f).read()
applied = 0

ANALYTICS = '''
# Analytics
import collections
_analytics_lock = threading.Lock()
_ip_counts      = collections.Counter()
_route_counts   = collections.Counter()
_total_requests = 0
_analytics_file = "/opt/publicdrop-api/data/analytics.json"

def _save_analytics():
    try:
        with _analytics_lock:
            data = {
                "total_requests": _total_requests,
                "unique_ips":     len(_ip_counts),
                "top_ips":        dict(_ip_counts.most_common(100)),
                "route_counts":   dict(_route_counts),
                "saved_at":       __import__("datetime").datetime.utcnow().isoformat()
            }
        with open(_analytics_file, "w") as fp:
            __import__("json").dump(data, fp)
    except: pass

def _load_analytics():
    global _total_requests
    try:
        if __import__("os").path.exists(_analytics_file):
            d = __import__("json").load(open(_analytics_file))
            with _analytics_lock:
                _ip_counts.update(d.get("top_ips", {}))
                _route_counts.update(d.get("route_counts", {}))
                _total_requests = d.get("total_requests", 0)
    except: pass

def _track():
    global _total_requests
    ip    = request.headers.get("X-Forwarded-For", request.remote_addr or "unknown").split(",")[0].strip()
    route = request.path
    with _analytics_lock:
        _ip_counts[ip]       += 1
        _route_counts[route] += 1
        _total_requests      += 1
        if _total_requests % 50 == 0:
            threading.Thread(target=_save_analytics, daemon=True).start()
'''

if "_analytics_lock" not in content:
    content = content.replace("app = Flask(__name__)\n", "app = Flask(__name__)\n" + ANALYTICS)
    applied += 1
    print("✓ Analytics added")
else:
    print("· Analytics already present")

TRACKER = """
@app.before_request
def track_request():
    _track()
"""
if "before_request" not in content:
    content = content.replace("@app.route('/APIv3/details')", TRACKER + "\n@app.route('/APIv3/details')")
    applied += 1
    print("✓ Tracker hooked")
else:
    print("· Tracker already present")

if "_load_analytics()" not in content:
    content = content.replace(
        "    init_db()\n    _build_cache()",
        "    init_db()\n    _build_cache()\n    _load_analytics()"
    )
    applied += 1
    print("✓ Analytics loaded on startup")
else:
    print("· Load already present")

USAGE_ENDPOINT = '''
@app.route('/internal/usage/vm/data')
def usage_data():
    import shutil
    disk = shutil.disk_usage("/")
    with _analytics_lock:
        top_ips    = dict(_ip_counts.most_common(100))
        total_req  = _total_requests
        unique_ips = len(_ip_counts)
    return jsonify({
        "total_requests": total_req,
        "unique_ips":     unique_ips,
        "top_ips":        top_ips,
        "disk": {
            "used_gb":    round(disk.used  / 1e9, 2),
            "total_gb":   round(disk.total / 1e9, 2),
            "free_gb":    round(disk.free  / 1e9, 2),
            "percent":    round(disk.used  / disk.total * 100, 1)
        }
    })
'''

if "'/internal/usage/vm/data'" not in content:
    content = content.replace("@app.route('/')\ndef home():", USAGE_ENDPOINT + "\n@app.route('/')\ndef home():")
    applied += 1
    print("✓ /internal/usage/vm/data endpoint added")
else:
    print("· Endpoint already present")

open(f, "w").write(content)
print(f"\nDone — {applied} patches applied")
PATCHEOF

# Step 2: Write minimal usage.html
echo "[2/3] Writing usage.html..."
cat > "$INSTALL_DIR/usage.html" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PublicDrop — VM Usage</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0a0f;--surface:#13131a;--border:#1e1e2e;--accent:#6c63ff;--green:#00e5a0;--yellow:#ffd60a;--red:#ff4d6d;--text:#e2e2f0;--muted:#6b6b8a}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Space Grotesk',sans-serif;background:var(--bg);color:var(--text);min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px}
.logo{font-size:20px;font-weight:700;margin-bottom:32px;display:flex;align-items:center;gap:10px}
.dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;width:100%;max-width:860px}
@media(max-width:600px){.cards{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:16px;padding:28px 24px;text-align:center}
.clabel{font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);margin-bottom:10px}
.cval{font-family:'JetBrains Mono',monospace;font-size:38px;font-weight:600;line-height:1;margin-bottom:6px}
.csub{font-size:12px;color:var(--muted)}
.disk-bar{height:6px;background:var(--border);border-radius:99px;overflow:hidden;margin:14px 0 6px}
.disk-fill{height:100%;border-radius:99px;background:linear-gradient(90deg,var(--green),var(--yellow));transition:width 1s ease}
.upd{font-size:11px;color:var(--muted);margin-top:24px;font-family:'JetBrains Mono',monospace}
.refresh-btn{background:rgba(108,99,255,.15);color:var(--accent);border:1px solid rgba(108,99,255,.3);padding:8px 18px;border-radius:8px;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;cursor:pointer;margin-top:16px}
.refresh-btn:hover{background:rgba(108,99,255,.3)}
</style>
</head>
<body>
<div class="logo"><div class="dot"></div>PublicDrop <span style="color:var(--muted);font-weight:400;margin-left:4px">/ VM Usage</span></div>

<div class="cards">
  <div class="card">
    <div class="clabel">Total Requests</div>
    <div class="cval" style="color:var(--accent)" id="totalReq">—</div>
    <div class="csub">API calls since launch</div>
  </div>
  <div class="card">
    <div class="clabel">Unique IPs</div>
    <div class="cval" style="color:var(--green)" id="uniqueIPs">—</div>
    <div class="csub">Distinct callers</div>
  </div>
  <div class="card">
    <div class="clabel">Disk Usage</div>
    <div class="cval" style="color:var(--yellow)" id="diskPct">—</div>
    <div class="disk-bar"><div class="disk-fill" id="diskBar" style="width:0%"></div></div>
    <div class="csub" id="diskDetail">— / — GB</div>
  </div>
</div>

<div class="upd" id="lastUpd">Loading...</div>
<button class="refresh-btn" onclick="loadData()">↻ Refresh</button>

<script>
function fmt(n){if(!n)return'0';if(n>=1e9)return(n/1e9).toFixed(1)+'B';if(n>=1e6)return(n/1e6).toFixed(1)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return String(n)}
async function loadData(){
  try{
    const r=await fetch('/internal/usage/vm/data');
    const d=await r.json();
    document.getElementById('totalReq').textContent  = fmt(d.total_requests);
    document.getElementById('uniqueIPs').textContent = fmt(d.unique_ips);
    document.getElementById('diskPct').textContent   = d.disk.percent+'%';
    document.getElementById('diskBar').style.width   = d.disk.percent+'%';
    document.getElementById('diskDetail').textContent= d.disk.used_gb+' / '+d.disk.total_gb+' GB';
    document.getElementById('lastUpd').textContent   = 'Updated '+new Date().toLocaleTimeString();
  }catch(e){document.getElementById('lastUpd').textContent='Error: '+e.message}
}
loadData();
setInterval(loadData,30000);
</script>
</body>
</html>
HTMLEOF
echo "✓ usage.html written"

# Step 3: Apache vhost
echo "[3/3] Configuring Apache..."
sudo tee /etc/httpd/conf.d/publicdrop-docs.conf > /dev/null << 'APACHEEOF'
<VirtualHost *:80>
    ServerName docs.publicdrop.in

    # ONLY /usage/vm serves the dashboard
    Alias /usage/vm /opt/publicdrop-api/usage.html
    <Files "usage.html">
        Require all granted
    </Files>

    # /APIv3 and /api proxy to Flask
    ProxyPreserveHost On
    ProxyPass        /internal http://127.0.0.1:3001/internal
    ProxyPassReverse /internal http://127.0.0.1:3001/internal
    ProxyPass        /APIv3    http://127.0.0.1:3001/APIv3
    ProxyPassReverse /APIv3    http://127.0.0.1:3001/APIv3
    ProxyPass        /api      http://127.0.0.1:3001/APIv3
    ProxyPassReverse /api      http://127.0.0.1:3001/APIv3

    # Everything else → 404
    RedirectMatch ^/$ /usage/vm
</VirtualHost>
APACHEEOF

sudo systemctl restart httpd  2>/dev/null || sudo systemctl restart apache2 2>/dev/null || true
sudo systemctl restart publicdrop-api
sleep 4

echo ""
echo "================================================"
echo " Done! ✅"
echo ""
echo " Dashboard: https://docs.publicdrop.in/usage/vm"
echo ""
echo " Shows:"
echo "   📊 Total Requests (1 call = 1 request)"
echo "   🌐 Unique IPs"
echo "   💿 Disk Used / Total / %"
echo "   ↻  Auto-refresh every 30s"
echo ""
echo " NOT accessible at:"
echo "   ❌ publicdrop.in/usage"
echo "   ❌ publicdrop.in/APIv3/usage"
echo "================================================"
