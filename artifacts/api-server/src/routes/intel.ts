import { Router } from "express";
import { logger } from "../lib/logger";
import { getAllAlerts } from "./alerts";

const router = Router();

// ── Financial data ─────────────────────────────────────────────────────────────

interface FinancialQuote {
  key: string;
  label: string;
  symbol: string;
  price: number | null;
  changePercent: number | null;
  currency: string;
}

async function fetchYahooChart(
  symbol: string,
): Promise<{ price: number; changePercent: number; currency: string } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&includePrePost=false`;
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "application/json",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const meta = result.meta;
    const price = meta?.regularMarketPrice;
    if (!price || isNaN(price)) return null;
    const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
    const changePercent = prevClose ? ((price - prevClose) / prevClose) * 100 : 0;
    return { price, changePercent, currency: meta?.currency ?? "USD" };
  } catch {
    return null;
  }
}

async function fetchCoinbasePrice(pair: string): Promise<number | null> {
  try {
    const res = await fetch(`https://api.coinbase.com/v2/prices/${pair}/spot`, {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const price = parseFloat(json?.data?.amount);
    return isNaN(price) ? null : price;
  } catch {
    return null;
  }
}

async function fetchFearGreed(): Promise<{ value: number; label: string } | null> {
  try {
    const res = await fetch("https://api.alternative.me/fng/?limit=1", {
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as any;
    const d = json?.data?.[0];
    if (!d) return null;
    return { value: parseInt(d.value, 10), label: d.value_classification };
  } catch {
    return null;
  }
}

const SYMBOL_GROUPS = [
  { key: "sp500",    sym: "^GSPC",     label: "S&P 500",     type: "indices" },
  { key: "nasdaq",   sym: "^IXIC",     label: "NASDAQ",      type: "indices" },
  { key: "dow",      sym: "^DJI",      label: "Dow Jones",   type: "indices" },
  { key: "ftse",     sym: "^FTSE",     label: "FTSE 100",    type: "indices" },
  { key: "dax",      sym: "^GDAXI",    label: "DAX",         type: "indices" },
  { key: "nikkei",   sym: "^N225",     label: "Nikkei 225",  type: "indices" },
  { key: "shanghai", sym: "000001.SS", label: "Shanghai",    type: "indices" },
  { key: "sensex",   sym: "^BSESN",   label: "Sensex",      type: "indices" },
  { key: "tasi",     sym: "^TASI.SR", label: "Tadawul",     type: "indices" },
  { key: "gold",     sym: "GC=F",      label: "Gold",        type: "commodities" },
  { key: "silver",   sym: "SI=F",      label: "Silver",      type: "commodities" },
  { key: "wti",      sym: "CL=F",      label: "WTI Crude",   type: "commodities" },
  { key: "brent",    sym: "BZ=F",      label: "Brent Crude", type: "commodities" },
  { key: "natgas",   sym: "NG=F",      label: "Natural Gas", type: "commodities" },
  { key: "copper",   sym: "HG=F",      label: "Copper",      type: "commodities" },
  { key: "wheat",    sym: "ZW=F",      label: "Wheat",       type: "commodities" },
  { key: "corn",     sym: "ZC=F",      label: "Corn",        type: "commodities" },
  { key: "eurusd",   sym: "EURUSD=X",  label: "EUR/USD",     type: "fx" },
  { key: "gbpusd",   sym: "GBPUSD=X",  label: "GBP/USD",     type: "fx" },
  { key: "usdjpy",   sym: "USDJPY=X",  label: "USD/JPY",     type: "fx" },
  { key: "usdcny",   sym: "USDCNY=X",  label: "USD/CNY",     type: "fx" },
  { key: "usdsar",   sym: "USDSAR=X",  label: "USD/SAR",     type: "fx" },
  { key: "usdrub",   sym: "USDRUB=X",  label: "USD/RUB",     type: "fx" },
  { key: "usdtry",   sym: "USDTRY=X",  label: "USD/TRY",     type: "fx" },
  { key: "usdinr",   sym: "USDINR=X",  label: "USD/INR",     type: "fx" },
  { key: "vix",      sym: "^VIX",      label: "VIX",         type: "macro" },
  { key: "us10y",    sym: "^TNX",      label: "US 10Y Yield", type: "macro" },
  { key: "dxy",      sym: "DX-Y.NYB",  label: "DXY Dollar",  type: "macro" },
  { key: "eth",      sym: "ETH-USD",   label: "Ethereum",    type: "crypto" },
  { key: "sol",      sym: "SOL-USD",   label: "Solana",      type: "crypto" },
] as const;

// 10-minute cache for financial data
let finCache: { data: any; timestamp: number } | null = null;
const FIN_TTL = 10 * 60 * 1000;

async function getFinancialData() {
  const now = Date.now();
  if (finCache && now - finCache.timestamp < FIN_TTL) return finCache.data;

  const [fearGreed, btcPrice, ...yahooSettled] = await Promise.allSettled([
    fetchFearGreed(),
    fetchCoinbasePrice("BTC-USD"),
    ...SYMBOL_GROUPS.map((s) => fetchYahooChart(s.sym)),
  ]);

  const buckets: Record<string, FinancialQuote[]> = {
    indices: [], commodities: [], fx: [], macro: [], crypto: [],
  };

  // BTC from Coinbase
  const btcVal = btcPrice.status === "fulfilled" ? btcPrice.value : null;
  buckets.crypto.push({
    key: "btc", label: "Bitcoin", symbol: "BTC-USD",
    price: btcVal, changePercent: null, currency: "USD",
  });

  SYMBOL_GROUPS.forEach((s, i) => {
    const result = yahooSettled[i];
    const q = result.status === "fulfilled" ? result.value : null;
    const bucket = buckets[s.type] ?? buckets.macro;
    bucket.push({
      key: s.key, label: s.label, symbol: s.sym,
      price: q?.price ?? null,
      changePercent: q?.changePercent ?? null,
      currency: q?.currency ?? "USD",
    });
  });

  const data = {
    ...buckets,
    fearGreed: fearGreed.status === "fulfilled" ? fearGreed.value : null,
    updatedAt: new Date().toISOString(),
  };

  finCache = { data, timestamp: now };
  return data;
}

// ── Country risk scoring ───────────────────────────────────────────────────────

const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 20, high: 8, medium: 3, low: 1,
};

const COUNTRY_ASSETS: Record<string, string[]> = {
  "united states": ["sp500", "nasdaq", "dow", "vix", "us10y", "dxy"],
  usa:             ["sp500", "nasdaq", "dow", "vix", "us10y", "dxy"],
  "united kingdom": ["ftse", "gbpusd"],
  britain:          ["ftse", "gbpusd"],
  uk:               ["ftse", "gbpusd"],
  germany:          ["dax", "eurusd"],
  france:           ["eurusd", "dax"],
  europe:           ["eurusd", "dax", "ftse"],
  japan:            ["nikkei", "usdjpy"],
  china:            ["shanghai", "usdcny"],
  india:            ["sensex", "usdinr"],
  russia:           ["usdrub", "brent", "natgas"],
  ukraine:          ["wheat", "natgas", "eurusd"],
  "saudi arabia":   ["tasi", "wti", "brent", "usdsar"],
  uae:              ["wti", "brent", "usdsar"],
  iran:             ["wti", "brent"],
  iraq:             ["wti", "brent"],
  turkey:           ["usdtry"],
  "south korea":    ["usdjpy"],
};

function matchCountryAssets(countryName: string): string[] {
  const lower = countryName.toLowerCase();
  for (const [key, assets] of Object.entries(COUNTRY_ASSETS)) {
    if (lower.includes(key) || key.includes(lower)) return assets;
  }
  return ["sp500", "gold", "wti", "vix"];
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/intel/financial", async (req, res) => {
  try {
    const data = await getFinancialData();
    res.json(data);
  } catch (err) {
    logger.error({ err }, "Error getting financial data");
    res.status(500).json({ error: "Failed to fetch financial data" });
  }
});

router.get("/intel/country/:country", async (req, res) => {
  try {
    const countryName = decodeURIComponent(req.params.country);
    const lower = countryName.toLowerCase();
    const words = lower.split(/\s+/).filter((w) => w.length > 4);

    const [allAlerts, financialData] = await Promise.all([
      getAllAlerts(),
      getFinancialData(),
    ]);

    const countryAlerts = allAlerts.filter((a) => {
      const text = [a.country, a.region, a.title, a.description]
        .filter(Boolean).join(" ").toLowerCase();
      if (text.includes(lower)) return true;
      if (words.some((w) => text.includes(w))) return true;
      // Also match common country aliases
      const aliases: Record<string, string[]> = {
        "united states": ["u.s.", "usa", "america", "american"],
        "united kingdom": ["u.k.", "britain", "british", "england", "welsh", "scottish"],
        "russia": ["russian", "moscow"],
        "china": ["chinese", "beijing", "ccp"],
        "israel": ["israeli", "tel aviv"],
        "palestine": ["palestinian", "gaza", "west bank"],
        "ukraine": ["ukrainian", "kyiv"],
        "iran": ["iranian", "tehran"],
        "iraq": ["iraqi", "baghdad"],
        "syria": ["syrian", "damascus"],
        "afghanistan": ["afghan", "kabul", "taliban"],
        "north korea": ["dprk", "pyongyang"],
        "south korea": ["korean", "seoul"],
        "myanmar": ["burma", "burmese"],
        "democratic republic of congo": ["drc", "congo kinshasa"],
        "saudi arabia": ["saudi", "riyadh"],
      };
      const lowerName = lower;
      for (const [canonical, aliasList] of Object.entries(aliases)) {
        if (lowerName === canonical || lowerName.includes(canonical) || canonical.includes(lowerName)) {
          if (aliasList.some(al => text.includes(al))) return true;
        }
      }
      return false;
    });

    let rawRisk = 0;
    const byCategory: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    for (const a of countryAlerts) {
      rawRisk += SEVERITY_WEIGHTS[a.severity] ?? 1;
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
    }

    const riskScore = Math.min(100, Math.round(rawRisk * 1.5));
    const riskLevel =
      riskScore >= 75 ? "CRITICAL" :
      riskScore >= 50 ? "HIGH" :
      riskScore >= 25 ? "MODERATE" :
      riskScore >= 10 ? "ELEVATED" : "LOW";

    const assetKeys = matchCountryAssets(countryName);
    const allAssets = [
      ...financialData.indices, ...financialData.commodities,
      ...financialData.fx, ...financialData.macro, ...financialData.crypto,
    ];
    const financialSignals = (allAssets as FinancialQuote[]).filter((a) =>
      assetKeys.includes(a.key)
    );

    res.json({
      country: countryName,
      riskScore,
      riskLevel,
      alertCount: countryAlerts.length,
      byCategory,
      bySeverity,
      alerts: countryAlerts.slice(0, 60),
      financialSignals,
      fearGreed: financialData.fearGreed,
    });
  } catch (err) {
    logger.error({ err }, "Error getting country intelligence");
    res.status(500).json({ error: "Failed to fetch country intelligence" });
  }
});

export default router;
