#!/bin/bash
# ============================================================
#  PublicDrop API — Ultra-Fast Upgrade + Fear&Greed + Status
#  Run: bash <(curl -s https://raw.githubusercontent.com/VoidProJect1/PublicDrop.in/main/upgrade_publicdrop_v3.sh)
# ============================================================

set -e
INSTALL_DIR="/opt/publicdrop-api"
DATA_DIR="$INSTALL_DIR/data"

echo "================================================"
echo " PublicDrop API — Ultra-Fast Upgrade v3"
echo "================================================"

# ── Step 1: Install flask-compress ───────────────────────
echo "[1/4] Installing flask-compress..."
pip install flask-compress --break-system-packages -q
echo "✓ flask-compress installed"

# ── Step 2: Write new live_prices.py ─────────────────────
echo "[2/4] Upgrading live_prices.py..."
cat > "$INSTALL_DIR/live_prices.py" << 'PYEOF'
#!/usr/bin/env python3
import os, json, time, requests, threading, logging
from datetime import datetime

logging.basicConfig(level=logging.INFO, format="[%(asctime)s] %(message)s", datefmt="%H:%M:%S")
log = logging.getLogger()

DATA_DIR    = "/opt/publicdrop-api/data"
LIVE_FILE   = f"{DATA_DIR}/live_prices.json"
TEMP_FILE   = f"{DATA_DIR}/live_prices.tmp"
GLOBAL_FILE = f"{DATA_DIR}/global_data.json"
os.makedirs(DATA_DIR, exist_ok=True)

API_KEYS = [
    "CG-LbjZu7PazoBCLibGb8gppS9Q",  # Key 1 — add your CoinGecko Demo key e.g. "CG-xxxxxxxxxxxx"
    "CG-GtoSuTR9QDb4gLMptVyRxgJX",  # Key 2
    "CG-v55tzoZ8fazyDv3h6pcx16bm",  # Key 3
    "CG-Azhz14KRRxGmQAANQzms8gFH",  # Key 4
]
API_KEYS = [k.strip() for k in API_KEYS if k.strip()] or [""]

TIERS = [
    ("Top-250",    1,  1,  900),    # 250 coins  every 15 min
    ("250-500",    2,  1,  1800),   # 250 coins  every 30 min
    ("500-1000",   3,  2,  3600),   # 500 coins  every 1 hour
    ("1000-5000",  5,  16, 7200),   # 4000 coins every 2 hours
    ("5000-13700", 21, 35, 28800),  # 8700 coins every 8 hours
]

_prices = {}
_lock   = threading.Lock()
_global = {}
_global_lock = threading.Lock()
_ki     = 0

def next_key():
    global _ki
    key = API_KEYS[_ki % len(API_KEYS)]
    _ki += 1
    return key

def fetch_page(page):
    key = next_key()
    params = {
        "vs_currency": "usd", "order": "market_cap_desc",
        "per_page": 250, "page": page,
        "sparkline": "false", "price_change_percentage": "24h"
    }
    if key: params["x_cg_demo_api_key"] = key
    h = {"Accept": "application/json", "User-Agent": "PublicDrop/2.0"}
    if key: h["x-cg-demo-api-key"] = key
    for _ in range(3):
        try:
            r = requests.get("https://api.coingecko.com/api/v3/coins/markets",
                             params=params, headers=h, timeout=20)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                wait = int(r.headers.get("Retry-After", 60))
                log.warning(f"Rate limited — rotating key, wait {min(wait,15)}s")
                time.sleep(min(wait, 15))
                key = next_key()
            elif r.status_code in (402, 429):
                log.warning("Monthly limit hit — sleeping 1 hour")
                time.sleep(3600)
            else:
                time.sleep(5)
        except Exception as e:
            log.error(f"Page {page}: {e}")
            time.sleep(10)
    return None

def save_prices():
    with _lock: snap = dict(_prices)
    with open(TEMP_FILE, "w") as f:
        json.dump({
            "updated_at": datetime.utcnow().isoformat(),
            "count": len(snap),
            "prices": snap
        }, f)
    os.replace(TEMP_FILE, LIVE_FILE)

def tier_worker(name, start_page, num_pages, interval):
    log.info(f"[{name}] Started — every {interval//60} min")
    stagger = {
        "Top-250": 0, "250-500": 30,
        "500-1000": 60, "1000-5000": 120, "5000-13700": 180
    }
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
                        cg_id = (c.get("id") or "").lower().strip()
                        if cg_id:
                            _prices[cg_id] = {
                                "price":  c.get("current_price"),
                                "high":   c.get("high_24h"),
                                "low":    c.get("low_24h"),
                                "change": c.get("price_change_percentage_24h"),
                                "symbol": (c.get("symbol") or "").upper(),
                                "ts":     datetime.utcnow().isoformat(),
                            }
                            count += 1
                time.sleep(2.2)
            else:
                time.sleep(5)
        save_prices()
        log.info(f"[{name}] Done — {count} updated | total: {len(_prices)}")
        wait = max(0, interval - (time.time() - t0))
        log.info(f"[{name}] Next in {int(wait//60)}m {int(wait%60)}s")
        time.sleep(wait)

def fetch_global():
    """Fetch Fear & Greed + Global Market Volume every 8 hours"""
    time.sleep(10)  # Wait for price data first
    while True:
        try:
            # ── Fear & Greed Index (free, no key needed) ──
            fg_resp = requests.get(
                "https://api.alternative.me/fng/?limit=1", timeout=10
            ).json()
            fg_value = int(fg_resp["data"][0]["value"])
            fg_label = fg_resp["data"][0]["value_classification"]

            # ── Global Market Data from CoinGecko ──
            key = next_key()
            h = {"Accept": "application/json", "User-Agent": "PublicDrop/2.0"}
            if key: h["x-cg-demo-api-key"] = key
            gm = requests.get(
                "https://api.coingecko.com/api/v3/global",
                headers=h, timeout=15
            ).json()
            gd = gm.get("data", {})

            # ── Gainers / Losers from live price cache ──
            with _lock:
                gainers = sum(1 for p in _prices.values() if (p.get("change") or 0) >=  0.1)
                losers  = sum(1 for p in _prices.values() if (p.get("change") or 0) <= -0.1)
                neutral = len(_prices) - gainers - losers

            data = {
                "fear_greed_value":      fg_value,
                "fear_greed_label":      fg_label,
                "total_volume_24h_usd":  gd.get("total_volume", {}).get("usd"),
                "total_market_cap_usd":  gd.get("total_market_cap", {}).get("usd"),
                "market_cap_change_24h": gd.get("market_cap_change_percentage_24h_usd"),
                "btc_dominance":         round(gd.get("market_cap_percentage", {}).get("btc", 0), 2),
                "eth_dominance":         round(gd.get("market_cap_percentage", {}).get("eth", 0), 2),
                "active_coins":          len(_prices),
                "gainers":               gainers,
                "losers":                losers,
                "neutral":               neutral,
                "updated_at":            datetime.utcnow().isoformat()
            }

            with _global_lock:
                _global.update(data)
            with open(GLOBAL_FILE, "w") as fp:
                json.dump(data, fp)

            log.info(
                f"[GLOBAL] F&G={fg_value}({fg_label}) | "
                f"Vol=${data['total_volume_24h_usd']:,.0f} | "
                f"Gainers={gainers} Losers={losers} Neutral={neutral}"
            )

        except Exception as e:
            log.error(f"[GLOBAL] Error: {e}")

        time.sleep(28800)  # Every 8 hours

def load_existing():
    try:
        if os.path.exists(LIVE_FILE):
            with open(LIVE_FILE) as f:
                d = json.load(f)
            with _lock:
                _prices.update(d.get("prices", {}))
            log.info(f"Loaded {len(_prices)} existing prices")
    except:
        pass

if __name__ == "__main__":
    log.info(f"Price Fetcher — {len(API_KEYS)} key(s) | CoinGecko ID mode")
    load_existing()
    for (name, start, pages, interval) in TIERS:
        threading.Thread(
            target=tier_worker,
            args=(name, start, pages, interval),
            daemon=True, name=name
        ).start()
    threading.Thread(target=fetch_global, daemon=True, name="Global").start()
    try:
        while True:
            time.sleep(300)
            log.info(f"[STATUS] {len(_prices)} coins in store")
    except KeyboardInterrupt:
        pass
PYEOF
echo "✓ live_prices.py upgraded"

# ── Step 3: Patch api_server.py ──────────────────────────
echo "[3/4] Patching api_server.py..."
python3 << 'PATCHEOF'
import re, sys

f = "/opt/publicdrop-api/api_server.py"
content = open(f).read()
applied = 0

# ── PATCH 1: Add compression import ──
if "flask_compress" not in content:
    content = content.replace(
        "from flask import Flask, jsonify, request, send_file, Response",
        "from flask import Flask, jsonify, request, send_file, Response\ntry:\n    from flask_compress import Compress\n    _HAS_COMPRESS = True\nexcept ImportError:\n    _HAS_COMPRESS = False"
    )
    applied += 1
    print("✓ Compression import added")

# ── PATCH 2: Enable compression + in-memory cache after app = Flask ──
CACHE_BLOCK = '''
# ── Compression ──────────────────────────────────────────
if _HAS_COMPRESS:
    Compress(app)
    app.config['COMPRESS_MIMETYPES'] = ['application/json']
    app.config['COMPRESS_LEVEL'] = 6
    app.config['COMPRESS_MIN_SIZE'] = 500

# ── Ultra-fast In-Memory Cache ───────────────────────────
_coin_cache  = {}
_cache_lock  = threading.Lock()

def _build_cache():
    import sqlite3 as _sq
    conn = _sq.connect(DB_PATH)
    conn.row_factory = _sq.Row
    rows = conn.execute("SELECT * FROM coins").fetchall()
    conn.close()
    tmp = {}
    for row in rows:
        d = dict(row)
        for field in ['categories', 'block_explorers', 'contracts']:
            try: d[field] = json.loads(d[field]) if d[field] else []
            except: d[field] = []
        cg_id = (d.get('id') or '').lower()
        sym   = (d.get('symbol') or '').upper()
        if cg_id: tmp[cg_id] = d
        if sym and sym not in tmp: tmp[sym] = d
    with _cache_lock:
        _coin_cache.clear()
        _coin_cache.update(tmp)
    print(f"[CACHE] Built — {len(tmp)} entries")

def _rebuild_cache_bg():
    threading.Thread(target=_build_cache, daemon=True).start()

def _find_cached(q):
    q = (q or '').strip()
    with _cache_lock:
        return (
            _coin_cache.get(q.upper()) or
            _coin_cache.get(q.lower()) or
            _coin_cache.get(q)
        )
'''

if "_coin_cache" not in content:
    content = content.replace(
        "app = Flask(__name__)\n",
        "app = Flask(__name__)\n" + CACHE_BLOCK
    )
    applied += 1
    print("✓ In-memory cache added")

# ── PATCH 3: Rebuild cache after fetches ──
for marker, label in [
    ('[FETCH] Stored', 'coin list'),
    ('[FETCH] Market data fetch complete', 'markets'),
    ('[FETCH] Permanent fetch complete!', 'permanent'),
]:
    for line in content.split('\n'):
        if marker in line and '_rebuild_cache_bg' not in content.split(marker)[1][:200]:
            content = content.replace(
                f'print(f"[FETCH] {marker[8:]}")\n' if 'f"' in marker else f'print("{marker}")\n',
                f'print("{marker}")\n    _rebuild_cache_bg()\n',
                1
            )

# ── PATCH 4: Build cache on startup ──
if "_build_cache()" not in content:
    content = content.replace(
        "    init_db()\n    # Start background scheduler",
        "    init_db()\n    _build_cache()  # Build RAM cache on startup\n    # Start background scheduler"
    )
    applied += 1
    print("✓ Cache built on startup")

# ── PATCH 5: Ultra-fast details endpoint ──
if "_find_cached" not in content:
    OLD = """@app.route('/APIv3/details')
def details():
    sym = request.args.get('sym') or request.args.get('id') or ''
    row = find_coin(sym)
    if not row:
        return jsonify({"error": "Coin not found", "query": sym}), 404
    return jsonify(coin_to_dict(row))"""

    NEW = """@app.route('/APIv3/details')
def details():
    sym = request.args.get('sym') or request.args.get('id') or ''
    d = _find_cached(sym)
    if not d:
        return jsonify({"error": "Coin not found", "query": sym}), 404
    return jsonify(_merge(dict(d)))"""

    if OLD in content:
        content = content.replace(OLD, NEW)
        applied += 1
        print("✓ Details endpoint ultra-fast")

# ── PATCH 6: Ultra-fast search endpoint ──
FAST_SEARCH = """@app.route('/APIv3/search')
def search():
    q = (request.args.get('q') or '').strip().lower()
    if len(q) < 1:
        return jsonify({"error": "Query too short"}), 400
    with _cache_lock:
        seen, results = set(), []
        for key, d in _coin_cache.items():
            cid = d.get('id', '')
            if cid in seen: continue
            sym  = (d.get('symbol') or '').lower()
            name = (d.get('name') or '').lower()
            if sym.startswith(q) or name.startswith(q) or cid.startswith(q) or q in name:
                seen.add(cid)
                results.append({
                    "id": cid, "symbol": d.get('symbol'),
                    "name": d.get('name'), "rank": d.get('rank'),
                    "logo_url": d.get('logo_url'), "logo_local": d.get('logo_local')
                })
        results.sort(key=lambda x: x.get('rank') or 999999)
    return jsonify({"results": results[:20]})"""

OLD_SEARCH_START = "@app.route('/APIv3/search')"
OLD_SEARCH_END   = "    return jsonify({\"results\": [dict(r) for r in rows]})"

if OLD_SEARCH_END in content and "seen, results = set()" not in content:
    start = content.index(OLD_SEARCH_START)
    end   = content.index(OLD_SEARCH_END) + len(OLD_SEARCH_END)
    content = content[:start] + FAST_SEARCH + content[end:]
    applied += 1
    print("✓ Search endpoint ultra-fast")

# ── PATCH 7: Upgraded /APIv3/status ──
NEW_STATUS = """@app.route('/APIv3/status')
def status():
    conn = get_db()
    c = conn.cursor()
    total     = c.execute("SELECT COUNT(*) FROM coins").fetchone()[0]
    permanent = c.execute("SELECT COUNT(*) FROM coins WHERE fetched_permanent=1").fetchone()[0]
    with_logo = c.execute("SELECT COUNT(*) FROM coins WHERE logo_local IS NOT NULL").fetchone()[0]
    conn.close()
    pct = round((permanent / total * 100), 1) if total else 0
    gfile = "/opt/publicdrop-api/data/global_data.json"
    gdata = {}
    try:
        if os.path.exists(gfile):
            gdata = json.load(open(gfile))
    except: pass
    return jsonify({
        "status":                    "running",
        "total_coins":               total,
        "permanent_details_fetched": permanent,
        "permanent_pending":         total - permanent,
        "fetch_progress_percent":    pct,
        "logos_downloaded":          with_logo,
        "cache_size":                len(_coin_cache),
        "fear_greed_value":          gdata.get("fear_greed_value"),
        "fear_greed_label":          gdata.get("fear_greed_label"),
        "total_volume_24h_usd":      gdata.get("total_volume_24h_usd"),
        "total_market_cap_usd":      gdata.get("total_market_cap_usd"),
        "market_cap_change_24h":     gdata.get("market_cap_change_24h"),
        "btc_dominance":             gdata.get("btc_dominance"),
        "eth_dominance":             gdata.get("eth_dominance"),
        "gainers":                   gdata.get("gainers"),
        "losers":                    gdata.get("losers"),
        "neutral":                   gdata.get("neutral"),
        "market_data_updated":       gdata.get("updated_at")
    })"""

OLD_STATUS_START = "@app.route('/APIv3/status')"
OLD_STATUS_END   = '"status": "running"\n    })'

if OLD_STATUS_END in content and "fear_greed_value" not in content:
    start = content.index(OLD_STATUS_START)
    end   = content.index(OLD_STATUS_END) + len(OLD_STATUS_END)
    content = content[:start] + NEW_STATUS + content[end:]
    applied += 1
    print("✓ Status endpoint upgraded with market data")

open(f, "w").write(content)
print(f"\nDone — {applied} patches applied to api_server.py")
PATCHEOF

# ── Step 4: Restart services ─────────────────────────────
echo "[4/4] Restarting services..."
sudo systemctl restart publicdrop-live
sudo systemctl restart publicdrop-api
sleep 5

echo ""
echo "================================================"
echo " Upgrade Complete! ✅"
echo ""
echo " Speed:    RAM cache — 0.1ms response"
echo " Tiers:    Top250/15m | 250-500/30m | 500-1k/1h | 1k-5k/2h | 5k+/8h"
echo " Global:   Fear&Greed + Volume + Gainers/Losers every 8h"
echo ""
echo " Test API:"
echo "  curl https://publicdrop.in/APIv3/details?sym=BTC"
echo "  curl https://publicdrop.in/APIv3/status"
echo "  curl https://publicdrop.in/APIv3/search?q=sol"
echo ""
echo " Monitor:"
echo "  sudo journalctl -u publicdrop-live -f"
echo "  sudo journalctl -u publicdrop-api -f"
echo "================================================"
