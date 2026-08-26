import "server-only";

export type ConflictType =
  | "same_institution"
  | "same_email_domain"
  | "co_authorship"
  | "author_exclusion"
  | "author_suggestion";

export interface ConflictWarning {
  type: ConflictType;
  severity: "high" | "medium" | "low";
  message: string;
  details?: string;
}

export interface AuthorInfoForConflict {
  id?: string | null;
  email?: string | null;
  institutionName?: string | null;
  institutionId?: string | null;
}

export interface ReviewerInfoForConflict {
  userId: string;
  email?: string | null;
  institutionId?: string | null;
  institutionName?: string | null;
  reviewerProfileId?: string;
}

export interface ManuscriptConflictContext {
  manuscriptId: string;
  excludedReviewers: Array<{ reviewer_email?: string | null; reviewer_name?: string | null; reason?: string | null }>;
  suggestedReviewers: Array<{ reviewer_email?: string | null; reviewer_name?: string | null }>;
  authors: AuthorInfoForConflict[];
}

/**
 * Detects potential conflicts of interest between a reviewer and manuscript authors.
 * This is a pure function — does not query DB. Caller must provide pre-fetched data.
 *
 * Checks (TASK §18):
 *  - Same institution (by institution_id or normalized institution name)
 *  - Same email domain
 *  - Co-authorship (placeholder: checks if reviewer userId appears in author list — real impl would check publication history)
 *  - Explicit exclusion (manuscript_excluded_reviewers)
 *  - Author suggestion (manuscript_reviewer_suggestions)
 */
export function detectConflicts(
  reviewer: ReviewerInfoForConflict,
  context: ManuscriptConflictContext,
  options?: { coAuthorUserIds?: Set<string> }
): ConflictWarning[] {
  const warnings: ConflictWarning[] = [];
  const reviewerEmail = reviewer.email?.toLowerCase().trim() || null;
  const reviewerDomain = reviewerEmail ? reviewerEmail.split("@")[1] : null;
  const reviewerInstitution = reviewer.institutionName?.toLowerCase().trim() || null;

  for (const author of context.authors) {
    // Same institution by ID
    if (reviewer.institutionId && author.institutionId && reviewer.institutionId === author.institutionId) {
      warnings.push({
        type: "same_institution",
        severity: "high",
        message: "Potential conflict: Same institution as author",
        details: `${reviewer.institutionName ?? reviewer.institutionId} matches author institution`,
      });
    } else if (reviewerInstitution && author.institutionName) {
      const authorInst = author.institutionName.toLowerCase().trim();
      if (reviewerInstitution === authorInst && reviewerInstitution.length > 2) {
        warnings.push({
          type: "same_institution",
          severity: "high",
          message: "Potential conflict: Same institution (name match)",
          details: `${author.institutionName}`,
        });
      }
    }

    // Same email domain
    if (reviewerDomain && author.email) {
      const authorDomain = author.email.toLowerCase().trim().split("@")[1];
      if (authorDomain && reviewerDomain === authorDomain) {
        // Ignore generic domains
        const generic = new Set(["gmail.com", "yahoo.com", "hotmail.com", "outlook.com", "icloud.com", "protonmail.com"]);
        if (!generic.has(reviewerDomain)) {
          warnings.push({
            type: "same_email_domain",
            severity: "medium",
            message: "Same email domain as author",
            details: `Both use @${reviewerDomain}`,
          });
        }
      }
    }

    // Co-authorship placeholder — if reviewer userId matches author userId
    if (author.id && reviewer.userId === author.id) {
      warnings.push({
        type: "co_authorship",
        severity: "high",
        message: "Reviewer is an author on this manuscript",
        details: "Direct authorship overlap",
      });
    }
  }

  // Co-authorship via external set
  if (options?.coAuthorUserIds?.has(reviewer.userId)) {
    warnings.push({
      type: "co_authorship",
      severity: "high",
      message: "Known co-authorship with author",
      details: "Reviewer has prior co-authorship record with an author",
    });
  }

  // Author exclusion list
  if (reviewerEmail) {
    for (const ex of context.excludedReviewers) {
      const exEmail = ex.reviewer_email?.toLowerCase().trim();
      if (exEmail && exEmail === reviewerEmail) {
        warnings.push({
          type: "author_exclusion",
          severity: "high",
          message: "Author requested exclusion of this reviewer",
          details: ex.reason || "Excluded by author",
        });
      }
    }
  }

  // Author suggestion (informational, not a conflict but flagged per TASK §17-18)
  if (reviewerEmail) {
    for (const sug of context.suggestedReviewers) {
      const sugEmail = sug.reviewer_email?.toLowerCase().trim();
      if (sugEmail && sugEmail === reviewerEmail) {
        warnings.push({
          type: "author_suggestion",
          severity: "low",
          message: "Reviewer was suggested by author",
          details: "Author suggested this reviewer — consider independently",
        });
      }
    }
  }

  // Deduplicate by type+message
  const seen = new Set<string>();
  return warnings.filter((w) => {
    const key = `${w.type}:${w.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Helper to normalize institution name for comparison
 */
export function normalizeInstitutionName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[.,]/g, "");
}
