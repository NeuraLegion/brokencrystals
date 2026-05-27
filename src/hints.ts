// ---------------------------------------------------------------------------
// HintStore — typed bucket for cross-phase hints.
//
// Phases used to thread plain `string[]` arrays around (`authHints`,
// `startupHints`, `postStartSetupHints`) and tag entries with ad-hoc
// `[stage]` prefixes. Three near-identical helpers existed (`addHint` in
// orchestrator, `addAuthHint` in auth, and the unified-tools onHint
// callback), each with subtly different dedup/length-cap rules.
//
// HintStore replaces all that with a single `Map<Stage, string[]>` plus:
//   • a stable Stage taxonomy the LLM tool surface can enumerate
//   • a single dedup/normalization pass (substring-aware)
//   • a single format() that produces the prompt-friendly block
//   • a legacy-array bridge so callers that still want a flat list (or
//     consumers that still parse `[tag] body` strings) keep working
// ---------------------------------------------------------------------------

/**
 * Stage taxonomy. Mirrors the orchestrator's progress phases plus a few
 * cross-cutting "fact" buckets (`discovery`, `credentials`, `infra`) for
 * hints whose origin is one phase but whose audience is everyone.
 */
export type Stage =
  | "startup"
  | "setup"
  | "scan_prep"
  | "auth"
  | "entrypoints"
  | "test_selection"
  | "scan"
  | "fix"
  | "discovery"
  | "credentials"
  | "infra";

export const ALL_STAGES: readonly Stage[] = [
  "startup",
  "setup",
  "scan_prep",
  "auth",
  "entrypoints",
  "test_selection",
  "scan",
  "fix",
  "discovery",
  "credentials",
  "infra",
] as const;

const STAGE_SET = new Set<Stage>(ALL_STAGES);

export function isStage(value: unknown): value is Stage {
  return typeof value === "string" && STAGE_SET.has(value as Stage);
}

/**
 * Optional human-readable descriptions surfaced to the LLM via the
 * save_hint tool description so it knows which bucket to pick.
 */
export const STAGE_DESCRIPTIONS: Record<Stage, string> = {
  startup: "Building/booting the application — Dockerfile, compose, ports, build commands.",
  setup: "First-run application setup — admin user creation, schema bootstrap, post-start init.",
  scan_prep: "Pre-scan tweaks — relaxing rate limits, disabling 2FA, raising throttle ceilings.",
  auth: "Auth detection and configuration — login endpoints, token shape, OAuth flow specifics.",
  entrypoints: "Endpoint registration with Bright — discovered routes, parameter shapes.",
  test_selection: "Per-endpoint security test choices.",
  scan: "Active DAST scan execution.",
  fix: "Vulnerability remediation patches.",
  discovery: "Cross-cutting facts about the app/stack — tech stack, services, ports.",
  credentials: "Test user / API key / OAuth client credentials reusable across phases.",
  infra: "Infrastructure repair instructions — env vars to set, packages to install, image to swap.",
};

const HINT_MAX_LENGTH = 900;

function compactHint(text: string, max = HINT_MAX_LENGTH): string {
  return text.replace(/\s+/g, " ").trim().slice(0, max);
}

/** Substring-aware dedup: returns true if `a` already covers `b` or vice versa. */
function isDuplicate(a: string, b: string): boolean {
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Parse a legacy hint string of the shape `[stage-ish] body` into its stage
 * and body. Falls back to `discovery` when the tag is missing or unknown.
 *
 * Recognized prefixes (case-insensitive, kebab/snake):
 *   [auth-*], [scan-prep-*], [setup-*], [scan-*], [fix-*], [startup-*],
 *   [discovery], [discovery-*], [setup-credentials], [auth-infra-*],
 *   [scan-prep-warning], etc.
 *
 * Any prefix that doesn't map cleanly is treated as `discovery` and the
 * full original string is preserved as the body.
 */
export function parseLegacyHint(line: string): { stage: Stage; text: string } {
  const m = line.match(/^\s*\[([a-z][a-z0-9_-]*)\]\s*(.*)$/i);
  if (!m) return { stage: "discovery", text: compactHint(line) };
  const tag = m[1].toLowerCase();
  const body = m[2];

  // Map tag prefixes to stages
  const map: Array<[RegExp, Stage]> = [
    [/^auth-infra/, "infra"],
    [/^auth/, "auth"],
    [/^scan-prep/, "scan_prep"],
    [/^scan/, "scan"],
    [/^setup-credentials/, "credentials"],
    [/^setup-infra/, "infra"],
    [/^setup/, "setup"],
    [/^startup/, "startup"],
    [/^entrypoints?/, "entrypoints"],
    [/^test-selection/, "test_selection"],
    [/^fix/, "fix"],
    [/^infra/, "infra"],
    [/^credentials/, "credentials"],
    [/^discovery/, "discovery"],
  ];
  for (const [re, stage] of map) {
    if (re.test(tag)) return { stage, text: compactHint(body || line) };
  }
  return { stage: "discovery", text: compactHint(line) };
}

/**
 * Typed bucket for hints. Buckets are kept in insertion order; iteration
 * follows the canonical ALL_STAGES order so the LLM-facing format is
 * deterministic regardless of insertion order.
 */
export class HintStore {
  private readonly buckets: Map<Stage, string[]> = new Map();

  /** Add a hint to a stage bucket. Returns true if stored, false if a duplicate. */
  add(stage: Stage, text: string): boolean {
    const compact = compactHint(text);
    if (!compact) return false;
    const bucket = this.buckets.get(stage) ?? [];
    if (bucket.some((existing) => isDuplicate(existing, compact))) return false;
    bucket.push(compact);
    this.buckets.set(stage, bucket);
    return true;
  }

  /** Remove a hint from a stage by exact text or distinctive substring. */
  remove(stage: Stage, needle: string): boolean {
    const bucket = this.buckets.get(stage);
    if (!bucket || bucket.length === 0) return false;
    const compact = compactHint(needle);
    if (!compact) return false;
    const idx = bucket.findIndex((existing) => isDuplicate(existing, compact));
    if (idx === -1) return false;
    bucket.splice(idx, 1);
    if (bucket.length === 0) this.buckets.delete(stage);
    return true;
  }

  /** True if there's at least one hint in the requested stage. */
  has(stage: Stage): boolean {
    const b = this.buckets.get(stage);
    return !!b && b.length > 0;
  }

  /** Hint count: total when no stage given, per-stage when given. */
  count(stage?: Stage): number {
    if (stage) return this.buckets.get(stage)?.length ?? 0;
    let total = 0;
    for (const b of this.buckets.values()) total += b.length;
    return total;
  }

  /** Stages that currently hold at least one hint, in canonical order. */
  stages(): Stage[] {
    return ALL_STAGES.filter((s) => this.has(s));
  }

  /**
   * Read hints. When `stages` is provided, only those buckets are returned.
   * Otherwise every non-empty bucket is returned. Order follows ALL_STAGES.
   */
  get(stages?: Iterable<Stage>): Array<{ stage: Stage; text: string }> {
    const filter = stages ? new Set([...stages]) : null;
    const out: Array<{ stage: Stage; text: string }> = [];
    for (const stage of ALL_STAGES) {
      if (filter && !filter.has(stage)) continue;
      const bucket = this.buckets.get(stage);
      if (!bucket) continue;
      for (const text of bucket) out.push({ stage, text });
    }
    return out;
  }

  /**
   * Format hints as a prompt block. Empty if no hints match. The block is
   * grouped by stage so the LLM sees the same structure on every prompt.
   *
   * Example:
   *
   *   ## Saved hints
   *   ### auth
   *   - [#1] OAuth2 token endpoint: …
   *   ### scan_prep
   *   - [#1] Rate limiting was relaxed in the NestJS guard …
   */
  format(stages?: Iterable<Stage>, heading = "## Saved hints"): string {
    const filter = stages ? new Set([...stages]) : null;
    const sections: string[] = [];
    for (const stage of ALL_STAGES) {
      if (filter && !filter.has(stage)) continue;
      const bucket = this.buckets.get(stage);
      if (!bucket || bucket.length === 0) continue;
      const lines = bucket.map((h, i) => `- [#${i + 1}] ${h}`);
      sections.push(`### ${stage}\n${lines.join("\n")}`);
    }
    if (sections.length === 0) return "";
    return `${heading}\n${sections.join("\n\n")}`;
  }

  /**
   * Flat list of `[stage] body` strings. Lets call sites that still expect
   * the legacy shape (e.g. third-party prompt builders) keep working.
   */
  toLegacyArray(stages?: Iterable<Stage>): string[] {
    return this.get(stages).map(({ stage, text }) => `[${stage}] ${text}`);
  }

  /** Build a HintStore from the legacy `[tag] body` flat-array format. */
  static fromLegacyArray(lines: string[]): HintStore {
    const store = new HintStore();
    for (const line of lines) {
      const { stage, text } = parseLegacyHint(line);
      store.add(stage, text);
    }
    return store;
  }
}
