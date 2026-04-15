import type OpenAI from "openai";
import { readFileSync, existsSync } from "fs";
import { resolve, extname } from "path";
import { execFileSync } from "child_process";
import { glob } from "glob";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import { chatWithTools, type ToolHandler } from "../inference.js";
import { extractJson } from "../utils.js";

// ---------------------------------------------------------------------------
// Phase 1: Deterministic tech-stack detection (zero LLM calls)
// ---------------------------------------------------------------------------

export async function detectTechStack(
  _llm: OpenAI,
  repoPath: string,
  _model?: string,
): Promise<TechStack> {
  return detectTechStackFromFiles(repoPath);
}

async function detectTechStackFromFiles(repoPath: string): Promise<TechStack> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const databases = new Set<string>();

  const has = (rel: string) => existsSync(resolve(repoPath, rel));
  const readJson = (rel: string) => {
    try {
      return JSON.parse(readFileSync(resolve(repoPath, rel), "utf-8"));
    } catch {
      return null;
    }
  };

  // ---- Node / JavaScript / TypeScript ----
  if (has("package.json")) {
    const pkg = readJson("package.json");
    const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    languages.add("JavaScript");
    if (allDeps?.typescript || has("tsconfig.json"))
      languages.add("TypeScript");
    // Frameworks
    if (allDeps?.express) frameworks.add("Express");
    if (allDeps?.fastify) frameworks.add("Fastify");
    if (allDeps?.koa) frameworks.add("Koa");
    if (allDeps?.hapi || allDeps?.["@hapi/hapi"]) frameworks.add("Hapi");
    if (allDeps?.next) frameworks.add("Next.js");
    if (allDeps?.nuxt) frameworks.add("Nuxt");
    if (allDeps?.["@nestjs/core"]) frameworks.add("NestJS");
    // Databases
    if (allDeps?.mongoose || allDeps?.mongodb) databases.add("MongoDB");
    if (allDeps?.pg || allDeps?.["pg-promise"]) databases.add("PostgreSQL");
    if (allDeps?.mysql || allDeps?.mysql2) databases.add("MySQL");
    if (allDeps?.sequelize) databases.add("SQL (Sequelize)");
    if (allDeps?.knex) databases.add("SQL (Knex)");
    if (allDeps?.redis || allDeps?.ioredis) databases.add("Redis");
    if (allDeps?.sqlite3 || allDeps?.["better-sqlite3"])
      databases.add("SQLite");
    if (allDeps?.typeorm) databases.add("SQL (TypeORM)");
    if (allDeps?.prisma || allDeps?.["@prisma/client"])
      databases.add("SQL (Prisma)");
  }

  // ---- Python ----
  if (
    has("requirements.txt") ||
    has("pyproject.toml") ||
    has("setup.py") ||
    has("Pipfile")
  ) {
    languages.add("Python");
    const readReqs = () => {
      for (const f of ["requirements.txt", "Pipfile"]) {
        try {
          return readFileSync(resolve(repoPath, f), "utf-8").toLowerCase();
        } catch {
          /* skip */
        }
      }
      try {
        return readFileSync(
          resolve(repoPath, "pyproject.toml"),
          "utf-8",
        ).toLowerCase();
      } catch {
        return "";
      }
    };
    const reqs = readReqs();
    if (reqs.includes("django")) frameworks.add("Django");
    if (reqs.includes("flask")) frameworks.add("Flask");
    if (reqs.includes("fastapi")) frameworks.add("FastAPI");
    if (reqs.includes("sqlalchemy")) databases.add("SQL (SQLAlchemy)");
    if (reqs.includes("psycopg")) databases.add("PostgreSQL");
    if (reqs.includes("pymongo")) databases.add("MongoDB");
  }

  // ---- Ruby ----
  if (has("Gemfile")) {
    languages.add("Ruby");
    try {
      const gemfile = readFileSync(
        resolve(repoPath, "Gemfile"),
        "utf-8",
      ).toLowerCase();
      if (gemfile.includes("rails")) frameworks.add("Rails");
      if (gemfile.includes("sinatra")) frameworks.add("Sinatra");
      if (gemfile.includes("pg")) databases.add("PostgreSQL");
      if (gemfile.includes("mysql")) databases.add("MySQL");
      if (gemfile.includes("mongoid")) databases.add("MongoDB");
    } catch {
      /* skip */
    }
  }

  // ---- Java / Kotlin ----
  if (has("pom.xml") || has("build.gradle") || has("build.gradle.kts")) {
    languages.add("Java");
    if (has("build.gradle.kts")) languages.add("Kotlin");
    const readBuild = () => {
      for (const f of ["pom.xml", "build.gradle", "build.gradle.kts"]) {
        try {
          return readFileSync(resolve(repoPath, f), "utf-8").toLowerCase();
        } catch {
          /* skip */
        }
      }
      return "";
    };
    const build = readBuild();
    if (build.includes("spring")) frameworks.add("Spring");
    if (build.includes("quarkus")) frameworks.add("Quarkus");
    if (build.includes("postgresql") || build.includes("postgres"))
      databases.add("PostgreSQL");
    if (build.includes("mysql")) databases.add("MySQL");
    if (build.includes("mongodb") || build.includes("mongo"))
      databases.add("MongoDB");
  }

  // ---- Go ----
  if (has("go.mod")) {
    languages.add("Go");
    try {
      const gomod = readFileSync(
        resolve(repoPath, "go.mod"),
        "utf-8",
      ).toLowerCase();
      if (gomod.includes("gin-gonic")) frameworks.add("Gin");
      if (gomod.includes("gorilla/mux")) frameworks.add("Gorilla Mux");
      if (gomod.includes("fiber")) frameworks.add("Fiber");
      if (gomod.includes("echo")) frameworks.add("Echo");
    } catch {
      /* skip */
    }
  }

  // ---- .NET / C# ----
  const csprojFiles = await glob("**/*.{csproj,sln,fsproj}", {
    cwd: repoPath,
    nodir: true,
    maxDepth: 3,
  });
  if (csprojFiles.length > 0) {
    languages.add("C#");
    for (const f of csprojFiles.slice(0, 5)) {
      try {
        const content = readFileSync(
          resolve(repoPath, f),
          "utf-8",
        ).toLowerCase();
        if (
          content.includes("microsoft.aspnetcore") ||
          content.includes("aspnet")
        )
          frameworks.add("ASP.NET");
        if (content.includes("entityframework")) databases.add("SQL (EF Core)");
        if (content.includes("npgsql")) databases.add("PostgreSQL");
        if (content.includes("umbraco")) frameworks.add("Umbraco CMS");
      } catch {
        /* skip */
      }
    }
  }

  // ---- Rust ----
  if (has("Cargo.toml")) {
    languages.add("Rust");
    try {
      const cargo = readFileSync(
        resolve(repoPath, "Cargo.toml"),
        "utf-8",
      ).toLowerCase();
      if (cargo.includes("actix")) frameworks.add("Actix");
      if (cargo.includes("axum")) frameworks.add("Axum");
      if (cargo.includes("rocket")) frameworks.add("Rocket");
    } catch {
      /* skip */
    }
  }

  // ---- PHP ----
  if (has("composer.json")) {
    languages.add("PHP");
    const pkg = readJson("composer.json");
    const allDeps = { ...pkg?.require, ...pkg?.["require-dev"] };
    if (allDeps?.["laravel/framework"]) frameworks.add("Laravel");
    if (allDeps?.["symfony/framework-bundle"]) frameworks.add("Symfony");
  }

  // ---- Docker ----
  if (
    has("docker-compose.yml") ||
    has("docker-compose.yaml") ||
    has("compose.yml") ||
    has("compose.yaml")
  ) {
    for (const f of [
      "docker-compose.yml",
      "docker-compose.yaml",
      "compose.yml",
      "compose.yaml",
    ]) {
      try {
        const content = readFileSync(
          resolve(repoPath, f),
          "utf-8",
        ).toLowerCase();
        if (content.includes("postgres")) databases.add("PostgreSQL");
        if (content.includes("mysql") || content.includes("mariadb"))
          databases.add("MySQL");
        if (content.includes("mongo")) databases.add("MongoDB");
        if (content.includes("redis")) databases.add("Redis");
      } catch {
        /* skip */
      }
    }
  }

  // ---- Extension-based fallback via glob ----
  if (languages.size === 0) {
    const extMap: Record<string, string> = {
      ".py": "Python",
      ".rb": "Ruby",
      ".go": "Go",
      ".rs": "Rust",
      ".java": "Java",
      ".kt": "Kotlin",
      ".cs": "C#",
      ".php": "PHP",
      ".ts": "TypeScript",
      ".js": "JavaScript",
    };
    const srcFiles = await glob("src/**/*", {
      cwd: repoPath,
      nodir: true,
      maxDepth: 3,
    });
    for (const f of srcFiles.slice(0, 50)) {
      const ext = extname(f);
      if (extMap[ext]) languages.add(extMap[ext]);
    }
  }

  return {
    languages: [...languages],
    frameworks: [...frameworks],
    databases: [...databases],
  };
}

// ---------------------------------------------------------------------------
// Phase 2: Discover endpoints (programmatic regex parsing, zero LLM calls)
// ---------------------------------------------------------------------------

/** Glob patterns covering controller/route files for all major frameworks */
const CONTROLLER_GLOBS = [
  // JS / TS
  "src/**/*.controller.{ts,js}",
  "src/**/routes.{ts,js}",
  "src/**/router.{ts,js}",
  "src/**/*.routes.{ts,js}",
  "app/controllers/**/*.{ts,js,rb}",
  "controllers/**/*.{ts,js}",
  "routes/**/*.{ts,js}",
  "api/**/*.{ts,js}",
  // .NET / C#
  "**/*Controller.cs",
  "**/*ApiController.cs",
  "**/Controllers/**/*.cs",
  // Java / Kotlin
  "**/*Controller.java",
  "**/*Controller.kt",
  "**/controller/**/*.java",
  "**/controllers/**/*.java",
  // Python
  "**/views.py",
  "**/routes.py",
  "**/api.py",
  "**/endpoints.py",
  "**/*_views.py",
  "**/*_routes.py",
  "**/urls.py",
  // Ruby
  "app/controllers/**/*.rb",
  "config/routes.rb",
  // Go
  "**/*handler*.go",
  "**/*router*.go",
  // PHP
  "**/Controller/**/*.php",
  "**/Controllers/**/*.php",
  "routes/**/*.php",
];

const GLOB_IGNORE = [
  "**/node_modules/**",
  "**/vendor/**",
  "**/bin/**",
  "**/obj/**",
  "**/test/**",
  "**/tests/**",
  "**/*.test.*",
  "**/*.spec.*",
  "**/TestData/**",
];

async function findControllerFiles(repoPath: string): Promise<string[]> {
  const files = new Set<string>();
  for (const pattern of CONTROLLER_GLOBS) {
    for (const f of await glob(pattern, {
      cwd: repoPath,
      nodir: true,
      ignore: GLOB_IGNORE,
    })) {
      files.add(f);
    }
  }
  return [...files];
}

/** Extract HTTP endpoints from source code using regex patterns per framework */
function extractEndpointsFromFile(
  content: string,
  filePath: string,
): DiscoveredEndpoint[] {
  const endpoints: DiscoveredEndpoint[] = [];
  const ext = extname(filePath).toLowerCase();

  // ---- Express / Koa / Fastify (JS/TS) ----
  if (ext === ".ts" || ext === ".js") {
    // router.get("/path", ...) or app.post("/path", ...)
    const jsRouteRe =
      /\b(?:router|app|server|route)\s*\.\s*(get|post|put|patch|delete|head|options)\s*\(\s*["'`]([^"'`]+)["'`]/gi;
    let m;
    while ((m = jsRouteRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
    // NestJS decorators: @Get("/path"), @Post("/path")
    const nestRe =
      /@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/gi;
    while ((m = nestRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
    // NestJS decorators without path: @Get()
    const nestNoPathRe = /@(Get|Post|Put|Patch|Delete)\s*\(\s*\)/gi;
    while ((m = nestNoPathRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: "/", filePath });
    }
  }

  // ---- C# / ASP.NET ----
  if (ext === ".cs") {
    // Extract class-level route prefix: [Route("api/[controller]")] or [Route("api/things")]
    const classRouteMatch = content.match(/\[Route\(\s*"([^"]+)"\s*\)\]/);
    let routePrefix = classRouteMatch?.[1] ?? "";
    // Replace [controller] placeholder with controller name from class
    const classNameMatch = content.match(/class\s+(\w+?)(?:Controller)\b/);
    if (classNameMatch) {
      routePrefix = routePrefix.replace(
        /\[controller\]/gi,
        classNameMatch[1].toLowerCase(),
      );
    }
    if (routePrefix && !routePrefix.startsWith("/"))
      routePrefix = "/" + routePrefix;

    // [HttpGet], [HttpPost("subpath")], etc.
    const csMethodRe =
      /\[(Http(Get|Post|Put|Patch|Delete|Head|Options))(?:\(\s*"([^"]*)")?\s*\)?\]/gi;
    let m;
    while ((m = csMethodRe.exec(content)) !== null) {
      const method = m[2].toUpperCase();
      const subPath = m[3] ?? "";
      let fullPath = routePrefix;
      if (subPath) {
        fullPath = fullPath ? `${fullPath}/${subPath}` : `/${subPath}`;
      }
      if (!fullPath) fullPath = "/";
      // Replace route parameters: {id} -> :id, {id:guid} -> :id
      fullPath = fullPath.replace(/\{(\w+)(?::[^}]*)?\}/g, ":$1");
      endpoints.push({ method, path: fullPath, filePath });
    }
  }

  // ---- Java / Spring ----
  if (ext === ".java" || ext === ".kt") {
    // @GetMapping("/path"), @PostMapping("/path"), @RequestMapping(method = ..., value = "/path")
    const springRe =
      /@(Get|Post|Put|Patch|Delete)Mapping\s*\(\s*(?:value\s*=\s*)?["']([^"']+)["']/gi;
    let m;
    while ((m = springRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
    // @RequestMapping(value="/path", method=RequestMethod.GET)
    const reqMapRe =
      /@RequestMapping\s*\([^)]*value\s*=\s*"([^"]+)"[^)]*method\s*=\s*RequestMethod\.(\w+)/gi;
    while ((m = reqMapRe.exec(content)) !== null) {
      endpoints.push({ method: m[2].toUpperCase(), path: m[1], filePath });
    }
  }

  // ---- Python / Flask / FastAPI / Django ----
  if (ext === ".py") {
    // @app.route("/path", methods=["GET", "POST"])
    const flaskRe =
      /@\w+\.route\(\s*["']([^"']+)["'](?:\s*,\s*methods\s*=\s*\[([^\]]+)\])?\s*\)/gi;
    let m;
    while ((m = flaskRe.exec(content)) !== null) {
      const path = m[1];
      const methods = m[2] ? m[2].replace(/["'\s]/g, "").split(",") : ["GET"];
      for (const method of methods) {
        endpoints.push({ method: method.toUpperCase(), path, filePath });
      }
    }
    // FastAPI: @app.get("/path"), @router.post("/path")
    const fastapiRe =
      /@\w+\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi;
    while ((m = fastapiRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
    // Django urls: path("api/users/", views.user_list)
    const djangoRe = /path\(\s*["']([^"']+)["']/gi;
    while ((m = djangoRe.exec(content)) !== null) {
      endpoints.push({
        method: "GET",
        path: m[1].startsWith("/") ? m[1] : "/" + m[1],
        filePath,
      });
    }
  }

  // ---- Go / Gin / Echo / Chi ----
  if (ext === ".go") {
    const goRe =
      /\.\s*(GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s*\(\s*"([^"]+)"/gi;
    let m;
    while ((m = goRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
    // HandleFunc pattern
    const handleRe = /HandleFunc\(\s*"([^"]+)"/gi;
    while ((m = handleRe.exec(content)) !== null) {
      endpoints.push({ method: "GET", path: m[1], filePath });
    }
  }

  // ---- PHP / Laravel ----
  if (ext === ".php") {
    const phpRe = /Route::(get|post|put|patch|delete)\(\s*["']([^"']+)["']/gi;
    let m;
    while ((m = phpRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
  }

  // ---- Ruby / Rails ----
  if (ext === ".rb") {
    const railsRe = /\b(get|post|put|patch|delete)\s+["']([^"']+)["']/gi;
    let m;
    while ((m = railsRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
  }

  return endpoints;
}

/**
 * Programmatically extract query params and route params from source code.
 * Returns partial DiscoveredEndpoint fields — avoids LLM call for simple cases.
 */
function extractParamsFromCode(
  content: string,
  endpoint: DiscoveredEndpoint,
): {
  queryParams?: Array<{ name: string; value: string }>;
  body?: string;
  contentType?: string;
} | null {
  const ext = extname(endpoint.filePath).toLowerCase();

  // Extract route params from the path itself (e.g. :id, {id})
  // These are already in the path, no need for extra processing.

  // ---- C# / ASP.NET query params ----
  if (ext === ".cs") {
    const queryParams: Array<{ name: string; value: string }> = [];
    // [FromQuery] parameters
    const fromQueryRe =
      /\[FromQuery(?:\(Name\s*=\s*"(\w+)")?\)?\]\s*\w+\s+(\w+)/g;
    let m;
    while ((m = fromQueryRe.exec(content)) !== null) {
      const name = m[1] ?? m[2];
      queryParams.push({ name, value: "test" });
    }
    return queryParams.length > 0 ? { queryParams } : null;
  }

  // ---- Express query params ----
  if (ext === ".ts" || ext === ".js") {
    const queryParams: Array<{ name: string; value: string }> = [];
    // req.query.paramName or req.query["paramName"]
    const queryRe = /req\.query\.(\w+)|req\.query\["(\w+)"\]/g;
    let m;
    while ((m = queryRe.exec(content)) !== null) {
      const name = m[1] ?? m[2];
      queryParams.push({ name, value: "test" });
    }
    return queryParams.length > 0 ? { queryParams } : null;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Snippet extraction — send only the relevant method to the LLM
// ---------------------------------------------------------------------------

/**
 * Extract ~contextLines lines around every occurrence of `anchor` in the file.
 * Returns the snippet with line numbers prefixed so the LLM can request more
 * via the read_lines tool.
 */
function extractSnippet(
  content: string,
  anchor: string,
  contextLines = 30,
): string {
  const lines = content.split("\n");
  const regions: Array<[number, number]> = [];

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(anchor)) {
      const start = Math.max(0, i - 5);
      const end = Math.min(lines.length - 1, i + contextLines);
      regions.push([start, end]);
    }
  }

  if (regions.length === 0) {
    // If anchor not found, return first N lines as context
    const end = Math.min(lines.length - 1, contextLines * 2);
    regions.push([0, end]);
  }

  // Merge overlapping regions
  const merged: Array<[number, number]> = [];
  for (const [s, e] of regions.sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1] + 1) {
      last[1] = Math.max(last[1], e);
    } else {
      merged.push([s, e]);
    }
  }

  // Build snippet with line numbers
  const parts: string[] = [];
  for (const [s, e] of merged) {
    if (parts.length > 0) parts.push("...");
    for (let i = s; i <= e; i++) {
      parts.push(`${i + 1}: ${lines[i]}`);
    }
  }
  return parts.join("\n");
}

/** Tool definitions for body-param extraction — just a read_lines tool */
const bodyExtractionTools = [
  {
    type: "function" as const,
    function: {
      name: "read_lines",
      description:
        "Read specific line range from a file. Use this to inspect DTO/model classes, request schemas, or other referenced types.",
      parameters: {
        type: "object",
        properties: {
          file: { type: "string", description: "Relative file path" },
          start_line: {
            type: "number",
            description: "Start line number (1-based)",
          },
          end_line: {
            type: "number",
            description: "End line number (1-based, inclusive)",
          },
        },
        required: ["file", "start_line", "end_line"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "find_type",
      description:
        "Search for a class, interface, struct, or type definition by name across the codebase. Returns a snippet of the definition.",
      parameters: {
        type: "object",
        properties: {
          type_name: {
            type: "string",
            description: "The class/interface/struct name to find",
          },
        },
        required: ["type_name"],
      },
    },
  },
  {
    type: "function" as const,
    function: {
      name: "grep_code",
      description:
        "Search for a text pattern across source files using grep. Returns matching lines with file paths and line numbers. Use to find where a DTO is used, how a field is set, or locate related code.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string", description: "Search string (fixed text)" },
          glob: {
            type: "string",
            description:
              'Optional glob to restrict search (e.g. "*.cs", "*.ts")',
          },
        },
        required: ["query"],
      },
    },
  },
];

function createBodyExtractionToolHandler(repoPath: string): ToolHandler {
  return async (
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> => {
    if (name === "read_lines") {
      const file = String(args.file ?? "");
      const startLine = Number(args.start_line ?? 1);
      const endLine = Number(args.end_line ?? startLine + 50);
      try {
        const fullPath = resolve(repoPath, file);
        const content = readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const s = Math.max(0, startLine - 1);
        const e = Math.min(lines.length, endLine);
        return lines
          .slice(s, e)
          .map((l, i) => `${s + i + 1}: ${l}`)
          .join("\n");
      } catch {
        return `Error: could not read ${file}`;
      }
    }
    if (name === "find_type") {
      const typeName = String(args.type_name ?? "");
      if (!typeName) return "Error: type_name is required";
      // Search .cs, .ts, .js, .java, .kt, .py files for the type definition
      const exts = ["cs", "ts", "js", "java", "kt", "py"];
      const pattern = `**/*.{${exts.join(",")}}`;
      const files = await glob(pattern, {
        cwd: repoPath,
        nodir: true,
        ignore: [
          "**/node_modules/**",
          "**/vendor/**",
          "**/bin/**",
          "**/obj/**",
        ],
      });
      const typeRe = new RegExp(
        `\\b(?:class|interface|struct|type|record|enum)\\s+${typeName}\\b`,
      );
      for (const f of files) {
        try {
          const content = readFileSync(resolve(repoPath, f), "utf-8");
          const match = typeRe.exec(content);
          if (match) {
            const lines = content.split("\n");
            const lineIdx =
              content.substring(0, match.index).split("\n").length - 1;
            const start = Math.max(0, lineIdx - 2);
            const end = Math.min(lines.length, lineIdx + 40);
            const snippet = lines
              .slice(start, end)
              .map((l, i) => `${start + i + 1}: ${l}`)
              .join("\n");
            return `Found in ${f}:\n${snippet}`;
          }
        } catch {
          /* skip */
        }
      }
      return `Type "${typeName}" not found in codebase`;
    }
    if (name === "grep_code") {
      const query = String(args.query ?? "");
      if (!query) return "Error: query is required";
      const fileGlob = args.glob ? String(args.glob) : undefined;
      try {
        const grepArgs = [
          "-rn",
          "--binary-files=without-match",
          "--include",
          fileGlob ?? "*",
          "--exclude-dir=node_modules",
          "--exclude-dir=.git",
          "--exclude-dir=dist",
          "--exclude-dir=bin",
          "--exclude-dir=obj",
          "--exclude-dir=vendor",
          "-F",
          query,
          ".",
        ];
        const output = execFileSync("grep", grepArgs, {
          cwd: repoPath,
          encoding: "utf-8",
          maxBuffer: 512 * 1024,
          timeout: 10_000,
        });
        const lines = output.trim().split("\n");
        if (lines.length > 30) {
          return (
            lines.slice(0, 30).join("\n") +
            `\n... (${lines.length} matches total)`
          );
        }
        return lines.join("\n");
      } catch {
        return "No matches found.";
      }
    }
    return `Unknown tool: ${name}`;
  };
}

export async function discoverEndpoints(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  model?: string,
): Promise<DiscoveredEndpoint[]> {
  // Step 1: Find controller files (pure glob, zero LLM)
  const controllerFiles = await findControllerFiles(repoPath);
  console.log(
    `[Analyze] Found ${controllerFiles.length} controller files via glob`,
  );

  if (controllerFiles.length === 0) {
    return [];
  }

  // Step 2: Extract endpoints from each file using regex (zero LLM)
  const allEndpoints: DiscoveredEndpoint[] = [];
  for (const filePath of controllerFiles) {
    const fullPath = resolve(repoPath, filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    const eps = extractEndpointsFromFile(content, filePath);
    allEndpoints.push(...eps);
  }

  // De-duplicate by method+path
  const validMethods = new Set([
    "GET",
    "POST",
    "PUT",
    "PATCH",
    "DELETE",
    "HEAD",
    "OPTIONS",
  ]);
  const seen = new Set<string>();
  const unique = allEndpoints.filter((ep) => {
    const method = ep.method?.toUpperCase();
    if (
      !method ||
      !validMethods.has(method) ||
      !ep.path ||
      ep.path === "unknown"
    )
      return false;
    const key = `${method} ${ep.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  console.log(
    `[Analyze] Extracted ${unique.length} unique endpoints via regex`,
  );

  // Step 3: Enrich with params — programmatic first, LLM only for POST/PUT/PATCH bodies
  const enriched: DiscoveredEndpoint[] = [];
  const needsLlm: DiscoveredEndpoint[] = [];

  for (const ep of unique) {
    const fullPath = resolve(repoPath, ep.filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      enriched.push(ep);
      continue;
    }

    // Try programmatic param extraction
    const params = extractParamsFromCode(content, ep);
    if (params?.queryParams) {
      ep.queryParams = params.queryParams;
    }

    // Skip DELETE — they get trimmed downstream anyway
    if (ep.method.toUpperCase() === "DELETE") {
      enriched.push(ep);
      continue;
    }

    // Use LLM for: POST/PUT/PATCH (need body), or any endpoint with path params (need realistic values)
    const needsBody = ["POST", "PUT", "PATCH"].includes(
      ep.method.toUpperCase(),
    );
    const hasPathParams = /[:{}]/.test(ep.path);
    if (needsBody || hasPathParams) {
      needsLlm.push(ep);
    } else {
      enriched.push(ep);
    }
  }

  // LLM calls for endpoints that need param/body enrichment
  if (needsLlm.length > 0) {
    console.log(
      `[Analyze] Using LLM for param extraction on ${needsLlm.length} endpoints (body + path params)`,
    );
  }
  const handleTool = createBodyExtractionToolHandler(repoPath);

  for (let idx = 0; idx < needsLlm.length; idx++) {
    const ep = needsLlm[idx];
    console.log(
      `[Analyze] Param extraction [${idx + 1}/${needsLlm.length}]: ${ep.method} ${ep.path} (${ep.filePath})`,
    );
    const fullPath = resolve(repoPath, ep.filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      enriched.push(ep);
      continue;
    }

    // Extract a small snippet around the endpoint method, not the whole file
    const anchor = ep.path.replace(/^\//, "").split("/")[0] || ep.method;
    const snippet = extractSnippet(content, anchor);
    const totalLines = content.split("\n").length;

    const needsBody = ["POST", "PUT", "PATCH"].includes(
      ep.method.toUpperCase(),
    );
    const hasPathParams = /[:{}]/.test(ep.path);

    const messages = [
      {
        role: "system" as const,
        content: `You are an API analyst. Given a code snippet for a ${ep.method} endpoint, determine the parameters with realistic sample values.

You have tools to inspect more code:
- read_lines: read specific line ranges from any file
- find_type: search for a class/interface/DTO definition by name

Use these tools to look up referenced DTOs, request models, or schemas. Return your final answer as JSON:
{"body": "<json string or empty>", "contentType": "application/json or empty", "queryParams": [{"name":"n","value":"v"}], "pathParams": {"paramName": "realisticValue"}}`,
      },
      {
        role: "user" as const,
        content: `Endpoint: ${ep.method} ${ep.path}
File: ${ep.filePath} (${totalLines} lines total)

\`\`\`
${snippet}
\`\`\`

${needsBody ? `This is a ${ep.method} endpoint — provide a realistic request body with field names and sample values. DO NOT return an empty body "{}".` : ""}
${hasPathParams ? `This endpoint has path parameters. Provide realistic values for each path param (e.g. a GUID for :id, a slug for :name).` : ""}
If you see a DTO/model type referenced, use find_type to look it up. Return JSON with body, contentType, queryParams, and pathParams.`,
      },
    ];

    try {
      const response = await chatWithTools(
        llm,
        messages,
        bodyExtractionTools,
        handleTool,
        model,
        5,
      );
      const parsed = JSON.parse(extractJson(response));
      // Substitute path params into the URL
      let resolvedPath = ep.path;
      if (parsed.pathParams && typeof parsed.pathParams === "object") {
        for (const [param, value] of Object.entries(parsed.pathParams)) {
          resolvedPath = resolvedPath
            .replace(`:${param}`, String(value))
            .replace(`{${param}}`, String(value));
        }
      }
      enriched.push({
        ...ep,
        path: resolvedPath,
        queryParams:
          parsed.queryParams?.length > 0 ? parsed.queryParams : ep.queryParams,
        body: parsed.body || undefined,
        contentType: parsed.contentType || undefined,
      });
    } catch (err) {
      console.warn(
        `[Analyze] Failed to identify params for ${ep.method} ${ep.path}: ${err}`,
      );
      enriched.push(ep);
    }
  }

  return enriched;
}
