import { useState, useMemo, lazy, Suspense, Component, type ReactNode } from "react";
import { useListAlerts, useGetAlert } from "@workspace/api-client-react";
import {
  X, ExternalLink, MapPin, Activity, Clock, Users, SlidersHorizontal,
  Tag, ChevronDown, ChevronUp, Swords, CloudLightning, Heart, Globe2,
  Flame, AlertTriangle, Landmark, Eye, EyeOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from "react-leaflet";
import "leaflet/dist/leaflet.css";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444",
  high: "#f97316",
  medium: "#eab308",
  low: "#3b82f6",
};

const CATEGORY_META: Record<string, { label: string; icon: ReactNode; color: string }> = {
  earthquake: { label: "Earthquake", icon: <Activity className="h-3.5 w-3.5" />, color: "#a78bfa" },
  disaster:   { label: "Disaster",   icon: <Flame className="h-3.5 w-3.5" />,    color: "#fb923c" },
  weather:    { label: "Weather",    icon: <CloudLightning className="h-3.5 w-3.5" />, color: "#38bdf8" },
  humanitarian: { label: "Humanitarian", icon: <Heart className="h-3.5 w-3.5" />, color: "#f472b6" },
  conflict:   { label: "Conflict",   icon: <Swords className="h-3.5 w-3.5" />,   color: "#ef4444" },
  health:     { label: "Health",     icon: <Heart className="h-3.5 w-3.5" />,     color: "#34d399" },
  political:  { label: "Political",  icon: <Landmark className="h-3.5 w-3.5" />, color: "#fbbf24" },
  other:      { label: "Other",      icon: <Globe2 className="h-3.5 w-3.5" />,   color: "#9ca3af" },
};

const ALL_CATEGORIES = Object.keys(CATEGORY_META);
const ALL_SEVERITIES = ["critical", "high", "medium", "low"] as const;

function isWebGLAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext("webgl") || canvas.getContext("experimental-webgl"))
    );
  } catch {
    return false;
  }
}

class ErrorBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

const GlobeView = lazy(() => import("@/components/globe-view"));

interface Filters {
  categories: Set<string>;
  severities: Set<string>;
  showLabels: boolean;
}

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

  function toggleAll() {
    if (filters.categories.size === ALL_CATEGORIES.length) {
      onChange({ ...filters, categories: new Set(["conflict"]) });
    } else {
      onChange({ ...filters, categories: new Set(ALL_CATEGORIES) });
    }
  }

  const totalVisible = Object.entries(counts)
    .filter(([cat]) => filters.categories.has(cat))
    .reduce((s, [, n]) => s + n, 0);

  return (
    <div className="absolute top-4 left-4 z-[1000] flex flex-col gap-2">
      {/* Collapsed toggle button */}
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

      {/* Labels toggle */}
      <button
        onClick={() => onChange({ ...filters, showLabels: !filters.showLabels })}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg backdrop-blur-xl border text-xs font-mono transition-colors shadow-lg ${
          filters.showLabels
            ? "bg-primary/20 border-primary/40 text-primary"
            : "bg-[#0d1117]/90 border-white/10 text-white hover:bg-white/10"
        }`}
      >
        {filters.showLabels ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
        <span>Labels</span>
      </button>

      {/* Expanded panel */}
      {open && (
        <div className="w-56 rounded-xl bg-[#0d1117]/95 backdrop-blur-xl border border-white/10 shadow-2xl p-3 space-y-3">

          {/* Categories */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1">
                <Tag className="h-3 w-3" /> Categories
              </span>
              <button
                onClick={toggleAll}
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
                      active
                        ? "bg-white/10 text-white"
                        : "bg-transparent text-white/40 hover:bg-white/5 hover:text-white/60"
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

          {/* Severity */}
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
        {alerts.map((alert) => {
          const isCritical = alert.severity === "critical";
          const isHigh = alert.severity === "high";
          const alwaysLabel = isCritical || isHigh;
          const radius =
            isCritical ? 9 : isHigh ? 7 : alert.severity === "medium" ? 5 : 4;
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
              {/* Permanent label for critical/high or when labels toggle is on */}
              {(alwaysLabel || showLabels) ? (
                <LeafletTooltip
                  direction="top"
                  offset={[0, -(radius + 2)]}
                  opacity={1}
                  permanent={alwaysLabel || showLabels}
                >
                  <span
                    style={{
                      fontSize: "10px",
                      fontFamily: "monospace",
                      color,
                      fontWeight: alwaysLabel ? "700" : "normal",
                      whiteSpace: "nowrap",
                      maxWidth: "160px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      display: "block",
                    }}
                  >
                    {alert.title.length > 36 ? alert.title.slice(0, 36) + "…" : alert.title}
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

export default function Home() {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [webglAvailable] = useState(() => isWebGLAvailable());
  const [filters, setFilters] = useState<Filters>({
    categories: new Set(ALL_CATEGORIES),
    severities: new Set(ALL_SEVERITIES),
    showLabels: false,
  });

  const { data: alerts, isLoading } = useListAlerts(undefined, {
    query: { refetchInterval: 60000 },
  });

  // Category counts for filter panel
  const categoryCounts = useMemo(() => {
    if (!alerts) return {} as Record<string, number>;
    const counts: Record<string, number> = {};
    for (const a of alerts) {
      counts[a.category] = (counts[a.category] || 0) + 1;
    }
    return counts;
  }, [alerts]);

  // Filtered alerts
  const filteredAlerts = useMemo(() => {
    if (!alerts) return [];
    return alerts.filter(
      (a) => filters.categories.has(a.category) && filters.severities.has(a.severity)
    );
  }, [alerts, filters]);

  const globeData = useMemo(() => {
    return filteredAlerts.map((alert) => ({
      ...alert,
      color: SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.low,
      size:
        alert.severity === "critical" ? 1.5 :
        alert.severity === "high" ? 1 :
        alert.severity === "medium" ? 0.7 : 0.4,
    }));
  }, [filteredAlerts]);

  const handlePointClick = (point: any) => setSelectedAlertId(point.id);

  return (
    <div className="relative w-full h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#050914]">
      <style>{`
        .leaflet-container { background: #050914 !important; }
        .leaflet-control-attribution { background: rgba(5,9,20,0.8) !important; color: #4b5563 !important; font-size: 10px !important; }
        .leaflet-control-attribution a { color: #6b7280 !important; }
        .leaflet-tile-pane { filter: brightness(0.95); }
        .leaflet-tooltip {
          background: rgba(13,17,23,0.92) !important;
          border: 1px solid rgba(255,255,255,0.12) !important;
          border-radius: 4px !important;
          box-shadow: 0 2px 8px rgba(0,0,0,0.5) !important;
          padding: 2px 6px !important;
          color: #e2e8f0 !important;
          font-size: 10px !important;
        }
        .leaflet-tooltip::before { display: none !important; }
      `}</style>

      {isLoading && !alerts && (
        <div className="absolute inset-0 z-[500] flex flex-col items-center justify-center bg-[#050914]/80 backdrop-blur-sm">
          <Activity className="h-12 w-12 text-primary animate-spin mb-4" />
          <p className="text-primary font-mono text-sm uppercase tracking-widest animate-pulse">
            Initializing Global Matrix...
          </p>
        </div>
      )}

      {webglAvailable ? (
        <ErrorBoundary fallback={
          <FlatMap alerts={filteredAlerts} onAlertClick={handlePointClick} showLabels={filters.showLabels} />
        }>
          <Suspense fallback={
            <FlatMap alerts={filteredAlerts} onAlertClick={handlePointClick} showLabels={filters.showLabels} />
          }>
            <GlobeView globeData={globeData} onPointClick={handlePointClick} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <FlatMap alerts={filteredAlerts} onAlertClick={handlePointClick} showLabels={filters.showLabels} />
      )}

      {/* Filter panel */}
      <FilterPanel filters={filters} onChange={setFilters} counts={categoryCounts} />

      {/* Live count badge */}
      <div className="absolute bottom-6 left-4 z-[1000] flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#0d1117]/90 backdrop-blur-xl border border-white/10 text-[11px] font-mono text-muted-foreground">
        <span className="h-1.5 w-1.5 rounded-full bg-green-400 animate-pulse" />
        <span className="text-white">{filteredAlerts.length}</span>
        <span>/ {alerts?.length ?? 0} events monitored</span>
      </div>

      <AlertDetailPanel alertId={selectedAlertId} onClose={() => setSelectedAlertId(null)} />
    </div>
  );
}

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
                  <span>{new Date(alert.publishedAt).toLocaleDateString()}</span>
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
                Source Intelligence
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
