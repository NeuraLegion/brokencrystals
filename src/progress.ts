import type { Platform } from "./platform.js";

interface Step {
  /** Logical phase key — repeated phaseStart calls with the same key merge into one step. */
  phase: string;
  title: string;
  status: "done" | "working" | "pending";
  details: string[];
  /** Keyed details that update in-place instead of appending (key → detail text). */
  keyedDetails: Map<string, string>;
  /** Number of times this phase has been (re)started. */
  attempts: number;
}

/**
 * Condense a verbose detail line for the final "step done" view: keep the
 * first sentence, cap at ~180 chars, drop trailing whitespace/period chains.
 */
function condenseDetail(detail: string): string {
  const trimmed = detail.trim();
  if (trimmed.length <= 180) return trimmed;
  // Prefer first sentence break if it lands within a reasonable window.
  const sentenceEnd = trimmed.search(/\.\s/);
  if (sentenceEnd > 40 && sentenceEnd < 180) {
    return trimmed.slice(0, sentenceEnd + 1);
  }
  return trimmed.slice(0, 177).trimEnd() + "…";
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
    // Mark all previously working steps as done before starting/resuming a phase.
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }

    // If this phase already exists, resume it in place: bump attempts, reset
    // its detail buffer for the new attempt, and move it to the bottom so
    // the live "currently working" step is always the last one rendered.
    const existingIdx = this.steps.findIndex((s) => s.phase === phase);
    if (existingIdx >= 0) {
      const existing = this.steps[existingIdx];
      existing.status = "working";
      existing.title = description;
      existing.attempts += 1;
      existing.details = [];
      existing.keyedDetails.clear();
      this.steps.splice(existingIdx, 1);
      this.steps.push(existing);
    } else {
      this.steps.push({
        phase,
        title: description,
        status: "working",
        details: [],
        keyedDetails: new Map(),
        attempts: 1,
      });
    }

    await this.platform.reportPhase(phase, description, this.turn++);
    await this.updatePrDescription();
  }

  async phaseDetail(
    phase: string,
    toolName: string,
    detail: string,
  ): Promise<void> {
    // Route the detail to the step matching `phase` (even if it's already
    // done — late "result" lines should still update the step's last-detail
    // summary). Fall back to the current working step if no match.
    const target =
      this.steps.findLast((s) => s.phase === phase) ??
      this.steps.findLast((s) => s.status === "working");
    if (target) {
      target.details.push(detail);
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
      const suffix = s.attempts > 1 ? `  _(${s.attempts} attempts)_` : "";
      lines.push(`${icon} **${s.title}**${suffix}`);

      if (s.status === "working") {
        // Live view: show every detail so users can see progress as it happens.
        for (const d of s.details) {
          lines.push(`   - ${d}`);
        }
        for (const d of s.keyedDetails.values()) {
          lines.push(`   - ${d}`);
        }
      } else if (s.status === "done") {
        // Collapsed view: show only the latest "result" line, condensed.
        const last = s.details[s.details.length - 1];
        if (last) {
          lines.push(`   - ${condenseDetail(last)}`);
        }
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
