import fs from "node:fs";
import fsPromises from "node:fs/promises";
import { z } from "zod";
import { entityNormalizationConfigPath } from "@/lib/paths";
import type { SearchResult } from "@/types/document";

export type NormalizationConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface EntityNormalizationConfig {
  countryAliases: Record<string, string>;
  knownQualifiers: string[];
  ignoredLabels: string[];
}

export interface NormalizedCountryEntity {
  displayName: string;
  qualifier?: string;
  rawValue: string;
  rawCountryLabel?: string;
  confidence: NormalizationConfidence;
  truncated?: boolean;
  reason?: string;
}

export interface CountryEvidence {
  entity: NormalizedCountryEntity;
  source: string;
}

const defaultConfig: EntityNormalizationConfig = {
  countryAliases: {
    Belgium: "Belgium",
    Brasil: "Brazil",
    Brazil: "Brazil",
    Chile: "Chile",
    China: "China",
    Colombia: "Colombia",
    Denmark: "Denmark",
    Israel: "Israel",
    Malaysia: "Malaysia",
    Spain: "Spain",
    "U.S.": "United States",
    US: "United States",
    USA: "United States",
    "United States": "United States"
  },
  knownQualifiers: ["PEPPOL", "VeriFactu", "DBNA", "Nemhandel", "OBN", "Avalara"],
  ignoredLabels: ["NetSuite", "Localization", "Localisation", "SuiteApp", "SuiteApps"]
};

const configSchema = z.object({
  countryAliases: z.record(z.string(), z.string()).default(defaultConfig.countryAliases),
  knownQualifiers: z.array(z.string()).default(defaultConfig.knownQualifiers),
  ignoredLabels: z.array(z.string()).default(defaultConfig.ignoredLabels)
});

let cachedConfig: EntityNormalizationConfig | null = null;

export async function loadEntityNormalizationConfig(): Promise<EntityNormalizationConfig> {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const raw = await fsPromises.readFile(entityNormalizationConfigPath, "utf8");
    cachedConfig = configSchema.parse(JSON.parse(raw));
  } catch {
    cachedConfig = defaultConfig;
  }

  return cachedConfig;
}

export function loadEntityNormalizationConfigSync(): EntityNormalizationConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  try {
    const raw = fs.readFileSync(entityNormalizationConfigPath, "utf8");
    cachedConfig = configSchema.parse(JSON.parse(raw));
  } catch {
    cachedConfig = defaultConfig;
  }

  return cachedConfig;
}

export function resetEntityNormalizationConfigForTests(): void {
  cachedConfig = null;
}

export function isCountrySupportQuestion(question: string): boolean {
  return /\b(countries|country|supported|support|availability|available|locali[sz]ation|listed|model|DBNA|PEPPOL|Veri\*?Factu|Nemhandel)\b/i.test(
    question
  );
}

export function normalizeCountryEntity(
  rawValue: string,
  config: EntityNormalizationConfig = defaultConfig
): NormalizedCountryEntity {
  const cleanedRaw = cleanEntityText(rawValue);

  if (!cleanedRaw) {
    return {
      displayName: "Unknown",
      rawValue,
      confidence: "LOW",
      reason: "Empty value"
    };
  }

  if (isTruncatedValue(cleanedRaw)) {
    return {
      displayName: "Unknown",
      rawValue: cleanedRaw,
      confidence: "LOW",
      truncated: true,
      reason: "Value appears truncated or incomplete"
    };
  }

  const qualifier = findTrailingQualifier(cleanedRaw, config.knownQualifiers);
  const countryPart = qualifier
    ? cleanEntityText(cleanedRaw.slice(0, cleanedRaw.length - qualifier.raw.length))
    : cleanedRaw;
  const displayName = lookupCountryAlias(countryPart, config.countryAliases);

  if (!displayName || isIgnoredLabel(displayName, config.ignoredLabels)) {
    return {
      displayName: countryPart || cleanedRaw,
      qualifier: qualifier?.display,
      rawValue: cleanedRaw,
      rawCountryLabel: countryPart || cleanedRaw,
      confidence: "LOW",
      reason: "Country alias is not configured"
    };
  }

  return {
    displayName,
    qualifier: qualifier?.display,
    rawValue: cleanedRaw,
    rawCountryLabel: countryPart,
    confidence: qualifier ? "HIGH" : "MEDIUM"
  };
}

export function dedupeNormalizedCountries(
  entities: NormalizedCountryEntity[]
): NormalizedCountryEntity[] {
  const seen = new Map<string, NormalizedCountryEntity>();

  for (const entity of entities) {
    if (entity.truncated) {
      const key = `truncated:${entity.rawValue.toLowerCase()}`;
      if (!seen.has(key)) {
        seen.set(key, entity);
      }
      continue;
    }

    const key = `${entity.displayName.toLowerCase()}|${entity.qualifier?.toLowerCase() || ""}`;
    const existing = seen.get(key);

    if (!existing || confidenceRank(entity.confidence) > confidenceRank(existing.confidence)) {
      seen.set(key, entity);
    }
  }

  return Array.from(seen.values());
}

export function normalizeCombinedCountryLabelsInText(
  value: string,
  config: EntityNormalizationConfig = loadEntityNormalizationConfigSync()
): string {
  if (!value) {
    return value;
  }

  let normalizedText = value;
  const rawLabels = extractCountryLikeLabels(value, config)
    .map((rawLabel) => normalizeCountryEntity(rawLabel, config))
    .filter((entity) => entity.qualifier && !entity.truncated && entity.confidence !== "LOW");

  for (const entity of rawLabels) {
    const rawPattern = new RegExp(escapeRegex(entity.rawValue).replace(/VeriFactu/i, "Veri\\*?Factu"), "gi");
    normalizedText = normalizedText.replace(
      rawPattern,
      `${entity.displayName} - ${entity.qualifier}`
    );
  }

  for (const [alias, displayName] of Object.entries(config.countryAliases)) {
    for (const qualifier of config.knownQualifiers) {
      const pattern = new RegExp(
        `\\b${escapeRegex(alias)}\\s+${qualifierToPattern(qualifier)}\\b`,
        "gi"
      );
      normalizedText = normalizedText.replace(pattern, `${displayName} - ${qualifier}`);
    }
  }

  return normalizedText;
}

export async function extractCountryEvidenceFromResults(
  chunks: SearchResult[]
): Promise<CountryEvidence[]> {
  const config = await loadEntityNormalizationConfig();
  const evidence: CountryEvidence[] = [];

  for (const chunk of chunks) {
    const rawEntities = extractCountryLikeLabels(chunk.snippet, config);
    for (const rawEntity of rawEntities) {
      evidence.push({
        entity: normalizeCountryEntity(rawEntity, config),
        source: chunk.relativePath || chunk.fileName
      });
    }
  }

  return dedupeCountryEvidence(evidence);
}

export async function buildCountryNormalizationSection(
  question: string,
  chunks: SearchResult[]
): Promise<string> {
  if (!isCountrySupportQuestion(question)) {
    return "";
  }

  const evidence = await extractCountryEvidenceFromResults(chunks);

  return formatCountryNormalizationSection(evidence);
}

export function buildCountryNormalizationSectionSync(
  question: string,
  chunks: SearchResult[]
): string {
  if (!isCountrySupportQuestion(question)) {
    return "";
  }

  const config = loadEntityNormalizationConfigSync();
  const evidence = dedupeCountryEvidence(
    chunks.flatMap((chunk) =>
      extractCountryLikeLabels(chunk.snippet, config).map((rawEntity) => ({
        entity: normalizeCountryEntity(rawEntity, config),
        source: chunk.relativePath || chunk.fileName
      }))
    )
  );

  return formatCountryNormalizationSection(evidence);
}

function formatCountryNormalizationSection(evidence: CountryEvidence[]): string {
  if (evidence.length === 0) {
    return [
      "COUNTRY / ENTITY NORMALIZATION NOTES:",
      "- No clean country labels were detected automatically. Use the answer format rules and the provided context carefully."
    ].join("\n");
  }

  const normalized = evidence
    .filter((item) => !item.entity.truncated && item.entity.confidence !== "LOW")
    .map((item) => {
      const qualifier = item.entity.qualifier
        ? ` - qualifier/source label: ${item.entity.qualifier}`
        : "";
      const sourceLabel = item.entity.qualifier
        ? `source country label: "${item.entity.rawCountryLabel || item.entity.displayName}"`
        : `source label: "${item.entity.rawCountryLabel || item.entity.displayName}"`;
      return `- ${item.entity.displayName}${qualifier} (${sourceLabel}, source: ${item.source})`;
    });
  const truncated = evidence
    .filter((item) => item.entity.truncated)
    .map((item) => `- "${item.entity.rawValue}" in ${item.source}`);

  return [
    "COUNTRY / ENTITY NORMALIZATION NOTES:",
    ...normalized,
    truncated.length > 0 ? "Truncated or unclear entries not included as countries:" : "",
    ...truncated
  ]
    .filter(Boolean)
    .join("\n");
}

function extractCountryLikeLabels(
  text: string,
  config: EntityNormalizationConfig
): string[] {
  const labels = new Set<string>();
  const qualifierPattern = config.knownQualifiers
    .map((qualifier) => qualifierToPattern(qualifier))
    .join("|");
  const qualifierRegex = new RegExp(
    `\\b([A-Z][A-Za-z.]{1,24}(?:\\s+[A-Z][A-Za-z.]{1,24}){0,2})\\s+(${qualifierPattern})\\b`,
    "gi"
  );

  for (const match of text.matchAll(qualifierRegex)) {
    const raw = cleanEntityText(`${match[1]} ${match[2]}`);
    const countryPart = cleanEntityText(match[1]);
    if (!isIgnoredLabel(countryPart, config.ignoredLabels)) {
      labels.add(raw);
    }
  }

  for (const alias of Object.keys(config.countryAliases)) {
    const escaped = escapeRegex(alias);
    const aliasRegex = new RegExp(`\\b${escaped}\\b`, "i");
    if (aliasRegex.test(text) && !isIgnoredLabel(alias, config.ignoredLabels)) {
      labels.add(alias);
    }
  }

  const truncatedMatches = text.match(/\b[A-Z][a-z]{1,3}\.{2,}|\bGer\s*$/g);
  for (const truncated of truncatedMatches || []) {
    labels.add(truncated);
  }

  return Array.from(labels);
}

function dedupeCountryEvidence(evidence: CountryEvidence[]): CountryEvidence[] {
  const deduped = new Map<string, CountryEvidence>();

  for (const item of evidence) {
    const entity = item.entity;
    const key = entity.truncated
      ? `truncated:${entity.rawValue.toLowerCase()}`
      : `${entity.displayName.toLowerCase()}|${entity.qualifier?.toLowerCase() || ""}`;
    const existing = deduped.get(key);

    if (
      !existing ||
      confidenceRank(entity.confidence) > confidenceRank(existing.entity.confidence)
    ) {
      deduped.set(key, item);
    }
  }

  return Array.from(deduped.values());
}

function cleanEntityText(value: string): string {
  return value
    .replace(/^[\s,;:.\-•*\d()[\]]+/g, "")
    .replace(/^(?:i|ii|iii|iv|v|vi|vii|viii|ix|x)\.\s+/i, "")
    .replace(/[\s,;:.\-•*()[\]]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isTruncatedValue(value: string): boolean {
  return /\.{2,}|…$|\b[A-Z][a-z]{1,3}\.{2,}$|\bGer$/i.test(value);
}

function findTrailingQualifier(value: string, qualifiers: string[]): { raw: string; display: string } | null {
  const normalizedValue = normalizeQualifierKey(value);

  for (const qualifier of qualifiers) {
    const normalizedQualifier = normalizeQualifierKey(qualifier);
    if (normalizedValue.endsWith(normalizedQualifier)) {
      const rawMatch = value.match(new RegExp(`${qualifierToPattern(qualifier)}$`, "i"));
      return {
        raw: rawMatch?.[0] || qualifier,
        display: qualifier
      };
    }
  }

  return null;
}

function lookupCountryAlias(value: string, aliases: Record<string, string>): string | null {
  const normalized = normalizeAliasKey(value);
  const match = Object.entries(aliases).find(([alias]) => normalizeAliasKey(alias) === normalized);
  return match?.[1] || null;
}

function isIgnoredLabel(value: string, ignoredLabels: string[]): boolean {
  const normalized = normalizeAliasKey(value);
  return ignoredLabels.some((label) => normalizeAliasKey(label) === normalized);
}

function normalizeAliasKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeQualifierKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function qualifierToPattern(qualifier: string): string {
  if (/verifactu/i.test(qualifier)) {
    return "Veri\\*?Factu";
  }

  return escapeRegex(qualifier);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function confidenceRank(confidence: NormalizationConfidence): number {
  if (confidence === "HIGH") return 3;
  if (confidence === "MEDIUM") return 2;
  return 1;
}
