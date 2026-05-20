import { buildGuardrailsPrompt } from "./guardrailsService";
import type { SearchResult } from "@/types/document";
import type { GuardrailsConfig } from "@/types/guardrails";

const MAX_CONTEXT_CHARS = 7000;
const answerQualityRules = [
  "Use only facts that are directly supported by the retrieved document context.",
  "When the question asks for countries, regions, locations, or other entity lists, separate the actual entity names from product names, providers, mandates, file names, sheet names, video titles, or implementation labels.",
  "Do not treat a file name, folder name, media title, spreadsheet heading, provider label, or solution label as an answer unless the document text explicitly supports it.",
  "If a retrieved chunk contains a label that combines an entity with a product, provider, mandate, or channel, state the clean entity name where it is clear and keep the full label only as supporting evidence.",
  "When the context is incomplete or ambiguous, say what is incomplete instead of filling gaps from general knowledge."
];

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
    "ANSWER QUALITY RULES:",
    answerQualityRules.map((rule) => `- ${rule}`).join("\n"),
    "",
    "DOCUMENT CONTEXT:",
    context || "No approved context was found.",
    "",
    "QUESTION:",
    input.question
  ].join("\n");
}
