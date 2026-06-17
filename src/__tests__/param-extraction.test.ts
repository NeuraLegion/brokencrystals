import { describe, expect, it } from "vitest";
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
    const names = extractParamsFromCode(code, ep("c.ts"))
      ?.queryParams?.map((q) => q.name)
      .sort();
    expect(names).toEqual(["a", "b"]);
  });

  it("still extracts Express-style req.query params", () => {
    const code = `app.get('/x', (req, res) => { const p = req.query.path; const t = req.query["type"]; });`;
    const names = extractParamsFromCode(code, ep("routes.js"))
      ?.queryParams?.map((q) => q.name)
      .sort();
    expect(names).toEqual(["path", "type"]);
  });

  it("merges and dedups Express + NestJS params", () => {
    const code = `
      const p = req.query.path;
      @Query('path') @Query('extra')
    `;
    const names = extractParamsFromCode(code, ep("m.ts"))
      ?.queryParams?.map((q) => q.name)
      .sort();
    expect(names).toEqual(["extra", "path"]);
  });

  it("returns null when no query params are present", () => {
    const code = `@Post() create(@Body() dto: CreateDto) {}`;
    expect(extractParamsFromCode(code, ep("p.ts"))).toBeNull();
  });

  it("seeds query params from @ApiQuery example values (multi-line)", () => {
    const code = `
      @Get()
      @ApiQuery({
        name: 'path',
        example: 'config/products/crystals/amethyst.jpg',
        required: true
      })
      @ApiQuery({ name: 'type', example: 'image/jpg', required: true })
      async loadFile(@Query('path') path: string, @Query('type') type: string) {}
    `;
    const r = extractParamsFromCode(code, ep("src/file/file.controller.ts"));
    const byName = Object.fromEntries((r?.queryParams ?? []).map((q) => [q.name, q.value]));
    expect(byName.path).toBe("config/products/crystals/amethyst.jpg");
    expect(byName.type).toBe("image/jpg");
  });

  it("falls back to 'test' when a param has no @ApiQuery example", () => {
    const code = `foo(@Query('path') path: string) {}`;
    const r = extractParamsFromCode(code, ep("c.ts"));
    expect(r?.queryParams?.[0]).toEqual({ name: "path", value: "test" });
  });
});
