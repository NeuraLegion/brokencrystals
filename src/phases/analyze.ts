import type OpenAI from "openai";
import { readFileSync } from "fs";
import { resolve } from "path";
import { glob } from "glob";
import type { TechStack, DiscoveredEndpoint } from "../types.js";
import { chatWithTools, chatWithSchema } from "../inference.js";
import { codebaseTools, createToolHandler } from "../tools.js";
import { formatTechStack, extractJson } from "../utils.js";
import {
  detectTechStackPrompt,
  techStackSchema,
} from "../prompts/detect-tech-stack.js";
import {
  findControllerFilesPrompt,
  discoverEndpointsPrompt,
  identifyParametersPrompt,
  controllerFilesSchema,
  endpointsSchema,
  endpointParamsSchema,
} from "../prompts/discover-endpoints.js";

export async function detectTechStack(
  llm: OpenAI,
  repoPath: string,
  model?: string,
): Promise<TechStack> {
  const topFiles = await glob("*", { cwd: repoPath, nodir: false });
  const listing = topFiles.join("\n");
  const messages = detectTechStackPrompt(listing);
  const handleTool = createToolHandler(repoPath);

  const response = await chatWithTools(llm, messages, codebaseTools, handleTool, model);

  try {
    const parsed = JSON.parse(extractJson(response));
    return {
      languages: parsed.languages ?? [],
      frameworks: parsed.frameworks ?? [],
      databases: parsed.databases ?? [],
    };
  } catch {
    return { languages: [], frameworks: [], databases: [] };
  }
}

export async function discoverEndpoints(
  llm: OpenAI,
  repoPath: string,
  techStack: TechStack,
  model?: string,
): Promise<DiscoveredEndpoint[]> {
  const stackStr = formatTechStack(techStack);
  const handleTool = createToolHandler(repoPath);

  // Step 1: Find controller/route files
  const controllerMessages = findControllerFilesPrompt(stackStr);
  const controllerResponse = await chatWithTools(
    llm,
    controllerMessages,
    codebaseTools,
    handleTool,
    model,
  );

  let controllerFiles: string[];
  try {
    const parsed = JSON.parse(extractJson(controllerResponse));
    controllerFiles = Array.isArray(parsed) ? parsed : parsed.files ?? [];
  } catch {
    controllerFiles = [];
  }

  // Fallback: glob-based discovery for common controller patterns
  if (controllerFiles.length === 0) {
    console.log("[Analyze] LLM did not return controller files, falling back to glob patterns");
    const patterns = [
      "src/**/*.controller.{ts,js}",
      "src/**/routes.{ts,js}",
      "src/**/router.{ts,js}",
      "src/**/*.routes.{ts,js}",
      "app/controllers/**/*.{ts,js,rb}",
      "controllers/**/*.{ts,js}",
      "routes/**/*.{ts,js}",
      "api/**/*.{ts,js}",
    ];
    for (const pattern of patterns) {
      const files = await glob(pattern, { cwd: repoPath, nodir: true });
      for (const f of files) {
        if (!controllerFiles.includes(f)) {
          controllerFiles.push(f);
        }
      }
    }
    console.log(`[Analyze] Glob fallback found ${controllerFiles.length} controller files`);
  }

  if (controllerFiles.length === 0) {
    return [];
  }

  // Step 2: Extract endpoints from each controller file
  const allEndpoints: DiscoveredEndpoint[] = [];

  for (const filePath of controllerFiles) {
    const fullPath = resolve(repoPath, filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      continue;
    }

    const messages = discoverEndpointsPrompt(stackStr, content, filePath);
    const response = await chatWithSchema<{ endpoints: DiscoveredEndpoint[] }>(
      llm,
      messages,
      "endpoints",
      endpointsSchema,
      model,
    );

    for (const ep of response.endpoints) {
      allEndpoints.push({ ...ep, filePath: ep.filePath || filePath });
    }
  }

  // De-duplicate by method+path and drop invalid entries
  const validMethods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]);
  const seen = new Set<string>();
  const unique = allEndpoints.filter((ep) => {
    const method = ep.method?.toUpperCase();
    if (!method || !validMethods.has(method) || !ep.path || ep.path === "unknown") return false;
    const key = `${method} ${ep.path}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Step 3: Identify parameters for each endpoint
  const enriched: DiscoveredEndpoint[] = [];

  for (const ep of unique) {
    const fullPath = resolve(repoPath, ep.filePath);
    let content: string;
    try {
      content = readFileSync(fullPath, "utf-8");
    } catch {
      enriched.push(ep);
      continue;
    }

    const messages = identifyParametersPrompt(stackStr, ep, content);
    try {
      const params = await chatWithSchema<{
        body: string;
        contentType: string;
        hasQueryParams: boolean;
        queryParamsList: Array<{ name: string; value: string }>;
      }>(
        llm,
        messages,
        "endpoint_params",
        endpointParamsSchema,
        model,
      );
      enriched.push({
        ...ep,
        queryParams: params.hasQueryParams && params.queryParamsList.length > 0
          ? params.queryParamsList
          : undefined,
        body: params.body || undefined,
        contentType: params.contentType || undefined,
      });
    } catch (err) {
      console.warn(`[Analyze] Failed to identify params for ${ep.method} ${ep.path}: ${err}`);
      enriched.push(ep);
    }
  }

  return enriched;
}
