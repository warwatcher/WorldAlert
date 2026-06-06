import {
  useState, useMemo, useEffect, lazy, Suspense, Component, type ReactNode,
} from "react";
import { useListAlerts, useGetAlert } from "@workspace/api-client-react";
import {
  X, ExternalLink, MapPin, Activity, Clock, Users, SlidersHorizontal,
  Tag, ChevronDown, ChevronUp, Swords, CloudLightning, Heart, Globe2,
  Flame, AlertTriangle, Landmark, Eye, EyeOff, Play, Pause,
  RotateCcw, Calendar,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip,
  Marker, useMapEvents,
} from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// ── Constants ────────────────────────────────────────────────────────────────

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
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

// Country name labels for the map
const COUNTRY_LABELS: { name: string; lat: number; lng: number }[] = [
  { name: "UNITED STATES", lat: 39.5, lng: -98.0 },
  { name: "CANADA", lat: 62.0, lng: -96.0 },
  { name: "MEXICO", lat: 24.0, lng: -102.0 },
  { name: "BRAZIL", lat: -10.0, lng: -53.0 },
  { name: "ARGENTINA", lat: -36.0, lng: -65.0 },
  { name: "COLOMBIA", lat: 4.0, lng: -74.0 },
  { name: "VENEZUELA", lat: 7.5, lng: -65.0 },
  { name: "PERU", lat: -9.5, lng: -75.0 },
  { name: "CHILE", lat: -33.0, lng: -71.0 },
  { name: "HAITI", lat: 19.0, lng: -72.5 },
  { name: "RUSSIA", lat: 64.0, lng: 95.0 },
  { name: "UKRAINE", lat: 49.0, lng: 31.0 },
  { name: "UNITED KINGDOM", lat: 53.5, lng: -1.5 },
  { name: "FRANCE", lat: 46.5, lng: 2.5 },
  { name: "GERMANY", lat: 51.5, lng: 10.5 },
  { name: "SPAIN", lat: 40.0, lng: -4.0 },
  { name: "ITALY", lat: 43.0, lng: 12.5 },
  { name: "POLAND", lat: 52.0, lng: 19.5 },
  { name: "TURKEY", lat: 39.0, lng: 35.0 },
  { name: "GEORGIA", lat: 42.0, lng: 43.5 },
  { name: "MOROCCO", lat: 32.0, lng: -6.0 },
  { name: "ALGERIA", lat: 28.0, lng: 2.5 },
  { name: "LIBYA", lat: 26.5, lng: 17.0 },
  { name: "EGYPT", lat: 27.0, lng: 30.0 },
  { name: "SUDAN", lat: 15.5, lng: 30.5 },
  { name: "ETHIOPIA", lat: 9.5, lng: 40.0 },
  { name: "SOMALIA", lat: 5.5, lng: 46.0 },
  { name: "KENYA", lat: -0.5, lng: 37.5 },
  { name: "DEM. REP. CONGO", lat: -4.5, lng: 23.5 },
  { name: "NIGERIA", lat: 9.0, lng: 8.0 },
  { name: "MALI", lat: 18.0, lng: -2.0 },
  { name: "SOUTH AFRICA", lat: -30.0, lng: 25.0 },
  { name: "MOZAMBIQUE", lat: -18.0, lng: 35.0 },
  { name: "SAUDI ARABIA", lat: 25.0, lng: 45.0 },
  { name: "YEMEN", lat: 16.0, lng: 47.5 },
  { name: "IRAN", lat: 32.0, lng: 54.0 },
  { name: "IRAQ", lat: 33.5, lng: 43.5 },
  { name: "SYRIA", lat: 34.5, lng: 38.5 },
  { name: "ISRAEL / PALESTINE", lat: 31.8, lng: 35.2 },
  { name: "LEBANON", lat: 33.9, lng: 35.5 },
  { name: "AFGHANISTAN", lat: 33.5, lng: 67.0 },
  { name: "PAKISTAN", lat: 30.0, lng: 70.0 },
  { name: "INDIA", lat: 22.0, lng: 79.0 },
  { name: "MYANMAR", lat: 20.0, lng: 96.5 },
  { name: "CHINA", lat: 36.0, lng: 104.0 },
  { name: "N. KOREA", lat: 40.0, lng: 127.0 },
  { name: "JAPAN", lat: 37.0, lng: 138.0 },
  { name: "PHILIPPINES", lat: 13.0, lng: 122.5 },
  { name: "INDONESIA", lat: -0.5, lng: 118.0 },
  { name: "AUSTRALIA", lat: -26.0, lng: 134.0 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch { return false; }
}

function formatDate(d: Date): string {
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

// ── Error Boundary ────────────────────────────────────────────────────────────

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
  severities: Set<string>;
  showLabels: boolean;
}

// ── Country label layer ───────────────────────────────────────────────────────

function makeCountryIcon(name: string) {
  return L.divIcon({
    html: `<span style="font-size:9px;font-family:ui-monospace,monospace;letter-spacing:0.09em;color:rgba(148,163,184,0.45);text-transform:uppercase;white-space:nowrap;pointer-events:none;text-shadow:0 1px 4px rgba(0,0,0,0.9),0 0 2px rgba(0,0,0,1)">${name}</span>`,
    className: "",
    iconSize: [0, 0],
    iconAnchor: [0, 4],
  });
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({ zoomend: (e) => onZoom(e.target.getZoom()) });
  return null;
}

function CountryLabels() {
  const [zoom, setZoom] = useState(2);
  if (zoom < 2 || zoom > 5) return null;
  return (
    <>
      <ZoomWatcher onZoom={setZoom} />
      {COUNTRY_LABELS.map((c) => (
        <Marker
          key={c.name}
          position={[c.lat, c.lng]}
          icon={makeCountryIcon(c.name)}
          interactive={false}
          zIndexOffset={-1000}
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
}: {
  filters: Filters;
  onChange: (f: Filters) => void;
  counts: Record<string, number>;
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

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[#0d1117]/90 backdrop-blur-xl border border-white/10 text-xs font-mono text-white hover:bg-white/10 transition-colors shadow-lg"
      >
        <SlidersHorizontal className="h-3.5 w-3.5 text-primary" />
        <span>Filters</span>
        <span className="ml-1 px-1.5 py-0.5 rounded bg-primary/20 text-primary text-[10px]">
          {totalVisible}
        </span>
        {open ? <ChevronUp className="h-3 w-3 text-muted-foreground" /> : <ChevronDown className="h-3 w-3 text-muted-foreground" />}
      </button>

      <button
        onClick={() => onChange({ ...filters, showLabels: !filters.showLabels })}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-xl border text-xs font-mono transition-colors shadow-lg ${
          filters.showLabels
            ? "bg-primary/20 border-primary/40 text-primary"
            : "bg-[#0d1117]/90 border-white/10 text-white hover:bg-white/10"
        }`}
      >
        {filters.showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <span>Event Labels</span>
      </button>

      {open && (
        <div className="w-56 rounded-xl bg-[#0d1117]/95 backdrop-blur-xl border border-white/10 shadow-2xl p-3 space-y-3">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" /> Categories
              </span>
              <button
                onClick={() => {
                  if (filters.categories.size === ALL_CATEGORIES.length) {
                    onChange({ ...filters, categories: new Set(["conflict"]) });
                  } else {
                    onChange({ ...filters, categories: new Set(ALL_CATEGORIES) });
                  }
                }}
                className="text-[10px] font-mono text-primary hover:text-primary/80 transition-colors"
              >
                {filters.categories.size === ALL_CATEGORIES.length ? "None" : "All"}
              </button>
            </div>
            <div className="space-y-1">
              {ALL_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const active = filters.categories.has(cat);
                const count = counts[cat] || 0;
                return (
                  <button
                    key={cat}
                    onClick={() => toggleCategory(cat)}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                      active ? "bg-white/10 text-white" : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/60"
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span style={{ color: active ? meta.color : undefined }}>{meta.icon}</span>
                      <span className="font-mono">{meta.label}</span>
                    </span>
                    <span
                      className="text-[10px] px-1.5 py-0.5 rounded font-mono"
                      style={{
                        background: active ? `${meta.color}22` : "rgba(255,255,255,0.05)",
                        color: active ? meta.color : "#6b7280",
                      }}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="border-t border-white/5" />

          <div>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1 mb-2">
              <AlertTriangle className="h-3 w-3" /> Severity
            </span>
            <div className="flex flex-wrap gap-1.5">
              {ALL_SEVERITIES.map((sev) => {
                const active = filters.severities.has(sev);
                const color = SEVERITY_COLORS[sev];
                return (
                  <button
                    key={sev}
                    onClick={() => toggleSeverity(sev)}
                    className="px-2 py-1 rounded-md text-[11px] font-mono capitalize transition-all border"
                    style={{
                      background: active ? `${color}22` : "transparent",
                      color: active ? color : "#6b7280",
                      borderColor: active ? `${color}55` : "rgba(255,255,255,0.07)",
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

// ── Timeline slider ───────────────────────────────────────────────────────────

function TimelineSlider({
  minDate,
  maxDate,
  position,
  onPositionChange,
  isPlaying,
  onPlayPause,
  onReset,
  isActive,
  onToggle,
  visibleCount,
  totalCount,
}: {
  minDate: Date;
  maxDate: Date;
  position: number;
  onPositionChange: (p: number) => void;
  isPlaying: boolean;
  onPlayPause: () => void;
  onReset: () => void;
  isActive: boolean;
  onToggle: () => void;
  visibleCount: number;
  totalCount: number;
}) {
  const currentDate = new Date(
    minDate.getTime() + (maxDate.getTime() - minDate.getTime()) * (position / 100)
  );

  return (
    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-2">
      {isActive && (
        <div className="w-[420px] rounded-xl bg-[#0d1117]/95 backdrop-blur-xl border border-white/10 shadow-2xl p-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Calendar className="h-3 w-3" />
              Timeline Replay
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-mono text-white/50">
                {visibleCount} <span className="text-white/30">of</span> {totalCount} events
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onPlayPause}
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-primary/20 border border-primary/30 text-primary hover:bg-primary/30 transition-colors"
            >
              {isPlaying ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
            </button>
            <button
              onClick={onReset}
              className="flex-shrink-0 flex items-center justify-center w-7 h-7 rounded-full bg-white/5 border border-white/10 text-white/50 hover:bg-white/10 hover:text-white transition-colors"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
            <div className="flex-1 relative">
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={position}
                onChange={(e) => onPositionChange(Number(e.target.value))}
                className="w-full h-1.5 rounded-full appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, hsl(var(--primary)) ${position}%, rgba(255,255,255,0.1) ${position}%)`,
                }}
              />
            </div>
            <span className="flex-shrink-0 text-[11px] font-mono text-white/70 min-w-[80px] text-right">
              {formatDate(currentDate)}
            </span>
          </div>

          <div className="flex justify-between mt-1 px-9">
            <span className="text-[9px] font-mono text-white/30">{formatDate(minDate)}</span>
            <span className="text-[9px] font-mono text-white/30">{formatDate(maxDate)}</span>
          </div>
        </div>
      )}

      <button
        onClick={onToggle}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-xl border text-xs font-mono transition-colors shadow-lg ${
          isActive
            ? "bg-primary/20 border-primary/40 text-primary"
            : "bg-[#0d1117]/90 border-white/10 text-white hover:bg-white/10"
        }`}
      >
        <Calendar className="h-3.5 w-3.5" />
        <span>Timeline</span>
      </button>
    </div>
  );
}

// ── Map ───────────────────────────────────────────────────────────────────────

function FlatMap({
  alerts,
  onAlertClick,
  showLabels,
}: {
  alerts: any[];
  onAlertClick: (a: any) => void;
  showLabels: boolean;
}) {
  return (
    <div className="absolute inset-0">
      <MapContainer
        center={[20, 0]}
        zoom={2}
        minZoom={1}
        maxZoom={10}
        style={{ height: "100%", width: "100%", background: "#050914" }}
        zoomControl
      >
        <TileLayer
          url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
          attribution='&copy; <a href="https://carto.com/">CARTO</a>'
        />
        <CountryLabels />
        {alerts.map((alert) => {
          const isCritical = alert.severity === "critical";
          const isHigh = alert.severity === "high";
          const alwaysLabel = isCritical || isHigh;
          const radius = isCritical ? 9 : isHigh ? 7 : alert.severity === "medium" ? 5 : 4;
          const color = SEVERITY_COLORS[alert.severity] || "#3b82f6";

          return (
            <CircleMarker
              key={alert.id}
              center={[alert.lat, alert.lng]}
              radius={radius}
              pathOptions={{
                color,
                fillColor: color,
                fillOpacity: isCritical ? 0.9 : 0.75,
                weight: isCritical ? 2 : 1.5,
              }}
              eventHandlers={{ click: () => onAlertClick(alert) }}
            >
              {(alwaysLabel || showLabels) ? (
                <LeafletTooltip
                  direction="top"
                  offset={[0, -(radius + 2)]}
                  opacity={1}
                  permanent={true}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontFamily: "monospace",
                      color,
                      fontWeight: alwaysLabel ? "700" : "normal",
                      whiteSpace: "nowrap",
                    }}
                  >
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
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [webglAvailable] = useState(() => isWebGLAvailable());

  const [filters, setFilters] = useState<Filters>({
    categories: new Set(ALL_CATEGORIES),
    severities: new Set(ALL_SEVERITIES),
    showLabels: false,
  });

  // Timeline state
  const [timelineActive, setTimelineActive] = useState(false);
  const [timelinePosition, setTimelinePosition] = useState(100);
  const [isPlaying, setIsPlaying] = useState(false);

  const { data: alerts, isLoading } = useListAlerts(undefined, {
    query: { refetchInterval: 60000 },
  });

  // Date range for timeline
  const dateRange = useMemo(() => {
    if (!alerts || alerts.length === 0) return null;
    const times = alerts
      .map((a) => new Date(a.publishedAt).getTime())
      .filter((t) => !isNaN(t));
    if (!times.length) return null;
    return { min: new Date(Math.min(...times)), max: new Date() };
  }, [alerts]);

  // Current timeline date
  const timelineDate = useMemo(() => {
    if (!dateRange) return null;
    const t = dateRange.min.getTime() +
      (dateRange.max.getTime() - dateRange.min.getTime()) * (timelinePosition / 100);
    return new Date(t);
  }, [dateRange, timelinePosition]);

  // Auto-play animation
  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setTimelinePosition((p) => {
        if (p >= 100) { setIsPlaying(false); return 100; }
        return Math.min(p + 0.4, 100);
      });
    }, 80);
    return () => clearInterval(interval);
  }, [isPlaying]);

  // Category counts
  const categoryCounts = useMemo(() => {
    if (!alerts) return {} as Record<string, number>;
    const c: Record<string, number> = {};
    for (const a of alerts) c[a.category] = (c[a.category] || 0) + 1;
    return c;
  }, [alerts]);

  // Apply category + severity filters
  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    return alerts.filter(
      (a) => filters.categories.has(a.category) && filters.severities.has(a.severity)
    );
  }, [alerts, filters]);

  // Apply timeline filter on top
  const displayAlerts = useMemo(() => {
    if (!timelineActive || !timelineDate) return filteredAlerts;
    return filteredAlerts.filter((a) => new Date(a.publishedAt) <= timelineDate!);
  }, [filteredAlerts, timelineActive, timelineDate]);

  const globeData = useMemo(() =>
    displayAlerts.map((a) => ({
      ...a,
      color: SEVERITY_COLORS[a.severity] || SEVERITY_COLORS.low,
      size: a.severity === "critical" ? 1.5 : a.severity === "high" ? 1 : a.severity === "medium" ? 0.7 : 0.4,
    })),
    [displayAlerts]
  );

  const handlePointClick = (point: any) => setSelectedAlertId(point.id);

  function handleTimelineToggle() {
    setTimelineActive((v) => {
      if (v) { setIsPlaying(false); setTimelinePosition(100); }
      return !v;
    });
  }

  return (
    <div className="relative w-full h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#050914]">
      <style>{`
        .leaflet-container { background: #050914 !important; }
        .leaflet-control-attribution {
          background: rgba(5,9,20,0.8) !important;
          color: #4b5563 !important;
          font-size: 10px !important;
        }
        .leaflet-control-attribution a { color: #6b7280 !important; }
        .leaflet-tile-pane { filter: brightness(0.95); }
        .leaflet-tooltip {
          background: rgba(13,17,23,0.9) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 10px rgba(0,0,0,0.6) !important;
          padding: 2px 7px !important;
          color: #e2e8f0 !important;
        }
        .leaflet-tooltip::before { display: none !important; }
        input[type=range]::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px;
          border-radius: 50%;
          background: hsl(var(--primary));
          cursor: pointer;
          border: 2px solid rgba(255,255,255,0.3);
          box-shadow: 0 0 6px rgba(0,0,0,0.5);
        }
        input[type=range]::-moz-range-thumb {
          width: 14px; height: 14px;
          border-radius: 50%;
          background: hsl(var(--primary));
          cursor: pointer;
          border: 2px solid rgba(255,255,255,0.3);
        }
      `}</style>

      {isLoading && !alerts && (
        <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center bg-[#050914]/80 backdrop-blur-sm">
          <Activity className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-primary font-mono text-sm uppercase tracking-widest animate-pulse">
            Initializing Global Matrix…
          </p>
        </div>
      )}

      {webglAvailable ? (
        <ErrorBoundary fallback={<FlatMap alerts={displayAlerts} onAlertClick={handlePointClick} showLabels={filters.showLabels} />}>
          <Suspense fallback={<FlatMap alerts={displayAlerts} onAlertClick={handlePointClick} showLabels={filters.showLabels} />}>
            <GlobeView globeData={globeData} onPointClick={handlePointClick} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <FlatMap alerts={displayAlerts} onAlertClick={handlePointClick} showLabels={filters.showLabels} />
      )}

      <FilterPanel filters={filters} onChange={setFilters} counts={categoryCounts} />

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

      <div className="absolute bottom-6 left-4 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1117]/90 backdrop-blur-xl border border-white/10 text-[11px] font-mono text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-white">{displayAlerts.length}</span>
        <span>/ {alerts?.length ?? 0} events monitored</span>
      </div>

      <AlertDetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlertId(null)} />
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
    <div className="absolute top-4 right-4 bottom-4 w-full max-w-sm bg-card/90 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl flex flex-col overflow-hidden z-[1000] animate-in slide-in-from-right duration-300">
      <div className="flex items-center justify-between p-4 border-b border-white/5">
        <h3 className="font-mono text-xs uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <Activity className="h-3 w-3" />
          Incident Report
        </h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 rounded-full hover:bg-white/10 text-muted-foreground"
          onClick={onClose}
          data-testid="button-close-panel"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {isLoading || !alert ? (
        <div className="flex-1 flex items-center justify-center p-8">
          <Activity className="h-8 w-8 text-muted-foreground animate-spin" />
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-6 space-y-5">
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                <Badge
                  variant="outline"
                  className="bg-background/50 border-white/10 capitalize font-mono text-xs flex items-center gap-1"
                  data-testid="badge-category"
                >
                  {CATEGORY_META[alert.category]?.icon}
                  {alert.category}
                </Badge>
                <Badge
                  variant="outline"
                  className="capitalize font-mono text-xs"
                  style={{
                    color: SEVERITY_COLORS[alert.severity],
                    borderColor: SEVERITY_COLORS[alert.severity],
                    background: `${SEVERITY_COLORS[alert.severity]}18`,
                  }}
                  data-testid="badge-severity"
                >
                  {alert.severity}
                </Badge>
              </div>
              <h2 className="text-xl font-bold leading-tight" data-testid="text-alert-title">
                {alert.title}
              </h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground font-mono">
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
              <p className="text-sm text-foreground/80 leading-relaxed" data-testid="text-alert-description">
                {alert.description}
              </p>
            )}

            {(alert.magnitude != null || alert.affectedPopulation != null) && (
              <div className="grid grid-cols-2 gap-4 py-4 border-y border-white/5">
                {alert.magnitude != null && (
                  <div className="space-y-1" data-testid="stat-magnitude">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Magnitude</p>
                    <p className="text-2xl font-bold font-mono">{alert.magnitude.toFixed(1)}</p>
                  </div>
                )}
                {alert.affectedPopulation != null && (
                  <div className="space-y-1" data-testid="stat-affected">
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">
                      {alert.category === "conflict" ? "Est. Deaths" : "Est. Affected"}
                    </p>
                    <p className="text-xl font-bold font-mono flex items-center gap-1">
                      <Users className="h-4 w-4 text-muted-foreground" />
                      {new Intl.NumberFormat("en-US", { notation: "compact" }).format(alert.affectedPopulation)}
                    </p>
                  </div>
                )}
              </div>
            )}

            <div>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono mb-3">
                Source
              </p>
              <a
                href={alert.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 transition-colors group"
                data-testid="link-source"
              >
                <span className="font-medium text-sm">{alert.source}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors" />
              </a>
            </div>
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
