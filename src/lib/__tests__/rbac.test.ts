import { describe, it, expect } from "vitest";
import { hasJournalRole, canAssignEditor, canMakeEditorialDecision, canAccessFinance, isSuperAdmin } from "@/lib/rbac";

describe("RBAC permission checks", () => {
  const journalA = "journal-a";
  const journalB = "journal-b";

  it("hasJournalRole returns true for matching role", () => {
    const memberships = [{ journalId: journalA, role: "editor" as const, isActive: true }];
    expect(hasJournalRole(memberships, journalA, ["editor"])).toBe(true);
    expect(hasJournalRole(memberships, journalB, ["editor"])).toBe(false);
  });

  it("inactive membership is ignored", () => {
    const memberships = [{ journalId: journalA, role: "editor" as const, isActive: false }];
    expect(hasJournalRole(memberships, journalA, ["editor"])).toBe(false);
  });

  it("canAssignEditor requires privileged editor roles", () => {
    const editor = [{ journalId: journalA, role: "editor" as const, isActive: true }];
    expect(canAssignEditor(editor, journalA)).toBe(false); // plain editor cannot
    const eic = [{ journalId: journalA, role: "editor_in_chief" as const, isActive: true }];
    expect(canAssignEditor(eic, journalA)).toBe(true);
    const managing = [{ journalId: journalA, role: "managing_editor" as const, isActive: true }];
    expect(canAssignEditor(managing, journalA)).toBe(true);
  });

  it("super_admin bypasses journal scoping", () => {
    const memberships = [{ journalId: journalA, role: "super_admin" as const, isActive: true }];
    expect(isSuperAdmin(memberships)).toBe(true);
    expect(canMakeEditorialDecision(memberships, journalB)).toBe(true);
    expect(canAccessFinance(memberships, journalB)).toBe(true);
  });

  it("finance access limited to finance roles", () => {
    const reviewer = [{ journalId: journalA, role: "reviewer" as const, isActive: true }];
    expect(canAccessFinance(reviewer, journalA)).toBe(false);
    const finance = [{ journalId: journalA, role: "finance_admin" as const, isActive: true }];
    expect(canAccessFinance(finance, journalA)).toBe(true);
  });

  it("journal isolation: role in A does not grant in B", () => {
    const memberships = [{ journalId: journalA, role: "editor_in_chief" as const, isActive: true }];
    expect(canMakeEditorialDecision(memberships, journalA)).toBe(true);
    expect(canMakeEditorialDecision(memberships, journalB)).toBe(false);
  });
});
