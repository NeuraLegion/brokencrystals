import { describe, it, expect } from "vitest";
import { writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  parseSarif,
  buildVerdicts,
  summarizeResults,
  toValidationSummaryRows,
  type SarifFinding,
  type MappedFinding,
} from "../phases/validation.js";
import type { Finding } from "../types.js";

function writeSarif(obj: unknown): string {
  const path = join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}.sarif`);
  writeFileSync(path, JSON.stringify(obj), "utf-8");
  return path;
}

describe("parseSarif", () => {
  it("maps known CodeQL rules to Bright tests", () => {
    const path = writeSarif({
      runs: [
        {
          results: [
            {
              ruleId: "js/sql-injection",
              message: { text: "SQLi via req.query" },
              locations: [
                {
                  physicalLocation: {
                    artifactLocation: { uri: "src/routes/user.js" },
                    region: { startLine: 42 },
                  },
                },
              ],
            },
          ],
        },
      ],
    });
    try {
      const findings = parseSarif(path);
      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe("js/sql-injection");
      expect(findings[0].brightTest).toBe("sqli");
      expect(findings[0].file).toBe("src/routes/user.js");
      expect(findings[0].startLine).toBe(42);
    } finally {
      rmSync(path);
    }
  });

  it("marks unmappable rules with null brightTest (N/A)", () => {
    const path = writeSarif({
      runs: [
        {
          results: [
            {
              ruleId: "js/unused-local-variable",
              message: { text: "Unused variable" },
              locations: [
                { physicalLocation: { artifactLocation: { uri: "a.js" }, region: { startLine: 1 } } },
              ],
            },
          ],
        },
      ],
    });
    try {
      const findings = parseSarif(path);
      expect(findings[0].brightTest).toBeNull();
    } finally {
      rmSync(path);
    }
  });

  it("handles empty runs gracefully", () => {
    const path = writeSarif({ runs: [] });
    try {
      expect(parseSarif(path)).toEqual([]);
    } finally {
      rmSync(path);
    }
  });

  it("extracts severity from security-severity (CVSS) and rule name", () => {
    const path = writeSarif({
      runs: [
        {
          tool: {
            driver: {
              rules: [
                {
                  id: "js/sql-injection",
                  name: "Database query built from user-controlled sources",
                  properties: { "security-severity": "9.8" },
                },
              ],
            },
          },
          results: [
            {
              ruleId: "js/sql-injection",
              message: { text: "SQLi" },
              locations: [{ physicalLocation: { artifactLocation: { uri: "a.js" }, region: { startLine: 5 } } }],
            },
          ],
        },
      ],
    });
    try {
      const f = parseSarif(path)[0];
      expect(f.severity).toBe("Critical");
      expect(f.name).toBe("Database query built from user-controlled sources");
    } finally {
      rmSync(path);
    }
  });

  it("humanizes the rule id when no rule metadata name is present", () => {
    const path = writeSarif({
      runs: [
        {
          results: [
            {
              ruleId: "js/reflected-xss",
              message: { text: "x" },
              level: "warning",
              locations: [{ physicalLocation: { artifactLocation: { uri: "a.js" }, region: { startLine: 1 } } }],
            },
          ],
        },
      ],
    });
    try {
      const f = parseSarif(path)[0];
      expect(f.name).toBe("Reflected Xss");
      expect(f.severity).toBe("Medium"); // from level: warning
    } finally {
      rmSync(path);
    }
  });
});

describe("toValidationSummaryRows", () => {
  it("maps results to PR table rows", () => {
    const finding: SarifFinding = {
      ruleId: "js/sql-injection",
      name: "SQL Injection",
      message: "",
      file: "src/x.js",
      startLine: 7,
      severity: "High",
      brightTest: "sqli",
    };
    const rows = toValidationSummaryRows([
      { finding, verdict: "validated", detail: "" },
    ]);
    expect(rows[0]).toEqual({
      severity: "High",
      name: "SQL Injection",
      rule: "js/sql-injection",
      location: "src/x.js:7",
      verdict: "validated",
    });
  });
});


describe("buildVerdicts", () => {
  const sqliFinding: SarifFinding = {
    ruleId: "js/sql-injection",
    name: "SQL Injection",
    message: "SQLi",
    file: "src/routes/user.js",
    startLine: 10,
    severity: "High",
    brightTest: "sqli",
  };
  const naFinding: SarifFinding = {
    ruleId: "js/unused-local-variable",
    name: "Unused Local Variable",
    message: "unused",
    file: "a.js",
    startLine: 1,
    severity: "Low",
    brightTest: null,
  };

  it("returns N/A for findings with no DAST equivalent", () => {
    const results = buildVerdicts([naFinding], [], []);
    expect(results[0].verdict).toBe("n/a");
  });

  it("returns validated when Bright confirms the test on a mapped endpoint", () => {
    const mapped: MappedFinding[] = [{ finding: sqliFinding, entrypointIds: ["ep-1"] }];
    const brightFindings: Finding[] = [
      {
        id: "1",
        name: "SQL Injection",
        severity: "High",
        url: "http://localhost/api/users/1",
        method: "GET",
        details: "",
        remedy: "",
        entrypointId: "ep-1",
        testTag: "sqli",
        issueId: "1",
      },
    ];
    const results = buildVerdicts([sqliFinding], mapped, brightFindings);
    expect(results[0].verdict).toBe("validated");
  });

  it("returns not-validated when Bright finds nothing matching", () => {
    const mapped: MappedFinding[] = [{ finding: sqliFinding, entrypointIds: ["ep-1"] }];
    const results = buildVerdicts([sqliFinding], mapped, []);
    expect(results[0].verdict).toBe("not-validated");
  });

  it("does not match a Bright finding on a different endpoint", () => {
    const mapped: MappedFinding[] = [{ finding: sqliFinding, entrypointIds: ["ep-1"] }];
    const brightFindings: Finding[] = [
      {
        id: "1",
        name: "SQL Injection",
        severity: "High",
        url: "http://localhost/other",
        method: "GET",
        details: "",
        remedy: "",
        entrypointId: "ep-99",
        testTag: "sqli",
        issueId: "1",
      },
    ];
    const results = buildVerdicts([sqliFinding], mapped, brightFindings);
    expect(results[0].verdict).toBe("not-validated");
  });

  it("marks unreachable (dead code) findings as not-validated without scanning", () => {
    const mapped: MappedFinding[] = [
      { finding: sqliFinding, entrypointIds: [], unreachable: true },
    ];
    const results = buildVerdicts([sqliFinding], mapped, []);
    expect(results[0].verdict).toBe("not-validated");
    expect(results[0].detail).toMatch(/not reachable|dead/i);
  });

  it("marks inconclusive (empty mapping, not flagged dead) findings as not-validated", () => {
    const mapped: MappedFinding[] = [
      { finding: sqliFinding, entrypointIds: [], unreachable: false },
    ];
    const results = buildVerdicts([sqliFinding], mapped, []);
    expect(results[0].verdict).toBe("not-validated");
    expect(results[0].detail).toMatch(/could not trace/i);
  });

  it("does not validate from an unrelated endpoint when mapping is empty", () => {
    // A finding with no mapped endpoint must NOT be validated by a same-class
    // finding on a different endpoint (no broad-scan false positives).
    const mapped: MappedFinding[] = [
      { finding: sqliFinding, entrypointIds: [], unreachable: false },
    ];
    const brightFindings: Finding[] = [
      {
        id: "1",
        name: "SQL Injection",
        severity: "High",
        url: "http://localhost/unrelated",
        method: "GET",
        details: "",
        remedy: "",
        entrypointId: "ep-other",
        testTag: "sqli",
        issueId: "1",
      },
    ];
    const results = buildVerdicts([sqliFinding], mapped, brightFindings);
    expect(results[0].verdict).toBe("not-validated");
  });
});

describe("summarizeResults", () => {
  it("groups results by verdict", () => {
    const results = [
      { finding: {} as SarifFinding, verdict: "validated" as const, detail: "" },
      { finding: {} as SarifFinding, verdict: "not-validated" as const, detail: "" },
      { finding: {} as SarifFinding, verdict: "n/a" as const, detail: "" },
      { finding: {} as SarifFinding, verdict: "validated" as const, detail: "" },
    ];
    const { validated, notValidated, notApplicable } = summarizeResults(results);
    expect(validated).toHaveLength(2);
    expect(notValidated).toHaveLength(1);
    expect(notApplicable).toHaveLength(1);
  });
});
