import { describe, it, expect } from "vitest";
import { extractParamsFromCode } from "../phases/analyze.js";
import type { DiscoveredEndpoint } from "../types.js";

const ep = (filePath: string): DiscoveredEndpoint => ({
  method: "GET",
  path: "/api/file",
  filePath,
});

describe("extractParamsFromCode — NestJS @Query", () => {
  it("extracts named @Query decorators (single quotes)", () => {
    const code = `
      @Get()
      async getFile(@Query('path') path: string, @Query('type') contentType: string) {
        return this.fileService.getFile(path);
      }
    `;
    const result = extractParamsFromCode(code, ep("src/file/file.controller.ts"));
    const names = result?.queryParams?.map((q) => q.name).sort();
    expect(names).toEqual(["path", "type"]);
  });

  it("extracts @Query with double and backtick quotes", () => {
    const code = `
      foo(@Query("a") a, @Query(\`b\`) b) {}
    `;
    const names = extractParamsFromCode(code, ep("c.ts"))?.queryParams?.map((q) => q.name).sort();
    expect(names).toEqual(["a", "b"]);
  });

  it("still extracts Express-style req.query params", () => {
    const code = `app.get('/x', (req, res) => { const p = req.query.path; const t = req.query["type"]; });`;
    const names = extractParamsFromCode(code, ep("routes.js"))?.queryParams?.map((q) => q.name).sort();
    expect(names).toEqual(["path", "type"]);
  });

  it("merges and dedups Express + NestJS params", () => {
    const code = `
      const p = req.query.path;
      @Query('path') @Query('extra')
    `;
    const names = extractParamsFromCode(code, ep("m.ts"))?.queryParams?.map((q) => q.name).sort();
    expect(names).toEqual(["extra", "path"]);
  });

  it("returns null when no query params are present", () => {
    const code = `@Post() create(@Body() dto: CreateDto) {}`;
    expect(extractParamsFromCode(code, ep("p.ts"))).toBeNull();
  });
});
