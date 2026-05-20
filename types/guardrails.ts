export interface GuardrailsConfig {
  answerOnlyFromDocuments: boolean;
  includeSources: boolean;
  includeConfidenceScore: boolean;
  allowInternetBrowsing: boolean;
  keepAnswersShort: boolean;
  doNotSpeculate: boolean;
  sayWhenInformationIsMissing: boolean;
  tone: string;
  fallbackMessage: string;
}
