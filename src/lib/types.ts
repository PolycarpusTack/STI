export interface Metrics {
  queueSize: number;
  handledToday: number;
  disagreementRate: number;
  lastPull: string | null;
  briefsGenerated: number;
  totalDecisions: number;
  llmModel: string | null;
  sentryConfigured: boolean;
}

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
