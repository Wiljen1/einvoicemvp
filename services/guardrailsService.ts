import fs from "node:fs/promises";
import { z } from "zod";
import { guardrailsConfigPath } from "@/lib/paths";
import type { GuardrailsConfig } from "@/types/guardrails";

const guardrailsSchema = z.object({
  answerOnlyFromDocuments: z.boolean().default(true),
  includeSources: z.boolean().default(true),
  includeConfidenceScore: z.boolean().default(true),
  allowInternetBrowsing: z.boolean().default(false),
  keepAnswersShort: z.boolean().default(true),
  doNotSpeculate: z.boolean().default(true),
  sayWhenInformationIsMissing: z.boolean().default(true),
  tone: z.string().trim().min(1).max(80).default("business-friendly"),
  fallbackMessage: z.string().trim().min(1).max(500).default(
    "I could not find enough information in the approved SharePoint folder to answer this confidently."
  )
});

export const defaultGuardrails: GuardrailsConfig = {
  answerOnlyFromDocuments: true,
  includeSources: true,
  includeConfidenceScore: true,
  allowInternetBrowsing: false,
  keepAnswersShort: true,
  doNotSpeculate: true,
  sayWhenInformationIsMissing: true,
  tone: "business-friendly",
  fallbackMessage:
    "I could not find enough information in the approved SharePoint folder to answer this confidently."
};

export async function loadGuardrails(): Promise<GuardrailsConfig> {
  try {
    const raw = await fs.readFile(guardrailsConfigPath, "utf8");
    return guardrailsSchema.parse({
      ...defaultGuardrails,
      ...JSON.parse(raw)
    });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return defaultGuardrails;
    }

    throw new Error("Guardrails configuration is invalid.");
  }
}

export async function saveGuardrails(input: unknown): Promise<GuardrailsConfig> {
  const parsed = guardrailsSchema.parse(input);
  const locked: GuardrailsConfig = {
    ...parsed,
    answerOnlyFromDocuments: true,
    allowInternetBrowsing: false
  };

  await fs.writeFile(guardrailsConfigPath, `${JSON.stringify(locked, null, 2)}\n`, {
    mode: 0o600
  });

  return locked;
}

export function buildGuardrailsPrompt(guardrails: GuardrailsConfig): string {
  const lines = [
    "You are answering for the E-Invoice MVP.",
    "Use only the approved SharePoint folder context supplied in this prompt.",
    "Do not browse the internet or use external sources.",
    `Tone: ${guardrails.tone}.`,
    guardrails.keepAnswersShort ? "Keep the answer short." : "Answer with enough detail to be useful.",
    guardrails.includeSources ? "Include source references." : "Do not add source references unless requested.",
    guardrails.includeConfidenceScore ? "Include a confidence score." : "Do not include a confidence score.",
    guardrails.doNotSpeculate ? "Do not speculate." : "Avoid unsupported assumptions.",
    guardrails.sayWhenInformationIsMissing
      ? `If the answer is not supported, say: "${guardrails.fallbackMessage}"`
      : "If information is missing, explain that it is not available in the supplied context."
  ];

  return lines.join("\n");
}
