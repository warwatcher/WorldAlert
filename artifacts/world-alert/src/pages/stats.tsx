import { useGetAlertStats } from "@workspace/api-client-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from "recharts";
import { AlertCircle, CheckCircle2, TrendingUp, Activity } from "lucide-react";

const COLORS = {
  critical: "hsl(0 84% 60%)",
  high: "hsl(25 100% 50%)",
  medium: "hsl(43 100% 50%)",
  low: "hsl(210 100% 60%)"
};

const CATEGORY_COLORS = [
  "hsl(210 100% 60%)",
  "hsl(43 100% 50%)",
  "hsl(25 100% 50%)",
  "hsl(0 84% 60%)",
  "hsl(280 100% 65%)",
  "hsl(160 100% 40%)",
  "hsl(320 100% 60%)",
];

export default function Stats() {
  const { data: stats, isLoading, isError } = useGetAlertStats({
    query: {
      refetchInterval: 60000
    }
  });

  if (isLoading) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <Activity className="h-8 w-8 text-primary animate-spin" />
          <p className="text-muted-foreground">Gathering global intelligence...</p>
        </div>
      </div>
    );
  }

  if (isError || !stats) {
    return (
      <div className="flex-1 p-8 flex items-center justify-center">
        <div className="text-destructive flex flex-col items-center gap-2">
          <AlertCircle className="h-8 w-8" />
          <p>Failed to load statistics.</p>
        </div>
      </div>
    );
  }

  const severityData = Object.entries(stats.bySeverity).map(([name, value]) => ({
    name,
    value,
    color: COLORS[name as keyof typeof COLORS] || COLORS.low
  }));

  const categoryData = Object.entries(stats.byCategory).map(([name, value], index) => ({
    name,
    value,
    color: CATEGORY_COLORS[index % CATEGORY_COLORS.length]
  }));

  return (
    <div className="flex-1 p-6 md:p-8 max-w-7xl mx-auto w-full space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-bold tracking-tight">Global Situation Report</h1>
        <p className="text-muted-foreground">
          Live summary of unfolding events across all monitored regions. Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card/50 border-white/5 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Active Alerts</CardTitle>
            <Activity className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        
        <Card className="bg-destructive/10 border-destructive/20 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-destructive">Critical Incidents</CardTitle>
            <AlertCircle className="h-4 w-4 text-destructive" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-destructive">{stats.critical || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-white/5 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">High Severity</CardTitle>
            <TrendingUp className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-orange-500">{stats.bySeverity.high || 0}</div>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-white/5 backdrop-blur">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Monitored Categories</CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold">{Object.keys(stats.byCategory).length}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="bg-card/50 border-white/5 backdrop-blur flex flex-col">
          <CardHeader>
            <CardTitle>Alerts by Severity</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={severityData} layout="vertical" margin={{ top: 0, right: 0, left: 30, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                  cursor={{ fill: 'hsl(var(--muted)/0.5)' }}
                />
                <Bar dataKey="value" radius={[0, 4, 4, 0]}>
                  {severityData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card/50 border-white/5 backdrop-blur flex flex-col">
          <CardHeader>
            <CardTitle>Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={categoryData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                  stroke="none"
                >
                  {categoryData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', color: 'hsl(var(--foreground))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="mt-4 flex flex-wrap gap-2 justify-center">
              {categoryData.map(c => (
                <div key={c.name} className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c.color }} />
                  <span className="capitalize">{c.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
