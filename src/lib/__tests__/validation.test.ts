import { describe, it, expect } from "vitest";
import { createManuscriptSchema, manuscriptWizardSchema, keywordsSchema, reviewReportSchema } from "@/lib/validations/manuscript";

describe("zod validation schemas", () => {
  it("createManuscriptSchema validates minimal valid input", () => {
    const parsed = createManuscriptSchema.safeParse({
      journalId: "00000000-0000-4000-a000-000000000001",
      title: "A valid title that is at least ten characters long",
      abstract: "This abstract is definitely more than fifty characters long and describes the research in sufficient detail.",
    });
    expect(parsed.success).toBe(true);
  });

  it("createManuscriptSchema rejects short title", () => {
    const parsed = createManuscriptSchema.safeParse({
      journalId: "00000000-0000-4000-a000-000000000001",
      title: "Short",
    });
    expect(parsed.success).toBe(false);
  });

  it("createManuscriptSchema rejects invalid journalId", () => {
    const parsed = createManuscriptSchema.safeParse({
      journalId: "not-a-uuid",
      title: "A valid title that is at least ten characters long",
    });
    expect(parsed.success).toBe(false);
  });

  it("keywordsSchema rejects duplicates (case-insensitive)", () => {
    const parsed = keywordsSchema.safeParse(["Machine Learning", "machine learning"]);
    expect(parsed.success).toBe(false);
  });

  it("keywordsSchema rejects empty", () => {
    expect(keywordsSchema.safeParse([]).success).toBe(false);
  });

  it("reviewReportSchema validates recommendation", () => {
    const parsed = reviewReportSchema.safeParse({ recommendation: "accept" });
    expect(parsed.success).toBe(true);
    const bad = reviewReportSchema.safeParse({ recommendation: "invalid" as never });
    expect(bad.success).toBe(false);
  });

  it("manuscriptWizardSchema requires declarations confirmations", () => {
    const base = {
      journalId: "00000000-0000-4000-a000-000000000001",
      articleType: "research_article" as const,
      title: "A valid title that is at least ten characters long for wizard",
      abstract: "This abstract is definitely more than fifty characters long and describes the research in sufficient detail for wizard validation.",
      keywords: ["test"],
      subjectAreas: ["test"],
      authors: [{ firstName: "Ada", lastName: "Lovelace", authorOrder: 1, isCorresponding: true }],
      declarations: {
        originalityConfirmed: true as const,
        ethicsConfirmed: true as const,
        authorshipConfirmed: true as const,
        copyrightConfirmed: true as const,
      },
      suggestedReviewers: [],
      excludedReviewers: [],
    };
    expect(manuscriptWizardSchema.safeParse(base).success).toBe(true);

    const missing = { ...base, declarations: { ...base.declarations, originalityConfirmed: false as unknown as true } };
    expect(manuscriptWizardSchema.safeParse(missing).success).toBe(false);
  });
});
