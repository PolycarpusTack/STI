"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useCallback, useState } from "react";
import { useCockpitStore } from "@/lib/store";
import { relativeTime, confidenceLevel, CONF_COLORS } from "@/lib/format";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface Issue {
  id: string;
  sentryId: string;
  title: string;
  level: string;
  project: string;
  environment: string;
  culprit?: string;
  release?: string;
  eventCount: number;
  firstSeen: string;
  lastSeen: string;
  fingerprint: string;
  lean?: string | null;
  confidence?: number | null;
  stats?: number[] | null;
  brief?: {
    summary?: string;
    module?: string;
    tenantImpact?: string;
    reproductionHint?: string;
    priority?: string | null;
    issueType?: string | null;
    confidenceNotes?: string | null;
    signals?: string | null;
    promptVersion?: string;
    parseError?: string | null;
    rawResponse?: string | null;
  } | null;
  decision?: {
    decision: string;
    responder: string;
    timestamp: string;
    jiraKey?: string | null;
  } | null;
}

interface IssuesResponse {
  issues: Issue[];
  total: number;
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ counts }: { counts: number[] }) {
  if (counts.length < 2) return null;
  const max = Math.max(...counts, 1);
  const W = 48;
  const H = 14;
  const pts = counts
    .map((c, i) => `${(i / (counts.length - 1)) * W},${H - (c / max) * H}`)
    .join(" ");
  const last = counts[counts.length - 1];
  const prev = counts[counts.length - 2];
  const color = last > prev * 1.3 ? "#F87171" : "#2DD4BF";
  return (
    <svg width={W} height={H} style={{ display: "block", flexShrink: 0 }}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ─── Issue Row ───────────────────────────────────────────────────────────────

function IssueRow({
  issue,
  isSelected,
  isFocused,
  onClick,
  isChecked,
  selectMode,
  onCheck,
}: {
  issue: Issue;
  isSelected: boolean;
  isFocused: boolean;
  onClick: () => void;
  isChecked: boolean;
  selectMode: boolean;
  onCheck: (checked: boolean) => void;
}) {
  const lean = issue.lean ?? "";
  const conf = confidenceLevel(issue.confidence);
  const hasDisagreement = issue.decision && lean && issue.decision.decision !== lean;

  return (
    <button
      onClick={() => {
        if (selectMode) {
          onCheck(!isChecked);
        } else {
          onClick();
        }
      }}
      style={{
        display: "block", width: "100%", textAlign: "left",
        padding: "12px 14px",
        borderBottom: "1px solid #1F2D45",
        cursor: "pointer", background: "none", border: "none",
        backgroundColor: isSelected ? "#2A3855" : isFocused ? "#1C2333" : "transparent",
        boxShadow: isSelected ? "inset 3px 0 0 #2DD4BF" : "none",
        transition: "background 0.08s",
        position: "relative",
      }}
      onMouseEnter={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = "#111827";
      }}
      onMouseLeave={(e) => {
        if (!isSelected) e.currentTarget.style.backgroundColor = isFocused ? "#1C2333" : "transparent";
      }}
    >
      {selectMode && (
        <input
          type="checkbox"
          checked={isChecked}
          onChange={(e) => { e.stopPropagation(); onCheck(e.target.checked); }}
          onClick={(e) => e.stopPropagation()}
          style={{ marginRight: "8px", flexShrink: 0, accentColor: "#2DD4BF" }}
        />
      )}
      {/* Header: lean badge + id */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
        {lean && <span className={`sta-lean-badge sta-lean-${lean}`}>{lean}</span>}
        {issue.brief?.priority && issue.brief.priority !== "Noise" && (
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", letterSpacing: "0.08em",
            textTransform: "uppercase", padding: "2px 5px", borderRadius: "2px",
            color: issue.brief.priority === "P0" ? "#F87171" : issue.brief.priority === "P1" ? "#FB923C" : issue.brief.priority === "P2" ? "#F59E0B" : "#9ca3af",
            background: issue.brief.priority === "P0" ? "rgba(248,113,113,0.12)" : issue.brief.priority === "P1" ? "rgba(251,146,60,0.12)" : issue.brief.priority === "P2" ? "rgba(245,158,11,0.12)" : "rgba(156,163,175,0.10)",
          }}>{issue.brief.priority}</span>
        )}
        {issue.brief?.priority === "Noise" && (
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", letterSpacing: "0.08em",
            color: "#3D4F68", background: "rgba(61,79,104,0.15)", padding: "2px 5px", borderRadius: "2px",
          }}>noise</span>
        )}
        {issue.brief?.parseError && (
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", letterSpacing: "0.1em",
            textTransform: "uppercase", color: "#F87171",
            background: "rgba(248,113,113,0.08)", padding: "2px 5px", borderRadius: "2px",
          }}>err</span>
        )}
        <span style={{
          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
          fontSize: "10px", color: "#3D4F68", marginLeft: "auto",
        }}>
          {issue.sentryId}
        </span>
      </div>

      {/* Title / headline */}
      <div style={{
        fontSize: "13px", color: "#F0F4FF", lineHeight: 1.4, marginBottom: "6px",
        display: "-webkit-box",
        WebkitLineClamp: 2,
        WebkitBoxOrient: "vertical",
        overflow: "hidden",
      }}>
        {issue.brief?.summary ?? issue.title}
      </div>

      {/* Meta pills */}
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
        {issue.brief?.module && (
          <span className="sta-meta-pill">
            <span className="k">mod</span>
            <span className="v">{issue.brief.module}</span>
          </span>
        )}
        <span className="sta-meta-pill">
          <span className="k">evt</span>
          <span className="v">{issue.eventCount}</span>
        </span>
        {issue.stats && issue.stats.length >= 2 && (
          <Sparkline counts={issue.stats} />
        )}
        <span className="sta-meta-pill">
          <span className="k">age</span>
          <span className="v">{relativeTime(issue.lastSeen)}</span>
        </span>
        {conf && (
          <span
            title={`Confidence: ${conf}`}
            style={{
              display: "inline-block", width: "6px", height: "6px",
              borderRadius: "50%", backgroundColor: CONF_COLORS[conf],
            }}
          />
        )}
        {issue.decision && (
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", letterSpacing: "0.1em",
            textTransform: "uppercase",
            color: hasDisagreement ? "#F87171" : "#4ADE80",
            background: hasDisagreement ? "rgba(248,113,113,0.08)" : "rgba(74,222,128,0.08)",
            padding: "1px 5px", borderRadius: "2px",
          }}>
            {hasDisagreement ? `ai:${lean}` : issue.decision.decision}
          </span>
        )}
        {issue.decision?.jiraKey && (
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px", letterSpacing: "0.05em",
            color: "#2DD4BF", background: "rgba(45,212,191,0.08)",
            padding: "1px 5px", borderRadius: "2px",
          }}>
            {issue.decision.jiraKey}
          </span>
        )}
      </div>
    </button>
  );
}

// ─── Loading skeleton ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: "8px 0" }}>
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} style={{ padding: "12px 14px", borderBottom: "1px solid #1F2D45" }}>
          <div style={{ display: "flex", gap: "8px", marginBottom: "6px" }}>
            <div style={{ width: "48px", height: "14px", background: "#1C2333", borderRadius: "2px" }} />
            <div style={{ width: "64px", height: "14px", background: "#1C2333", borderRadius: "2px", marginLeft: "auto" }} />
          </div>
          <div style={{ height: "13px", background: "#1C2333", borderRadius: "2px", marginBottom: "4px", width: "90%" }} />
          <div style={{ height: "13px", background: "#1C2333", borderRadius: "2px", marginBottom: "8px", width: "60%" }} />
          <div style={{ display: "flex", gap: "8px" }}>
            <div style={{ width: "40px", height: "11px", background: "#1C2333", borderRadius: "2px" }} />
            <div style={{ width: "32px", height: "11px", background: "#1C2333", borderRadius: "2px" }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Issue List ───────────────────────────────────────────────────────────────

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

  // Local search state with 300ms debounce to avoid firing on every keystroke.
  const [localSearch, setLocalSearch] = useState(filters.search ?? "");
  useEffect(() => {
    const t = setTimeout(() => setFilters({ search: localSearch }), 300);
    return () => clearTimeout(t);
  }, [localSearch, setFilters]);
  // Keep local state in sync when filters are cleared externally.
  useEffect(() => {
    if (!filters.search) setLocalSearch("");
  }, [filters.search]);

  const { data: sentryProjects = [] } = useQuery<{ id: string; slug: string }[]>({
    queryKey: ["sentry-projects"],
    queryFn: () => fetch("/api/sentry-projects").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 60_000,
  });

  const [limit, setLimit] = useState(50);
  const [selectMode, setSelectMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [bulkPending, setBulkPending] = useState(false);
  // Reset limit and selection when view or filters change.
  useEffect(() => {
    setLimit(50);
    setSelectMode(false);
    setCheckedIds(new Set());
  }, [currentView, filters.lean, filters.search, filters.level, filters.project, filters.since24h]);

  const params = new URLSearchParams({ view: currentView, limit: String(limit) });
  if (filters.lean) params.set("lean", filters.lean);
  if (filters.search) params.set("search", filters.search);
  if (filters.level) params.set("level", filters.level);
  if (filters.project) params.set("project", filters.project);
  if (filters.since24h) params.set("since", "24h");

  const { data, isLoading, isError } = useQuery<IssuesResponse, Error>({
    queryKey: ["issues", currentView, filters.lean, filters.search, filters.level, filters.project, filters.since24h, limit],
    queryFn: () => fetch(`/api/issues?${params.toString()}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 10_000,
  });

  const issues = data?.issues ?? [];
  const total = data?.total ?? 0;

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

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (document.activeElement === searchInputRef.current) return;
      if (e.key === "ArrowDown" || e.key === "j") {
        e.preventDefault();
        setFocusedIndex(Math.min(focusedIndex + 1, issues.length - 1));
      } else if (e.key === "ArrowUp" || e.key === "k") {
        e.preventDefault();
        setFocusedIndex(Math.max(focusedIndex - 1, 0));
      } else if (e.key === "Enter" && issues[focusedIndex]) {
        e.preventDefault();
        selectIssue(issues[focusedIndex].id);
      }
    },
    [focusedIndex, issues, setFocusedIndex, selectIssue]
  );

  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-index="${focusedIndex}"]`) as HTMLElement | null;
    el?.scrollIntoView({ block: "nearest" });
  }, [focusedIndex]);

  useEffect(() => {
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ["issues"] });
    }, 30_000);
    return () => clearInterval(interval);
  }, [queryClient]);

  const viewLabel = currentView === "inbox"
    ? "Inbox"
    : currentView === "watchlist"
    ? "Watchlist"
    : currentView.charAt(0).toUpperCase() + currentView.slice(1);

  return (
    <div
      style={{ display: "flex", flexDirection: "column", height: "100%", outline: "none" }}
      onKeyDown={handleKeyDown}
      tabIndex={0}
    >
      {/* Header */}
      <div style={{
        padding: "10px 14px", borderBottom: "1px solid #1F2D45",
        background: "#111827", flexShrink: 0,
        display: "flex", alignItems: "center", gap: "10px",
      }}>
        <span style={{
          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
          fontSize: "11px", letterSpacing: "0.12em", textTransform: "uppercase", color: "#9BAAC4",
        }}>
          {viewLabel}
        </span>
        <span style={{
          fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#3D4F68",
        }}>
          {total}
        </span>
        {(currentView === "inbox" || currentView === "watchlist") && (
          <button
            className="sta-btn"
            onClick={() => { setSelectMode((m) => !m); setCheckedIds(new Set()); }}
            style={{ marginLeft: "auto", padding: "3px 8px", fontSize: "9px" }}
          >
            {selectMode ? "Cancel" : "Select"}
          </button>
        )}
      </div>

      {/* Search */}
      <div style={{ padding: "10px 14px", borderBottom: "1px solid #1F2D45", flexShrink: 0 }}>
        <input
          ref={searchInputRef}
          type="text"
          placeholder="search headlines, modules, tenants… ( / )"
          value={localSearch}
          onChange={(e) => setLocalSearch(e.target.value)}
          style={{
            width: "100%", background: "#1C2333", border: "1px solid #1F2D45",
            color: "#F0F4FF", padding: "6px 10px", borderRadius: "3px",
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
            fontSize: "11px", outline: "none",
          }}
          onFocus={(e) => { e.currentTarget.style.borderColor = "#0F5E56"; }}
          onBlur={(e) => { e.currentTarget.style.borderColor = "#1F2D45"; }}
        />
      </div>

      {/* Project / time-range filter */}
      {sentryProjects.length > 0 && (
        <div style={{ padding: "8px 14px", borderBottom: "1px solid #1F2D45", flexShrink: 0 }}>
          <select
            className="sta-select"
            value={filters.since24h ? "__24h__" : (filters.project ?? "")}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "__24h__") {
                setFilters({ project: null, since24h: true });
              } else if (v === "") {
                setFilters({ project: null, since24h: false });
              } else {
                setFilters({ project: v, since24h: false });
              }
            }}
            style={{ width: "100%" }}
          >
            <option value="">All projects</option>
            {sentryProjects.map((p) => (
              <option key={p.id} value={p.slug}>{p.slug}</option>
            ))}
            <option value="__24h__">Last 24h — all projects</option>
          </select>
        </div>
      )}

      {/* Lean filter chips */}
      <div style={{
        padding: "8px 14px", borderBottom: "1px solid #1F2D45",
        flexShrink: 0, display: "flex", gap: "6px", flexWrap: "wrap",
      }}>
        {(["jira", "close", "investigate", "watchlist"] as const).map((lean) => (
          <button
            key={lean}
            onClick={() => setFilters({ lean: filters.lean === lean ? null : lean })}
            className={`sta-lean-badge sta-lean-${lean}`}
            style={{
              cursor: "pointer",
              opacity: filters.lean && filters.lean !== lean ? 0.4 : 1,
              border: filters.lean === lean ? undefined : undefined,
              boxShadow: filters.lean === lean ? "0 0 0 1px currentColor" : "none",
            }}
          >
            {lean}
          </button>
        ))}
        {filters.lean && (
          <button
            onClick={() => setFilters({ lean: null })}
            style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "9px",
              letterSpacing: "0.1em", textTransform: "uppercase",
              color: "#3D4F68", background: "none", border: "none",
              cursor: "pointer", padding: "2px 4px",
            }}
          >
            ✕ clear
          </button>
        )}
      </div>

      {/* Bulk action bar */}
      {selectMode && checkedIds.size > 0 && (
        <div style={{
          borderTop: "1px solid #1F2D45", padding: "8px 14px",
          background: "#111827", flexShrink: 0,
          display: "flex", gap: "6px", alignItems: "center",
        }}>
          <span style={{
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
            fontSize: "10px", color: "#3D4F68", marginRight: "4px",
          }}>
            {checkedIds.size} selected
          </span>
          {(["close", "watchlist", "investigate"] as const).map((action) => (
            <button
              key={action}
              className={`sta-lean-badge sta-lean-${action}`}
              disabled={bulkPending}
              style={{ cursor: "pointer" }}
              onClick={async () => {
                setBulkPending(true);
                try {
                  await fetch("/api/decisions/bulk", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ issueIds: Array.from(checkedIds), decision: action }),
                  });
                  queryClient.invalidateQueries({ queryKey: ["issues"] });
                  queryClient.invalidateQueries({ queryKey: ["metrics"] });
                  queryClient.invalidateQueries({ queryKey: ["nav-count"] });
                  setCheckedIds(new Set());
                  setSelectMode(false);
                } finally {
                  setBulkPending(false);
                }
              }}
            >
              {action} all
            </button>
          ))}
          <button
            className="sta-btn"
            style={{ padding: "2px 8px", fontSize: "9px", marginLeft: "auto" }}
            onClick={() => {
              if (checkedIds.size === issues.length) {
                setCheckedIds(new Set());
              } else {
                setCheckedIds(new Set(issues.map((i) => i.id)));
              }
            }}
          >
            {checkedIds.size === issues.length ? "Deselect all" : "Select all"}
          </button>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {isLoading && <LoadingSkeleton />}

        {isError && !isLoading && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "200px", gap: "8px",
            color: "#F87171", fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
          }}>
            <span>⚠</span>
            <span>Failed to load issues</span>
            <button
              onClick={() => queryClient.invalidateQueries({ queryKey: ["issues"] })}
              className="sta-btn"
              style={{ fontSize: "10px", padding: "4px 10px" }}
            >
              Retry
            </button>
          </div>
        )}

        {!isLoading && !isError && issues.length === 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            justifyContent: "center", height: "200px", gap: "8px",
            fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
            letterSpacing: "0.08em", textTransform: "uppercase", color: "#3D4F68",
          }}>
            <span style={{ fontSize: "32px" }}>⌬</span>
            <span>Nothing to triage</span>
            {filters.search && (
              <button
                onClick={() => { setLocalSearch(""); setFilters({ search: "" }); }}
                className="sta-btn"
                style={{ fontSize: "10px", padding: "4px 10px" }}
              >
                Clear search
              </button>
            )}
          </div>
        )}

        {!isLoading && !isError && issues.length > 0 && (
          <div ref={listRef}>
            {issues.map((issue, index) => (
              <div key={issue.id} data-index={index}>
                <IssueRow
                  issue={issue}
                  isSelected={issue.id === selectedIssueId}
                  isFocused={index === focusedIndex}
                  isChecked={checkedIds.has(issue.id)}
                  selectMode={selectMode}
                  onClick={() => selectIssue(issue.id)}
                  onCheck={(checked) => {
                    setCheckedIds((prev) => {
                      const next = new Set(prev);
                      if (checked) next.add(issue.id);
                      else next.delete(issue.id);
                      return next;
                    });
                  }}
                />
              </div>
            ))}
            {issues.length < total && (
              <div style={{ padding: "12px 14px", borderTop: "1px solid #1F2D45" }}>
                <button
                  className="sta-btn"
                  onClick={() => setLimit((l) => l + 50)}
                  style={{ width: "100%", justifyContent: "center", fontSize: "10px" }}
                >
                  Load more ({issues.length} / {total})
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export type { IssuesResponse };
