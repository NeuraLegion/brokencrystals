import { describe, expect, it } from "vitest";
import { parseValidationError, tryFixScanConfig } from "../phases/scan.js";

describe("parseValidationError", () => {
  it("parses NestJS class-validator JSON response", () => {
    const body = JSON.stringify({
      statusCode: 400,
      message: ["entryPointIds should not be empty", "tests must contain at least 1 element"],
      error: "Bad Request",
    });
    const result = parseValidationError(body);
    expect(result.fieldErrors).toContain("entryPointIds should not be empty");
    expect(result.fieldErrors).toContain("tests must contain at least 1 element");
    expect(result.summary).toContain("entryPointIds");
  });

  it("extracts invalid entrypoint IDs from error message", () => {
    const body = JSON.stringify({
      message: ["entryPointIds: invalid ID abcdefghijklmnopqrstuv found"],
      error: "Bad Request",
    });
    const result = parseValidationError(body);
    expect(result.invalidEntrypoints).toContain("abcdefghijklmnopqrstuv");
  });

  it("handles generic text error (non-JSON)", () => {
    const text = "One or more validation errors occurred.";
    const result = parseValidationError(text);
    expect(result.summary).toBe(text);
    expect(result.fieldErrors).toHaveLength(0);
    expect(result.invalidEntrypoints).toHaveLength(0);
  });

  it("handles errors with nested 'errors' array", () => {
    const body = JSON.stringify({
      message: "Validation failed",
      errors: [
        {
          property: "attackParamLocations",
          constraints: { isIn: "each value in attackParamLocations must be valid" },
        },
      ],
    });
    const result = parseValidationError(body);
    expect(result.fieldErrors.some((f) => f.includes("attackParamLocations"))).toBe(true);
  });

  it("filters out generic 'One or more' message from fieldErrors", () => {
    const body = JSON.stringify({
      message: ["One or more validation errors occurred.", "tests is invalid"],
      error: "Bad Request",
    });
    const result = parseValidationError(body);
    expect(result.fieldErrors).not.toContain("One or more validation errors occurred.");
    expect(result.fieldErrors).toContain("tests is invalid");
  });
});

describe("tryFixScanConfig", () => {
  it("removes mutually exclusive tests", () => {
    const errorText = 'The "lrrl" test is mutually exclusive with other tests in the scan.';
    const tests = ["xss", "sqli", "lrrl", "csrf"];
    const fixed = tryFixScanConfig(errorText, tests);
    expect(fixed).not.toBeNull();
    expect(fixed).not.toContain("lrrl");
    expect(fixed).toContain("xss");
    expect(fixed).toContain("sqli");
    expect(fixed).toContain("csrf");
  });

  it("removes broken_access_control for multi-auth errors", () => {
    const errorText = "Cannot use multiple auth attack tests in a single scan";
    const tests = ["xss", "broken_access_control", "csrf"];
    const fixed = tryFixScanConfig(errorText, tests);
    expect(fixed).not.toBeNull();
    expect(fixed).not.toContain("broken_access_control");
    expect(fixed).toContain("xss");
  });

  it("handles custom auth objects error", () => {
    const errorText = "Scan requires custom auth objects to be configured";
    const tests = ["broken_access_control", "sqli"];
    const fixed = tryFixScanConfig(errorText, tests);
    expect(fixed).toEqual(["sqli"]);
  });

  it("returns null for unrecognized errors", () => {
    const errorText = "Something completely unexpected happened";
    const tests = ["xss", "sqli"];
    const fixed = tryFixScanConfig(errorText, tests);
    expect(fixed).toBeNull();
  });

  it("returns null if removing tests would leave empty array", () => {
    const errorText = 'The "lrrl" test is mutually exclusive with other tests';
    const tests = ["lrrl"];
    const fixed = tryFixScanConfig(errorText, tests);
    // Can't remove the only test
    expect(fixed).toBeNull();
  });
});
