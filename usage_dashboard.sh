#!/bin/bash
# ============================================================
#  PublicDrop — API Analytics + VM Health Dashboard
#  SAFE: Never touches coins.db, live_prices.json, API keys
#
#  Run:
#  bash <(curl -s https://raw.githubusercontent.com/VoidProJect1/PublicDrop.in/main/usage_dashboard.sh)
# ============================================================

INSTALL_DIR="/opt/publicdrop-api"
DATA_DIR="$INSTALL_DIR/data"

echo "================================================"
echo " PublicDrop — Analytics + Health Dashboard"
echo "================================================"

# Step 1: Install psutil
echo "[1/4] Installing psutil..."
sudo python3 -m pip install psutil -q 2>/dev/null || true
echo "✓ psutil ready"

# Step 2: Patch api_server.py
echo "[2/4] Patching api_server.py..."
python3 << 'PATCHEOF'
f = "/opt/publicdrop-api/api_server.py"
content = open(f).read()
applied = 0

ANALYTICS = '''
# Analytics Store
import collections, psutil
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
                "top_ips":        dict(_ip_counts.most_common(50)),
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
        if _total_requests % 100 == 0:
            threading.Thread(target=_save_analytics, daemon=True).start()
'''

if "_analytics_lock" not in content:
    content = content.replace(
        "app = Flask(__name__)\n",
        "app = Flask(__name__)\n" + ANALYTICS
    )
    applied += 1
    print("✓ Analytics store added")
else:
    print("· Analytics already present")

TRACKER = """
@app.before_request
def track_request():
    _track()
"""

if "before_request" not in content:
    content = content.replace(
        "@app.route('/APIv3/details')",
        TRACKER + "\n@app.route('/APIv3/details')"
    )
    applied += 1
    print("✓ Request tracker hooked")
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
    print("· Analytics load already present")

USAGE_ENDPOINT = '''
@app.route('/APIv3/usage')
def usage():
    import psutil, shutil
    cpu  = psutil.cpu_percent(interval=0.5)
    mem  = psutil.virtual_memory()
    disk = shutil.disk_usage("/")
    swap = psutil.swap_memory()
    with _analytics_lock:
        top_ips    = dict(_ip_counts.most_common(20))
        routes     = dict(_route_counts)
        total_req  = _total_requests
        unique_ips = len(_ip_counts)
    gfile = "/opt/publicdrop-api/data/global_data.json"
    gdata = {}
    try:
        if os.path.exists(gfile): gdata = json.load(open(gfile))
    except: pass
    conn = get_db()
    total_coins = conn.execute("SELECT COUNT(*) FROM coins").fetchone()[0]
    conn.close()
    return jsonify({
        "requests": {
            "total":      total_req,
            "unique_ips": unique_ips,
            "by_route":   routes,
            "top_ips":    top_ips
        },
        "vm_health": {
            "cpu_percent":   cpu,
            "ram_used_gb":   round(mem.used   / 1e9, 2),
            "ram_total_gb":  round(mem.total  / 1e9, 2),
            "ram_percent":   mem.percent,
            "disk_used_gb":  round(disk.used  / 1e9, 2),
            "disk_total_gb": round(disk.total / 1e9, 2),
            "disk_percent":  round(disk.used  / disk.total * 100, 1),
            "swap_used_gb":  round(swap.used  / 1e9, 2),
            "swap_total_gb": round(swap.total / 1e9, 2)
        },
        "api_health": {
            "total_coins":        total_coins,
            "cache_size":         len(_coin_cache),
            "fear_greed_value":   gdata.get("fear_greed_value"),
            "fear_greed_label":   gdata.get("fear_greed_label"),
            "gainers":            gdata.get("gainers"),
            "losers":             gdata.get("losers"),
            "neutral":            gdata.get("neutral"),
            "btc_dominance":      gdata.get("btc_dominance"),
            "eth_dominance":      gdata.get("eth_dominance"),
            "total_market_cap":   gdata.get("total_market_cap_usd"),
            "total_volume_24h":   gdata.get("total_volume_24h_usd")
        }
    })
'''

if "'/APIv3/usage'" not in content:
    content = content.replace(
        "@app.route('/')\ndef home():",
        USAGE_ENDPOINT + "\n@app.route('/')\ndef home():"
    )
    applied += 1
    print("✓ /APIv3/usage endpoint added")
else:
    print("· Usage endpoint already present")

open(f, "w").write(content)
print(f"\nDone — {applied} patches applied")
PATCHEOF

# Step 3: Write usage.html dashboard
echo "[3/4] Writing usage dashboard HTML..."
cat > "$INSTALL_DIR/usage.html" << 'HTMLEOF'
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>PublicDrop — Usage Dashboard</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
<style>
:root{--bg:#0a0a0f;--surface:#13131a;--border:#1e1e2e;--accent:#6c63ff;--green:#00e5a0;--red:#ff4d6d;--yellow:#ffd60a;--text:#e2e2f0;--muted:#6b6b8a}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Space Grotesk',sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
header{padding:20px 32px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:rgba(10,10,15,0.95);backdrop-filter:blur(12px);z-index:100}
.logo{display:flex;align-items:center;gap:10px;font-size:17px;font-weight:700}
.dot{width:9px;height:9px;border-radius:50%;background:var(--green);box-shadow:0 0 10px var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.5;transform:scale(1.4)}}
.last-upd{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted)}
.refresh-btn{background:rgba(108,99,255,.15);color:var(--accent);border:1px solid rgba(108,99,255,.3);padding:7px 16px;border-radius:8px;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:600;cursor:pointer;transition:all .2s}
.refresh-btn:hover{background:rgba(108,99,255,.3)}
main{padding:28px 32px;max-width:1400px;margin:0 auto}
.sec{font-size:10px;font-weight:700;letter-spacing:2.5px;text-transform:uppercase;color:var(--muted);margin-bottom:14px;margin-top:28px}
.g4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.g3{display:grid;grid-template-columns:repeat(3,1fr);gap:14px}
.g2{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
@media(max-width:900px){.g4,.g3{grid-template-columns:repeat(2,1fr)}.g2{grid-template-columns:1fr}main{padding:16px}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:20px;transition:border-color .2s}
.card:hover{border-color:#2e2e4e}
.clabel{font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--muted);margin-bottom:6px}
.cval{font-family:'JetBrains Mono',monospace;font-size:30px;font-weight:600;line-height:1;margin-bottom:3px}
.csub{font-size:12px;color:var(--muted)}
.bar-wrap{height:5px;background:var(--border);border-radius:99px;overflow:hidden;margin-top:10px}
.bar-fill{height:100%;border-radius:99px;transition:width .8s ease}
.gauge-wrap{display:flex;align-items:center;gap:14px;margin-top:6px}
.gauge-ring{position:relative;width:68px;height:68px;flex-shrink:0}
.gauge-ring svg{transform:rotate(-90deg)}
.track{fill:none;stroke:var(--border);stroke-width:6}
.fill{fill:none;stroke-width:6;stroke-linecap:round;transition:stroke-dashoffset .8s ease}
.gauge-center{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600}
.gauge-info .gi-label{font-size:13px;font-weight:600}
.gauge-info .gi-detail{font-size:11px;color:var(--muted);margin-top:2px}
.table-card{background:var(--surface);border:1px solid var(--border);border-radius:14px;overflow:hidden}
.table-head{padding:16px 20px 10px;font-size:10px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--muted);border-bottom:1px solid var(--border);display:flex;justify-content:space-between}
.table-row{display:flex;justify-content:space-between;align-items:center;padding:10px 20px;border-bottom:1px solid rgba(30,30,46,.5);font-size:13px;transition:background .15s}
.table-row:hover{background:rgba(108,99,255,.05)}
.table-row:last-child{border-bottom:none}
.ip-addr{font-family:'JetBrains Mono',monospace;font-size:12px;color:var(--accent)}
.req-badge{font-family:'JetBrains Mono',monospace;font-size:12px;font-weight:600;background:rgba(108,99,255,.15);color:var(--accent);padding:2px 10px;border-radius:99px}
.fg-meter{height:8px;border-radius:99px;background:linear-gradient(90deg,#ff4d6d,#ffd60a,#00e5a0);position:relative;margin:14px 0 6px}
.fg-needle{position:absolute;top:-4px;width:3px;height:16px;background:white;border-radius:2px;transform:translateX(-50%);box-shadow:0 0 6px rgba(255,255,255,.6);transition:left .8s ease}
.route-bar{display:flex;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(30,30,46,.4)}
.route-bar:last-child{border-bottom:none}
.route-name{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--accent);width:200px;flex-shrink:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.route-fill{flex:1;height:5px;background:var(--border);border-radius:99px;overflow:hidden}
.route-fill-inner{height:100%;background:var(--accent);border-radius:99px;transition:width .8s ease}
.route-count{font-family:'JetBrains Mono',monospace;font-size:11px;color:var(--muted);width:44px;text-align:right}
</style>
</head>
<body>
<header>
  <div class="logo"><div class="dot"></div>PublicDrop <span style="color:var(--muted);font-weight:400;margin-left:3px">/ Usage</span></div>
  <div style="display:flex;align-items:center;gap:14px">
    <span class="last-upd" id="lastUpd">Loading...</span>
    <button class="refresh-btn" onclick="loadData()">↻ Refresh</button>
  </div>
</header>
<main>

<div class="sec">📊 Request Analytics</div>
<div class="g4">
  <div class="card">
    <div class="clabel">Total Requests</div>
    <div class="cval" style="color:var(--accent)" id="totalReq">—</div>
    <div class="csub">All time API calls</div>
  </div>
  <div class="card">
    <div class="clabel">Unique IPs</div>
    <div class="cval" style="color:var(--green)" id="uniqueIPs">—</div>
    <div class="csub">Distinct callers</div>
  </div>
  <div class="card">
    <div class="clabel">Top Endpoint</div>
    <div class="cval" style="font-size:16px;color:var(--yellow)" id="topRoute">—</div>
    <div class="csub" id="topRouteCnt">—</div>
  </div>
  <div class="card">
    <div class="clabel">Coins in Cache</div>
    <div class="cval" style="color:var(--green)" id="cacheSize">—</div>
    <div class="csub" id="totalCoins">— total in DB</div>
  </div>
</div>

<div class="sec">🖥️ VM Health</div>
<div class="g3">
  <div class="card">
    <div class="clabel">CPU Usage</div>
    <div class="gauge-wrap">
      <div class="gauge-ring">
        <svg viewBox="0 0 68 68" width="68" height="68">
          <circle class="track" cx="34" cy="34" r="28"/>
          <circle class="fill" id="cpuArc" cx="34" cy="34" r="28" stroke="var(--accent)" stroke-dasharray="175.9" stroke-dashoffset="175.9"/>
        </svg>
        <div class="gauge-center" id="cpuPct">0%</div>
      </div>
      <div class="gauge-info">
        <div class="gi-label">Processor</div>
        <div class="gi-detail">1 vCPU Oracle</div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="clabel">RAM Usage</div>
    <div class="gauge-wrap">
      <div class="gauge-ring">
        <svg viewBox="0 0 68 68" width="68" height="68">
          <circle class="track" cx="34" cy="34" r="28"/>
          <circle class="fill" id="ramArc" cx="34" cy="34" r="28" stroke="var(--green)" stroke-dasharray="175.9" stroke-dashoffset="175.9"/>
        </svg>
        <div class="gauge-center" id="ramPct">0%</div>
      </div>
      <div class="gauge-info">
        <div class="gi-label" id="ramUsed">— GB</div>
        <div class="gi-detail" id="ramTotal">— GB Total</div>
      </div>
    </div>
  </div>
  <div class="card">
    <div class="clabel">Disk Usage</div>
    <div class="gauge-wrap">
      <div class="gauge-ring">
        <svg viewBox="0 0 68 68" width="68" height="68">
          <circle class="track" cx="34" cy="34" r="28"/>
          <circle class="fill" id="diskArc" cx="34" cy="34" r="28" stroke="var(--yellow)" stroke-dasharray="175.9" stroke-dashoffset="175.9"/>
        </svg>
        <div class="gauge-center" id="diskPct">0%</div>
      </div>
      <div class="gauge-info">
        <div class="gi-label" id="diskUsed">— GB</div>
        <div class="gi-detail" id="diskTotal">— GB Total</div>
      </div>
    </div>
  </div>
</div>

<div class="sec">📈 Market Health</div>
<div class="g4">
  <div class="card">
    <div class="clabel">Fear & Greed</div>
    <div class="cval" id="fgVal" style="color:var(--yellow)">—</div>
    <div class="fg-meter"><div class="fg-needle" id="fgNeedle" style="left:50%"></div></div>
    <div class="csub" id="fgLabel">—</div>
  </div>
  <div class="card">
    <div class="clabel">Gainers 📈</div>
    <div class="cval" style="color:var(--green)" id="gainers">—</div>
    <div class="csub">≥ +0.1% change</div>
  </div>
  <div class="card">
    <div class="clabel">Losers 📉</div>
    <div class="cval" style="color:var(--red)" id="losers">—</div>
    <div class="csub">≤ −0.1% change</div>
  </div>
  <div class="card">
    <div class="clabel">BTC Dominance</div>
    <div class="cval" style="color:var(--yellow)" id="btcDom">—</div>
    <div class="csub" id="ethDom">ETH: —%</div>
  </div>
</div>

<div class="sec" style="margin-top:28px">🔀 Requests by Endpoint</div>
<div class="table-card" style="padding:12px 20px 16px;margin-bottom:28px">
  <div id="routeList"></div>
</div>

<div class="sec">🌐 Top Callers by IP</div>
<div class="table-card">
  <div class="table-head"><span>IP Address</span><span>Requests</span></div>
  <div id="ipList"></div>
</div>

</main>
<script>
function fmt(n){if(!n)return'0';if(n>=1e9)return(n/1e9).toFixed(2)+'B';if(n>=1e6)return(n/1e6).toFixed(2)+'M';if(n>=1e3)return(n/1e3).toFixed(1)+'K';return n}
function gauge(id,pct){const c=175.9;document.getElementById(id).style.strokeDashoffset=c-(c*Math.min(pct,100)/100)}
function fgColor(v){if(v<=25)return'var(--red)';if(v<=45)return'#ff8c42';if(v<=55)return'var(--yellow)';if(v<=75)return'#aadd00';return'var(--green)'}
function set(id,val){const el=document.getElementById(id);if(el)el.textContent=val??'—'}

async function loadData(){
  try{
    const r=await fetch('/APIv3/usage');
    const d=await r.json();
    const req=d.requests, vm=d.vm_health, api=d.api_health;

    set('totalReq', fmt(req.total));
    set('uniqueIPs', fmt(req.unique_ips));
    set('cacheSize', fmt(api.cache_size));
    set('totalCoins', fmt(api.total_coins)+' total in DB');

    const routes=Object.entries(req.by_route||{}).sort((a,b)=>b[1]-a[1]);
    if(routes.length){set('topRoute',routes[0][0]);set('topRouteCnt',fmt(routes[0][1])+' requests')}

    set('cpuPct', vm.cpu_percent+'%'); gauge('cpuArc', vm.cpu_percent);
    set('ramPct', vm.ram_percent+'%'); gauge('ramArc', vm.ram_percent);
    set('diskPct',vm.disk_percent+'%');gauge('diskArc',vm.disk_percent);
    set('ramUsed',  vm.ram_used_gb+' GB Used');
    set('ramTotal', vm.ram_total_gb+' GB Total');
    set('diskUsed',  vm.disk_used_gb+' GB Used');
    set('diskTotal', vm.disk_total_gb+' GB Total');

    const fg=api.fear_greed_value||50;
    set('fgVal', fg); document.getElementById('fgVal').style.color=fgColor(fg);
    set('fgLabel', api.fear_greed_label);
    document.getElementById('fgNeedle').style.left=fg+'%';
    set('gainers', fmt(api.gainers));
    set('losers',  fmt(api.losers));
    set('btcDom',  (api.btc_dominance||0)+'%');
    set('ethDom',  'ETH: '+(api.eth_dominance||0)+'%');

    const maxR=routes[0]?.[1]||1;
    document.getElementById('routeList').innerHTML=routes.slice(0,10).map(([route,count])=>`
      <div class="route-bar">
        <div class="route-name">${route}</div>
        <div class="route-fill"><div class="route-fill-inner" style="width:${(count/maxR*100).toFixed(1)}%"></div></div>
        <div class="route-count">${fmt(count)}</div>
      </div>`).join('');

    const ips=Object.entries(req.top_ips||{}).sort((a,b)=>b[1]-a[1]);
    document.getElementById('ipList').innerHTML=ips.slice(0,20).map(([ip,count])=>`
      <div class="table-row"><span class="ip-addr">${ip}</span><span class="req-badge">${fmt(count)}</span></div>`
    ).join('')||'<div class="table-row" style="color:var(--muted)">No requests tracked yet — make an API call first!</div>';

    set('lastUpd','Updated '+new Date().toLocaleTimeString());
  }catch(e){set('lastUpd','Error: '+e.message)}
}
loadData();
setInterval(loadData,30000);
</script>
</body>
</html>
HTMLEOF
echo "✓ usage.html written"

# Step 4: Apache config
echo "[4/4] Configuring Apache..."
sudo tee /etc/httpd/conf.d/publicdrop-docs.conf > /dev/null << 'APACHEEOF'
<VirtualHost *:80>
    ServerName docs.publicdrop.in

    # /usage → HTML dashboard
    Alias /usage /opt/publicdrop-api/usage.html
    <Files "usage.html">
        Require all granted
    </Files>

    # /APIv3 and /api → proxy to Flask
    ProxyPreserveHost On
    ProxyPass        /APIv3 http://127.0.0.1:3001/APIv3
    ProxyPassReverse /APIv3 http://127.0.0.1:3001/APIv3
    ProxyPass        /api   http://127.0.0.1:3001/APIv3
    ProxyPassReverse /api   http://127.0.0.1:3001/APIv3

    # Root → redirect to /usage
    RedirectMatch ^/$ /usage
</VirtualHost>
APACHEEOF

# Also serve /usage on main domain
grep -q "Alias /usage" /etc/httpd/conf.d/publicdrop.conf 2>/dev/null || \
sudo sed -i '/ProxyPass \//i\    Alias /usage /opt/publicdrop-api/usage.html' /etc/httpd/conf.d/publicdrop.conf 2>/dev/null || true

sudo systemctl restart httpd  2>/dev/null || \
sudo systemctl restart apache2 2>/dev/null || true
sudo systemctl restart publicdrop-api
sleep 5

echo ""
echo "================================================"
echo " Dashboard Ready! ✅"
echo ""
echo " Open in browser:"
echo "   https://docs.publicdrop.in/usage"
echo "   https://publicdrop.in/usage"
echo "   https://publicdrop.in/APIv3/usage  (raw JSON)"
echo ""
echo " Dashboard shows:"
echo "   📊 Total requests + Unique IPs"
echo "   🖥  CPU / RAM / Disk live gauges"
echo "   📈 Fear & Greed + Gainers/Losers"
echo "   🔀 Requests by endpoint (bar chart)"
echo "   🌐 Top 20 caller IPs"
echo "   ↻  Auto-refreshes every 30 seconds"
echo "================================================"
