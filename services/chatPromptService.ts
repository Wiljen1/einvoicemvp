import { buildGuardrailsPrompt } from "./guardrailsService";
import type { SearchResult } from "@/types/document";
import type { GuardrailsConfig } from "@/types/guardrails";

const MAX_CONTEXT_CHARS = 7000;

export function buildChatPrompt(input: {
  question: string;
  guardrails: GuardrailsConfig;
  contextChunks: SearchResult[];
}): string {
  const context = input.contextChunks
    .map(
      (chunk, index) =>
        `[Source ${index + 1}: ${chunk.relativePath || chunk.fileName}]\n${chunk.snippet.slice(0, 1200)}`
    )
    .join("\n\n")
    .slice(0, MAX_CONTEXT_CHARS);

  return [
    buildGuardrailsPrompt(input.guardrails),
    "",
    "DOCUMENT CONTEXT:",
    context || "No approved context was found.",
    "",
    "QUESTION:",
    input.question
  ].join("\n");
}
