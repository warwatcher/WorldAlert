import { Router } from "express";
import { logger } from "../lib/logger";

const router = Router();

interface Alert {
  id: string;
  title: string;
  description: string | null;
  category: "earthquake" | "disaster" | "humanitarian" | "weather" | "conflict" | "health" | "other";
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

function magnitudeToSeverity(mag: number): Alert["severity"] {
  if (mag >= 7.0) return "critical";
  if (mag >= 6.0) return "high";
  if (mag >= 5.0) return "medium";
  return "low";
}

function gdacsAlertLevelToSeverity(level: string): Alert["severity"] {
  const l = (level || "").toLowerCase();
  if (l === "red") return "critical";
  if (l === "orange") return "high";
  if (l === "green") return "low";
  return "medium";
}

async function fetchUSGSEarthquakes(): Promise<Alert[]> {
  try {
    const url =
      "https://earthquake.usgs.gov/fdsnws/event/1/query?format=geojson&limit=150&minmagnitude=4.5&orderby=time";
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) throw new Error(`USGS status ${res.status}`);
    const json = (await res.json()) as {
      features: {
        id: string;
        properties: {
          title: string;
          mag: number;
          place: string;
          time: number;
          updated: number;
          url: string;
          detail: string;
          status: string;
        };
        geometry: { coordinates: [number, number, number] };
      }[];
    };

    return json.features.map((f) => {
      const mag = f.properties.mag ?? 0;
      const place = f.properties.place ?? "Unknown location";
      return {
        id: `usgs-${f.id}`,
        title: f.properties.title || `M${mag} earthquake near ${place}`,
        description: `Magnitude ${mag} earthquake at ${place}. Depth: ${Math.round(f.geometry.coordinates[2])} km.`,
        category: "earthquake",
        severity: magnitudeToSeverity(mag),
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
      drought: "disaster",
      dustHaze: "weather",
      earthquakes: "earthquake",
      floods: "disaster",
      landslides: "disaster",
      manmade: "other",
      seaLakeIce: "weather",
      severeStorms: "weather",
      snow: "weather",
      temperatureExtremes: "weather",
      volcanoes: "disaster",
      waterColor: "other",
      wildfires: "disaster",
    };

    const severityMap: Record<string, Alert["severity"]> = {
      drought: "high",
      dustHaze: "medium",
      earthquakes: "high",
      floods: "high",
      landslides: "high",
      manmade: "medium",
      seaLakeIce: "low",
      severeStorms: "high",
      snow: "medium",
      temperatureExtremes: "medium",
      volcanoes: "critical",
      waterColor: "low",
      wildfires: "high",
    };

    const alerts: Alert[] = [];
    for (const event of json.events) {
      const geo = event.geometry?.[event.geometry.length - 1];
      if (!geo?.coordinates) continue;
      const catId = event.categories?.[0]?.id ?? "other";
      const source = event.sources?.[0];
      alerts.push({
        id: `eonet-${event.id}`,
        title: event.title,
        description: null,
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
    const params = new URLSearchParams({
      appname: "WorldAlert",
      limit: "50",
      "sort[]": "date.created:desc",
      "fields[include][]": "name",
    });
    ["status", "country", "date", "description", "type"].forEach((f) =>
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
      else if (typeName.includes("flood") || typeName.includes("cyclone") || typeName.includes("hurricane"))
        category = "weather";
      else if (typeName.includes("drought") || typeName.includes("volcano") || typeName.includes("landslide"))
        category = "disaster";
      else if (typeName.includes("epidemic") || typeName.includes("disease") || typeName.includes("health"))
        category = "health";
      else if (typeName.includes("conflict") || typeName.includes("civil")) category = "conflict";

      const severity: Alert["severity"] = f.status === "alert" ? "high" : "medium";

      alerts.push({
        id: `rw-${item.id}`,
        title: f.name,
        description: f.description?.slice(0, 400) || null,
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

async function fetchAcledConflicts(): Promise<Alert[]> {
  try {
    const url =
      "https://api.acleddata.com/acled/read?terms=accept&limit=50&event_type=Battles&event_date_where=BETWEEN&event_date=2024-01-01|2025-12-31&fields=event_id_cnty|event_date|event_type|country|admin1|latitude|longitude|notes|source|source_scale";
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`ACLED status ${res.status}`);
    const json = (await res.json()) as {
      data: {
        event_id_cnty: string;
        event_date: string;
        event_type: string;
        country: string;
        admin1: string;
        latitude: string;
        longitude: string;
        notes: string;
        source: string;
        source_scale: string;
      }[];
    };
    return (json.data ?? []).slice(0, 30).map((e) => ({
      id: `acled-${e.event_id_cnty}`,
      title: `${e.event_type} in ${e.admin1 || e.country}`,
      description: e.notes?.slice(0, 300) || null,
      category: "conflict" as const,
      severity: "high" as const,
      lat: parseFloat(e.latitude),
      lng: parseFloat(e.longitude),
      country: e.country || null,
      region: e.admin1 || null,
      source: e.source || "ACLED",
      sourceUrl: "https://acleddata.com",
      publishedAt: e.event_date ? new Date(e.event_date).toISOString() : new Date().toISOString(),
      updatedAt: null,
      magnitude: null,
      affectedPopulation: null,
    }));
  } catch {
    return [];
  }
}

async function getAllAlerts(): Promise<Alert[]> {
  const now = Date.now();
  if (cache && now - cache.timestamp < CACHE_TTL_MS) {
    return cache.data;
  }

  const [earthquakes, eonet, reliefweb, acled] = await Promise.allSettled([
    fetchUSGSEarthquakes(),
    fetchNASAEONETEvents(),
    fetchReliefWebDisasters(),
    fetchAcledConflicts(),
  ]);

  const alerts: Alert[] = [
    ...(earthquakes.status === "fulfilled" ? earthquakes.value : []),
    ...(eonet.status === "fulfilled" ? eonet.value : []),
    ...(reliefweb.status === "fulfilled" ? reliefweb.value : []),
    ...(acled.status === "fulfilled" ? acled.value : []),
  ].filter((a) => !isNaN(a.lat) && !isNaN(a.lng));

  alerts.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  cache = { data: alerts, timestamp: now };
  return alerts;
}

router.get("/alerts", async (req, res) => {
  try {
    let alerts = await getAllAlerts();
    const { category, severity, limit } = req.query as {
      category?: string;
      severity?: string;
      limit?: string;
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

export default router;
