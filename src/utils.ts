/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Format a TechStack into a comma-separated string of languages and frameworks.
 */
export function formatTechStack(techStack: {
  languages: string[];
  frameworks: string[];
  serviceRoot?: string;
}): string {
  const stack = [...techStack.languages, ...techStack.frameworks].join(", ");
  if (techStack.serviceRoot && techStack.serviceRoot !== ".") {
    return `${stack} (service: ${techStack.serviceRoot})`;
  }
  return stack;
}

/**
 * Extract an error message from an unknown caught value.
 */
export function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Extract JSON from an LLM response that may wrap it in markdown code blocks.
 */
export function extractJson(text: string): string {
  const codeBlockMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }
  const jsonMatch = text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  if (jsonMatch) {
    return jsonMatch[1];
  }
  return text;
}
