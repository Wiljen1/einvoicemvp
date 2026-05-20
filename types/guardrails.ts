export interface GuardrailCheckboxDefaults {
  keepAnswersShort: boolean;
  includeSources: boolean;
  includeConfidenceScore: boolean;
  sayWhenInformationIsMissing: boolean;
  useBusinessFriendlyLanguage: boolean;
}

export interface GuardrailsConfig {
  systemGuardrails: string[];
  checkboxDefaults: GuardrailCheckboxDefaults;
  userGuardrails: string;
}
