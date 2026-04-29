"use client";

import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { QueryProvider } from "@/providers/query-provider";
import { useCockpitStore } from "@/lib/store";
import type { Metrics } from "@/lib/types";
import { TopBar } from "@/components/cockpit/top-bar";
import { Sidebar } from "@/components/cockpit/sidebar";
import { IssueList } from "@/components/cockpit/issue-list";
import { IssueDetail } from "@/components/cockpit/issue-detail";
import { JiraModal } from "@/components/cockpit/jira-modal";
import { SuppressModal } from "@/components/cockpit/suppress-modal";
import { DecisionsView } from "@/components/cockpit/decisions-view";
import { SuppressedView } from "@/components/cockpit/suppressed-view";
import { SettingsView } from "@/components/cockpit/settings-view";
import { HelpView } from "@/components/cockpit/help-view";
import { TeamView } from "@/components/cockpit/team-view";
import { KeyboardHints } from "@/components/cockpit/keyboard-hints";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function StatusBar() {
  const { data: metrics } = useQuery<Metrics, Error>({
    queryKey: ["metrics"],
    queryFn: () => fetch("/api/metrics").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    staleTime: 30_000,
  });
  const modelName = metrics?.llmModel ?? "gpt-4o";

  return (
    <div style={{
      background: "#111827", borderTop: "1px solid #1F2D45",
      display: "flex", alignItems: "center",
      padding: "0 14px", gap: "18px", height: "26px",
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
      fontSize: "10px", color: "#5E6F8A", letterSpacing: "0.04em",
      flexShrink: 0,
    }}>
      <span><span style={{ color: "#4ADE80" }}>●</span> Connected</span>
      <span style={{ color: "#2E3F5C" }}>│</span>
      <span>STA <span style={{ color: "#9BAAC4" }}>v0.4</span></span>
      <span style={{ color: "#2E3F5C" }}>│</span>
      <span>Prompt <span style={{ color: "#9BAAC4" }}>v1.0.0-sentinel</span></span>
      <span style={{ color: "#2E3F5C" }}>│</span>
      <span>LLM <span style={{ color: "#9BAAC4" }}>{modelName}</span></span>
      <div style={{ marginLeft: "auto" }}>
        <Kbd>j</Kbd><Kbd>k</Kbd> nav
        <span style={{ color: "#2E3F5C", margin: "0 8px" }}>│</span>
        <Kbd>1</Kbd> jira <Kbd>2</Kbd> close <Kbd>3</Kbd> investigate <Kbd>4</Kbd> watchlist
        <span style={{ color: "#2E3F5C", margin: "0 8px" }}>│</span>
        <Kbd>s</Kbd> suppress <Kbd>u</Kbd> undo <Kbd>/</Kbd> search <Kbd>?</Kbd> help
      </div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)",
      background: "#1C2333", border: "1px solid #1F2D45",
      padding: "0 4px", borderRadius: "3px",
      color: "#9BAAC4", fontSize: "10px", margin: "0 1px",
    }}>
      {children}
    </span>
  );
}

function CockpitContent() {
  const { currentView, setKeyboardHintsOpen, selectIssue } = useCockpitStore();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) return;
      if (e.key === "?") { e.preventDefault(); setKeyboardHintsOpen(true); }
      if (e.key === "Escape") {
        const state = useCockpitStore.getState();
        if (!state.jiraModalOpen && !state.suppressModalOpen && !state.keyboardHintsOpen) {
          selectIssue(null);
        }
        setKeyboardHintsOpen(false);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setKeyboardHintsOpen, selectIssue]);

  const isTwoPane = currentView === "inbox" || currentView === "watchlist";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh", overflow: "hidden", background: "#0B0F19" }}>
      <TopBar />

      <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
        <Sidebar />

        {isTwoPane && (
          <ResizablePanelGroup direction="horizontal" style={{ flex: 1 }}>
            <ResizablePanel defaultSize={35} minSize={22} maxSize={50}>
              <div style={{ height: "100%", overflow: "hidden", borderRight: "1px solid #1F2D45" }}>
                <IssueList />
              </div>
            </ResizablePanel>
            <ResizableHandle style={{ width: "4px", background: "#1C2333" }} />
            <ResizablePanel defaultSize={65} minSize={40}>
              <div style={{ height: "100%", overflow: "hidden" }}>
                <IssueDetail />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {currentView === "decisions" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <DecisionsView />
          </div>
        )}

        {currentView === "suppressed" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <SuppressedView />
          </div>
        )}

        {currentView === "team" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <TeamView />
          </div>
        )}

        {currentView === "settings" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <SettingsView />
          </div>
        )}

        {currentView === "help" && (
          <div style={{ flex: 1, overflow: "hidden" }}>
            <HelpView />
          </div>
        )}
      </div>

      <StatusBar />

      <JiraModal />
      <SuppressModal />
      <KeyboardHints />
    </div>
  );
}

export default function Home() {
  return (
    <QueryProvider>
      <CockpitContent />
    </QueryProvider>
  );
}
