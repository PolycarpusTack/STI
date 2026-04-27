"use client";

import { useEffect, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCockpitStore } from "@/lib/store";
import type { Issue } from "@/lib/types";
import { relativeTime, formatDateTime, confidenceLevel, CONF_COLORS } from "@/lib/format";

const CONF_COLOR = CONF_COLORS;

// ─── Component ───────────────────────────────────────────────────────────────

export function IssueDetail() {
  const { selectedIssueId, openJiraModal, openSuppressModal } = useCockpitStore();
  const queryClient = useQueryClient();

  const { data: issue, isLoading, isError } = useQuery<Issue, Error>({
    queryKey: ["issue", selectedIssueId],
    queryFn: () => fetch(`/api/issues/${selectedIssueId}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    enabled: !!selectedIssueId,
    staleTime: 10_000,
  });

  const decisionMutation = useMutation({
    mutationFn: ({ issueId, decision }: { issueId: string; decision: string }) =>
      fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueId, decision, responderId: 'responder-1' }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", selectedIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
    },
  });

  const handleAction = useCallback(
    (decision: string) => {
      if (!selectedIssueId) return;
      if (decision === "jira") { openJiraModal(selectedIssueId); return; }
      if (decision === "suppress") { openSuppressModal(selectedIssueId); return; }
      decisionMutation.mutate({ issueId: selectedIssueId, decision });
    },
    [selectedIssueId, openJiraModal, openSuppressModal, decisionMutation]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedIssueId) return;
      if (document.activeElement instanceof HTMLInputElement ||
          document.activeElement instanceof HTMLTextAreaElement) return;
      const map: Record<string, string> = {
        "1": "jira", "2": "close", "3": "investigate", "4": "watchlist",
        s: "suppress", S: "suppress", u: "undo", U: "undo",
      };
      const action = map[e.key];
      if (!action) return;
      e.preventDefault();
      if (action === "undo") {
        decisionMutation.mutate({ issueId: selectedIssueId, decision: "undo" });
      } else {
        handleAction(action);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIssueId, handleAction, decisionMutation]);

  if (!selectedIssueId) {
    return (
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        flexDirection: "column", height: "100%", gap: "10px",
        fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
        fontSize: "11px", letterSpacing: "0.08em", textTransform: "uppercase", color: "#3D4F68",
      }}>
        <span style={{ fontSize: "42px" }}>⌬</span>
        <span>No issue selected</span>
        <span style={{ fontSize: "10px", textTransform: "none", letterSpacing: 0, color: "#3D4F68" }}>
          <KbdInline>↑</KbdInline><KbdInline>↓</KbdInline>{" "}or{" "}
          <KbdInline>j</KbdInline><KbdInline>k</KbdInline>{" "}to navigate
        </span>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ padding: "20px 24px" }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{ marginBottom: "14px" }}>
            <div style={{ height: "13px", background: "#1C2333", borderRadius: "2px", width: "70%", marginBottom: "6px" }} />
            <div style={{ height: "11px", background: "#1C2333", borderRadius: "2px", width: "50%" }} />
          </div>
        ))}
      </div>
    );
  }

  if (isError || !issue) {
    return (
      <div style={{
        display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", height: "100%", gap: "8px",
        fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#F87171",
      }}>
        <span>⚠</span>
        <span>Failed to load issue</span>
      </div>
    );
  }

  const lean = issue.lean ?? "";
  const conf = confidenceLevel(issue.confidence);
  const confPct = Math.round((issue.confidence ?? 0) * 100);
  const hasDisagreement = issue.decision && lean && issue.decision.decision !== lean;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* dhead */}
      <div style={{ padding: "16px 24px", borderBottom: "1px solid #1F2D45", background: "#111827", flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "8px", flexWrap: "wrap" }}>
          {lean && <span className={`sta-lean-badge sta-lean-${lean}`}>{lean}</span>}
          {issue.brief?.priority && (
            <span style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", letterSpacing: "0.08em",
              textTransform: "uppercase", padding: "2px 6px", borderRadius: "2px",
              color: issue.brief.priority === "P0" ? "#F87171" : issue.brief.priority === "P1" ? "#FB923C" : issue.brief.priority === "P2" ? "#F59E0B" : issue.brief.priority === "Noise" ? "#3D4F68" : "#9ca3af",
              background: issue.brief.priority === "P0" ? "rgba(248,113,113,0.12)" : issue.brief.priority === "P1" ? "rgba(251,146,60,0.12)" : issue.brief.priority === "P2" ? "rgba(245,158,11,0.12)" : issue.brief.priority === "Noise" ? "rgba(61,79,104,0.15)" : "rgba(156,163,175,0.10)",
            }}>{issue.brief.priority}</span>
          )}
          {issue.brief?.issueType && (
            <span style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", letterSpacing: "0.08em",
              textTransform: "uppercase", color: "#5E6F8A",
            }}>{issue.brief.issueType}</span>
          )}
          {hasDisagreement && <span className="sta-disagree-tag">disagree</span>}
          {issue.brief?.module && (
            <span style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
              letterSpacing: "0.08em", textTransform: "uppercase", color: "#5E6F8A",
            }}>
              {issue.brief.module}
            </span>
          )}
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginLeft: "auto",
          }}>
            {issue.sentryId} · fp:{issue.fingerprint.slice(0, 8)}
          </span>
        </div>

        <div style={{ fontSize: "18px", fontWeight: 500, color: "#F0F4FF", lineHeight: 1.35, marginBottom: "8px" }}>
          {issue.brief?.summary ?? issue.title}
        </div>

        <div style={{
          display: "flex", gap: "16px", flexWrap: "wrap",
          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A",
        }}>
          {[
            ["Env", issue.environment],
            ["Events", String(issue.eventCount)],
            ["First seen", relativeTime(issue.firstSeen)],
            ["Last seen", relativeTime(issue.lastSeen)],
            ...(issue.release ? [["Release", issue.release]] as const : []),
          ].map(([k, v]) => (
            <div key={k}>
              <span style={{ textTransform: "uppercase", letterSpacing: "0.08em", fontSize: "9px", color: "#3D4F68", marginRight: "6px" }}>{k}</span>
              <span style={{ color: "#9BAAC4" }}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions bar */}
      <div style={{
        padding: "12px 24px", borderBottom: "1px solid #1F2D45", background: "#111827",
        display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center", flexShrink: 0,
      }}>
        <button className="sta-btn primary" onClick={() => handleAction("jira")} disabled={decisionMutation.isPending}>
          Draft Jira <span className="kbd">1</span>
        </button>
        <button className="sta-btn" onClick={() => handleAction("close")} disabled={decisionMutation.isPending}>
          Close as noise <span className="kbd">2</span>
        </button>
        <button className="sta-btn" onClick={() => handleAction("investigate")} disabled={decisionMutation.isPending}>
          Investigate <span className="kbd">3</span>
        </button>
        <button className="sta-btn" onClick={() => handleAction("watchlist")} disabled={decisionMutation.isPending}>
          Watchlist <span className="kbd">4</span>
        </button>
        <div style={{ flex: 1 }} />
        <button className="sta-btn danger" onClick={() => handleAction("suppress")} disabled={decisionMutation.isPending}>
          Suppress fingerprint <span className="kbd">S</span>
        </button>
        {issue.decision && (
          <button
            className="sta-btn"
            onClick={() => decisionMutation.mutate({ issueId: issue.id, decision: "undo" })}
            disabled={decisionMutation.isPending}
          >
            Undo <span className="kbd">U</span>
          </button>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px 48px" }}>

        {/* Current decision */}
        {issue.decision && (
          <div style={{ marginBottom: "24px" }}>
            <div className="sta-s-title">Decision</div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
              <span className={`sta-lean-badge sta-lean-${issue.decision.decision}`}>{issue.decision.decision}</span>
              <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#5E6F8A" }}>
                by <span style={{ color: "#9BAAC4" }}>{issue.decision.responder}</span>
              </span>
              <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#3D4F68" }}>
                {formatDateTime(issue.decision.timestamp)}
              </span>
            </div>
            {hasDisagreement && (
              <p style={{ marginTop: "6px", fontSize: "12px", color: "#F59E0B", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)" }}>
                Human chose &ldquo;{issue.decision.decision}&rdquo; — AI recommended &ldquo;{lean}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* AI Lean */}
        {issue.brief && (
          <div style={{ marginBottom: "24px" }}>
            <div className="sta-s-title">
              AI Lean
              {issue.brief.promptVersion && (
                <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", color: "#3D4F68", marginLeft: "4px" }}>
                  {issue.brief.promptVersion}
                </span>
              )}
            </div>

            <div style={{
              background: "#111827", border: "1px solid #1F2D45", borderRadius: "3px",
              padding: "16px", display: "grid", gridTemplateColumns: "auto 1fr", gap: "16px",
              alignItems: "center", marginBottom: "14px",
            }}>
              <div className={`sta-lean-big ${lean}`}>
                <span className="word">{lean || "—"}</span>
                <span className="label">{conf} · {confPct}%</span>
              </div>
              <div style={{ color: "#F0F4FF", fontSize: "13.5px", lineHeight: 1.55 }}>
                {issue.brief.summary}
              </div>
            </div>

            {/* Confidence panel */}
            <div className="sta-conf-panel">
              <span className={`dot ${conf}`} />
              <span className="word" style={{ color: CONF_COLOR[conf] }}>{conf}</span>
              <span className="note">
                {conf === "high"
                  ? "No caveats — inputs are complete and classification is clear."
                  : `Confidence at ${confPct}% — review context before acting.`}
              </span>
            </div>
          </div>
        )}

        {/* No brief */}
        {!issue.brief && (
          <div style={{ marginBottom: "24px" }}>
            <div className="sta-s-title">AI Brief</div>
            <div style={{
              border: "1px dashed #1F2D45", borderRadius: "3px", padding: "32px 24px",
              textAlign: "center",
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
              letterSpacing: "0.08em", textTransform: "uppercase", color: "#3D4F68",
            }}>
              <div style={{ fontSize: "28px", marginBottom: "10px", color: "#2E3F5C" }}>⌬</div>
              No brief generated yet
              <div style={{ marginTop: "12px" }}>
                <GenerateBriefButton issueId={issue.id} />
              </div>
            </div>
          </div>
        )}

        {/* Brief parse error */}
        {issue.brief?.parseError && (
          <div style={{
            marginBottom: "24px", border: "1px solid #7A1515",
            background: "rgba(248,113,113,0.04)", borderRadius: "3px", padding: "12px 14px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", justifyContent: "space-between",
              marginBottom: "8px",
            }}>
              <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#F87171" }}>
                ⚠ Brief parse error
              </div>
              <GenerateBriefButton issueId={issue.id} label="Regenerate" />
            </div>
            <p style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11.5px", color: "#9BAAC4", marginBottom: issue.brief.rawResponse ? "10px" : 0 }}>
              {issue.brief.parseError}
            </p>
            {issue.brief.rawResponse && (
              <details>
                <summary style={{
                  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
                  color: "#3D4F68", cursor: "pointer", letterSpacing: "0.08em",
                  textTransform: "uppercase", userSelect: "none",
                }}>
                  Raw LLM response
                </summary>
                <pre style={{
                  marginTop: "8px", padding: "10px", background: "#0B0F19",
                  border: "1px solid #1C2333", borderRadius: "2px",
                  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
                  color: "#5E6F8A", overflowX: "auto", whiteSpace: "pre-wrap",
                  maxHeight: "200px", overflowY: "auto",
                }}>
                  {issue.brief.rawResponse}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Impact / KV */}
        {issue.brief && (issue.brief.module || issue.brief.tenantImpact || issue.brief.signals || issue.brief.confidenceNotes) && (
          <div style={{ marginBottom: "24px" }}>
            <div className="sta-s-title">Impact</div>
            <div className="sta-kv-grid">
              {issue.brief.module && (
                <>
                  <span className="k">Module</span>
                  <span className="v">{issue.brief.module}</span>
                </>
              )}
              {issue.brief.tenantImpact && (
                <>
                  <span className="k">Who is affected</span>
                  <span className="v">{issue.brief.tenantImpact}</span>
                </>
              )}
              {issue.brief.signals && (
                <>
                  <span className="k">Signals</span>
                  <span className="v">{issue.brief.signals}</span>
                </>
              )}
              {issue.brief.confidenceNotes && (
                <>
                  <span className="k">Confidence notes</span>
                  <span className="v" style={{ color: "#F59E0B" }}>{issue.brief.confidenceNotes}</span>
                </>
              )}
              <span className="k">Events</span>
              <span className="v">{issue.eventCount}</span>
              <span className="k">Level</span>
              <span className="v">{issue.level}</span>
            </div>
          </div>
        )}

        {/* Where to look / stacktrace */}
        {issue.brief?.reproductionHint && (
          <div style={{ marginBottom: "24px" }}>
            <div className="sta-s-title">Reproduction hint</div>
            <div className="sta-code-block">
              <div className="line">{issue.brief.reproductionHint}</div>
            </div>
          </div>
        )}

        {/* Fingerprint */}
        <div style={{ marginBottom: "24px" }}>
          <div className="sta-s-title">Fingerprint</div>
          <div className="sta-code-block" style={{ wordBreak: "break-all", cursor: "text" }}>
            <span className="line">{issue.fingerprint}</span>
          </div>
        </div>

        {/* Issue metadata */}
        <div>
          <div className="sta-s-title">Metadata</div>
          <div className="sta-kv-grid">
            <span className="k">Sentry ID</span>
            <span className="v" style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px" }}>{issue.sentryId}</span>
            <span className="k">Project</span>
            <span className="v">{issue.project}</span>
            <span className="k">Environment</span>
            <span className="v">{issue.environment}</span>
            {issue.culprit && (
              <>
                <span className="k">Culprit</span>
                <span className="v" style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", wordBreak: "break-all" }}>{issue.culprit}</span>
              </>
            )}
            {issue.release && (
              <>
                <span className="k">Release</span>
                <span className="v" style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px" }}>{issue.release}</span>
              </>
            )}
            <span className="k">First seen</span>
            <span className="v" style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px" }}>{formatDateTime(issue.firstSeen)}</span>
            <span className="k">Last seen</span>
            <span className="v" style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px" }}>{formatDateTime(issue.lastSeen)}</span>
          </div>
        </div>

      </div>
    </div>
  );
}

function KbdInline({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display: "inline-block", padding: "1px 5px",
      background: "#1C2333", border: "1px solid #1F2D45", borderRadius: "3px",
      color: "#9BAAC4", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
      margin: "0 1px",
    }}>
      {children}
    </span>
  );
}

function GenerateBriefButton({ issueId, label = "Generate Brief" }: { issueId: string; label?: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      fetch(`/api/brief/${issueId}`, { method: "POST" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", issueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
    },
  });

  return (
    <button
      className="sta-btn"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending}
      style={{ display: "inline-flex" }}
    >
      {mutation.isPending ? "Generating…" : label}
    </button>
  );
}
