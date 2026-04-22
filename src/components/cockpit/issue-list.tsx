"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback } from "react";
import {
  Search,
  X,
  ChevronDown,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCockpitStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Issue {
  id: string;
  sentryId: string;
  title: string;
  level: string;
  project: string;
  environment: string;
  release?: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  fingerprint: string;
  lean?: string | null;
  confidence?: number | null;
  brief?: {
    summary?: string;
    module?: string;
    tenantImpact?: string;
    reproductionHint?: string;
    promptVersion?: string;
    parseError?: string | null;
  } | null;
  decision?: {
    decision: string;
    responder: string;
    timestamp: string;
  } | null;
}

interface IssuesResponse {
  issues: Issue[];
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const leanColors: Record<string, string> = {
  jira: "bg-orange-500",
  close: "bg-emerald-500",
  investigate: "bg-amber-500",
  watchlist: "bg-sky-500",
};

const leanBadgeStyles: Record<string, string> = {
  jira: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  close: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  investigate: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  watchlist: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
};

const levelColors: Record<string, string> = {
  error: "text-red-500",
  warning: "text-yellow-500",
  info: "text-sky-500",
};

function relativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return date.toLocaleDateString();
}

// ─── Issue Row ───────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  isSelected,
  isFocused,
  onClick,
}: {
  issue: Issue;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
}) {
  const hasDisagreement =
    issue.decision && issue.lean && issue.decision.decision !== issue.lean;

  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2.5 border-b transition-colors",
        isSelected
          ? "bg-accent"
          : isFocused
          ? "bg-accent/40"
          : "hover:bg-muted/50",
        "border-border/50"
      )}
    >
      <div className="flex items-start gap-2">
        {/* Lean indicator */}
        <div className="mt-1.5 shrink-0">
          <div
            className={cn(
              "size-2.5 rounded-full",
              leanColors[issue.lean ?? ""] ?? "bg-muted-foreground/30"
            )}
            title={issue.lean ?? "No lean"}
          />
        </div>

        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "text-sm truncate",
                isSelected ? "font-medium" : "font-normal"
              )}
            >
              {issue.title}
            </span>
          </div>

          {/* Meta row */}
          <div className="flex items-center gap-2 mt-0.5">
            {issue.brief?.module && (
              <span className="text-[11px] text-muted-foreground truncate">
                {issue.brief.module}
              </span>
            )}

            {issue.brief?.module && (
              <span className="text-border">·</span>
            )}

            <span className="text-[11px] text-muted-foreground font-mono">
              {issue.eventCount}evt
            </span>

            <span className="text-border">·</span>

            <span
              className={cn(
                "text-[11px] font-mono",
                levelColors[issue.level] ?? "text-muted-foreground"
              )}
            >
              {issue.level}
            </span>

            <span className="text-border">·</span>

            <span className="text-[11px] text-muted-foreground font-mono">
              {relativeTime(issue.lastSeen)}
            </span>
          </div>
        </div>

        {/* Decision badge */}
        {issue.decision && (
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 text-[10px] h-5 px-1.5 font-mono",
              hasDisagreement
                ? "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800"
                : "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800"
            )}
          >
            {hasDisagreement ? "✗" : "✓"}
          </Badge>
        )}
      </div>
    </button>
  );
}

// ─── Loading Skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div className="p-3 space-y-3">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="flex items-center gap-2">
            <Skeleton className="size-2.5 rounded-full" />
            <Skeleton className="h-4 w-3/4" />
          </div>
          <div className="flex items-center gap-2 pl-5">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-3 w-12" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Issue List Component ────────────────────────────────────────────────────

export function IssueList() {
  const {
    currentView,
    selectedIssueId,
    filters,
    focusedIndex,
    selectIssue,
    setFilters,
    setFocusedIndex,
  } = useCockpitStore();
  const queryClient = useQueryClient();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const params = new URLSearchParams();
  params.set("view", currentView);
  if (filters.lean) params.set("lean", filters.lean);
  if (filters.search) params.set("search", filters.search);
  if (filters.level) params.set("level", filters.level);

  const { data, isLoading, isError } = useQuery<IssuesResponse, Error>({
    queryKey: ["issues", currentView, filters.lean, filters.search, filters.level],
    queryFn: () => fetch(`/api/issues?${params.toString()}`).then((r) => r.json()),
    staleTime: 10_000,
  });

  const issues = data?.issues ?? [];
  const total = data?.total ?? 0;

  // Keyboard shortcut: "/" to focus search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "/" && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Keyboard navigation within the list
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (document.activeElement === searchInputRef.current) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusedIndex(Math.min(focusedIndex + 1, issues.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusedIndex(Math.max(focusedIndex - 1, 0));
      } else if (e.key === "Enter" && issues[focusedIndex]) {
        e.preventDefault();
        selectIssue(issues[focusedIndex].id);
      }
    },
    [focusedIndex, issues, setFocusedIndex, selectIssue]
  );

  // Scroll focused item into view
  useEffect(() => {
    const el = listRef.current?.querySelector(
      `[data-index="${focusedIndex}"]`
    ) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  // Invalidate issues list periodically
  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    }, 30_000);
    return () => clearInterval(interval);
  }, [queryClient]);

  return (
    <div
      className="flex flex-col h-full"
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div className="px-3 py-2 border-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-sm font-semibold capitalize">
            {currentView}
          </h2>
          <span className="text-xs text-muted-foreground font-mono">
            {total} issues
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
            <Input
              ref={searchInputRef}
              placeholder="Search... (/)"
              value={filters.search}
              onChange={(e) => setFilters({ search: e.target.value })}
              className="h-7 pl-7 text-xs"
            />
            {filters.search && (
              <button
                onClick={() => setFilters({ search: "" })}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            )}
          </div>

          <Select
            value={filters.lean ?? "all"}
            onValueChange={(val) =>
              setFilters({ lean: val === "all" ? null : val })
            }
          >
            <SelectTrigger className="h-7 w-[90px] text-xs">
              <SelectValue placeholder="Lean" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="jira">Jira</SelectItem>
              <SelectItem value="close">Close</SelectItem>
              <SelectItem value="investigate">Investigate</SelectItem>
              <SelectItem value="watchlist">Watchlist</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={filters.level ?? "all"}
            onValueChange={(val) =>
              setFilters({ level: val === "all" ? null : val })
            }
          >
            <SelectTrigger className="h-7 w-[90px] text-xs">
              <SelectValue placeholder="Level" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="error">Error</SelectItem>
              <SelectItem value="warning">Warning</SelectItem>
              <SelectItem value="info">Info</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-hidden">
        {isLoading && <LoadingSkeleton />}

        {isError && !isLoading && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <AlertCircle className="size-8" />
            <span className="text-sm">Failed to load issues</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["issues"] })
              }
            >
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && issues.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Inbox className="size-8" />
            <span className="text-sm">No issues found</span>
            {filters.search && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() =>
                  useCockpitStore.getState().resetFilters()
                }
              >
                Clear filters
              </Button>
            )}
          </div>
        )}

        {!isLoading && !isError && issues.length > 0 && (
          <ScrollArea className="h-full">
            <div ref={listRef} className="divide-y divide-border/50">
              {issues.map((issue, index) => (
                <div key={issue.id} data-index={index}>
                  <IssueRow
                    issue={issue}
                    isSelected={issue.id === selectedIssueId}
                    isFocused={index === focusedIndex}
                    onClick={() => selectIssue(issue.id)}
                  />
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}

export type { Issue, IssuesResponse };
