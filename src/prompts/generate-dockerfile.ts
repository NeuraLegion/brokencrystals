import type { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs";

export function generateDockerfilePrompt(
  techStack: string,
): ChatCompletionMessageParam[] {
  return [
    {
      role: "system",
      content: `You are a DevOps engineer. Generate a Dockerfile for a ${techStack} project so it can be built and run in a Docker container.

You have tools to read files and list directories. Use them to inspect the project's dependency and configuration files (package.json, requirements.txt, .csproj, go.mod, Gemfile, pom.xml, Cargo.toml, etc.) to determine:
1. The language runtime and version needed
2. How dependencies are installed
3. Any build steps required (compilation, transpilation, etc.)
4. The application entry point / start command
5. The port the application listens on (check config files, source code, and README)

Generate a Dockerfile that:
- Uses an appropriate official base image with a specific version tag
- Sets a WORKDIR
- Copies dependency manifests first and installs dependencies (for layer caching)
- Copies the rest of the source code
- Runs any necessary build steps
- EXPOSEs the correct port
- Sets CMD to start the application
- For compiled languages (Go, Java, C#, Rust), use a multi-stage build to keep the final image small

Return ONLY the Dockerfile content inside a single fenced code block. No explanation outside the code block.`,
    },
    {
      role: "user",
      content: `Analyze this project and generate a Dockerfile for it. Use the tools to inspect the project's files and determine the right configuration.`,
    },
  ];
}
