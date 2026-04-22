"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, ShieldOff } from "lucide-react";
import { useCockpitStore } from "@/lib/store";
import type { Issue } from "./issue-list";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function SuppressModal() {
  const { suppressModalOpen, suppressModalIssueId, closeSuppressModal } =
    useCockpitStore();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"global" | "tenant">("global");

  const { data: issue } = useQuery<Issue, Error>({
    queryKey: ["issue", suppressModalIssueId],
    queryFn: () =>
      fetch(`/api/issues/${suppressModalIssueId}`).then((r) => r.json()),
    enabled: !!suppressModalIssueId && suppressModalOpen,
  });

  const suppressMutation = useMutation({
    mutationFn: async () => {
      // Create suppression
      await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: issue?.fingerprint,
          reason,
          scope,
        }),
      });

      // Record decision as close
      await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: suppressModalIssueId,
          decision: "close",
          metadata: { suppressReason: reason, suppressScope: scope },
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", suppressModalIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setReason("");
      setScope("global");
      closeSuppressModal();
    },
    onError: () => {
      // keep modal open on error
    },
  });

  return (
    <AlertDialog open={suppressModalOpen} onOpenChange={(open) => !open && closeSuppressModal()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <ShieldOff className="size-5 text-destructive" />
            Suppress Issue
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-4 text-left">
              {issue?.fingerprint && (
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">
                    Fingerprint
                  </span>
                  <p className="text-xs font-mono bg-muted/50 rounded p-2 break-all">
                    {issue.fingerprint}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="suppress-reason">Reason</Label>
                <Input
                  id="suppress-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being suppressed?"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="suppress-scope">Scope</Label>
                <Select
                  value={scope}
                  onValueChange={(val) => setScope(val as "global" | "tenant")}
                >
                  <SelectTrigger id="suppress-scope" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="global">Global</SelectItem>
                    <SelectItem value="tenant">Per-tenant</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter>
          <AlertDialogCancel disabled={suppressMutation.isPending}>
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              suppressMutation.mutate();
            }}
            disabled={suppressMutation.isPending || !reason}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {suppressMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Suppress
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
