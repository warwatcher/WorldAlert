import { useState } from "react";
import { useListAlerts } from "@workspace/api-client-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ExternalLink, Search, Activity, AlertCircle } from "lucide-react";

const SEVERITY_COLORS = {
  critical: "text-red-500 border-red-500/20 bg-red-500/10",
  high: "text-orange-500 border-orange-500/20 bg-orange-500/10",
  medium: "text-yellow-500 border-yellow-500/20 bg-yellow-500/10",
  low: "text-blue-500 border-blue-500/20 bg-blue-500/10",
};

export default function Alerts() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [severityFilter, setSeverityFilter] = useState<string>("all");

  const { data: alerts, isLoading, isError } = useListAlerts(
    { 
      category: categoryFilter !== "all" ? categoryFilter : undefined,
      severity: severityFilter !== "all" ? severityFilter : undefined,
    },
    { query: { refetchInterval: 60000 } }
  );

  const filteredAlerts = alerts?.filter(a => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      a.title.toLowerCase().includes(term) ||
      (a.country && a.country.toLowerCase().includes(term)) ||
      (a.region && a.region.toLowerCase().includes(term))
    );
  }) || [];

  return (
    <div className="flex flex-col flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full animate-in fade-in duration-500">
      <div className="flex flex-col gap-2 mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Active Intel Log</h1>
        <p className="text-muted-foreground">Comprehensive feed of globally monitored events, sorted by recent activity.</p>
      </div>

      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input 
            placeholder="Search by title, country or region..." 
            className="pl-9 bg-card/50 border-white/10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <Select value={severityFilter} onValueChange={setSeverityFilter}>
          <SelectTrigger className="w-[180px] bg-card/50 border-white/10">
            <SelectValue placeholder="All Severities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Severities</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="low">Low</SelectItem>
          </SelectContent>
        </Select>
        <Select value={categoryFilter} onValueChange={setCategoryFilter}>
          <SelectTrigger className="w-[180px] bg-card/50 border-white/10">
            <SelectValue placeholder="All Categories" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Categories</SelectItem>
            <SelectItem value="earthquake">Earthquake</SelectItem>
            <SelectItem value="weather">Weather</SelectItem>
            <SelectItem value="conflict">Conflict</SelectItem>
            <SelectItem value="disaster">Disaster</SelectItem>
            <SelectItem value="humanitarian">Humanitarian</SelectItem>
            <SelectItem value="health">Health</SelectItem>
            <SelectItem value="other">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-white/10 rounded-xl bg-card/30 backdrop-blur overflow-hidden flex-1 flex flex-col">
        {isLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12">
            <Activity className="h-8 w-8 text-primary animate-spin mb-4" />
            <p className="text-muted-foreground">Retrieving secure logs...</p>
          </div>
        ) : isError ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-destructive">
            <AlertCircle className="h-8 w-8 mb-4" />
            <p>Error retrieving intel logs.</p>
          </div>
        ) : filteredAlerts.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12">
            <p className="text-muted-foreground">No events match the current criteria.</p>
          </div>
        ) : (
          <div className="overflow-auto flex-1">
            <Table>
              <TableHeader className="bg-card/50 sticky top-0 z-10">
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="w-[120px]">Severity</TableHead>
                  <TableHead className="w-[120px]">Category</TableHead>
                  <TableHead>Event</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Source</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.map((alert) => (
                  <TableRow key={alert.id} className="border-white/5 hover:bg-white/5 transition-colors">
                    <TableCell>
                      <Badge variant="outline" className={`font-mono text-[10px] uppercase tracking-wider ${SEVERITY_COLORS[alert.severity as keyof typeof SEVERITY_COLORS]}`}>
                        {alert.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{alert.category}</span>
                    </TableCell>
                    <TableCell className="font-medium text-foreground">{alert.title}</TableCell>
                    <TableCell className="text-muted-foreground">{alert.country || alert.region || "Global"}</TableCell>
                    <TableCell className="text-muted-foreground font-mono text-xs">
                      {new Date(alert.publishedAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <a 
                        href={alert.sourceUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
                      >
                        {alert.source}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}
