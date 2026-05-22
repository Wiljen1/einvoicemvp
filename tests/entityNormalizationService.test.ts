import { describe, expect, it } from "vitest";
import {
  dedupeNormalizedCountries,
  normalizeCombinedCountryLabelsInText,
  normalizeCountryEntity
} from "@/services/entityNormalizationService";

describe("entityNormalizationService", () => {
  it("splits country qualifiers from country display names", () => {
    expect(normalizeCountryEntity("Spain VeriFactu")).toMatchObject({
      displayName: "Spain",
      qualifier: "VeriFactu",
      rawValue: "Spain VeriFactu",
      confidence: "HIGH"
    });
    expect(normalizeCountryEntity("Denmark PEPPOL")).toMatchObject({
      displayName: "Denmark",
      qualifier: "PEPPOL",
      confidence: "HIGH"
    });
    expect(normalizeCountryEntity("US DBNA")).toMatchObject({
      displayName: "United States",
      qualifier: "DBNA",
      confidence: "HIGH"
    });
  });

  it("normalizes aliases without inventing truncated countries", () => {
    expect(normalizeCountryEntity("USA")).toMatchObject({
      displayName: "United States",
      confidence: "MEDIUM"
    });
    expect(normalizeCountryEntity("U.S.")).toMatchObject({
      displayName: "United States",
      confidence: "MEDIUM"
    });
    expect(normalizeCountryEntity("Brasil")).toMatchObject({
      displayName: "Brazil",
      confidence: "MEDIUM"
    });
    expect(normalizeCountryEntity("Ger...")).toMatchObject({
      displayName: "Unknown",
      confidence: "LOW",
      truncated: true
    });
  });

  it("deduplicates country entries while preserving qualifiers", () => {
    const deduped = dedupeNormalizedCountries([
      normalizeCountryEntity("US DBNA"),
      normalizeCountryEntity("USA DBNA"),
      normalizeCountryEntity("United States"),
      normalizeCountryEntity("Spain VeriFactu"),
      normalizeCountryEntity("Spain VeriFactu")
    ]);

    expect(deduped).toHaveLength(3);
    expect(deduped.map((entity) => `${entity.displayName}:${entity.qualifier || ""}`)).toEqual([
      "United States:DBNA",
      "United States:",
      "Spain:VeriFactu"
    ]);
  });

  it("cleans combined country labels in generated answer text", () => {
    const cleaned = normalizeCombinedCountryLabelsInText(
      "Spain Veri*Factu, US DBNA, Denmark PEPPOL, and Denmark Nemhandel are labels."
    );

    expect(cleaned).toContain("Spain - VeriFactu");
    expect(cleaned).toContain("United States - DBNA");
    expect(cleaned).toContain("Denmark - PEPPOL");
    expect(cleaned).toContain("Denmark - Nemhandel");
    expect(cleaned).not.toContain("US DBNA");
    expect(cleaned).not.toContain("Denmark PEPPOL");
  });
});
