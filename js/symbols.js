// @ts-check
// 500+ liquid US symbols — grouped by sector for event targeting
export const SECTORS = {
  tech: ['AAPL','MSFT','GOOGL','GOOG','META','NVDA','AMD','INTC','CRM','ORCL','ADBE','CSCO','AVGO','QCOM','TXN','IBM','NOW','INTU','AMAT','MU','LRCX','KLAC','SNPS','CDNS','PANW','CRWD','SNOW','PLTR','NET','DDOG','ZS','MDB','TEAM','WDAY','ADSK','ANSS','FTNT','GEN','HPQ','HPE','DELL','DELL','KEYS','MPWR','ON','SWKS','QRVO','MRVL','ARM','SMCI','DELL'],
  finance: ['JPM','BAC','WFC','C','GS','MS','BLK','SCHW','AXP','COF','USB','PNC','TFC','BK','STT','CME','ICE','SPGI','MCO','MSCI','CB','PGR','TRV','ALL','AIG','MET','PRU','AFL','MMC','AON','WTW','FIS','FISV','GPN','V','MA','PYPL','SQ','COIN','HOOD'],
  healthcare: ['UNH','JNJ','LLY','PFE','ABBV','MRK','TMO','ABT','DHR','BMY','AMGN','GILD','VRTX','REGN','ISRG','MDT','SYK','BSX','EW','ZBH','BDX','CI','ELV','HUM','CVS','MCK','CAH','COR','GEHC','DXCM','IDXX','IQV','A','HCA','BIIB','MRNA','ZTS','ALGN','HOLX','TECH'],
  consumer: ['AMZN','TSLA','HD','MCD','NKE','SBUX','LOW','TJX','BKNG','MAR','HLT','CMG','YUM','DPZ','ROST','ORLY','AZO','BBY','DG','DLTR','TGT','WMT','COST','KR','EL','PG','KO','PEP','MDLZ','KHC','CL','KMB','CHD','CLX','HSY','MNST','STZ','TAP','BF.B','PM','MO','KDP'],
  energy: ['XOM','CVX','COP','SLB','EOG','MPC','PSX','VLO','OXY','HAL','BKR','DVN','FANG','HES','KMI','WMB','OKE','TRGP','ET','EPD','MPLX','APA','CTRA','EQT','OVV','PR','AR','RRC','SWN','NOV','FTI','CHX','LBRT','HP','PTEN','VAL','NE','DO','RIG','SDRL','WFRD'],
  industrial: ['CAT','DE','BA','GE','HON','UNP','UPS','RTX','LMT','NOC','GD','TDG','ETN','EMR','ITW','PH','ROK','CMI','PCAR','FAST','GWW','URI','VRSK','CSX','NSC','FDX','DAL','UAL','LUV','AAL','WM','RSG','WCN','CARR','OTIS','JCI','TT','IR','DOV','XYL','IEX','PNR','AOS','SWK','GNRC','HUBB','EME','J','PWR','FIX'],
  materials: ['LIN','APD','SHW','ECL','FCX','NEM','NUE','STLD','VMC','MLM','DOW','DD','PPG','ALB','CE','CF','MOS','FMC','IFF','EMN','PKG','IP','WRK','AVY','BLL','AMCR','CCK','SON','SEE','OLN','HUN','WLK','LYB','RPM','ASH','FUL','KWR','CBT','NGVT','CC','MTX'],
  telecom: ['T','VZ','TMUS','CMCSA','CHTR','DIS','NFLX','WBD','PARA','FOX','FOXA','OMC','IPG','LYV','MTCH','PINS','SNAP','RDDT','SPOT','ROKU','TTWO','EA','ATVI','U','RBLX','ZG','Z','EXPE','ABNB','BKNG','MAR','HLT','CCL','RCL','NCLH','LVS','MGM','WYNN','CZR','PENN'],
  reit: ['AMT','PLD','EQIX','PSA','SPG','O','WELL','DLR','AVB','EQR','VTR','ARE','SBAC','CCI','EXR','MAA','UDR','ESS','INVH','SUI','ELS','CPT','KIM','REG','FRT','BXP','SLG','VNO','HST','PEAK','DOC','HR','OHI','MPW','VICI','GLPI','STAG','NNN','ADC','EPRT'],
  etf: ['SPY','QQQ','IWM','DIA','VTI','VOO','VEA','VWO','EFA','EEM','XLK','XLF','XLE','XLV','XLI','XLY','XLP','XLU','XLB','XLRE','ARKK','ARKG','ARKW','SOXX','SMH','IBB','XBI','TLT','HYG','LQD','GLD','SLV','USO','UNG','VXX','UVXY','TQQQ','SQQQ','SPXL','SPXS'],
  growth: ['SHOP','SE','MELI','ABNB','UBER','LYFT','DASH','RIVN','LCID','NIO','XPEV','LI','SOFI','UPST','AFRM','OPEN','RDFN','CVNA','W','ETSY','EBAY','WIX','DOCU','OKTA','HUBS','BILL','U','PATH','AI','BBAI','SOUN','IONQ','RGTI','QBTS','SMCI','VST','CEG','FSLR','ENPH','SEDG','RUN','PLUG','BE','CHPT','BLNK'],
  midcap: ['WYNN','LULU','DECK','ONON','BIRK','CROX','SKX','TPR','RL','PVH','VFC','HBI','GPS','ANF','AEO','URBN','BBWI','HAS','MAT','NWL','HELE','LEG','TPX','MHK','FBHS','MAS','SWK','SNA','IT','CTSH','ACN','EPAM','GLOB','BR','FDS','MSCI','NDAQ','CBOE','NDSN','IEX','GNRC','AIT','AIT','GWW','FAST','WSO','AIT'],
  sp500extra: ['BRK.B','LLY','AVGO','PEP','COST','MRK','TMO','ACN','DHR','VZ','ADP','NEE','PM','TXN','HON','UNP','LOW','UPS','BMY','QCOM','SPGI','INTU','AMGN','DE','AXP','SBUX','GILD','MDLZ','ADI','ISRG','REGN','VRTX','LRCX','KLAC','PANW','SNPS','CDNS','MELI','EQIX','CSX','WM','MAR','ORLY','ABNB','MCK','CI','ELV','ZTS','CME','ICE','SHW','CL','APD','ECL','NOC','GD','LMT','RTX','NEM','FCX','PSA','PLD','AMT','CCI','O','VICI','KMB','SYY','KR','GIS','K','HSY','CLX','CHD','EL','MNST','KHC','KDP','STZ','BF.B','TAP','MO','DG','DLTR','ROST','TJX','BBY','AZO','GPC','AAP','LKQ','POOL','WSM','RH','WHR','MHK','LEG','TPX','FBHS','MAS','SNA','IT','CTSH','EPAM','GLOB','BR','FDS','NDAQ','CBOE','NDSN','GNRC','AIT','WSO','URI','VRSK','NSC','JBLU','ALK','HA','SAVE','JETS','EMR','ITW','PH','ROK','CMI','PCAR','RSG','WCN','CARR','OTIS','JCI','TT','IR','DOV','XYL','PNR','AOS','HUBB','EME','J','PWR','NUE','STLD','VMC','MLM','DOW','DD','PPG','ALB','CE','CF','MOS','FMC','IFF','EMN','PKG','IP','AVY','AMCR','CCK','SON','SEE','OLN','HUN','WLK','LYB','RPM','ASH','FUL','KWR','CBT','NGVT','CC','MTX'],
  automotive: ['F','GM','HMC','TM','STLA','RACE','LCID','RIVN','NIO','XPEV','LI','FSR','GOEV','FFIE','NKLA','RIDE','WKHS','CHPT','BLNK','QS','LAZR','MVST','ALB','APTV','BWA','LEA','GNTX','PHIN'],
  apparel: ['ADDYY','LULU','DECK','ONON','UAA','VFC','PVH','HBI','CROX','SKX','TPR','RL','GPS','ANF','AEO','URBN','BBWI','HAS','MAT','NWL','HELE','BIRK'],
  space: ['RKLB','ASTS','LUNR','SPCE','RDW','IRDM','BA','LMT','NOC','RTX','GD','TDG','HEI','AJRD','KTOS','PL','SPIR','BKSY','SATL','LLAP'],
  penny: ['SNDL','AMC','GME','BBAI','SOUN','IONQ','QBTS','RGTI','MULN','CLOV','GSAT','BB','NOK','RIOT','MARA','CLSK','HUT','BITF','CAN','CORZ','WISH','ATER','OPEN','HOOD','SOFI','PLUG','BE','RUN','TELL','RIG','SDRL','WTI','BORR','DNMR','GOVX','IMPP','INDO','REVB','MULN','FFIE','NKLA','GOEV'],
  international: ['TSM','ASML','BABA','JD','PDD','NVO','SAP','SNY','UL','DEO','SONY','BP','SHEL','RIO','VALE','BTI','DEO','ING','SAN','BBVA','NMR','MUFG','SMFG','HDB','IBN','TCEHY','NTES','BIDU','LI','XPEV','NIO','MELI','SE','GRAB','CPNG'],
  food: ['YUM','DPZ','WEN','JACK','CAKE','DENN','WING','CMG','MCD','SBUX','QSR','DPZ','PZZA','EAT','DIN','TXRH','BLMN','DRI','PLAY'],
  cannabis: ['TLRY','CGC','ACB','CRON','SNDL','OGI','HEXO','GTBIF','TCNNF','CURLF'],
};

export const ALL_SYMBOLS = [...new Set(Object.values(SECTORS).flat())];

export const SYMBOL_NAMES = {
  AAPL:'Apple',MSFT:'Microsoft',GOOGL:'Alphabet',GOOG:'Alphabet C',META:'Meta',NVDA:'NVIDIA',AMD:'AMD',INTC:'Intel',
  TSLA:'Tesla',AMZN:'Amazon',JPM:'JPMorgan',BAC:'Bank of America',XOM:'Exxon Mobil',CVX:'Chevron',UNH:'UnitedHealth',
  JNJ:'Johnson & Johnson',V:'Visa',MA:'Mastercard',WMT:'Walmart',HD:'Home Depot',PG:'Procter & Gamble',DIS:'Disney',
  NFLX:'Netflix',BA:'Boeing',CAT:'Caterpillar',GS:'Goldman Sachs',ORLY:'O\'Reilly Auto',SPY:'S&P 500 ETF',QQQ:'Nasdaq ETF',
  CRM:'Salesforce',ORCL:'Oracle',ADBE:'Adobe',CSCO:'Cisco',AVGO:'Broadcom',QCOM:'Qualcomm',TXN:'Texas Instruments',
  IBM:'IBM',NOW:'ServiceNow',INTU:'Intuit',MU:'Micron',LRCX:'Lam Research',PANW:'Palo Alto',CRWD:'CrowdStrike',
  SNOW:'Snowflake',PLTR:'Palantir',NET:'Cloudflare',COIN:'Coinbase',HOOD:'Robinhood',PYPL:'PayPal',SQ:'Block',
  SHOP:'Shopify',UBER:'Uber',ABNB:'Airbnb',RIVN:'Rivian',NIO:'NIO',SOFI:'SoFi',PLUG:'Plug Power',ENPH:'Enphase',
  FSLR:'First Solar',LLY:'Eli Lilly',PFE:'Pfizer',ABBV:'AbbVie',MRK:'Merck',TMO:'Thermo Fisher',AMGN:'Amgen',
  GILD:'Gilead',VRTX:'Vertex',REGN:'Regeneron',ISRG:'Intuitive Surgical',MRNA:'Moderna',BIIB:'Biogen',
  COP:'ConocoPhillips',SLB:'Schlumberger',EOG:'EOG Resources',MPC:'Marathon Petroleum',OXY:'Occidental',
  LIN:'Linde',FCX:'Freeport-McMoRan',NEM:'Newmont',DE:'Deere',HON:'Honeywell',UPS:'UPS',RTX:'RTX',LMT:'Lockheed',
  NKE:'Nike',SBUX:'Starbucks',MCD:'McDonald\'s',COST:'Costco',TGT:'Target',LOW:'Lowe\'s',TJX:'TJX Companies',
  CL:'Colgate-Palmolive',KMB:'Kimberly-Clark',CLX:'Clorox',KHC:'Kraft Heinz',MDLZ:'Mondelez',HSY:'Hershey',
  VTR:'Ventas',O:'Realty Income',WELL:'Welltower',VICI:'VICI Properties',PSA:'Public Storage',
  BKNG:'Booking',MAR:'Marriott',CMG:'Chipotle',EL:'Estée Lauder',KO:'Coca-Cola',PEP:'PepsiCo',PM:'Philip Morris',
  T:'AT&T',VZ:'Verizon',TMUS:'T-Mobile',CMCSA:'Comcast',CHTR:'Charter',WBD:'Warner Bros',ROKU:'Roku',
  SPOT:'Spotify',EA:'Electronic Arts',TTWO:'Take-Two',CCL:'Carnival',MGM:'MGM Resorts',
  AMT:'American Tower',PLD:'Prologis',EQIX:'Equinix',CCI:'Crown Castle',SPG:'Simon Property',
  BRK:'Berkshire',BLK:'BlackRock',SCHW:'Charles Schwab',AXP:'American Express',C:'Citigroup',MS:'Morgan Stanley',
  CME:'CME Group',ICE:'Intercontinental',SPGI:'S&P Global',CB:'Chubb',MET:'MetLife',PRU:'Prudential',
  DAL:'Delta',UAL:'United Airlines',LUV:'Southwest',AAL:'American Airlines',FDX:'FedEx',CSX:'CSX',UNP:'Union Pacific',
  IWM:'Russell 2000 ETF',DIA:'Dow ETF',VTI:'Vanguard Total',VOO:'Vanguard S&P',XLK:'Tech ETF',XLF:'Finance ETF',
  XLE:'Energy ETF',XLV:'Health ETF',ARKK:'ARK Innovation',SOXX:'Semiconductor ETF',GLD:'Gold ETF',TQQQ:'3× Nasdaq',
  F:'Ford',GM:'General Motors',HMC:'Honda',TM:'Toyota',STLA:'Stellantis',RACE:'Ferrari',ADDYY:'Adidas',
  RKLB:'Rocket Lab',ASTS:'AST SpaceMobile',LUNR:'Intuitive Machines',SPCE:'Virgin Galactic',RDW:'Redwire',
  IRDM:'Iridium',SNDL:'Sundial Growers',AMC:'AMC Entertainment',GME:'GameStop',BBAI:'BigBear.ai',SOUN:'SoundHound',
  MULN:'Mullen Automotive',CLOV:'Clover Health',GSAT:'Globalstar',BB:'BlackBerry',NOK:'Nokia',RIOT:'Riot Platforms',
  MARA:'Marathon Digital',CLSK:'CleanSpark',HUT:'Hut 8',BITF:'Bitfarms',CAN:'Canaan',CORZ:'Core Scientific',
  FFIE:'Faraday Future',NKLA:'Nikola',GOEV:'Canoo',WISH:'ContextLogic',ATER:'Aterian',TSM:'Taiwan Semi',
  ASML:'ASML',BABA:'Alibaba',JD:'JD.com',PDD:'Pinduoduo',NVO:'Novo Nordisk',SAP:'SAP',SNY:'Sanofi',
  UL:'Unilever',DEO:'Diageo',SONY:'Sony',BP:'BP',SHEL:'Shell',RIO:'Rio Tinto',VALE:'Vale',LULU:'Lululemon',
  DECK:'Deckers',ONON:'On Holding',UAA:'Under Armour',VFC:'VF Corp',CROX:'Crocs',SKX:'Skechers',TPR:'Tapestry',
  RL:'Ralph Lauren',FSR:'Fisker',QS:'QuantumScape',LAZR:'Luminar',APTV:'Aptiv',BWA:'BorgWarner',LEA:'Lear',
  HEI:'HEICO',KTOS:'Kratos',SPIR:'Spire Global',BKSY:'BlackSky',SATL:'Satellogic',TLRY:'Tilray',CGC:'Canopy Growth',
  YUM:'Yum Brands',DPZ:'Dominos',WEN:'Wendys',WING:'Wingstop',QSR:'Restaurant Brands',GRAB:'Grab',CPNG:'Coupang',
};

export function getSymbolName(sym) {
  return SYMBOL_NAMES[sym] || sym;
}

export function getSymbolSector(sym) {
  for (const [sector, syms] of Object.entries(SECTORS)) {
    if (syms.includes(sym)) return sector;
  }
  return 'tech';
}

/** Index membership */
const DOW30 = new Set(['AAPL','MSFT','UNH','GS','HD','CAT','MCD','AMGN','V','BA','CRM','TRV','AXP','JPM','IBM','JNJ','WMT','CVX','NKE','MRK','DIS','KO','CSCO','PG','DOW','MMM','INTC','VZ','WBA','HON']);
const NASDAQ100 = new Set(['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AVGO','COST','NFLX','AMD','PEP','ADBE','CSCO','TMUS','INTC','CMCSA','TXN','QCOM','AMGN','INTU','AMAT','ISRG','BKNG','ADP','SBUX','GILD','ADI','VRTX','PANW','MU','LRCX','REGN','KLAC','SNPS','CDNS','MELI','CRWD','PYPL','ASML','ABNB','MAR','ORLY','CTAS','CSX','NXPI','MRVL','FTNT','DASH','PCAR','ADSK','ROP','AEP','WDAY','CPRT','PAYX','ROST','FAST','KDP','ODFL','EA','VRSK','CTSH','EXC','XEL','GEHC','BKR','FANG','ON','DDOG','TEAM','ZS','MDB','TTD','ANSS','CDW','TTWO','ILMN','WBD','ALGN','IDXX','DXCM','BIIB','GFS','ARM','SMCI','PLTR','SHOP']);
const SP500_CORE = new Set([...DOW30, ...NASDAQ100, 'XOM','JPM','V','MA','PG','KO','PEP','WMT','CVX','ABBV','LLY','MRK','TMO','ACN','DHR','NEE','LIN','PM','RTX','LOW','UPS','SPY','BRK.B']);

const TAG_MAP = {
  AAPL: ['Mega cap', 'Consumer tech', 'iPhone'],
  MSFT: ['Mega cap', 'Cloud', 'AI infra'],
  NVDA: ['Mega cap', 'Semis', 'AI infra'],
  GOOGL: ['Mega cap', 'Ads', 'Cloud'],
  GOOG: ['Mega cap', 'Ads', 'Cloud'],
  META: ['Mega cap', 'Social', 'Ads'],
  AMZN: ['Mega cap', 'E-commerce', 'Cloud'],
  TSLA: ['Mega cap', 'EV', 'Energy'],
  AMD: ['Large cap', 'Semis', 'CPUs'],
  NFLX: ['Large cap', 'Streaming'],
  AVGO: ['Mega cap', 'Semis'],
  INTC: ['Large cap', 'Semis'],
  COIN: ['Mid cap', 'Crypto'],
  PLTR: ['Large cap', 'Software', 'AI'],
  SPY: ['ETF', 'S&P 500'],
  QQQ: ['ETF', 'Nasdaq-100'],
  DIA: ['ETF', 'Dow 30'],
  IWM: ['ETF', 'Russell 2000'],
  JPM: ['Mega cap', 'Banks'],
  XOM: ['Mega cap', 'Energy'],
  UNH: ['Mega cap', 'Healthcare'],
};

const COLOR_PALETTE = ['#3b82f6','#22c55e','#a855f7','#f59e0b','#ef4444','#06b6d4','#ec4899','#84cc16','#6366f1','#14b8a6'];

export function getSymbolMeta(sym) {
  sym = (sym || '').toUpperCase();
  const sector = getSymbolSector(sym);
  const name = getSymbolName(sym);
  const indices = [];
  if (DOW30.has(sym)) indices.push('Dow 30');
  if (NASDAQ100.has(sym)) indices.push('NASDAQ');
  if (SP500_CORE.has(sym) || DOW30.has(sym) || NASDAQ100.has(sym)) indices.push('S&P 500');
  if (sector === 'etf') indices.push('ETF');
  if (!indices.length) {
    if (['finance', 'healthcare', 'energy', 'industrial', 'consumer', 'materials', 'reit'].includes(sector)) indices.push('NYSE');
    else indices.push('NASDAQ');
  }

  const exchange = ['AAPL','MSFT','NVDA','AMZN','META','GOOGL','GOOG','TSLA','AMD','NFLX','INTC','CSCO','AVGO','QCOM','ADBE','CRM','COST','PEP'].includes(sym)
    || NASDAQ100.has(sym)
    ? 'NASDAQ'
    : (sector === 'etf' ? 'ARCA' : 'NYSE');

  const cleanIndices = [...new Set(indices.filter(i => i !== 'NYSE'))];
  if (!cleanIndices.length) cleanIndices.push(exchange);

  let tags = TAG_MAP[sym];
  if (!tags) {
    tags = [];
    if (sector === 'tech') tags.push('Tech');
    else if (sector === 'finance') tags.push('Finance');
    else if (sector === 'healthcare') tags.push('Health');
    else if (sector === 'energy') tags.push('Energy');
    else if (sector === 'growth') tags.push('Growth');
    else if (sector === 'etf') tags.push('ETF');
    else tags.push(sector.charAt(0).toUpperCase() + sector.slice(1));
    if (cleanIndices.includes('Dow 30')) tags.unshift('Dow 30');
    else if (cleanIndices.includes('S&P 500')) tags.unshift('S&P 500');
    else if (cleanIndices.includes('NASDAQ')) tags.unshift('NASDAQ');
  }

  const color = COLOR_PALETTE[sym.charCodeAt(0) % COLOR_PALETTE.length];
  const letter = sym.charAt(0);

  return {
    sym, name, sector, exchange,
    indices: cleanIndices.slice(0, 3),
    tags: tags.slice(0, 3),
    color, letter,
  };
}

export function getRandomSymbols(count) {
  const pool = [...ALL_SYMBOLS];
  const out = [];
  while (out.length < count && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

/** Map common company-name searches to tickers (e.g. "google" → GOOGL). */
const TICKER_ALIASES = {
  GOOGLE: 'GOOGL',
  GOOGLEINC: 'GOOGL',
  ALPHABET: 'GOOGL',
  FACEBOOK: 'META',
  FB: 'META',
  BERKSHIRE: 'BRK.B',
  BRKB: 'BRK.B',
  TESLA: 'TSLA',
  APPLE: 'AAPL',
  MICROSOFT: 'MSFT',
  AMAZON: 'AMZN',
  NVIDIA: 'NVDA',
  NETFLIX: 'NFLX',
};

/** Normalize free-text / Go-box input to a ticker when possible. */
export function resolveTickerInput(raw) {
  const cleaned = (raw || '').trim().toUpperCase().replace(/[^A-Z0-9.]/g, '');
  if (!cleaned) return '';
  if (TICKER_ALIASES[cleaned]) return TICKER_ALIASES[cleaned];
  if (cleaned.startsWith('GOOGLE')) return 'GOOGL';
  return cleaned;
}

export function searchSymbols(query, limit = 40) {
  const q = (query || '').trim().toUpperCase();
  if (!q || q.length < 1) return [];
  const out = [];
  const seen = new Set();
  const push = (sym) => {
    if (!sym || seen.has(sym) || out.length >= limit) return;
    seen.add(sym);
    out.push(sym);
  };
  const alias = resolveTickerInput(q);
  if (alias && ALL_SYMBOLS.includes(alias)) push(alias);
  const sectorHits = new Set();
  for (const [sector, syms] of Object.entries(SECTORS)) {
    if (sector.includes(q) || q.includes(sector.slice(0, 4))) syms.forEach(s => sectorHits.add(s));
  }
  for (const sym of ALL_SYMBOLS) {
    if (out.length >= limit) break;
    const name = (SYMBOL_NAMES[sym] || '').toUpperCase();
    if (sym.includes(q) || name.includes(q) || sectorHits.has(sym)) push(sym);
  }
  return out;
}

export function getSymbolCount() {
  return ALL_SYMBOLS.length;
}
