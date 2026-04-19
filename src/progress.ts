import type { Platform } from "./platform.js";

interface Step {
  title: string;
  status: "done" | "working" | "pending";
  details: string[];
  /** Keyed details that update in-place instead of appending (key → detail text). */
  keyedDetails: Map<string, string>;
}

export interface FindingSummary {
  name: string;
  severity: string;
  url: string;
  method: string;
  status: "Fixed" | "Open";
}

export class ProgressReporter {
  private turn = 0;
  private steps: Step[] = [];
  private platform: Platform;
  private findingsSummary: FindingSummary[] = [];

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async phaseStart(phase: string, description: string): Promise<void> {
    // Mark previous working step as done
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }
    this.steps.push({
      title: description,
      status: "working",
      details: [],
      keyedDetails: new Map(),
    });

    await this.platform.reportPhase(phase, description, this.turn++);
    await this.updatePrDescription();
  }

  async phaseDetail(
    phase: string,
    toolName: string,
    detail: string,
  ): Promise<void> {
    // Append detail to the current working step
    const current = this.steps.findLast((s) => s.status === "working");
    if (current) {
      current.details.push(detail);
    }

    await this.platform.reportDetail(phase, toolName, detail, this.turn);
    await this.updatePrDescription();
  }

  /**
   * Update a keyed detail in-place. If a detail with the same key exists,
   * it is replaced rather than appended. Use this for poll-style updates
   * (e.g. scan status) that would otherwise flood the PR description.
   */
  async phaseUpdateDetail(
    phase: string,
    key: string,
    detail: string,
  ): Promise<void> {
    const current = this.steps.findLast((s) => s.status === "working");
    if (current) {
      current.keyedDetails.set(key, detail);
    }
    await this.updatePrDescription();
  }

  async phaseError(phase: string, error: string): Promise<void> {
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }
    await this.platform.reportError(`Error in ${phase}: ${error}`);
    await this.updatePrDescription();
  }

  /**
   * Set the final findings summary table. Call this before the final "done"
   * phase so the table appears at the bottom of the PR.
   */
  setFindingsSummary(findings: FindingSummary[]): void {
    this.findingsSummary = findings;
  }

  async updatePrDescription(): Promise<void> {
    const lines: string[] = [];

    for (const s of this.steps) {
      const icon =
        s.status === "done" ? "✅" : s.status === "working" ? "🔄" : "⬜";
      lines.push(`${icon} **${s.title}**`);
      for (const d of s.details) {
        lines.push(`   - ${d}`);
      }
      for (const d of s.keyedDetails.values()) {
        lines.push(`   - ${d}`);
      }
    }

    // Append findings table if available
    if (this.findingsSummary.length > 0) {
      lines.push("");
      lines.push("### Findings");
      lines.push("");
      lines.push("| Severity | Vulnerability | Endpoint | Status |");
      lines.push("|----------|--------------|----------|--------|");
      for (const f of this.findingsSummary) {
        const icon = f.status === "Fixed" ? "✅" : "🔴";
        lines.push(
          `| ${f.severity} | ${f.name} | \`${f.method} ${f.url}\` | ${icon} ${f.status} |`,
        );
      }
    }

    await this.platform.reportPrDescription(
      `## 🛡️ Bright Security Scan\n\n${lines.join("\n")}`,
    );
  }
}
