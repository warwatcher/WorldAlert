import { Link, useLocation } from "wouter";
import { Globe, Activity, BarChart3, Zap } from "lucide-react";
import { useListAlerts } from "@workspace/api-client-react";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "#ef4444", high: "#f97316", medium: "#eab308", low: "#3b82f6",
};

const links = [
  { href: "/",        label: "Globe",  icon: Globe },
  { href: "/alerts",  label: "Alerts", icon: Activity },
  { href: "/stats",   label: "Stats",  icon: BarChart3 },
];

export function Header() {
  const [location] = useLocation();
  const { data: alerts } = useListAlerts(undefined, {
    query: { refetchInterval: 60000 },
  });

  const total    = alerts?.length ?? 0;
  const critical = alerts?.filter((a) => a.severity === "critical").length ?? 0;
  const high     = alerts?.filter((a) => a.severity === "high").length ?? 0;

  const tickerItems = (alerts ?? [])
    .filter((a) => a.severity === "critical" || a.severity === "high")
    .slice(0, 24);

  return (
    <header
      className="sticky top-0 z-[2000] flex flex-col"
      style={{ background: "#000", borderBottom: "1px solid rgba(255,255,255,0.06)" }}
    >
      {/* ── Nav row ─────────────────────────────────────────────────────────── */}
      <div className="flex h-11 items-center px-4 gap-4">
        {/* Brand */}
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60" />
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400" />
          </span>
          <span
            className="font-mono font-bold text-sm text-white"
            style={{ letterSpacing: "0.16em" }}
          >
            WORLD ALERT
          </span>
        </div>

        {/* Status counters */}
        {total > 0 && (
          <div className="hidden sm:flex items-center gap-2 text-[10px] font-mono">
            <span className="text-white/20">|</span>
            <span className="text-white/40">{total.toLocaleString()} EVENTS</span>
            {critical > 0 && (
              <>
                <span className="text-white/15">·</span>
                <span style={{ color: SEVERITY_COLORS.critical }}>{critical} CRITICAL</span>
              </>
            )}
            {high > 0 && (
              <>
                <span className="text-white/15">·</span>
                <span style={{ color: SEVERITY_COLORS.high }}>{high} HIGH</span>
              </>
            )}
          </div>
        )}

        {/* Nav */}
        <nav className="ml-auto flex gap-0.5">
          {links.map(({ href, label, icon: Icon }) => {
            const active = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-mono tracking-wider transition-colors ${
                  active
                    ? "bg-white/10 text-white"
                    : "text-white/35 hover:text-white/70 hover:bg-white/5"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">{label.toUpperCase()}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* ── Live ticker ─────────────────────────────────────────────────────── */}
      {tickerItems.length > 0 && (
        <div
          className="relative h-[22px] flex items-center overflow-hidden"
          style={{ background: "#000", borderTop: "1px solid rgba(255,255,255,0.04)" }}
        >
          {/* Left badge */}
          <div
            className="absolute left-0 z-10 h-full flex items-center px-2 gap-1.5 flex-shrink-0"
            style={{ background: "#000", borderRight: "1px solid rgba(255,255,255,0.06)" }}
          >
            <Zap className="h-2.5 w-2.5 text-yellow-400" />
            <span className="text-[9px] font-mono text-yellow-400 uppercase tracking-wider hidden sm:inline">
              Live
            </span>
          </div>

          {/* Scrolling content */}
          <div className="ml-[52px] sm:ml-[72px] overflow-hidden w-full">
            <div
              className="flex items-center gap-0 whitespace-nowrap"
              style={{
                animation: `wa-ticker ${Math.max(25, tickerItems.length * 5)}s linear infinite`,
              }}
            >
              {[...tickerItems, ...tickerItems].map((item, i) => (
                <span
                  key={`${item.id}-${i}`}
                  className="inline-flex items-center gap-2 pr-8 flex-shrink-0"
                >
                  <span
                    className="h-1.5 w-1.5 rounded-full flex-shrink-0"
                    style={{ background: SEVERITY_COLORS[item.severity] }}
                  />
                  <span
                    className="text-[9px] font-mono uppercase tracking-wide font-bold"
                    style={{ color: SEVERITY_COLORS[item.severity] }}
                  >
                    [{item.severity}]
                  </span>
                  <span className="text-[9px] font-mono text-white/55">
                    {item.title.length > 72 ? item.title.slice(0, 72) + "…" : item.title}
                  </span>
                  {(item.country || item.region) && (
                    <span className="text-[9px] font-mono text-white/20">
                      [{(item.country || item.region)?.toUpperCase()}]
                    </span>
                  )}
                  <span className="text-white/10 pl-4">◆</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
