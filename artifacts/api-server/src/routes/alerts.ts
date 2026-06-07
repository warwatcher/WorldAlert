import { Router } from "express";
import { XMLParser } from "fast-xml-parser";
import { logger } from "../lib/logger";

const router = Router();

interface Alert {
  id: string;
  title: string;
  description: string | null;
  category: "earthquake" | "disaster" | "humanitarian" | "weather" | "conflict" | "health" | "political" | "other";
  severity: "low" | "medium" | "high" | "critical";
  lat: number;
  lng: number;
  country: string | null;
  region: string | null;
  source: string;
  sourceUrl: string;
  publishedAt: string;
  updatedAt: string | null;
  magnitude: number | null;
  affectedPopulation: number | null;
}

let cache: { data: Alert[]; timestamp: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Text utilities ────────────────────────────────────────────────────────────

function cleanText(str: string): string {
  if (!str) return str;
  return str
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#\d+;/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanEONETTitle(title: string): string {
  return title
    .replace(/\bRX\b/g, "Prescribed Burn")
    .replace(/\bWUI\b/g, "Wildland-Urban Interface")
    .replace(/\bRx\b/g, "Prescribed")
    .replace(/\s+\(\d+\)\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function titleCase(str: string): string {
  return str.replace(/\b\w/g, (c) => c.toUpperCase());
}

function simpleHash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h) ^ str.charCodeAt(i);
    h = h >>> 0;
  }
  return h.toString(36);
}

// ── Severity helpers ──────────────────────────────────────────────────────────

function magnitudeToSeverity(mag: number): Alert["severity"] {
  if (mag >= 7.0) return "critical";
  if (mag >= 6.0) return "high";
  if (mag >= 5.0) return "medium";
  return "low";
}

// ── Country geocoding ─────────────────────────────────────────────────────────

const COUNTRY_COORDS: Record<string, [number, number]> = {
  ukraine: [49.0, 32.0],
  russia: [61.5, 105.3],
  israel: [31.5, 34.8],
  palestine: [31.9, 35.2],
  "gaza strip": [31.35, 34.35],
  gaza: [31.35, 34.35],
  "west bank": [31.9, 35.2],
  syria: [34.8, 38.9],
  iran: [32.4, 53.7],
  iraq: [33.2, 43.7],
  yemen: [15.6, 48.5],
  sudan: [15.0, 30.0],
  myanmar: [19.2, 96.7],
  "south sudan": [7.9, 30.3],
  ethiopia: [9.1, 40.5],
  somalia: [5.2, 46.2],
  mali: [17.6, -4.0],
  "burkina faso": [12.4, -1.6],
  niger: [17.6, 8.1],
  chad: [15.5, 18.7],
  nigeria: [9.1, 8.7],
  drc: [-4.0, 21.8],
  "democratic republic of the congo": [-4.0, 21.8],
  "dr congo": [-4.0, 21.8],
  congo: [-4.0, 21.8],
  afghanistan: [33.9, 67.7],
  pakistan: [30.4, 69.3],
  india: [20.6, 79.0],
  china: [35.9, 104.2],
  taiwan: [23.7, 121.0],
  "north korea": [40.3, 127.5],
  "south korea": [36.0, 128.0],
  japan: [36.2, 138.3],
  "saudi arabia": [24.0, 45.0],
  lebanon: [33.9, 35.5],
  jordan: [31.2, 36.5],
  turkey: [38.9, 35.2],
  türkiye: [38.9, 35.2],
  egypt: [26.8, 30.8],
  libya: [26.3, 17.2],
  tunisia: [33.9, 9.6],
  algeria: [28.0, 1.7],
  morocco: [31.8, -7.1],
  kenya: [-0.0, 37.9],
  tanzania: [-6.4, 34.9],
  mozambique: [-18.7, 35.5],
  zimbabwe: [-19.0, 29.2],
  "south africa": [-30.6, 22.9],
  cameroon: [3.9, 11.5],
  "central african republic": [6.6, 20.9],
  colombia: [4.1, -72.3],
  venezuela: [6.4, -66.6],
  brazil: [-14.2, -51.9],
  mexico: [23.6, -102.6],
  haiti: [18.9, -72.3],
  cuba: [22.0, -80.0],
  usa: [37.1, -95.7],
  "united states": [37.1, -95.7],
  uk: [55.4, -3.4],
  "united kingdom": [55.4, -3.4],
  britain: [55.4, -3.4],
  france: [46.2, 2.2],
  germany: [51.2, 10.5],
  poland: [51.9, 19.1],
  hungary: [47.2, 19.5],
  serbia: [44.0, 21.0],
  kosovo: [42.6, 20.9],
  georgia: [42.3, 43.4],
  armenia: [40.1, 45.0],
  azerbaijan: [40.1, 47.6],
  indonesia: [-0.8, 113.9],
  philippines: [12.9, 121.8],
  "sri lanka": [7.9, 80.7],
  bangladesh: [23.7, 90.4],
  nepal: [28.4, 84.1],
  sahel: [14.0, 2.0],
  "west africa": [12.0, -2.0],
  "middle east": [29.0, 42.0],
  europe: [54.0, 15.0],
  "latin america": [0.0, -60.0],
  africa: [0.0, 20.0],
  "east africa": [1.0, 35.0],
  "horn of africa": [8.0, 45.0],
  "the balkans": [43.0, 19.0],
  "haiti": [18.9, -72.3],
  nicaragua: [12.6, -85.2],
  "el salvador": [13.7, -88.9],
  guatemala: [15.8, -90.2],
  honduras: [15.2, -86.2],
  peru: [-9.2, -75.0],
  chile: [-35.7, -71.5],
  eritrea: [15.2, 39.8],
  burundi: [-3.4, 29.9],
  "central asia": [41.0, 63.0],
  serbia: [44.0, 21.0],
};

function geocodeText(text: string): [number, number] | null {
  const lower = text.toLowerCase();
  // Longer keys first to avoid partial matches (e.g. "south sudan" before "sudan")
  const sorted = Object.entries(COUNTRY_COORDS).sort((a, b) => b[0].length - a[0].length);
  for (const [country, coords] of sorted) {
    if (lower.includes(country)) return coords;
  }
  return null;
}

// ── Category / severity detection ─────────────────────────────────────────────

function detectConflictCategory(text: string): Alert["category"] {
  const t = text.toLowerCase();
  if (/\b(war|battle|troops|military|air.?strike|bomb|missile|soldiers|ceasefire|shelling|invasion|offensive|gunfire|casualties|dead|death|hostage|terror(ist)?|explosion|blast|drone.?strike|combat|forces|army|naval|siege|ambush|armed|shooting|killed|massacre)\b/.test(t))
    return "conflict";
  if (/\b(election|coup|sanction|parliament|diplomatic|president|prime minister|minister|diplomacy|treaty|border dispute|uprising|revolution|riot|protest|demonstrat|crackdown|opposition|martial law|ceasefire|peace talk)\b/.test(t))
    return "political";
  if (/\b(humanitarian|famine|starvation|food crisis|malnutrition|refugee|displaced|aid worker|relief|evacuation)\b/.test(t))
    return "humanitarian";
  if (/\b(earthquake|quake|tremor|seismic)\b/.test(t)) return "earthquake";
  if (/\b(flood|cyclone|hurricane|typhoon|storm|wildfire|drought|volcano|tsunami|tornado)\b/.test(t)) return "disaster";
  if (/\b(disease|outbreak|epidemic|pandemic|virus|cholera|ebola|malaria|health crisis|hospital)\b/.test(t)) return "health";
  return "other";
}

function detectSeverity(text: string, category: Alert["category"]): Alert["severity"] {
  const t = text.toLowerCase();
  if (/\b(coup|invasion|nuclear|genocid|ethnic cleansing|mass killing|chemical weapon)\b/.test(t)) return "critical";
  if (/\b(dead|killed|casualties|massacre|war|hundreds|thousands|dozens|offensive|shelling|missile.?strike|explosion|bomb|blast)\b/.test(t)) return "high";
  if (category === "conflict") return "high";
  if (category === "political") return "medium";
  return "medium";
}

// ── Data fetchers ─────────────────────────────────────────────────────────────

async function fetchUSGSEarthquakes(): Promise<Alert[]> {
  try {
    const url =
      "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=150&minmagnitude=4.5&orderby=time";
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`USGS status ${res.status}`);
    const json = (await res.json()) as {
      features: {
        id: string;
        properties: { title: string; mag: number; place: string; time: number; updated: number; url: string };
        geometry: { coordinates: [number, number, number] };
      }[];
    };
    return json.features.map((f) => {
      const mag = f.properties.mag ?? 0;
      const place = f.properties.place ?? "Unknown location";
      const sev = magnitudeToSeverity(mag);
      return {
        id: `usgs-${f.id}`,
        title: `M${mag.toFixed(1)} Earthquake — ${place}`,
        description: `Magnitude ${mag.toFixed(1)} earthquake ${place}. Depth: ${Math.round(f.geometry.coordinates[2])} km below surface.`,
        category: "earthquake",
        severity: sev,
        lat: f.geometry.coordinates[1],
        lng: f.geometry.coordinates[0],
        country: null,
        region: place,
        source: "USGS",
        sourceUrl: f.properties.url,
        publishedAt: new Date(f.properties.time).toISOString(),
        updatedAt: f.properties.updated ? new Date(f.properties.updated).toISOString() : null,
        magnitude: mag,
        affectedPopulation: null,
      };
    });
  } catch (err) {
    logger.error({ err }, "Failed to fetch USGS earthquakes");
    return [];
  }
}

async function fetchNASAEONETEvents(): Promise<Alert[]> {
  try {
    const url = "https://eonet.gsfc.nasa.gov/api/v3/events?limit=100&status=open&days=60";
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    if (!res.ok) throw new Error(`NASA EONET status ${res.status}`);
    const json = (await res.json()) as {
      events: {
        id: string;
        title: string;
        categories: { id: string; title: string }[];
        sources: { id: string; url: string }[];
        geometry: { date: string; coordinates: [number, number] }[];
      }[];
    };

    const categoryMap: Record<string, Alert["category"]> = {
      drought: "disaster", dustHaze: "weather", earthquakes: "earthquake",
      floods: "disaster", landslides: "disaster", manmade: "other",
      seaLakeIce: "weather", severeStorms: "weather", snow: "weather",
      temperatureExtremes: "weather", volcanoes: "disaster", waterColor: "other",
      wildfires: "disaster",
    };
    const severityMap: Record<string, Alert["severity"]> = {
      drought: "high", dustHaze: "medium", earthquakes: "high", floods: "high",
      landslides: "high", manmade: "medium", seaLakeIce: "low", severeStorms: "high",
      snow: "medium", temperatureExtremes: "medium", volcanoes: "critical",
      waterColor: "low", wildfires: "high",
    };
    const humanCategoryName: Record<string, string> = {
      drought: "Drought", dustHaze: "Dust / Haze", earthquakes: "Earthquake",
      floods: "Flood", landslides: "Landslide", manmade: "Manmade Event",
      seaLakeIce: "Sea / Lake Ice", severeStorms: "Severe Storm", snow: "Snow / Blizzard",
      temperatureExtremes: "Extreme Temperature", volcanoes: "Volcanic Activity",
      waterColor: "Water Discoloration", wildfires: "Wildfire",
    };

    const alerts: Alert[] = [];
    for (const event of json.events) {
      const geo = event.geometry?.[event.geometry.length - 1];
      if (!geo?.coordinates) continue;
      const catId = event.categories?.[0]?.id ?? "other";
      const catLabel = humanCategoryName[catId] ?? "Event";
      const source = event.sources?.[0];
      const rawTitle = cleanEONETTitle(event.title);
      alerts.push({
        id: `eonet-${event.id}`,
        title: `${catLabel}: ${rawTitle}`,
        description: `Active ${catLabel.toLowerCase()} event tracked by NASA EONET.`,
        category: categoryMap[catId] ?? "other",
        severity: severityMap[catId] ?? "medium",
        lat: geo.coordinates[1],
        lng: geo.coordinates[0],
        country: null,
        region: null,
        source: source?.id ?? "NASA EONET",
        sourceUrl: source?.url ?? `https://eonet.gsfc.nasa.gov/api/v3/events/${event.id}`,
        publishedAt: geo.date ? new Date(geo.date).toISOString() : new Date().toISOString(),
        updatedAt: null,
        magnitude: null,
        affectedPopulation: null,
      });
    }
    return alerts;
  } catch (err) {
    logger.error({ err }, "Failed to fetch NASA EONET events");
    return [];
  }
}

async function fetchReliefWebDisasters(): Promise<Alert[]> {
  try {
    const params = new URLSearchParams({ appname: "WorldAlert", limit: "50" });
    ["name", "status", "country", "date", "description", "type"].forEach((f) =>
      params.append("fields[include][]", f)
    );
    const res = await fetch(`https://api.reliefweb.int/v1/disasters?${params.toString()}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`ReliefWeb status ${res.status}`);
    const json = (await res.json()) as {
      data: {
        id: string;
        href: string;
        fields: {
          name: string;
          status: string;
          country?: { name: string; location?: { lat: number; lon: number } }[];
          date?: { created: string };
          description?: string;
          type?: { name: string }[];
        };
      }[];
    };

    const alerts: Alert[] = [];
    for (const item of json.data ?? []) {
      const f = item.fields;
      const countryObj = f.country?.[0];
      const loc = countryObj?.location;
      if (!loc?.lat || !loc?.lon) continue;
      const typeName = (f.type?.[0]?.name ?? "").toLowerCase();
      let category: Alert["category"] = "humanitarian";
      if (typeName.includes("earthquake")) category = "earthquake";
      else if (typeName.includes("flood") || typeName.includes("cyclone") || typeName.includes("hurricane")) category = "weather";
      else if (typeName.includes("drought") || typeName.includes("volcano") || typeName.includes("landslide")) category = "disaster";
      else if (typeName.includes("epidemic") || typeName.includes("disease") || typeName.includes("health")) category = "health";
      else if (typeName.includes("conflict") || typeName.includes("civil") || typeName.includes("violence")) category = "conflict";
      const severity: Alert["severity"] = f.status === "alert" ? "high" : "medium";
      const cleanDesc = f.description ? cleanText(f.description).slice(0, 400) : null;
      alerts.push({
        id: `rw-${item.id}`,
        title: cleanText(f.name),
        description: cleanDesc,
        category,
        severity,
        lat: loc.lat,
        lng: loc.lon,
        country: countryObj?.name || null,
        region: null,
        source: "ReliefWeb",
        sourceUrl: item.href || "https://reliefweb.int",
        publishedAt: f.date?.created ? new Date(f.date.created).toISOString() : new Date().toISOString(),
        updatedAt: null,
        magnitude: null,
        affectedPopulation: null,
      });
    }
    return alerts;
  } catch (err) {
    logger.error({ err }, "Failed to fetch ReliefWeb disasters");
    return [];
  }
}

async function fetchUCDPConflicts(): Promise<Alert[]> {
  try {
    const url = "https://ucdpapi.pcr.uu.se/api/gedevents/24.1?pagesize=200&year=2023";
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) throw new Error(`UCDP status ${res.status}`);
    const json = (await res.json()) as {
      Result: {
        id: number;
        type_of_violence: number;
        side_a: string;
        side_b: string;
        best: number;
        date_start: string;
        date_end: string;
        where_description: string;
        where_coordinates: string;
        latitude: number;
        longitude: number;
        country: string;
        region: string;
        source_article: string;
      }[];
    };

    function shortenSide(name: string): string {
      return name
        .replace(/Government of /gi, "")
        .replace(/\(.*?\)/g, "")
        .replace(/\s{2,}/g, " ")
        .trim()
        .slice(0, 30);
    }

    const typeLabel: Record<number, string> = {
      1: "State Conflict",
      2: "Non-State Conflict",
      3: "One-Sided Violence",
    };

    return (json.Result ?? [])
      .filter((e) => e.latitude && e.longitude && e.best > 0)
      .sort((a, b) => b.best - a.best)
      .slice(0, 120)
      .map((e) => {
        const aName = shortenSide(e.side_a);
        const bName = shortenSide(e.side_b);
        const loc = e.where_description || e.where_coordinates || e.country;
        const type = typeLabel[e.type_of_violence] || "Armed Conflict";
        const deaths = e.best;
        const title = `${type} in ${e.country}: ${aName} vs ${bName}${loc && loc !== e.country ? ` (${loc})` : ""}`;
        const severity: Alert["severity"] = deaths >= 100 ? "critical" : deaths >= 25 ? "high" : deaths >= 5 ? "medium" : "low";
        return {
          id: `ucdp-${e.id}`,
          title,
          description: `Estimated ${deaths.toLocaleString()} deaths. ${e.country}${loc && loc !== e.country ? `, ${loc}` : ""}. Active: ${e.date_start}${e.date_end !== e.date_start ? ` – ${e.date_end}` : ""}. Parties: ${e.side_a} vs ${e.side_b}.`,
          category: "conflict" as const,
          severity,
          lat: e.latitude,
          lng: e.longitude,
          country: e.country || null,
          region: e.region || null,
          source: "UCDP",
          sourceUrl: e.source_article || `https://ucdp.uu.se/#/statebased/${e.id}`,
          publishedAt: e.date_start ? new Date(e.date_start).toISOString() : new Date().toISOString(),
          updatedAt: e.date_end ? new Date(e.date_end).toISOString() : null,
          magnitude: null,
          affectedPopulation: deaths || null,
        };
      });
  } catch (err) {
    logger.error({ err }, "Failed to fetch UCDP conflicts");
    return [];
  }
}

async function fetchRSSNews(feedUrl: string, sourceName: string): Promise<Alert[]> {
  try {
    const res = await fetch(feedUrl, {
      headers: { "User-Agent": "WorldAlert/1.0", Accept: "application/rss+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`RSS ${res.status}`);
    const xml = await res.text();

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_", cdataPropName: "__cdata" });
    const parsed = parser.parse(xml);
    const items: any[] = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];

    const alerts: Alert[] = [];
    for (const item of items.slice(0, 60)) {
      const rawTitle: string =
        item.title?.["#text"] ?? item.title?.__cdata ?? item.title ?? "";
      const rawDesc: string =
        item.description?.["#text"] ?? item.description?.__cdata ?? item.description ??
        item.summary?.["#text"] ?? item.summary?.__cdata ?? item.summary ?? "";
      const link: string =
        item.link?.["@_href"] ?? item.link ?? item.guid?.["#text"] ?? item.guid ?? "";
      const pubDate: string = item.pubDate ?? item.published ?? item.updated ?? "";

      const title = cleanText(rawTitle);
      const desc = cleanText(rawDesc);

      if (!title || !link) continue;

      const fullText = `${title} ${desc}`;
      const coords = geocodeText(fullText);
      if (!coords) continue;

      const category = detectConflictCategory(fullText);
      if (category === "other") continue;

      const severity = detectSeverity(fullText, category);

      const matchedCountry = Object.entries(COUNTRY_COORDS)
        .sort((a, b) => b[0].length - a[0].length)
        .find(([, c]) => c[0] === coords[0] && c[1] === coords[1])?.[0] ?? null;
      const countryDisplay = matchedCountry ? titleCase(matchedCountry) : null;

      alerts.push({
        id: `rss-${sourceName.toLowerCase().replace(/\s+/g, "-")}-${simpleHash(title + link)}`,
        title: title.length > 120 ? title.slice(0, 117) + "…" : title,
        description: desc ? desc.slice(0, 350) : null,
        category,
        severity,
        lat: coords[0],
        lng: coords[1],
        country: countryDisplay,
        region: null,
        source: sourceName,
        sourceUrl: typeof link === "string" ? link : String(link),
        publishedAt: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(),
        updatedAt: null,
        magnitude: null,
        affectedPopulation: null,
      });
    }
    return alerts;
  } catch (err) {
    logger.error({ err, feedUrl }, "Failed to fetch RSS news");
    return [];
  }
}

async function fetchAllRSSNews(): Promise<Alert[]> {
  const feeds = [
    { url: "https://feeds.bbci.co.uk/news/world/rss.xml",                name: "BBC World" },
    { url: "https://www.aljazeera.com/xml/rss/all.xml",                   name: "Al Jazeera" },
    { url: "https://feeds.reuters.com/reuters/worldNews",                  name: "Reuters" },
    { url: "https://rss.nytimes.com/services/xml/rss/nyt/World.xml",      name: "NY Times" },
    { url: "https://feeds.theguardian.com/theguardian/world/rss",         name: "The Guardian" },
    { url: "https://www.france24.com/en/rss",                              name: "France 24" },
    { url: "https://rss.dw.com/xml/rss-en-world",                         name: "DW World" },
    { url: "https://www.voanews.com/api/zk_oqepkve",                      name: "VOA News" },
    { url: "https://feeds.npr.org/1004/rss.xml",                          name: "NPR World" },
    { url: "https://www.who.int/rss-feeds/news-releases-en.xml",          name: "WHO" },
    { url: "https://reliefweb.int/updates/rss.xml",                       name: "ReliefWeb Updates" },
    { url: "https://www.unhcr.org/rss/news.xml",                          name: "UNHCR" },
    { url: "https://feeds.feedburner.com/AllJazeeraEnglish",              name: "Al Jazeera Opinion" },
    { url: "https://foreignpolicy.com/feed/",                             name: "Foreign Policy" },
  ];
  const results = await Promise.allSettled(feeds.map((f) => fetchRSSNews(f.url, f.name)));
  const allItems: Alert[] = [];
  const seen = new Set<string>();
  for (const r of results) {
    if (r.status === "fulfilled") {
      for (const item of r.value) {
        const key = item.title.slice(0, 50).toLowerCase().replace(/[^a-z0-9]/g, "");
        if (!seen.has(key)) {
          seen.add(key);
          allItems.push(item);
        }
      }
    }
  }
  return allItems;
}

// ── Aggregation ───────────────────────────────────────────────────────────────

async function getAllAlerts(): Promise<Alert[]> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const [earthquakes, eonet, reliefweb, ucdp, rssNews] = await Promise.allSettled([
    fetchUSGSEarthquakes(),
    fetchNASAEONETEvents(),
    fetchReliefWebDisasters(),
    fetchUCDPConflicts(),
    fetchAllRSSNews(),
  ]);

  const alerts: Alert[] = [
    ...(earthquakes.status === "fulfilled" ? earthquakes.value : []),
    ...(eonet.status === "fulfilled" ? eonet.value : []),
    ...(reliefweb.status === "fulfilled" ? reliefweb.value : []),
    ...(ucdp.status === "fulfilled" ? ucdp.value : []),
    ...(rssNews.status === "fulfilled" ? rssNews.value : []),
  ].filter((a) => !isNaN(a.lat) && !isNaN(a.lng));

  alerts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  cache = { data: alerts, timestamp: now };
  return alerts;
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.get("/alerts", async (req, res) => {
  try {
    let alerts = await getAllAlerts();
    const { category, severity, limit } = req.query as {
      category?: string; severity?: string; limit?: string;
    };
    if (category) alerts = alerts.filter((a) => a.category === category);
    if (severity) alerts = alerts.filter((a) => a.severity === severity);
    const n = limit ? parseInt(limit, 10) : undefined;
    if (n && !isNaN(n)) alerts = alerts.slice(0, n);
    res.json(alerts);
  } catch (err) {
    logger.error({ err }, "Error listing alerts");
    res.status(500).json({ error: "Failed to fetch alerts" });
  }
});

router.get("/alerts/stats", async (req, res) => {
  try {
    const alerts = await getAllAlerts();
    const bySeverity: Record<string, number> = {};
    const byCategory: Record<string, number> = {};
    for (const a of alerts) {
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
      byCategory[a.category] = (byCategory[a.category] || 0) + 1;
    }
    res.json({
      total: alerts.length,
      critical: bySeverity.critical || 0,
      bySeverity,
      byCategory,
      lastUpdated: cache?.timestamp ? new Date(cache.timestamp).toISOString() : new Date().toISOString(),
    });
  } catch (err) {
    logger.error({ err }, "Error getting stats");
    res.status(500).json({ error: "Failed to compute stats" });
  }
});

router.get("/alerts/:id", async (req, res) => {
  try {
    const alerts = await getAllAlerts();
    const alert = alerts.find((a) => a.id === req.params.id);
    if (!alert) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }
    res.json(alert);
  } catch (err) {
    logger.error({ err }, "Error getting alert");
    res.status(500).json({ error: "Failed to fetch alert" });
  }
});

export { getAllAlerts };
export default router;
