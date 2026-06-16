import { describe, it, expect } from "vitest";
import { extractCrashError } from "../phases/startup.js";

describe("extractCrashError", () => {
  it("returns empty string for empty logs", () => {
    expect(extractCrashError("")).toBe("");
  });

  it("returns empty when there is no error signature", () => {
    const logs = [
      "Server starting",
      "Routes mapped",
      "Listening on 3000",
    ].join("\n");
    expect(extractCrashError(logs)).toBe("");
  });

  it("extracts a Fastify crash block with following stack frames", () => {
    const logs = [
      "[Nest] InstanceLoader AppModule dependencies initialized",
      "[Nest] RouterExplorer Mapped {/api/users, GET} route",
      'FastifyError [Error]: Cannot call "addContentTypeParser" when fastify instance is already started!',
      "    at Object.addContentTypeParser (/usr/src/app/node_modules/fastify/lib/contentTypeParser.js:330:11)",
      "    at FastifyAdapter.useBodyParser (/usr/src/app/node_modules/@nestjs/platform-fastify/adapters/fastify-adapter.js:296:28)",
      "  code: 'FST_ERR_CTP_INSTANCE_ALREADY_STARTED',",
    ].join("\n");
    const out = extractCrashError(logs);
    expect(out).toContain("FST_ERR_CTP_INSTANCE_ALREADY_STARTED");
    // It should not start with the routine boot lines
    expect(out.startsWith("[Nest] InstanceLoader")).toBe(false);
  });

  it("captures the most recent error block when multiple exist", () => {
    const logs = [
      "Error: first transient error",
      "    at foo (a.js:1:1)",
      "recovered, retrying",
      "ReferenceError: x is not defined",
      "    at bar (b.js:2:2)",
    ].join("\n");
    const out = extractCrashError(logs);
    expect(out).toContain("ReferenceError: x is not defined");
  });

  it("detects common node runtime errors", () => {
    const logs = [
      "booting",
      "Error: connect ECONNREFUSED 127.0.0.1:5432",
      "    at TCPConnectWrap.afterConnect",
    ].join("\n");
    const out = extractCrashError(logs);
    expect(out).toContain("ECONNREFUSED");
  });
});
