#!/bin/bash
INSTALL_DIR="/opt/publicdrop-api"
DATA_DIR="/opt/publicdrop-api/data"

cat > "$INSTALL_DIR/live_prices.py" << 'PYEOF'
#!/usr/bin/env python3
import os, json, time, requests, threading, logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger()

DATA_DIR  = "/opt/publicdrop-api/data"
LIVE_FILE = f"{DATA_DIR}/live_prices.json"
TEMP_FILE = f"{DATA_DIR}/live_prices.tmp"
os.makedirs(DATA_DIR, exist_ok=True)

API_KEYS = [
    "CG-yy6Zixe3wVxseFr87DLHHo4Z",  # Key 1 — add CoinGecko Demo key e.g. "CG-xxxxxxxxxxxx"
    "CG-EWLTyE43kxtjY2rvmURz4WyV",  # Key 2
    "CG-vRToJB9ep8WebQWAorB64j32",  # Key 3
    "CG-Azhz14KRRxGmQAANQzms8gFH",  # Key 4
]
API_KEYS = [k.strip() for k in API_KEYS if k.strip()] or [""]

TIERS = [
    ("Top-500",    1,  2,  900),
    ("500-1000",   3,  2,  1800),
    ("1000-5000",  5,  16, 3600),
    ("5000-12900", 21, 32, 21600),
]

_prices = {}
_lock   = threading.Lock()
_ki     = 0

def next_key():
    global _ki
    key = API_KEYS[_ki % len(API_KEYS)]
    _ki += 1
    return key

def fetch_page(page):
    key = next_key()
    params = {"vs_currency":"usd","order":"market_cap_desc","per_page":250,"page":page,"sparkline":"false","price_change_percentage":"24h"}
    if key: params["x_cg_demo_api_key"] = key
    h = {"Accept":"application/json","User-Agent":"PublicDrop/2.0"}
    if key: h["x-cg-demo-api-key"] = key
    for _ in range(3):
        try:
            r = requests.get("https://api.coingecko.com/api/v3/coins/markets", params=params, headers=h, timeout=20)
            if r.status_code == 200: return r.json()
            elif r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 60))
                log.warning(f"Rate limited, rotating key, wait {min(wait,15)}s")
                time.sleep(min(wait, 15))
                key = next_key()
            else: time.sleep(5)
        except Exception as e:
            log.error(f"Page {page}: {e}")
            time.sleep(10)
    return None

def save():
    with _lock: snap = dict(_prices)
    with open(TEMP_FILE, "w") as f:
        json.dump({"updated_at":datetime.utcnow().isoformat(),"count":len(snap),"prices":snap}, f)
    os.replace(TEMP_FILE, LIVE_FILE)

def tier_worker(name, start_page, num_pages, interval):
    log.info(f"[{name}] Started — every {interval//60} min")
    stagger = {"Top-500":0,"500-1000":30,"1000-5000":60,"5000-12900":120}
    time.sleep(stagger.get(name, 0))
    while True:
        t0 = time.time()
        count = 0
        log.info(f"[{name}] Fetching {num_pages} pages...")
        for i in range(num_pages):
            data = fetch_page(start_page + i)
            if data:
                with _lock:
                    for c in data:
                        sym = (c.get("symbol") or "").upper()
                        if sym:
                            _prices[sym] = {
                                "price":  c.get("current_price"),
                                "high":   c.get("high_24h"),
                                "low":    c.get("low_24h"),
                                "change": c.get("price_change_percentage_24h"),
                                "ts":     datetime.utcnow().isoformat(),
                            }
                            count += 1
                time.sleep(2.2)
            else: time.sleep(5)
        save()
        log.info(f"[{name}] Done — {count} updated | total: {len(_prices)}")
        wait = max(0, interval - (time.time() - t0))
        log.info(f"[{name}] Next in {int(wait//60)}m {int(wait%60)}s")
        time.sleep(wait)

def load_existing():
    try:
        if os.path.exists(LIVE_FILE):
            with open(LIVE_FILE) as f:
                d = json.load(f)
            with _lock: _prices.update(d.get("prices", {}))
            log.info(f"Loaded {len(_prices)} existing prices")
    except: pass

if __name__ == "__main__":
    log.info(f"Price Fetcher — {len(API_KEYS)} key(s) | fields: price, high, low, change")
    load_existing()
    for (name, start, pages, interval) in TIERS:
        threading.Thread(target=tier_worker, args=(name,start,pages,interval), daemon=True, name=name).start()
    try:
        while True:
            time.sleep(300)
            log.info(f"[STATUS] {len(_prices)} coins in store")
    except KeyboardInterrupt: pass
PYEOF

python3 << 'PATCHEOF'
import os
f = "/opt/publicdrop-api/api_server.py"
if not os.path.exists(f):
    print("api_server.py not found"); exit()
content = open(f).read()

LOADER = '''
_LIVE_FILE="/opt/publicdrop-api/data/live_prices.json"
_live_data={}
_live_mtime=0.0
def _live():
    global _live_data,_live_mtime
    try:
        mtime=os.path.getmtime(_LIVE_FILE)
        if mtime!=_live_mtime:
            with open(_LIVE_FILE) as fp: _live_data=__import__("json").load(fp)
            _live_mtime=mtime
    except: pass
    return _live_data.get("prices",{})
def _merge(d):
    p=_live().get((d.get("symbol") or "").upper(),{})
    if p:
        d["price_usd"]=p.get("price"); d["high_24h"]=p.get("high")
        d["low_24h"]=p.get("low"); d["change_24h"]=p.get("change")
        d["price_updated_at"]=p.get("ts")
    return d
'''

patches = [
    ("app = Flask(__name__)", LOADER+"\napp = Flask(__name__)", "_live_data" not in content),
    ("d['logo_urls'] = get_logo_urls(d.get('symbol',''), d.get('contracts',''))\n    return d",
     "d['logo_urls'] = get_logo_urls(d.get('symbol',''), d.get('contracts',''))\n    d = _merge(d)\n    return d",
     "_merge(d)" not in content),
    ('"coins":[dict(r) for r in rows]})','"coins":[_merge(dict(r)) for r in rows]})', '"coins":[dict' in content),
    ('"results":[dict(r) for r in rows]})','"results":[_merge(dict(r)) for r in rows]})', '"results":[dict' in content),
]
applied=0
for old,new,cond in patches:
    if cond and old in content:
        content=content.replace(old,new,1); applied+=1; print(f"✓ {old[:40]}")
open(f,"w").write(content)
print(f"Done — {applied} patches applied")
PATCHEOF

sudo tee /etc/systemd/system/publicdrop-live.service > /dev/null << 'EOF'
[Unit]
Description=PublicDrop Live Price Fetcher
After=network.target
[Service]
Type=simple
User=opc
WorkingDirectory=/opt/publicdrop-api
ExecStart=/usr/bin/python3 /opt/publicdrop-api/live_prices.py
Restart=always
RestartSec=15
StandardOutput=journal
StandardError=journal
[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable publicdrop-live
sudo systemctl restart publicdrop-live
sudo systemctl restart publicdrop-api
sleep 3

echo "================================================"
echo " Price Fetcher: price | high_24h | low_24h | change_24h"
echo " Tier 1: Top 500       every 15 min"
echo " Tier 2: 500-1000      every 30 min"
echo " Tier 3: 1000-5000     every 60 min"
echo " Tier 4: 5000-12900    every 6 hours"
echo " Monitor: sudo journalctl -u publicdrop-live -f"
echo " Test: curl https://publicdrop.in/APIv3/details?sym=BTC"
echo "================================================"
