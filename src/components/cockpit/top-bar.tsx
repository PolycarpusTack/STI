"use client";

import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle,
  TrendingUp,
  Clock,
  FileText,
  RefreshCw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

interface Metrics {
  queueSize: number;
  handledToday: number;
  disagreementRate: number;
  lastPull: string;
  briefsGenerated: number;
}

function formatTimestamp(ts: string): string {
  if (!ts) return "Never";
  const date = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return date.toLocaleDateString();
}

export function TopBar() {
  const { data, isLoading, isError, dataUpdatedAt, refetch } = useQuery<
    Metrics,
    Error
  >({
    queryKey: ["metrics"],
    queryFn: () => fetch("/api/metrics").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const metrics = data ?? {
    queueSize: 0,
    handledToday: 0,
    disagreementRate: 0,
    lastPull: "",
    briefsGenerated: 0,
  };

  return (
    <header className="flex h-12 items-center border-b bg-muted/40 px-4 gap-4 shrink-0">
      <div className="flex items-center gap-2 font-semibold text-sm">
        <AlertTriangle className="size-4 text-destructive" />
        <span className="hidden sm:inline">STA Cockpit</span>
      </div>

      <Separator orientation="vertical" className="h-6" />

      <div className="flex items-center gap-1.5 text-xs">
        <AlertTriangle className="size-3.5 text-orange-500" />
        <span className="text-muted-foreground hidden md:inline">Queue</span>
        <Badge
          variant="outline"
          className="font-mono text-xs h-5 px-1.5 min-w-[2ch] justify-center"
        >
          {isLoading ? "..." : metrics.queueSize}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <CheckCircle className="size-3.5 text-emerald-500" />
        <span className="text-muted-foreground hidden md:inline">Handled</span>
        <Badge
          variant="outline"
          className="font-mono text-xs h-5 px-1.5 min-w-[2ch] justify-center"
        >
          {isLoading ? "..." : metrics.handledToday}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <TrendingUp className="size-3.5 text-amber-500" />
        <span className="text-muted-foreground hidden md:inline">Disagree</span>
        <Badge
          variant={metrics.disagreementRate > 20 ? "destructive" : "outline"}
          className="font-mono text-xs h-5 px-1.5 min-w-[3ch] justify-center"
        >
          {isLoading ? "..." : `${metrics.disagreementRate}%`}
        </Badge>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <Clock className="size-3.5 text-muted-foreground" />
        <span className="text-muted-foreground hidden md:inline">Last pull</span>
        <span className="font-mono text-xs text-muted-foreground">
          {isLoading ? "..." : formatTimestamp(metrics.lastPull)}
        </span>
      </div>

      <div className="flex items-center gap-1.5 text-xs">
        <FileText className="size-3.5 text-sky-500" />
        <span className="text-muted-foreground hidden lg:inline">Briefs</span>
        <Badge
          variant="outline"
          className="font-mono text-xs h-5 px-1.5 min-w-[2ch] justify-center"
        >
          {isLoading ? "..." : metrics.briefsGenerated}
        </Badge>
      </div>

      <div className="flex-1" />

      {isError && (
        <span className="text-xs text-destructive">Metrics unavailable</span>
      )}

      <button
        onClick={() => refetch()}
        className="p-1 rounded hover:bg-accent transition-colors text-muted-foreground hover:text-foreground"
        title="Refresh metrics"
      >
        <RefreshCw className="size-3.5" />
      </button>
    </header>
  );
}
