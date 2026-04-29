"use client";

import { create } from "zustand";

export type ViewType = "inbox" | "watchlist" | "decisions" | "suppressed" | "team" | "settings" | "help";

interface Filters {
  lean: string | null;
  search: string;
  level: string | null;
  project: string | null;
  since24h: boolean;
}

interface CockpitState {
  currentView: ViewType;
  selectedIssueId: string | null;
  filters: Filters;
  jiraModalOpen: boolean;
  jiraModalIssueId: string | null;
  suppressModalOpen: boolean;
  suppressModalIssueId: string | null;
  focusedIndex: number;
  keyboardHintsOpen: boolean;

  // Actions
  setCurrentView: (view: ViewType) => void;
  selectIssue: (id: string | null) => void;
  setFilters: (filters: Partial<Filters>) => void;
  resetFilters: () => void;
  openJiraModal: (issueId: string) => void;
  closeJiraModal: () => void;
  openSuppressModal: (issueId: string) => void;
  closeSuppressModal: () => void;
  setFocusedIndex: (index: number) => void;
  setKeyboardHintsOpen: (open: boolean) => void;
}

const initialFilters: Filters = {
  lean: null,
  search: "",
  level: null,
  project: null,
  since24h: false,
};

export const useCockpitStore = create<CockpitState>((set) => ({
  currentView: "inbox",
  selectedIssueId: null,
  filters: { ...initialFilters },
  jiraModalOpen: false,
  jiraModalIssueId: null,
  suppressModalOpen: false,
  suppressModalIssueId: null,
  focusedIndex: 0,
  keyboardHintsOpen: false,

  setCurrentView: (view) =>
    set({
      currentView: view,
      selectedIssueId: null,
      focusedIndex: 0,
      filters: { ...initialFilters },
      jiraModalOpen: false,
      suppressModalOpen: false,
      jiraModalIssueId: null,
      suppressModalIssueId: null,
    }),

  selectIssue: (id) =>
    set({ selectedIssueId: id }),

  setFilters: (partial) =>
    set((state) => ({
      filters: { ...state.filters, ...partial },
      focusedIndex: 0,
    })),

  resetFilters: () =>
    set({ filters: { ...initialFilters }, focusedIndex: 0 }),

  openJiraModal: (issueId) =>
    set({ jiraModalOpen: true, jiraModalIssueId: issueId }),

  closeJiraModal: () =>
    set({ jiraModalOpen: false, jiraModalIssueId: null }),

  openSuppressModal: (issueId) =>
    set({ suppressModalOpen: true, suppressModalIssueId: issueId }),

  closeSuppressModal: () =>
    set({ suppressModalOpen: false, suppressModalIssueId: null }),

  setFocusedIndex: (index) => set({ focusedIndex: index }),

  setKeyboardHintsOpen: (open) => set({ keyboardHintsOpen: open }),
}));
