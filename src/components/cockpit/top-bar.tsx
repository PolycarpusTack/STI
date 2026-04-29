"use client";

import { useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { relativeTime } from "@/lib/format";
import type { Metrics } from "@/lib/types";

function Stat({
  label,
  value,
  accent,
  warn,
}: {
  label: string;
  value: string;
  accent?: boolean;
  warn?: boolean;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", lineHeight: 1.1 }}>
      <span style={{
        fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
        fontSize: "9px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#5E6F8A",
      }}>
        {label}
      </span>
      <span style={{
        fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
        fontSize: "14px", fontWeight: 500,
        color: warn ? "#F59E0B" : accent ? "#2DD4BF" : "#F0F4FF",
      }}>
        {value}
      </span>
    </div>
  );
}

export function TopBar() {
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<Metrics, Error>({
    queryKey: ["metrics"],
    queryFn: () => fetch("/api/metrics").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    // Poll fast when pipeline is running, normal otherwise.
    refetchInterval: (q) => (q.state.data?.pipelineRunning ? 5_000 : 30_000),
  });

  // Auto-refresh issues when a pipeline run finishes.
  const lastCompletedRef = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    const incoming = data?.lastCompletedAt ?? null;
    if (lastCompletedRef.current !== undefined && lastCompletedRef.current !== incoming) {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
    }
    lastCompletedRef.current = incoming;
  }, [data?.lastCompletedAt, queryClient]);

  const pullMutation = useMutation({
    mutationFn: () =>
      fetch("/api/pipeline/run", { method: "POST" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const m = data ?? { queueSize: 0, handledToday: 0, disagreementRate: 0, lastPull: "", briefsGenerated: 0, pendingBriefs: 0, pollIntervalMinutes: 10, pipelineRunning: false, lastCompletedAt: null };
  const running = m.pipelineRunning || pullMutation.isPending;

  return (
    <header style={{
      display: "flex", alignItems: "center",
      padding: "0 20px",
      background: "#111827",
      borderBottom: "1px solid #1F2D45",
      height: "44px",
      gap: "24px",
      flexShrink: 0,
    }}>
      {/* Brand */}
      <div style={{
        display: "flex", alignItems: "center", gap: "10px",
        fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
        fontSize: "12px", fontWeight: 600, letterSpacing: "0.12em",
      }}>
        <span style={{
          width: "8px", height: "8px",
          background: running ? "#F59E0B" : "#2DD4BF",
          borderRadius: "50%",
          boxShadow: running ? "0 0 10px #F59E0B" : "0 0 10px #2DD4BF",
          flexShrink: 0,
          animation: running ? "sta-spin-dot 0.8s linear infinite" : "sta-pulse 2.4s ease-in-out infinite",
          display: "inline-block",
          transition: "background 0.3s, box-shadow 0.3s",
        }} />
        <span style={{ color: "#F0F4FF" }}>STA</span>
        <span style={{ color: "#5E6F8A", fontWeight: 400 }}>· Sentry Triage Assistant</span>
        {running && (
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
            fontSize: "9px", letterSpacing: "0.08em", textTransform: "uppercase",
            color: "#F59E0B", fontWeight: 400,
          }}>
            pulling…
          </span>
        )}
      </div>

      {/* Stats */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "24px" }}>
        {isError && (
          <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#F87171" }}>
            metrics unavailable
          </span>
        )}
        <Stat label="Queue" value={isLoading ? "—" : String(m.queueSize)} />
        {!isLoading && (m as Metrics).pendingBriefs > 0 && (
          <Stat label="Pending brief" value={String((m as Metrics).pendingBriefs)} warn />
        )}
        <Stat label="Handled today" value={isLoading ? "—" : String(m.handledToday)} accent />
        <Stat
          label="Disagreement"
          value={isLoading ? "—" : `${m.disagreementRate}%`}
          warn={m.disagreementRate > 20}
        />
        <Stat
          label={isLoading ? "Last pull" : `Last pull · every ${(m as Metrics).pollIntervalMinutes}m`}
          value={isLoading ? "—" : (m.lastPull ? relativeTime(m.lastPull) : "—")}
        />

        <button
          onClick={() => pullMutation.mutate()}
          disabled={running}
          style={{
            color: running ? "#F59E0B" : "#3D4F68",
            background: "none", border: "none", cursor: running ? "default" : "pointer",
            padding: "4px", fontSize: "14px", lineHeight: 1,
            animation: running ? "sta-spin 1s linear infinite" : "none",
            transition: "color 0.2s",
          }}
          title={running ? "Pipeline running…" : "Pull from Sentry now"}
        >
          ↺
        </button>
      </div>
    </header>
  );
}
