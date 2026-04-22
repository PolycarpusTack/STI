"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Download,
  Filter,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Decision {
  id: string;
  issueId: string;
  issueTitle: string;
  sentryId: string;
  aiLean: string | null;
  humanDecision: string;
  responder: string;
  timestamp: string;
  disagreement: boolean;
}

interface DecisionsResponse {
  decisions: Decision[];
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const leanBadgeStyles: Record<string, string> = {
  jira: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  close: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  investigate: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  watchlist: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

function downloadCSV(decisions: Decision[]) {
  const headers = [
    "Timestamp",
    "Issue Title",
    "Sentry ID",
    "AI Lean",
    "Human Decision",
    "Responder",
    "Disagreement",
  ];
  const rows = decisions.map((d) => [
    d.timestamp,
    `"${d.issueTitle.replace(/"/g, '""')}"`,
    d.sentryId,
    d.aiLean ?? "",
    d.humanDecision,
    d.responder,
    d.disagreement ? "Yes" : "No",
  ]);
  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `decisions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DecisionsView() {
  const [responderFilter, setResponderFilter] = useState<string>("all");
  const [disagreementOnly, setDisagreementOnly] = useState(false);

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (responderFilter !== "all") params.set("responder", responderFilter);
  if (disagreementOnly) params.set("disagreement", "true");

  const { data, isLoading, isError } = useQuery<DecisionsResponse, Error>({
    queryKey: ["decisions", responderFilter, disagreementOnly],
    queryFn: () =>
      fetch(`/api/decisions?${params.toString()}`).then((r) => r.json()),
    staleTime: 15_000,
  });

  const decisions = data?.decisions ?? [];
  const total = data?.total ?? 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Decisions Log</h2>
            <p className="text-xs text-muted-foreground">
              {total} decisions recorded
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => decisions.length > 0 && downloadCSV(decisions)}
            disabled={decisions.length === 0}
          >
            <Download className="size-3.5 mr-1.5" />
            Export CSV
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Select value={responderFilter} onValueChange={setResponderFilter}>
            <SelectTrigger className="h-8 w-[140px] text-xs">
              <SelectValue placeholder="Responder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Responders</SelectItem>
              <SelectItem value="human">Human</SelectItem>
              <SelectItem value="ai">AI</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant={disagreementOnly ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs"
            onClick={() => setDisagreementOnly(!disagreementOnly)}
          >
            <AlertTriangle className="size-3.5 mr-1.5" />
            Disagreements Only
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        {isLoading && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
            Failed to load decisions
          </div>
        )}

        {!isLoading && !isError && decisions.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No decisions found
          </div>
        )}

        {!isLoading && !isError && decisions.length > 0 && (
          <ScrollArea className="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[180px] text-xs">Timestamp</TableHead>
                  <TableHead className="text-xs">Issue Title</TableHead>
                  <TableHead className="w-[80px] text-xs">AI Lean</TableHead>
                  <TableHead className="w-[100px] text-xs">Decision</TableHead>
                  <TableHead className="w-[80px] text-xs">Responder</TableHead>
                  <TableHead className="w-[80px] text-xs">Disagree?</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {decisions.map((d) => (
                  <TableRow
                    key={d.id}
                    className={cn(d.disagreement && "bg-red-50 dark:bg-red-950/20")}
                  >
                    <TableCell className="font-mono text-xs">
                      {formatDate(d.timestamp)}
                    </TableCell>
                    <TableCell className="text-sm max-w-[300px] truncate">
                      {d.issueTitle}
                    </TableCell>
                    <TableCell>
                      {d.aiLean ? (
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] h-5 px-1.5",
                            leanBadgeStyles[d.aiLean] ?? ""
                          )}
                        >
                          {d.aiLean}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] h-5 px-1.5",
                          leanBadgeStyles[d.humanDecision] ?? ""
                        )}
                      >
                        {d.humanDecision}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{d.responder}</TableCell>
                    <TableCell>
                      {d.disagreement && (
                        <Badge variant="destructive" className="text-[10px] h-5 px-1.5">
                          <AlertTriangle className="size-2.5 mr-0.5" />
                          Yes
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
