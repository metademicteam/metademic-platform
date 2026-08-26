/**
 * RBAC helpers for journal-scoped roles.
 * All permission checks assume a `JournalMembership[]` array (from DB or session).
 * Server-side callers must also rely on RLS — these helpers are for UX + early rejection.
 */

export const USER_ROLES = [
  "author",
  "reviewer",
  "editor",
  "section_editor",
  "editor_in_chief",
  "managing_editor",
  "copyeditor",
  "production_editor",
  "finance_admin",
  "journal_manager",
  "journal_admin",
  "super_admin",
] as const;

export type UserRole = (typeof USER_ROLES)[number];

// ---------------------------------------------------------------------------
// Role groups
// ---------------------------------------------------------------------------

export const JOURNAL_ROLES: readonly UserRole[] = [...USER_ROLES];

export const EDITOR_ROLES: readonly UserRole[] = [
  "editor",
  "section_editor",
  "editor_in_chief",
  "managing_editor",
  "journal_manager",
  "journal_admin",
  "super_admin",
];

export const FINANCE_ROLES: readonly UserRole[] = [
  "finance_admin",
  "journal_manager",
  "journal_admin",
  "super_admin",
];

export const PRODUCTION_ROLES: readonly UserRole[] = [
  "copyeditor",
  "production_editor",
  "managing_editor",
  "journal_manager",
  "journal_admin",
  "super_admin",
];

export const ADMIN_ROLES: readonly UserRole[] = [
  "journal_admin",
  "journal_manager",
  "super_admin",
];

export const REVIEWER_ROLES: readonly UserRole[] = [
  "reviewer",
  "editor",
  "section_editor",
  "editor_in_chief",
  "managing_editor",
  "journal_manager",
  "journal_admin",
  "super_admin",
];

export interface JournalMembership {
  journalId: string;
  role: UserRole;
  isActive: boolean;
}

// ---------------------------------------------------------------------------
// Low-level helpers
// ---------------------------------------------------------------------------

export function hasJournalRole(
  memberships: JournalMembership[],
  journalId: string,
  roles: readonly UserRole[],
): boolean {
  return memberships.some(
    (m) => m.journalId === journalId && m.isActive && roles.includes(m.role),
  );
}

export function isSuperAdmin(memberships: JournalMembership[]): boolean {
  return memberships.some((m) => m.role === "super_admin" && m.isActive);
}

export function getRolesForJournal(
  memberships: JournalMembership[],
  journalId: string,
): UserRole[] {
  return memberships
    .filter((m) => m.journalId === journalId && m.isActive)
    .map((m) => m.role);
}

export function hasAnyRole(
  memberships: JournalMembership[],
  roles: readonly UserRole[],
): boolean {
  return memberships.some((m) => m.isActive && roles.includes(m.role));
}

// ---------------------------------------------------------------------------
// Domain permission checks
// ---------------------------------------------------------------------------

/**
 * Can the user view / manage this manuscript?
 * Authors can see their own manuscripts; editors can see any in their journals.
 */
export function canAccessManuscript(
  memberships: JournalMembership[],
  manuscript: { journalId: string; submittedBy: string | null; authorUserIds: string[] },
  currentUserId: string,
): boolean {
  if (isSuperAdmin(memberships)) return true;
  if (manuscript.submittedBy === currentUserId) return true;
  if (manuscript.authorUserIds.includes(currentUserId)) return true;
  if (hasJournalRole(memberships, manuscript.journalId, EDITOR_ROLES)) return true;
  if (hasJournalRole(memberships, manuscript.journalId, PRODUCTION_ROLES)) return true;
  if (hasJournalRole(memberships, manuscript.journalId, FINANCE_ROLES)) return true;
  return false;
}

export function canAssignEditor(memberships: JournalMembership[], journalId: string): boolean {
  if (isSuperAdmin(memberships)) return true;
  return hasJournalRole(memberships, journalId, [
    "editor_in_chief",
    "managing_editor",
    "journal_manager",
    "journal_admin",
  ]);
}

export function canMakeEditorialDecision(
  memberships: JournalMembership[],
  journalId: string,
): boolean {
  if (isSuperAdmin(memberships)) return true;
  return hasJournalRole(memberships, journalId, EDITOR_ROLES);
}

export function canInviteReviewers(
  memberships: JournalMembership[],
  journalId: string,
): boolean {
  if (isSuperAdmin(memberships)) return true;
  return hasJournalRole(memberships, journalId, EDITOR_ROLES);
}

export function canAccessFinance(memberships: JournalMembership[], journalId: string): boolean {
  if (isSuperAdmin(memberships)) return true;
  return hasJournalRole(memberships, journalId, FINANCE_ROLES);
}

export function canAccessProduction(
  memberships: JournalMembership[],
  journalId: string,
): boolean {
  if (isSuperAdmin(memberships)) return true;
  return hasJournalRole(memberships, journalId, PRODUCTION_ROLES);
}

export function canManageJournal(
  memberships: JournalMembership[],
  journalId: string,
): boolean {
  if (isSuperAdmin(memberships)) return true;
  return hasJournalRole(memberships, journalId, ADMIN_ROLES);
}

/**
 * Map roles to their primary dashboard path.
 */
export function getDashboardPathForRole(role: UserRole): string {
  switch (role) {
    case "author":
      return "/author/dashboard";
    case "reviewer":
      return "/reviewer/dashboard";
    case "editor":
    case "section_editor":
    case "editor_in_chief":
    case "managing_editor":
      return "/editor/dashboard";
    case "copyeditor":
    case "production_editor":
      return "/production/dashboard";
    case "finance_admin":
      return "/finance/dashboard";
    case "journal_manager":
    case "journal_admin":
    case "super_admin":
      return "/admin/dashboard";
    default:
      return "/author/dashboard";
  }
}

/**
 * For a user with multiple memberships, pick the most privileged dashboard.
 */
export function getPrimaryDashboard(memberships: JournalMembership[]): string {
  if (isSuperAdmin(memberships)) return "/admin/dashboard";
  if (hasAnyRole(memberships, ADMIN_ROLES)) return "/admin/dashboard";
  if (hasAnyRole(memberships, EDITOR_ROLES)) return "/editor/dashboard";
  if (hasAnyRole(memberships, PRODUCTION_ROLES)) return "/production/dashboard";
  if (hasAnyRole(memberships, FINANCE_ROLES)) return "/finance/dashboard";
  if (hasAnyRole(memberships, ["reviewer"])) return "/reviewer/dashboard";
  return "/author/dashboard";
}
