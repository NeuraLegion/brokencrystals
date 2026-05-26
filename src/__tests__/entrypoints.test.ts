import { describe, it, expect } from "vitest";
import { sanitizeBody } from "../phases/entrypoints.js";

describe("sanitizeBody", () => {
  it("passes through valid JSON unchanged", () => {
    const input = '{"key":"value","num":42}';
    expect(sanitizeBody(input)).toBe(input);
  });

  it("compacts multi-line JSON", () => {
    const input = '{\n  "key": "value",\n  "num": 42\n}';
    expect(sanitizeBody(input)).toBe('{"key":"value","num":42}');
  });

  it("handles non-string input (object)", () => {
    const input = { key: "value", num: 42 };
    expect(sanitizeBody(input)).toBe('{"key":"value","num":42}');
  });

  it("handles null/undefined input", () => {
    expect(sanitizeBody(null)).toBe("{}");
    expect(sanitizeBody(undefined)).toBe("{}");
  });

  it("repairs unescaped quotes in nested JSON string (payloadTemplate pattern)", () => {
    // This is the actual broken body the LLM generates:
    // The payloadTemplate value contains unescaped quotes inside the string
    const broken =
      '{"subscriberUrl":"https://example.com","active":true,' +
      '"payloadTemplate":"{"content":"A new event","type":"{{type}}","name":"{{title}}"}","secret":"whsec_test"}';

    const result = sanitizeBody(broken);
    const parsed = JSON.parse(result);
    expect(parsed.subscriberUrl).toBe("https://example.com");
    expect(parsed.active).toBe(true);
    expect(parsed.secret).toBe("whsec_test");
    // The payloadTemplate should be a string containing the nested JSON
    expect(typeof parsed.payloadTemplate).toBe("string");
  });

  it("repairs unescaped quotes in complex nested template", () => {
    // Real-world pattern from Cal.com webhook body
    const broken =
      '{"subscriberUrl":"https://example.com","triggers":["BOOKING_CREATED","BOOKING_CANCELLED"],' +
      '"payloadTemplate":"{"content":"A new event has been scheduled","type":"{{type}}","organizer":"{{organizer.name}}"}","version":"2021-10-20"}';

    const result = sanitizeBody(broken);
    const parsed = JSON.parse(result);
    expect(parsed.subscriberUrl).toBe("https://example.com");
    expect(parsed.triggers).toEqual(["BOOKING_CREATED", "BOOKING_CANCELLED"]);
    expect(parsed.version).toBe("2021-10-20");
    expect(typeof parsed.payloadTemplate).toBe("string");
  });

  it("fixes trailing commas before closing braces", () => {
    const broken = '{"key":"value","items":["a","b",],}';
    const result = sanitizeBody(broken);
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("value");
    expect(parsed.items).toEqual(["a", "b"]);
  });

  it("handles already-escaped nested JSON (no double-escaping)", () => {
    // Properly escaped — should pass through unchanged
    const valid =
      '{"payloadTemplate":"{\\"content\\":\\"hello\\",\\"type\\":\\"test\\"}","key":"val"}';
    const result = sanitizeBody(valid);
    const parsed = JSON.parse(result);
    expect(parsed.key).toBe("val");
    expect(JSON.parse(parsed.payloadTemplate)).toEqual({ content: "hello", type: "test" });
  });

  it("preserves valid JSON with special characters in values", () => {
    const input = '{"url":"https://example.com/path?a=1&b=2","desc":"line1\\nline2"}';
    expect(sanitizeBody(input)).toBe(input);
  });

  it("repairs body with unescaped quote in a simple string value", () => {
    // "name":"John "Johnny" Doe" — unescaped nickname quotes
    const broken = '{"name":"John "Johnny" Doe","age":30}';
    const result = sanitizeBody(broken);
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('John "Johnny" Doe');
    expect(parsed.age).toBe(30);
  });

  it("falls back to compacted string when repair fails completely", () => {
    // Totally garbled — not even close to JSON
    const garbled = "this is not json at all {{{ }}";
    const result = sanitizeBody(garbled);
    // Should at least return something without throwing
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles empty string body", () => {
    expect(sanitizeBody("")).toBe("{}");
    expect(sanitizeBody("{}")).toBe("{}");
  });
});
