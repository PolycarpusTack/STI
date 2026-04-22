import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

const now = new Date()
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000)

const issues = [
  {
    sentryIssueId: 'SENTRY-1001',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-null-pointer-schedule',
    title: 'NullPointerException in ScheduleService.generateSlots',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 47,
    firstSeen: hoursAgo(36),
    lastSeen: hoursAgo(1),
    culprit: 'src/modules/scheduling/ScheduleService.ts:142',
    stacktrace: `Error: Cannot read properties of null (reading 'duration')
  at ScheduleService.generateSlots (src/modules/scheduling/ScheduleService.ts:142:24)
  at ScheduleController.getAvailableSlots (src/modules/scheduling/ScheduleController.ts:58:20)
  at Layer.handle (node_modules/express/lib/router/layer.js:95:5)`,
    tags: JSON.stringify({ module: 'scheduling', route: '/api/v2/schedules', method: 'GET' }),
  },
  {
    sentryIssueId: 'SENTRY-1002',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-auth-token-expired',
    title: 'Auth token expired mid-session for active users',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 128,
    firstSeen: hoursAgo(24),
    lastSeen: hoursAgo(0.5),
    culprit: 'src/modules/auth/middleware.ts:87',
    stacktrace: `Error: JWT expired at 2025-01-15T10:30:00Z
  at verifyToken (src/modules/auth/middleware.ts:87:11)
  at authenticate (src/modules/auth/middleware.ts:42:18)
  at Layer.handle (node_modules/express/lib/router/layer.js:95:5)`,
    tags: JSON.stringify({ module: 'auth', route: '/api/v2/*', method: '*ALL' }),
  },
  {
    sentryIssueId: 'SENTRY-1003',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-db-connection-pool',
    title: 'Connection pool exhausted in reporting module',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.11.2',
    eventCount: 12,
    firstSeen: hoursAgo(18),
    lastSeen: hoursAgo(6),
    culprit: 'src/modules/reporting/ReportGenerator.ts:33',
    stacktrace: `Error: All connections in pool are busy (pool size: 10, busy: 10, idle: 0, waiting: 23)
  at Pool.acquire (node_modules/pg-pool/index.js:45:11)
  at ReportGenerator.execute (src/modules/reporting/ReportGenerator.ts:33:22)`,
    tags: JSON.stringify({ module: 'reporting', route: '/api/v2/reports/generate', method: 'POST' }),
  },
  {
    sentryIssueId: 'SENTRY-1004',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-notification-rate-limit',
    title: 'Notification service hitting rate limit on provider API',
    level: 'warning',
    status: 'unresolved',
    environment: 'staging',
    release: 'whats-on@3.12.1-rc1',
    eventCount: 8,
    firstSeen: hoursAgo(10),
    lastSeen: hoursAgo(2),
    culprit: 'src/modules/notifications/NotificationService.ts:201',
    stacktrace: `Error: 429 Too Many Requests - Rate limit exceeded (100 req/min)
  at NotificationService.sendPush (src/modules/notifications/NotificationService.ts:201:14)
  at NotificationQueue.processBatch (src/modules/notifications/NotificationQueue.ts:67:9)`,
    tags: JSON.stringify({ module: 'notifications', provider: 'fcm' }),
  },
  {
    sentryIssueId: 'SENTRY-1005',
    projectId: 'whats-on-web',
    fingerprint: 'fp-browser-extension-content-script',
    title: 'Content script injection from unknown extension',
    level: 'info',
    status: 'unresolved',
    environment: 'production',
    release: null,
    eventCount: 534,
    firstSeen: hoursAgo(48),
    lastSeen: hoursAgo(0.25),
    culprit: 'chrome-extension://abc123def456/content.js',
    stacktrace: `TypeError: Cannot read properties of undefined (reading 'querySelector')
  at HTMLDocument.<anonymous> (chrome-extension://abc123def456/content.js:1:4521)`,
    tags: JSON.stringify({ browser: 'Chrome 120', extension: 'unknown-adblocker', os: 'Windows' }),
  },
  {
    sentryIssueId: 'SENTRY-1006',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-payment-stripe-webhook',
    title: 'Stripe webhook signature verification failing',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 3,
    firstSeen: hoursAgo(14),
    lastSeen: hoursAgo(3),
    culprit: 'src/modules/payments/stripeWebhook.ts:55',
    stacktrace: `Error: Stripe webhook signature verification failed: no matching signature
  at constructEvent (node_modules/stripe/lib/webhooks.js:112:13)
  at handleWebhook (src/modules/payments/stripeWebhook.ts:55:20)`,
    tags: JSON.stringify({ module: 'payments', provider: 'stripe', route: '/api/v2/payments/webhook' }),
  },
  {
    sentryIssueId: 'SENTRY-1007',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-upload-size-limit',
    title: 'File upload exceeding 50MB limit causes unhandled rejection',
    level: 'warning',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 15,
    firstSeen: hoursAgo(30),
    lastSeen: hoursAgo(8),
    culprit: 'src/modules/media/UploadService.ts:89',
    stacktrace: `RangeError: Request body too large (exceeded 52428800 bytes)
  at UploadService.validateSize (src/modules/media/UploadService.ts:89:13)`,
    tags: JSON.stringify({ module: 'media', route: '/api/v2/media/upload', method: 'POST' }),
  },
  {
    sentryIssueId: 'SENTRY-1008',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-caching-stale-data',
    title: 'Stale cache data served after Redis connection timeout',
    level: 'warning',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.11.2',
    eventCount: 22,
    firstSeen: hoursAgo(20),
    lastSeen: hoursAgo(4),
    culprit: 'src/modules/caching/CacheMiddleware.ts:34',
    stacktrace: `Error: ECONNREFUSED 127.0.0.1:6379
  at CacheMiddleware.get (src/modules/caching/CacheMiddleware.ts:34:18)
  at ProductController.list (src/modules/products/ProductController.ts:27:15)`,
    tags: JSON.stringify({ module: 'caching', infrastructure: 'redis' }),
  },
  {
    sentryIssueId: 'SENTRY-1009',
    projectId: 'whats-on-web',
    fingerprint: 'fp-browser-extension-translate-widget',
    title: 'Google Translate widget interfering with React hydration',
    level: 'info',
    status: 'unresolved',
    environment: 'production',
    release: null,
    eventCount: 89,
    firstSeen: hoursAgo(47),
    lastSeen: hoursAgo(5),
    culprit: 'google-translate-element',
    stacktrace: `Warning: Text content did not match. Server: "Book Now" Client: "Book Now "
  at hydrationWarning (react-dom.js:1234:5)`,
    tags: JSON.stringify({ browser: 'Chrome', extension: 'google-translate', framework: 'react' }),
  },
  {
    sentryIssueId: 'SENTRY-1010',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-search-elasticsearch-timeout',
    title: 'Elasticsearch query timeout on complex search filters',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 6,
    firstSeen: hoursAgo(16),
    lastSeen: hoursAgo(2),
    culprit: 'src/modules/search/SearchService.ts:156',
    stacktrace: `Error: Request timeout after 30000ms
  at SearchService.execute (src/modules/search/SearchService.ts:156:11)
  at SearchController.search (src/modules/search/SearchController.ts:44:18)`,
    tags: JSON.stringify({ module: 'search', infrastructure: 'elasticsearch', route: '/api/v2/search' }),
  },
  {
    sentryIssueId: 'SENTRY-1011',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-cron-dead-letter',
    title: 'Dead letter queue filling up from failed cron jobs',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 31,
    firstSeen: hoursAgo(40),
    lastSeen: hoursAgo(1),
    culprit: 'src/modules/scheduler/CronRunner.ts:78',
    stacktrace: `Error: Job "daily-report-generation" exceeded max retries (3)
  at CronRunner.execute (src/modules/scheduler/CronRunner.ts:78:13)
  at BullQueue.process (node_modules/bull/lib/process/worker.js:245:12)`,
    tags: JSON.stringify({ module: 'scheduler', job: 'daily-report-generation' }),
  },
  {
    sentryIssueId: 'SENTRY-1012',
    projectId: 'whats-on-web',
    fingerprint: 'fp-whats-on-web-cors-preflight',
    title: 'CORS preflight rejected for mobile deep link handler',
    level: 'warning',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on-web@2.8.0',
    eventCount: 67,
    firstSeen: hoursAgo(22),
    lastSeen: hoursAgo(0.5),
    culprit: 'src/middleware/cors.ts:19',
    stacktrace: `Error: Access-Control-Allow-Origin mismatch. Origin: null
  at CorsMiddleware.handle (src/middleware/cors.ts:19:15)`,
    tags: JSON.stringify({ module: 'middleware', platform: 'mobile-ios', route: '/api/v2/deeplink' }),
  },
  {
    sentryIssueId: 'SENTRY-1013',
    projectId: 'whats-on-api',
    fingerprint: 'fp-bot-scanner-nginx-403',
    title: 'Automated vulnerability scanner hitting admin endpoints',
    level: 'info',
    status: 'unresolved',
    environment: 'production',
    release: null,
    eventCount: 2100,
    firstSeen: hoursAgo(48),
    lastSeen: hoursAgo(0.1),
    culprit: 'GET /admin.php?login',
    stacktrace: `Error: 403 Forbidden
  at NginxAccessLog (external)`,
    tags: JSON.stringify({ source: 'bot', bot_type: 'vulnerability-scanner', ip_region: 'unknown' }),
  },
  {
    sentryIssueId: 'SENTRY-1014',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-graphql-n-plus-one',
    title: 'N+1 query detected in GraphQL venue resolver',
    level: 'warning',
    status: 'unresolved',
    environment: 'staging',
    release: 'whats-on@3.12.1-rc1',
    eventCount: 4,
    firstSeen: hoursAgo(8),
    lastSeen: hoursAgo(4),
    culprit: 'src/graphql/resolvers/VenueResolver.ts:45',
    stacktrace: `Warning: Detected N+1 query pattern. 1 parent query, 47 child queries.
  at DataLoader.loadMany (src/graphql/resolvers/VenueResolver.ts:45:20)`,
    tags: JSON.stringify({ module: 'graphql', resolver: 'VenueResolver' }),
  },
  {
    sentryIssueId: 'SENTRY-1015',
    projectId: 'whats-on-api',
    fingerprint: 'fp-whats-on-email-smtp-auth',
    title: 'SMTP authentication failure for transactional emails',
    level: 'error',
    status: 'unresolved',
    environment: 'production',
    release: 'whats-on@3.12.0',
    eventCount: 9,
    firstSeen: hoursAgo(12),
    lastSeen: hoursAgo(2),
    culprit: 'src/modules/email/EmailService.ts:67',
    stacktrace: `Error: Invalid login: 535 5.7.8 Authentication credentials invalid
  at SMTPConnection.login (node_modules/nodemailer/lib/smtp-connection.js:892:16)
  at EmailService.send (src/modules/email/EmailService.ts:67:14)`,
    tags: JSON.stringify({ module: 'email', provider: 'smtp' }),
  },
]

const briefs: { issueIdx: number; lean: string; confidence: number; summary: string; module: string; tenantImpact: string; reproductionHint: string | null }[] = [
  { issueIdx: 0, lean: 'jira', confidence: 0.92, summary: 'Recurring NullPointerException in the scheduling module when generating available time slots. A "duration" field is null, likely from an upstream data issue. 47 events in 36 hours with increasing frequency.', module: 'scheduling', tenantImpact: 'Affects all tenants using the online booking feature', reproductionHint: 'Trigger slot generation when a service has no configured duration' },
  { issueIdx: 1, lean: 'jira', confidence: 0.88, summary: 'JWT tokens are expiring mid-session for active users, causing sudden logouts. The token refresh mechanism appears to be failing silently. 128 events suggest widespread impact across all tenants.', module: 'auth', tenantImpact: 'All active sessions affected, high user-facing impact', reproductionHint: 'Login and remain idle for token expiry period' },
  { issueIdx: 2, lean: 'jira', confidence: 0.85, summary: 'The reporting module is exhausting the database connection pool during report generation. This suggests either connection leaks or overly aggressive query concurrency. Affects report generation for all tenants.', module: 'reporting', tenantImpact: 'Tenants attempting to generate large reports', reproductionHint: 'Generate a comprehensive analytics report while other API requests are active' },
  { issueIdx: 3, lean: 'investigate', confidence: 0.6, summary: 'Notification service is hitting the FCM rate limit. Could be a spike in legitimate notifications or a retry storm. Only 8 events, currently in staging only.', module: 'notifications', tenantImpact: 'Staging environment only, no production impact yet', reproductionHint: 'Batch send more than 100 push notifications within 60 seconds' },
  { issueIdx: 4, lean: 'close', confidence: 0.95, summary: 'Classic browser extension interference pattern. An unknown ad-blocker content script is throwing errors in the WHATS\'ON web app. 534 events from a single Chrome extension with no impact on platform functionality.', module: 'frontend', tenantImpact: 'None — third-party browser extension noise', reproductionHint: null },
  { issueIdx: 5, lean: 'jira', confidence: 0.78, summary: 'Stripe webhook signatures are failing verification, potentially causing missed payment events. 3 occurrences over 11 hours. Could indicate a webhook endpoint secret rotation issue.', module: 'payments', tenantImpact: 'Tenants processing payments may miss payment confirmations', reproductionHint: 'Trigger a Stripe test webhook to the endpoint' },
  { issueIdx: 6, lean: 'watchlist', confidence: 0.72, summary: 'Users attempting to upload files exceeding 50MB get an unhandled promise rejection instead of a proper error message. Known limitation but the error handling should be improved. 15 events suggest occasional attempts.', module: 'media', tenantImpact: 'Low — users uploading very large files', reproductionHint: 'Upload a file larger than 50MB via the media endpoint' },
  { issueIdx: 7, lean: 'investigate', confidence: 0.55, summary: 'Redis connection timeouts are causing stale data to be served through the cache fallback. 22 events suggest intermittent connectivity issues with the Redis instance. Need to verify if Redis is healthy.', module: 'caching', tenantImpact: 'Potentially all tenants if Redis is down for extended periods', reproductionHint: null },
  { issueIdx: 8, lean: 'close', confidence: 0.93, summary: 'Google Translate browser extension is modifying DOM text nodes, causing React hydration mismatches. This is a known third-party extension issue with no platform impact. 89 events from a single browser extension.', module: 'frontend', tenantImpact: 'None — third-party browser extension', reproductionHint: null },
  { issueIdx: 9, lean: 'jira', confidence: 0.82, summary: 'Elasticsearch queries are timing out (30s) when complex multi-filter searches are used. 6 events suggest this happens under specific search conditions. Could indicate missing or degraded indexes.', module: 'search', tenantImpact: 'Tenants using advanced search with multiple filters', reproductionHint: 'Execute a search with more than 5 filter parameters' },
  { issueIdx: 10, lean: 'jira', confidence: 0.9, summary: 'The daily report generation cron job has failed 31 times, filling the dead letter queue. This means tenants are not receiving their scheduled reports. The job has exceeded max retries on every run.', module: 'scheduler', tenantImpact: 'All tenants with scheduled daily reports', reproductionHint: null },
  { issueIdx: 11, lean: 'investigate', confidence: 0.58, summary: 'CORS preflight requests from the iOS mobile app are being rejected with an "origin: null" mismatch. 67 events suggest this affects a significant portion of mobile users. May be related to a recent app update.', module: 'middleware', tenantImpact: 'iOS mobile app users', reproductionHint: null },
  { issueIdx: 12, lean: 'close', confidence: 0.97, summary: 'Automated vulnerability scanner traffic hitting admin endpoints. 2100 events from known bot patterns targeting /admin.php. Standard noise — no platform vulnerability. Nginx is correctly returning 403.', module: 'infrastructure', tenantImpact: 'None — bot/scanner traffic', reproductionHint: null },
]

const decisions: { issueIdx: number; decision: string; aiLean: string; responderId: string; jiraId?: string }[] = [
  { issueIdx: 0, decision: 'jira', aiLean: 'jira', responderId: 'user-alice', jiraId: 'WO-4821' },
  { issueIdx: 1, decision: 'jira', aiLean: 'jira', responderId: 'user-bob', jiraId: 'WO-4822' },
  { issueIdx: 4, decision: 'close', aiLean: 'close', responderId: 'user-alice' },
  { issueIdx: 8, decision: 'close', aiLean: 'close', responderId: 'user-charlie' },
  { issueIdx: 12, decision: 'close', aiLean: 'close', responderId: 'user-bob' },
  { issueIdx: 6, decision: 'watchlist', aiLean: 'watchlist', responderId: 'user-alice' },
]

const suppressions: { fingerprint: string; reason: string; scope: string }[] = [
  { fingerprint: 'fp-browser-extension-content-script', reason: 'Browser extension content script injection — known noise pattern from various ad-blockers and accessibility extensions', scope: 'global' },
  { fingerprint: 'fp-browser-extension-translate-widget', reason: 'Google Translate widget modifying DOM — causes React hydration warnings with no platform impact', scope: 'global' },
  { fingerprint: 'fp-bot-scanner-nginx-403', reason: 'Automated vulnerability scanners and bot traffic hitting admin endpoints — standard internet noise filtered by WAF', scope: 'global' },
]

export async function POST() {
  try {
    // Clear existing data (idempotent)
    await db.decision.deleteMany()
    await db.brief.deleteMany()
    await db.issue.deleteMany()
    await db.suppression.deleteMany()

    // Create issues
    const createdIssues = []
    for (const issue of issues) {
      const created = await db.issue.create({ data: issue })
      createdIssues.push(created)
    }

    // Create briefs
    for (const b of briefs) {
      const issue = createdIssues[b.issueIdx]
      if (!issue) continue
      await db.brief.create({
        data: {
          issueId: issue.id,
          promptVersion: 'v0.4.0',
          lean: b.lean,
          confidence: b.confidence,
          summary: b.summary,
          module: b.module,
          tenantImpact: b.tenantImpact,
          reproductionHint: b.reproductionHint,
          rawResponse: JSON.stringify({ lean: b.lean, confidence: b.confidence, summary: b.summary }),
          tokenCount: Math.floor(Math.random() * 500) + 300,
          latencyMs: Math.floor(Math.random() * 2000) + 800,
        },
      })
    }

    // Create decisions
    for (const d of decisions) {
      const issue = createdIssues[d.issueIdx]
      if (!issue) continue
      const brief = await db.brief.findUnique({ where: { issueId: issue.id } })
      await db.decision.create({
        data: {
          issueId: issue.id,
          briefId: brief?.id ?? null,
          decision: d.decision,
          aiLean: d.aiLean,
          responderId: d.responderId,
          jiraId: d.jiraId ?? null,
        },
      })
    }

    // Create suppressions
    for (const s of suppressions) {
      await db.suppression.create({
        data: {
          fingerprint: s.fingerprint,
          reason: s.reason,
          scope: s.scope,
          authorId: 'system',
        },
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Database seeded successfully',
      counts: {
        issues: createdIssues.length,
        briefs: briefs.length,
        decisions: decisions.length,
        suppressions: suppressions.length,
      },
    })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ error: 'Failed to seed database', details: String(error) }, { status: 500 })
  }
}
