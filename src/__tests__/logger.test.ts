import { beforeEach, describe, expect, it } from "vitest";
import { addSecret, redact } from "../logger.js";

describe("logger redaction", () => {
  it("redacts a registered secret value", () => {
    addSecret("super-secret-token-value-123");
    const out = redact("Using token super-secret-token-value-123 for auth");
    expect(out).not.toContain("super-secret-token-value-123");
    expect(out).toContain("«redacted»");
  });

  it("does not redact short strings registered as secrets", () => {
    addSecret("abc"); // too short — ignored
    expect(redact("value abc here")).toContain("abc");
  });

  it("redacts Authorization headers (Bearer/Api-Key)", () => {
    expect(redact('"Authorization": "Bearer abcdef123456789"')).toContain("«redacted»");
    expect(redact("Authorization=Api-Key sfz6aou.nexp.b3xjcfoqz31")).toContain("«redacted»");
    expect(redact('"Authorization": "Bearer abcdef123456789"')).not.toContain("abcdef123456789");
  });

  it("redacts bare bearer tokens", () => {
    const out = redact("header Bearer eyJhbGciOiJIUzI1Niprdg]");
    expect(out).toContain("Bearer «redacted»");
  });

  it("redacts Set-Cookie values", () => {
    const out = redact("Set-Cookie: connect.sid=s%3Aabc123.def456; path=/");
    expect(out).toContain("«redacted»");
    expect(out).not.toContain("connect.sid=s%3Aabc123.def456");
  });

  it("leaves ordinary text untouched", () => {
    const line = "Starting application on port 3000";
    expect(redact(line)).toBe(line);
  });
});
