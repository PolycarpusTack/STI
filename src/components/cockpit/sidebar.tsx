"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Settings, HelpCircle } from "lucide-react";
import { useCockpitStore, type ViewType } from "@/lib/store";
import { toast } from "sonner";
import type { Metrics } from "@/lib/types";

function pipelineStatus(metrics: Metrics | undefined, isError: boolean) {
  if (isError || !metrics) return { label: "UNKNOWN", color: "#3D4F68" };
  if (!metrics.sentryConfigured) return { label: "NOT CONFIGURED", color: "#F87171" };
  if (!metrics.lastPull) return { label: "WAITING", color: "#F59E0B" };
  const minAgo = Math.floor((Date.now() - new Date(metrics.lastPull).getTime()) / 60_000);
  if (minAgo < 20) return { label: "OPERATIONAL", color: "#4ADE80" };
  if (minAgo <= 60) return { label: "STALE", color: "#F59E0B" };
  return { label: "CRITICAL", color: "#F87171" };
}

const VIEWS: { view: ViewType; label: string }[] = [
  { view: "inbox", label: "Inbox" },
  { view: "watchlist", label: "Watchlist" },
  { view: "decisions", label: "Decisions" },
  { view: "suppressed", label: "Suppressed" },
];

function NavCount({ view }: { view: ViewType }) {
  const { data } = useQuery<number>({
    queryKey: ["nav-count", view],
    queryFn: async () => {
      if (view === "decisions") {
        const res = await fetch("/api/decisions?limit=1");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return json.total ?? 0;
      }
      if (view === "suppressed") {
        const res = await fetch("/api/suppressions");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        return Array.isArray(json) ? json.length : 0;
      }
      const res = await fetch(`/api/issues?view=${view}&limit=1`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      return json.total ?? 0;
    },
    staleTime: 30_000,
  });
  return (
    <span style={{
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
      fontSize: "11px",
    }}>
      {data ?? 0}
    </span>
  );
}

export function Sidebar() {
  const { currentView, setCurrentView } = useCockpitStore();
  const queryClient = useQueryClient();

  const { data: metrics, isError: metricsError } = useQuery<Metrics>({
    queryKey: ["metrics"],
    queryFn: () => fetch("/api/metrics").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 30_000,
  });

  const status = pipelineStatus(metrics, metricsError);

  const pipelineMutation = useMutation({
    mutationFn: () => fetch("/api/pipeline/run", { method: "POST" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      toast.success("Pipeline started");
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
    onError: () => toast.error("Failed to run pipeline"),
  });

  return (
    <aside style={{
      width: "200px", flexShrink: 0,
      background: "#111827",
      borderRight: "1px solid #1F2D45",
      display: "flex", flexDirection: "column",
      overflow: "hidden",
    }}>
      {/* Views */}
      <div style={{ padding: "14px 14px 6px" }}>
        <div style={{
          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
          fontSize: "9px", letterSpacing: "0.14em", textTransform: "uppercase",
          color: "#3D4F68", padding: "0 6px 8px",
        }}>
          Views
        </div>
        {VIEWS.map(({ view, label }) => {
          const isActive = currentView === view;
          return (
            <button
              key={view}
              onClick={() => setCurrentView(view)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "6px 10px", borderRadius: "3px", cursor: "pointer",
                fontSize: "12.5px", width: "100%",
                background: "none", border: "none",
                color: isActive ? "#2DD4BF" : "#9BAAC4",
                backgroundColor: isActive ? "#2A3855" : "transparent",
                boxShadow: isActive ? "inset 2px 0 0 #2DD4BF" : "none",
                textAlign: "left",
                transition: "all 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "#232E45";
                  e.currentTarget.style.color = "#F0F4FF";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "#9BAAC4";
                }
              }}
            >
              <span>{label}</span>
              <NavCount view={view} />
            </button>
          );
        })}
      </div>

      <div style={{ flex: 1 }} />

      {/* Settings + Help */}
      <div style={{ borderTop: "1px solid #1F2D45", padding: "8px 14px" }}>
        {(["settings", "help"] as const).map((v) => {
          const isActive = currentView === v;
          const Icon = v === "settings" ? Settings : HelpCircle;
          const label = v === "settings" ? "Settings" : "Help";
          return (
            <button
              key={v}
              onClick={() => setCurrentView(v)}
              style={{
                display: "flex", alignItems: "center", gap: "8px",
                padding: "6px 10px", borderRadius: "3px", cursor: "pointer",
                fontSize: "12.5px", width: "100%",
                background: "none", border: "none",
                color: isActive ? "#2DD4BF" : "#5E6F8A",
                backgroundColor: isActive ? "#2A3855" : "transparent",
                boxShadow: isActive ? "inset 2px 0 0 #2DD4BF" : "none",
                textAlign: "left", transition: "all 0.1s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "#232E45";
                  e.currentTarget.style.color = "#9BAAC4";
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "#5E6F8A";
                }
              }}
            >
              <Icon size={13} />
              <span>{label}</span>
            </button>
          );
        })}
      </div>

      {/* Pipeline status */}
      <div style={{ borderTop: "1px solid #1F2D45", padding: "10px 20px" }}>
        <div style={{
          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
          fontSize: "9px", color: "#3D4F68", letterSpacing: "0.12em", lineHeight: 1.8,
        }}>
          PIPELINE<br />
          <span style={{ color: status.color, fontSize: "10px" }}>● {status.label}</span>
          {metrics?.llmModel && (
            <>
              <br />
              <span style={{ color: "#3D4F68", fontSize: "9px" }}>
                MODEL: {metrics.llmModel}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Run pipeline */}
      <div style={{ borderTop: "1px solid #1F2D45", padding: "8px 14px" }}>
        <button
          className="sta-btn"
          onClick={() => pipelineMutation.mutate()}
          disabled={pipelineMutation.isPending}
          style={{ width: "100%", justifyContent: "center" }}
        >
          {pipelineMutation.isPending ? "Running…" : "Run Pipeline"}
        </button>
      </div>
    </aside>
  );
}
