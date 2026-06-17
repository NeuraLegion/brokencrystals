import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  BRIGHT_STAR_VERSION,
  type BrightStar,
  brightStarPath,
  parseBrightStar,
  readBrightStar,
  renderBrightStar,
  writeBrightStar,
} from "../brightstar.js";

const sample: BrightStar = {
  version: BRIGHT_STAR_VERSION,
  generatedAt: "2026-06-16T12:00:00.000Z",
  repo: "NeuraLegion/brokencrystals",
  techStack: { languages: ["TypeScript"], frameworks: ["NestJS"], databases: ["PostgreSQL"] },
  startup: {
    command: "docker compose up -d --build",
    port: 3000,
    docker: true,
    prerequisites: ["docker compose build"],
    postStartCommands: ["npm run migrate"],
    envVars: { NODE_ENV: "production" },
    healthCheckPath: "/api/config",
    healthCheckSummary: "valid JSON config",
  },
  setup: { completed: true, credentials: { email: "bright@test.com" }, notes: ["no wizard"] },
  auth: {
    hasAuth: true,
    mechanism: "jwt",
    authObjectId: "abc123",
    authObjectJson: { id: "abc123", type: "jwt", method: "POST" },
    registration: {
      baseUrl: "http://localhost:3000",
      endpoint: "/api/auth/jwt/hmac/login",
      method: "POST",
      body: '{"user":"bright@test.com","password":"x"}',
      contentType: "application/json",
    },
    seedCommands: [{ type: "docker", command: "psql -c 'INSERT...'", container: "db-1" }],
    directAuthHeaders: { Authorization: "Bearer xxx" },
    hints: ["login field is 'user' not 'username'"],
  },
  limits: {
    scanPrepReplayCommands: [{ container: "nodejs-1", command: "rm throttle.js" }],
    notes: ["ThrottlerGuard disabled"],
  },
  endpointNotes: ["route prefix /api mounted in main.ts"],
  hints: { auth: ["seeded user is admin"], startup: ["needs postgres 16"] },
};

describe("BrightStar serialize/parse round-trip", () => {
  it("renders markdown containing human-readable sections", () => {
    const md = renderBrightStar(sample);
    expect(md).toContain("# 🌟 Bright Star");
    expect(md).toContain("## Authentication");
    expect(md).toContain("abc123");
    expect(md).toContain("docker compose up -d --build");
    expect(md).toContain("```json");
  });

  it("parses back the exact data from rendered markdown", () => {
    const md = renderBrightStar(sample);
    const parsed = parseBrightStar(md);
    expect(parsed).toEqual(sample);
  });

  it("preserves the pulled auth-object JSON", () => {
    const parsed = parseBrightStar(renderBrightStar(sample));
    expect(parsed?.auth?.authObjectJson).toEqual({ id: "abc123", type: "jwt", method: "POST" });
  });

  it("returns null for content without the data block", () => {
    expect(parseBrightStar("# just some markdown\n\nno data here")).toBeNull();
  });

  it("returns null for a different schema version", () => {
    const bumped = { ...sample, version: 999 };
    expect(parseBrightStar(renderBrightStar(bumped))).toBeNull();
  });

  it("returns null for malformed JSON in the data block", () => {
    const broken =
      "<!-- BRIGHT_STAR_DATA -->\n```json\n{ not valid json ]\n```\n<!-- BRIGHT_STAR_DATA -->";
    expect(parseBrightStar(broken)).toBeNull();
  });
});

describe("BrightStar file I/O", () => {
  it("writes and reads back from a repo directory", () => {
    const dir = mkdtempSync(join(tmpdir(), "bstar-"));
    try {
      writeBrightStar(dir, sample);
      const read = readBrightStar(dir);
      expect(read).toEqual(sample);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("readBrightStar returns null when the file is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "bstar-"));
    try {
      expect(readBrightStar(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("readBrightStar returns null for a non-BrightStar file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bstar-"));
    try {
      writeFileSync(brightStarPath(dir), "# unrelated\n", "utf-8");
      expect(readBrightStar(dir)).toBeNull();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
