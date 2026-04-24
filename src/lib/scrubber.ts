const EMAIL_RE = /[\w.+-]+@[\w-]+\.[a-zA-Z]{2,}/g;
const JWT_RE = /eyJ[\w-]+\.eyJ[\w-]+\.[\w\-.~+/]+=*/g;
const SECRET_KV_RE = /(authorization|x-api-key|x-auth-token|cookie|token|secret|password|passwd|pwd)\s*[:=]\s*(?:Bearer\s+)?['"]?[\w\-.~+/]{8,}['"]?/gi;
const CARD_RE = /\b(?:\d{4}[-\s]?){3}\d{4}\b/g;

export function scrub(text: string): string {
  return text
    .replace(EMAIL_RE, "[REDACTED:email]")
    .replace(JWT_RE, "[REDACTED:jwt]")
    .replace(SECRET_KV_RE, (_, key) => `${key}=[REDACTED]`)
    .replace(CARD_RE, "[REDACTED:cc]");
}
