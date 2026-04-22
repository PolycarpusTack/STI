"use client";

import { useEffect } from "react";
import { QueryProvider } from "@/providers/query-provider";
import { useCockpitStore } from "@/lib/store";
import { TopBar } from "@/components/cockpit/top-bar";
import { Sidebar } from "@/components/cockpit/sidebar";
import { IssueList } from "@/components/cockpit/issue-list";
import { IssueDetail } from "@/components/cockpit/issue-detail";
import { JiraModal } from "@/components/cockpit/jira-modal";
import { SuppressModal } from "@/components/cockpit/suppress-modal";
import { DecisionsView } from "@/components/cockpit/decisions-view";
import { SuppressedView } from "@/components/cockpit/suppressed-view";
import { WatchlistView } from "@/components/cockpit/watchlist-view";
import { KeyboardHints } from "@/components/cockpit/keyboard-hints";
import {
  ResizablePanelGroup,
  ResizablePanel,
  ResizableHandle,
} from "@/components/ui/resizable";

function CockpitContent() {
  const {
    currentView,
    setKeyboardHintsOpen,
    selectIssue,
  } = useCockpitStore();

  // Global keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Ignore if typing in an input/textarea
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      ) {
        return;
      }

      if (e.key === "?") {
        e.preventDefault();
        setKeyboardHintsOpen(true);
      }

      if (e.key === "Escape") {
        selectIssue(null);
        setKeyboardHintsOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setKeyboardHintsOpen, selectIssue]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-background">
      {/* Top metrics bar */}
      <TopBar />

      {/* Main content area */}
      <div className="flex flex-1 min-h-0">
        {/* Sidebar */}
        <Sidebar />

        {/* Content based on current view */}
        {currentView === "inbox" && (
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
              <div className="h-full overflow-hidden border-r">
                <IssueList />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70} minSize={35}>
              <div className="h-full overflow-hidden">
                <IssueDetail />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {currentView === "watchlist" && (
          <ResizablePanelGroup direction="horizontal" className="flex-1">
            <ResizablePanel defaultSize={30} minSize={20} maxSize={45}>
              <div className="h-full overflow-hidden border-r">
                <IssueList />
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
            <ResizablePanel defaultSize={70} minSize={35}>
              <div className="h-full overflow-hidden">
                <IssueDetail />
              </div>
            </ResizablePanel>
          </ResizablePanelGroup>
        )}

        {currentView === "decisions" && (
          <div className="flex-1 overflow-hidden">
            <DecisionsView />
          </div>
        )}

        {currentView === "suppressed" && (
          <div className="flex-1 overflow-hidden">
            <SuppressedView />
          </div>
        )}
      </div>

      {/* Global modals */}
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
