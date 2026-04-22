"use client";

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  Undo2,
  FileText,
  AlertTriangle,
  Clock,
  Hash,
  Server,
  Globe,
  Tag,
  Calendar,
  Zap,
  Eye,
  Ban,
  Sparkles,
  Shield,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCockpitStore } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import type { Issue } from "./issue-list";

// ─── Helpers ─────────────────────────────────────────────────────────────────

const leanLabels: Record<string, string> = {
  jira: "Draft Jira",
  close: "Close",
  investigate: "Investigate",
  watchlist: "Watchlist",
};

const leanBadgeStyles: Record<string, string> = {
  jira: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-950 dark:text-orange-300 dark:border-orange-800",
  close: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-800",
  investigate: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-800",
  watchlist: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
};

const leanButtonStyles: Record<string, string> = {
  jira: "bg-orange-600 hover:bg-orange-700 text-white",
  close: "bg-emerald-600 hover:bg-emerald-700 text-white",
  investigate: "bg-amber-600 hover:bg-amber-700 text-white",
  watchlist: "bg-sky-600 hover:bg-sky-700 text-white",
};

const levelBadgeStyles: Record<string, string> = {
  error: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800",
  warning: "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-300 dark:border-yellow-800",
  info: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800",
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function IssueDetail() {
  const {
    selectedIssueId,
    openJiraModal,
    openSuppressModal,
  } = useCockpitStore();
  const queryClient = useQueryClient();

  const { data: issue, isLoading, isError } = useQuery<Issue, Error>({
    queryKey: ["issue", selectedIssueId],
    queryFn: () =>
      fetch(`/api/issues/${selectedIssueId}`).then((r) => r.json()),
    enabled: !!selectedIssueId,
    staleTime: 10_000,
  });

  const decisionMutation = useMutation({
    mutationFn: ({
      issueId,
      decision,
    }: {
      issueId: string;
      decision: string;
    }) =>
      fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, decision }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", selectedIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  const handleAction = useCallback(
    (decision: string) => {
      if (!selectedIssueId) return;
      if (decision === "jira") {
        openJiraModal(selectedIssueId);
        return;
      }
      if (decision === "suppress") {
        openSuppressModal(selectedIssueId);
        return;
      }
      decisionMutation.mutate({ issueId: selectedIssueId, decision });
    },
    [selectedIssueId, openJiraModal, openSuppressModal, decisionMutation]
  );

  // Keyboard shortcuts for actions
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!selectedIssueId) return;
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
        return;

      const actions: Record<string, string> = {
        "1": "jira",
        "2": "close",
        "3": "investigate",
        "4": "watchlist",
        s: "suppress",
        S: "suppress",
        u: "undo",
        U: "undo",
      };

      const action = actions[e.key];
      if (action) {
        e.preventDefault();
        if (action === "undo") {
          decisionMutation.mutate({
            issueId: selectedIssueId,
            decision: "undo",
          });
        } else {
          handleAction(action);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedIssueId, handleAction, decisionMutation]);

  // No selection state
  if (!selectedIssueId) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center space-y-2">
          <FileText className="size-10 mx-auto opacity-30" />
          <p className="text-sm">Select an issue to view details</p>
          <p className="text-xs text-muted-foreground/60">
            Use ↑↓ to navigate, Enter to select
          </p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <div className="h-4 bg-muted rounded w-3/4 animate-pulse" />
            <div className="h-3 bg-muted rounded w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !issue) {
    return (
      <div className="flex items-center justify-center h-full text-destructive">
        <div className="text-center space-y-2">
          <AlertTriangle className="size-10 mx-auto" />
          <p className="text-sm">Failed to load issue</p>
        </div>
      </div>
    );
  }

  const hasDisagreement =
    issue.decision && issue.lean && issue.decision.decision !== issue.lean;

  return (
    <ScrollArea className="h-full">
      <div className="p-6 space-y-6">
        {/* ── Header ───────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <h1 className="text-xl font-semibold leading-tight flex-1">
              {issue.title}
            </h1>
            {hasDisagreement && (
              <Badge className="bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-800 shrink-0">
                <AlertTriangle className="size-3 mr-1" />
                Disagreement
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="font-mono text-xs">
              <Hash className="size-3 mr-1" />
              {issue.sentryId}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Server className="size-3 mr-1" />
              {issue.project}
            </Badge>
            <Badge variant="outline" className="text-xs">
              <Globe className="size-3 mr-1" />
              {issue.environment}
            </Badge>
            <Badge
              variant="outline"
              className={cn("text-xs", levelBadgeStyles[issue.level] ?? "")}
            >
              {issue.level}
            </Badge>
            {issue.release && (
              <Badge variant="outline" className="text-xs">
                <Tag className="size-3 mr-1" />
                {issue.release}
              </Badge>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="size-3" />
              First:{" "}
              <span className="font-mono">
                {formatDate(issue.firstSeen)}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Clock className="size-3" />
              Last:{" "}
              <span className="font-mono">
                {formatDate(issue.lastSeen)}
              </span>
            </span>
            <span className="flex items-center gap-1">
              <Zap className="size-3" />
              Events:{" "}
              <span className="font-mono font-medium text-foreground">
                {issue.eventCount}
              </span>
            </span>
          </div>
        </div>

        <Separator />

        {/* ── AI Brief ─────────────────────────────────────────────────── */}
        {issue.brief ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-amber-500" />
              <h2 className="text-sm font-semibold">AI Brief</h2>
              {issue.brief.promptVersion && (
                <Badge variant="outline" className="text-[10px] font-mono">
                  v{issue.brief.promptVersion}
                </Badge>
              )}
            </div>

            {/* Lean + Confidence */}
            <div className="flex items-center gap-4">
              {issue.lean && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-sm px-3 py-1 font-medium",
                    leanBadgeStyles[issue.lean] ?? ""
                  )}
                >
                  {leanLabels[issue.lean] ?? issue.lean}
                </Badge>
              )}
              {issue.confidence != null && (() => {
                const pct = Math.round((issue.confidence ?? 0) * 100)
                return (
                  <div className="flex items-center gap-2 flex-1 max-w-xs">
                    <span className="text-xs text-muted-foreground">Confidence</span>
                    <Progress
                      value={pct}
                      className="h-2 flex-1"
                    />
                    <span className="text-xs font-mono font-medium">
                      {pct}%
                    </span>
                  </div>
                )
              })()}
            </div>

            {/* Summary */}
            {issue.brief.summary && (
              <p className="text-sm text-foreground/90 leading-relaxed">
                {issue.brief.summary}
              </p>
            )}

            {/* Details grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {issue.brief.module && (
                <div className="rounded-md border p-3">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Module
                  </span>
                  <p className="text-sm font-medium mt-1">
                    {issue.brief.module}
                  </p>
                </div>
              )}
              {issue.brief.tenantImpact && (
                <div className="rounded-md border p-3">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Tenant Impact
                  </span>
                  <p className="text-sm font-medium mt-1">
                    {issue.brief.tenantImpact}
                  </p>
                </div>
              )}
            </div>

            {/* Reproduction hint */}
            {issue.brief.reproductionHint && (
              <div className="rounded-md border p-3">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">
                  Reproduction Hint
                </span>
                <p className="text-sm font-mono mt-1 bg-muted/50 rounded p-2">
                  {issue.brief.reproductionHint}
                </p>
              </div>
            )}

            {/* Parse error */}
            {issue.brief.parseError && (
              <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3">
                <div className="flex items-center gap-2 text-destructive text-xs font-semibold">
                  <AlertTriangle className="size-3" />
                  Brief Parse Error
                </div>
                <p className="text-xs text-destructive/80 mt-1 font-mono">
                  {issue.brief.parseError}
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-lg border-2 border-dashed p-8 text-center">
            <Sparkles className="size-8 mx-auto text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground mb-3">
              No AI brief generated yet
            </p>
            <GenerateBriefButton issueId={issue.id} />
          </div>
        )}

        <Separator />

        {/* ── Actions ──────────────────────────────────────────────────── */}
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="size-4" />
            Actions
          </h2>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <Button
              className={cn(
                "justify-start h-10",
                leanButtonStyles.jira
              )}
              onClick={() => handleAction("jira")}
              disabled={decisionMutation.isPending}
            >
              <span className="font-mono text-xs opacity-60 mr-1">1</span>
              Draft Jira
            </Button>

            <Button
              className={cn(
                "justify-start h-10",
                leanButtonStyles.close
              )}
              onClick={() => handleAction("close")}
              disabled={decisionMutation.isPending}
            >
              <span className="font-mono text-xs opacity-60 mr-1">2</span>
              Close
            </Button>

            <Button
              className={cn(
                "justify-start h-10",
                leanButtonStyles.investigate
              )}
              onClick={() => handleAction("investigate")}
              disabled={decisionMutation.isPending}
            >
              <span className="font-mono text-xs opacity-60 mr-1">3</span>
              Investigate
            </Button>

            <Button
              className={cn(
                "justify-start h-10",
                leanButtonStyles.watchlist
              )}
              onClick={() => handleAction("watchlist")}
              disabled={decisionMutation.isPending}
            >
              <span className="font-mono text-xs opacity-60 mr-1">4</span>
              Watchlist
            </Button>

            <Button
              variant="destructive"
              className="justify-start h-10"
              onClick={() => handleAction("suppress")}
              disabled={decisionMutation.isPending}
            >
              <span className="font-mono text-xs opacity-60 mr-1">S</span>
              Suppress
            </Button>

            {issue.decision && (
              <Button
                variant="outline"
                className="justify-start h-10"
                onClick={() =>
                  decisionMutation.mutate({
                    issueId: issue.id,
                    decision: "undo",
                  })
                }
                disabled={decisionMutation.isPending}
              >
                <span className="font-mono text-xs opacity-60 mr-1">U</span>
                Undo
                <Undo2 className="size-3 ml-auto" />
              </Button>
            )}
          </div>
        </div>

        {/* ── Previous Decision ────────────────────────────────────────── */}
        {issue.decision && (
          <>
            <Separator />
            <div className="space-y-2">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <ChevronRight className="size-4" />
                Current Decision
              </h2>
              <div className="flex items-center gap-3 text-sm">
                <Badge
                  variant="outline"
                  className={cn(
                    leanBadgeStyles[issue.decision.decision] ?? ""
                  )}
                >
                  {leanLabels[issue.decision.decision] ?? issue.decision.decision}
                </Badge>
                <span className="text-muted-foreground text-xs">
                  by <span className="font-medium text-foreground">{issue.decision.responder}</span>
                </span>
                <span className="text-muted-foreground text-xs font-mono">
                  {formatDate(issue.decision.timestamp)}
                </span>
              </div>
              {hasDisagreement && (
                <p className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1">
                  <AlertTriangle className="size-3" />
                  Human chose &ldquo;{leanLabels[issue.decision.decision]}&rdquo; but AI
                  recommended &ldquo;{leanLabels[issue.lean ?? ""]}&rdquo;
                </p>
              )}
            </div>
          </>
        )}

        {/* ── Fingerprint ──────────────────────────────────────────────── */}
        <Separator />
        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground uppercase tracking-wide">
              Fingerprint
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => {
                navigator.clipboard.writeText(issue.fingerprint);
              }}
            >
              <Copy className="size-3" />
            </Button>
          </div>
          <p className="text-xs font-mono bg-muted/50 rounded p-2 break-all">
            {issue.fingerprint}
          </p>
        </div>
      </div>
    </ScrollArea>
  );
}

function GenerateBriefButton({ issueId }: { issueId: string }) {
  const queryClient = useQueryClient();

  const briefMutation = useMutation({
    mutationFn: () =>
      fetch(`/api/brief/${issueId}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  return (
    <Button
      variant="outline"
      size="sm"
      onClick={() => briefMutation.mutate()}
      disabled={briefMutation.isPending}
    >
      <Sparkles className="size-3.5 mr-1.5" />
      {briefMutation.isPending ? "Generating..." : "Generate Brief"}
    </Button>
  );
}
