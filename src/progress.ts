import type { Platform } from "./platform.js";

export class ProgressReporter {
  private turn = 0;
  private steps: Array<{ title: string; status: "done" | "working" | "pending" }> = [];
  private platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async phaseStart(phase: string, description: string): Promise<void> {
    // Mark previous working step as done
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }
    this.steps.push({ title: description, status: "working" });

    await this.platform.reportPhase(phase, description, this.turn++);
    await this.updatePrDescription();
  }

  async phaseDetail(phase: string, toolName: string, detail: string): Promise<void> {
    await this.platform.reportDetail(phase, toolName, detail, this.turn);
  }

  async phaseError(phase: string, error: string): Promise<void> {
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }
    await this.platform.reportError(`Error in ${phase}: ${error}`);
  }

  private async updatePrDescription(): Promise<void> {
    const checklist = this.steps
      .map((s) => {
        const icon = s.status === "done" ? "[x]" : s.status === "working" ? "[-]" : "[ ]";
        return `- ${icon} ${s.title}`;
      })
      .join("\n");

    await this.platform.reportPrDescription(
      `## Bright Security Scan Progress\n\n${checklist}`,
    );
  }
}
