import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";
import type { ProjectDiscovery } from "../types.js";

/** Framework-specific Dockerfile hints keyed by lowercase tech-stack keywords. */
const FRAMEWORK_HINTS: Array<{ keywords: string[]; hint: string }> = [
  {
    keywords: ["ruby", "rails"],
    hint: `- Rails apps with JavaScript frontends need BOTH Ruby AND Node.js/pnpm in the same build environment. Prefer a single-stage Dockerfile.
- If the project has bin/docker/ scripts, those use "docker exec -it" which fails in CI — call commands directly instead.
- Native extensions (psych, nokogiri) need dev headers: libyaml-dev, libxml2-dev, libxslt-dev, build-essential.
- **Production mode is required**: set RAILS_ENV=production, SECRET_KEY_BASE (use a dummy value for testing), run \`bundle exec rake assets:precompile\` during the build. Use \`bundle config set without 'development test'\` (NOT without 'production').
- **Install runtime system tools**: ImageMagick (imagemagick), fonts (fonts-noto, fonts-liberation), and any other system deps used by gems like mini_magick, letter_avatar, wicked_pdf, etc. Check the Gemfile for gems that wrap system tools.`,
  },
  {
    keywords: ["typescript", "node", "express", "nestjs", "next"],
    hint: `- TypeScript's "tsc" may exit non-zero even with "--noEmitOnError false". Append "|| true" if it's just type warnings.
- In monorepos, read pnpm-workspace.yaml or package.json workspaces to understand the project structure before writing COPY lines.`,
  },
  {
    keywords: [".net", "c#", "aspnet", "dotnet"],
    hint: `- For multi-project solutions, find and publish the correct runnable web API project, not orchestrators (AppHost, ServiceDefaults, Aspire).`,
  },
];

function getFrameworkHints(techStack: string): string {
  const lower = techStack.toLowerCase();
  const hints = FRAMEWORK_HINTS
    .filter((fh) => fh.keywords.some((kw) => lower.includes(kw)))
    .map((fh) => fh.hint);
  return hints.length > 0
    ? `\n\nFramework-specific guidance for this stack:\n${hints.join("\n")}`
    : "";
}

function getDiscoveryContext(discovery?: ProjectDiscovery): string {
  if (!discovery) return "";

  const parts: string[] = ["\n\n## Project Discovery (pre-analyzed infrastructure requirements)"];

  if (discovery.services.length > 0) {
    parts.push("Companion services this app needs (will be in Docker Compose, accessible by service name):");
    for (const s of discovery.services) {
      parts.push(`- **${s.name}** (${s.image}): ${s.reason}`);
    }
  }

  if (discovery.configNotes.length > 0) {
    parts.push("\nConfig file notes (patches needed for Docker networking):");
    for (const note of discovery.configNotes) {
      parts.push(`- ${note}`);
    }
    parts.push("\nIf any config files need patching for Docker networking, apply those changes IN the Dockerfile (e.g. RUN sed, or COPY a patched version) so the container works out of the box with the companion services.");
  }

  if (discovery.buildNotes.length > 0) {
    parts.push("\nBuild notes:");
    for (const note of discovery.buildNotes) {
      parts.push(`- ${note}`);
    }
  }

  return parts.join("\n");
}

export function generateDockerfilePrompt(
  techStack: string,
  discovery?: ProjectDiscovery,
): ChatCompletionMessageParam[] {
  const frameworkHints = getFrameworkHints(techStack);
  const discoveryContext = getDiscoveryContext(discovery);
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Generate a Dockerfile for a ${techStack} project so it can be built and run in a Docker container in **production-like mode** for security testing (DAST scanning).

If the tech stack description says "(service: <path>)", this is a monorepo. Build and run THAT specific service.

You have tools to read files, list directories, and verify Docker image tags. Use them to inspect:
1. Dependency manifests (package.json, Gemfile, requirements.txt, .csproj, go.mod, pom.xml, etc.)
2. Build configuration and scripts
3. The application entry point and port
4. Monorepo structure (pnpm-workspace.yaml, package.json workspaces, etc.)

IMPORTANT: Use verify_docker_image to check that base image:tag EXISTS before including it in a FROM line.

Principles:
- **PRODUCTION-LIKE BUILD**. The container will be security-tested by a DAST scanner, so it MUST behave like a production deployment: precompiled/bundled assets, production-mode settings (RAILS_ENV=production, NODE_ENV=production, etc.), and all runtime dependencies installed. Development mode causes slow responses, debug error pages, and false positives that break security testing.
- BUILD FROM SOURCE. All compilation, asset building, and dependency installation must happen from the local source code inside the container. Never rely on downloading pre-built artifacts, binaries, or asset bundles from external URLs during the build.
- Prefer a SINGLE-STAGE Dockerfile. Multi-stage adds complexity that often breaks (missing tools/files across stages). Only use multi-stage if you have a clear reason.
- If the project needs BOTH a backend runtime (Ruby, Python, etc.) AND a JS build tool (Node, pnpm, etc.), install them ALL in the same stage. Asset compilation steps (e.g. rake assets:precompile) often shell out to node/pnpm — they must be available.
- **INSTALL ALL RUNTIME SYSTEM DEPENDENCIES.** Many apps need system tools at runtime — not just at build time. Common ones: ImageMagick (magick/convert for image processing), wkhtmltopdf (PDF generation), ffmpeg (media processing), gifsicle, optipng, jpegoptim, poppler-utils, ghostscript, brotli. Check the app's Gemfile/package.json/requirements.txt for gems/packages that wrap system tools (e.g. mini_magick → needs ImageMagick, wicked_pdf → needs wkhtmltopdf). Install them with apt-get. Missing runtime tools cause 500 errors on pages that use them.
- **PRECOMPILE ASSETS** for frameworks that need it. Rails: \`bundle exec rake assets:precompile\`. Next.js: \`npm run build\`. Django: \`python manage.py collectstatic --noinput\`. This is essential for production-like behavior — without it, pages load slowly or not at all.
- Use "COPY . ." for source code instead of cherry-picking individual directories — you will miss required files.
- Copy dependency manifests FIRST and install dependencies for layer caching, then COPY the rest.
- Install git if any build step might need it.
- EXPOSE the correct port and set CMD to start the application in production mode (e.g. \`bundle exec rails s -e production\`, \`node dist/server.js\`, etc.).${frameworkHints}${discoveryContext}

Return ONLY the Dockerfile content inside a single fenced code block. No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `Analyze this project and generate a Dockerfile for it. Use the tools to inspect the project's files and determine the right configuration.`,
    },
  ];
}
