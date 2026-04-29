"use client";

import { useEffect, useRef, useState } from "react";

const APP_VERSION = "0.4";

// ─── TOC structure ────────────────────────────────────────────────────────────

const TOC: { label: string; links: { id: string; text: string }[] }[] = [
  {
    label: "Release Notes",
    links: [{ id: "help-whats-new", text: "What's new in v0.4" }],
  },
  {
    label: "Getting Started",
    links: [
      { id: "help-overview", text: "What is STA?" },
      { id: "help-quickstart", text: "5-minute quickstart" },
    ],
  },
  {
    label: "Views",
    links: [
      { id: "help-inbox", text: "Inbox" },
      { id: "help-watchlist", text: "Watchlist" },
      { id: "help-decisions", text: "Decisions" },
      { id: "help-suppressed", text: "Suppressed" },
      { id: "help-team", text: "Team" },
      { id: "help-settings-view", text: "Settings" },
    ],
  },
  {
    label: "Triage Workflow",
    links: [
      { id: "help-triage-flow", text: "The triage flow" },
      { id: "help-keyboard", text: "Keyboard shortcuts" },
      { id: "help-undo", text: "Undo & corrections" },
    ],
  },
  {
    label: "Sentinel AI",
    links: [
      { id: "help-sentinel", text: "What Sentinel does" },
      { id: "help-priority", text: "Priority levels" },
      { id: "help-lean", text: "Lean values" },
      { id: "help-confidence", text: "Confidence score" },
    ],
  },
  {
    label: "Integrations",
    links: [
      { id: "help-jira", text: "Jira integration" },
      { id: "help-sentry", text: "Sentry connection" },
    ],
  },
  {
    label: "Suppression",
    links: [
      { id: "help-suppress-how", text: "How suppression works" },
      { id: "help-suppress-scope", text: "Global vs tenant scope" },
    ],
  },
  {
    label: "Pipeline & Settings",
    links: [
      { id: "help-pipeline", text: "Ingestion pipeline" },
      { id: "help-llm-config", text: "LLM configuration" },
      { id: "help-poll-interval", text: "Poll interval" },
    ],
  },
  {
    label: "Reference",
    links: [
      { id: "help-troubleshooting", text: "Troubleshooting" },
      { id: "help-faq", text: "FAQ" },
    ],
  },
];

// ─── Sub-components ───────────────────────────────────────────────────────────

function H2({ children }: { children: React.ReactNode }) {
  return (
    <h2 style={{
      fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
      fontSize: "22px", fontWeight: 700, letterSpacing: "-0.4px",
      color: "#F0F4FF", marginBottom: "14px", paddingBottom: "10px",
      borderBottom: "2px solid #1F2D45",
    }}>
      {children}
    </h2>
  );
}

function H3({ children }: { children: React.ReactNode }) {
  return (
    <h3 style={{
      fontSize: "14px", fontWeight: 600, color: "#2DD4BF",
      margin: "22px 0 9px", letterSpacing: "-0.1px",
    }}>
      {children}
    </h3>
  );
}

function P({ children }: { children: React.ReactNode }) {
  return (
    <p style={{ color: "#9BAAC4", fontSize: "13.5px", lineHeight: 1.75, marginBottom: "11px" }}>
      {children}
    </p>
  );
}

function UL({ children }: { children: React.ReactNode }) {
  return (
    <ul style={{ margin: "0 0 14px 22px", color: "#9BAAC4", fontSize: "13.5px", lineHeight: 1.8 }}>
      {children}
    </ul>
  );
}

function LI({ children }: { children: React.ReactNode }) {
  return <li style={{ marginBottom: "4px" }}>{children}</li>;
}

function Strong({ children }: { children: React.ReactNode }) {
  return <strong style={{ color: "#F0F4FF", fontWeight: 600 }}>{children}</strong>;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code style={{
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)",
      fontSize: "85%", background: "#1C2333", padding: "1px 6px",
      borderRadius: "3px", color: "#2DD4BF", border: "1px solid #1F2D45",
    }}>
      {children}
    </code>
  );
}

function Callout({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(45,212,191,0.06), rgba(91,51,240,0.03))",
      border: "1px solid rgba(45,212,191,0.18)",
      borderLeft: "3px solid #2DD4BF",
      borderRadius: "4px", padding: "14px 18px", margin: "14px 0 18px",
    }}>
      <div style={{
        fontSize: "11px", fontWeight: 600, color: "#2DD4BF",
        textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "7px",
      }}>
        {title}
      </div>
      <div style={{ color: "#9BAAC4", fontSize: "13px", lineHeight: 1.7 }}>
        {children}
      </div>
    </div>
  );
}

function Steps({ items }: { items: string[] }) {
  return (
    <ol style={{ listStyle: "none", margin: "0 0 16px 0", padding: 0 }}>
      {items.map((item, i) => (
        <li key={i} style={{
          position: "relative", padding: "11px 16px 11px 50px",
          background: "#141B2D", border: "1px solid #1F2D45",
          borderRadius: "4px", marginBottom: "8px",
          fontSize: "13.5px", lineHeight: 1.7, color: "#9BAAC4",
        }}>
          <span style={{
            position: "absolute", left: "13px", top: "11px",
            width: "24px", height: "24px",
            background: "linear-gradient(135deg, #2DD4BF, #5B33F0)",
            color: "#fff", borderRadius: "50%",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: "var(--font-geist-sans, system-ui, sans-serif)",
            fontSize: "11px", fontWeight: 700,
          }}>
            {i + 1}
          </span>
          <span dangerouslySetInnerHTML={{ __html: item }} />
        </li>
      ))}
    </ol>
  );
}

function KbdTable({ rows }: { rows: [string[], string][] }) {
  return (
    <table style={{
      width: "100%", borderCollapse: "collapse",
      margin: "10px 0 18px", fontSize: "12.5px",
      background: "#141B2D", borderRadius: "4px", overflow: "hidden",
    }}>
      <thead>
        <tr>
          <th style={{
            background: "#1C2333", color: "#5E6F8A", fontWeight: 600,
            fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px",
            textAlign: "left", padding: "9px 14px", borderBottom: "1px solid #1F2D45",
          }}>Key</th>
          <th style={{
            background: "#1C2333", color: "#5E6F8A", fontWeight: 600,
            fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px",
            textAlign: "left", padding: "9px 14px", borderBottom: "1px solid #1F2D45",
          }}>Action</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([keys, desc], i) => (
          <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid #1F2D45" : "none" }}>
            <td style={{ padding: "9px 14px", verticalAlign: "middle" }}>
              <div style={{ display: "flex", gap: "4px" }}>
                {keys.map((k, j) => (
                  <span key={j} style={{
                    fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)",
                    background: "#1C2333", border: "1px solid #1F2D45",
                    borderRadius: "3px", padding: "2px 7px",
                    color: "#9BAAC4", fontSize: "11px",
                    display: "inline-block", minWidth: "22px", textAlign: "center",
                  }}>
                    {k}
                  </span>
                ))}
              </div>
            </td>
            <td style={{ padding: "9px 14px", color: "#9BAAC4", lineHeight: 1.6 }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function PriorityTable() {
  const rows: [string, string, string][] = [
    ["P0", "#F87171", "Critical — core flow blocked, direct revenue impact. Act immediately."],
    ["P1", "#FB923C", "High — major functionality broken, no workaround available."],
    ["P2", "#FBBF24", "Medium — partial degradation, a workaround exists."],
    ["P3", "#60A5FA", "Low — minor issue, cosmetic, or edge case."],
    ["Noise", "#3D4F68", "No action needed — bot, extension, test artifact, or known non-issue."],
  ];
  return (
    <table style={{
      width: "100%", borderCollapse: "collapse",
      margin: "10px 0 18px", fontSize: "12.5px",
      background: "#141B2D", borderRadius: "4px", overflow: "hidden",
    }}>
      <thead>
        <tr>
          <th style={{ background: "#1C2333", color: "#5E6F8A", fontWeight: 600, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px", textAlign: "left", padding: "9px 14px", borderBottom: "1px solid #1F2D45" }}>Level</th>
          <th style={{ background: "#1C2333", color: "#5E6F8A", fontWeight: 600, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px", textAlign: "left", padding: "9px 14px", borderBottom: "1px solid #1F2D45" }}>Meaning</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([level, color, desc], i) => (
          <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid #1F2D45" : "none" }}>
            <td style={{ padding: "9px 14px" }}>
              <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)", fontWeight: 700, color, fontSize: "12px" }}>{level}</span>
            </td>
            <td style={{ padding: "9px 14px", color: "#9BAAC4", lineHeight: 1.6 }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LeanTable() {
  const rows: [string, string, string][] = [
    ["jira", "#4ADE80", "Priority P0–P3 + actionable. Sentinel recommends creating a ticket."],
    ["close", "#F87171", "Noise classification. Sentinel recommends closing without action."],
    ["watchlist", "#FBBF24", "P3 or ambiguous. Worth monitoring before committing to a ticket."],
    ["investigate", "#60A5FA", "Insufficient data. Sentinel cannot classify with confidence."],
  ];
  return (
    <table style={{
      width: "100%", borderCollapse: "collapse",
      margin: "10px 0 18px", fontSize: "12.5px",
      background: "#141B2D", borderRadius: "4px", overflow: "hidden",
    }}>
      <thead>
        <tr>
          <th style={{ background: "#1C2333", color: "#5E6F8A", fontWeight: 600, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px", textAlign: "left", padding: "9px 14px", borderBottom: "1px solid #1F2D45" }}>Lean</th>
          <th style={{ background: "#1C2333", color: "#5E6F8A", fontWeight: 600, fontSize: "10.5px", textTransform: "uppercase", letterSpacing: "0.6px", textAlign: "left", padding: "9px 14px", borderBottom: "1px solid #1F2D45" }}>Meaning</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([lean, color, desc], i) => (
          <tr key={i} style={{ borderBottom: i < rows.length - 1 ? "1px solid #1F2D45" : "none" }}>
            <td style={{ padding: "9px 14px" }}>
              <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', monospace)", fontWeight: 600, color, fontSize: "12px" }}>{lean}</span>
            </td>
            <td style={{ padding: "9px 14px", color: "#9BAAC4", lineHeight: 1.6 }}>{desc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function HelpView() {
  const [search, setSearch] = useState("");
  const [activeId, setActiveId] = useState("help-whats-new");
  const contentRef = useRef<HTMLDivElement>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);

  const q = search.trim().toLowerCase();

  // IntersectionObserver for TOC auto-highlight
  useEffect(() => {
    if (!contentRef.current) return;
    const sections = contentRef.current.querySelectorAll<HTMLElement>(".sta-help-section");
    observerRef.current?.disconnect();
    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveId(entry.target.id);
        });
      },
      { root: null, rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    );
    sections.forEach((s) => observerRef.current!.observe(s));
    return () => observerRef.current?.disconnect();
  }, []);

  const sectionVisible = (id: string) => {
    if (!q) return true;
    const el = document.getElementById(id);
    if (!el) return true;
    return el.textContent?.toLowerCase().includes(q) ?? true;
  };

  return (
    <div style={{
      height: "100%", display: "flex", flexDirection: "column",
      background: "#0B0F19", overflow: "hidden",
    }}>
      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "14px 24px", borderBottom: "1px solid #1F2D45",
        flexShrink: 0,
      }}>
        <div>
          <div style={{ fontSize: "16px", fontWeight: 600, color: "#F0F4FF" }}>
            Help &amp; User Guide
          </div>
          <div style={{ fontSize: "11px", color: "#3D4F68", marginTop: "2px" }}>
            Sentinel Triage Assistant — v{APP_VERSION}
          </div>
        </div>
        <input
          type="text"
          placeholder="Filter topics…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            background: "#141B2D", border: "1px solid #1F2D45", borderRadius: "4px",
            padding: "6px 12px", fontSize: "12.5px", color: "#9BAAC4",
            outline: "none", width: "220px",
          }}
        />
      </div>

      {/* Body */}
      <div style={{
        display: "grid", gridTemplateColumns: "240px 1fr",
        gap: "0", flex: 1, minHeight: 0, overflow: "hidden",
      }}>
        {/* TOC Sidebar */}
        <aside style={{
          borderRight: "1px solid #1F2D45",
          overflowY: "auto", padding: "16px 12px",
          background: "#0E1524",
        }}>
          {TOC.map((group) => {
            const visibleLinks = group.links.filter((l) => sectionVisible(l.id));
            if (q && visibleLinks.length === 0) return null;
            return (
              <div key={group.label} style={{ marginBottom: "18px" }}>
                <div style={{
                  fontSize: "9.5px", textTransform: "uppercase", letterSpacing: "1.2px",
                  color: "#3D4F68", fontWeight: 600,
                  padding: "3px 8px 5px", borderBottom: "1px solid #1F2D45",
                  marginBottom: "3px",
                }}>
                  {group.label}
                </div>
                {group.links.map((link) => {
                  const visible = sectionVisible(link.id);
                  if (q && !visible) return null;
                  const isActive = activeId === link.id;
                  return (
                    <a
                      key={link.id}
                      href={`#${link.id}`}
                      onClick={(e) => {
                        e.preventDefault();
                        document.getElementById(link.id)?.scrollIntoView({ behavior: "smooth", block: "start" });
                        setActiveId(link.id);
                      }}
                      style={{
                        display: "block", padding: "5px 10px",
                        fontSize: "12.5px", textDecoration: "none",
                        borderRadius: "3px", margin: "1px 0",
                        color: isActive ? "#F0F4FF" : "#9BAAC4",
                        backgroundColor: isActive ? "#2A3855" : "transparent",
                        borderLeft: isActive ? "2px solid #2DD4BF" : "2px solid transparent",
                        transition: "all 0.1s",
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.backgroundColor = "#1C2333";
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
                      {link.text}
                    </a>
                  );
                })}
              </div>
            );
          })}
        </aside>

        {/* Content */}
        <div ref={contentRef} style={{ overflowY: "auto", padding: "28px 36px" }}>
          <div style={{ maxWidth: "820px" }}>

            {/* ── What's New ── */}
            <section className="sta-help-section" id="help-whats-new" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>What&apos;s new in v0.4</H2>
              <P>
                v0.4 adds the <Strong>Team page</Strong> — a rotation management view where the WHATS&apos;ON Support team can see who is on call this week, plan the weekly schedule, and maintain the team roster. All data is stored locally in SQLite.
              </P>

              <H3>Team page</H3>
              <UL>
                <LI><Strong>This Week</Strong> — a hero section at the top showing who is covering each support role this week at a glance.</LI>
                <LI><Strong>Schedule</Strong> — a table covering 4 past weeks, the current week, and upcoming weeks. Edit any week or assign a new one with the <Strong>+ Assign Week</Strong> button.</LI>
                <LI><Strong>Roles</Strong> — configurable support roles (defaults: Support Developer and Support Engineer). Add or remove roles as your team structure changes. New roles automatically appear as columns in the schedule and as dropdowns in the assignment modal.</LI>
                <LI><Strong>Roster</Strong> — the full list of team members with their default role and a count of weeks on duty. Add or remove people here.</LI>
              </UL>

              <H3>Assignment modal</H3>
              <UL>
                <LI>Role dropdowns show only members whose default role matches — keeping the list short. A <Strong>Show all team members</Strong> link expands to the full roster if you need to assign across roles.</LI>
                <LI>The <Strong>+ Assign Week</Strong> button adds a week picker that lists upcoming unassigned weeks. Row-level <Strong>Edit</Strong> opens the same modal pre-filled for that week.</LI>
                <LI>An optional notes field is available for context (e.g. &quot;covering for sick leave&quot;).</LI>
              </UL>

              <H3>v0.3 highlights</H3>
              <UL>
                <LI><Strong>Scope-aware suppression</Strong> — global (all projects) or tenant (single project) suppression rules.</LI>
                <LI><Strong>Multi-project Sentry support</Strong> — ingest from multiple project slugs; auto-discover all accessible projects.</LI>
                <LI><Strong>Storm detection</Strong> — banner with one-click Suppress all when a fingerprint floods the inbox.</LI>
                <LI><Strong>Bulk triage</Strong> — select multiple issues and apply close/watchlist/investigate in one action.</LI>
              </UL>

              <H3>Earlier highlights</H3>
              <UL>
                <LI><Strong>Triage cockpit</Strong> — Inbox, Watchlist, Decisions log, Suppressed view, and full keyboard control (<Code>j/k</Code> navigate, <Code>1–4</Code> decide, <Code>s</Code> suppress, <Code>u</Code> undo).</LI>
                <LI><Strong>Sentinel AI</Strong> — automatic briefs with priority (P0–Noise), issue type, module, tenant impact, reproduction hint, and confidence score.</LI>
                <LI><Strong>Jira integration</Strong> — one keystroke creates a ticket pre-populated from the Sentinel brief.</LI>
                <LI><Strong>Custom LLM endpoint</Strong> — any OpenAI-compatible URL, or the built-in SDK fallback.</LI>
              </UL>
            </section>

            {/* ── Overview ── */}
            <section className="sta-help-section" id="help-overview" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>What is STA?</H2>
              <P>
                The <Strong>Sentinel Triage Assistant</Strong> is a triage cockpit that connects to Sentry, runs every incoming issue through an AI analyst called <Strong>Sentinel</Strong>, and presents a prioritized inbox where a human responder makes the final call — typically in under 10 seconds per issue.
              </P>
              <Callout title="The problem it solves">
                <p>Sentry queues fill up fast. Most issues are noise, duplicates, or already-tracked bugs. Engineers spend time reading raw stack traces instead of making decisions. STA flips the ratio: Sentinel reads the stack trace and writes the summary — you just decide.</p>
              </Callout>
              <P>The core loop is:</P>
              <Steps items={[
                "Sentry issues are ingested on a schedule (default: every 10 minutes).",
                "Sentinel analyzes each new issue and writes a triage brief: priority, type, impact, reproduction hint.",
                "The brief appears in your Inbox with a routing suggestion (<strong>lean</strong>).",
                "You review the brief and press a key: create Jira ticket, close, investigate, or watchlist.",
                "STA records your decision and removes the issue from the inbox.",
              ]} />
            </section>

            {/* ── Quickstart ── */}
            <section className="sta-help-section" id="help-quickstart" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>5-minute quickstart</H2>
              <Steps items={[
                "Open <strong>Settings</strong> (sidebar) and enter your Sentry auth token and organisation slug. Then add your project slug(s) under <em>Projects</em> — or click <strong>Auto-detect from Sentry</strong>. Use the <em>Test Connection</em> button to verify.",
                "Set your <strong>LLM</strong>. For a custom or self-hosted model, enter the base URL (e.g. <code>http://localhost:11434/v1</code>) and model name. Leave the base URL blank to use the built-in SDK. The default model is <code>gpt-4o</code>.",
                "Optionally configure <strong>Jira</strong>: enter your Jira base URL, email, API token, and project key.",
                "Click <strong>Run Pipeline</strong> in the sidebar (or wait for the automatic poll) to pull your first batch of issues.",
                "Switch to the <strong>Inbox</strong>. Select an issue to read the Sentinel brief. Press <code>1</code> to draft a Jira ticket, <code>2</code> to close, <code>3</code> to investigate, or <code>4</code> to watchlist.",
              ]} />
              <Callout title="No issues showing?">
                <p>Check that the pipeline ran successfully using the PIPELINE status indicator in the sidebar. If it shows CRITICAL or NOT CONFIGURED, revisit Settings. The Inbox only shows issues that have completed Sentinel briefs — briefs generate asynchronously after ingestion, so wait a few seconds after the pipeline finishes.</p>
              </Callout>
            </section>

            {/* ── Inbox ── */}
            <section className="sta-help-section" id="help-inbox" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Inbox</H2>
              <P>
                The Inbox shows all issues that have a Sentinel brief and have not yet received a human decision. Issues are sorted by <Code>lastSeen</Code> descending — the most recently active issues appear first.
              </P>
              <H3>Filtering</H3>
              <UL>
                <LI><Strong>Search</Strong> — press <Code>/</Code> to focus the search bar. Matches against issue title and culprit with a 300 ms debounce.</LI>
                <LI><Strong>Project filter</Strong> — when multiple Sentry projects are configured, a dropdown lets you narrow the list to a single project or switch to <Code>Last 24h — all projects</Code>.</LI>
                <LI><Strong>Lean filter chips</Strong> — click a lean badge (<Code>jira</Code>, <Code>close</Code>, <Code>watchlist</Code>, <Code>investigate</Code>) to show only matching issues. Click again to clear.</LI>
              </UL>
              <H3>Storm detection</H3>
              <P>
                When the same fingerprint appears across a large number of issues, a <Strong>Storm detection</Strong> banner appears above the list. Each storm shows the event count, affected projects, and a <Strong>Suppress all</Strong> button that creates a global suppression rule for that fingerprint. You can dismiss a storm locally (it reappears on next refresh unless suppressed).
              </P>
              <H3>Bulk triage</H3>
              <P>
                Click <Strong>Select</Strong> in the list header to enter selection mode. Check individual issues or use <Strong>Select all</Strong> to check every visible issue. Then apply <Code>close all</Code>, <Code>watchlist all</Code>, or <Code>investigate all</Code> to the entire selection at once. Bulk Jira creation is not available — use single-issue mode (<Code>1</Code>) for tickets.
              </P>
              <H3>Load more</H3>
              <P>The list loads 50 issues at a time. A <Strong>Load more</Strong> button appears at the bottom when additional issues exist. Changing a filter resets to page 1.</P>
              <H3>Suppressed issues</H3>
              <P>Issues whose fingerprint matches an active suppression rule are automatically excluded from the Inbox, even if they have a brief. Manage rules in the Suppressed view.</P>
            </section>

            {/* ── Watchlist ── */}
            <section className="sta-help-section" id="help-watchlist" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Watchlist</H2>
              <P>
                The Watchlist holds issues you pressed <Code>4</Code> on — real issues that aren&apos;t urgent enough to ticket right now but shouldn&apos;t be closed. Return here periodically to decide whether the issue has grown in frequency or impact since you first saw it.
              </P>
              <Callout title="When to use watchlist vs. close">
                <p>Use <strong>watchlist</strong> when you want to see if a pattern repeats or escalates. Use <strong>close</strong> when you&apos;re confident no action is needed now and the issue is self-resolving or already tracked elsewhere.</p>
              </Callout>
              <P>An issue leaves the Watchlist when you make a final decision on it: Jira, close, or investigate. There is no automatic expiry.</P>
            </section>

            {/* ── Decisions ── */}
            <section className="sta-help-section" id="help-decisions" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Decisions</H2>
              <P>
                Every triage action is recorded in the Decisions log with a timestamp, responder ID, the AI lean, and the human decision. This view is your audit trail.
              </P>
              <H3>Disagreements</H3>
              <P>
                Rows where the human decision differs from Sentinel&apos;s lean are highlighted in amber. Toggle the <Strong>Disagreements only</Strong> filter to surface them. This is useful for reviewing where Sentinel is miscalibrated.
              </P>
              <H3>Jira links &amp; suppress info</H3>
              <P>When a Jira ticket was created, the row shows the ticket key (e.g. <Code>ENG-1234</Code>). When a suppress decision was made, the row shows the suppression reason and scope (<Code>global</Code> or <Code>tenant</Code>).</P>
              <H3>Export CSV</H3>
              <P>The <Strong>Export CSV</Strong> button downloads all decisions in the current filter set, RFC 4180 compliant. Useful for post-incident reviews and reporting. The view loads the most recent 200 decisions.</P>
            </section>

            {/* ── Suppressed ── */}
            <section className="sta-help-section" id="help-suppressed" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Suppressed</H2>
              <P>
                The Suppressed view lists all active suppression rules and shows which issues match each rule (<Strong>Matched</Strong> count). Rules suppress issues from the Inbox — they do not delete issues from the database.
              </P>
              <P>Use the <Strong>Delete</Strong> button on a rule to remove it. Matching issues will immediately reappear in the Inbox on next load.</P>
            </section>

            {/* ── Team ── */}
            <section className="sta-help-section" id="help-team" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Team</H2>
              <P>
                The Team page is a rotation planner for the support team. It has four sections: <Strong>This Week</Strong>, <Strong>Schedule</Strong>, <Strong>Roles</Strong>, and <Strong>Roster</Strong>. There are no keyboard shortcuts in this view — it is an admin surface, not a triage surface.
              </P>

              <H3>This Week</H3>
              <P>
                Shows who is assigned to each support role in the current ISO week. If no assignment exists, the card reads &quot;— unassigned —&quot;. Click <Strong>Edit</Strong> next to the week badge to open the assignment modal pre-filled for the current week.
              </P>

              <H3>Schedule</H3>
              <P>
                A table covering 4 past weeks, the current week (highlighted with a teal left border), all future weeks with assignments, and 3 upcoming blank weeks. Each row shows the assignee per role, or &quot;— unassigned —&quot; in italics.
              </P>
              <UL>
                <LI>Click <Strong>Edit</Strong> on a row to update an existing assignment.</LI>
                <LI>Click <Strong>Assign</Strong> on a blank future row (or <Strong>+ Assign Week</Strong> above the table) to open the modal with a week picker.</LI>
              </UL>

              <H3>Assignment modal</H3>
              <P>The modal is shared between editing an existing week and assigning a new one.</P>
              <UL>
                <LI>When assigning a new week, a <Strong>Week</Strong> dropdown at the top lists upcoming unassigned weeks (up to 12), defaulting to the nearest one.</LI>
                <LI>Each role has its own dropdown, pre-filtered to members whose default role matches. Use <Strong>Show all team members ↓</Strong> to see everyone.</LI>
                <LI>Leaving a role dropdown on &quot;— unassigned —&quot; is valid — not every role needs to be filled every week.</LI>
                <LI>An optional <Strong>Notes</Strong> field is available for context (e.g. &quot;covering for sick leave&quot;, &quot;bank holiday week&quot;).</LI>
                <LI>Click <Strong>Save</Strong> to apply. The schedule refreshes immediately.</LI>
              </UL>

              <H3>Roles</H3>
              <P>
                The pill list shows all configured support roles. Default roles on first load are <Strong>Support Developer</Strong> and <Strong>Support Engineer</Strong>.
              </P>
              <UL>
                <LI>Click <Strong>+ Add Role</Strong> to add a new role (e.g. &quot;DevOps On-Call&quot;). It will appear as a new column in the Schedule table and a new dropdown in the assignment modal.</LI>
                <LI>Click <Strong>✕</Strong> on a role pill to remove it. You will be asked to confirm. Roles assigned in the current or a future week cannot be removed — move or clear those assignments first.</LI>
              </UL>

              <H3>Roster</H3>
              <P>
                Lists all team members with their default role and a <Strong>Weeks on duty</Strong> count (distinct weeks they appear in the rota, regardless of role).
              </P>
              <UL>
                <LI>Click <Strong>+ Add Person</Strong> to add a team member. Optionally assign a default role — this pre-populates the assignment modal&apos;s dropdown for that role.</LI>
                <LI>Click <Strong>✕</Strong> to remove a member. You will be asked to confirm. Members assigned in the current or a future week cannot be removed — update the rota first.</LI>
                <LI>Past rota entries are kept for history even after a member or role is removed.</LI>
              </UL>

              <Callout title="Roles drive the assignment modal">
                <p>The roles you configure here become the dropdowns in the assignment modal. If you add a &quot;DevOps On-Call&quot; role, a DevOps dropdown appears automatically. Members assigned that default role will appear in the dropdown first; others are one click away via <strong>Show all team members ↓</strong>.</p>
              </Callout>
            </section>

            {/* ── Settings view ── */}
            <section className="sta-help-section" id="help-settings-view" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Settings</H2>
              <H3>Sentry Connection</H3>
              <UL>
                <LI><Strong>Auth Token</Strong> — your Sentry API token (starts with <Code>sntrys_</Code>). Generate at sentry.io → Settings → Auth Tokens. Needs <Code>project:read</Code> scope.</LI>
                <LI><Strong>Organisation slug</Strong> — the URL slug of your Sentry org (visible in the Sentry URL).</LI>
                <LI><Strong>Projects</Strong> — add one slug per Sentry project to ingest. Use <Strong>Auto-detect from Sentry</Strong> to pull all accessible projects automatically. Test Connection verifies your token against the first configured project.</LI>
              </UL>
              <H3>AI / LLM Runtime</H3>
              <UL>
                <LI><Strong>Base URL</Strong> — leave blank to use the built-in SDK. Set a custom URL to proxy through your own deployment or use a local model (Ollama, LM Studio, etc.).</LI>
                <LI><Strong>API Key</Strong> and <Strong>Model</Strong> — any OpenAI-compatible model ID (e.g. <Code>gpt-4o</Code>, <Code>gpt-4o-mini</Code>, <Code>deepseek-chat</Code>). Default is <Code>gpt-4o</Code>.</LI>
              </UL>
              <H3>Jira</H3>
              <UL>
                <LI>Base URL (e.g. <Code>https://yourorg.atlassian.net</Code>), Atlassian email, API token, and project key. Leave blank to disable Jira; decisions still record but no ticket is created.</LI>
              </UL>
              <H3>Pipeline</H3>
              <UL>
                <LI><Strong>Poll interval</Strong> — how often the background poller runs, in minutes. Minimum 1, maximum 1440 (24 h). Changes take effect on the next tick without restart.</LI>
              </UL>
              <Callout title="Run Pipeline button">
                <p>The <strong>Run Pipeline</strong> button is in the <strong>sidebar</strong> (bottom-left), not in Settings. Click it any time to trigger an immediate ingestion run — useful after first-time configuration.</p>
              </Callout>
            </section>

            {/* ── Triage Flow ── */}
            <section className="sta-help-section" id="help-triage-flow" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>The triage flow</H2>
              <P>The recommended triage flow for each issue:</P>
              <Steps items={[
                "Read the <strong>Summary</strong> in the right panel — one or two sentences on what is broken and who is affected.",
                "Check <strong>Priority</strong> and <strong>Issue Type</strong> assigned by Sentinel.",
                "Read <strong>Reproduction Hint</strong> if you want to understand the root cause hypothesis.",
                "Check <strong>Tenant Impact</strong> and <strong>Signals</strong> for deployment correlation or spike data.",
                "If the <strong>Confidence Notes</strong> field is non-empty, Sentinel flagged data gaps. Consider whether you need to look at Sentry directly.",
                "Make a decision: press <code>1</code> (Jira), <code>2</code> (Close), <code>3</code> (Investigate), <code>4</code> (Watchlist), or <code>s</code> (Suppress).",
              ]} />
              <Callout title="Following the lean">
                <p>Sentinel&apos;s <strong>lean</strong> field is a routing suggestion, not a command. The Inbox default shows all leans together. If you want to process only <code>jira</code>-lean issues first, use the lean filter dropdown. The Decisions log tracks where you agreed or disagreed with Sentinel.</p>
              </Callout>
            </section>

            {/* ── Keyboard ── */}
            <section className="sta-help-section" id="help-keyboard" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Keyboard shortcuts</H2>
              <KbdTable rows={[
                [["j"], "Move focus down in the issue list"],
                [["k"], "Move focus up in the issue list"],
                [["↑", "↓"], "Navigate issue list (arrow keys)"],
                [["Enter"], "Select focused issue (open detail panel)"],
                [["1"], "Draft Jira ticket for selected issue"],
                [["2"], "Close / dismiss selected issue"],
                [["3"], "Mark selected issue as Investigate"],
                [["4"], "Add selected issue to Watchlist"],
                [["s"], "Open suppress modal for selected issue"],
                [["u"], "Undo last decision (restores issue to inbox)"],
                [["/"], "Focus the search bar"],
                [["?"], "Open this keyboard shortcuts reference"],
                [["Esc"], "Close modal / deselect issue"],
              ]} />
              <P>Shortcuts are disabled when a text input is focused. The <Code>?</Code> shortcut opens the keyboard hints panel from anywhere in the cockpit.</P>
            </section>

            {/* ── Undo ── */}
            <section className="sta-help-section" id="help-undo" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Undo &amp; corrections</H2>
              <P>
                Pressing <Code>u</Code> deletes the most recent decision for the currently selected issue, returning it to the Inbox. This works for any decision type — Jira, close, investigate, or watchlist.
              </P>
              <Callout title="Jira tickets are not deleted on undo">
                <p>If you pressed <code>1</code> and a Jira ticket was created, undoing the decision removes the STA decision record but does <strong>not</strong> delete the Jira issue. You&apos;ll need to close or delete it in Jira manually.</p>
              </Callout>
              <P>Undo only affects the last decision for a given issue. There is no multi-level undo stack — if you need to correct an earlier decision, navigate back to that issue (it will appear in the Decisions log) and re-decide.</P>
            </section>

            {/* ── Sentinel AI ── */}
            <section className="sta-help-section" id="help-sentinel" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>What Sentinel does</H2>
              <P>
                <Strong>Sentinel</Strong> is a Senior Incident Triage Analyst persona embedded in the LLM prompt. It is not a general-purpose chatbot — it is narrowly scoped to analyze a single Sentry issue at a time and output a structured triage decision.
              </P>
              <P>
                Sentinel receives: issue title, culprit, event count, release tag, environment, first/last seen timestamps, stack trace, and tags. It outputs a JSON brief with priority, issue type, summary, module, tenant impact, reproduction hint, confidence notes, and signals.
              </P>
              <Callout title="What Sentinel will not do">
                <p>Sentinel will not speculate about cross-issue patterns unless context is explicitly provided. It will not fabricate data that is absent from the input. If the stack trace only shows framework internals, it says so. If environment or release tags are missing, it flags that in <strong>confidenceNotes</strong>.</p>
              </Callout>
              <H3>Anti-aggregation rule</H3>
              <P>Each issue is analyzed independently. Sentinel does not infer systemic trends from a single issue — that&apos;s for the human responder to assess across the Decisions log.</P>
              <H3>Action bias</H3>
              <P>Sentinel defaults to <Strong>Ignore</Strong> unless there is confirmed user-facing impact or meaningful frequency. A ticket requires at least one of: confirmed user-facing impact, meaningful frequency relative to traffic, or a clear regression signal correlated with a deployment.</P>
            </section>

            {/* ── Priority ── */}
            <section className="sta-help-section" id="help-priority" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Priority levels</H2>
              <PriorityTable />
              <H3>Type–priority interaction</H3>
              <UL>
                <LI><Strong>Regression + recent release</Strong> — priority elevated by one level automatically.</LI>
                <LI><Strong>External dependency</Strong> — capped at P2 unless impact is widespread and sustained.</LI>
                <LI><Strong>User error / misuse</Strong> — defaults to Noise or P3 unless frequency suggests a UX problem.</LI>
                <LI><Strong>Infrastructure</Strong> — severity depends on scope: one endpoint = P2, whole service = P0.</LI>
              </UL>
            </section>

            {/* ── Lean ── */}
            <section className="sta-help-section" id="help-lean" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Lean values</H2>
              <LeanTable />
              <P>The lean value is Sentinel&apos;s routing recommendation. It pre-populates the Inbox filter. You can override it with any human decision — the mismatch is recorded in the Decisions log as a disagreement.</P>
            </section>

            {/* ── Confidence ── */}
            <section className="sta-help-section" id="help-confidence" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Confidence score</H2>
              <P>
                The confidence score (0.0–1.0) reflects how much signal Sentinel had to work with, not the severity of the issue. A score of <Code>0.95</Code> on a Noise classification is fine — Sentinel was certain it was noise. A score of <Code>0.52</Code> on a P2 means significant data gaps.
              </P>
              <UL>
                <LI><Strong>0.85–1.0</Strong> — High confidence. Stack trace, release tag, and event count are available and consistent.</LI>
                <LI><Strong>0.65–0.84</Strong> — Moderate confidence. Some data is missing but the classification is defensible.</LI>
                <LI><Strong>Below 0.65</Strong> — Low confidence. Check <Code>confidenceNotes</Code> for what Sentinel couldn&apos;t determine. Consider opening the raw Sentry issue before deciding.</LI>
              </UL>
              <P>Low confidence does not change the recommended action — Sentinel still commits to a recommendation. Uncertainty is separated into <Code>confidenceNotes</Code>, not used to weaken the recommendation.</P>
            </section>

            {/* ── Jira ── */}
            <section className="sta-help-section" id="help-jira" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Jira integration</H2>
              <H3>Setup</H3>
              <Steps items={[
                "In Jira, go to <strong>Account Settings → Security → API tokens</strong> and create a token.",
                "In STA Settings, enter: Jira base URL (e.g. <code>https://yourorg.atlassian.net</code>), your Jira email, the API token, and the target project key (e.g. <code>ENG</code>).",
                "Save. No restart required.",
              ]} />
              <H3>Creating a ticket</H3>
              <P>Press <Code>1</Code> on any issue in the Inbox. The Jira modal opens pre-populated with:</P>
              <UL>
                <LI><Strong>Summary</Strong> — the issue title (editable)</LI>
                <LI><Strong>Description</Strong> — Sentinel&apos;s brief: summary, reproduction hint, tenant impact, signals</LI>
                <LI><Strong>Priority</Strong> — mapped from Sentinel&apos;s P0–P3 to Jira priority names</LI>
                <LI><Strong>Component</Strong> — the affected module from the brief</LI>
              </UL>
              <P>Edit any field before submitting. The ticket key (e.g. <Code>ENG-1234</Code>) is saved in the decision record.</P>
              <Callout title="Jira not configured">
                <p>If Jira credentials are not set, pressing <code>1</code> still records the decision as <code>jira</code> but no ticket is created. The Decisions log will show the decision without a Jira key. Configure Jira in Settings and re-triage if needed.</p>
              </Callout>
            </section>

            {/* ── Sentry ── */}
            <section className="sta-help-section" id="help-sentry" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Sentry connection</H2>
              <P>STA ingests from Sentry using the <Strong>Issues API</Strong>. The token must have the <Code>project:read</Code> scope to access issue data and project metadata.</P>
              <P>Use the <Strong>Test Connection</Strong> button in Settings to verify your token against the first configured project. A 403 response means the token lacks the required scope.</P>
              <H3>What gets ingested</H3>
              <P>STA pulls unresolved issues updated since the last successful run. On the <Strong>first run</Strong> (cold start), STA looks back <Strong>7 days</Strong> to populate the inbox. Issues are deduplicated by Sentry issue ID — re-ingesting will not create duplicates.</P>
              <H3>Rate limits</H3>
              <P>Sentry&apos;s API is rate-limited. If you ingest large projects at high poll frequency, you may hit limits. The pipeline logs 429 errors to the server console. Increase the poll interval if this occurs.</P>
            </section>

            {/* ── Suppress how ── */}
            <section className="sta-help-section" id="help-suppress-how" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>How suppression works</H2>
              <P>
                A suppression rule targets a <Strong>fingerprint</Strong> — the identifier Sentry assigns to a group of identical issues. When a rule exists for a fingerprint, all matching issues are excluded from the Inbox.
              </P>
              <P>To suppress an issue, press <Code>s</Code> in the Inbox. The suppress modal lets you add a reason and choose the scope.</P>
              <Callout title="Retroactive suppression">
                <p>Suppression is applied at query time, not at ingestion time. Adding a rule instantly hides all existing issues with that fingerprint from the Inbox — including issues that were already there before the rule was created. Removing the rule instantly un-hides them.</p>
              </Callout>
            </section>

            {/* ── Suppress scope ── */}
            <section className="sta-help-section" id="help-suppress-scope" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Global vs tenant scope</H2>
              <UL>
                <LI><Strong>Global</Strong> — suppresses the fingerprint across all projects and tenants. Use for known-non-actionable issues (browser extensions, bot traffic, ad SDKs).</LI>
                <LI><Strong>Tenant</Strong> — suppresses the fingerprint only for a specific project ID (tenant). Use when a particular client generates noise that is not representative of the wider user base.</LI>
              </UL>
              <P>Global rules take precedence. If a global rule exists for a fingerprint, tenant rules for the same fingerprint have no additional effect.</P>
            </section>

            {/* ── Pipeline ── */}
            <section className="sta-help-section" id="help-pipeline" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Ingestion pipeline</H2>
              <P>The pipeline runs in two phases:</P>
              <UL>
                <LI><Strong>Ingest</Strong> — fetches unresolved issues from Sentry, creates or updates database records, returns immediately.</LI>
                <LI><Strong>Brief generation</Strong> — runs asynchronously after ingest. For each new issue without a brief, sends the issue data to the LLM and saves the result. This phase does not block the HTTP response.</LI>
              </UL>
              <H3>Background poller</H3>
              <P>
                The poller starts automatically when the Next.js server boots (via <Code>instrumentation.ts</Code>). It reads the poll interval from Settings before each tick, so changing the interval takes effect on the next run without restarting the server.
              </P>
              <H3>Pipeline status</H3>
              <P>The sidebar shows the pipeline status based on how long ago the last successful pull occurred:</P>
              <UL>
                <LI><span style={{ color: "#4ADE80", fontWeight: 600 }}>OPERATIONAL</span> — last pull within 20 minutes</LI>
                <LI><span style={{ color: "#F59E0B", fontWeight: 600 }}>STALE</span> — last pull 20–60 minutes ago</LI>
                <LI><span style={{ color: "#F87171", fontWeight: 600 }}>CRITICAL</span> — last pull over 60 minutes ago</LI>
                <LI><span style={{ color: "#F87171", fontWeight: 600 }}>NOT CONFIGURED</span> — Sentry credentials not set</LI>
                <LI><span style={{ color: "#F59E0B", fontWeight: 600 }}>WAITING</span> — pipeline has never run</LI>
              </UL>
            </section>

            {/* ── LLM Config ── */}
            <section className="sta-help-section" id="help-llm-config" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>LLM configuration</H2>
              <P>STA supports any OpenAI-compatible chat completions endpoint. The default model is <Code>gpt-4o</Code>.</P>
              <H3>Built-in SDK (no base URL)</H3>
              <P>Leave <Strong>LLM Base URL</Strong> blank to use the built-in <Code>z-ai-web-dev-sdk</Code> client, which reads credentials from the local <Code>.z-ai-config</Code> file. Set the model name to any model supported by the SDK (default: <Code>gpt-4o</Code>).</P>
              <H3>Custom endpoint</H3>
              <P>Set <Strong>LLM Base URL</Strong> to any OpenAI-compatible URL, e.g. <Code>http://localhost:11434/v1</Code> for Ollama or <Code>http://localhost:1234/v1</Code> for LM Studio. Also set the <Strong>API Key</Strong> and <Strong>Model</Strong> to match your deployment.</P>
              <Callout title="Model quality matters">
                <p>Sentinel&apos;s prompt is designed for a frontier model (GPT-4o, Claude 3.5+, Gemini 1.5 Pro). Smaller local models may produce valid JSON but lower-quality classifications. Test with a few known issues before relying on a local model in production.</p>
              </Callout>
            </section>

            {/* ── Poll Interval ── */}
            <section className="sta-help-section" id="help-poll-interval" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Poll interval</H2>
              <P>
                The poll interval controls how often the background poller runs the ingestion pipeline. The default is <Strong>10 minutes</Strong>. The minimum is 1 minute and the maximum is 1440 minutes (24 hours).
              </P>
              <P>Changes to the poll interval take effect on the next scheduled tick — no server restart required. The poller re-reads the setting from the database before each sleep cycle.</P>
              <Callout title="High-volume projects">
                <p>If your Sentry project produces hundreds of issues per hour, a shorter poll interval means briefs stay fresher but you&apos;ll consume more LLM tokens. Consider using a cheaper or local model for high-volume triage and reserving the frontier model for low-confidence issues.</p>
              </Callout>
            </section>

            {/* ── Troubleshooting ── */}
            <section className="sta-help-section" id="help-troubleshooting" style={{ marginBottom: "48px", scrollMarginTop: "20px" }}>
              <H2>Troubleshooting</H2>

              <H3>Inbox is empty after running the pipeline</H3>
              <UL>
                <LI>Check the pipeline status in the sidebar. If it shows CRITICAL or NOT CONFIGURED, the pipeline did not run successfully.</LI>
                <LI>Briefs generate asynchronously — wait 10–30 seconds after the pipeline run, then refresh the Inbox.</LI>
                <LI>If all issues already have decisions, they will not appear in the Inbox. Check the Decisions log.</LI>
                <LI>A suppression rule may be hiding issues. Check the Suppressed view.</LI>
              </UL>

              <H3>Pipeline status shows NOT CONFIGURED</H3>
              <UL>
                <LI>Open Settings and verify your auth token, org slug, and at least one project slug are all filled in.</LI>
                <LI>Click <em>Test Connection</em> to check token validity. A 403 response means the token lacks <Code>project:read</Code> scope.</LI>
              </UL>

              <H3>Briefs show &quot;Failed to parse LLM response&quot;</H3>
              <UL>
                <LI>The LLM returned a response that could not be parsed as JSON. Check the raw response in the issue detail panel.</LI>
                <LI>Some models wrap JSON in markdown code blocks (<Code>```json</Code>). STA handles this — if it still fails, the model returned something unexpected.</LI>
                <LI>Regenerate the brief by deleting it from the database and re-running the pipeline, or switch to a more reliable model.</LI>
              </UL>

              <H3>Jira ticket creation fails</H3>
              <UL>
                <LI>Check that the Jira base URL does not have a trailing slash.</LI>
                <LI>Verify the project key is correct (case-sensitive).</LI>
                <LI>Ensure the API token belongs to an account with <Code>Create Issue</Code> permission in the target project.</LI>
                <LI>Check the server logs for the full error message from the Jira API.</LI>
              </UL>

              <H3>Search is slow or not filtering</H3>
              <UL>
                <LI>Search has a 300 ms debounce — wait briefly after typing.</LI>
                <LI>Search matches title and culprit only. It does not search the Sentinel brief text.</LI>
              </UL>
            </section>

            {/* ── FAQ ── */}
            <section className="sta-help-section" id="help-faq" style={{ marginBottom: "0", scrollMarginTop: "20px" }}>
              <H2>FAQ</H2>

              <H3>Does STA modify issues in Sentry?</H3>
              <P>No. STA only reads from Sentry. It does not resolve, assign, or comment on issues in Sentry.</P>

              <H3>What happens if the same issue is ingested twice?</H3>
              <P>Issues are deduplicated by Sentry issue ID. The second ingest updates the event count, last seen date, and tags. It does not create a new brief unless the existing brief was deleted.</P>

              <H3>Can I use STA without Jira?</H3>
              <P>Yes. Leave the Jira settings blank. The <Code>1</Code> key will still record a <Code>jira</Code> decision but no ticket will be created. You can use this as a &quot;flag for ticket&quot; marker and create tickets manually.</P>

              <H3>How does Sentinel handle brief generation failures?</H3>
              <P>If the LLM API call fails or returns unparseable JSON, STA saves a brief with <Code>parseError: true</Code> and stores the raw response. The issue still appears in the Inbox with a warning indicator so you can decide on it manually.</P>

              <H3>Can I change the Sentinel prompt?</H3>
              <P>The prompt lives in <Code>src/lib/brief.ts</Code>. You can edit <Code>SENTINEL_SYSTEM_PROMPT</Code> and the <Code>FEW_SHOT</Code> examples directly. Update the <Code>promptVersion</Code> string in <Code>db.brief.create</Code> so you can distinguish briefs generated before and after your changes.</P>

              <H3>Is conversation history sent to the LLM?</H3>
              <P>No. Each brief is generated in an independent, stateless call: system prompt + few-shot examples + the single issue. No user conversation history or other issues are included.</P>

              <H3>Where is data stored?</H3>
              <P>STA uses SQLite via Prisma, stored at <Code>db/custom.db</Code> in the project root. Back up this file to preserve your decisions and settings.</P>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
}
