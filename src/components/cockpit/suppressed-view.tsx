"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Trash2,
  ShieldOff,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Suppression {
  id: string;
  fingerprint: string;
  reason: string;
  scope: string;
  author: string;
  createdAt: string;
  lastMatched: string | null;
  matchCount: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

// ─── Component ───────────────────────────────────────────────────────────────

export function SuppressedView() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Suppression | null>(null);

  const { data, isLoading, isError } = useQuery<Suppression[], Error>({
    queryKey: ["suppressions"],
    queryFn: () =>
      fetch("/api/suppressions").then((r) => r.json()),
    staleTime: 15_000,
  });

  const suppressions = Array.isArray(data) ? data : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/suppressions/${id}`, { method: "DELETE" }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setDeleteTarget(null);
    },
  });

  const totalMatched = suppressions.reduce((sum, s) => sum + s.matchCount, 0);
  const matchedThisWeek = suppressions.filter((s) => {
    if (!s.lastMatched) return false;
    const last = new Date(s.lastMatched);
    const week = new Date();
    week.setDate(week.getDate() - 7);
    return last > week;
  }).length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b shrink-0">
        <div className="flex items-center justify-between mb-2">
          <div>
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <ShieldOff className="size-4" />
              Suppressions
            </h2>
            <p className="text-xs text-muted-foreground">
              {suppressions.length} rules, {totalMatched} total matches
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex gap-4">
          <div className="rounded-md border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Total Suppressed</span>
            <p className="text-lg font-semibold font-mono">{suppressions.length}</p>
          </div>
          <div className="rounded-md border px-3 py-1.5">
            <span className="text-xs text-muted-foreground">Matched This Week</span>
            <p className="text-lg font-semibold font-mono">{matchedThisWeek}</p>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-hidden">
        {isLoading && (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center h-full text-destructive text-sm">
            Failed to load suppressions
          </div>
        )}

        {!isLoading && !isError && suppressions.length === 0 && (
          <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
            No suppressions configured
          </div>
        )}

        {!isLoading && !isError && suppressions.length > 0 && (
          <ScrollArea className="h-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Fingerprint</TableHead>
                  <TableHead className="text-xs">Reason</TableHead>
                  <TableHead className="w-[80px] text-xs">Scope</TableHead>
                  <TableHead className="w-[80px] text-xs">Author</TableHead>
                  <TableHead className="w-[120px] text-xs">Created</TableHead>
                  <TableHead className="w-[120px] text-xs">Last Matched</TableHead>
                  <TableHead className="w-[60px] text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {suppressions.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-mono text-xs max-w-[200px] truncate">
                      {s.fingerprint}
                    </TableCell>
                    <TableCell className="text-sm">{s.reason}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] h-5 px-1.5",
                          s.scope === "global"
                            ? "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800"
                            : "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-950 dark:text-sky-300 dark:border-sky-800"
                        )}
                      >
                        {s.scope}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs">{s.author}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {formatDate(s.createdAt)}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {s.lastMatched ? formatDate(s.lastMatched) : "Never"}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget(s)}
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-5 text-destructive" />
              Remove Suppression
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to remove the suppression for fingerprint{" "}
              <span className="font-mono break-all">{deleteTarget?.fingerprint}</span>?
              This issue may reappear in the inbox.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                if (deleteTarget) deleteMutation.mutate(deleteTarget.id);
              }}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {deleteMutation.isPending && (
                <Loader2 className="size-4 animate-spin" />
              )}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
