import { describe, it, expect } from "vitest";
import { calculateRecommendation } from "@/lib/services/review-service";

describe("review recommendation logic (mirrors calculate_review_recommendation SQL)", () => {
  it("2 accepts -> accept", () => {
    expect(calculateRecommendation({ accept: 2, minorRevision: 0, majorRevision: 0, reject: 0 })).toBe("accept");
  });

  it("2 rejects -> reject (takes priority over accept)", () => {
    expect(calculateRecommendation({ accept: 2, minorRevision: 0, majorRevision: 0, reject: 2 })).toBe("reject");
  });

  it("2 major revisions -> major_revision", () => {
    expect(calculateRecommendation({ accept: 0, minorRevision: 0, majorRevision: 2, reject: 0 })).toBe("major_revision");
  });

  it("accept + minor_revision >=2 -> minor_revision", () => {
    expect(calculateRecommendation({ accept: 1, minorRevision: 1, majorRevision: 0, reject: 0 })).toBe("minor_revision");
    expect(calculateRecommendation({ accept: 0, minorRevision: 2, majorRevision: 0, reject: 0 })).toBe("minor_revision");
  });

  it("otherwise -> no_recommendation", () => {
    expect(calculateRecommendation({ accept: 1, minorRevision: 0, majorRevision: 0, reject: 0 })).toBe("no_recommendation");
    expect(calculateRecommendation({ accept: 0, minorRevision: 0, majorRevision: 1, reject: 0 })).toBe("no_recommendation");
    expect(calculateRecommendation({ accept: 0, minorRevision: 0, majorRevision: 0, reject: 1 })).toBe("no_recommendation");
  });

  it("priority order: reject > accept > major > minor", () => {
    // 2 rejects should win even if 2 accepts also present
    expect(calculateRecommendation({ accept: 2, minorRevision: 2, majorRevision: 2, reject: 2 })).toBe("reject");
    // accept before major
    expect(calculateRecommendation({ accept: 2, minorRevision: 0, majorRevision: 2, reject: 0 })).toBe("accept");
  });
});
