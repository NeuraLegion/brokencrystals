import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

/** Framework-specific Dockerfile hints keyed by lowercase tech-stack keywords. */
const FRAMEWORK_HINTS: Array<{ keywords: string[]; hint: string }> = [
  {
    keywords: ["scala", "sbt", "play framework"],
    hint: `- For Scala/sbt projects, use the "sbtscala/scala-sbt" image (e.g. sbtscala/scala-sbt:eclipse-temurin-21.0.6_7_1.10.11_3.6.4). Verify the exact tag with verify_docker_image.
- Large Scala projects need extra heap: ENV SBT_OPTS="-J-Xmx4g -J-XX:+UseG1GC" before running sbt.
- If the project also has a Node.js/pnpm UI build, use a separate stage FROM node:<version>-bookworm-slim for the UI, and copy the built UI assets into the sbt build stage.
- Check the project's .node-version or package.json engines field for the required Node.js version.
- Run sbt commands (e.g. "sbt stage" or "sbt dist") to produce the build output.
- The runtime stage can use eclipse-temurin:<version>-jre for a smaller image.
- For Play Framework apps, start with "-Dconfig.resource=application.conf" and "-Dlogger.resource=logback.xml" (or logger.prod.xml if it exists) to avoid dev-mode file-not-found errors. Check conf/ for available logger config files.`,
  },
  {
    keywords: ["elixir", "phoenix"],
    hint: `- For Elixir/Phoenix projects, use the official "elixir" image for the build stage and "debian:bookworm-slim" or "alpine" for runtime.
- Install hex and rebar: RUN mix local.hex --force && mix local.rebar --force
- Compile with MIX_ENV=prod: RUN mix deps.get --only prod && mix compile && mix phx.digest && mix release`,
  },
  {
    keywords: [".net", "c#", "aspnet", "dotnet"],
    hint: `- For .NET projects, use "mcr.microsoft.com/dotnet/sdk" for build and "mcr.microsoft.com/dotnet/aspnet" for runtime. Verify the exact tags with verify_docker_image.
- If the project uses Node.js for front-end assets, install Node.js via apt-get or a separate build stage.
- IMPORTANT: For multi-project solutions, find and publish the correct runnable web API project. Do NOT publish orchestrator projects (AppHost, ServiceDefaults, Aspire) — they are not standalone deployable services.
- Look for projects with "WebApp", "API", "Server", or "Web" in their name that reference ASP.NET Core.
- If there's a global.json, use the exact SDK version it specifies. If using a preview/RC SDK not yet on MCR, install it via the dotnet-install.sh script instead of using the MCR image tag.
- Use "dotnet publish <project>.csproj -c Release -o /app/publish" and verify the output .dll exists.`,
  },
  {
    keywords: ["java", "maven", "gradle", "spring"],
    hint: `- For Java projects, use eclipse-temurin or amazoncorretto for the JDK build stage.
- For Maven: RUN mvn package -DskipTests. For Gradle: RUN gradle build -x test.
- Use a JRE image for the runtime stage.`,
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

export function generateDockerfilePrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  const frameworkHints = getFrameworkHints(techStack);
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Generate a Dockerfile for a ${techStack} project so it can be built and run in a Docker container.

If the tech stack description says "(service: <path>)", this is a monorepo. Build and run THAT specific service. The Dockerfile should restore/build only that service (and its dependencies), not the entire repo. For .NET: "dotnet publish <path>/<name>.csproj". For Node.js: focus on that package's build script.

You have tools to read files and list directories. Use them to inspect the project's dependency and configuration files (package.json, requirements.txt, .csproj, go.mod, Gemfile, pom.xml, Cargo.toml, build.sbt, project/build.properties, etc.) to determine:
1. The language runtime and version needed
2. How dependencies are installed
3. Any build steps required (compilation, transpilation, etc.)
4. The application entry point / start command
5. The port the application listens on (check config files, source code, and README)

IMPORTANT: You have a verify_docker_image tool. ALWAYS call it to verify that a base image:tag exists on Docker Hub BEFORE including it in a FROM line. If the image does not exist, try alternative tags until you find one that does.

Generate a Dockerfile that:
- Uses an appropriate official base image with a specific version tag (VERIFIED via the tool)
- Sets a WORKDIR
- Copies dependency manifests first and installs dependencies (for layer caching)
- Copies the rest of the source code using "COPY . ." (do NOT cherry-pick individual directories — you will miss required source files)
- Installs git (apt-get install -y git) if any build step or postinstall script may call git
- Runs any necessary build steps
- EXPOSEs the correct port
- Sets CMD to start the application
- For compiled languages (Go, Java, C#, Rust, Scala), use a multi-stage build to keep the final image small
- Use .dockerignore-friendly patterns: copy manifests first for caching, then "COPY . ." for everything else
- For multi-project/microservice repos, build the main web-facing API server (NOT orchestrators, test projects, or CLI tools)${frameworkHints}

Return ONLY the Dockerfile content inside a single fenced code block. No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `Analyze this project and generate a Dockerfile for it. Use the tools to inspect the project's files and determine the right configuration.`,
    },
  ];
}
