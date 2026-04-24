"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { useCockpitStore } from "@/lib/store";
import { useToast } from "@/hooks/use-toast";
import type { Issue } from "./issue-list";

function buildDescription(issue: Issue): string {
  const parts: string[] = [];

  parts.push(`h2. Summary`);
  parts.push("");
  parts.push(issue.brief?.summary || issue.title);
  parts.push("");

  if (issue.brief?.module) {
    parts.push(`h2. Module`);
    parts.push("");
    parts.push(issue.brief.module);
    parts.push("");
  }

  if (issue.brief?.tenantImpact) {
    parts.push(`h2. Tenant Impact`);
    parts.push("");
    parts.push(issue.brief.tenantImpact);
    parts.push("");
  }

  if (issue.brief?.reproductionHint) {
    parts.push(`h2. Reproduction`);
    parts.push("");
    parts.push(`{code:bash}`);
    parts.push(issue.brief.reproductionHint);
    parts.push("{code}");
    parts.push("");
  }

  parts.push(`h2. Sentry Details`);
  parts.push("");
  parts.push(`*Sentry ID:* ${issue.sentryId}`);
  parts.push(`*Project:* ${issue.project}`);
  parts.push(`*Environment:* ${issue.environment}`);
  parts.push(`*Level:* ${issue.level}`);
  parts.push(`*Events:* ${issue.eventCount}`);
  if (issue.release) parts.push(`*Release:* ${issue.release}`);
  parts.push(`*Fingerprint:* ${issue.fingerprint}`);
  parts.push("");

  return parts.join("\n");
}

export function JiraModal() {
  const { jiraModalOpen, jiraModalIssueId, closeJiraModal } = useCockpitStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [jiraSubmitError, setJiraSubmitError] = useState<string | null>(null);

  const { data: issue } = useQuery<Issue, Error>({
    queryKey: ["issue", jiraModalIssueId],
    queryFn: () => fetch(`/api/issues/${jiraModalIssueId}`).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    enabled: !!jiraModalIssueId && jiraModalOpen,
  });

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [component, setComponent] = useState("");

  useEffect(() => {
    if (issue) {
      setSummary(issue.title);
      setDescription(buildDescription(issue));
    }
  }, [issue]);


  const submitMutation = useMutation({
    mutationFn: () =>
      fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: jiraModalIssueId,
          decision: "jira",
          metadata: { summary, description, priority, component },
        }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: (data: { jiraKey?: string | null; decision?: { jiraError?: string | null } }) => {
      queryClient.invalidateQueries({ queryKey: ["issue", jiraModalIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      queryClient.invalidateQueries({ queryKey: ["decisions"] });
      queryClient.invalidateQueries({ queryKey: ["nav-count"] });

      if (data.decision?.jiraError) {
        setJiraSubmitError(data.decision.jiraError);
        return;
      }

      setJiraSubmitError(null);
      setSummary("");
      setDescription("");
      setPriority("medium");
      setComponent("");

      if (data.jiraKey) {
        toast({ title: `Jira ticket created`, description: data.jiraKey });
      }
      closeJiraModal();
    },
  });

  return (
    <DialogPrimitive.Root open={jiraModalOpen} onOpenChange={(open) => !open && closeJiraModal()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="sta-modal-overlay" />
        <DialogPrimitive.Content
          aria-describedby="jira-modal-desc"
          style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            width: "min(640px, calc(100vw - 2rem))",
            zIndex: 51,
          }}
        >
          <div className="sta-modal">
            <div className="sta-modal-header">
              <DialogPrimitive.Title style={{ margin: 0, font: "inherit", display: "inline" }}>
                Draft Jira Ticket
              </DialogPrimitive.Title>
              {issue && (
                <span style={{ color: "#3D4F68", marginLeft: "10px" }}>
                  {issue.sentryId}
                </span>
              )}
            </div>

            <DialogPrimitive.Description asChild>
            <div id="jira-modal-desc" className="sta-modal-body">
              <div>
                <label className="sta-label">Summary</label>
                <input
                  className="sta-input"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="Ticket summary"
                />
              </div>

              <div>
                <label className="sta-label">Description</label>
                <textarea
                  className="sta-textarea"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Jira markup description"
                  rows={10}
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
                <div>
                  <label className="sta-label">Priority</label>
                  <select
                    className="sta-select"
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="medium">Medium</option>
                    <option value="low">Low</option>
                  </select>
                </div>
                <div>
                  <label className="sta-label">Component</label>
                  <input
                    className="sta-input"
                    value={component}
                    onChange={(e) => setComponent(e.target.value)}
                    placeholder="e.g. backend, api"
                  />
                </div>
              </div>
            </div>
            </DialogPrimitive.Description>

            {jiraSubmitError && (
              <div style={{
                margin: "0 0 12px", padding: "8px 12px", borderRadius: "3px",
                background: "rgba(248,113,113,0.08)", border: "1px solid rgba(248,113,113,0.25)",
                fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#F87171",
              }}>
                Jira error: {jiraSubmitError}
              </div>
            )}

            <div className="sta-modal-footer">
              <button className="sta-btn" onClick={closeJiraModal} disabled={submitMutation.isPending}>
                Cancel
              </button>
              <button
                className="sta-btn primary"
                onClick={() => submitMutation.mutate()}
                disabled={submitMutation.isPending || !summary}
              >
                {submitMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                Submit &amp; Close Issue
              </button>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
