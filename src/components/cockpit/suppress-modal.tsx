"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCockpitStore } from "@/lib/store";
import type { Issue } from "@/lib/types";

export function SuppressModal() {
  const { suppressModalOpen, suppressModalIssueId, closeSuppressModal } = useCockpitStore();
  const queryClient = useQueryClient();

  const [reason, setReason] = useState("");
  const [scope, setScope] = useState<"global" | "tenant">("global");

  const { data: issue } = useQuery<Issue, Error>({
    queryKey: ["issue", suppressModalIssueId],
    queryFn: () => fetch(`/api/issues/${suppressModalIssueId}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    enabled: !!suppressModalIssueId && suppressModalOpen,
  });

  useEffect(() => {
    if (!suppressModalOpen) {
      setReason("");
      setScope("global");
    }
  }, [suppressModalOpen]);

  const suppressMutation = useMutation({
    mutationFn: async () => {
      const r1 = await fetch("/api/suppressions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fingerprint: issue?.fingerprint,
          reason,
          scope,
          tenantValue: scope === "tenant" ? (issue?.project ?? null) : null,
        }),
      });
      if (!r1.ok) throw new Error(`Suppression failed: HTTP ${r1.status}`);

      const r2 = await fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: suppressModalIssueId,
          decision: "close",
          metadata: { suppressReason: reason, suppressScope: scope },
        }),
      });
      if (!r2.ok) throw new Error(`Decision failed: HTTP ${r2.status}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", suppressModalIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["suppressions"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
      setReason("");
      setScope("global");
      closeSuppressModal();
    },
  });

  return (
    <DialogPrimitive.Root open={suppressModalOpen} onOpenChange={(open) => !open && closeSuppressModal()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sta-modal-overlay" />
        <DialogPrimitive.Content
          aria-describedby="suppress-modal-desc"
          style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(480px, calc(100vw - 2rem))",
            zIndex: 51,
          }}
        >
          <div className="sta-modal">
            <div className="sta-modal-header" style={{ color: "#F87171", borderColor: "#5c2528" }}>
              <DialogPrimitive.Title style={{ margin: 0, font: "inherit", display: "inline" }}>
                Suppress Fingerprint
              </DialogPrimitive.Title>
            </div>

            <DialogPrimitive.Description asChild>
            <div id="suppress-modal-desc" className="sta-modal-body">
              {issue?.fingerprint && (
                <div>
                  <label className="sta-label">Fingerprint</label>
                  <div style={{
                    fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#2DD4BF",
                    background: "#0B0F19", border: "1px solid #1C2333",
                    borderRadius: "2px", padding: "7px 10px", wordBreak: "break-all",
                  }}>
                    {issue.fingerprint}
                  </div>
                </div>
              )}

              <div>
                <label className="sta-label">Reason</label>
                <input
                  className="sta-input"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why is this being suppressed?"
                  autoFocus
                />
              </div>

              <div>
                <label className="sta-label">Scope</label>
                <select
                  className="sta-select"
                  value={scope}
                  onChange={(e) => setScope(e.target.value as "global" | "tenant")}
                >
                  <option value="global">Global</option>
                  <option value="tenant">Per-tenant</option>
                </select>
              </div>
            </div>
            </DialogPrimitive.Description>

            <div className="sta-modal-footer">
              <button
                className="sta-btn"
                onClick={closeSuppressModal}
                disabled={suppressMutation.isPending}
              >
                Cancel
              </button>
              <button
                className="sta-btn danger"
                onClick={() => suppressMutation.mutate()}
                disabled={suppressMutation.isPending || !reason}
                style={{
                  color: "#F87171", borderColor: "#7A1515",
                  background: "rgba(248,113,113,0.06)",
                }}
              >
                {suppressMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                Suppress
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
