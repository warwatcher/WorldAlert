import { Link, useLocation } from "wouter";
import { Activity, Globe, BarChart3, ShieldAlert } from "lucide-react";

export function Header() {
  const [location] = useLocation();

  const links = [
    { href: "/", label: "Globe", icon: Globe },
    { href: "/alerts", label: "Alerts", icon: Activity },
    { href: "/stats", label: "Stats", icon: BarChart3 },
  ];

  return (
    <header className="border-b border-white/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-50 sticky top-0">
      <div className="flex h-14 items-center px-4 md:px-6">
        <div className="flex items-center gap-2 font-bold tracking-tight text-primary">
          <ShieldAlert className="h-5 w-5" />
          <span>WORLDALERT</span>
        </div>
        <nav className="ml-auto flex gap-4 sm:gap-6">
          {links.map(({ href, label, icon: Icon }) => {
            const isActive = location === href;
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-2 text-sm font-medium transition-colors hover:text-primary ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                <span className="hidden sm:inline-block">{label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
