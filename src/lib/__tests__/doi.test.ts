import { describe, it, expect } from "vitest";
import { validateDoiPrefix, buildCrossrefMetadata } from "@/lib/services/doi-service";

describe("DOI generation", () => {
  it("validateDoiPrefix accepts valid prefixes", () => {
    expect(() => validateDoiPrefix("10.12345")).not.toThrow();
    expect(() => validateDoiPrefix("10.1234.5678")).not.toThrow();
    expect(() => validateDoiPrefix("10.55555")).not.toThrow();
  });

  it("validateDoiPrefix rejects invalid", () => {
    expect(() => validateDoiPrefix("11.12345")).toThrow();
    expect(() => validateDoiPrefix("10.123")).toThrow(); // too short
    expect(() => validateDoiPrefix("10.")).toThrow();
    expect(() => validateDoiPrefix("")).toThrow();
  });

  it("buildCrossrefMetadata produces expected shape", () => {
    const meta = buildCrossrefMetadata({
      journal: { name: "Journal of Test", shortName: "JTEST", issnPrint: "1234-5678", issnOnline: "1234-5679", publisherName: "Test Press" },
      article: {
        title: "Test Article",
        doi: "10.12345/test.2026.000001",
        publicUrl: "https://example.com/articles/test",
        licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
        publicationDate: new Date("2026-01-15"),
        authors: [
          { firstName: "Ada", lastName: "Lovelace", orcid: "0000-0001-0000-0001", affiliation: "Metademic University" },
        ],
      },
      depositor: { name: "Metademic", email: "crossref@metademic.test" },
    });

    expect(meta.journal.journal_title).toBe("Journal of Test");
    expect(meta.article.doi).toBe("10.12345/test.2026.000001");
    expect(meta.article.publication_date.year).toBe(2026);
    expect(meta.article.publication_date.month).toBe(1);
    expect(meta.article.contributors[0].given_name).toBe("Ada");
    expect(meta.depositor.email).toBe("crossref@metademic.test");
    expect(meta.doi_batch_id).toMatch(/^metademic-/);
  });
});
