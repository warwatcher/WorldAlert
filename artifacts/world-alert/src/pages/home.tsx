import {
  useState, useMemo, useEffect, lazy, Suspense, Component, type ReactNode,
} from "react";
import { useListAlerts, useGetAlert } from "@workspace/api-client-react";
import {
  X, ExternalLink, MapPin, Activity, Clock, Users, SlidersHorizontal,
  ChevronDown, ChevronUp, Swords, CloudLightning, Heart, Globe2,
  Flame, Landmark, Eye, EyeOff, Play, Pause,
  RotateCcw, Calendar, Layers, Map as MapIcon, AlertTriangle, Tag,
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

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high:     "#f97316",
  medium:   "#eab308",
  low:      "#3b82f6",
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

const COUNTRY_LABELS: { name: string; lat: number; lng: number }[] = [
  { name: "UNITED STATES", lat: 39.5,  lng: -98.0  },
  { name: "CANADA",        lat: 62.0,  lng: -96.0  },
  { name: "MEXICO",        lat: 24.0,  lng: -102.0 },
  { name: "BRAZIL",        lat: -10.0, lng: -53.0  },
  { name: "ARGENTINA",     lat: -36.0, lng: -65.0  },
  { name: "COLOMBIA",      lat:   4.0, lng: -74.0  },
  { name: "VENEZUELA",     lat:   7.5, lng: -65.0  },
  { name: "PERU",          lat:  -9.5, lng: -75.0  },
  { name: "CHILE",         lat: -33.0, lng: -71.0  },
  { name: "HAITI",         lat:  19.0, lng: -72.5  },
  { name: "RUSSIA",        lat:  64.0, lng:  95.0  },
  { name: "UKRAINE",       lat:  49.0, lng:  31.0  },
  { name: "UNITED KINGDOM",lat:  53.5, lng:  -1.5  },
  { name: "FRANCE",        lat:  46.5, lng:   2.5  },
  { name: "GERMANY",       lat:  51.5, lng:  10.5  },
  { name: "SPAIN",         lat:  40.0, lng:  -4.0  },
  { name: "ITALY",         lat:  43.0, lng:  12.5  },
  { name: "POLAND",        lat:  52.0, lng:  19.5  },
  { name: "TURKEY",        lat:  39.0, lng:  35.0  },
  { name: "GEORGIA",       lat:  42.0, lng:  43.5  },
  { name: "MOROCCO",       lat:  32.0, lng:  -6.0  },
  { name: "ALGERIA",       lat:  28.0, lng:   2.5  },
  { name: "LIBYA",         lat:  26.5, lng:  17.0  },
  { name: "EGYPT",         lat:  27.0, lng:  30.0  },
  { name: "SUDAN",         lat:  15.5, lng:  30.5  },
  { name: "ETHIOPIA",      lat:   9.5, lng:  40.0  },
  { name: "SOMALIA",       lat:   5.5, lng:  46.0  },
  { name: "KENYA",         lat:  -0.5, lng:  37.5  },
  { name: "DEM. REP. CONGO",lat: -4.5, lng:  23.5  },
  { name: "NIGERIA",       lat:   9.0, lng:   8.0  },
  { name: "MALI",          lat:  18.0, lng:  -2.0  },
  { name: "SOUTH AFRICA",  lat: -30.0, lng:  25.0  },
  { name: "MOZAMBIQUE",    lat: -18.0, lng:  35.0  },
  { name: "SAUDI ARABIA",  lat:  25.0, lng:  45.0  },
  { name: "YEMEN",         lat:  16.0, lng:  47.5  },
  { name: "IRAN",          lat:  32.0, lng:  54.0  },
  { name: "IRAQ",          lat:  33.5, lng:  43.5  },
  { name: "SYRIA",         lat:  34.5, lng:  38.5  },
  { name: "ISRAEL/PALESTINE",lat:31.8, lng:  35.2  },
  { name: "LEBANON",       lat:  33.9, lng:  35.5  },
  { name: "AFGHANISTAN",   lat:  33.5, lng:  67.0  },
  { name: "PAKISTAN",      lat:  30.0, lng:  70.0  },
  { name: "INDIA",         lat:  22.0, lng:  79.0  },
  { name: "MYANMAR",       lat:  20.0, lng:  96.5  },
  { name: "CHINA",         lat:  36.0, lng: 104.0  },
  { name: "N. KOREA",      lat:  40.0, lng: 127.0  },
  { name: "JAPAN",         lat:  37.0, lng: 138.0  },
  { name: "PHILIPPINES",   lat:  13.0, lng: 122.5  },
  { name: "INDONESIA",     lat:  -0.5, lng: 118.0  },
  { name: "AUSTRALIA",     lat: -26.0, lng: 134.0  },
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

// ── Country labels ────────────────────────────────────────────────────────────

function makeCountryIcon(name: string, clickable = false) {
  return L.divIcon({
    html: `<span style="font-size:9px;font-family:ui-monospace,monospace;letter-spacing:0.09em;color:rgba(148,163,184,${clickable ? "0.6" : "0.4"});text-transform:uppercase;white-space:nowrap;pointer-events:${clickable ? "auto" : "none"};text-shadow:0 1px 4px rgba(0,0,0,0.9);${clickable ? "cursor:pointer;" : ""}">${name}</span>`,
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 4],
  });
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) });
  return null;
}

function CountryLabels({ onCountryClick }: { onCountryClick?: (name: string) => void }) {
  const [zoom, setZoom] = useState(2);
  if (zoom < 2 || zoom > 5) return null;
  return (
    <>
      <ZoomWatcher onZoom={setZoom} />
      {COUNTRY_LABELS.map((c) => (
        <Marker
          key={c.name}
          position={[c.lat, c.lng]}
          icon={makeCountryIcon(c.name, !!onCountryClick)}
          interactive={!!onCountryClick}
          zIndexOffset={-1000}
          eventHandlers={onCountryClick ? { click: () => onCountryClick(c.name) } : undefined}
        />
      ))}
    </>
  );
}

// ── Filter panel ──────────────────────────────────────────────────────────────

function FilterPanel({
  filters,
  onChange,
  counts,
  showHeatmap,
  onHeatmapToggle,
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  counts: Record<string, number>;
  showHeatmap: boolean;
  onHeatmapToggle: () => void;
}) {
  const [open, setOpen] = useState(false);

  function toggleCategory(cat: string) {
    const next = new Set(filters.categories);
    if (next.has(cat)) { if (next.size > 1) next.delete(cat); }
    else next.add(cat);
    onChange({ ...filters, categories: next });
  }

  function toggleSeverity(sev: string) {
    const next = new Set(filters.severities);
    if (next.has(sev)) { if (next.size > 1) next.delete(sev); }
    else next.add(sev);
    onChange({ ...filters, severities: next });
  }

  const totalVisible = Object.entries(counts)
    .filter(([cat]) => filters.categories.has(cat))
    .reduce((s, [, n]) => s + n, 0);

  const btn = "flex items-center gap-2 px-3 py-1.5 rounded-lg backdrop-blur-xl border text-[11px] font-mono transition-colors shadow-lg";
  const inactive = "bg-black/85 border-white/[0.08] text-white/70 hover:bg-white/[0.06] hover:text-white";
  const active   = "bg-primary/15 border-primary/35 text-primary";

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-1.5">
      {/* Filters toggle */}
      <button onClick={() => setOpen((o) => !o)} className={`${btn} ${inactive}`}>
        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
        <span>Filters</span>
        <span className="ml-0.5 px-1.5 py-0.5 rounded bg-primary/15 text-primary text-[9px] font-bold">
          {totalVisible}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-white/30" /> : <ChevronDown className="h-3 w-3 text-white/30" />}
      </button>

      {/* Labels toggle */}
      <button
        onClick={() => onChange({ ...filters, showLabels: !filters.showLabels })}
        className={`${btn} ${filters.showLabels ? active : inactive}`}
      >
        {filters.showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <span>Event Labels</span>
      </button>

      {/* Heatmap toggle */}
      <button
        onClick={onHeatmapToggle}
        className={`${btn} ${showHeatmap ? "bg-orange-500/15 border-orange-500/35 text-orange-400" : inactive}`}
      >
        <Layers className="h-3.5 w-3.5" />
        <span>Heat Map</span>
        {showHeatmap && <span className="h-1.5 w-1.5 rounded-full bg-orange-400 animate-pulse" />}
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="w-52 rounded-xl border border-white/[0.08] shadow-2xl p-3 space-y-3"
          style={{ background: "rgba(4,4,6,0.95)", backdropFilter: "blur(20px)" }}>
          {/* Categories */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[9px] font-mono uppercase tracking-widest text-white/30">Categories</span>
              <button
                onClick={() => onChange({ ...filters, categories: new Set(ALL_CATEGORIES) })}
                className="text-[9px] font-mono text-white/25 hover:text-white/50 transition-colors"
              >
                all
              </button>
            </div>
            <div className="space-y-0.5">
              {ALL_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const on = filters.categories.has(cat);
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] transition-colors ${
                      on ? "bg-white/[0.06] text-white" : "text-white/25 hover:text-white/50"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span style={{ color: on ? meta.color : undefined }}>{meta.icon}</span>
                      <span className="font-mono">{meta.label}</span>
                    </span>
                    <span className="text-[9px] font-mono text-white/25">{counts[cat] ?? 0}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Severities */}
          <div>
            <span className="text-[9px] font-mono uppercase tracking-widest text-white/30 block mb-1.5">Severity</span>
            <div className="flex gap-1 flex-wrap">
              {ALL_SEVERITIES.map((sev) => {
                const on = filters.severities.has(sev);
                return (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    className="px-2 py-0.5 rounded text-[10px] font-mono uppercase transition-colors border"
                    style={{
                      color: on ? SEVERITY_COLORS[sev] : "rgba(255,255,255,0.2)",
                      borderColor: on ? `${SEVERITY_COLORS[sev]}50` : "rgba(255,255,255,0.06)",
                      background: on ? `${SEVERITY_COLORS[sev]}12` : "transparent",
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
  minDate: Date; maxDate: Date; position: number;
  onPositionChange: (p: number) => void;
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
          style={{ background: "rgba(4,4,6,0.95)", backdropFilter: "blur(20px)" }}>
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
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-primary/15 border border-primary/25 text-primary hover:bg-primary/25 transition-colors">
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button onClick={onReset}
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-white/5 border border-white/[0.08] text-white/35 hover:bg-white/10 hover:text-white transition-colors">
              <RotateCcw className="h-3 w-3" />
            </button>
            <div className="flex-1 relative">
              <input type="range" min={0} max={100} step={0.1} value={position}
                onChange={(e) => onPositionChange(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{ background: `linear-gradient(to right, hsl(var(--primary)) ${position}%, rgba(255,255,255,0.08) ${position}%)` }}
              />
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
        <span>Timeline</span>
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
        a.severity === "critical" ? 1.0 :
        a.severity === "high"     ? 0.72 :
        a.severity === "medium"   ? 0.42 : 0.18,
      ] as [number, number, number]);
    if (!points.length) return;
    const heat = (L as any).heatLayer(points, {
      radius: 32, blur: 24, maxZoom: 10, max: 1.0,
      gradient: {
        0.00: "rgba(0,0,0,0)", 0.18: "#1d4ed8", 0.38: "#0ea5e9",
        0.52: "#eab308",       0.68: "#f97316", 0.84: "#ef4444",
        1.00: "#ffffff",
      },
    });
    heat.addTo(map);
    return () => { map.removeLayer(heat); };
  }, [map, alerts]);
  return null;
}

// ── Flat 2-D map ──────────────────────────────────────────────────────────────

function FlatMap({
  alerts,
  onAlertClick,
  onCountryClick,
  showLabels,
  showHeatmap,
}: {
  alerts: any[];
  onAlertClick: (a: any) => void;
  onCountryClick?: (name: string) => void;
  showLabels: boolean;
  showHeatmap: boolean;
}) {
  return (
    <div className="absolute inset-0">
      <style>{`
        .leaflet-container { background: #000 !important; }
        .leaflet-control-attribution {
          background: rgba(0,0,0,0.7) !important;
          color: #374151 !important; font-size: 9px !important;
        }
        .leaflet-control-attribution a { color: #4b5563 !important; }
        .leaflet-tile-pane { filter: brightness(0.85) saturate(0.8); }
        .leaflet-tooltip {
          background: rgba(4,4,6,0.92) !important;
          border: 1px solid rgba(255,255,255,0.1) !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 12px rgba(0,0,0,0.7) !important;
          padding: 2px 7px !important; color: #e2e8f0 !important;
        }
        .leaflet-tooltip::before { display: none !important; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none; width: 13px; height: 13px;
          border-radius: 50%; background: hsl(var(--primary));
          cursor: pointer; border: 2px solid rgba(255,255,255,0.25);
        }
        input[type=range]::-moz-range-thumb {
          width: 13px; height: 13px; border-radius: 50%;
          background: hsl(var(--primary)); cursor: pointer;
          border: 2px solid rgba(255,255,255,0.25);
        }
      `}</style>
      <MapContainer center={[20, 0]} zoom={2} minZoom={1} maxZoom={10}
        style={{ height: "100%", width: "100%", background: "#000" }} zoomControl>
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <CountryLabels onCountryClick={onCountryClick} />
        {showHeatmap && <HeatmapLayer alerts={alerts} />}
        {alerts.map((alert) => {
          const isCritical = alert.severity === "critical";
          const isHigh     = alert.severity === "high";
          if (showHeatmap && !isCritical && !isHigh) return null;
          const alwaysLabel = isCritical;
          const radius  = isCritical ? 9 : isHigh ? 7 : alert.severity === "medium" ? 5 : 4;
          const color   = SEVERITY_COLORS[alert.severity] || "#3b82f6";
          const opacity = showHeatmap ? (isCritical ? 1 : 0.7) : (isCritical ? 0.9 : 0.75);
          return (
            <CircleMarker
              key={alert.id}
              center={[alert.lat, alert.lng]}
              radius={radius}
              pathOptions={{ color, fillColor: color, fillOpacity: opacity, weight: isCritical ? 2 : 1.5 }}
              eventHandlers={{ click: () => onAlertClick(alert) }}
            >
              {(alwaysLabel || showLabels) ? (
                <LeafletTooltip direction="top" offset={[0, -(radius + 2)]} opacity={1} permanent>
                  <span style={{ fontSize: "10px", fontFamily: "monospace", color, fontWeight: alwaysLabel ? "700" : "normal", whiteSpace: "nowrap" }}>
                    {alert.title.length > 38 ? alert.title.slice(0, 38) + "…" : alert.title}
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

// ── Page ──────────────────────────────────────────────────────────────────────

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

  // Timeline
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
    const t = dateRange.min.getTime() +
      (dateRange.max.getTime() - dateRange.min.getTime()) * (timelinePosition / 100);
    return new Date(t);
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

  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    return alerts.filter(
      (a) => filters.categories.has(a.category) && filters.severities.has(a.severity)
    );
  }, [alerts, filters]);

  const displayAlerts = useMemo(() => {
    if (!timelineActive || !timelineDate) return filteredAlerts;
    return filteredAlerts.filter((a) => new Date(a.publishedAt) <= timelineDate!);
  }, [filteredAlerts, timelineActive, timelineDate]);

  const globeData = useMemo(() =>
    displayAlerts.map((a) => ({
      ...a,
      color: SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.low,
      size: a.severity === "critical" ? 1.5 : a.severity === "high" ? 1 : a.severity === "medium" ? 0.7 : 0.4,
    })), [displayAlerts]
  );

  // Mutual exclusion: alert panel vs. country panel
  const handlePointClick = (point: any) => {
    setSelectedAlertId(point.id);
    setSelectedCountry(null);
  };
  const handleCountryClick = (name: string) => {
    // Convert "UNITED STATES" → "United States" for the API
    const displayName = name.replace(/\//g, " / ").replace(
      /\w+/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    );
    setSelectedCountry(displayName);
    setSelectedAlertId(null);
  };
  function handleTimelineToggle() {
    setTimelineActive((v) => {
      if (v) { setIsPlaying(false); setTimelinePosition(100); }
      return !v;
    });
  }

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
    <div className="relative w-full h-[calc(100dvh-3.5rem)] overflow-hidden" style={{ background: "#000" }}>

      {/* Loading overlay */}
      {isLoading && !alerts && (
        <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center"
          style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(12px)" }}>
          <div className="relative mb-6">
            <div className="h-16 w-16 rounded-full border border-primary/20 flex items-center justify-center">
              <Activity className="h-8 w-8 text-primary animate-spin" />
            </div>
          </div>
          <p className="text-primary font-mono text-xs uppercase tracking-[0.25em] animate-pulse">
            Initializing Global Intelligence Matrix…
          </p>
        </div>
      )}

      {/* ── Map / Globe ──────────────────────────────────────────────────── */}
      {mapMode === "3d" && webglAvailable ? (
        <ErrorBoundary fallback={flatMap}>
          <Suspense fallback={flatMap}>
            <GlobeView globeData={globeData} onPointClick={handlePointClick} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        flatMap
      )}

      {/* ── Map mode toggle ──────────────────────────────────────────────── */}
      <div className="absolute top-4 right-4 z-[1000] flex rounded-lg overflow-hidden"
        style={{ background: "rgba(4,4,6,0.9)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(16px)" }}>
        <button
          onClick={() => setMapMode("2d")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono transition-colors ${
            mapMode === "2d" ? "bg-white/10 text-white" : "text-white/35 hover:text-white/60"
          }`}
        >
          <MapIcon className="h-3 w-3" />
          2D
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
          title={!webglAvailable ? "WebGL unavailable in this environment" : undefined}
        >
          <Globe2 className="h-3 w-3" />
          3D
          {!webglAvailable && <span className="text-[8px] text-white/20 ml-0.5">N/A</span>}
        </button>
      </div>

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      {mapMode === "2d" && (
        <FilterPanel
          filters={filters}
          onChange={setFilters}
          counts={categoryCounts}
          showHeatmap={showHeatmap}
          onHeatmapToggle={() => setShowHeatmap((v) => !v)}
        />
      )}

      {/* ── Timeline ─────────────────────────────────────────────────────── */}
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

      {/* ── Live event counter ───────────────────────────────────────────── */}
      <div className="absolute bottom-4 left-4 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono"
        style={{ background: "rgba(4,4,6,0.88)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }}>
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-60" />
          <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-400" />
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

      {/* ── Alert detail panel ────────────────────────────────────────────── */}
      {!selectedCountry && (
        <AlertDetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlertId(null)} />
      )}

      {/* ── Country intelligence panel ────────────────────────────────────── */}
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
    <div className="absolute top-4 right-4 bottom-4 w-full max-w-sm flex flex-col overflow-hidden z-[1000] rounded-xl"
      style={{ background: "rgba(4,4,6,0.95)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(20px)", boxShadow: "0 20px 60px rgba(0,0,0,0.8)" }}
      // slide in from right
    >
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <h3 className="font-mono text-[9px] uppercase tracking-[0.18em] text-white/35 flex items-center gap-2">
          <Activity className="h-3 w-3" />
          Incident Report
        </h3>
        <Button variant="ghost" size="icon"
          className="h-7 w-7 rounded-full hover:bg-white/10 text-white/30"
          onClick={onClose}
          data-testid="button-close-panel"
        >
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
                  className="bg-white/[0.04] border-white/10 capitalize font-mono text-[10px] flex items-center gap-1"
                  data-testid="badge-category">
                  {CATEGORY_META[alert.category]?.icon}
                  {alert.category}
                </Badge>
                <Badge variant="outline"
                  className="capitalize font-mono text-[10px]"
                  style={{
                    color: SEVERITY_COLORS[alert.severity],
                    borderColor: `${SEVERITY_COLORS[alert.severity]}50`,
                    background: `${SEVERITY_COLORS[alert.severity]}12`,
                  }}
                  data-testid="badge-severity">
                  {alert.severity}
                </Badge>
              </div>
              <h2 className="text-lg font-bold leading-tight text-white" data-testid="text-alert-title">
                {alert.title}
              </h2>
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
              <p className="text-sm text-white/65 leading-relaxed" data-testid="text-alert-description">
                {alert.description}
              </p>
            )}

            {(alert.magnitude != null || alert.affectedPopulation != null) && (
              <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/[0.05]">
                {alert.magnitude != null && (
                  <div className="space-y-1" data-testid="stat-magnitude">
                    <p className="text-[9px] uppercase tracking-wider text-white/30 font-mono">Magnitude</p>
                    <p className="text-2xl font-bold font-mono text-white">{alert.magnitude.toFixed(1)}</p>
                  </div>
                )}
                {alert.affectedPopulation != null && (
                  <div className="space-y-1" data-testid="stat-affected">
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
                data-testid="link-source"
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
