"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useCockpitStore } from "@/lib/store";
import type { Issue } from "./issue-list";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

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
  if (issue.release) {
    parts.push(`*Release:* ${issue.release}`);
  }
  parts.push(`*Fingerprint:* ${issue.fingerprint}`);
  parts.push("");

  return parts.join("\n");
}

export function JiraModal() {
  const { jiraModalOpen, jiraModalIssueId, closeJiraModal } =
    useCockpitStore();
  const queryClient = useQueryClient();

  const { data: issue } = useQuery<Issue, Error>({
    queryKey: ["issue", jiraModalIssueId],
    queryFn: () =>
      fetch(`/api/issues/${jiraModalIssueId}`).then((r) => r.json()),
    enabled: !!jiraModalIssueId && jiraModalOpen,
  });

  // Derive default values from the issue
  const defaultSummary = issue?.title ?? "";
  const defaultDescription = useMemo(
    () => (issue ? buildDescription(issue) : ""),
    [issue]
  );

  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [component, setComponent] = useState("");
  const [initialized, setInitialized] = useState(false);

  // Sync form fields from issue data once when it loads
  const currentSummary = initialized ? summary : defaultSummary;
  const currentDescription = initialized ? description : defaultDescription;

  function handleSummaryChange(val: string) {
    setInitialized(true);
    setSummary(val);
  }

  function handleDescriptionChange(val: string) {
    setInitialized(true);
    setDescription(val);
  }

  const submitMutation = useMutation({
    mutationFn: () =>
      fetch("/api/decisions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueId: jiraModalIssueId,
          decision: "jira",
          metadata: { summary: currentSummary, description: currentDescription, priority, component },
        }),
      }).then((r) => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["issue", jiraModalIssueId] });
      queryClient.invalidateQueries({ queryKey: ["issues"] });
      queryClient.invalidateQueries({ queryKey: ["metrics"] });
      setInitialized(false);
      setSummary("");
      setDescription("");
      setPriority("medium");
      setComponent("");
      closeJiraModal();
    },
  });

  return (
    <Dialog open={jiraModalOpen} onOpenChange={(open) => !open && closeJiraModal()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Draft Jira Ticket</DialogTitle>
          <DialogDescription>
            Create a Jira ticket from the AI brief. Fields are pre-filled but
            editable.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="jira-summary">Summary</Label>
            <Input
              id="jira-summary"
              value={currentSummary}
              onChange={(e) => handleSummaryChange(e.target.value)}
              placeholder="Ticket summary"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="jira-description">Description</Label>
            <Textarea
              id="jira-description"
              value={currentDescription}
              onChange={(e) => handleDescriptionChange(e.target.value)}
              placeholder="Ticket description (Jira markup)"
              className="min-h-[200px] font-mono text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="jira-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="jira-priority" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="critical">Critical</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="jira-component">Component</Label>
              <Input
                id="jira-component"
                value={component}
                onChange={(e) => setComponent(e.target.value)}
                placeholder="e.g. backend, api"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={closeJiraModal}
            disabled={submitMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            onClick={() => submitMutation.mutate()}
            disabled={submitMutation.isPending || !currentSummary}
          >
            {submitMutation.isPending && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Submit &amp; Close Issue
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
