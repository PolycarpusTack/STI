"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Download } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateTime } from "@/lib/format";

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
  jiraKey: string | null;
  jiraSummary: string | null;
  suppressReason: string | null;
  suppressScope: string | null;
}

interface DecisionsResponse {
  decisions: Decision[];
  total: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function csvCell(val: string): string {
  if (/[",\n\r]/.test(val)) return `"${val.replace(/"/g, '""')}"`;
  return val;
}

function downloadCSV(decisions: Decision[]) {
  const headers = ["Timestamp", "Issue Title", "Sentry ID", "AI Lean", "Human Decision", "Responder", "Disagreement", "Jira Key", "Suppress Reason"];
  const rows = decisions.map((d) => [
    d.timestamp, d.issueTitle, d.sentryId,
    d.aiLean ?? "", d.humanDecision, d.responder, d.disagreement ? "Yes" : "No",
    d.jiraKey ?? "", d.suppressReason ?? "",
  ].map(csvCell));
  const csv = [headers.map(csvCell).join(","), ...rows.map((r) => r.join(","))].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `decisions-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Component ───────────────────────────────────────────────────────────────

const DATE_PRESETS = [
  { label: "All time", days: 0 },
  { label: "Today", days: 1 },
  { label: "Last 7 days", days: 7 },
  { label: "Last 30 days", days: 30 },
  { label: "Last 90 days", days: 90 },
] as const;

export function DecisionsView() {
  const [disagreementOnly, setDisagreementOnly] = useState(false);
  const [sinceDays, setSinceDays] = useState(0);

  const params = new URLSearchParams({ limit: "500" });
  if (disagreementOnly) params.set("disagreement", "true");
  if (sinceDays > 0) params.set("since", String(Date.now() - sinceDays * 86_400_000));

  const { data, isLoading, isError } = useQuery<DecisionsResponse, Error>({
    queryKey: ["decisions", disagreementOnly, sinceDays],
    queryFn: () => fetch(`/api/decisions?${params.toString()}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 15_000,
  });

  const decisions = data?.decisions ?? [];
  const total = data?.total ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* Header */}
      <div style={{
        padding: "14px 24px", borderBottom: "1px solid #1F2D45",
        background: "#111827", flexShrink: 0,
        display: "flex", alignItems: "center", gap: "12px",
      }}>
        <div>
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
            letterSpacing: "0.12em", textTransform: "uppercase", color: "#9BAAC4",
          }}>
            Decisions Log
          </span>
          <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#3D4F68", marginLeft: "10px" }}>
            {total}
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: "8px", alignItems: "center" }}>
          <select
            value={sinceDays}
            onChange={(e) => setSinceDays(Number(e.target.value))}
            className="sta-select"
            style={{ padding: "4px 8px", fontSize: "11px", height: "auto" }}
          >
            {DATE_PRESETS.map((p) => (
              <option key={p.days} value={p.days}>{p.label}</option>
            ))}
          </select>
          <button
            className="sta-btn"
            onClick={() => setDisagreementOnly(!disagreementOnly)}
            style={{
              color: disagreementOnly ? "#F87171" : undefined,
              borderColor: disagreementOnly ? "#7A1515" : undefined,
              background: disagreementOnly ? "rgba(248,113,113,0.06)" : undefined,
            }}
          >
            <AlertTriangle size={12} />
            Disagreements only
          </button>
          <button
            className="sta-btn"
            onClick={() => decisions.length > 0 && downloadCSV(decisions)}
            disabled={decisions.length === 0}
          >
            <Download size={12} />
            Export CSV
          </button>
        </div>
      </div>

      {/* Table */}
      <div style={{ flex: 1, overflow: "hidden" }}>
        {isLoading && (
          <div style={{ padding: "16px" }}>
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full mb-2" />
            ))}
          </div>
        )}

        {isError && (
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "center",
            height: "100%", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#F87171",
          }}>
            Failed to load decisions
          </div>
        )}

        {!isLoading && !isError && decisions.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "200px", gap: "8px",
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
            letterSpacing: "0.08em", textTransform: "uppercase", color: "#3D4F68",
          }}>
            <span style={{ fontSize: "32px", opacity: 0.4 }}>⎙</span>
            No decisions yet this session.
          </div>
        )}

        {!isLoading && !isError && decisions.length > 0 && (
          <ScrollArea className="h-full">
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  {["Timestamp", "Issue", "AI Lean", "Decision", "Responder", "Disagree?"].map((h) => (
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
                {decisions.map((d) => (
                  <tr
                    key={d.id}
                    style={{
                      background: d.disagreement ? "rgba(248,113,113,0.04)" : "transparent",
                    }}
                    onMouseEnter={(e) => { e.currentTarget.style.background = "#111827"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = d.disagreement ? "rgba(248,113,113,0.04)" : "transparent"; }}
                  >
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A" }}>
                      {formatDateTime(d.timestamp)}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontSize: "13px", color: "#9BAAC4", maxWidth: "300px" }}>
                      <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.issueTitle}</div>
                      <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "2px" }}>{d.sentryId}</div>
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45" }}>
                      {d.aiLean
                        ? <span className={`sta-lean-badge sta-lean-${d.aiLean}`}>{d.aiLean}</span>
                        : <span style={{ color: "#3D4F68" }}>—</span>}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45" }}>
                      <span className={`sta-lean-badge sta-lean-${d.humanDecision}`}>{d.humanDecision}</span>
                      {d.jiraKey && (
                        <div style={{
                          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
                          color: "#2DD4BF", marginTop: "4px", letterSpacing: "0.04em",
                        }}>
                          {d.jiraKey}
                        </div>
                      )}
                      {d.suppressReason && (
                        <div style={{
                          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
                          color: "#5E6F8A", marginTop: "4px", fontStyle: "italic",
                        }}>
                          {d.suppressReason}
                          {d.suppressScope && ` (${d.suppressScope})`}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A" }}>
                      {d.responder}
                    </td>
                    <td style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45" }}>
                      {d.disagreement && (
                        <span className="sta-disagree-tag" style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                          <AlertTriangle size={10} />
                          yes
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollArea>
        )}
      </div>
    </div>
  );
}
