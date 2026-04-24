export async function register() {
  // Only run in the Node.js runtime (not Edge), and not during tests.
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV !== "test") {
    const { startPoller } = await import("@/lib/poller");
    startPoller();
  }
}
