"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, Eye, EyeOff, CheckCircle, XCircle } from "lucide-react";

interface Settings {
  sentryToken: string | null;
  sentryTokenSet: boolean;
  sentryOrg: string;
  sentryProject: string;
  pollIntervalMinutes: number;
  llmBaseUrl: string;
  llmApiKey: string | null;
  llmApiKeySet: boolean;
  llmModel: string;
  jiraBaseUrl: string;
  jiraEmail: string;
  jiraApiKey: string | null;
  jiraApiKeySet: boolean;
  jiraProjectKey: string;
}

type TestResult = { ok: true; projectName: string } | { ok: false; error: string } | null;

export function SettingsView() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<Settings, Error>({
    queryKey: ["settings"],
    queryFn: () => fetch("/api/settings").then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
  });

  const [token, setToken] = useState("");
  const [org, setOrg] = useState("");
  const [project, setProject] = useState("");
  const [interval, setInterval] = useState(10);
  const intervalValid = interval >= 1 && interval <= 1440;
  const [showToken, setShowToken] = useState(false);
  const [testResult, setTestResult] = useState<TestResult>(null);
  const [dirty, setDirty] = useState(false);

  const [llmBaseUrl, setLlmBaseUrl] = useState("");
  const [llmApiKey, setLlmApiKey] = useState("");
  const [llmModel, setLlmModel] = useState("gpt-4o");
  const [showLlmKey, setShowLlmKey] = useState(false);

  const [jiraBaseUrl, setJiraBaseUrl] = useState("");
  const [jiraEmail, setJiraEmail] = useState("");
  const [jiraApiKey, setJiraApiKey] = useState("");
  const [jiraProjectKey, setJiraProjectKey] = useState("");
  const [showJiraKey, setShowJiraKey] = useState(false);

  useEffect(() => {
    if (data) {
      setToken(data.sentryTokenSet ? "••••••••" : "");
      setOrg(data.sentryOrg);
      setProject(data.sentryProject);
      setInterval(data.pollIntervalMinutes);
      setLlmBaseUrl(data.llmBaseUrl);
      setLlmApiKey(data.llmApiKeySet ? "••••••••" : "");
      setLlmModel(data.llmModel);
      setJiraBaseUrl(data.jiraBaseUrl);
      setJiraEmail(data.jiraEmail);
      setJiraApiKey(data.jiraApiKeySet ? "••••••••" : "");
      setJiraProjectKey(data.jiraProjectKey);
      setDirty(false);
    }
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: () =>
      fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sentryToken: token,
          sentryOrg: org,
          sentryProject: project,
          pollIntervalMinutes: interval,
          llmBaseUrl,
          llmApiKey,
          llmModel,
          jiraBaseUrl,
          jiraEmail,
          jiraApiKey,
          jiraProjectKey,
        }),
      }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settings"] });
      setDirty(false);
      setTestResult(null);
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => {
      // Save first so the test uses the latest values
      await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sentryToken: token, sentryOrg: org, sentryProject: project, llmBaseUrl, llmApiKey, llmModel, jiraBaseUrl, jiraEmail, jiraApiKey, jiraProjectKey }),
      });
      return fetch("/api/settings/test", { method: "POST" }).then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); });
    },
    onSuccess: (result) => {
      setTestResult(result as TestResult);
      queryClient.invalidateQueries({ queryKey: ["settings"] });
    },
  });

  function field(val: string, set: (v: string) => void) {
    return (v: string) => { set(v); setDirty(true); setTestResult(null); };
  }

  if (isLoading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#3D4F68" }}>
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{
        padding: "14px 24px", borderBottom: "1px solid #1F2D45",
        background: "#111827", flexShrink: 0,
        fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
        letterSpacing: "0.12em", textTransform: "uppercase", color: "#9BAAC4",
      }}>
        Settings
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "24px" }}>
        <div style={{ maxWidth: "520px", display: "flex", flexDirection: "column", gap: "32px" }}>

          {/* Sentry Connection */}
          <section>
            <div style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#2DD4BF", marginBottom: "16px",
              paddingBottom: "8px", borderBottom: "1px solid #1a2030",
            }}>
              ▸ Sentry Connection
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="sta-label">Auth Token</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="sta-input"
                    type={showToken ? "text" : "password"}
                    value={token}
                    onChange={(e) => field(token, setToken)(e.target.value)}
                    onFocus={() => { if (token === "••••••••") setToken(""); }}
                    placeholder="sntrys_..."
                    style={{ flex: 1 }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    className="sta-btn"
                    onClick={() => setShowToken((v) => !v)}
                    style={{ flexShrink: 0, padding: "0 10px" }}
                    title={showToken ? "Hide token" : "Show token"}
                  >
                    {showToken ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                  Generate at sentry.io → Settings → Auth Tokens. Needs <code>project:read</code>.
                </div>
              </div>

              <div>
                <label className="sta-label">Organisation slug</label>
                <input
                  className="sta-input"
                  value={org}
                  onChange={(e) => field(org, setOrg)(e.target.value)}
                  placeholder="your-org"
                  spellCheck={false}
                />
              </div>

              <div>
                <label className="sta-label">Project slug</label>
                <input
                  className="sta-input"
                  value={project}
                  onChange={(e) => field(project, setProject)(e.target.value)}
                  placeholder="your-project"
                  spellCheck={false}
                />
              </div>

              {/* Test result */}
              {testResult && (
                <div style={{
                  display: "flex", alignItems: "center", gap: "8px",
                  fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px",
                  color: testResult.ok ? "#4ADE80" : "#F87171",
                  background: testResult.ok ? "rgba(74,222,128,0.06)" : "rgba(248,113,113,0.06)",
                  border: `1px solid ${testResult.ok ? "#2d5c24" : "#5c2528"}`,
                  borderRadius: "2px", padding: "8px 12px",
                }}>
                  {testResult.ok
                    ? <><CheckCircle size={13} /> Connected — {testResult.projectName}</>
                    : <><XCircle size={13} /> {testResult.error}</>
                  }
                </div>
              )}

              <div>
                <button
                  className="sta-btn"
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || !org || !project}
                >
                  {testMutation.isPending && <Loader2 size={12} className="animate-spin" />}
                  Test Connection
                </button>
              </div>
            </div>
          </section>

          {/* Pipeline */}
          <section>
            <div style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#2DD4BF", marginBottom: "16px",
              paddingBottom: "8px", borderBottom: "1px solid #1a2030",
            }}>
              ▸ Pipeline
            </div>

            <div>
              <label className="sta-label">Poll interval (minutes)</label>
              <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                <input
                  className="sta-input"
                  type="number"
                  min={1}
                  max={1440}
                  value={interval}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10);
                    if (!isNaN(v)) { setInterval(v); setDirty(true); }
                  }}
                  onBlur={() => {
                    if (interval < 1) setInterval(1);
                    else if (interval > 1440) setInterval(1440);
                  }}
                  style={{ width: "100px", borderColor: intervalValid ? undefined : "#7A1515" }}
                />
                <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#3D4F68" }}>
                  {intervalValid && (interval < 60
                    ? `every ${interval}m`
                    : `every ${(interval / 60).toFixed(interval % 60 === 0 ? 0 : 1)}h`)}
                </span>
              </div>
              {!intervalValid && (
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#F87171", marginTop: "4px" }}>
                  Must be between 1 and 1440 minutes
                </div>
              )}
              <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                The poller reads this on each cycle — no restart needed.
              </div>
            </div>
          </section>

          {/* AI / LLM */}
          <section>
            <div style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#2DD4BF", marginBottom: "16px",
              paddingBottom: "8px", borderBottom: "1px solid #1a2030",
            }}>
              ▸ AI / LLM Runtime
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="sta-label">Base URL</label>
                <input
                  className="sta-input"
                  value={llmBaseUrl}
                  onChange={(e) => { setLlmBaseUrl(e.target.value); setDirty(true); }}
                  placeholder="https://api.openai.com/v1"
                  spellCheck={false}
                  autoComplete="off"
                />
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                  OpenAI-compatible endpoint. Leave blank to use <code>.z-ai-config</code>.
                </div>
              </div>

              <div>
                <label className="sta-label">API Key</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="sta-input"
                    type={showLlmKey ? "text" : "password"}
                    value={llmApiKey}
                    onChange={(e) => { setLlmApiKey(e.target.value); setDirty(true); }}
                    onFocus={() => { if (llmApiKey === "••••••••") setLlmApiKey(""); }}
                    placeholder="sk-..."
                    style={{ flex: 1 }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    className="sta-btn"
                    onClick={() => setShowLlmKey((v) => !v)}
                    style={{ flexShrink: 0, padding: "0 10px" }}
                    title={showLlmKey ? "Hide key" : "Show key"}
                  >
                    {showLlmKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
              </div>

              <div>
                <label className="sta-label">Model</label>
                <input
                  className="sta-input"
                  value={llmModel}
                  onChange={(e) => { setLlmModel(e.target.value); setDirty(true); }}
                  placeholder="gpt-4o"
                  spellCheck={false}
                />
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                  Any OpenAI-compatible model ID (gpt-4o, gpt-4o-mini, deepseek-chat, etc.).
                </div>
              </div>
            </div>
          </section>

          {/* Jira */}
          <section>
            <div style={{
              fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px",
              letterSpacing: "0.12em", textTransform: "uppercase",
              color: "#2DD4BF", marginBottom: "16px",
              paddingBottom: "8px", borderBottom: "1px solid #1a2030",
            }}>
              ▸ Jira
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label className="sta-label">Base URL</label>
                <input
                  className="sta-input"
                  value={jiraBaseUrl}
                  onChange={(e) => { setJiraBaseUrl(e.target.value); setDirty(true); }}
                  placeholder="https://your-org.atlassian.net"
                  spellCheck={false}
                  autoComplete="off"
                />
              </div>

              <div>
                <label className="sta-label">Atlassian email</label>
                <input
                  className="sta-input"
                  type="email"
                  value={jiraEmail}
                  onChange={(e) => { setJiraEmail(e.target.value); setDirty(true); }}
                  placeholder="you@yourorg.com"
                  spellCheck={false}
                  autoComplete="off"
                />
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                  The email address associated with your Atlassian account.
                </div>
              </div>

              <div>
                <label className="sta-label">API Token</label>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    className="sta-input"
                    type={showJiraKey ? "text" : "password"}
                    value={jiraApiKey}
                    onChange={(e) => { setJiraApiKey(e.target.value); setDirty(true); }}
                    onFocus={() => { if (jiraApiKey === "••••••••") setJiraApiKey(""); }}
                    placeholder="Atlassian API token"
                    style={{ flex: 1 }}
                    spellCheck={false}
                    autoComplete="off"
                  />
                  <button
                    className="sta-btn"
                    onClick={() => setShowJiraKey((v) => !v)}
                    style={{ flexShrink: 0, padding: "0 10px" }}
                    title={showJiraKey ? "Hide token" : "Show token"}
                  >
                    {showJiraKey ? <EyeOff size={13} /> : <Eye size={13} />}
                  </button>
                </div>
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                  Generate at id.atlassian.com → Security → API tokens.
                </div>
              </div>

              <div>
                <label className="sta-label">Project key</label>
                <input
                  className="sta-input"
                  value={jiraProjectKey}
                  onChange={(e) => { setJiraProjectKey(e.target.value.toUpperCase()); setDirty(true); }}
                  placeholder="PLATFORM"
                  spellCheck={false}
                  style={{ width: "160px" }}
                />
                <div style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "10px", color: "#3D4F68", marginTop: "5px" }}>
                  Tickets will be created in this project (e.g. <code>PLATFORM</code>).
                </div>
              </div>
            </div>
          </section>

        </div>
      </div>

      {/* Footer */}
      <div style={{
        padding: "12px 24px", borderTop: "1px solid #1F2D45",
        background: "#111827", display: "flex", gap: "10px", flexShrink: 0,
      }}>
        <button
          className="sta-btn primary"
          onClick={() => saveMutation.mutate()}
          disabled={saveMutation.isPending || !dirty || !intervalValid}
        >
          {saveMutation.isPending && <Loader2 size={12} className="animate-spin" />}
          Save
        </button>
        {saveMutation.isSuccess && !dirty && (
          <span style={{ fontFamily: "var(--font-jetbrains-mono, 'JetBrains Mono', 'IBM Plex Mono', monospace)", fontSize: "11px", color: "#4ADE80", alignSelf: "center" }}>
            Saved
          </span>
        )}
      </div>
    </div>
  );
}
