export const VALID_LEANS = ["jira", "close", "investigate", "watchlist"] as const;
export type Lean = (typeof VALID_LEANS)[number];

export function isValidLean(value: string | null): value is Lean {
  return VALID_LEANS.includes(value as Lean);
}
