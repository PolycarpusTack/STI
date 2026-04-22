"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Inbox,
  Eye,
  FileText,
  Ban,
  Database,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCockpitStore, type ViewType } from "@/lib/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { toast } from "sonner";

// ─── Nav Item Component (uses hook properly at component level) ─────────────

function SidebarNavItem({
  view,
  label,
  icon: Icon,
  isActive,
  expanded,
  onClick,
}: {
  view: ViewType;
  label: string;
  icon: React.ElementType;
  isActive: boolean;
  expanded: boolean;
  onClick: () => void;
}) {
  let countQueryFn: () => Promise<number>;

  if (view === "decisions") {
    countQueryFn = async () => {
      const res = await fetch("/api/decisions?limit=1");
      if (!res.ok) return 0;
      const json = await res.json();
      return json.total ?? 0;
    };
  } else if (view === "suppressed") {
    countQueryFn = async () => {
      const res = await fetch("/api/suppressions");
      const json = await res.json();
      return Array.isArray(json) ? json.length : 0;
    };
  } else {
    countQueryFn = async () => {
      const res = await fetch(`/api/issues?view=${view}&limit=1`);
      const json = await res.json();
      return json.total ?? 0;
    };
  }

  const { data: count } = useQuery<number, Error>({
    queryKey: ["nav-count", view],
    queryFn: countQueryFn,
    staleTime: 30_000,
  });

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className={cn(
            "flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors w-full",
            isActive
              ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
              : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
          )}
        >
          <Icon className="size-4 shrink-0" />
          {expanded && (
            <>
              <span className="truncate">{label}</span>
              <Badge
                variant="secondary"
                className="ml-auto font-mono text-[10px] h-4 px-1 min-w-[1.25rem] justify-center"
              >
                {count ?? 0}
              </Badge>
            </>
          )}
        </button>
      </TooltipTrigger>
      {!expanded && (
        <TooltipContent side="right" className="flex items-center gap-2">
          {label}
          <Badge variant="secondary" className="font-mono text-[10px] h-4 px-1">
            {count ?? 0}
          </Badge>
        </TooltipContent>
      )}
    </Tooltip>
  );
}

// ─── Sidebar Component ──────────────────────────────────────────────────────

export function Sidebar() {
  const {
    currentView,
    sidebarExpanded,
    setCurrentView,
    toggleSidebar,
    selectedIssueId,
  } = useCockpitStore();
  const queryClient = useQueryClient();

  const seedMutation = useMutation({
    mutationFn: () => fetch("/api/seed", { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Seed data generated successfully");
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
    },
    onError: () => {
      toast.error("Failed to generate seed data");
    },
  });

  const briefMutation = useMutation({
    mutationFn: (id: string) =>
      fetch(`/api/brief/${id}`, { method: "POST" }).then((r) => r.json()),
    onSuccess: () => {
      toast.success("Brief generated");
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["issue", selectedIssueId] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
    },
    onError: () => {
      toast.error("Failed to generate brief");
    },
  });

  return (
    <TooltipProvider delayDuration={300}>
      <aside
        className={cn(
          "flex flex-col border-r bg-sidebar text-sidebar-foreground shrink-0 transition-all duration-200",
          sidebarExpanded ? "w-48" : "w-14"
        )}
      >
        {/* Navigation items */}
        <nav className="flex flex-col gap-1 p-2 flex-1">
          <SidebarNavItem
            view="inbox"
            label="Inbox"
            icon={Inbox}
            isActive={currentView === "inbox"}
            expanded={sidebarExpanded}
            onClick={() => setCurrentView("inbox")}
          />
          <SidebarNavItem
            view="watchlist"
            label="Watchlist"
            icon={Eye}
            isActive={currentView === "watchlist"}
            expanded={sidebarExpanded}
            onClick={() => setCurrentView("watchlist")}
          />
          <SidebarNavItem
            view="decisions"
            label="Decisions"
            icon={FileText}
            isActive={currentView === "decisions"}
            expanded={sidebarExpanded}
            onClick={() => setCurrentView("decisions")}
          />
          <SidebarNavItem
            view="suppressed"
            label="Suppressed"
            icon={Ban}
            isActive={currentView === "suppressed"}
            expanded={sidebarExpanded}
            onClick={() => setCurrentView("suppressed")}
          />
        </nav>

        <Separator />

        {/* Bottom actions */}
        <div className="flex flex-col gap-1 p-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start gap-2",
                  !sidebarExpanded && "justify-center px-2"
                )}
                onClick={() => seedMutation.mutate()}
                disabled={seedMutation.isPending}
              >
                <Database className="size-4 shrink-0" />
                {sidebarExpanded && (
                  <span className="truncate">Seed Data</span>
                )}
              </Button>
            </TooltipTrigger>
            {!sidebarExpanded && (
              <TooltipContent side="right">Seed Data</TooltipContent>
            )}
          </Tooltip>

          {selectedIssueId && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "w-full justify-start gap-2",
                    !sidebarExpanded && "justify-center px-2"
                  )}
                  onClick={() => briefMutation.mutate(selectedIssueId)}
                  disabled={briefMutation.isPending}
                >
                  <Sparkles className="size-4 shrink-0" />
                  {sidebarExpanded && (
                    <span className="truncate">Generate Brief</span>
                  )}
                </Button>
              </TooltipTrigger>
              {!sidebarExpanded && (
                <TooltipContent side="right">Generate Brief</TooltipContent>
              )}
            </Tooltip>
          )}

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  "w-full justify-start gap-2",
                  !sidebarExpanded && "justify-center px-2"
                )}
                onClick={toggleSidebar}
              >
                {sidebarExpanded ? (
                  <PanelLeftClose className="size-4 shrink-0" />
                ) : (
                  <PanelLeft className="size-4 shrink-0" />
                )}
                {sidebarExpanded && <span className="truncate">Collapse</span>}
              </Button>
            </TooltipTrigger>
            {!sidebarExpanded && (
              <TooltipContent side="right">
                {sidebarExpanded ? "Collapse" : "Expand"}
              </TooltipContent>
            )}
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
