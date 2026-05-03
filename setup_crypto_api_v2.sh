#!/bin/bash
# ============================================================
# PublicDrop Crypto API v2 — Full Setup Script
# Fetches 13000+ coins from CoinGecko
# 4x API Key Rotation for faster fetch
# CoinGecko logos first, fallback to CDNs
# ============================================================

set -e
INSTALL_DIR="/opt/publicdrop-api"
DATA_DIR="/opt/publicdrop-api/data"
LOGO_DIR="/var/www/html/assets/logos"

echo "======================================"
echo " PublicDrop Crypto API v2 Installer"
echo "======================================"

# ── 1. Install dependencies ──────────────────────────────
echo "[1/6] Installing dependencies..."
sudo dnf install -y python3 python3-pip iproute jq curl 2>/dev/null || true
sudo pip3 install flask requests 2>/dev/null || sudo pip3 install flask requests --break-system-packages

# ── 2. Create directories ────────────────────────────────
echo "[2/6] Creating directories..."
sudo mkdir -p "$INSTALL_DIR" "$DATA_DIR" "$LOGO_DIR"
sudo chown -R opc:opc "$INSTALL_DIR" "$LOGO_DIR"

# ── 3. Write the main fetcher + API server ───────────────
echo "[3/6] Writing fetcher and API server..."
cat > "$INSTALL_DIR/api_server.py" << 'PYEOF'
#!/usr/bin/env python3
"""
PublicDrop Crypto API Server v2
- 4 CoinGecko API keys rotating for 4x speed
- 13000+ coins fetched
- CoinGecko logos first, CDN fallback
Endpoints:
  /APIv3/details?sym=BTC
  /APIv3/details?sym=bitcoin
  /APIv3/logo?sym=BTC
  /APIv3/coins
  /APIv3/search?q=btc
  /APIv3/categories?cat=defi
  /APIv3/status
"""

import os, json, time, threading, requests, sqlite3
from datetime import datetime
from flask import Flask, jsonify, request, send_file, Response
from itertools import cycle

# ── Config ───────────────────────────────────────────────
DATA_DIR = "/opt/publicdrop-api/data"
LOGO_DIR = "/var/www/html/assets/logos"
DB_PATH  = f"{DATA_DIR}/coins.db"
CG_BASE  = "https://api.coingecko.com/api/v3"

# ── 4 API Keys — REPLACE WITH YOUR NEW KEYS ─────────────
API_KEYS = [
    "YOUR_NEW_KEY_1",
    "YOUR_NEW_KEY_2",
    "YOUR_NEW_KEY_3",
    "YOUR_NEW_KEY_4",
]
key_cycle = cycle(API_KEYS)
key_lock  = threading.Lock()

def next_key():
    with key_lock:
        return next(key_cycle)

# ── TrustWallet chain map for logo fallback ──────────────
TW_CHAIN_MAP = {
    "BTC":"bitcoin","ETH":"ethereum","BNB":"smartchain","SOL":"solana",
    "XRP":"ripple","ADA":"cardano","DOGE":"dogecoin","LTC":"litecoin",
    "DOT":"polkadot","AVAX":"avalanchec","MATIC":"polygon","ATOM":"cosmos",
    "ALGO":"algorand","XMR":"monero","XLM":"stellar","VET":"vechain",
    "HBAR":"hedera","FTM":"fantom","ICP":"internetcomputer","NEAR":"near",
    "FLOW":"flow","EOS":"eos","TON":"ton","TRX":"tron","APT":"aptos",
    "SUI":"sui","OP":"optimism","ARB":"arbitrum","LINK":"ethereum",
    "UNI":"ethereum","AAVE":"ethereum","THETA":"theta","ONE":"harmony",
}

app = Flask(__name__)

# ── Database ─────────────────────────────────────────────
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(LOGO_DIR, exist_ok=True)
    conn = get_db()
    c = conn.cursor()
    c.execute("""
        CREATE TABLE IF NOT EXISTS coins (
            id TEXT PRIMARY KEY,
            symbol TEXT,
            name TEXT,
            description TEXT,
            logo_local TEXT,
            logo_url TEXT,
            logo_thumb TEXT,
            logo_small TEXT,
            logo_large TEXT,
            website TEXT,
            whitepaper TEXT,
            twitter TEXT,
            telegram TEXT,
            reddit TEXT,
            discord TEXT,
            github TEXT,
            genesis_date TEXT,
            hashing_algorithm TEXT,
            categories TEXT,
            block_explorers TEXT,
            contracts TEXT,
            fetched_permanent INTEGER DEFAULT 0,
            fetched_at TEXT,
            rank INTEGER,
            max_supply REAL,
            total_supply REAL,
            ath_usd REAL,
            ath_date TEXT,
            atl_usd REAL,
            atl_date TEXT,
            monthly_updated_at TEXT
        )
    """)
    c.execute("""
        CREATE TABLE IF NOT EXISTS coin_list (
            id TEXT PRIMARY KEY,
            symbol TEXT,
            name TEXT,
            cg_id TEXT,
            updated_at TEXT
        )
    """)
    conn.commit()
    conn.close()
    print("[DB] Initialized")

# ── Logo URLs (CoinGecko first, then CDN fallbacks) ──────
def get_logo_urls(sym, cg_logo_large=None, cg_logo_small=None, cg_logo_thumb=None, contracts=None):
    s = sym.lower()
    urls = []

    # 1. CoinGecko large (best quality)
    if cg_logo_large:
        urls.append(cg_logo_large)
    # 2. CoinGecko small
    if cg_logo_small:
        urls.append(cg_logo_small)
    # 3. CoinGecko thumb
    if cg_logo_thumb:
        urls.append(cg_logo_thumb)
    # 4. TrustWallet chain logo
    tw_chain = TW_CHAIN_MAP.get(sym.upper())
    if tw_chain:
        urls.append(f"https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/{tw_chain}/info/logo.png")
    # 5. TrustWallet token contract
    if contracts:
        try:
            c = json.loads(contracts) if isinstance(contracts, str) else contracts
            for network, addr in c.items():
                if addr and len(addr) > 10:
                    tw_net = {
                        "ethereum":"ethereum","binance-smart-chain":"smartchain",
                        "polygon-pos":"polygon","avalanche":"avalanchec",
                        "solana":"solana","tron":"tron","arbitrum-one":"arbitrum",
                        "optimistic-ethereum":"optimism","base":"base",
                    }.get(network)
                    if tw_net:
                        urls.append(f"https://cdn.jsdelivr.net/gh/trustwallet/assets@master/blockchains/{tw_net}/assets/{addr}/logo.png")
                        break
        except: pass
    # 6. CoinCap
    urls.append(f"https://assets.coincap.io/assets/icons/{s}@2x.png")
    # 7. LiveCoinWatch
    urls.append(f"https://lcw.nyc3.cdn.digitaloceanspaces.com/production/currencies/64/{s}.webp")
    # 8. Spothq
    urls.append(f"https://cdn.jsdelivr.net/gh/spothq/cryptocurrency-icons@master/128/color/{s}.png")
    return urls

def download_logo(sym, cg_logo_large=None, cg_logo_small=None, cg_logo_thumb=None, contracts=None):
    logo_path = f"{LOGO_DIR}/{sym.lower()}.png"
    if os.path.exists(logo_path):
        return f"/assets/logos/{sym.lower()}.png"
    urls = get_logo_urls(sym, cg_logo_large, cg_logo_small, cg_logo_thumb, contracts)
    for url in urls:
        try:
            r = requests.get(url, timeout=8, headers={"User-Agent": "PublicDrop/2.0"})
            if r.status_code == 200 and len(r.content) > 500:
                with open(logo_path, 'wb') as f:
                    f.write(r.content)
                return f"/assets/logos/{sym.lower()}.png"
        except: continue
    return None

# ── CoinGecko Fetcher with Key Rotation ──────────────────
def cg_get(endpoint, params=None, retries=3):
    url = f"{CG_BASE}{endpoint}"
    for attempt in range(retries):
        key = next_key()
        headers = {
            "Accept": "application/json",
            "User-Agent": "PublicDrop/2.0",
            "x-cg-demo-api-key": key
        }
        try:
            r = requests.get(url, params=params, headers=headers, timeout=15)
            if r.status_code == 200:
                return r.json()
            elif r.status_code == 429:
                print(f"[CG] Rate limited on key ...{key[-6:]}, waiting 65s...")
                time.sleep(65)
            elif r.status_code == 401:
                print(f"[CG] Invalid key ...{key[-6:]}, skipping")
                time.sleep(2)
            else:
                print(f"[CG] HTTP {r.status_code} on {endpoint}")
                time.sleep(5)
        except Exception as e:
            print(f"[CG] Error: {e}")
            time.sleep(10)
    return None

# ── Fetch Coin List ───────────────────────────────────────
def fetch_coin_list():
    print("[FETCH] Getting full coin list...")
    data = cg_get("/coins/list", {"include_platform": "true"})
    if not data:
        return
    conn = get_db()
    c = conn.cursor()
    for coin in data:
        c.execute("""
            INSERT OR IGNORE INTO coin_list (id, symbol, name, cg_id, updated_at)
            VALUES (?,?,?,?,?)
        """, (coin['id'], coin.get('symbol','').upper(), coin.get('name',''),
              coin['id'], datetime.utcnow().isoformat()))
    conn.commit()
    conn.close()
    print(f"[FETCH] Stored {len(data)} coins in list")

# ── Fetch Markets (13000+ coins, 52 pages) ────────────────
def fetch_markets_batch():
    print("[FETCH] Fetching market data for 13000+ coins...")
    conn = get_db()
    c = conn.cursor()
    for page in range(1, 53):  # 52 pages × 250 = 13000 coins
        data = cg_get("/coins/markets", {
            "vs_currency": "usd",
            "order": "market_cap_desc",
            "per_page": 250,
            "page": page,
            "sparkline": "false"
        })
        if not data:
            print(f"[FETCH] No data on page {page}, stopping")
            break
        for coin in data:
            c.execute("""
                INSERT INTO coins (id, symbol, name, rank, max_supply, total_supply,
                    ath_usd, ath_date, atl_usd, atl_date, logo_url,
                    logo_thumb, logo_small, logo_large, monthly_updated_at)
                VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                ON CONFLICT(id) DO UPDATE SET
                    rank=excluded.rank,
                    max_supply=excluded.max_supply,
                    total_supply=excluded.total_supply,
                    ath_usd=excluded.ath_usd,
                    ath_date=excluded.ath_date,
                    atl_usd=excluded.atl_usd,
                    atl_date=excluded.atl_date,
                    logo_url=excluded.logo_url,
                    logo_thumb=excluded.logo_thumb,
                    logo_small=excluded.logo_small,
                    logo_large=excluded.logo_large,
                    monthly_updated_at=excluded.monthly_updated_at
            """, (
                coin['id'],
                (coin.get('symbol') or '').upper(),
                coin.get('name',''),
                coin.get('market_cap_rank'),
                coin.get('max_supply'),
                coin.get('total_supply'),
                coin.get('ath'),
                coin.get('ath_date'),
                coin.get('atl'),
                coin.get('atl_date'),
                coin.get('image'),           # full size from markets
                coin.get('image'),           # thumb (same in markets)
                coin.get('image'),           # small
                coin.get('image'),           # large
                datetime.utcnow().isoformat()
            ))
        conn.commit()
        print(f"[FETCH] Markets page {page}/52 done ({page*250} coins)")
        time.sleep(1.5)  # 4 keys = 4x limit, safe at 1.5s
    conn.close()
    print("[FETCH] Market data fetch complete")

# ── Fetch Permanent Details ───────────────────────────────
def fetch_permanent_details(cg_id, sym):
    data = cg_get(f"/coins/{cg_id}", {
        "localization": "false",
        "tickers": "false",
        "market_data": "false",
        "community_data": "false",
        "developer_data": "false",
        "sparkline": "false"
    })
    if not data:
        return False

    links     = data.get('links', {})
    desc      = data.get('description', {}).get('en', '')
    cats      = json.dumps(data.get('categories', []))
    plats     = data.get('platforms', {})
    contracts = json.dumps({k:v for k,v in plats.items() if v})
    explorers = json.dumps(links.get('blockchain_site', []))

    # CoinGecko logo (all sizes)
    images      = data.get('image', {})
    logo_thumb  = images.get('thumb', '')
    logo_small  = images.get('small', '')
    logo_large  = images.get('large', '')

    # Download logo — CoinGecko first
    logo_local = download_logo(sym, logo_large, logo_small, logo_thumb, contracts)

    conn = get_db()
    c = conn.cursor()
    c.execute("""
        UPDATE coins SET
            description=?,
            logo_local=?, logo_thumb=?, logo_small=?, logo_large=?,
            website=?, whitepaper=?,
            twitter=?, telegram=?, reddit=?, discord=?, github=?,
            genesis_date=?, hashing_algorithm=?,
            categories=?, block_explorers=?, contracts=?,
            fetched_permanent=1, fetched_at=?
        WHERE id=?
    """, (
        desc,
        logo_local, logo_thumb, logo_small, logo_large,
        (links.get('homepage') or [''])[0],
        links.get('whitepaper','') or '',
        links.get('twitter_screen_name','') or '',
        links.get('telegram_channel_identifier','') or '',
        links.get('subreddit_url','') or '',
        (links.get('chat_url') or [''])[0],
        (links.get('repos_url',{}).get('github') or [''])[0],
        data.get('genesis_date','') or '',
        data.get('hashing_algorithm','') or '',
        cats, explorers, contracts,
        datetime.utcnow().isoformat(),
        cg_id
    ))
    conn.commit()
    conn.close()
    return True

# ── Fetch All Permanent ───────────────────────────────────
def fetch_all_permanent():
    conn = get_db()
    c = conn.cursor()
    rows = c.execute("""
        SELECT id, symbol FROM coins
        WHERE fetched_permanent=0 OR fetched_permanent IS NULL
        ORDER BY rank ASC NULLS LAST
    """).fetchall()
    conn.close()

    total = len(rows)
    print(f"[FETCH] Fetching permanent details for {total} coins...")
    for i, row in enumerate(rows):
        cg_id = row['id']
        sym   = row['symbol'] or cg_id.upper()
        ok    = fetch_permanent_details(cg_id, sym)
        status = "✓" if ok else "✗"
        print(f"[{i+1}/{total}] {status} {cg_id}")
        time.sleep(0.6)  # 4 keys rotating = safe at 0.6s (~100 req/min total)
    print("[FETCH] Permanent fetch complete!")

# ── Background Scheduler ─────────────────────────────────
def background_scheduler():
    print("[SCHEDULER] Starting...")
    fetch_coin_list()
    fetch_markets_batch()
    threading.Thread(target=fetch_all_permanent, daemon=True).start()

    while True:
        now = datetime.utcnow()
        if now.day == 1 and now.hour == 0:
            print("[SCHEDULER] Monthly update starting...")
            fetch_markets_batch()
            time.sleep(3700)
        time.sleep(3600)

# ── Helpers ───────────────────────────────────────────────
def coin_to_dict(row):
    d = dict(row)
    for field in ['categories','block_explorers','contracts']:
        try:
            d[field] = json.loads(d[field]) if d[field] else []
        except:
            d[field] = []
    return d

def find_coin(sym_or_id):
    conn = get_db()
    c = conn.cursor()
    q = (sym_or_id or '').strip()
    row = c.execute("SELECT * FROM coins WHERE UPPER(symbol)=UPPER(?)", (q,)).fetchone()
    if not row:
        row = c.execute("SELECT * FROM coins WHERE id=?", (q.lower(),)).fetchone()
    if not row:
        row = c.execute("SELECT * FROM coins WHERE LOWER(name)=LOWER(?)", (q,)).fetchone()
    conn.close()
    return row

# ── CORS ─────────────────────────────────────────────────
@app.after_request
def cors(r):
    r.headers['Access-Control-Allow-Origin'] = '*'
    r.headers['Access-Control-Allow-Headers'] = 'Content-Type'
    return r

# ── Routes ───────────────────────────────────────────────
@app.route('/APIv3/details')
def details():
    sym = request.args.get('sym') or request.args.get('id') or ''
    row = find_coin(sym)
    if not row:
        return jsonify({"error": "Coin not found", "query": sym}), 404
    return jsonify(coin_to_dict(row))

@app.route('/APIv3/logo')
def logo():
    sym = request.args.get('sym') or ''
    row = find_coin(sym)
    if not row:
        return jsonify({"error": "Not found"}), 404
    d = dict(row)
    local_path = f"{LOGO_DIR}/{d['symbol'].lower()}.png"
    if os.path.exists(local_path):
        return send_file(local_path, mimetype='image/png')
    urls = get_logo_urls(
        d['symbol'],
        d.get('logo_large'), d.get('logo_small'), d.get('logo_thumb'),
        d.get('contracts')
    )
    return jsonify({"symbol": d['symbol'], "logo_urls": urls, "best": urls[0] if urls else None})

@app.route('/APIv3/coins')
def all_coins():
    page   = int(request.args.get('page', 1))
    per    = min(int(request.args.get('per_page', 250)), 500)
    offset = (page-1)*per
    conn   = get_db()
    c      = conn.cursor()
    rows   = c.execute("""
        SELECT id, symbol, name, rank, ath_usd,
               logo_url, logo_large, logo_local,
               website, categories, fetched_permanent
        FROM coins ORDER BY rank ASC NULLS LAST LIMIT ? OFFSET ?
    """, (per, offset)).fetchall()
    total = c.execute("SELECT COUNT(*) FROM coins").fetchone()[0]
    conn.close()
    return jsonify({"total": total, "page": page, "per_page": per, "coins": [dict(r) for r in rows]})

@app.route('/APIv3/search')
def search():
    q = (request.args.get('q') or '').strip().lower()
    if len(q) < 1:
        return jsonify({"error": "Query too short"}), 400
    conn = get_db()
    c    = conn.cursor()
    rows = c.execute("""
        SELECT id, symbol, name, rank, logo_url, logo_large, logo_local
        FROM coins
        WHERE LOWER(symbol) LIKE ? OR LOWER(name) LIKE ? OR LOWER(id) LIKE ?
        ORDER BY rank ASC NULLS LAST LIMIT 20
    """, (f"{q}%", f"%{q}%", f"%{q}%")).fetchall()
    conn.close()
    return jsonify({"results": [dict(r) for r in rows]})

@app.route('/APIv3/categories')
def categories():
    cat  = (request.args.get('cat') or '').lower()
    conn = get_db()
    c    = conn.cursor()
    rows = c.execute("""
        SELECT id, symbol, name, rank, logo_url, logo_large
        FROM coins WHERE LOWER(categories) LIKE ?
        ORDER BY rank ASC NULLS LAST LIMIT 100
    """, (f"%{cat}%",)).fetchall()
    conn.close()
    return jsonify({"category": cat, "coins": [dict(r) for r in rows]})

@app.route('/APIv3/status')
def status():
    conn      = get_db()
    c         = conn.cursor()
    total     = c.execute("SELECT COUNT(*) FROM coins").fetchone()[0]
    permanent = c.execute("SELECT COUNT(*) FROM coins WHERE fetched_permanent=1").fetchone()[0]
    with_logo = c.execute("SELECT COUNT(*) FROM coins WHERE logo_local IS NOT NULL").fetchone()[0]
    conn.close()
    percent   = round((permanent/total*100), 1) if total > 0 else 0
    return jsonify({
        "total_coins": total,
        "permanent_details_fetched": permanent,
        "permanent_pending": total - permanent,
        "fetch_progress_percent": percent,
        "logos_downloaded": with_logo,
        "status": "running"
    })

@app.route('/')
def home():
    return jsonify({
        "api": "PublicDrop Crypto API v2",
        "keys_active": len(API_KEYS),
        "endpoints": {
            "/APIv3/details?sym=BTC": "Full coin details",
            "/APIv3/details?sym=bitcoin": "Also works with CoinGecko ID",
            "/APIv3/logo?sym=BTC": "Coin logo",
            "/APIv3/coins?page=1": "All coins paginated",
            "/APIv3/search?q=btc": "Search coins",
            "/APIv3/categories?cat=defi": "Coins by category",
            "/APIv3/status": "Fetch progress"
        }
    })

# ── Main ─────────────────────────────────────────────────
if __name__ == '__main__':
    init_db()
    t = threading.Thread(target=background_scheduler, daemon=True)
    t.start()
    app.run(host='127.0.0.1', port=3001, debug=False)
PYEOF

# ── 4. Write systemd service ─────────────────────────────
echo "[4/6] Creating systemd service..."
sudo tee /etc/systemd/system/publicdrop-api.service << 'EOF'
[Unit]
Description=PublicDrop Crypto API v2
After=network.target

[Service]
Type=simple
User=opc
WorkingDirectory=/opt/publicdrop-api
ExecStart=/usr/bin/python3 /opt/publicdrop-api/api_server.py
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# ── 5. Apache proxy ──────────────────────────────────────
echo "[5/6] Setting up Apache proxy..."
sudo tee /etc/httpd/conf.d/api-proxy.conf << 'EOF'
<IfModule mod_proxy_http.c>
    ProxyPreserveHost On
    ProxyPass /APIv3/ http://127.0.0.1:3001/APIv3/
    ProxyPassReverse /APIv3/ http://127.0.0.1:3001/APIv3/
</IfModule>
EOF

sudo dnf install -y mod_proxy_http 2>/dev/null || true
sudo systemctl enable httpd
sudo systemctl restart httpd

# ── 6. Start the API ─────────────────────────────────────
echo "[6/6] Starting PublicDrop API v2..."
sudo systemctl daemon-reload
sudo systemctl enable publicdrop-api
sudo systemctl start publicdrop-api

echo ""
echo "======================================"
echo " ✅ PublicDrop API v2 is LIVE!"
echo "======================================"
echo ""
echo " API Endpoints:"
echo "  https://publicdrop.in/APIv3/status"
echo "  https://publicdrop.in/APIv3/details?sym=BTC"
echo "  https://publicdrop.in/APIv3/details?sym=bitcoin"
echo "  https://publicdrop.in/APIv3/logo?sym=ETH"
echo "  https://publicdrop.in/APIv3/coins?page=1"
echo "  https://publicdrop.in/APIv3/search?q=sol"
echo "  https://publicdrop.in/APIv3/categories?cat=defi"
echo ""
echo " Fetching 13000+ coins in background..."
echo " Check progress: https://publicdrop.in/APIv3/status"
echo ""
echo " Logs: sudo journalctl -u publicdrop-api -f"
echo "======================================"
