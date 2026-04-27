"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

interface Storm {
  fingerprint: string;
  count: number;
  sampleTitle: string;
  sampleIssueId: string;
  projects: string[];
}

const MONO: React.CSSProperties = {
  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
  fontSize: "10px",
};

function StormRow({
  storm,
  onDismiss,
}: {
  storm: Storm;
  onDismiss: (fingerprint: string) => void;
}) {
  const queryClient = useQueryClient();

  const suppressMutation = useMutation({
    mutationFn: (fingerprint: string) =>
      fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fingerprint, reason: "Storm detected", scope: "global" }),
      }).then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    onSuccess: (_data, fingerprint) => {
      onDismiss(fingerprint);
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["storms"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
    },
    onError: (err) => {
      console.error("Failed to suppress storm:", err);
    },
  });

  return (
    <div style={{
      display: "flex", alignItems: "center", gap: "10px",
      background: "rgba(245,158,11,0.05)", border: "1px solid rgba(245,158,11,0.15)",
      borderRadius: "3px", padding: "6px 10px",
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ ...MONO, color: "#F0F4FF", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {storm.sampleTitle}
        </div>
        <div style={{ ...MONO, color: "#3D4F68", fontSize: "9px", marginTop: "2px" }}>
          {storm.count} issues · {storm.projects.slice(0, 3).join(", ")}{storm.projects.length > 3 ? ` +${storm.projects.length - 3}` : ""}
        </div>
      </div>
      <button
        className="sta-btn"
        onClick={() => suppressMutation.mutate(storm.fingerprint)}
        disabled={suppressMutation.isPending}
        style={{ padding: "3px 8px", fontSize: "9px", flexShrink: 0 }}
      >
        Suppress all
      </button>
      <button
        onClick={() => onDismiss(storm.fingerprint)}
        aria-label={`Dismiss ${storm.sampleTitle}`}
        style={{
          background: "none", border: "none", color: "#3D4F68",
          cursor: "pointer", fontSize: "12px", padding: "0 2px", flexShrink: 0,
        }}
      >
        ✕
      </button>
    </div>
  );
}

export function StormBanner() {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const { data } = useQuery<{ storms: Storm[] }>({
    queryKey: ["storms"],
    queryFn: () =>
      fetch("/api/issues/storms").then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }),
    staleTime: 60_000,
  });

  const handleDismiss = (fingerprint: string) => {
    // Dismiss is local-session only; dismissed storms reappear after query refetch
    // unless they were suppressed (which triggers storms query invalidation)
    setDismissed((prev) => new Set(prev).add(fingerprint));
  };

  const visible = (data?.storms ?? []).filter((s) => !dismissed.has(s.fingerprint));
  if (visible.length === 0) return null;

  return (
    <div style={{
      borderBottom: "1px solid #1F2D45", background: "#0D1825",
      padding: "8px 14px", flexShrink: 0, display: "flex", flexDirection: "column", gap: "6px",
    }}>
      <div style={{ ...MONO, color: "#F59E0B", letterSpacing: "0.12em", textTransform: "uppercase", fontSize: "9px" }}>
        ⚡ Storm detection — {visible.length} pattern{visible.length !== 1 ? "s" : ""} detected
      </div>
      {visible.map((storm) => (
        <StormRow key={storm.fingerprint} storm={storm} onDismiss={handleDismiss} />
      ))}
    </div>
  );
}
