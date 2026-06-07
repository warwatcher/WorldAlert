import {
  useState, useMemo, useEffect, useRef, lazy, Suspense, Component, type ReactNode,
} from "react";
import { useListAlerts, useGetAlert } from "@workspace/api-client-react";
import {
  X, ExternalLink, MapPin, Activity, Clock, Users, SlidersHorizontal,
  ChevronDown, ChevronUp, Swords, CloudLightning, Heart, Globe2,
  Flame, Landmark, Eye, EyeOff, Play, Pause, RotateCcw, Calendar,
  Layers, Map as MapIcon, AlertTriangle,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip,
  Marker, useMapEvents, useMap,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "leaflet.heat";
import { CountryIntelPanel } from "@/components/country-panel";

// ── GeoJSON module-level cache ────────────────────────────────────────────────

let _geoCache: any = null;
let _geoPromise: Promise<any> | null = null;

function loadWorldGeoJSON(): Promise<any> {
  if (_geoCache) return Promise.resolve(_geoCache);
  if (!_geoPromise) {
    _geoPromise = fetch(
      "https://cdn.jsdelivr.net/gh/holtzy/D3-graph-gallery@master/DATA/world.geojson",
      { cache: "force-cache" }
    )
      .then((r) => r.json())
      .then((d) => { _geoCache = d; return d; })
      .catch(() => null);
  }
  return _geoPromise;
}

function normGeo(s: string) {
  return s.toLowerCase()
    .replace(/\b(of|the|democratic|republic|federation|peoples|people's)\b/g, "")
    .replace(/['-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GEO_ALIASES: Record<string, string> = {
  "usa": "united states",
  "united states of america": "united states",
  "russian federation": "russia",
  "england": "united kingdom",
  "great britain": "united kingdom",
  "pr china": "china",
  "myanmar (burma)": "myanmar",
  "burma": "myanmar",
  "drc": "democratic republic congo",
  "dr congo": "democratic republic congo",
  "north korea": "north korea",
  "dprk": "north korea",
  "south korea": "south korea",
  "ivory coast": "côte d'ivoire",
  "cote d ivoire": "côte d'ivoire",
  "czechia": "czech republic",
  "czech rep": "czech republic",
  "eswatini": "swaziland",
  "türkiye": "turkey",
  "cabo verde": "cape verde",
};

function geoNorm(n: string): string {
  const k = normGeo(n);
  return GEO_ALIASES[k] ?? k;
}

function namesMatch(geoName: string, alertCountry: string): boolean {
  const gn = geoNorm(geoName);
  const an = geoNorm(alertCountry);
  if (gn === an) return true;
  if (gn.includes(an) || an.includes(gn)) return true;
  const gnW = gn.split(" ").filter((w) => w.length > 4);
  const anW = an.split(" ").filter((w) => w.length > 4);
  return gnW.some((w) => an.includes(w)) || anW.some((w) => gn.includes(w));
}

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6",
};

const CATEGORY_META: Record<string, { label: string; icon: ReactNode; color: string }> = {
  earthquake:   { label: "Earthquake",   icon: <Activity className="h-3.5 w-3.5" />,       color: "#a78bfa" },
  disaster:     { label: "Disaster",     icon: <Flame className="h-3.5 w-3.5" />,           color: "#fb923c" },
  weather:      { label: "Weather",      icon: <CloudLightning className="h-3.5 w-3.5" />,  color: "#38bdf8" },
  humanitarian: { label: "Humanitarian", icon: <Heart className="h-3.5 w-3.5" />,           color: "#f472b6" },
  conflict:     { label: "Conflict",     icon: <Swords className="h-3.5 w-3.5" />,          color: "#ef4444" },
  health:       { label: "Health",       icon: <Heart className="h-3.5 w-3.5" />,           color: "#34d399" },
  political:    { label: "Political",    icon: <Landmark className="h-3.5 w-3.5" />,        color: "#fbbf24" },
  other:        { label: "Other",        icon: <Globe2 className="h-3.5 w-3.5" />,          color: "#9ca3af" },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META);
const ALL_SEVERITIES = ["critical", "high", "medium", "low"] as const;

// ── Capital / major cities ────────────────────────────────────────────────────

const WORLD_CITIES = [
  // Americas
  { n: "Washington DC", lat: 38.90, lng: -77.04, t: 1 },
  { n: "New York",      lat: 40.71, lng: -74.00, t: 1 },
  { n: "Ottawa",        lat: 45.42, lng: -75.70, t: 0 },
  { n: "Mexico City",   lat: 19.43, lng: -99.13, t: 1 },
  { n: "Havana",        lat: 23.13, lng: -82.38, t: 0 },
  { n: "Port-au-Prince",lat: 18.54, lng: -72.34, t: 1 },
  { n: "Brasilia",      lat:-15.78, lng: -47.93, t: 1 },
  { n: "Buenos Aires",  lat:-34.60, lng: -58.38, t: 1 },
  { n: "Bogota",        lat:  4.71, lng: -74.07, t: 0 },
  { n: "Lima",          lat:-12.04, lng: -77.03, t: 0 },
  { n: "Santiago",      lat:-33.46, lng: -70.65, t: 0 },
  { n: "Caracas",       lat: 10.49, lng: -66.88, t: 0 },
  // Europe
  { n: "London",        lat: 51.51, lng:  -0.13, t: 1 },
  { n: "Paris",         lat: 48.85, lng:   2.35, t: 1 },
  { n: "Berlin",        lat: 52.52, lng:  13.40, t: 1 },
  { n: "Rome",          lat: 41.90, lng:  12.48, t: 0 },
  { n: "Madrid",        lat: 40.42, lng:  -3.70, t: 0 },
  { n: "Brussels",      lat: 50.85, lng:   4.35, t: 0 },
  { n: "Amsterdam",     lat: 52.37, lng:   4.90, t: 0 },
  { n: "Vienna",        lat: 48.21, lng:  16.37, t: 0 },
  { n: "Warsaw",        lat: 52.23, lng:  21.01, t: 0 },
  { n: "Budapest",      lat: 47.50, lng:  19.04, t: 0 },
  { n: "Bucharest",     lat: 44.43, lng:  26.10, t: 0 },
  { n: "Athens",        lat: 37.98, lng:  23.73, t: 0 },
  { n: "Kyiv",          lat: 50.45, lng:  30.52, t: 1 },
  { n: "Minsk",         lat: 53.90, lng:  27.57, t: 0 },
  // Russia & Central Asia
  { n: "Moscow",        lat: 55.75, lng:  37.62, t: 1 },
  { n: "Astana",        lat: 51.18, lng:  71.45, t: 0 },
  { n: "Tashkent",      lat: 41.30, lng:  69.24, t: 0 },
  { n: "Tbilisi",       lat: 41.69, lng:  44.83, t: 0 },
  // Middle East
  { n: "Ankara",        lat: 39.93, lng:  32.86, t: 1 },
  { n: "Tehran",        lat: 35.69, lng:  51.42, t: 1 },
  { n: "Baghdad",       lat: 33.34, lng:  44.40, t: 1 },
  { n: "Damascus",      lat: 33.51, lng:  36.29, t: 1 },
  { n: "Beirut",        lat: 33.89, lng:  35.50, t: 1 },
  { n: "Jerusalem",     lat: 31.78, lng:  35.23, t: 1 },
  { n: "Amman",         lat: 31.95, lng:  35.93, t: 0 },
  { n: "Riyadh",        lat: 24.69, lng:  46.72, t: 1 },
  { n: "Sanaa",         lat: 15.35, lng:  44.21, t: 1 },
  { n: "Dubai",         lat: 25.20, lng:  55.27, t: 0 },
  { n: "Doha",          lat: 25.29, lng:  51.53, t: 0 },
  // Asia
  { n: "Kabul",         lat: 34.53, lng:  69.17, t: 1 },
  { n: "Islamabad",     lat: 33.72, lng:  73.06, t: 1 },
  { n: "Karachi",       lat: 24.86, lng:  67.01, t: 0 },
  { n: "Delhi",         lat: 28.61, lng:  77.21, t: 1 },
  { n: "Mumbai",        lat: 19.08, lng:  72.88, t: 0 },
  { n: "Dhaka",         lat: 23.73, lng:  90.40, t: 0 },
  { n: "Kathmandu",     lat: 27.72, lng:  85.32, t: 0 },
  { n: "Beijing",       lat: 39.91, lng: 116.39, t: 1 },
  { n: "Shanghai",      lat: 31.23, lng: 121.47, t: 0 },
  { n: "Pyongyang",     lat: 39.02, lng: 125.75, t: 1 },
  { n: "Seoul",         lat: 37.57, lng: 126.98, t: 1 },
  { n: "Tokyo",         lat: 35.69, lng: 139.69, t: 1 },
  { n: "Bangkok",       lat: 13.75, lng: 100.52, t: 0 },
  { n: "Hanoi",         lat: 21.03, lng: 105.85, t: 0 },
  { n: "Naypyidaw",     lat: 19.74, lng:  96.12, t: 0 },
  { n: "Manila",        lat: 14.60, lng: 120.98, t: 0 },
  { n: "Jakarta",       lat: -6.21, lng: 106.85, t: 0 },
  { n: "Singapore",     lat:  1.35, lng: 103.82, t: 0 },
  { n: "Kuala Lumpur",  lat:  3.14, lng: 101.69, t: 0 },
  // Africa
  { n: "Cairo",         lat: 30.06, lng:  31.25, t: 1 },
  { n: "Tripoli",       lat: 32.89, lng:  13.18, t: 1 },
  { n: "Tunis",         lat: 36.82, lng:  10.17, t: 0 },
  { n: "Algiers",       lat: 36.74, lng:   3.06, t: 0 },
  { n: "Rabat",         lat: 34.02, lng:  -6.84, t: 0 },
  { n: "Khartoum",      lat: 15.55, lng:  32.53, t: 1 },
  { n: "Addis Ababa",   lat:  9.03, lng:  38.74, t: 1 },
  { n: "Mogadishu",     lat:  2.05, lng:  45.34, t: 1 },
  { n: "Nairobi",       lat: -1.29, lng:  36.82, t: 1 },
  { n: "Kampala",       lat:  0.32, lng:  32.58, t: 0 },
  { n: "Kinshasa",      lat: -4.32, lng:  15.32, t: 1 },
  { n: "Bangui",        lat:  4.36, lng:  18.56, t: 1 },
  { n: "N'Djamena",     lat: 12.11, lng:  15.04, t: 0 },
  { n: "Bamako",        lat: 12.65, lng:  -8.00, t: 1 },
  { n: "Niamey",        lat: 13.51, lng:   2.12, t: 0 },
  { n: "Lagos",         lat:  6.52, lng:   3.38, t: 0 },
  { n: "Abuja",         lat:  9.07, lng:   7.40, t: 0 },
  { n: "Accra",         lat:  5.56, lng:  -0.20, t: 0 },
  { n: "Monrovia",      lat:  6.30, lng: -10.80, t: 0 },
  { n: "Pretoria",      lat:-25.74, lng:  28.19, t: 1 },
  { n: "Lusaka",        lat:-15.42, lng:  28.28, t: 0 },
  { n: "Harare",        lat:-17.83, lng:  31.05, t: 0 },
  // Oceania
  { n: "Canberra",      lat:-35.28, lng: 149.13, t: 1 },
  { n: "Sydney",        lat:-33.87, lng: 151.21, t: 0 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWebGLAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch { return false; }
}

function formatDate(d: Date) {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Error Boundary ─────────────────────────────────────────────────────────────

class ErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

const GlobeView = lazy(() => import("@/components/globe-view"));

// ── Types ─────────────────────────────────────────────────────────────────────

interface Filters {
  categories: Set<string>;
  severities:  Set<string>;
  showLabels:  boolean;
}

// ── Country risk layer (GeoJSON + coloring + click) ───────────────────────────

interface CountryRisk { score: number; maxSev: string; count: number }

function buildRiskMap(alerts: any[], geoNames: string[]): Map<string, CountryRisk> {
  const map = new Map<string, CountryRisk>();
  const W: Record<string, number> = { critical: 20, high: 8, medium: 3, low: 1 };
  const SEV = ["critical", "high", "medium", "low"];
  for (const a of alerts) {
    const ac = a.country || a.region;
    if (!ac) continue;
    for (const gn of geoNames) {
      if (namesMatch(gn, ac)) {
        const prev = map.get(gn);
        const curSev = prev?.maxSev ?? "low";
        const newSev = SEV.indexOf(a.severity) < SEV.indexOf(curSev) ? a.severity : curSev;
        map.set(gn, {
          score: (prev?.score ?? 0) + (W[a.severity] ?? 1),
          maxSev: newSev,
          count: (prev?.count ?? 0) + 1,
        });
        break;
      }
    }
  }
  return map;
}

function CountryRiskLayer({
  alerts,
  onCountryClick,
}: {
  alerts: any[];
  onCountryClick: (name: string) => void;
}) {
  const map = useMap();
  const layerRef = useRef<L.GeoJSON | null>(null);
  const [geoData, setGeoData] = useState<any>(null);
  const [geoNames, setGeoNames] = useState<string[]>([]);
  const clickRef = useRef(onCountryClick);
  useEffect(() => { clickRef.current = onCountryClick; }, [onCountryClick]);

  // Fetch GeoJSON once
  useEffect(() => {
    loadWorldGeoJSON().then((d) => {
      if (!d) return;
      setGeoData(d);
      setGeoNames(d.features.map((f: any) => f.properties?.name).filter(Boolean));
    });
  }, []);

  // Create custom pane (behind event markers)
  useEffect(() => {
    if (!map.getPane("countryPane")) {
      const p = map.createPane("countryPane");
      p.style.zIndex = "350";
      p.style.pointerEvents = "auto";
    }
    if (!map.getPane("cityPane")) {
      const p = map.createPane("cityPane");
      p.style.zIndex = "370";
      p.style.pointerEvents = "none";
    }
  }, [map]);

  const riskMap = useMemo(() => buildRiskMap(alerts, geoNames), [alerts, geoNames]);

  useEffect(() => {
    if (!geoData || !map || !map.getPane("countryPane")) return;
    if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }

    const layer = L.geoJSON(geoData, {
      pane: "countryPane",
      style: (feature: any) => {
        const risk = riskMap.get(feature?.properties?.name);
        if (!risk || risk.count === 0) {
          return { fillColor: "#0d0d14", fillOpacity: 0.72, color: "#1e1e32", weight: 0.5, opacity: 0.6 };
        }
        const fc =
          risk.maxSev === "critical" ? "#7f1d1d" :
          risk.maxSev === "high"     ? "#78350f" :
          risk.maxSev === "medium"   ? "#3d2000" : "#1c1917";
        const fo =
          risk.maxSev === "critical" ? 0.82 :
          risk.maxSev === "high"     ? 0.68 :
          risk.maxSev === "medium"   ? 0.48 : 0.30;
        const bc =
          risk.maxSev === "critical" ? "#ef444455" :
          risk.maxSev === "high"     ? "#f9731640" : "#37415130";
        return { fillColor: fc, fillOpacity: fo, color: bc, weight: 0.5, opacity: 0.7 };
      },
      onEachFeature: (feature: any, lyr: any) => {
        const name = feature.properties?.name;
        if (!name) return;
        lyr.on({
          click: (e: any) => {
            L.DomEvent.stopPropagation(e);
            clickRef.current(name);
          },
          mouseover: (e: any) => {
            const fo = e.target.options.fillOpacity ?? 0;
            e.target.setStyle({ fillOpacity: Math.min(0.95, fo + 0.15), weight: 1 });
          },
          mouseout: (e: any) => {
            if (layerRef.current) layerRef.current.resetStyle(e.target);
          },
        });
      },
    });

    layer.addTo(map);
    layerRef.current = layer;
    return () => {
      if (layerRef.current) { map.removeLayer(layerRef.current); layerRef.current = null; }
    };
  }, [geoData, map, riskMap]);

  return null;
}

// ── City dots ─────────────────────────────────────────────────────────────────

function makeCityIcon(name: string, important: boolean) {
  const dotColor = important ? "rgba(255,255,255,0.5)" : "rgba(255,255,255,0.25)";
  const textColor = important ? "rgba(255,255,255,0.45)" : "rgba(255,255,255,0.22)";
  return L.divIcon({
    html: `<div style="display:inline-flex;align-items:center;gap:3px;pointer-events:none;">
      <span style="flex-shrink:0;width:${important ? 5 : 3}px;height:${important ? 5 : 3}px;border-radius:50%;background:${dotColor};box-shadow:0 0 4px ${dotColor};"></span>
      <span style="font-size:${important ? 9 : 8}px;font-family:ui-monospace,monospace;color:${textColor};text-shadow:0 1px 4px #000;white-space:nowrap;letter-spacing:0.04em;">${name}</span>
    </div>`,
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 5],
  });
}

function CityDots() {
  const [zoom, setZoom] = useState(2);
  useMapEvents({ zoomend: (e) => setZoom(e.target.getZoom()) });
  if (zoom < 2) return null;

  const minTier = zoom >= 4 ? 0 : zoom >= 3 ? 1 : 1;
  const visible = WORLD_CITIES.filter((c) => c.t >= minTier);

  return (
    <>
      {visible.map((c) => (
        <Marker
          key={c.n}
          position={[c.lat, c.lng]}
          icon={makeCityIcon(c.n, c.t === 1)}
          interactive={false}
          zIndexOffset={-800}
          pane="cityPane"
        />
      ))}
    </>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  filters, onChange, counts, showHeatmap, onHeatmapToggle,
}: {
  filters: Filters; onChange: (f: Filters) => void;
  counts: Record<string, number>; showHeatmap: boolean; onHeatmapToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  const toggleCategory = (cat: string) => {
    const next = new Set(filters.categories);
    if (next.has(cat)) { if (next.size > 1) next.delete(cat); }
    else next.add(cat);
    onChange({ ...filters, categories: next });
  };

  const toggleSeverity = (sev: string) => {
    const next = new Set(filters.severities);
    if (next.has(sev)) { if (next.size > 1) next.delete(sev); }
    else next.add(sev);
    onChange({ ...filters, severities: next });
  };

  const totalVisible = ALL_CATEGORIES
    .filter((c) => filters.categories.has(c))
    .reduce((s, c) => s + (counts[c] ?? 0), 0);

  const btn = "flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-xl border text-[11px] font-mono transition-colors shadow-lg";
  const off = "bg-black/85 border-white/[0.08] text-white/70 hover:bg-white/[0.06] hover:text-white";
  const on  = "bg-primary/15 border-primary/35 text-primary";

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1.5">
      <button onClick={() => setOpen((o) => !o)} className={`${btn} ${off}`}>
        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
        Filters
        <span className="ml-0.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold">
          {totalVisible}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-white/30" /> : <ChevronDown className="h-3 w-3 text-white/30" />}
      </button>

      <button
        onClick={() => onChange({ ...filters, showLabels: !filters.showLabels })}
        className={`${btn} ${filters.showLabels ? on : off}`}
      >
        {filters.showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        Event Labels
      </button>

      <button
        onClick={onHeatmapToggle}
        className={`${btn} ${showHeatmap ? "bg-orange-500/15 border-orange-500/35 text-orange-400" : off}`}
      >
        <Layers className="h-3.5 w-3.5" />
        Heat Map
        {showHeatmap && <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />}
      </button>

      {open && (
        <div
          className="w-52 rounded-xl border border-white/[0.08] shadow-2xl p-3 space-y-3"
          style={{ background: "rgba(4,4,6,0.96)", backdropFilter: "blur(20px)" }}
        >
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">Categories</span>
              <button
                onClick={() => onChange({ ...filters, categories: new Set(ALL_CATEGORIES) })}
                className="text-[9px] font-mono text-white/25 hover:text-white/50"
              >
                all
              </button>
            </div>
            <div className="space-y-0.5">
              {ALL_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const active = filters.categories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                      active ? "bg-white/[0.06] text-white" : "text-white/25 hover:text-white/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span style={{ color: active ? meta.color : undefined }}>{meta.icon}</span>
                      <span className="font-mono">{meta.label}</span>
                    </span>
                    <span className="text-[9px] font-mono text-white/25">{counts[cat] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 block mb-1.5">Severity</span>
            <div className="flex gap-1 flex-wrap">
              {ALL_SEVERITIES.map((sev) => {
                const active = filters.severities.has(sev);
                return (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors border"
                    style={{
                      color: active ? SEVERITY_COLORS[sev] : "rgba(255,255,255,0.2)",
                      borderColor: active ? `${SEVERITY_COLORS[sev]}50` : "rgba(255,255,255,0.06)",
                      background: active ? `${SEVERITY_COLORS[sev]}12` : "transparent",
                    }}
                  >
                    {sev}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Timeline slider ────────────────────────────────────────────────────────────

function TimelineSlider({
  minDate, maxDate, position, onPositionChange,
  isPlaying, onPlayPause, onReset,
  isActive, onToggle, visibleCount, totalCount,
}: {
  minDate: Date; maxDate: Date; position: number; onPositionChange: (p: number) => void;
  isPlaying: boolean; onPlayPause: () => void; onReset: () => void;
  isActive: boolean; onToggle: () => void;
  visibleCount: number; totalCount: number;
}) {
  const currentDate = new Date(
    minDate.getTime() + (maxDate.getTime() - minDate.getTime()) * (position / 100)
  );
  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-1.5">
      {isActive && (
        <div className="w-[420px] rounded-xl border border-white/[0.08] shadow-2xl p-3"
          style={{ background: "rgba(4,4,6,0.96)", backdropFilter: "blur(20px)" }}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 flex items-center gap-1.5">
              <Calendar className="h-3 w-3" /> Timeline Replay
            </span>
            <span className="text-[9px] font-mono text-white/25">
              {visibleCount} <span className="text-white/15">of</span> {totalCount} events
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onPlayPause}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 flex items-center justify-center transition-colors">
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button onClick={onReset}
              className="flex-shrink-0 w-7 h-7 rounded-full bg-white/5 border border-white/[0.08] text-white/35 hover:bg-white/10 flex items-center justify-center transition-colors">
              <RotateCcw className="h-3 w-3" />
            </button>
            <div className="flex-1 relative">
              <input type="range" min={0} max={100} step={0.1} value={position}
                onChange={(e) => onPositionChange(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${position}%, rgba(255,255,255,0.08) ${position}%)` }} />
            </div>
            <span className="flex-shrink-0 text-[10px] font-mono text-white/50 min-w-[80px] text-right">
              {formatDate(currentDate)}
            </span>
          </div>
          <div className="flex justify-between mt-1 px-9">
            <span className="text-[9px] font-mono text-white/20">{formatDate(minDate)}</span>
            <span className="text-[9px] font-mono text-white/20">{formatDate(maxDate)}</span>
          </div>
        </div>
      )}
      <button onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-xl border text-[11px] font-mono transition-colors shadow-lg ${
          isActive
            ? "bg-primary/15 border-primary/35 text-primary"
            : "bg-black/85 border-white/[0.08] text-white/60 hover:bg-white/[0.06] hover:text-white"
        }`}>
        <Calendar className="h-3.5 w-3.5" />
        Timeline
      </button>
    </div>
  );
}

// ── Heatmap layer ─────────────────────────────────────────────────────────────

function HeatmapLayer({ alerts }: { alerts: any[] }) {
  const map = useMap();
  useEffect(() => {
    const points = alerts
      .filter((a) => !isNaN(a.lat) && !isNaN(a.lng))
      .map((a) => [
        a.lat, a.lng,
        a.severity === "critical" ? 1.0 : a.severity === "high" ? 0.7 : a.severity === "medium" ? 0.4 : 0.18,
      ] as [number, number, number]);
    if (!points.length) return;
    const heat = (L as any).heatLayer(points, {
      radius: 30, blur: 22, maxZoom: 10, max: 1.0,
      gradient: {
        0.00: "rgba(0,0,0,0)", 0.15: "#1d4ed8", 0.35: "#0ea5e9",
        0.50: "#eab308",       0.65: "#f97316", 0.82: "#ef4444", 1.00: "#ffffff",
      },
    });
    heat.addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, alerts]);
  return null;
}

// ── Flat 2-D map ──────────────────────────────────────────────────────────────

function FlatMap({
  alerts, onAlertClick, onCountryClick, showLabels, showHeatmap,
}: {
  alerts: any[]; onAlertClick: (a: any) => void;
  onCountryClick: (name: string) => void;
  showLabels: boolean; showHeatmap: boolean;
}) {
  return (
    <div className="absolute inset-0">
      <style>{`
        .leaflet-container { background: #000 !important; }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.7) !important; color: #374151 !important; font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: #4b5563 !important; }
        .leaflet-tile-pane { filter: brightness(0.7) saturate(0.5); }
        .leaflet-tooltip {
          background: rgba(4,4,6,0.93) !important; border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 4px !important; box-shadow: 0 2px 12px rgba(0,0,0,0.7) !important;
          padding: 2px 7px !important; color: #e2e8f0 !important;
        }
        .leaflet-tooltip::before { display: none !important; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px; border-radius: 50%;
          background: hsl(var(--primary)); cursor: pointer; border: 2px solid rgba(255,255,255,0.25);
        }
        input[type=range]::-moz-range-thumb {
          width: 13px; height: 13px; border-radius: 50%;
          background: hsl(var(--primary)); cursor: pointer; border: 2px solid rgba(255,255,255,0.25);
        }
      `}</style>
      <MapContainer
        center={[20, 0]} zoom={2} minZoom={2} maxZoom={10}
        maxBounds={[[-85, -180], [85, 180]]}
        maxBoundsViscosity={1.0}
        worldCopyJump={false}
        style={{ height: "100%", width: "100%", background: "#000" }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
          noWrap
        />
        <CountryRiskLayer alerts={alerts} onCountryClick={onCountryClick} />
        <CityDots />
        {showHeatmap && <HeatmapLayer alerts={alerts} />}
        {alerts.map((alert) => {
          const isCritical = alert.severity === "critical";
          const isHigh     = alert.severity === "high";
          if (showHeatmap && !isCritical && !isHigh) return null;
          const radius  = isCritical ? 9 : isHigh ? 7 : alert.severity === "medium" ? 5 : 4;
          const color   = SEVERITY_COLORS[alert.severity] || "#3b82f6";
          const opacity = showHeatmap ? (isCritical ? 1 : 0.75) : (isCritical ? 0.9 : 0.75);
          return (
            <CircleMarker
              key={alert.id}
              center={[alert.lat, alert.lng]}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: isCritical ? 2 : 1.5 }}
              eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e as any); onAlertClick(alert); } }}
            >
              {isCritical || showLabels ? (
                <LeafletTooltip direction="top" offset={[0, -(radius + 2)]} opacity={1} permanent>
                  <span style={{ fontSize: "10px", fontFamily: "monospace", color, fontWeight: isCritical ? "700" : "normal", whiteSpace: "nowrap" }}>
                    {alert.title.length > 40 ? alert.title.slice(0, 40) + "…" : alert.title}
                  </span>
                </LeafletTooltip>
              ) : (
                <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.95}>
                  <span style={{ fontSize: "11px", fontFamily: "monospace" }}>{alert.title}</span>
                </LeafletTooltip>
              )}
            </CircleMarker>
          );
        })}
      </MapContainer>
    </div>
  );
}

// ── Home page ──────────────────────────────────────────────────────────────────

export default function Home() {
  const [selectedAlertId,  setSelectedAlertId]  = useState<string | null>(null);
  const [selectedCountry,  setSelectedCountry]  = useState<string | null>(null);
  const [mapMode,          setMapMode]          = useState<"2d" | "3d">("2d");
  const [webglAvailable]                        = useState(() => isWebGLAvailable());

  const [filters, setFilters] = useState<Filters>({
    categories: new Set(ALL_CATEGORIES),
    severities: new Set(ALL_SEVERITIES),
    showLabels: false,
  });
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [timelineActive,   setTimelineActive]   = useState(false);
  const [timelinePosition, setTimelinePosition] = useState(100);
  const [isPlaying,        setIsPlaying]        = useState(false);

  const { data: alerts, isLoading } = useListAlerts(undefined, {
    query: { refetchInterval: 60000 },
  });

  const dateRange = useMemo(() => {
    if (!alerts?.length) return null;
    const times = alerts.map((a) => new Date(a.publishedAt).getTime()).filter((t) => !isNaN(t));
    if (!times.length) return null;
    return { min: new Date(Math.min(...times)), max: new Date() };
  }, [alerts]);

  const timelineDate = useMemo(() => {
    if (!dateRange) return null;
    return new Date(
      dateRange.min.getTime() +
      (dateRange.max.getTime() - dateRange.min.getTime()) * (timelinePosition / 100)
    );
  }, [dateRange, timelinePosition]);

  useEffect(() => {
    if (!isPlaying) return;
    const id = setInterval(() => {
      setTimelinePosition((p) => {
        if (p >= 100) { setIsPlaying(false); return 100; }
        return Math.min(p + 0.4, 100);
      });
    }, 80);
    return () => clearInterval(id);
  }, [isPlaying]);

  const categoryCounts = useMemo(() => {
    if (!alerts) return {} as Record<string, number>;
    const c: Record<string, number> = {};
    for (const a of alerts) c[a.category] = (c[a.category] || 0) + 1;
    return c;
  }, [alerts]);

  const filteredAlerts = useMemo(
    () => (alerts ?? []).filter(
      (a) => filters.categories.has(a.category) && filters.severities.has(a.severity)
    ),
    [alerts, filters]
  );

  const displayAlerts = useMemo(
    () => !timelineActive || !timelineDate
      ? filteredAlerts
      : filteredAlerts.filter((a) => new Date(a.publishedAt) <= timelineDate!),
    [filteredAlerts, timelineActive, timelineDate]
  );

  const globeData = useMemo(
    () => displayAlerts.map((a) => ({
      ...a,
      color: SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.low,
      size: a.severity === "critical" ? 1.5 : a.severity === "high" ? 1 : a.severity === "medium" ? 0.7 : 0.4,
    })),
    [displayAlerts]
  );

  const handlePointClick = (point: any) => {
    setSelectedAlertId(point.id);
    setSelectedCountry(null);
  };
  const handleCountryClick = (name: string) => {
    const display = name === "USA" ? "United States"
      : name === "England" || name === "Great Britain" ? "United Kingdom"
      : name;
    setSelectedCountry(display);
    setSelectedAlertId(null);
  };
  const handleTimelineToggle = () => {
    setTimelineActive((v) => {
      if (v) { setIsPlaying(false); setTimelinePosition(100); }
      return !v;
    });
  };

  const flatMap = (
    <FlatMap
      alerts={displayAlerts}
      onAlertClick={handlePointClick}
      onCountryClick={handleCountryClick}
      showLabels={filters.showLabels}
      showHeatmap={showHeatmap}
    />
  );

  return (
    <div className="relative w-full h-[calc(100dvh-3.375rem)] overflow-hidden" style={{ background: "#000" }}>

      {/* Loading */}
      {isLoading && !alerts && (
        <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center"
          style={{ background: "rgba(0,0,0,0.9)", backdropFilter: "blur(12px)" }}>
          <Activity className="h-10 w-10 text-primary animate-spin mb-4" />
          <p className="text-primary font-mono text-[11px] uppercase tracking-[0.25em] animate-pulse">
            Initializing Global Intelligence Matrix…
          </p>
        </div>
      )}

      {/* Map or Globe */}
      {mapMode === "3d" && webglAvailable ? (
        <ErrorBoundary fallback={flatMap}>
          <Suspense fallback={flatMap}>
            <GlobeView globeData={globeData} onPointClick={handlePointClick} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        flatMap
      )}

      {/* 2D / 3D toggle */}
      <div
        className="absolute top-4 right-4 z-[1000] flex rounded-lg overflow-hidden"
        style={{ background: "rgba(4,4,6,0.9)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}
      >
        <button
          onClick={() => setMapMode("2d")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono transition-colors ${
            mapMode === "2d" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"
          }`}
        >
          <MapIcon className="h-3 w-3" />2D
        </button>
        <div className="w-px bg-white/[0.06]" />
        <button
          onClick={() => webglAvailable ? setMapMode("3d") : undefined}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono transition-colors ${
            mapMode === "3d"
              ? "bg-white/10 text-white"
              : webglAvailable
              ? "text-white/35 hover:text-white/60"
              : "text-white/15 cursor-not-allowed"
          }`}
          title={!webglAvailable ? "WebGL unavailable" : undefined}
        >
          <Globe2 className="h-3 w-3" />3D
          {!webglAvailable && <span className="text-[8px] text-white/15 ml-0.5">N/A</span>}
        </button>
      </div>

      {/* Filters (2D only) */}
      {mapMode === "2d" && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          counts={categoryCounts}
          showHeatmap={showHeatmap}
          onHeatmapToggle={() => setShowHeatmap((v) => !v)}
        />
      )}

      {/* Timeline */}
      {dateRange && (
        <TimelineSlider
          minDate={dateRange.min}
          maxDate={dateRange.max}
          position={timelinePosition}
          onPositionChange={(p) => { setTimelinePosition(p); setIsPlaying(false); }}
          isPlaying={isPlaying}
          onPlayPause={() => {
            if (timelinePosition >= 100) setTimelinePosition(0);
            setIsPlaying((v) => !v);
          }}
          onReset={() => { setTimelinePosition(0); setIsPlaying(false); }}
          isActive={timelineActive}
          onToggle={handleTimelineToggle}
          visibleCount={displayAlerts.length}
          totalCount={filteredAlerts.length}
        />
      )}

      {/* Event counter */}
      <div
        className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono"
        style={{ background: "rgba(4,4,6,0.88)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}
      >
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute h-full w-full rounded-full bg-red-500 opacity-60" />
          <span className="relative rounded-full h-1.5 w-1.5 bg-red-500" />
        </span>
        <span className="text-white font-bold">{displayAlerts.length}</span>
        <span className="text-white/30">/ {alerts?.length ?? 0} events</span>
        {selectedCountry && (
          <>
            <span className="text-white/15">·</span>
            <button
              className="text-primary hover:text-white transition-colors flex items-center gap-1"
              onClick={() => setSelectedCountry(null)}
            >
              {selectedCountry}
              <X className="h-3 w-3" />
            </button>
          </>
        )}
      </div>

      {/* Alert detail panel (only when no country selected) */}
      {!selectedCountry && (
        <AlertDetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlertId(null)} />
      )}

      {/* Country intelligence panel */}
      <CountryIntelPanel country={selectedCountry} onClose={() => setSelectedCountry(null)} />
    </div>
  );
}

// ── Alert detail panel ────────────────────────────────────────────────────────

function AlertDetailPanel({ alertId, onClose }: { alertId: string | null; onClose: () => void }) {
  const { data: alert, isLoading } = useGetAlert(alertId || "", {
    query: { enabled: !!alertId },
  });
  if (!alertId) return null;

  return (
    <div
      className="absolute top-4 right-4 bottom-4 w-full max-w-sm flex flex-col overflow-hidden z-[1000] rounded-xl"
      style={{ background: "rgba(4,4,6,0.96)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(20px)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35 flex items-center gap-2">
          <Activity className="h-3 w-3" />Incident Report
        </h3>
        <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full hover:bg-white/10 text-white/30" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading || !alert ? (
        <div className="flex-1 flex items-center justify-center">
          <Activity className="h-7 w-7 text-white/20 animate-spin" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-5 space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline"
                  className="bg-white/[0.04] border-white/10 capitalize font-mono text-[10px] flex items-center gap-1">
                  {CATEGORY_META[alert.category]?.icon}
                  {alert.category}
                </Badge>
                <Badge variant="outline"
                  className="capitalize font-mono text-[10px]"
                  style={{
                    color: SEVERITY_COLORS[alert.severity],
                    borderColor: `${SEVERITY_COLORS[alert.severity]}50`,
                    background: `${SEVERITY_COLORS[alert.severity]}12`,
                  }}>
                  {alert.severity}
                </Badge>
              </div>
              <h2 className="text-lg font-bold leading-tight text-white">{alert.title}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-white/40 font-mono">
                {(alert.country || alert.region) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3.5 w-3.5" />
                    <span>{alert.country || alert.region}</span>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" />
                  <span>{new Date(alert.publishedAt).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}</span>
                </div>
              </div>
            </div>

            {alert.description && (
              <p className="text-sm text-white/65 leading-relaxed">{alert.description}</p>
            )}

            {(alert.magnitude != null || alert.affectedPopulation != null) && (
              <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/[0.05]">
                {alert.magnitude != null && (
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Magnitude</p>
                    <p className="text-2xl font-bold font-mono text-white">{alert.magnitude.toFixed(1)}</p>
                  </div>
                )}
                {alert.affectedPopulation != null && (
                  <div className="space-y-1">
                    <p className="text-[9px] uppercase tracking-wider text-white/30 font-mono">
                      {alert.category === "conflict" ? "Est. Deaths" : "Est. Affected"}
                    </p>
                    <p className="text-xl font-bold font-mono flex items-center gap-1 text-white">
                      <Users className="h-4 w-4 text-white/30" />
                      {new Intl.NumberFormat("en-US", { notation: "compact" }).format(alert.affectedPopulation)}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-[9px] uppercase tracking-wider text-white/30 font-mono mb-2">Source</p>
              <a
                href={alert.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg transition-colors group"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)" }}
              >
                <span className="font-medium text-sm text-white/70 group-hover:text-white transition-colors">
                  {alert.source}
                </span>
                <ExternalLink className="h-4 w-4 text-white/20 group-hover:text-primary transition-colors" />
              </a>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
