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
    if (allDeps?.["@remix-run/node"] || allDeps?.["@remix-run/react"]) frameworks.add("Remix");
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

  // ---- Scala ----
  if (has("build.sbt")) {
    languages.add("Scala");
    if (!languages.has("Java")) languages.add("Java");
    try {
      const sbt = readFileSync(resolve(repoPath, "build.sbt"), "utf-8").toLowerCase();
      if (sbt.includes("play") || sbt.includes("playframework")) frameworks.add("Play Framework");
      if (sbt.includes("akka-http")) frameworks.add("Akka HTTP");
      if (sbt.includes("http4s")) frameworks.add("http4s");
      if (sbt.includes("slick")) databases.add("SQL (Slick)");
      if (sbt.includes("reactivemongo") || sbt.includes("mongo")) databases.add("MongoDB");
      if (sbt.includes("postgres")) databases.add("PostgreSQL");
    } catch { /* skip */ }
  }

  // ---- Elixir ----
  if (has("mix.exs")) {
    languages.add("Elixir");
    try {
      const mix = readFileSync(resolve(repoPath, "mix.exs"), "utf-8").toLowerCase();
      if (mix.includes("phoenix")) frameworks.add("Phoenix");
      if (mix.includes("ecto")) databases.add("SQL (Ecto)");
    } catch { /* skip */ }
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
      ".scala": "Scala",
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
    serviceRoot: await selectServiceForTesting(repoPath, [...frameworks]),
  };
}

// ---------------------------------------------------------------------------
// Monorepo service selection (zero LLM calls)
// ---------------------------------------------------------------------------

/** Names that indicate a project is NOT a standalone runnable web service. */
const SKIP_PROJECT_PATTERNS = [
  /apphost/i,
  /servicedefaults/i,
  /aspire/i,
  /\.tests?$/i,
  /\.test$/i,
  /\.spec$/i,
  /\.e2e$/i,
  /\.benchmark/i,
  /\.shared$/i,
  /\.common$/i,
  /\.contracts$/i,
  /migrations/i,
  /\.cli$/i,
  /\.tools?$/i,
  /\.worker$/i,
];

/** Names that strongly suggest a runnable web API. */
const PREFER_PROJECT_PATTERNS = [
  /api$/i,
  /\.api$/i,
  /web$/i,
  /webapp$/i,
  /server$/i,
  /gateway$/i,
  /host$/i,
  /\.web$/i,
];

interface ServiceCandidate {
  /** Relative path from repo root to the service directory */
  path: string;
  /** Candidate name (directory or project name) */
  name: string;
  score: number;
}

/**
 * For monorepos with multiple deployable services, pick the best candidate
 * for DAST testing. Returns "." for single-project repos.
 *
 * Scoring:
 *  +10  has its own Dockerfile
 *  +8   has HTTP framework dependency (express, fastapi, ASP.NET, etc.)
 *  +5   name matches web/API patterns
 *  +3   has controller/route files
 *  +2   has package.json / go.mod / .csproj at that level
 *  -100 is a test/orchestrator/shared/CLI project
 */
async function selectServiceForTesting(
  repoPath: string,
  rootFrameworks: string[],
): Promise<string> {
  // Quick check: not a monorepo → "."
  const monorepoIndicators = [
    "pnpm-workspace.yaml",
    "lerna.json",
    "nx.json",
    "turbo.json",
    "rush.json",
  ];
  const hasWorkspaceConfig = monorepoIndicators.some((f) =>
    existsSync(resolve(repoPath, f)),
  );

  // .NET multi-project: many .csproj files in different dirs
  const csprojFiles = await glob("**/*.csproj", {
    cwd: repoPath,
    nodir: true,
    maxDepth: 4,
    ignore: ["**/node_modules/**", "**/bin/**", "**/obj/**"],
  });
  const csprojDirs = new Set(csprojFiles.map((f) => f.replace(/\/[^/]+$/, "")));
  const isDotnetMultiProject = csprojDirs.size > 3;

  // Multiple package.json files in different dirs
  const pkgJsonFiles = await glob("*/package.json", {
    cwd: repoPath,
    nodir: true,
  });
  const isJsMonorepo = hasWorkspaceConfig || pkgJsonFiles.length > 2;

  // Multiple Go modules or main.go files
  const goMains = await glob("**/main.go", {
    cwd: repoPath,
    nodir: true,
    maxDepth: 4,
    ignore: ["**/vendor/**", "**/node_modules/**"],
  });
  const isGoMulti = goMains.length > 2;

  if (
    !isDotnetMultiProject &&
    !isJsMonorepo &&
    !isGoMulti &&
    !hasWorkspaceConfig
  ) {
    return ".";
  }

  console.log("[Analyze] Monorepo detected — selecting best service for testing");

  const candidates: ServiceCandidate[] = [];

  // --- .NET candidates: each .csproj directory ---
  if (isDotnetMultiProject) {
    for (const csproj of csprojFiles) {
      const dir = csproj.replace(/\/[^/]+$/, "");
      const name = csproj.replace(/\.csproj$/, "").replace(/.*\//, "");
      const candidate = await scoreCandidate(repoPath, dir, name);
      candidates.push(candidate);
    }
  }

  // --- JS/TS candidates: each dir with its own package.json ---
  if (isJsMonorepo) {
    // Also check apps/*/package.json, packages/*/package.json patterns
    const allPkgJsons = await glob(
      "{*/,apps/*/,packages/*/,services/*/}package.json",
      { cwd: repoPath, nodir: true },
    );
    for (const pkg of allPkgJsons) {
      const dir = pkg.replace(/\/package\.json$/, "");
      const name = dir.replace(/.*\//, "");
      const candidate = await scoreCandidate(repoPath, dir, name);
      candidates.push(candidate);
    }
  }

  // --- Go candidates: each dir with main.go ---
  if (isGoMulti) {
    for (const mainGo of goMains) {
      const dir = mainGo.replace(/\/main\.go$/, "");
      const name = dir.replace(/.*\//, "");
      const candidate = await scoreCandidate(repoPath, dir, name);
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return ".";

  // Sort by score descending, pick the best
  candidates.sort((a, b) => b.score - a.score);

  const best = candidates[0];
  if (best.score <= 0) {
    console.log("[Analyze] No viable web service found in monorepo — using root");
    return ".";
  }

  console.log(
    `[Analyze] Selected service: ${best.path} (score: ${best.score}) from ${candidates.length} candidates`,
  );
  if (candidates.length > 1) {
    const top3 = candidates
      .slice(0, 3)
      .map((c) => `${c.path}(${c.score})`)
      .join(", ");
    console.log(`[Analyze] Top candidates: ${top3}`);
  }

  return best.path;
}

async function scoreCandidate(
  repoPath: string,
  dir: string,
  name: string,
): Promise<ServiceCandidate> {
  let score = 0;
  const absDir = resolve(repoPath, dir);

  // Skip known non-service projects
  if (SKIP_PROJECT_PATTERNS.some((p) => p.test(name))) {
    return { path: dir, name, score: -100 };
  }

  // Bonus: has its own Dockerfile
  if (
    existsSync(resolve(absDir, "Dockerfile")) ||
    existsSync(resolve(absDir, "dockerfile"))
  ) {
    score += 10;
  }

  // Bonus: name suggests a web API
  if (PREFER_PROJECT_PATTERNS.some((p) => p.test(name))) {
    score += 5;
  }

  // Check for HTTP framework dependencies
  score += await scoreHttpFramework(absDir);

  // Check for controller/route files
  const controllers = await glob(
    "**/{*controller*,*Controller*,routes*,*handler*}.{ts,js,cs,java,go,py,rb,php}",
    { cwd: absDir, nodir: true, maxDepth: 4, ignore: GLOB_IGNORE },
  );
  if (controllers.length > 0) score += 3;

  // Has a build manifest at this level
  const manifests = [
    "package.json",
    "go.mod",
    "Cargo.toml",
    "pom.xml",
    "build.gradle",
    "build.gradle.kts",
    "build.sbt",
    "mix.exs",
    "composer.json",
  ];
  if (manifests.some((m) => existsSync(resolve(absDir, m)))) score += 2;

  return { path: dir, name, score };
}

/** Check if a directory has HTTP framework dependencies */
async function scoreHttpFramework(absDir: string): Promise<number> {
  // Node.js
  try {
    const pkg = JSON.parse(
      readFileSync(resolve(absDir, "package.json"), "utf-8"),
    );
    const allDeps = { ...pkg?.dependencies, ...pkg?.devDependencies };
    const httpPkgs = [
      "express",
      "fastify",
      "koa",
      "@hapi/hapi",
      "@nestjs/core",
      "next",
      "nuxt",
    ];
    if (httpPkgs.some((p) => allDeps?.[p])) return 8;
  } catch {
    /* not a Node project */
  }

  // .NET
  const csprojFiles = await glob("*.csproj", {
    cwd: absDir,
    nodir: true,
  });
  for (const f of csprojFiles) {
    try {
      const content = readFileSync(resolve(absDir, f), "utf-8").toLowerCase();
      if (
        content.includes("microsoft.aspnetcore") ||
        content.includes("aspnet")
      ) {
        return 8;
      }
    } catch {
      /* skip */
    }
  }

  // Python
  for (const f of ["requirements.txt", "pyproject.toml"]) {
    try {
      const content = readFileSync(resolve(absDir, f), "utf-8").toLowerCase();
      if (
        content.includes("django") ||
        content.includes("flask") ||
        content.includes("fastapi")
      ) {
        return 8;
      }
    } catch {
      /* skip */
    }
  }

  // Go
  try {
    const gomod = readFileSync(
      resolve(absDir, "go.mod"),
      "utf-8",
    ).toLowerCase();
    if (
      gomod.includes("gin-gonic") ||
      gomod.includes("gorilla/mux") ||
      gomod.includes("fiber") ||
      gomod.includes("echo") ||
      gomod.includes("net/http")
    ) {
      return 8;
    }
  } catch {
    /* skip */
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Phase 2: Discover endpoints (programmatic regex parsing, zero LLM calls)
// ---------------------------------------------------------------------------

/** Glob patterns covering controller/route files for all major frameworks */
const CONTROLLER_GLOBS = [
  // JS / TS — structured directories (use ** prefix so nested dirs like backend/ are found)
  "src/**/*.controller.{ts,js}",
  "src/**/routes.{ts,js}",
  "src/**/router.{ts,js}",
  "src/**/*.routes.{ts,js}",
  "**/controllers/**/*.{ts,js}",
  "**/routes/**/*.{ts,js}",
  "**/routers/**/*.{ts,js}",
  "**/express-routers/**/*.{ts,js}",
  "api/**/*.{ts,js}",
  // JS / TS — file-name conventions (kebab-case and camelCase)
  "**/*-controller.{ts,js}",
  "**/*-router.{ts,js}",
  "**/*-routes.{ts,js}",
  "**/*Controller.{ts,js}",
  "**/*Router.{ts,js}",
  "**/*Routes.{ts,js}",
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

// ---------------------------------------------------------------------------
// FS-based route detection (Next.js pages/api, Remix routes)
// ---------------------------------------------------------------------------

async function extractFsBasedRoutes(
  repoPath: string,
  techStack: TechStack,
): Promise<DiscoveredEndpoint[]> {
  const endpoints: DiscoveredEndpoint[] = [];

  // Next.js: pages/api/**/*.{ts,js,tsx,jsx} or app/api/**/route.{ts,js}
  const isNextJs = techStack.frameworks.some(f => /next/i.test(f));
  if (isNextJs) {
    // Pages Router: pages/api/users/[id].ts → GET /api/users/:id
    const pagesApiFiles = await glob("pages/api/**/*.{ts,js,tsx,jsx}", {
      cwd: repoPath,
      nodir: true,
      ignore: GLOB_IGNORE,
    });
    for (const f of pagesApiFiles) {
      const route = "/" + f
        .replace(/^pages\//, "")
        .replace(/\/index\.\w+$/, "")
        .replace(/\.\w+$/, "")
        .replace(/\[\.\.\.(\w+)\]/g, ":$1*")
        .replace(/\[(\w+)\]/g, ":$1");
      endpoints.push({ method: "GET", path: route, filePath: f });
    }

    // App Router: app/api/**/route.{ts,js} → methods from file
    const appApiFiles = await glob("app/api/**/route.{ts,js,tsx,jsx}", {
      cwd: repoPath,
      nodir: true,
      ignore: GLOB_IGNORE,
    });
    for (const f of appApiFiles) {
      const route = "/" + f
        .replace(/^app\//, "")
        .replace(/\/route\.\w+$/, "")
        .replace(/\[\.\.\.(\w+)\]/g, ":$1*")
        .replace(/\[(\w+)\]/g, ":$1");
      // Detect exported HTTP methods from the file
      try {
        const content = readFileSync(resolve(repoPath, f), "utf-8");
        const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"].filter(
          m => new RegExp(`export\\s+(?:async\\s+)?function\\s+${m}\\b`, "i").test(content),
        );
        for (const method of methods.length > 0 ? methods : ["GET"]) {
          endpoints.push({ method, path: route, filePath: f });
        }
      } catch {
        endpoints.push({ method: "GET", path: route, filePath: f });
      }
    }
  }

  // Remix: app/routes/**/*.{ts,tsx,js,jsx}
  const isRemix = techStack.frameworks.some(f => /remix/i.test(f));
  if (isRemix) {
    const remixFiles = await glob("app/routes/**/*.{ts,tsx,js,jsx}", {
      cwd: repoPath,
      nodir: true,
      ignore: GLOB_IGNORE,
    });
    for (const f of remixFiles) {
      // Remix flat routes: app/routes/users.$userId.tsx → /users/:userId
      const route = "/" + f
        .replace(/^app\/routes\//, "")
        .replace(/\.\w+$/, "")        // remove extension
        .replace(/_index$/, "")        // _index → parent route
        .replace(/\$/g, ":")           // $param → :param
        .replace(/\./g, "/")          // dot → slash (flat routes)
        .replace(/\/_/, "/");          // _layout segments
      if (route && route !== "/") {
        endpoints.push({ method: "GET", path: route, filePath: f });
      }
    }
  }

  return endpoints;
}

// ---------------------------------------------------------------------------
// Express/Koa prefix mounting detection (app.use('/api', router))
// ---------------------------------------------------------------------------

/**
 * Scan entry files for app.use('/prefix', router) patterns and
 * return a map of router variable name → prefix path.
 * This lets us prepend prefixes to routes found in router files.
 */
async function detectRoutePrefixes(
  repoPath: string,
): Promise<Map<string, string>> {
  const prefixMap = new Map<string, string>();

  // Scan common entry points
  const entryFiles = await glob(
    "{index,app,server,main,src/index,src/app,src/server,src/main}.{ts,js}",
    { cwd: repoPath, nodir: true },
  );

  for (const f of entryFiles) {
    let content: string;
    try {
      content = readFileSync(resolve(repoPath, f), "utf-8");
    } catch {
      continue;
    }

    // app.use('/api/v1', usersRouter)  or  app.use('/api', require('./routes/users'))
    const useRe = /\.use\(\s*["'`](\/[^"'`]*)["'`]\s*,\s*(?:require\(\s*["'`]([^"'`]+)["'`]\s*\)|(\w+))/g;
    let m;
    while ((m = useRe.exec(content)) !== null) {
      const prefix = m[1];
      const requirePath = m[2];
      const varName = m[3];

      if (requirePath) {
        // Normalize require path to a file name
        const normalized = requirePath.replace(/^\.\//, "").replace(/\.\w+$/, "");
        prefixMap.set(normalized, prefix);
      }
      if (varName) {
        // Try to find where this variable was imported from
        // import usersRouter from './routes/users'
        const importRe = new RegExp(
          `import\\s+${varName}\\s+from\\s+["'\`]([^"'\`]+)["'\`]` +
          `|const\\s+${varName}\\s*=\\s*require\\(\\s*["'\`]([^"'\`]+)["'\`]\\s*\\)`,
        );
        const importMatch = content.match(importRe);
        if (importMatch) {
          const importPath = (importMatch[1] ?? importMatch[2]).replace(/^\.\//, "").replace(/\.\w+$/, "");
          prefixMap.set(importPath, prefix);
        }
      }
    }
  }

  return prefixMap;
}

/**
 * Given a file path like "routes/users.ts", find the best matching
 * prefix from the prefix map (e.g. "routes/users" → "/api").
 */
function findPrefixForFile(
  filePath: string,
  prefixMap: Map<string, string>,
): string {
  const normalized = filePath.replace(/\.\w+$/, "");
  // Direct match
  if (prefixMap.has(normalized)) return prefixMap.get(normalized)!;
  // Match by basename (e.g. "users" matches "src/routes/users")
  for (const [key, prefix] of prefixMap) {
    if (normalized.endsWith(key) || key.endsWith(normalized.split("/").pop()!)) {
      return prefix;
    }
  }
  return "";
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
    // Fastify object-config: fastify.route({ method: 'GET', url: '/path' })
    const fastifyRouteRe =
      /\.route\s*\(\s*\{[^}]*?method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]\s*,[^}]*?url\s*:\s*["'`]([^"'`]+)["'`]/gi;
    while ((m = fastifyRouteRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: m[2], filePath });
    }
    // Also match url before method: .route({ url: '/path', method: 'GET' })
    const fastifyRouteRevRe =
      /\.route\s*\(\s*\{[^}]*?url\s*:\s*["'`]([^"'`]+)["'`]\s*,[^}]*?method\s*:\s*["'`](GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)["'`]/gi;
    while ((m = fastifyRouteRevRe.exec(content)) !== null) {
      endpoints.push({ method: m[2].toUpperCase(), path: m[1], filePath });
    }

    // NestJS: extract @Controller('prefix') for prepending to routes
    const controllerMatch = content.match(/@Controller\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/);
    const nestPrefix = controllerMatch?.[1]
      ? (controllerMatch[1].startsWith("/") ? controllerMatch[1] : "/" + controllerMatch[1])
      : "";

    // NestJS @Crud() + @Controller('path') → generate standard CRUD endpoints
    if (/@Crud\s*\(/.test(content) && nestPrefix) {
      for (const method of ["GET", "POST", "PUT", "PATCH", "DELETE"] as const) {
        const crudPath = method === "GET" || method === "DELETE" || method === "PUT" || method === "PATCH"
          ? `${nestPrefix}/:id`
          : nestPrefix;
        endpoints.push({ method, path: crudPath, filePath });
      }
      // Also add GET for list (no :id)
      endpoints.push({ method: "GET", path: nestPrefix, filePath });
    }

    // NestJS decorators: @Get("/path"), @Post("/path")
    const nestRe =
      /@(Get|Post|Put|Patch|Delete|Head|Options)\s*\(\s*["'`]([^"'`]*)["'`]\s*\)/gi;
    while ((m = nestRe.exec(content)) !== null) {
      const subPath = m[2];
      const fullPath = nestPrefix && subPath
        ? `${nestPrefix}/${subPath.replace(/^\//, "")}`
        : nestPrefix + (subPath.startsWith("/") ? subPath : `/${subPath}`);
      endpoints.push({ method: m[1].toUpperCase(), path: fullPath || "/", filePath });
    }
    // NestJS decorators without path: @Get()
    const nestNoPathRe = /@(Get|Post|Put|Patch|Delete)\s*\(\s*\)/gi;
    while ((m = nestNoPathRe.exec(content)) !== null) {
      endpoints.push({ method: m[1].toUpperCase(), path: nestPrefix || "/", filePath });
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

// ---------------------------------------------------------------------------
// LLM fallback for controller files where regex found no endpoints
// ---------------------------------------------------------------------------

const endpointDiscoveryTools = [
  bodyExtractionTools[0], // read_lines
  bodyExtractionTools[2], // grep_code
];

async function extractEndpointsViaLlm(
  llm: OpenAI,
  repoPath: string,
  files: string[],
  handleTool: ToolHandler,
  model?: string,
): Promise<DiscoveredEndpoint[]> {
  const results: DiscoveredEndpoint[] = [];

  for (const filePath of files) {
    const fullPath = resolve(repoPath, filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    // Send first ~80 lines or the whole file if small
    const lines = content.split("\n");
    const snippet = lines
      .slice(0, Math.min(lines.length, 80))
      .map((l, i) => `${i + 1}: ${l}`)
      .join("\n");
    const truncated = lines.length > 80 ? ` (showing first 80 of ${lines.length} lines)` : "";

    console.log(
      `[Analyze] LLM endpoint discovery: ${filePath}${truncated}`,
    );

    const messages = [
      {
        role: "system" as const,
        content: `You are an API route analyst. Given source code from a controller/route file, identify all HTTP endpoints it registers.

Look for:
- Direct route registrations (app.get, router.post, etc.)
- Helper functions that register routes (registerRoutes, addCrudRoutes, etc.) — follow them with grep_code if needed
- Route configuration objects, arrays, or maps

You have tools:
- read_lines: read more of this or other files
- grep_code: search the codebase for function definitions, route registrations, etc.

Return ONLY a JSON array of endpoints:
[{"method": "GET", "path": "/api/users"}, {"method": "POST", "path": "/api/users"}]

If no HTTP endpoints are found, return an empty array: []`,
      },
      {
        role: "user" as const,
        content: `File: ${filePath}${truncated}

\`\`\`
${snippet}
\`\`\`

Find all HTTP endpoints registered in this file. If routes are registered via helper functions, use grep_code to find their definitions.`,
      },
    ];

    try {
      const response = await chatWithTools(
        llm,
        messages,
        endpointDiscoveryTools,
        handleTool,
        model,
        3,
      );
      const parsed = JSON.parse(extractJson(response));
      const eps = Array.isArray(parsed)
        ? parsed
        : Array.isArray(parsed.endpoints)
          ? parsed.endpoints
          : [];
      for (const ep of eps) {
        if (ep.method && ep.path) {
          results.push({
            method: String(ep.method).toUpperCase(),
            path: String(ep.path),
            filePath,
          });
        }
      }
      if (eps.length > 0) {
        console.log(
          `[Analyze] LLM found ${eps.length} endpoint(s) in ${filePath}`,
        );
      }
    } catch (err) {
      console.warn(
        `[Analyze] LLM fallback failed for ${filePath}: ${err}`,
      );
    }
  }

  return results;
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
  const noMatchFiles: string[] = [];
  for (const filePath of controllerFiles) {
    const fullPath = resolve(repoPath, filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }
    const eps = extractEndpointsFromFile(content, filePath);
    if (eps.length > 0) {
      allEndpoints.push(...eps);
    } else {
      noMatchFiles.push(filePath);
    }
  }

  // Step 2a: FS-based routes (Next.js pages/api, App Router, Remix flat routes)
  const fsRoutes = await extractFsBasedRoutes(repoPath, techStack);
  if (fsRoutes.length > 0) {
    console.log(
      `[Analyze] Extracted ${fsRoutes.length} endpoints from file-system routes`,
    );
    allEndpoints.push(...fsRoutes);
  }

  // Step 2b: Detect route prefix mounting (app.use('/api', router))
  const prefixMap = await detectRoutePrefixes(repoPath);
  if (prefixMap.size > 0) {
    console.log(
      `[Analyze] Detected ${prefixMap.size} route prefix mount(s): ${[...prefixMap.entries()].map(([k, v]) => `${v} → ${k}`).join(", ")}`,
    );
    // Prepend prefixes to regex-extracted endpoints
    for (const ep of allEndpoints) {
      const prefix = findPrefixForFile(ep.filePath, prefixMap);
      if (prefix && !ep.path.startsWith(prefix)) {
        ep.path = prefix.replace(/\/$/, "") + (ep.path.startsWith("/") ? ep.path : "/" + ep.path);
      }
    }
  }

  // Step 2c: LLM fallback for controller files with zero regex matches
  if (noMatchFiles.length > 0) {
    console.log(
      `[Analyze] ${noMatchFiles.length} controller file(s) had no regex matches — using LLM fallback`,
    );
    const handleTool = createBodyExtractionToolHandler(repoPath);
    const llmEndpoints = await extractEndpointsViaLlm(
      llm,
      repoPath,
      noMatchFiles,
      handleTool,
      model,
    );
    // Apply prefix map to LLM-extracted endpoints too
    for (const ep of llmEndpoints) {
      const prefix = findPrefixForFile(ep.filePath, prefixMap);
      if (prefix && !ep.path.startsWith(prefix)) {
        ep.path = prefix.replace(/\/$/, "") + (ep.path.startsWith("/") ? ep.path : "/" + ep.path);
      }
    }
    allEndpoints.push(...llmEndpoints);
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
