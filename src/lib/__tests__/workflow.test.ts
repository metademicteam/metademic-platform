import { describe, it, expect } from "vitest";
import { canTransition, validateTransition, WorkflowError } from "@/lib/workflow";

describe("workflow state machine", () => {
  it("allows draft -> submitted", () => {
    expect(canTransition("draft", "submitted")).toBe(true);
  });

  it("blocks published -> draft", () => {
    expect(canTransition("published", "draft")).toBe(false);
  });

  it("blocks published -> any (terminal)", () => {
    expect(canTransition("published", "retracted")).toBe(true); // published -> retracted is allowed
    expect(canTransition("published", "submitted")).toBe(false);
    expect(canTransition("published", "accepted")).toBe(false);
  });

  it("allows accepted -> apc_pending or copyediting", () => {
    expect(canTransition("accepted", "apc_pending")).toBe(true);
    expect(canTransition("accepted", "copyediting")).toBe(true);
  });

  it("blocks rejected from transitioning", () => {
    expect(canTransition("rejected", "draft")).toBe(false);
    expect(canTransition("rejected", "submitted")).toBe(false);
  });

  it("validateTransition throws WorkflowError for invalid", () => {
    expect(() => validateTransition("published", "draft")).toThrow(WorkflowError);
    try {
      validateTransition("published", "draft");
    } catch (e) {
      expect((e as WorkflowError).from).toBe("published");
      expect((e as WorkflowError).to).toBe("draft");
      expect((e as WorkflowError).allowed).toEqual(["retracted"]);
    }
  });

  it("validateTransition throws when from === to", () => {
    expect(() => validateTransition("draft", "draft")).toThrow(WorkflowError);
  });

  it("rejected is terminal (no outgoing except none)", () => {
    expect(canTransition("rejected", "withdrawn")).toBe(false);
  });

  it("draft cannot go directly to published", () => {
    expect(canTransition("draft", "published")).toBe(false);
  });
});
