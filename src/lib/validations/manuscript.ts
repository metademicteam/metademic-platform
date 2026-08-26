import { z } from "zod";
import { ARTICLE_TYPES } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Reusable primitives
// ---------------------------------------------------------------------------

const orcidRegex = /^(\d{4}-){3}\d{3}[\dX]$/;

export const keywordSchema = z
  .string()
  .trim()
  .min(1, "Keyword cannot be empty.")
  .max(60, "Keyword too long (max 60).");

export const keywordsSchema = z
  .array(keywordSchema)
  .min(1, "At least one keyword is required.")
  .max(10, "At most 10 keywords.")
  .refine((arr) => new Set(arr.map((k) => k.toLowerCase())).size === arr.length, {
    message: "Duplicate keywords are not allowed.",
  });

export const authorSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required.").max(80),
  middleName: z.string().trim().max(80).optional().or(z.literal("")),
  lastName: z.string().trim().min(1, "Last name is required.").max(80),
  email: z.string().trim().email("Valid email is required.").optional().or(z.literal("")),
  orcid: z
    .string()
    .trim()
    .optional()
    .or(z.literal(""))
    .refine((v) => !v || orcidRegex.test(v), {
      message: "Invalid ORCID format (0000-0000-0000-0000).",
    }),
  institutionName: z.string().trim().max(200).optional().or(z.literal("")),
  department: z.string().trim().max(200).optional().or(z.literal("")),
  isCorresponding: z.boolean().default(false),
  contributionStatement: z.string().trim().max(500).optional().or(z.literal("")),
  authorOrder: z.number().int().positive(),
});

export type AuthorInput = z.infer<typeof authorSchema>;

export const authorsSchema = z
  .array(authorSchema)
  .min(1, "At least one author is required.")
  .max(30, "Too many authors (max 30).")
  .refine((authors) => authors.filter((a) => a.isCorresponding).length >= 1, {
    message: "At least one corresponding author is required.",
  })
  .refine(
    (authors) => {
      const orders = authors.map((a) => a.authorOrder);
      return new Set(orders).size === orders.length;
    },
    { message: "Author order must be unique." },
  );

// ---------------------------------------------------------------------------
// Title / Abstract
// ---------------------------------------------------------------------------

export const titleAbstractSchema = z.object({
  title: z
    .string()
    .trim()
    .min(10, "Title must be at least 10 characters.")
    .max(500, "Title must be at most 500 characters."),
  subtitle: z.string().trim().max(500).optional().or(z.literal("")),
  abstract: z
    .string()
    .trim()
    .min(50, "Abstract must be at least 50 characters.")
    .max(5000, "Abstract must be at most 5000 characters."),
  languageCode: z
    .string()
    .trim()
    .length(2, "Language code must be 2 letters (e.g. en).")
    .default("en"),
});

export type TitleAbstractInput = z.infer<typeof titleAbstractSchema>;

// ---------------------------------------------------------------------------
// Article type / subject areas
// ---------------------------------------------------------------------------

export const articleTypeSchema = z.object({
  articleType: z.enum(ARTICLE_TYPES as unknown as [string, ...string[]], {
    errorMap: () => ({ message: "Invalid article type." }),
  }),
  subjectAreas: z
    .array(z.string().trim().min(1).max(80))
    .min(1, "At least one subject area is required.")
    .max(10, "At most 10 subject areas."),
});

export type ArticleTypeInput = z.infer<typeof articleTypeSchema>;

// ---------------------------------------------------------------------------
// Declarations (TASK §10 + submission_declarations table)
// ---------------------------------------------------------------------------

export const declarationsSchema = z.object({
  conflictOfInterest: z.string().trim().max(2000).optional().or(z.literal("")),
  fundingStatement: z.string().trim().max(2000).optional().or(z.literal("")),
  ethicsStatement: z.string().trim().max(2000).optional().or(z.literal("")),
  dataAvailabilityStatement: z.string().trim().max(2000).optional().or(z.literal("")),
  authorContributions: z.string().trim().max(2000).optional().or(z.literal("")),
  acknowledgements: z.string().trim().max(2000).optional().or(z.literal("")),
  originalityConfirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm originality." }),
  }),
  ethicsConfirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm ethics compliance." }),
  }),
  authorshipConfirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm authorship." }),
  }),
  copyrightConfirmed: z.literal(true, {
    errorMap: () => ({ message: "You must confirm copyright transfer / license." }),
  }),
});

export type DeclarationsInput = z.infer<typeof declarationsSchema>;

// ---------------------------------------------------------------------------
// Suggested / excluded reviewers
// ---------------------------------------------------------------------------

export const suggestedReviewerSchema = z.object({
  reviewerName: z.string().trim().min(1, "Name is required.").max(120),
  reviewerEmail: z.string().trim().email("Valid email required.").optional().or(z.literal("")),
  institution: z.string().trim().max(200).optional().or(z.literal("")),
  expertise: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  reason: z.string().trim().max(500).optional().or(z.literal("")),
});

export type SuggestedReviewerInput = z.infer<typeof suggestedReviewerSchema>;

export const suggestedReviewersSchema = z
  .array(suggestedReviewerSchema)
  .max(10, "At most 10 suggested reviewers.");

export const excludedReviewerSchema = z.object({
  reviewerName: z.string().trim().max(120).optional().or(z.literal("")),
  reviewerEmail: z.string().trim().email().optional().or(z.literal("")),
  reason: z.string().trim().min(1, "Reason is required.").max(500),
});

export type ExcludedReviewerInput = z.infer<typeof excludedReviewerSchema>;

export const excludedReviewersSchema = z
  .array(excludedReviewerSchema)
  .max(10, "At most 10 excluded reviewers.");

// ---------------------------------------------------------------------------
// File validation helpers (client + server)
// ---------------------------------------------------------------------------

export const manuscriptFileSchema = z.object({
  fileType: z.enum([
    "manuscript",
    "supplementary",
    "figure",
    "table",
    "cover_letter",
    "response_to_reviewers",
    "tracked_changes",
    "clean_manuscript",
    "review_attachment",
    "proof",
    "production",
    "other",
  ]),
  originalFilename: z.string().trim().min(1).max(255),
  storagePath: z.string().trim().min(1),
  mimeType: z.string().trim().max(120).optional().or(z.literal("")),
  fileSize: z.number().int().positive().max(100 * 1024 * 1024).optional(),
});

export type ManuscriptFileInput = z.infer<typeof manuscriptFileSchema>;

// ---------------------------------------------------------------------------
// Full wizard schemas
// ---------------------------------------------------------------------------

export const manuscriptStep1JournalSchema = z.object({
  journalId: z.string().uuid("Select a journal."),
});

export const manuscriptWizardSchema = z.object({
  journalId: z.string().uuid(),
  articleType: z.enum(ARTICLE_TYPES as unknown as [string, ...string[]]),
  title: z.string().trim().min(10).max(500),
  subtitle: z.string().trim().max(500).optional().or(z.literal("")),
  abstract: z.string().trim().min(50).max(5000),
  languageCode: z.string().trim().length(2).default("en"),
  keywords: keywordsSchema,
  subjectAreas: z.array(z.string().trim().min(1).max(80)).min(1).max(10),
  authors: authorsSchema,
  declarations: declarationsSchema,
  suggestedReviewers: suggestedReviewersSchema.optional().default([]),
  excludedReviewers: excludedReviewersSchema.optional().default([]),
  files: z.array(manuscriptFileSchema).optional().default([]),
});

export type ManuscriptWizardInput = z.infer<typeof manuscriptWizardSchema>;

// ---------------------------------------------------------------------------
// Create / update (server)
// ---------------------------------------------------------------------------

export const createManuscriptSchema = z.object({
  journalId: z.string().uuid(),
  title: z.string().trim().min(10).max(500),
  subtitle: z.string().trim().max(500).optional().nullable(),
  abstract: z.string().trim().min(50).max(5000).optional().nullable(),
  articleType: z.enum(ARTICLE_TYPES as unknown as [string, ...string[]]).default("research_article"),
  keywords: z.array(z.string().trim().min(1).max(60)).max(10).default([]),
  subjectAreas: z.array(z.string().trim().min(1).max(80)).max(10).default([]),
  languageCode: z.string().trim().length(2).default("en"),
});

export type CreateManuscriptInput = z.infer<typeof createManuscriptSchema>;

export const updateManuscriptSchema = createManuscriptSchema.partial().extend({
  id: z.string().uuid(),
});

export type UpdateManuscriptInput = z.infer<typeof updateManuscriptSchema>;

// ---------------------------------------------------------------------------
// Review validation
// ---------------------------------------------------------------------------

export const reviewReportSchema = z.object({
  originalityScore: z.number().int().min(1).max(5).nullable().optional(),
  methodologyScore: z.number().int().min(1).max(5).nullable().optional(),
  literatureScore: z.number().int().min(1).max(5).nullable().optional(),
  resultsScore: z.number().int().min(1).max(5).nullable().optional(),
  discussionScore: z.number().int().min(1).max(5).nullable().optional(),
  writingScore: z.number().int().min(1).max(5).nullable().optional(),
  significanceScore: z.number().int().min(1).max(5).nullable().optional(),
  commentsToAuthor: z.string().trim().max(10000).optional().or(z.literal("")),
  confidentialCommentsToEditor: z.string().trim().max(10000).optional().or(z.literal("")),
  recommendation: z.enum(["accept", "minor_revision", "major_revision", "reject", "no_recommendation"]),
});

export type ReviewReportInput = z.infer<typeof reviewReportSchema>;

export const editorialDecisionSchema = z.object({
  manuscriptId: z.string().uuid(),
  reviewRoundId: z.string().uuid().nullable().optional(),
  decision: z.enum(["accept", "minor_revision", "major_revision", "reject", "withdrawn", "desk_reject"]),
  editorReason: z.string().trim().max(5000).optional().or(z.literal("")),
  overrideSystemRecommendation: z.boolean().default(false),
});

export type EditorialDecisionInput = z.infer<typeof editorialDecisionSchema>;
