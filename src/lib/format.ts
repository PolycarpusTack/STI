export function relativeTime(dateStr: string): string {
  const diffMin = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const h = Math.floor(diffMin / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString();
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString();
}

export function confidenceLevel(c: number | null | undefined): "high" | "medium" | "low" | null {
  if (c == null) return null;
  if (c >= 0.7) return "high";
  if (c >= 0.4) return "medium";
  return "low";
}

export const CONF_COLORS: Record<"high" | "medium" | "low", string> = {
  high: "#4ADE80",
  medium: "#F59E0B",
  low: "#F87171",
};
