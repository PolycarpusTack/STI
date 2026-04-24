import { describe, test, expect } from "bun:test";
import { scrub } from "./scrubber";

describe("scrub — email", () => {
  test("redacts a plain email", () => {
    expect(scrub("Contact user@example.com for details")).toBe(
      "Contact [REDACTED:email] for details"
    );
  });

  test("redacts email in a stack trace context line", () => {
    const input = 'raise ValueError("invalid user: john.doe+tag@corp.io")';
    expect(scrub(input)).not.toContain("john.doe");
    expect(scrub(input)).toContain("[REDACTED:email]");
  });

  test("leaves non-email addresses untouched", () => {
    expect(scrub("version 1.2.3")).toBe("version 1.2.3");
  });
});

describe("scrub — JWT", () => {
  const jwt =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
    ".eyJzdWIiOiIxMjM0NTY3ODkwIn0" +
    ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

  test("redacts a JWT bearer token", () => {
    expect(scrub(`Authorization: Bearer ${jwt}`)).toContain("[REDACTED:jwt]");
    expect(scrub(`Authorization: Bearer ${jwt}`)).not.toContain("eyJ");
  });
});

describe("scrub — secret key-value pairs", () => {
  test("redacts password= pair", () => {
    const result = scrub("password=supersecret123");
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("supersecret123");
  });

  test("redacts Authorization header value — preserves key name", () => {
    const result = scrub("Authorization: Bearer abc123xyz789");
    expect(result).toBe("Authorization=[REDACTED]");
    expect(result).not.toContain("abc123xyz789");
  });

  test("JWT regex fires before secret-KV regex on Authorization Bearer JWT", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" +
      ".eyJzdWIiOiIxMjM0NTY3ODkwIn0" +
      ".SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
    const input = `Authorization: Bearer ${jwt}`;
    const result = scrub(input);
    expect(result).toContain("[REDACTED:jwt]");
    expect(result).not.toContain("eyJ");
  });

  test("redacts secret= pair with quotes", () => {
    const result = scrub('secret="my-api-key-value"');
    expect(result).toContain("[REDACTED]");
    expect(result).not.toContain("my-api-key-value");
  });

  test("does not redact short values (< 8 chars)", () => {
    // The regex requires ≥ 8 chars after the separator
    const result = scrub("token=abc");
    expect(result).toBe("token=abc");
  });
});

describe("scrub — credit card", () => {
  test("redacts a 16-digit card number with dashes", () => {
    const result = scrub("card: 4111-1111-1111-1111");
    expect(result).toContain("[REDACTED:cc]");
    expect(result).not.toContain("4111");
  });

  test("redacts a 16-digit card number with spaces", () => {
    const result = scrub("card: 4111 1111 1111 1111");
    expect(result).toContain("[REDACTED:cc]");
  });
});

describe("scrub — no false positives", () => {
  test("leaves a plain stack trace line untouched", () => {
    const line = "  at processRequest (server.js:42:10)";
    expect(scrub(line)).toBe(line);
  });

  test("leaves a URL without credentials untouched", () => {
    const url = "https://api.example.com/v1/issues?limit=100";
    expect(scrub(url)).toBe(url);
  });
});
