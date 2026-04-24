"use client";

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
    refetchInterval: 30_000,
  });

  const pullMutation = useMutation({
    mutationFn: () =>
      fetch("/api/pipeline/run", { method: "POST" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    },
  });

  const m = data ?? { queueSize: 0, handledToday: 0, disagreementRate: 0, lastPull: "", briefsGenerated: 0 };

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
          width: "8px", height: "8px", background: "#2DD4BF", borderRadius: "50%",
          boxShadow: "0 0 10px #2DD4BF", flexShrink: 0,
          animation: "sta-pulse 2.4s ease-in-out infinite",
          display: "inline-block",
        }} />
        <span style={{ color: "#F0F4FF" }}>STA</span>
        <span style={{ color: "#5E6F8A", fontWeight: 400 }}>· Sentry Triage Assistant</span>
      </div>

      {/* Stats */}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "24px" }}>
        {isError && (
          <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#F87171" }}>
            metrics unavailable
          </span>
        )}
        <Stat label="Queue" value={isLoading ? "—" : String(m.queueSize)} />
        <Stat label="Handled today" value={isLoading ? "—" : String(m.handledToday)} accent />
        <Stat
          label="Disagreement"
          value={isLoading ? "—" : `${m.disagreementRate}%`}
          warn={m.disagreementRate > 20}
        />
        <Stat label="Last pull" value={isLoading ? "—" : (m.lastPull ? relativeTime(m.lastPull) : "—")} />
        <Stat label="Briefs" value={isLoading ? "—" : String(m.briefsGenerated)} />

        <button
          onClick={() => pullMutation.mutate()}
          disabled={pullMutation.isPending}
          style={{
            color: pullMutation.isPending ? "#2DD4BF" : "#3D4F68",
            background: "none", border: "none", cursor: "pointer",
            padding: "4px", fontSize: "14px", lineHeight: 1,
            animation: pullMutation.isPending ? "sta-spin 1s linear infinite" : "none",
            transition: "color 0.2s",
          }}
          title={pullMutation.isPending ? "Pulling from Sentry…" : "Pull from Sentry now"}
        >
          ↺
        </button>
      </div>
    </header>
  );
}
