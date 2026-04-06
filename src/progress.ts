import type { PlatformClient } from "@github/copilot-engine-sdk";

export class ProgressReporter {
  private turn = 0;
  private steps: Array<{ title: string; status: "done" | "working" | "pending" }> = [];
  private platform: PlatformClient;

  constructor(platform: PlatformClient) {
    this.platform = platform;
  }

  async phaseStart(phase: string, description: string): Promise<void> {
    // Mark previous working step as done
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }
    this.steps.push({ title: description, status: "working" });

    await this.platform.sendAssistantMessage({
      turn: this.turn++,
      callId: `phase-${phase}`,
      content: description,
      toolCalls: [],
    });
    await this.updatePrDescription();
  }

  async phaseDetail(phase: string, toolName: string, detail: string): Promise<void> {
    await this.platform.sendToolExecution({
      turn: this.turn,
      callId: `phase-${phase}`,
      toolCallId: `${phase}-${toolName}-${Date.now()}`,
      toolName,
      result: detail,
      success: true,
    });
  }

  async phaseError(phase: string, error: string): Promise<void> {
    for (const step of this.steps) {
      if (step.status === "working") step.status = "done";
    }
    await this.platform.sendAssistantMessage({
      turn: this.turn++,
      callId: `phase-${phase}-error`,
      content: `Error in ${phase}: ${error}`,
      toolCalls: [],
    });
  }

  private async updatePrDescription(): Promise<void> {
    const checklist = this.steps
      .map((s) => {
        const icon = s.status === "done" ? "[x]" : s.status === "working" ? "[-]" : "[ ]";
        return `- ${icon} ${s.title}`;
      })
      .join("\n");

    await this.platform.sendReportProgress({
      prDescription: `## Bright Security Scan Progress\n\n${checklist}`,
    });
  }
}
