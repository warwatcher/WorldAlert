import { useState, useMemo, useEffect, lazy, Suspense, Component, type ReactNode } from "react";
import { useListAlerts, useGetAlert } from "@workspace/api-client-react";
import { X, ExternalLink, MapPin, Activity, Clock, Users } from "lucide-react";
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

function FlatMap({ alerts, onAlertClick }: { alerts: any[]; onAlertClick: (a: any) => void }) {
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
        {alerts.map((alert) => (
          <CircleMarker
            key={alert.id}
            center={[alert.lat, alert.lng]}
            radius={
              alert.severity === "critical" ? 9 :
              alert.severity === "high" ? 7 :
              alert.severity === "medium" ? 5 : 4
            }
            pathOptions={{
              color: SEVERITY_COLORS[alert.severity] || "#3b82f6",
              fillColor: SEVERITY_COLORS[alert.severity] || "#3b82f6",
              fillOpacity: 0.75,
              weight: 1.5,
            }}
            eventHandlers={{ click: () => onAlertClick(alert) }}
          >
            <LeafletTooltip direction="top" offset={[0, -4]} opacity={0.95}>
              <span style={{ fontSize: "11px", fontFamily: "monospace" }}>{alert.title}</span>
            </LeafletTooltip>
          </CircleMarker>
        ))}
      </MapContainer>
    </div>
  );
}

export default function Home() {
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [webglAvailable] = useState(() => isWebGLAvailable());

  const { data: alerts, isLoading } = useListAlerts(undefined, {
    query: { refetchInterval: 60000 },
  });

  const globeData = useMemo(() => {
    if (!alerts) return [];
    return alerts.map((alert) => ({
      ...alert,
      color: SEVERITY_COLORS[alert.severity] || SEVERITY_COLORS.low,
      size: alert.severity === "critical" ? 1.5 : alert.severity === "high" ? 1 : alert.severity === "medium" ? 0.7 : 0.4,
    }));
  }, [alerts]);

  const handlePointClick = (point: any) => setSelectedAlertId(point.id);

  const flatAlerts = alerts ?? [];

  return (
    <div className="relative w-full h-[calc(100dvh-3.5rem)] overflow-hidden bg-[#050914]">
      <style>{`
        .leaflet-container { background: #050914 !important; }
        .leaflet-control-attribution { background: rgba(5,9,20,0.8) !important; color: #4b5563 !important; font-size: 10px !important; }
        .leaflet-control-attribution a { color: #6b7280 !important; }
        .leaflet-tile-pane { filter: brightness(0.95); }
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
        <ErrorBoundary fallback={<FlatMap alerts={flatAlerts} onAlertClick={handlePointClick} />}>
          <Suspense fallback={<FlatMap alerts={flatAlerts} onAlertClick={handlePointClick} />}>
            <GlobeView globeData={globeData} onPointClick={handlePointClick} />
          </Suspense>
        </ErrorBoundary>
      ) : (
        <FlatMap alerts={flatAlerts} onAlertClick={handlePointClick} />
      )}

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
                <Badge variant="outline" className="bg-background/50 border-white/10 capitalize font-mono text-xs" data-testid="badge-category">
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
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">Est. Affected</p>
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
