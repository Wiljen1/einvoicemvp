import { fallbackMessage } from "./guardrailsService";

export interface ChatQuestionSafetyDecision {
  blocked: boolean;
  answer?: string;
}

const outsideKnowledgeMessage = `${fallbackMessage} I cannot use general knowledge, browse the internet, or access files outside the active indexed document source.`;

const unsafeScopeMessage =
  "I can only answer from the active indexed document source. I cannot use all files on this computer or search outside the configured document source.";

const unsupportedActionMessage = `${fallbackMessage} I cannot help with requests that require external scraping or sources outside the active indexed document source.`;

const guardrailConflictMessage =
  "I cannot follow instructions that weaken the protected document-only guardrails. I can only answer from the active indexed document source, include evidence when available, and say when information is missing.";

const outsideKnowledgePatterns = [
  /\bweather\b|\bforecast\b|\btemperature\b/i,
  /\bwho won\b.*\b(final|league|match|game|election|championship)\b/i,
  /\b(champions league|world cup|super bowl|nba finals|premier league)\b/i,
  /\b(latest|current|today'?s?|right now|recent)\b.*\b(earnings|quarterly|results|rules|news|price|stock|market)\b/i,
  /\b(best|top|recommended)\b.*\b(restaurant|hotel|bar|place to eat)\b/i,
  /\bcapital of\b/i,
  /\bpublic reviews?\b|\breview sites?\b|\bthird[-\s]?party reviews?\b/i,
  /\b(compare|versus|vs\.?)\b.*\b(public reviews?|review sites?|third[-\s]?party)\b/i
];

const externalAccessPatterns = [
  /\b(use|browse|search|check|look up)\b.*\b(internet|web|online|external sources?|external websites?)\b/i,
  /\bfrom your general knowledge\b|\bgeneral knowledge\b/i
];

const unsafeScopePatterns = [
  /\ball files\b.*\b(computer|machine|laptop|mac|pc)\b/i,
  /\bnot just\b.*\b(indexed|configured|approved)\b.*\b(folder|source|documents?)\b/i,
  /\boutside\b.*\b(indexed|configured|approved)\b.*\b(folder|source|documents?)\b/i
];

const unsupportedActionPatterns = [
  /\bscrape\b.*\b(linkedin|profiles?|websites?|internet|web)\b/i,
  /\blinkedin\b.*\b(scrape|profiles?)\b/i
];

const guardrailConflictPatterns = [
  /\banswer confidently\b.*\b(missing|unsupported|not in (the )?(documents?|documentation|source))\b/i,
  /\beven if\b.*\b(missing|unsupported|not in (the )?(documents?|documentation|source))\b/i,
  /\bpretend\b.*\b(documents?|documentation|sources?)\b.*\bsay\b/i,
  /\bignore\b.*\b(previous|system|guardrails?|instructions?)\b/i
];

export function evaluateChatQuestionSafety(question: string): ChatQuestionSafetyDecision {
  const normalized = question.trim();

  if (!normalized) {
    return { blocked: false };
  }

  if (matchesAny(normalized, unsafeScopePatterns)) {
    return {
      blocked: true,
      answer: unsafeScopeMessage
    };
  }

  if (matchesAny(normalized, unsupportedActionPatterns)) {
    return {
      blocked: true,
      answer: unsupportedActionMessage
    };
  }

  if (matchesAny(normalized, guardrailConflictPatterns)) {
    return {
      blocked: true,
      answer: guardrailConflictMessage
    };
  }

  if (matchesAny(normalized, externalAccessPatterns) || matchesAny(normalized, outsideKnowledgePatterns)) {
    return {
      blocked: true,
      answer: outsideKnowledgeMessage
    };
  }

  return { blocked: false };
}

function matchesAny(value: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(value));
}
