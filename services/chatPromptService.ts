import { buildGuardrailsPrompt } from "./guardrailsService";
import {
  buildCountryNormalizationSectionSync,
  isCountrySupportQuestion
} from "./entityNormalizationService";
import type { SearchResult } from "@/types/document";
import type { GuardrailsConfig } from "@/types/guardrails";

const MAX_PROMPT_CHARS = 10500;
const MAX_CONTEXT_CHARS = 6200;
const MIN_CONTEXT_CHARS = 3200;
const SOURCE_SNIPPET_CHARS = 900;
const answerQualityRules = [
  "Use only facts that are directly supported by the retrieved document context.",
  "When the question asks for countries, regions, locations, or other entity lists, separate the actual entity names from product names, providers, mandates, file names, sheet names, video titles, or implementation labels.",
  "Do not treat a file name, folder name, media title, spreadsheet heading, provider label, or solution label as an answer unless the document text explicitly supports it.",
  "If a retrieved chunk contains a label that combines an entity with a product, provider, mandate, or channel, state the clean entity name where it is clear and keep the full label only as supporting evidence.",
  "When the context is incomplete or ambiguous, say what is incomplete instead of filling gaps from general knowledge.",
  "Prefer clean business-readable answers. Avoid exposing raw extraction artifacts, partial table fragments, or filename-derived labels unless explicitly useful as evidence."
];

const countrySupportFormatRules = [
  "When answering list-style questions such as supported countries, normalize country names and separate qualifiers, frameworks, or product labels.",
  "Do not present combined labels like \"Spain VeriFactu\" as a country. Instead, answer as \"Spain - VeriFactu\".",
  "Do not repeat raw combined labels like \"US DBNA\" or \"Denmark PEPPOL\" verbatim in evidence; paraphrase them as clean country names with separate qualifiers.",
  "If a value is truncated or unclear, do not guess or complete it from general knowledge.",
  "Use this format when supported by context: Answer, grouped model/category list, Notes, Evidence, Confidence.",
  "Countries must be clean country names. Qualifiers, frameworks, filenames, and product names must not be mixed into country names."
];

export function buildChatPrompt(input: {
  question: string;
  guardrails: GuardrailsConfig;
  contextChunks: SearchResult[];
}): string {
  const countryNormalizationSection = buildCountryNormalizationSectionSync(
    input.question,
    input.contextChunks
  );
  const guardrailsPrompt = buildGuardrailsPrompt(input.guardrails);
  const countryRules = isCountrySupportQuestion(input.question)
    ? ["", "COUNTRY / SUPPORT ANSWER FORMAT:", countrySupportFormatRules.map((rule) => `- ${rule}`).join("\n")]
    : [];
  const nonContextPrompt = [
    guardrailsPrompt,
    "",
    "ANSWER QUALITY RULES:",
    answerQualityRules.map((rule) => `- ${rule}`).join("\n"),
    ...countryRules,
    countryNormalizationSection ? "" : "",
    countryNormalizationSection,
    "",
    "DOCUMENT CONTEXT:",
    "",
    "QUESTION:",
    input.question
  ].join("\n");
  const contextBudget = Math.max(
    MIN_CONTEXT_CHARS,
    Math.min(MAX_CONTEXT_CHARS, MAX_PROMPT_CHARS - nonContextPrompt.length)
  );
  const context = input.contextChunks
    .map((chunk, index) => formatSourceContext(chunk, index))
    .join("\n\n")
    .slice(0, contextBudget);

  return [
    guardrailsPrompt,
    "",
    "ANSWER QUALITY RULES:",
    answerQualityRules.map((rule) => `- ${rule}`).join("\n"),
    ...countryRules,
    countryNormalizationSection ? "" : "",
    countryNormalizationSection,
    "",
    "DOCUMENT CONTEXT:",
    context || "No approved context was found.",
    "",
    "QUESTION:",
    input.question
  ]
    .filter((line, index, lines) => line || lines[index - 1] !== "")
    .join("\n");
}

function formatSourceContext(chunk: SearchResult, index: number): string {
  const metadata = [
    `Document: ${chunk.fileName}`,
    chunk.relativePath ? `Relative path: ${chunk.relativePath}` : "",
    chunk.extension ? `Extension: ${chunk.extension}` : "",
    chunk.indexedMode ? `Extraction mode: ${chunk.indexedMode}` : "",
    chunk.sourceQuality ? `Source quality: ${chunk.sourceQuality}` : "",
    chunk.pageNumber ? `Page: ${chunk.pageNumber}` : "",
    chunk.slideNumber ? `Slide: ${chunk.slideNumber}` : "",
    chunk.sheetName ? `Sheet: ${chunk.sheetName}` : "",
    typeof chunk.score === "number" ? `Relevance score: ${chunk.score}` : "",
    chunk.evidenceDetail ? `Evidence note: ${chunk.evidenceDetail}` : ""
  ]
    .filter(Boolean)
    .join("\n");

  return [
    `[Source ${index + 1}]`,
    metadata,
    "Text:",
    chunk.snippet.slice(0, SOURCE_SNIPPET_CHARS)
  ].join("\n");
}
