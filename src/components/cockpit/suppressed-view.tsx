"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2, Loader2 } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDate } from "@/lib/format";
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

export function SuppressedView() {
  const queryClient = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Suppression | null>(null);

  const { data, isLoading, isError } = useQuery<Suppression[], Error>({
    queryKey: ["suppressions"],
    queryFn: () => fetch("/api/suppressions").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 15_000,
  });

  const suppressions = Array.isArray(data) ? data : [];

  const deleteMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/suppressions/${id}`, { method: "DELETE" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      setDeleteTarget(null);
    },
  });

  const totalMatched = suppressions.reduce((s, r) => s + r.matchCount, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "14px 24px", borderBottom: "1px solid #1F2D45",
        background: "#111827", flexShrink: 0,
        display: "flex", alignItems: "center", gap: "24px",
      }}>
        <div>
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
            letterSpacing: "0.12em", textTransform: "uppercase", color: "#9BAAC4",
          }}>
            Suppressions
          </span>
          <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#3D4F68", marginLeft: "10px" }}>
            {suppressions.length} rules · {totalMatched} total matches
          </span>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isLoading && (
          <div style={{ padding: "16px" }}>
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full mb-2" />
            ))}
          </div>
        )}

        {isError && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#F87171",
          }}>
            Failed to load suppressions
          </div>
        )}

        {!isLoading && !isError && suppressions.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "200px", gap: "8px",
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
            letterSpacing: "0.08em", textTransform: "uppercase", color: "#3D4F68",
          }}>
            <span style={{ fontSize: "32px", opacity: 0.4 }}>⊘</span>
            No suppressions configured
          </div>
        )}

        {!isLoading && !isError && suppressions.length > 0 && (
          <ScrollArea className="h-full">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Fingerprint", "Reason", "Scope", "Author", "Added", "Last matched", ""].map((h) => (
                    <th key={h} style={{
                      padding: "10px 14px", textAlign: "left", borderBottom: "1px solid #1F2D45",
                      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
                      letterSpacing: "0.12em", textTransform: "uppercase", color: "#5E6F8A",
                      background: "#111827", fontWeight: 500, position: "sticky", top: 0,
                    }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {suppressions.map((s) => (
                  <tr
                    key={s.id}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#111827"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#2DD4BF", maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {s.fingerprint}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontSize: "13px", color: "#9BAAC4" }}>
                      {s.reason || <span style={{ color: "#3D4F68", fontStyle: "italic" }}>No reason given</span>}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45" }}>
                      <span className="sta-lean-badge" style={{
                        color: s.scope === "global" ? "#A78BFA" : "#2DD4BF",
                        borderColor: s.scope === "global" ? "#3D2070" : "#0F5E56",
                        background: s.scope === "global" ? "rgba(167,139,250,0.08)" : "rgba(45,212,191,0.08)",
                      }}>
                        {s.scope}
                      </span>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A" }}>
                      {s.author}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A" }}>
                      {formatDate(s.createdAt)}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A" }}>
                      {s.lastMatched ? formatDate(s.lastMatched) : <span style={{ color: "#3D4F68" }}>Never</span>}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45" }}>
                      <button
                        onClick={() => setDeleteTarget(s)}
                        className="sta-btn danger"
                        style={{ padding: "4px 8px", fontSize: "10px" }}
                        title="Remove suppression"
                      >
                        <Trash2 size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Suppression</AlertDialogTitle>
            <AlertDialogDescription>
              Remove suppression for fingerprint{" "}
              <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px" }}>{deleteTarget?.fingerprint}</span>?
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
              {deleteMutation.isPending && <Loader2 className="size-4 animate-spin mr-1" />}
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
