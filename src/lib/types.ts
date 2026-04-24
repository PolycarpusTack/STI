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
