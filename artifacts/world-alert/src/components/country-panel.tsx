import { useQuery } from "@tanstack/react-query";
import {
  X, Shield, AlertTriangle, TrendingUp, TrendingDown, Minus,
  Activity, ExternalLink,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6",
};
const CATEGORY_COLORS: Record<string, string> = {
  earthquake: "#a78bfa", disaster: "#fb923c", weather: "#38bdf8",
  humanitarian: "#f472b6", conflict: "#ef4444", health: "#34d399",
  political: "#fbbf24", other: "#9ca3af",
};
const RISK_CONFIG: Record<string, { color: string; bg: string }> = {
  CRITICAL: { color: "#ef4444", bg: "rgba(239,68,68,0.12)" },
  HIGH:     { color: "#f97316", bg: "rgba(249,115,22,0.12)" },
  MODERATE: { color: "#eab308", bg: "rgba(234,179,8,0.12)"  },
  ELEVATED: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  LOW:      { color: "#22c55e", bg: "rgba(34,197,94,0.12)"  },
};

interface FinancialQuote {
  key: string; label: string; symbol: string;
  price: number | null; changePercent: number | null; currency: string;
}
interface CountryIntel {
  country: string; riskScore: number; riskLevel: string;
  alertCount: number; byCategory: Record<string, number>;
  bySeverity: Record<string, number>; alerts: any[];
  financialSignals: FinancialQuote[];
  fearGreed: { value: number; label: string } | null;
}

function RiskGauge({ score, color }: { score: number; color: string }) {
  const clamp = Math.max(0, Math.min(100, score));
  const angle = (clamp / 100) * 180 - 90;
  const rx = 40 + 28 * Math.cos(((angle - 90) * Math.PI) / 180);
  const ry = 42 + 28 * Math.sin(((angle - 90) * Math.PI) / 180);
  const large = clamp > 50 ? 1 : 0;
  return (
    <div className="flex flex-col items-center flex-shrink-0">
      <svg width="76" height="46" viewBox="0 0 80 48">
        <path d="M 12 44 A 28 28 0 0 1 68 44" fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth="5" strokeLinecap="round"/>
        {clamp > 0 && (
          <path
            d={`M 12 44 A 28 28 0 ${large} 1 ${rx} ${ry}`}
            fill="none" stroke={color} strokeWidth="5" strokeLinecap="round" opacity="0.9"
          />
        )}
        <line x1="40" y1="44" x2={40 + 19 * Math.cos(((angle - 90) * Math.PI) / 180)} y2={44 + 19 * Math.sin(((angle - 90) * Math.PI) / 180)} stroke="white" strokeWidth="1.5" strokeLinecap="round"/>
        <circle cx="40" cy="44" r="2.5" fill="white"/>
      </svg>
      <div className="font-mono font-bold text-xl leading-none" style={{ color, marginTop: -6 }}>{clamp}</div>
      <div className="text-[9px] font-mono text-white/30 uppercase tracking-widest mt-0.5">/ 100</div>
    </div>
  );
}

function FinLine({ item }: { item: FinancialQuote }) {
  const pct = item.changePercent;
  const isUp = (pct ?? 0) > 0.05;
  const isDown = (pct ?? 0) < -0.05;
  const fmtPrice = (p: number) => {
    if (p >= 10000) return p.toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (p >= 100)   return p.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    if (p >= 1)     return p.toFixed(4);
    return p.toFixed(6);
  };
  return (
    <div className="flex items-center justify-between py-[5px] border-b border-white/[0.04] last:border-0">
      <span className="text-[11px] font-mono text-white/45">{item.label}</span>
      <div className="flex items-center gap-2">
        {item.price != null ? (
          <>
            <span className="text-[11px] font-mono text-white/80">{fmtPrice(item.price)}</span>
            {pct != null && (
              <span className={`text-[10px] font-mono flex items-center gap-0.5 ${isUp ? "text-emerald-400" : isDown ? "text-red-400" : "text-white/30"}`}>
                {isUp ? <TrendingUp className="h-2.5 w-2.5"/> : isDown ? <TrendingDown className="h-2.5 w-2.5"/> : <Minus className="h-2.5 w-2.5"/>}
                {Math.abs(pct).toFixed(2)}%
              </span>
            )}
          </>
        ) : (
          <span className="text-[10px] font-mono text-white/15">—</span>
        )}
      </div>
    </div>
  );
}

export function CountryIntelPanel({
  country,
  onClose,
}: {
  country: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useQuery<CountryIntel>({
    queryKey: ["country-intel", country],
    queryFn: async () => {
      const res = await fetch(`/api/intel/country/${encodeURIComponent(country!)}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
    enabled: !!country,
    staleTime: 5 * 60 * 1000,
  });

  if (!country) return null;
  const rc = data ? (RISK_CONFIG[data.riskLevel] ?? RISK_CONFIG.LOW) : null;

  return (
    <div className="absolute top-0 right-0 bottom-0 w-full max-w-[340px] flex flex-col overflow-hidden z-[1000]"
      style={{ background: "rgba(4,4,6,0.97)", backdropFilter: "blur(20px)", borderLeft: "1px solid rgba(255,255,255,0.06)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
        <div className="flex items-center gap-2">
          <Shield className="h-3 w-3" style={{ color: "#60a5fa" }}/>
          <span className="text-[9px] font-mono uppercase tracking-[0.18em] text-white/40">Country Intel</span>
        </div>
        <Button variant="ghost" size="icon" className="h-6 w-6 hover:bg-white/8 text-white/30" onClick={onClose}>
          <X className="h-3.5 w-3.5"/>
        </Button>
      </div>

      {isLoading || !data ? (
        <div className="flex-1 flex items-center justify-center">
          <Activity className="h-5 w-5 text-white/20 animate-spin"/>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-4">

            {/* Name + Risk gauge */}
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <h2 className="font-mono font-bold text-base text-white uppercase tracking-wide leading-tight truncate">
                  {data.country}
                </h2>
                <div
                  className="mt-2 inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[9px] font-mono font-bold uppercase tracking-[0.15em]"
                  style={{ color: rc?.color, background: rc?.bg, border: `1px solid ${rc?.color}30` }}
                >
                  <AlertTriangle className="h-2.5 w-2.5"/>
                  {data.riskLevel} RISK
                </div>
                <p className="mt-1.5 text-[9px] font-mono text-white/25">
                  {data.alertCount} active signal{data.alertCount !== 1 ? "s" : ""} detected
                </p>
              </div>
              {rc && <RiskGauge score={data.riskScore} color={rc.color}/>}
            </div>

            {/* Severity breakdown bars */}
            {data.alertCount > 0 && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/25 mb-2">Signal Severity</p>
                <div className="space-y-1.5">
                  {(["critical","high","medium","low"] as const).map((sev) => {
                    const n = data.bySeverity[sev] ?? 0;
                    if (!n) return null;
                    const pct = Math.round((n / data.alertCount) * 100);
                    return (
                      <div key={sev} className="flex items-center gap-2">
                        <span className="text-[9px] font-mono uppercase w-14 text-white/35">{sev}</span>
                        <div className="flex-1 h-[3px] rounded-full bg-white/[0.06]">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: SEVERITY_COLORS[sev] }}/>
                        </div>
                        <span className="text-[9px] font-mono text-white/35 w-4 text-right">{n}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Category chips */}
            {Object.keys(data.byCategory).length > 0 && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/25 mb-2">Categories</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(data.byCategory)
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, n]) => (
                      <span
                        key={cat}
                        className="px-1.5 py-0.5 rounded text-[9px] font-mono uppercase"
                        style={{
                          color: CATEGORY_COLORS[cat] ?? "#9ca3af",
                          background: `${CATEGORY_COLORS[cat] ?? "#9ca3af"}14`,
                          border: `1px solid ${CATEGORY_COLORS[cat] ?? "#9ca3af"}28`,
                        }}
                      >
                        {cat} {n}
                      </span>
                    ))}
                </div>
              </div>
            )}

            {/* Financial signals */}
            {data.financialSignals.length > 0 && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/25 mb-1.5">Financial Signals</p>
                <div className="rounded-lg overflow-hidden" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                  <div className="px-3 py-1">
                    {data.financialSignals.map((s) => <FinLine key={s.key} item={s}/>)}
                  </div>
                </div>
                {data.fearGreed && (
                  <div className="mt-2 flex items-center justify-between px-3 py-2 rounded-lg" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)" }}>
                    <span className="text-[10px] font-mono text-white/35">Fear & Greed</span>
                    <span
                      className="text-[11px] font-mono font-bold"
                      style={{ color: data.fearGreed.value >= 60 ? "#22c55e" : data.fearGreed.value <= 40 ? "#ef4444" : "#eab308" }}
                    >
                      {data.fearGreed.value} · {data.fearGreed.label}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* Recent alerts */}
            {data.alerts.length > 0 && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-[0.14em] text-white/25 mb-2">
                  Recent Intel ({data.alertCount})
                </p>
                <div className="space-y-1.5">
                  {data.alerts.slice(0, 18).map((alert) => (
                    <div
                      key={alert.id}
                      className="group px-3 py-2 rounded-lg transition-colors"
                      style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)" }}
                    >
                      <div className="flex items-start gap-2">
                        <div
                          className="mt-[3px] flex-shrink-0 h-1.5 w-1.5 rounded-full"
                          style={{ background: SEVERITY_COLORS[alert.severity] }}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] text-white/70 leading-snug line-clamp-2">{alert.title}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-[9px] font-mono uppercase" style={{ color: SEVERITY_COLORS[alert.severity] }}>
                              {alert.severity}
                            </span>
                            <span className="text-[9px] font-mono text-white/20">·</span>
                            <span className="text-[9px] font-mono text-white/25">{alert.source}</span>
                            {alert.sourceUrl && (
                              <a href={alert.sourceUrl} target="_blank" rel="noopener noreferrer"
                                className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity text-white/25 hover:text-blue-400"
                                onClick={(e) => e.stopPropagation()}>
                                <ExternalLink className="h-2.5 w-2.5"/>
                              </a>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {data.alertCount === 0 && (
              <div className="text-center py-10">
                <Shield className="h-8 w-8 text-white/10 mx-auto mb-3"/>
                <p className="text-[11px] font-mono text-white/20">No active signals for {data.country}</p>
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
