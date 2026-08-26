import { describe, it, expect } from "vitest";
import { calculateApc } from "@/lib/services/apc-service";

describe("APC calculations", () => {
  it("base 1000, no discounts", () => {
    const r = calculateApc({ baseAmount: 1000 });
    expect(r.baseAmount).toBe(1000);
    expect(r.subtotal).toBe(1000);
    expect(r.totalAmount).toBe(1000);
    expect(r.currency).toBe("USD");
  });

  it("discount and waiver reduce subtotal", () => {
    const r = calculateApc({ baseAmount: 1000, discountAmount: 200, waiverAmount: 100 });
    expect(r.discountAmount).toBe(200);
    expect(r.waiverAmount).toBe(100);
    expect(r.subtotal).toBe(700);
  });

  it("discount capped to baseAmount", () => {
    const r = calculateApc({ baseAmount: 500, discountAmount: 1000 });
    expect(r.discountAmount).toBe(500);
    expect(r.subtotal).toBe(0);
  });

  it("waiver capped to remainder", () => {
    const r = calculateApc({ baseAmount: 1000, discountAmount: 200, waiverAmount: 900 });
    // remainder after discount = 800, so waiver capped to 800
    expect(r.waiverAmount).toBe(800);
    expect(r.subtotal).toBe(0);
  });

  it("tax calculation", () => {
    const r = calculateApc({ baseAmount: 1000, taxRate: 0.2 });
    expect(r.taxAmount).toBe(200);
    expect(r.totalAmount).toBe(1200);
  });

  it("tax on discounted subtotal", () => {
    const r = calculateApc({ baseAmount: 1000, discountAmount: 200, taxRate: 0.1 });
    // subtotal 800, tax 80, total 880
    expect(r.subtotal).toBe(800);
    expect(r.taxAmount).toBe(80);
    expect(r.totalAmount).toBe(880);
  });

  it("currency passthrough", () => {
    const r = calculateApc({ baseAmount: 500, currency: "EUR" });
    expect(r.currency).toBe("EUR");
  });

  it("round currency to 2 decimals", () => {
    const r = calculateApc({ baseAmount: 100.005, taxRate: 0.1 });
    // base rounds to 100.01, tax 10.00, total 110.01
    expect(r.baseAmount).toBe(100.01);
  });
});
