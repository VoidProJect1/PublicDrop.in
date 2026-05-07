

const CURRENCY_RATES={USD:1,INR:83.5,EUR:.92,GBP:.79,AED:3.67,JPY:149.5};
const CURRENCY_SYMS={USD:'$',INR:'₹',EUR:'€',GBP:'£',AED:'AED ',JPY:'¥'};
let CUR='USD',CUR_RATE=1,CUR_SYM='$';
let ALL_COINS=[],FILTERED=[];


function getCurrentUid(){return window._fbUser?window._fbUser.uid:null;}
function getWlKey(){return window._wlKey?window._wlKey(getCurrentUid()):'pd_wl_guest';}
function getPortKey(){return window._portKey?window._portKey(getCurrentUid()):'pd_portfolio_guest';}
function loadWL(){return new Set(JSON.parse(localStorage.getItem(getWlKey())||'[]'));}
function saveWL(){localStorage.setItem(getWlKey(),JSON.stringify([...WL]));}
function loadPortfolio(){return JSON.parse(localStorage.getItem(getPortKey())||'[]');}
function savePortfolio(){localStorage.setItem(getPortKey(),JSON.stringify(PORTFOLIO));}

let PORTFOLIO=loadPortfolio();
let WL=loadWL();
let COIN_PRICES={};
let pg=1;const PER=50;
let activeTab='all',activeCat='all',sortKey='vol',searchQ='';
let mcChart=null,pieChart=null,chartView='volume';
let globalVol=0,globalMcap=0;


window._reloadUserData=function(uid){
  WL=loadWL();
  PORTFOLIO=loadPortfolio();
  if(ALL_COINS.length){applyFiltersAndRender();updatePortfolio();}
  
  const u=window._fbUser;
  const chip=document.getElementById('NAV_USER_CHIP');
  const inner=document.getElementById('NAV_AVATAR_INNER');
  const nameEl=document.getElementById('NAV_AVATAR_NAME');
  if(chip&&u){
    chip.style.display='flex';
    const name=u.displayName||u.email||'User';
    if(inner)inner.textContent=name.charAt(0).toUpperCase();
    if(nameEl)nameEl.textContent=name.split(' ')[0].split('@')[0];
  }else if(chip){chip.style.display='none';}
};

const CAT_MAP={
  defi:   new Set(['UNI','AAVE','COMP','CRV','SNX','MKR','SUSHI','YFI','CAKE','BAL','1INCH','LDO','RPL','CVX','FXS','DYDX','GMX','GNS','PENDLE','BLUR']),
  meme:   new Set(['DOGE','SHIB','PEPE','FLOKI','BONK','WIF','BRETT','MOG','MEME','BABYDOGE','BOME','POPCAT','TURBO','NEIRO','GOAT','ACT','PNUT']),
  ai:     new Set(['FET','AGIX','OCEAN','RNDR','GRT','NMR','ANKR','TAO','WLD','ICP','AIOZ','VANA','ATH','GROK','AIXBT']),
  layer1: new Set(['BTC','ETH','SOL','ADA','AVAX','DOT','NEAR','ATOM','ALGO','HBAR','XTZ','EGLD','ONE','QTUM','NEO','WAVES','ZIL','VET','XLM','XRP','TRX','LTC','BCH','ETC','TON','APT','SUI']),
  layer2: new Set(['MATIC','OP','ARB','IMX','LRC','METIS','BOBA','CELR','SKL','OMG','ZK','MANTA','ZETA']),
  gaming: new Set(['AXS','SAND','MANA','ENJ','GALA','ILV','ALICE','TLM','GODS','PIXEL','YGG','SLP','RON','BEAM','PRIME','MAGIC','PORTAL']),
};
function getCats(sym){const t=[];for(const[cat,set] of Object.entries(CAT_MAP)){if(set.has(sym))t.push(cat);}return t;}

const NAME_MAP={BTC:'Bitcoin',ETH:'Ethereum',BNB:'BNB',SOL:'Solana',XRP:'XRP',ADA:'Cardano',DOGE:'Dogecoin',MATIC:'Polygon',DOT:'Polkadot',LTC:'Litecoin',AVAX:'Avalanche',LINK:'Chainlink',UNI:'Uniswap',ATOM:'Cosmos',SHIB:'Shiba Inu',TRX:'TRON',NEAR:'NEAR Protocol',FIL:'Filecoin',APT:'Aptos',SUI:'Sui',OP:'Optimism',ARB:'Arbitrum',INJ:'Injective',WLD:'Worldcoin',PEPE:'Pepe',WIF:'dogwifhat',FLOKI:'FLOKI',BONK:'Bonk',BRETT:'Brett',MEME:'Memecoin',SEI:'Sei',TIA:'Celestia',AAVE:'Aave',CRV:'Curve DAO',MKR:'Maker',COMP:'Compound',SNX:'Synthetix',SUSHI:'SushiSwap',YFI:'yearn.finance',CAKE:'PancakeSwap',GRT:'The Graph',RNDR:'Render',FET:'Fetch.ai',AGIX:'SingularityNET',OCEAN:'Ocean Protocol',LDO:'Lido DAO',RPL:'Rocket Pool',IMX:'Immutable X',AXS:'Axie Infinity',SAND:'The Sandbox',MANA:'Decentraland',ENJ:'Enjin Coin',GALA:'Gala',APE:'ApeCoin',BCH:'Bitcoin Cash',ETC:'Ethereum Classic',XMR:'Monero',ZEC:'Zcash',DASH:'Dash',XLM:'Stellar',VET:'VeChain',HBAR:'Hedera',ALGO:'Algorand',EGLD:'MultiversX',THETA:'Theta',FTM:'Fantom',ICP:'Internet Computer',FLOW:'Flow',EOS:'EOS',XTZ:'Tezos',NEO:'NEO',CHZ:'Chiliz',HOT:'Holo',BAT:'Basic Attention',ZRX:'0x Protocol',KSM:'Kusama',QNT:'Quant',ZIL:'Zilliqa',WAVES:'Waves',ONE:'Harmony',ANKR:'Ankr',CELR:'Celer',SKL:'SKALE',OMG:'OMG Network',LRC:'Loopring','1INCH':'1inch',CFX:'Conflux',GMX:'GMX',GNS:'Gains',DYDX:'dYdX',NOT:'Notcoin',ZK:'ZKsync',PIXEL:'Pixels',BLUR:'Blur',JTO:'Jito',BOME:'Book of Meme',POPCAT:'Popcat',W:'Wormhole',TON:'Toncoin',TAO:'Bittensor',GOAT:'Goatseus',ACT:'Act I',NEIRO:'Neiro',PNUT:'Peanut',PENDLE:'Pendle',EIGEN:'EigenLayer',ONDO:'Ondo',STRK:'Starknet',MANTA:'Manta',ZETA:'ZetaChain',METIS:'Metis',ATH:'Aethir',VANA:'Vana',AIXBT:'AIXBT',GROK:'Grok',};
function enrichName(sym){return NAME_MAP[sym]||sym;}


(function(){
  const t=localStorage.getItem('pd_theme')||'light';
  document.documentElement.setAttribute('data-theme',t);
  const b=document.getElementById('THEME_BTN');if(b)b.innerHTML=t==='dark'?"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"17\" height=\"17\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"6\"/><line x1=\"12\" y1=\"18\" x2=\"12\" y2=\"22\"/><line x1=\"4.93\" y1=\"4.93\" x2=\"7.76\" y2=\"7.76\"/><line x1=\"16.24\" y1=\"16.24\" x2=\"19.07\" y2=\"19.07\"/><line x1=\"2\" y1=\"12\" x2=\"6\" y2=\"12\"/><line x1=\"18\" y1=\"12\" x2=\"22\" y2=\"12\"/><line x1=\"4.93\" y1=\"19.07\" x2=\"7.76\" y2=\"16.24\"/><line x1=\"16.24\" y1=\"7.76\" x2=\"19.07\" y2=\"4.93\"/></svg>":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"17\" height=\"17\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\"/></svg>";
  const m=document.getElementById('MOB_THEME_BTN');if(m)m.innerHTML=t==='dark'?"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"6\"/><line x1=\"12\" y1=\"18\" x2=\"12\" y2=\"22\"/><line x1=\"4.93\" y1=\"4.93\" x2=\"7.76\" y2=\"7.76\"/><line x1=\"16.24\" y1=\"16.24\" x2=\"19.07\" y2=\"19.07\"/><line x1=\"2\" y1=\"12\" x2=\"6\" y2=\"12\"/><line x1=\"18\" y1=\"12\" x2=\"22\" y2=\"12\"/><line x1=\"4.93\" y1=\"19.07\" x2=\"7.76\" y2=\"16.24\"/><line x1=\"16.24\" y1=\"7.76\" x2=\"19.07\" y2=\"4.93\"/></svg> Light":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\"/></svg> Dark";
})();
function toggleTheme(){
  const cur=document.documentElement.getAttribute('data-theme');
  const next=cur==='dark'?'light':'dark';
  document.documentElement.setAttribute('data-theme',next);
  document.getElementById('THEME_BTN').innerHTML=next==='dark'?"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"17\" height=\"17\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"6\"/><line x1=\"12\" y1=\"18\" x2=\"12\" y2=\"22\"/><line x1=\"4.93\" y1=\"4.93\" x2=\"7.76\" y2=\"7.76\"/><line x1=\"16.24\" y1=\"16.24\" x2=\"19.07\" y2=\"19.07\"/><line x1=\"2\" y1=\"12\" x2=\"6\" y2=\"12\"/><line x1=\"18\" y1=\"12\" x2=\"22\" y2=\"12\"/><line x1=\"4.93\" y1=\"19.07\" x2=\"7.76\" y2=\"16.24\"/><line x1=\"16.24\" y1=\"7.76\" x2=\"19.07\" y2=\"4.93\"/></svg>":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"17\" height=\"17\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\"/></svg>";
  const m=document.getElementById('MOB_THEME_BTN');if(m)m.innerHTML=next==='dark'?"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"4\"/><line x1=\"12\" y1=\"2\" x2=\"12\" y2=\"6\"/><line x1=\"12\" y1=\"18\" x2=\"12\" y2=\"22\"/><line x1=\"4.93\" y1=\"4.93\" x2=\"7.76\" y2=\"7.76\"/><line x1=\"16.24\" y1=\"16.24\" x2=\"19.07\" y2=\"19.07\"/><line x1=\"2\" y1=\"12\" x2=\"6\" y2=\"12\"/><line x1=\"18\" y1=\"12\" x2=\"22\" y2=\"12\"/><line x1=\"4.93\" y1=\"19.07\" x2=\"7.76\" y2=\"16.24\"/><line x1=\"16.24\" y1=\"7.76\" x2=\"19.07\" y2=\"4.93\"/></svg> Light":"<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"15\" height=\"15\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z\"/></svg> Dark";
  localStorage.setItem('pd_theme',next);
  if(mcChart){mcChart.destroy();mcChart=null;buildMarketChart();}
  if(pieChart)rebuildPie();
}


function setCurrency(code){CUR=code;CUR_RATE=CURRENCY_RATES[code]||1;CUR_SYM=CURRENCY_SYMS[code]||'$';localStorage.setItem('pd_currency',code);renderTable();updatePortfolio();}
(function(){const c=localStorage.getItem('pd_currency')||'USD';setCurrency(c);})();


function toast(m,d=3200){const t=document.getElementById('toast');t.textContent=m;t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),d);}
function dt(f){toast('<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:3px"><rect x="2" y="6" width="20" height="8" rx="1"/><path d="M17 14v7"/><path d="M7 14v7"/><path d="M17 3v3"/><path d="M7 3v3"/><path d="M10 14 2.3 6.3"/><path d="M14 6l7.7 7.7"/><path d="m8 6 8 8"/></svg> "'+f+'" — Coming soon!');}
window.addEventListener('scroll',()=>{document.getElementById('scrollTop').classList.toggle('show',scrollY>600);},{passive:true});

function fmtP(n){if(n==null||isNaN(n))return'—';n=parseFloat(n);const v=n*CUR_RATE,s=CUR_SYM;if(v>=10000)return s+v.toLocaleString('en-US',{maximumFractionDigits:2});if(v>=1)return s+v.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});if(v>=0.01)return s+v.toFixed(5);if(v>=0.0001)return s+v.toFixed(6);return s+v.toPrecision(4);}
function fmtPrice(n){if(n==null||isNaN(n))return'—';n=parseFloat(n);if(n>=10000)return'$'+n.toLocaleString('en-US',{maximumFractionDigits:2});if(n>=1)return'$'+n.toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:4});if(n>=0.01)return'$'+n.toFixed(5);if(n>=0.0001)return'$'+n.toFixed(6);return'$'+n.toPrecision(4);}
function fmtLarge(n){if(!n||isNaN(n))return'—';n=parseFloat(n)*CUR_RATE;if(n>=1e12)return CUR_SYM+(n/1e12).toFixed(2)+'T';if(n>=1e9)return CUR_SYM+(n/1e9).toFixed(2)+'B';if(n>=1e6)return CUR_SYM+(n/1e6).toFixed(2)+'M';if(n>=1e3)return CUR_SYM+(n/1e3).toFixed(1)+'K';return CUR_SYM+n.toFixed(2);}
function fmtLargeUSD(n){if(!n||isNaN(n))return'—';n=parseFloat(n);if(n>=1e12)return'$'+(n/1e12).toFixed(2)+'T';if(n>=1e9)return'$'+(n/1e9).toFixed(2)+'B';if(n>=1e6)return'$'+(n/1e6).toFixed(2)+'M';return'$'+n.toFixed(0);}
function chgBadge(c){if(c==null||isNaN(c))return'<span class="chg-badge" style="background:var(--surface3);color:var(--t3)">—</span>';c=parseFloat(c);const cls=c>=0?'chg-up':'chg-dn';const sym=c>=0?'▲':'▼';return`<span class="chg-badge ${cls}">${sym} ${Math.abs(c).toFixed(2)}%</span>`;}
function sparkSVG(prices,up){if(!prices||prices.length<4)return'';const w=80,h=32,sl=prices.slice(-30);const mn=Math.min(...sl),mx=Math.max(...sl),rng=mx-mn||1;const pts=sl.map((v,i)=>`${((i/(sl.length-1))*w).toFixed(1)},${(h-((v-mn)/rng)*(h-4)-2).toFixed(1)}`).join(' ');const col=up?'#0EA66A':'#E8334A';return`<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="sparkline"><polyline points="${pts}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;}

function pdLogo(sym){return`https://publicdrop.in/APIv3/logo?sym=${encodeURIComponent(sym||'?')}`;}
function bnbLogo(sym){return`https://bin.bnbstatic.com/image/pgc/202309/${encodeURIComponent((sym||'').toUpperCase())}.png`;}
function bnbLogo2(sym){return`https://s3-ap-southeast-1.amazonaws.com/coin-logo-production/${encodeURIComponent((sym||'').toUpperCase())}.png`;}
function cgLogo(sym){
  const CG_IDS={BTC:'bitcoin',ETH:'ethereum',BNB:'binancecoin',SOL:'solana',XRP:'ripple',ADA:'cardano',DOGE:'dogecoin',MATIC:'matic-network',DOT:'polkadot',LTC:'litecoin',AVAX:'avalanche-2',LINK:'chainlink',UNI:'uniswap',ATOM:'cosmos',SHIB:'shiba-inu',TRX:'tron',NEAR:'near',FIL:'filecoin',APT:'aptos',SUI:'sui',OP:'optimism',ARB:'arbitrum',INJ:'injective-protocol',WLD:'worldcoin-wld',PEPE:'pepe',WIF:'dogwifcoin',FLOKI:'floki',BONK:'bonk',BRETT:'brett',SEI:'sei-network',TIA:'celestia',AAVE:'aave',MKR:'maker',COMP:'compound-governance-token',CRV:'curve-dao-token',SNX:'havven',SUSHI:'sushi',YFI:'yearn-finance',CAKE:'pancakeswap-token',GRT:'the-graph',RNDR:'render-token',FET:'fetch-ai',AGIX:'singularitynet',OCEAN:'ocean-protocol',LDO:'lido-dao',RPL:'rocket-pool',IMX:'immutable-x',AXS:'axie-infinity',SAND:'the-sandbox',MANA:'decentraland',ENJ:'enjincoin',GALA:'gala',APE:'apecoin',BCH:'bitcoin-cash',ETC:'ethereum-classic',XMR:'monero',XLM:'stellar',VET:'vechain',HBAR:'hedera-hashgraph',ALGO:'algorand',THETA:'theta-token',FTM:'fantom',ICP:'internet-computer',FLOW:'flow',EOS:'eos',XTZ:'tezos',NEO:'neo',CHZ:'chiliz',BAT:'basic-attention-token',ZRX:'0x',KSM:'kusama',QNT:'quant-network',ZIL:'zilliqa',WAVES:'waves',ONE:'harmony',ANKR:'ankr',TON:'the-open-network',TAO:'bittensor',NOT:'notcoin',PENDLE:'pendle',ONDO:'ondo-finance',STRK:'starknet',EIGEN:'eigenlayer'};
  const id=CG_IDS[sym];
  return id?`https://assets.coingecko.com/coins/images/1/small/${id}.png`:'';
}
function imgTag(sym,name,size=30){
  const pd=pdLogo(sym);
  const bn=bnbLogo(sym);
  const bn2=bnbLogo2(sym);
  const cg=cgLogo(sym);
  const fallbacks=JSON.stringify([bn,bn2,cg].filter(Boolean));
  return`<img src="${pd}" width="${size}" height="${size}" loading="lazy" decoding="async" style="border-radius:50%;object-fit:cover;background:var(--surface3);flex-shrink:0" onerror="(function(el){if(!el._fbs){el._fbs=${fallbacks};el._fi=0;}if(el._fi<el._fbs.length){el.src=el._fbs[el._fi++];}else{el.onerror=null;el.style.display='none';var ph=document.createElement('div');ph.style.cssText='width:${size}px;height:${size}px;border-radius:50%;background:linear-gradient(135deg,#F0B90B,#F8D12F);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size*0.42)}px;font-weight:700;color:#1a1a1a;flex-shrink:0;font-family:monospace;';ph.textContent=(el.alt||'?').charAt(0).toUpperCase();el.parentNode&&el.parentNode.insertBefore(ph,el);}})(this)" alt="${sym}" loading="lazy">`;
}
function coinImg(sym){return pdLogo(sym);}
async function prefetchLogo(sym){return;}

const STABLES=new Set(['USDT','BUSD','USDC','TUSD','USDP','DAI','FDUSD','USDE','SUSD','GUSD','EURS','VAI']);
let wsBinance=null,wsBybit=null,wsOKX=null,wsMEXC=null;
let wsRetryB=0,wsRetryBB=0,wsRetryO=0,wsRetryM=0;
const MAX_RETRY=8;
const COIN_MAP={};

function makeCoin(sym,price,change,vol,high,low,src){
  COIN_PRICES[sym]=price;
  return{id:sym.toLowerCase(),sym,pair:sym+'USDT',name:enrichName(sym),price,change,changeAbs:0,high:high||price,low:low||price,vol:vol||0,source:src,cats:getCats(sym),spark:null,sparkH:[price]};
}


function connectBinance(){
  if(wsBinance){try{wsBinance.close();}catch(e){}}
  try{
    wsBinance=new WebSocket('wss://stream.binance.com:9443/ws/!miniTicker@arr');
    wsBinance.onopen=()=>{wsRetryB=0;};
    wsBinance.onmessage=e=>{
      try{
        const data=JSON.parse(e.data);
        if(!Array.isArray(data))return;
        let dirty=false;
        data.forEach(t=>{
          if(!t.s||!t.s.endsWith('USDT'))return;
          const sym=t.s.replace('USDT','');
          if(STABLES.has(sym))return;
          const price=parseFloat(t.c)||0;
          const change=parseFloat(t.P)||0;
          const vol=parseFloat(t.q)||0;
          const high=parseFloat(t.h)||0;
          const low=parseFloat(t.l)||0;
          COIN_PRICES[sym]=price;
          if(COIN_MAP[sym]){
            const c=COIN_MAP[sym];
            c.price=price;c.change=change;c.vol=vol;c.high=high;c.low=low;
            c.sparkH=c.sparkH||[];c.sparkH.push(price);
            if(c.sparkH.length>50)c.sparkH.shift();
            c.spark=c.sparkH;
            dirty=true;
          }else{
            const c=makeCoin(sym,price,change,vol,high,low,'binance');
            COIN_MAP[sym]=c;ALL_COINS.push(c);dirty=true;
          }
        });
        if(dirty)scheduleRender();
      }catch(e){}
    };
    wsBinance.onerror=()=>{};
    wsBinance.onclose=()=>{if(wsRetryB<MAX_RETRY){wsRetryB++;setTimeout(connectBinance,Math.min(1000*wsRetryB,30000));}};
  }catch(e){}
}


const BYBIT_PAIRS=['BTCUSDT','ETHUSDT','SOLUSDT','XRPUSDT','ADAUSDT','BNBUSDT','DOGEUSDT','AVAXUSDT','DOTUSDT','LINKUSDT','UNIUSDT','ATOMUSDT','SHIBUSDT','LTCUSDT','NEARUSDT','FILUSDT','INJUSDT','APTUSDT','SUIUSDT','OPUSDT','ARBUSDT','PEPEUSDT','WIFUSDT','TONUSDT','TAOUSDT','NOTUSDT','TIAUSDT','SEIUSDT','LDOUSDT','MKRUSDT'];
function connectBybit(){
  if(wsBybit){try{wsBybit.close();}catch(e){}}
  try{
    wsBybit=new WebSocket('wss://stream.bybit.com/v5/public/spot');
    wsBybit.onopen=()=>{
      wsRetryBB=0;
      wsBybit.send(JSON.stringify({op:'subscribe',args:BYBIT_PAIRS.map(s=>`tickers.${s}`)}));
    };
    wsBybit.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.topic&&d.data){
          const t=d.data;
          const sym=(t.symbol||'').replace('USDT','');
          if(!sym||STABLES.has(sym))return;
          const price=parseFloat(t.lastPrice)||0;
          const pct=parseFloat(t.price24hPcnt||0);
          const change=Math.abs(pct)>1?pct:pct*100;
          const vol=parseFloat(t.volume24h||t.turnover24h||0);
          COIN_PRICES[sym]=price;
          if(COIN_MAP[sym]&&price>0){const c=COIN_MAP[sym];c.price=price;if(change!==0)c.change=change;if(vol>0)c.vol=Math.max(c.vol,vol);}
        }
      }catch(e){}
    };
    wsBybit.onerror=()=>{};
    wsBybit.onclose=()=>{if(wsRetryBB<MAX_RETRY){wsRetryBB++;setTimeout(connectBybit,Math.min(2000*wsRetryBB,60000));}};
  }catch(e){}
}


const OKX_INSTIDS=['BTC-USDT','ETH-USDT','SOL-USDT','XRP-USDT','ADA-USDT','BNB-USDT','DOGE-USDT','AVAX-USDT','DOT-USDT','LINK-USDT','UNI-USDT','ATOM-USDT','LTC-USDT','NEAR-USDT','INJ-USDT','APT-USDT','SUI-USDT','OP-USDT','ARB-USDT','PEPE-USDT','TON-USDT','SHIB-USDT','TRX-USDT','MATIC-USDT','FIL-USDT','AAVE-USDT','CRV-USDT','FET-USDT','RNDR-USDT','WLD-USDT'];
function connectOKX(){
  if(wsOKX){try{wsOKX.close();}catch(e){}}
  try{
    wsOKX=new WebSocket('wss://ws.okx.com:8443/ws/v5/public');
    wsOKX.onopen=()=>{
      wsRetryO=0;
      wsOKX.send(JSON.stringify({op:'subscribe',args:OKX_INSTIDS.map(instId=>({channel:'tickers',instId}))}));
    };
    wsOKX.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.data&&Array.isArray(d.data)){
          d.data.forEach(t=>{
            const sym=(t.instId||'').replace('-USDT','');
            if(!sym||STABLES.has(sym))return;
            const price=parseFloat(t.last)||0;
            const open=parseFloat(t.open24h)||price;
            const change=open>0?((price-open)/open)*100:0;
            const vol=parseFloat(t.volCcy24h||t.vol24h||0);
            COIN_PRICES[sym]=price;
            if(COIN_MAP[sym]&&price>0){const c=COIN_MAP[sym];c.price=price;if(change!==0)c.change=change;if(vol>0)c.vol=Math.max(c.vol,vol);}
          });
        }
      }catch(e){}
    };
    wsOKX.onerror=()=>{};
    wsOKX.onclose=()=>{if(wsRetryO<MAX_RETRY){wsRetryO++;setTimeout(connectOKX,Math.min(2000*wsRetryO,60000));}};
  }catch(e){}
}


function connectMEXC(){
  if(wsMEXC){try{wsMEXC.close();}catch(e){}}
  try{
    wsMEXC=new WebSocket('wss://wbs.mexc.com/ws');
    wsMEXC.onopen=()=>{
      wsRetryM=0;
      wsMEXC.send(JSON.stringify({method:'SUBSCRIPTION',params:['spot@public.miniTickers.v3.api@UTC+8']}));
    };
    wsMEXC.onmessage=e=>{
      try{
        const d=JSON.parse(e.data);
        if(d.d&&Array.isArray(d.d)){
          d.d.forEach(t=>{
            if(!t.s||!t.s.endsWith('USDT'))return;
            const sym=t.s.replace('USDT','');
            if(STABLES.has(sym))return;
            const price=parseFloat(t.c)||0;
            const change=parseFloat(t.P)||0;
            const vol=parseFloat(t.v)||0;
            COIN_PRICES[sym]=price;
            if(COIN_MAP[sym]&&price>0){const c=COIN_MAP[sym];c.price=price;if(change!==0)c.change=change;if(vol>0)c.vol=Math.max(c.vol,vol);}
          });
        }
      }catch(e){}
    };
    wsMEXC.onerror=()=>{};
    wsMEXC.onclose=()=>{if(wsRetryM<MAX_RETRY){wsRetryM++;setTimeout(connectMEXC,Math.min(3000*wsRetryM,90000));}};
  }catch(e){}
}

/* ── Page Visibility: pause all WS when tab hidden, resume when visible ── */
let _wsActive=true;
function _closeAllWS(){
  _wsActive=false;
  [wsBinance,wsBybit,wsOKX,wsMEXC].forEach(ws=>{try{if(ws)ws.close();}catch(e){}});
  wsBinance=wsBybit=wsOKX=wsMEXC=null;
}
function _resumeAllWS(){
  if(_wsActive)return;
  _wsActive=true;
  connectBinance();connectBybit();connectOKX();connectMEXC();
}
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){_closeAllWS();}else{_resumeAllWS();}
});


async function bootstrap(){
  try{
    const res=await fetch('https://api.binance.com/api/v3/ticker/24hr');
    if(!res.ok)throw new Error('HTTP '+res.status);
    const data=await res.json();
    data.forEach(t=>{
      if(!t.symbol.endsWith('USDT'))return;
      const sym=t.symbol.replace('USDT','');
      if(STABLES.has(sym))return;
      const price=parseFloat(t.lastPrice)||0;
      const change=parseFloat(t.priceChangePercent)||0;
      const vol=parseFloat(t.quoteVolume)||0;
      const high=parseFloat(t.highPrice)||0;
      const low=parseFloat(t.lowPrice)||0;
      COIN_PRICES[sym]=price;
      if(!COIN_MAP[sym]){
        const c=makeCoin(sym,price,change,vol,high,low,'binance');
        COIN_MAP[sym]=c;ALL_COINS.push(c);
      }
    });
    ALL_COINS.sort((a,b)=>b.vol-a.vol);
    const btc=COIN_MAP['BTC'],eth=COIN_MAP['ETH'];
    if(btc)document.getElementById('mini-btc').textContent=fmtPrice(btc.price);
    if(eth)document.getElementById('mini-eth').textContent=fmtPrice(eth.price);
    document.getElementById('mini-count').textContent=ALL_COINS.length+'+';
    document.getElementById('coin-count-badge').textContent=ALL_COINS.length+' coins';
    const dl=document.getElementById('coin-datalist');
    if(dl)dl.innerHTML=ALL_COINS.slice(0,300).map(c=>`<option value="${c.sym}">${c.name}</option>`).join('');
    buildTicker(ALL_COINS);
    applyFiltersAndRender();
    updatePortfolio();
    buildGlobalStats();
    buildTrending();
    fetchFearGreed();
    
    connectBinance();
    setTimeout(connectBybit,1500);
    setTimeout(connectOKX,3000);
    setTimeout(connectMEXC,4500);
  }catch(err){
    document.getElementById('TABLE_BODY').innerHTML=`<div class="tbl-error">
      <div style="margin-bottom:12px"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--dn)"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></div>
      <div style="font-size:15px;font-weight:700;margin-bottom:8px">Failed to load market data</div>
      <div style="font-size:13px;color:var(--t2);margin-bottom:16px">Check your connection or try again.</div>
      <button onclick="location.reload()" style="padding:10px 24px;border-radius:var(--pill);background:var(--t1);color:var(--bg);font-size:13px;font-weight:700;border:none;cursor:pointer">Retry Now</button>
    </div>`;
  }
}


function buildGlobalStats(){
  if(!ALL_COINS.length)return;
  let totalVol=0;
  ALL_COINS.forEach(c=>{totalVol+=c.vol||0;});
  globalVol=totalVol;
  const btc=COIN_MAP['BTC'],eth=COIN_MAP['ETH'];
  if(btc)document.getElementById('mini-btc').textContent=fmtPrice(btc.price);
  if(eth)document.getElementById('mini-eth').textContent=fmtPrice(eth.price);
  document.getElementById('stat-vol').innerHTML=`<div class="hs-label">24H Volume</div><div class="hs-val">${fmtLargeUSD(totalVol)}</div><div class="hs-sub" style="color:var(--t3)">Live CEX volume</div>`;
  document.getElementById('chart-val').textContent=fmtLargeUSD(totalVol);
  document.getElementById('chart-sub').textContent='24h global CEX volume · live data';
  buildMarketChart();
  fetchFearGreed();
}


async function fetchFearGreed(){
  let mcapDone=false,fngDone=false,domDone=false;
  try{
    const r=await fetch('https://publicdrop.in/APIv3/status');
    const d=await r.json();
    const allVals=Object.values(d).concat(Object.values(d).flatMap(v=>v&&typeof v==='object'?Object.values(v):[]));
    const pick=(...keys)=>{for(const k of keys){if(d[k]!=null)return d[k];for(const sub of Object.values(d)){if(sub&&typeof sub==='object'&&sub[k]!=null)return sub[k];}}return null;};
    const fngVal=pick('value','score','index','fear_greed','fearGreed','fng','fear_greed_index','fgi','fear_greed_value','fgValue','fearGreedIndex','fear_and_greed');
    const fngRaw=fngVal&&typeof fngVal==='object'?(fngVal.value||fngVal.score||fngVal.index||0):fngVal;
    const val=parseInt(fngRaw)||0;
    if(val>0){
      fngDone=true;
      const labelRaw=pick('label','classification','value_classification','fear_greed_label','fgLabel','sentiment');
      const label=labelRaw||(val>75?'Extreme Greed':val>55?'Greed':val>45?'Neutral':val>25?'Fear':'Extreme Fear');
      const col=val>60?'var(--up)':val<40?'var(--dn)':'#F59E0B';
      document.getElementById('stat-fng').innerHTML=`<div class="hs-label">Fear &amp; Greed</div><div class="hs-val" style="color:${col}">${val}</div><div class="hs-sub" style="color:${col};font-weight:700">${label}</div>`;
    }
    const btcDomVal=pick('btc_dominance','btcDominance','btc_dom','bitcoin_dominance','btcDom','btc_market_dominance');
    const ethDomVal=pick('eth_dominance','ethDominance','eth_dom','ethereum_dominance','ethDom');
    if(btcDomVal!=null){
      domDone=true;
      document.getElementById('stat-dom').innerHTML=`<div class="hs-label">BTC Dominance</div><div class="hs-val">${parseFloat(btcDomVal).toFixed(1)}%</div><div class="hs-sub" style="color:var(--t3)">${ethDomVal!=null?'ETH: '+parseFloat(ethDomVal).toFixed(1)+'%':''}</div>`;
    }
    const mcapRaw=pick('market_cap','marketCap','total_market_cap','totalMarketCap','total_mcap','mcap','market_capitalization','totalMcap','global_market_cap','globalMarketCap');
    const mcapNum=mcapRaw&&typeof mcapRaw==='object'?(mcapRaw.usd||mcapRaw.total||0):parseFloat(mcapRaw)||0;
    if(mcapNum>0){
      mcapDone=true;
      const mcapChgRaw=pick('market_cap_change','mcapChange','market_cap_change_24h','mcap_change','marketCapChange','market_cap_percentage_change');
      const mcapChg=parseFloat(mcapChgRaw)||0;
      const upMcap=mcapChg>=0;
      document.getElementById('stat-mcap').innerHTML=`<div class="hs-label">Market Cap</div><div class="hs-val">${fmtLargeUSD(mcapNum)}</div><div class="hs-sub ${upMcap?'up-c':'dn-c'}">${mcapChg?((upMcap?'▲':'▼')+' '+Math.abs(mcapChg).toFixed(2)+'% (24h)'):'Live data'}</div>`;
    }
    const volRaw=pick('volume','total_volume','vol24h','volume_24h','totalVolume','vol');
    const volNum=volRaw&&typeof volRaw==='object'?(volRaw.usd||volRaw.total||0):parseFloat(volRaw)||0;
    if(volNum>0){
      document.getElementById('stat-vol').innerHTML=`<div class="hs-label">24H Volume</div><div class="hs-val">${fmtLargeUSD(volNum)}</div><div class="hs-sub" style="color:var(--t3)">PublicDrop Live</div>`;
    }
  }catch(e){}
  if(!mcapDone||!domDone){
    try{
      const cg=await fetch('https://api.coingecko.com/api/v3/global');
      const g=(await cg.json()).data;
      if(!mcapDone&&g.total_market_cap&&g.total_market_cap.usd){
        const mc=g.total_market_cap.usd;
        const chg=g.market_cap_change_percentage_24h_usd||0;
        const up=chg>=0;
        document.getElementById('stat-mcap').innerHTML=`<div class="hs-label">Market Cap</div><div class="hs-val">${fmtLargeUSD(mc)}</div><div class="hs-sub ${up?'up-c':'dn-c'}">${up?'▲':'▼'} ${Math.abs(chg).toFixed(2)}% (24h)</div>`;
      }
      if(!domDone&&g.market_cap_percentage){
        const btcP=g.market_cap_percentage.btc||0;
        const ethP=g.market_cap_percentage.eth||0;
        document.getElementById('stat-dom').innerHTML=`<div class="hs-label">BTC Dominance</div><div class="hs-val">${btcP.toFixed(1)}%</div><div class="hs-sub" style="color:var(--t3)">ETH: ${ethP.toFixed(1)}%</div>`;
      }
    }catch(e2){}
  }
  if(!fngDone){
    try{
      const f=await fetch('https://api.alternative.me/fng/?limit=1');
      const fd=(await f.json()).data[0];
      const val=parseInt(fd.value);
      const col=val>60?'var(--up)':val<40?'var(--dn)':'#F59E0B';
      document.getElementById('stat-fng').innerHTML=`<div class="hs-label">Fear &amp; Greed</div><div class="hs-val" style="color:${col}">${val}</div><div class="hs-sub" style="color:${col};font-weight:700">${fd.value_classification}</div>`;
    }catch(e3){
      document.getElementById('stat-fng').innerHTML=`<div class="hs-label">Fear &amp; Greed</div><div class="hs-val">—</div><div class="hs-sub">Unavailable</div>`;
    }
  }
}


async function buildTrending(){
  if(!ALL_COINS.length)return;
  const top=ALL_COINS.filter(c=>c.vol>500000&&c.change>0).sort((a,b)=>b.change-a.change).slice(0,10);
  if(!top.length)return;
  await Promise.all(top.map(c=>prefetchLogo(c.sym)));
  const renderTrendStrip=()=>top.map(c=>`
    <a class="trend-chip" href="/coin/${c.sym}">
      ${imgTag(c.sym,c.name,30)}
      <div style="flex:1;min-width:0">
        <div class="trend-name">${c.name}</div>
        <div class="trend-sym">${c.sym}</div>
      </div>
      <div class="trend-chg up-c">▲${c.change.toFixed(1)}%</div>
    </a>`).join('');
  document.getElementById('TRENDING_STRIP').innerHTML=renderTrendStrip();
}


function buildMarketChart(){
  const ctx=document.getElementById('MARKET_CHART');
  if(!ctx)return;
  if(mcChart){mcChart.destroy();mcChart=null;}
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  const gridCol=isDark?'rgba(255,255,255,.06)':'rgba(0,0,0,.05)';
  const tickCol=isDark?'#505570':'#8B90AB';
  if(chartView==='dominance'&&ALL_COINS.length>=7){
    const top=ALL_COINS.slice(0,7);
    const total=top.reduce((s,c)=>s+(c.vol||0),0)||1;
    mcChart=new Chart(ctx,{type:'doughnut',data:{labels:top.map(c=>c.sym),datasets:[{data:top.map(c=>(((c.vol||0)/total)*100).toFixed(1)),backgroundColor:['#1A56DB','#F59E0B','#0EA66A','#E8334A','#8B5CF6','#06B6D4','#F97316'],borderWidth:0}]},options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{color:tickCol,font:{size:11,family:'DM Mono'},padding:8}},tooltip:{callbacks:{label:c=>`${c.label}: ${c.parsed.toFixed(1)}%`}}}}});
  }else{
    const base=globalVol>0?globalVol/24:5e9;
    const labels=Array.from({length:24},(_,i)=>{const h=(new Date().getHours()-23+i+24)%24;return`${String(h).padStart(2,'0')}:00`;});
    const vals=labels.map((_,i)=>base*(0.6+Math.sin(i/4)*0.3+Math.random()*0.1));
    mcChart=new Chart(ctx,{type:'line',data:{labels,datasets:[{data:vals,borderColor:'#1A56DB',backgroundColor:'rgba(26,86,219,.07)',fill:true,borderWidth:2,pointRadius:0,pointHoverRadius:4,tension:.4}]},options:{responsive:true,maintainAspectRatio:false,interaction:{mode:'index',intersect:false},plugins:{legend:{display:false},tooltip:{backgroundColor:isDark?'rgba(18,20,28,.95)':'rgba(10,12,20,.9)',titleColor:'rgba(255,255,255,.6)',bodyColor:'#fff',bodyFont:{family:'DM Mono',weight:'600',size:12},padding:10,cornerRadius:8,callbacks:{label:c=>'$'+(c.parsed.y/1e9).toFixed(2)+'B'}}},scales:{x:{grid:{display:false},ticks:{color:tickCol,font:{size:10,family:'DM Mono'},maxTicksLimit:8,maxRotation:0}},y:{grid:{color:gridCol},ticks:{color:tickCol,font:{size:10,family:'DM Mono'},callback:v=>'$'+(v/1e9).toFixed(0)+'B'}}}}});
  }
}
function setChartView(view,btn){
  chartView=view;
  document.querySelectorAll('.market-chart-card .tab-pill').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  if(mcChart){mcChart.destroy();mcChart=null;}
  buildMarketChart();
}


let _tickerBuilt=false;
let _tickerRAF=null;
function buildTicker(coins){
  const el=document.getElementById('TICKER_INNER');
  const wrap=document.getElementById('TICKER_WRAP');
  if(!el||!coins.length)return;
  if(_tickerBuilt){
    /* Batch ticker price updates in a single rAF - no layout thrash */
    if(_tickerRAF)return;
    _tickerRAF=requestAnimationFrame(()=>{
      _tickerRAF=null;
      const top30=coins.slice(0,30);
      top30.forEach(c=>{
        const span=el.querySelector(`[data-tsym="${c.sym}"]`);
        if(!span)return;
        const up=c.change>=0;
        span.querySelector('.tp').textContent=fmtPrice(c.price);
        const ch=span.querySelector('.tc');
        ch.textContent=(up?'\u25b2':'\u25bc')+Math.abs(c.change).toFixed(2)+'%';
        ch.className='tc '+(up?'up':'dn');
      });
    });
    return;
  }
  _tickerBuilt=true;
  const top30=coins.slice(0,30); /* Only top 30 coins in ticker */
  const mkTick=c=>{
    const up=c.change>=0;
    return`<span class="tick" data-tsym="${c.sym}"><img src="${pdLogo(c.sym)}" alt="${c.sym}" loading="lazy" onerror="(function(el){if(!el._fbs){el._fbs=[bnbLogo(el.alt),bnbLogo2(el.alt)].filter(Boolean);el._fi=0;}if(el._fi<el._fbs.length){el.src=el._fbs[el._fi++];}else{el.onerror=null;el.style.display='none';}})(this)"><span class="sym">${c.sym}</span><span class="tp">${fmtPrice(c.price)}</span><span class="tc ${up?'up':'dn'}">${up?'\u25b2':'\u25bc'}${Math.abs(c.change).toFixed(2)}%</span></span>`;
  };
  const html=top30.map(mkTick).join('');
  el.innerHTML=html+html;
  requestAnimationFrame(()=>{
    const half=el.scrollWidth/2;
    const dur=Math.max(40,half/85);
    let style=document.getElementById('_ticker_kf');
    if(!style){style=document.createElement('style');style.id='_ticker_kf';document.head.appendChild(style);}
    style.textContent=`@keyframes tickerScroll{0%{transform:translateX(0)}100%{transform:translateX(-${half}px)}}`;
    el.style.cssText=`animation:tickerScroll ${dur}s linear infinite;display:flex;white-space:nowrap;will-change:transform;`;
    if(wrap){
      wrap.addEventListener('mouseenter',()=>el.style.animationPlayState='paused');
      wrap.addEventListener('mouseleave',()=>el.style.animationPlayState='running');
    }
  });
}


let renderPending=false;
let _lastRender=0;
function scheduleRender(){
  if(renderPending)return;
  renderPending=true;
  const now=Date.now();
  const delay=Math.max(3000,3000-(now-_lastRender));
  setTimeout(()=>{
    renderPending=false;
    _lastRender=Date.now();
    ALL_COINS.sort((a,b)=>b.vol-a.vol);
    const btc=COIN_MAP['BTC'],eth=COIN_MAP['ETH'];
    if(btc)document.getElementById('mini-btc').textContent=fmtPrice(btc.price);
    if(eth)document.getElementById('mini-eth').textContent=fmtPrice(eth.price);
    if(!document.hidden){
      buildTicker(ALL_COINS);
      applyFiltersAndRender();
      updatePortfolio();
    }
  },delay);
}

function manualRefresh(){
  toast('🔄 Refreshing…');
  buildGlobalStats();
  buildTrending();
  ALL_COINS.sort((a,b)=>b.vol-a.vol);
  buildTicker(ALL_COINS);
  applyFiltersAndRender();
  updatePortfolio();
}

setInterval(buildGlobalStats,60000);
setInterval(buildTrending,120000);


function setTab(tab,el){activeTab=tab;pg=1;document.querySelectorAll('.tab-pill').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');applyFiltersAndRender();}
function setCat(cat,el){activeCat=cat;pg=1;document.querySelectorAll('.cat-tag').forEach(b=>b.classList.remove('active'));if(el)el.classList.add('active');applyFiltersAndRender();}
function doSort(key){sortKey=key;pg=1;applyFiltersAndRender();}

function applyFiltersAndRender(){
  let coins=[...ALL_COINS];
  if(activeTab==='gainers')coins=coins.filter(c=>c.change>0).sort((a,b)=>b.change-a.change);
  else if(activeTab==='losers')coins=coins.filter(c=>c.change<0).sort((a,b)=>a.change-b.change);
  else if(activeTab==='new')coins=coins.slice(Math.max(0,ALL_COINS.length-100)).reverse();
  else if(activeTab==='watchlist')coins=coins.filter(c=>WL.has(c.pair));
  else{
    if(sortKey==='change_d')coins.sort((a,b)=>b.change-a.change);
    else if(sortKey==='change_a')coins.sort((a,b)=>a.change-b.change);
    else if(sortKey==='price')coins.sort((a,b)=>b.price-a.price);
    else coins.sort((a,b)=>b.vol-a.vol);
  }
  if(activeCat!=='all')coins=coins.filter(c=>c.cats.includes(activeCat));
  if(searchQ){const q=searchQ.toLowerCase();coins=coins.filter(c=>c.sym.toLowerCase().includes(q)||c.name.toLowerCase().includes(q));}
  FILTERED=coins;
  renderTable();renderPagination();
}


function renderTable(){
  if(document.hidden)return; /* skip if tab not visible */
  const start=(pg-1)*PER,end=start+PER;
  const slice=FILTERED.slice(start,end);
  if(!slice.length){
    document.getElementById('TABLE_BODY').innerHTML=`<div class="tbl-error"><div style="margin-bottom:12px"><svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:var(--t3)"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></div><div style="font-size:15px;font-weight:700">No results found</div><div style="font-size:13px;color:var(--t2);margin-top:6px">Try a different filter or search term</div></div>`;
    return;
  }
  const maxVol=FILTERED[0]?.vol||1;
  const rows=slice.map((c,i)=>{
    const rank=start+i+1;
    const up=c.change>=0;
    const inWL=WL.has(c.pair);
    const pct=Math.min(100,(c.vol/maxVol)*100);
    const catTags=c.cats.slice(0,2).map(cat=>{
      const col={defi:'#1A56DB',meme:'#E8334A',ai:'#8B5CF6',layer1:'#0EA66A',layer2:'#06B6D4',gaming:'#F59E0B'};
      return`<span class="coin-tag-sm" style="background:${col[cat]||'#888'}22;color:${col[cat]||'#888'};border:1px solid ${col[cat]||'#888'}44">${cat}</span>`;
    }).join('');
    return`<tr onclick="goToCoin('${c.pair}')">
      <td class="td-star"><button class="star-btn ${inWL?'on':''}" onclick="event.stopPropagation();toggleWL('${c.pair}',this)">${inWL?'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="fill:currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>':'<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'}</button></td>
      <td class="td-rank">${rank}</td>
      <td><div class="coin-cell">${imgTag(c.sym,c.name,30)}<div><div class="coin-name">${c.name}</div><div class="coin-sym">${c.sym}/USDT</div>${catTags?`<div class="coin-tags-row">${catTags}</div>`:''}</div></div></td>
      <td class="r td-price">${fmtP(c.price)}</td>
      <td class="r">${chgBadge(c.change)}</td>
      <td class="r td-vol hide-md">${fmtLarge(c.high)}</td>
      <td class="r td-vol"><div class="vol-bar-wrap" style="justify-content:flex-end"><span>${fmtLarge(c.vol)}</span><div class="vol-bar-bg"><div class="vol-bar-fill" style="width:${pct.toFixed(0)}%;background:${up?'var(--up)':'var(--dn)'}"></div></div></div></td>
      <td class="r hide-md">${sparkSVG(c.spark,up)||'<span style="color:var(--t4);font-size:11px">—</span>'}</td>
    </tr>`;
  }).join('');
  document.getElementById('TABLE_BODY').innerHTML=`<table>
    <thead><tr>
      <th class="td-star"></th>
      <th class="td-rank" onclick="doSort('vol')">#</th>
      <th>Name</th>
      <th class="r sorted" onclick="doSort('price')">Price</th>
      <th class="r" onclick="doSort('change_d')">24h %</th>
      <th class="r hide-md">24h High</th>
      <th class="r" onclick="doSort('vol')">Volume (24h)</th>
      <th class="r hide-md">Chart</th>
    </tr></thead><tbody>${rows}</tbody></table>`;
}


function renderPagination(){
  const total=Math.ceil(FILTERED.length/PER);
  const pgEl=document.getElementById('PAGINATION');
  if(total<=1){pgEl.style.display='none';return;}
  pgEl.style.display='flex';
  let info=`<div class="pg-info">Page ${pg}/${total} · ${FILTERED.length} coins</div>`;
  let btns=`<div class="pg-btns"><button class="pg-btn" onclick="goPage(${pg-1})" ${pg===1?'disabled':''}>‹</button>`;
  for(let i=1;i<=total;i++){
    if(i===1||i===total||Math.abs(i-pg)<=1)btns+=`<button class="pg-btn ${i===pg?'active':''}" onclick="goPage(${i})">${i}</button>`;
    else if(i===2&&pg>3)btns+=`<span class="pg-dots">…</span>`;
    else if(i===total-1&&pg<total-2)btns+=`<span class="pg-dots">…</span>`;
  }
  btns+=`<button class="pg-btn" onclick="goPage(${pg+1})" ${pg===total?'disabled':''}>›</button></div>`;
  pgEl.innerHTML=info+btns;
}
function goPage(p){const total=Math.ceil(FILTERED.length/PER);if(p<1||p>total)return;pg=p;renderTable();renderPagination();document.getElementById('market-section').scrollIntoView({behavior:'smooth',block:'start'});}
function goToCoin(pair){window.location.href='coin.html?pair='+pair;}


function toggleWL(pair,btn){
  if(WL.has(pair)){WL.delete(pair);btn.innerHTML="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"/></svg>";btn.classList.remove('on');toast('Removed from watchlist');}
  else{WL.add(pair);btn.innerHTML="<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" style=\"fill:currentColor\"><polygon points=\"12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2\"/></svg>";btn.classList.add('on');toast('Added to watchlist!');}
  saveWL();
}


function openSearch(){
  document.getElementById('SEARCH_OVERLAY').classList.add('open');
  setTimeout(()=>document.getElementById('GLOBAL_SEARCH_INPUT').focus(),180);
}
function closeSearch(){
  document.getElementById('SEARCH_OVERLAY').classList.remove('open');
  document.getElementById('SEARCH_RESULTS').classList.remove('open');
  document.getElementById('GLOBAL_SEARCH_INPUT').value='';
  searchQ='';pg=1;applyFiltersAndRender();
}
function handleSearchOverlayClick(e){if(e.target===document.getElementById('SEARCH_OVERLAY'))closeSearch();}

function srImgTag(logo,sym,name,size){
  const src=logo||pdLogo(sym);
  return`<img src="${src}" width="${size}" height="${size}" style="border-radius:50%;object-fit:cover;background:var(--surface3);flex-shrink:0" alt="${sym}" loading="lazy">`;
}
function extractLogoFromDetails(d){
  return d.logo||d.image||d.icon||d.img||d.logo_url||d.image_url||d.thumb||d.large||d.coingecko_image||d.gecko_image||(d.links&&d.links.logo)||(d.images&&(d.images.large||d.images.small||d.images.thumb))||null;
}
let searchDebounceTimer=null;
document.getElementById('GLOBAL_SEARCH_INPUT').addEventListener('input',function(){
  const q=this.value.trim();
  searchQ=q;
  const resEl=document.getElementById('SEARCH_RESULTS');
  if(!q){resEl.classList.remove('open');pg=1;applyFiltersAndRender();return;}
  clearTimeout(searchDebounceTimer);
  resEl.innerHTML=`<div class="sr-empty" style="display:flex;align-items:center;gap:10px;padding:18px 16px"><div class="fb-spin"></div><span>Searching…</span></div>`;
  resEl.classList.add('open');
  searchDebounceTimer=setTimeout(async()=>{
    try{
      const res=await fetch(`https://publicdrop.in/APIv3/search?q=${encodeURIComponent(q)}`);
      if(!res.ok)throw new Error('search failed');
      const data=await res.json();
      const raw=Array.isArray(data)?data:data.results||data.coins||data.data||[];
      if(!raw.length){
        resEl.innerHTML=`<div class="sr-empty">No results for "<strong>${q}</strong>"</div>`;
        resEl.classList.add('open');
        return;
      }
      const coins=raw.slice(0,10).map(c=>({
        sym:c.sym||c.symbol||c.ticker||'',
        name:c.name||c.sym||c.symbol||'',
        price:c.price||c.current_price||c.usd||COIN_PRICES[c.sym||c.symbol]||0,
        change:c.change||c.change24h||c.price_change_24h||c.change_24h||0,
        logo:c.logo||c.image||c.icon||c.img||c.thumb||null,
        pair:(c.sym||c.symbol||'')+'USDT'
      }));
      resEl.innerHTML=`<div class="sr-empty" style="display:flex;align-items:center;gap:10px;padding:12px 16px;font-size:12px;color:var(--t3)"><div class="fb-spin"></div><span>Loading prices…</span></div>`;
      await Promise.all(coins.map(async c=>{
        if(!c.sym)return;
        try{
          const dr=await fetch(`https://publicdrop.in/APIv3/details?sym=${encodeURIComponent(c.sym)}`);
          if(!dr.ok)return;
          const dd=await dr.json();
          const logoFromDetails=extractLogoFromDetails(dd);
          if(logoFromDetails)c.logo=logoFromDetails;
          if(!c.price||c.price===0){
            c.price=dd.price||dd.current_price||dd.last_price||dd.usd||dd.price_usd||COIN_PRICES[c.sym]||0;
          }
          if(!c.change||c.change===0){
            c.change=dd.change||dd.change24h||dd.price_change_24h||dd.change_24h||dd.percent_change_24h||0;
          }
          if(!c.name||c.name===c.sym)c.name=dd.name||c.name||c.sym;
        }catch(e){}
      }));
      resEl.innerHTML=coins.map(c=>{
        const up=parseFloat(c.change)>=0;
        const chgStr=parseFloat(c.change)?(up?'▲':'▼')+' '+Math.abs(parseFloat(c.change)).toFixed(2)+'%':'—';
        return`<div class="sr-item" onclick="goToCoin('${c.pair}');closeSearch()">
          ${srImgTag(c.logo,c.sym,c.name,38)}
          <div style="flex:1;min-width:0"><div class="sr-name">${c.name}</div><div class="sr-sym">${c.sym}/USDT</div></div>
          <div class="sr-right">
            <div class="sr-price">${c.price?fmtPrice(c.price):'—'}</div>
            <div class="sr-chg ${up?'up-c':'dn-c'}">${chgStr}</div>
          </div>
        </div>`;
      }).join('');
      resEl.classList.add('open');
    }catch(err){
      resEl.innerHTML=`<div class="sr-empty">Search unavailable. Try again.</div>`;
      resEl.classList.add('open');
    }
    pg=1;applyFiltersAndRender();
  },380);
});
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeSearch();});


function toggleMenu(){
  document.getElementById('MOBILE_MENU').classList.toggle('open');
  document.getElementById('HAMBURGER').classList.toggle('open');
}
function closeMenu(){
  document.getElementById('MOBILE_MENU').classList.remove('open');
  document.getElementById('HAMBURGER').classList.remove('open');
}
function handleMenuOverlayClick(e){if(e.target===document.getElementById('MOBILE_MENU'))closeMenu();}


function togglePortfolio(){
  const sec=document.getElementById('PORTFOLIO_SECTION');
  const open=sec.style.display!=='none';
  sec.style.display=open?'none':'block';
  if(!open){sec.scrollIntoView({behavior:'smooth'});updatePortfolio();}
}
function clearPortfolio(){
  if(!confirm('Clear all holdings?'))return;
  PORTFOLIO=[];savePortfolio();
  updatePortfolio();toast('Portfolio cleared');
}
function addHolding(){
  const sym=document.getElementById('PORT_COIN').value.trim().toUpperCase();
  const amt=parseFloat(document.getElementById('PORT_AMT').value);
  const buy=parseFloat(document.getElementById('PORT_BUY').value);
  if(!sym){toast('⚠️ Enter a coin symbol');return;}
  if(!amt||amt<=0){toast('⚠️ Enter a valid amount');return;}
  if(!buy||buy<=0){toast('⚠️ Enter your buy price');return;}
  const coin=ALL_COINS.find(c=>c.sym===sym);
  PORTFOLIO.push({sym,name:coin?.name||sym,amt,buyPrice:buy});
  savePortfolio();
  document.getElementById('PORT_COIN').value='';
  document.getElementById('PORT_AMT').value='';
  document.getElementById('PORT_BUY').value='';
  updatePortfolio();toast(`✅ Added ${amt} ${sym}`);
}
const PIE_COLORS=['#1A56DB','#0EA66A','#E8334A','#F59E0B','#8B5CF6','#06B6D4','#F97316','#10B981','#EC4899','#6366F1'];
function updatePortfolio(){
  if(!PORTFOLIO.length){
    document.getElementById('PORT_HOLDINGS').innerHTML=`<div style="text-align:center;padding:24px;color:var(--t3);font-size:13px">No holdings yet. Add coins →</div>`;
    document.getElementById('PORT_TOTAL').textContent='$0.00';
    document.getElementById('PORT_CHANGE').textContent='—';
    document.getElementById('PORT_STATS').innerHTML='';
    if(pieChart){pieChart.destroy();pieChart=null;}
    return;
  }
  let total=0,totalCost=0;
  const enriched=PORTFOLIO.map((h,i)=>{
    const price=COIN_PRICES[h.sym]||h.buyPrice;
    const val=price*h.amt,cost=h.buyPrice*h.amt;
    const pnl=val-cost,pnlPct=cost?((val-cost)/cost)*100:0;
    total+=val;totalCost+=cost;
    return{...h,price,val,cost,pnl,pnlPct,color:PIE_COLORS[i%PIE_COLORS.length]};
  });
  const totalPnl=total-totalCost;
  const totalPnlPct=totalCost?((total-totalCost)/totalCost)*100:0;
  document.getElementById('PORT_TOTAL').textContent=fmtPrice(total);
  const chgEl=document.getElementById('PORT_CHANGE');
  chgEl.textContent=`${totalPnl>=0?'+':''}${fmtPrice(totalPnl)} (${totalPnl>=0?'+':''}${totalPnlPct.toFixed(2)}%)`;
  chgEl.className=`port-change ${totalPnl>=0?'up-c':'dn-c'}`;
  const ctx=document.getElementById('PORT_PIE');
  if(pieChart){pieChart.destroy();pieChart=null;}
  const isDark=document.documentElement.getAttribute('data-theme')==='dark';
  pieChart=new Chart(ctx,{type:'doughnut',data:{labels:enriched.map(h=>h.sym),datasets:[{data:enriched.map(h=>h.val),backgroundColor:enriched.map(h=>h.color),borderWidth:2,borderColor:isDark?'#12141C':'#FFFFFF'}]},options:{responsive:true,maintainAspectRatio:false,cutout:'70%',plugins:{legend:{position:'bottom',labels:{color:isDark?'#8C91AD':'#4A4F6A',font:{size:10,family:'DM Mono'},padding:7}},tooltip:{callbacks:{label:c=>`${c.label}: ${fmtPrice(c.parsed)}`}}}}});
  document.getElementById('PORT_HOLDINGS').innerHTML=enriched.map(h=>`<div class="holding-item">
    <div class="holding-dot" style="background:${h.color}"></div>
    ${imgTag(h.sym,h.name,22)}
    <div class="holding-info">
      <div class="holding-name">${h.name} <span style="font-size:10px;color:var(--t3);font-family:var(--fm)">${h.sym}</span></div>
      <div class="holding-amount">${h.amt} @ ${fmtPrice(h.buyPrice)} avg</div>
    </div>
    <div class="holding-val">
      <div class="holding-usd">${fmtPrice(h.val)}</div>
      <div class="holding-pnl ${h.pnl>=0?'up-c':'dn-c'}">${h.pnl>=0?'+':''}${fmtPrice(h.pnl)}</div>
    </div>
    <button onclick="removeHolding(${PORTFOLIO.indexOf(h)})" style="background:none;border:none;color:var(--t4);cursor:pointer;font-size:16px;padding:0 3px;line-height:1;transition:color .15s;flex-shrink:0" onmouseover="this.style.color='var(--dn)'" onmouseout="this.style.color='var(--t4)'">×</button>
  </div>`).join('');
  const best=enriched.reduce((a,b)=>b.pnlPct>a.pnlPct?b:a);
  const worst=enriched.reduce((a,b)=>b.pnlPct<a.pnlPct?b:a);
  document.getElementById('PORT_STATS').innerHTML=[
    ['Total Invested',fmtPrice(totalCost)],['Total Value',fmtPrice(total)],
    ['Best',`${best.sym} ${best.pnlPct>=0?'+':''}${best.pnlPct.toFixed(1)}%`],
    ['Worst',`${worst.sym} ${worst.pnlPct>=0?'+':''}${worst.pnlPct.toFixed(1)}%`],
  ].map(([k,v])=>`<div style="background:var(--surface2);border:1px solid var(--border);border-radius:var(--rx);padding:9px 10px"><div style="font-size:10px;text-transform:uppercase;letter-spacing:.7px;color:var(--t3);font-weight:700;margin-bottom:2px">${k}</div><div style="font-family:var(--fm);font-size:12px;font-weight:600">${v}</div></div>`).join('');
}
function removeHolding(idx){PORTFOLIO.splice(idx,1);savePortfolio();updatePortfolio();toast('Holding removed');}
function rebuildPie(){if(pieChart){pieChart.destroy();pieChart=null;}updatePortfolio();}


function openAuthModal(){document.getElementById('AUTH_MODAL').classList.add('open');switchAuthTab('login');}
function closeAuthModal(){document.getElementById('AUTH_MODAL').classList.remove('open');}
function toggleUserDropdown(e){if(e)e.stopPropagation();const d=document.getElementById('USER_DROPDOWN');if(!d)return;const vis=d.style.display==='block';d.style.display=vis?'none':'block';}
document.addEventListener('click',function(e){const d=document.getElementById('USER_DROPDOWN');if(d&&d.style.display==='block'){const chip=document.getElementById('NAV_USER_CHIP');if(!chip||!chip.contains(e.target))d.style.display='none';}});
function handleAuthOverlayClick(e){if(e.target===document.getElementById('AUTH_MODAL'))closeAuthModal();}
function switchAuthTab(tab){
  ['login','register','forgot'].forEach(t=>{
    document.getElementById('PANEL_'+t.toUpperCase().replace('REGISTER','REG').replace('FORGOT','FGT'))?.classList.toggle('active',t===tab);
    document.getElementById('TAB_'+t.toUpperCase().replace('REGISTER','REG').replace('FORGOT','FGT'))?.classList.toggle('active',t===tab);
  });
}
function addRipple(e){
  const btn=e.currentTarget||e.target;
  const r=document.createElement('span');
  const rect=btn.getBoundingClientRect();
  const size=Math.max(rect.width,rect.height);
  r.style.cssText=`position:absolute;width:${size}px;height:${size}px;border-radius:50%;background:rgba(255,255,255,.3);transform:scale(0);animation:ripple .6s ease-out;left:${e.clientX-rect.left-size/2}px;top:${e.clientY-rect.top-size/2}px;pointer-events:none`;
  btn.style.position='relative';btn.style.overflow='hidden';
  btn.appendChild(r);setTimeout(()=>r.remove(),700);
}
if(!document.getElementById('ripple-style')){
  const s=document.createElement('style');s.id='ripple-style';
  s.textContent='@keyframes ripple{to{transform:scale(2);opacity:0}}';document.head.appendChild(s);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeAuthModal();});


bootstrap();

async function openTrendingModal(){
  if(!ALL_COINS.length){toast('⏳ Loading data…');return;}
  const top=ALL_COINS.filter(c=>c.vol>100000&&c.change>0).sort((a,b)=>b.change-a.change).slice(0,30);
  const modal=document.getElementById('TRENDING_MODAL');
  const body=document.getElementById('TRENDING_MODAL_BODY');
  const card=document.getElementById('TRENDING_MODAL_CARD');
  if(!top.length){toast('No trending data yet');return;}
  await Promise.all(top.map(c=>prefetchLogo(c.sym)));
  body.innerHTML=top.map((c,i)=>{
    const up=c.change>=0;
    const rank=i+1;
    const medal=rank===1?'🥇':rank===2?'🥈':rank===3?'🥉':`<span style="font-family:var(--fm);font-size:12px;color:var(--t3);min-width:20px;text-align:center;display:inline-block">${rank}</span>`;
    return`<a href="/coin/${c.sym}" style="display:flex;align-items:center;gap:12px;padding:10px 10px;border-radius:var(--r);background:var(--surface);border:1px solid var(--border);text-decoration:none;color:inherit;transition:all .15s;cursor:pointer;" onmouseover="this.style.background='var(--surface2)';this.style.borderColor='var(--border2)'" onmouseout="this.style.background='var(--surface)';this.style.borderColor='var(--border)'">
      <div style="min-width:26px;text-align:center;font-size:15px;flex-shrink:0">${medal}</div>
      ${imgTag(c.sym,c.name,36)}
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:700;color:var(--t1);font-family:var(--ff2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.name}</div>
        <div style="font-size:11px;color:var(--t3);font-family:var(--fm);margin-top:1px">${c.sym} · Vol ${fmtLargeUSD(c.vol)}</div>
      </div>
      <div style="text-align:right;flex-shrink:0">
        <div style="font-size:14px;font-weight:700;font-family:var(--fm);color:var(--t1)">${fmtPrice(c.price)}</div>
        <div style="font-size:12px;font-weight:700;font-family:var(--fm);color:${up?'var(--up)':'var(--dn)'};margin-top:2px">${up?'▲':'▼'} ${Math.abs(c.change).toFixed(2)}%</div>
      </div>
    </a>`;
  }).join('');
  modal.style.display='flex';
  setTimeout(()=>{card.style.transform='translateY(0)';},10);
  document.body.style.overflow='hidden';
}
function closeTrendingModal(){
  const modal=document.getElementById('TRENDING_MODAL');
  const card=document.getElementById('TRENDING_MODAL_CARD');
  card.style.transform='translateY(24px)';
  setTimeout(()=>{modal.style.display='none';document.body.style.overflow='';},280);
}
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeTrendingModal();});





(function(){
  var logoHTML = `
  <div class="pd-logo-badge">
    <svg viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect class="pd-logo-bar pd-logo-bar1" x="4" y="16" width="4" height="14" rx="1" fill="rgba(255,255,255,.12)"/>
      <rect class="pd-logo-bar pd-logo-bar2" x="10" y="11" width="4" height="19" rx="1" fill="rgba(255,255,255,.16)"/>
      <rect class="pd-logo-bar pd-logo-bar3" x="16" y="13" width="4" height="17" rx="1" fill="rgba(255,255,255,.13)"/>
      <rect class="pd-logo-bar pd-logo-bar4" x="22" y="7" width="4" height="23" rx="1" fill="rgba(255,255,255,.2)"/>
      <rect class="pd-logo-bar pd-logo-bar5" x="28" y="9" width="4" height="21" rx="1" fill="rgba(255,255,255,.16)"/>
      <polyline class="pd-logo-line" points="5,22 12,16 18,20 24,9 31,12" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
      <circle class="pd-logo-dot pd-logo-dot1" cx="5" cy="22" r="1.5" fill="rgba(255,255,255,.5)"/>
      <circle class="pd-logo-dot pd-logo-dot2" cx="12" cy="16" r="1.5" fill="rgba(255,255,255,.6)"/>
      <circle class="pd-logo-dot pd-logo-dot3" cx="18" cy="20" r="1.5" fill="rgba(255,255,255,.5)"/>
      <circle class="pd-logo-dot pd-logo-dot4" cx="24" cy="9" r="2.5" fill="white"/>
      <circle class="pd-logo-dot pd-logo-dot5" cx="31" cy="12" r="1.5" fill="rgba(255,255,255,.6)"/>
      <g class="pd-logo-arrow">
        <line x1="24" y1="5" x2="24" y2="2" stroke="#00e8a2" stroke-width="1.5" stroke-linecap="round"/>
        <polyline points="22,4 24,1 26,4" fill="none" stroke="#00e8a2" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </g>
    </svg>
  </div>
  <div class="pd-wordmark">
    <div class="pd-name-row">
      <span class="pd-word-public">Public</span><span class="pd-word-drop">DROP</span>
    </div>
    <div class="pd-tagline"><span class="pd-live-dot"></span>Crypto Analytics</div>
  </div>`;

  
  var navLogo = document.getElementById('PD_LOGO_WRAP');
  if(navLogo) navLogo.innerHTML = logoHTML;

  
  var amLogo = document.getElementById('AM_LOGO_WRAP');
  if(amLogo) amLogo.innerHTML = logoHTML;
})();
