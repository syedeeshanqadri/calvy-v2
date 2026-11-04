import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Clinic records (plain Consultation / Fee columns) and wallet credit at booking: how much credit pays, that it is
// spent atomically and only through a verified customer's ticket, and that a returned fee takes credit back once.

const db = vi.hoisted(() => ({
  customer: { findUnique: vi.fn() },
  client: { findFirst: vi.fn() },
  business: { findUnique: vi.fn() },
  customerCredit: { findMany: vi.fn(), create: vi.fn() },
  $executeRaw: vi.fn(async () => 1),
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));

import { applyCredit, creditToRemove, reduceCharge } from "@/lib/credit";
import { canMarkDone, consultationState, feeChoices, feeState } from "@/lib/clinicRecords";
import {
  CreditTicketError, InsufficientCreditError, creditForTicket, creditOfferFromQuery, readCreditTicket, removeCreditForReturn,
  signCreditTicket, spendCredit,
} from "@/lib/creditDb";
import { signTicket } from "@/lib/signedTicket";
import { GET as useCredit } from "@/app/api/customer/use-credit/route";

process.env.NEXTAUTH_SECRET = "test-secret";
const tx = db as never;
beforeEach(() => { vi.clearAllMocks(); db.customerCredit.findMany.mockResolvedValue([]); });

describe("how much credit pays", () => {
  it("never more than the balance or the charge", () => {
    expect(applyCredit(1000, 300)).toEqual({ usedMinor: 300, payMinor: 700 });
    expect(applyCredit(1000, 5000)).toEqual({ usedMinor: 1000, payMinor: 0 });
    expect(applyCredit(1000, 0)).toEqual({ usedMinor: 0, payMinor: 1000 });
  });
  it("the remaining charge keeps its parts adding up; fully covered means no charge and no fee", () => {
    const full = { chargeMinor: 1000, platformFeeMinor: 100, businessShareMinor: 900 };
    const part = reduceCharge(full, 400);
    expect(part.chargeMinor).toBe(600);
    expect(part.platformFeeMinor + part.businessShareMinor).toBe(600);
    expect(part.platformFeeMinor).toBe(60);
    expect(reduceCharge(full, 1000)).toEqual({ chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0 });
    expect(reduceCharge(full, 5000)).toEqual({ chargeMinor: 0, platformFeeMinor: 0, businessShareMinor: 0 });
    expect(reduceCharge(full, 0)).toEqual(full);
    const feeOnly = reduceCharge({ chargeMinor: 1000, platformFeeMinor: 1000, businessShareMinor: 0 }, 300);
    expect(feeOnly).toEqual({ chargeMinor: 700, platformFeeMinor: 700, businessShareMinor: 0 });
  });
  it("a returned fee takes back what that booking issued, never more than is left in the wallet", () => {
    expect(creditToRemove(1000, 0, 5000)).toBe(1000);
    expect(creditToRemove(1000, 0, 400)).toBe(400); // the rest was already spent
    expect(creditToRemove(1000, 1000, 5000)).toBe(0);
    expect(creditToRemove(1000, 0, 0)).toBe(0);
  });
});

describe("spending credit on a booking", () => {
  it("writes one negative USED entry tied to the booking, under the wallet lock", async () => {
    db.customerCredit.findMany.mockResolvedValue([{ amountMinor: 1500 }]);
    await spendCredit(tx, { businessId: "b1", clientId: "c1", appointmentId: "a1", amountMinor: 1000, currency: "INR" });
    expect(db.$executeRaw).toHaveBeenCalled();
    expect(db.customerCredit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "USED", amountMinor: -1000, appointmentId: "a1", businessId: "b1", clientId: "c1" }) });
  });
  it("refuses when the balance changed underneath (a parallel booking took it)", async () => {
    db.customerCredit.findMany.mockResolvedValue([{ amountMinor: 400 }]);
    await expect(spendCredit(tx, { businessId: "b1", clientId: "c1", appointmentId: "a1", amountMinor: 1000, currency: "INR" })).rejects.toBeInstanceOf(InsufficientCreditError);
    expect(db.customerCredit.create).not.toHaveBeenCalled();
  });
  it("spending nothing writes nothing", async () => {
    await spendCredit(tx, { businessId: "b1", clientId: "c1", appointmentId: "a1", amountMinor: 0, currency: "INR" });
    expect(db.customerCredit.create).not.toHaveBeenCalled();
  });
});

describe("a fee the clinic returned by hand", () => {
  const args = { businessId: "b1", clientId: "c1", appointmentId: "a1" };
  it("removes the matching credit from the wallet once", async () => {
    db.customerCredit.findMany
      .mockResolvedValueOnce([{ kind: "CANCELLED", amountMinor: 1000, currency: "INR" }]) // this booking's entries
      .mockResolvedValueOnce([{ amountMinor: 1000 }]); // wallet balance
    expect(await removeCreditForReturn(tx, args)).toBe(1000);
    expect(db.customerCredit.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: "REFUND_REMOVED", amountMinor: -1000, appointmentId: "a1" }) });
  });
  it("is a no-op the second time, when nothing became credit, or when it was already spent", async () => {
    db.customerCredit.findMany.mockResolvedValueOnce([{ kind: "CANCELLED", amountMinor: 1000, currency: "INR" }, { kind: "REFUND_REMOVED", amountMinor: -1000, currency: "INR" }]);
    expect(await removeCreditForReturn(tx, args)).toBe(0);
    db.customerCredit.findMany.mockResolvedValueOnce([]);
    expect(await removeCreditForReturn(tx, args)).toBe(0);
    db.customerCredit.findMany.mockResolvedValueOnce([{ kind: "MISSED", amountMinor: 1000, currency: "INR" }]).mockResolvedValueOnce([{ amountMinor: 0 }]);
    expect(await removeCreditForReturn(tx, args)).toBe(0);
    expect(db.customerCredit.create).not.toHaveBeenCalled();
  });
});

describe("the credit ticket", () => {
  const business = { id: "b1" };
  beforeEach(() => {
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: new Date() });
    db.customerCredit.findMany.mockResolvedValue([{ amountMinor: 800 }]);
  });
  it("round-trips; forged, expired, other-purpose or other-business tickets are refused", async () => {
    expect(readCreditTicket(signCreditTicket("c1", "b1"))).toEqual({ customerId: "c1", businessId: "b1" });
    expect(readCreditTicket(signCreditTicket("c1", "b1").replace("c1", "c2"))).toBeNull();
    expect(readCreditTicket(signTicket("use-credit", "c1:b1", "test-secret", 1000, Date.now() - 5000))).toBeNull();
    expect(readCreditTicket(signTicket("follow-up", "c1:b1", "test-secret", 60_000))).toBeNull();
    await expect(creditForTicket(tx, signCreditTicket("c1", "other"), business, { id: "cl1", email: "riya@mail.test" })).rejects.toBeInstanceOf(CreditTicketError);
    await expect(creditForTicket(tx, "garbage", business, { id: "cl1", email: "riya@mail.test" })).rejects.toBeInstanceOf(CreditTicketError);
  });
  it("gives the balance only to the verified customer's own client record", async () => {
    const t = signCreditTicket("c1", "b1");
    expect(await creditForTicket(tx, t, business, { id: "cl1", email: "Riya@Mail.test" })).toEqual({ balanceMinor: 800 });
    // someone typing another contact's details into a booking never touches this wallet
    expect(await creditForTicket(tx, t, business, { id: "cl2", email: "other@mail.test" })).toEqual({ balanceMinor: 0 });
    expect(await creditForTicket(tx, t, business, { id: "cl3", email: null })).toEqual({ balanceMinor: 0 });
    db.customer.findUnique.mockResolvedValue({ email: "riya@mail.test", emailVerified: null });
    await expect(creditForTicket(tx, t, business, { id: "cl1", email: "riya@mail.test" })).rejects.toBeInstanceOf(CreditTicketError);
  });
  it("the booking page only offers credit for a good ticket with a positive balance", async () => {
    db.client.findFirst.mockResolvedValue({ id: "cl1" });
    const t = signCreditTicket("c1", "b1");
    expect(await creditOfferFromQuery(t, { id: "b1", currency: "INR" })).toMatchObject({ balanceMinor: 800, email: "riya@mail.test" });
    expect(await creditOfferFromQuery(t, { id: "other", currency: "INR" })).toBeNull();
    expect(await creditOfferFromQuery(undefined, { id: "b1", currency: "INR" })).toBeNull();
    db.customerCredit.findMany.mockResolvedValue([{ amountMinor: 0 }]);
    expect(await creditOfferFromQuery(t, { id: "b1", currency: "INR" })).toBeNull();
  });
  it("the My wallet link sends a guest to login and a customer with no credit back to the wallet", async () => {
    const req = (slug: string) => new NextRequest(`http://localhost/api/customer/use-credit?business=${slug}`);
    session.current = null;
    expect((await useCredit(req("glow"))).headers.get("location")).toContain("/my/login");
    session.current = { user: { kind: "customer", customerId: "c1" } };
    db.customer.findUnique.mockResolvedValue({ id: "c1", name: "Riya", email: "riya@mail.test", emailVerified: new Date(), passwordChangedAt: null });
    db.business.findUnique.mockResolvedValue({ id: "b1", slug: "glow", currency: "INR" });
    db.client.findFirst.mockResolvedValue(null);
    expect((await useCredit(req("glow"))).headers.get("location")).toMatch(/\/my\/wallet$/);
  });
});

describe("clinic records columns", () => {
  it("Consultation is Done, Pending, Missed or Cancelled", () => {
    expect(consultationState("completed")).toBe("Done");
    expect(consultationState("confirmed")).toBe("Pending");
    expect(consultationState("pending")).toBe("Pending");
    expect(consultationState("no-show")).toBe("Missed");
    expect(consultationState("cancelled")).toBe("Cancelled");
    expect(canMarkDone("confirmed")).toBe(true);
    expect(canMarkDone("completed")).toBe(false);
    expect(canMarkDone("cancelled")).toBe(false);
  });
  it("Fee is Paid online, Paid at clinic, Not paid or Returned", () => {
    expect(feeState("paid", true)).toBe("Paid online");
    expect(feeState("paid", false)).toBe("Paid at clinic");
    expect(feeState("unpaid", false)).toBe("Not paid");
    expect(feeState("refunded", true)).toBe("Returned");
  });
  it("an online payment is already received: the desk can only return it, not unpay it", () => {
    expect(feeChoices("paid", true).map((c) => c.value)).toEqual(["paid", "refunded"]);
    expect(feeChoices("unpaid", false).map((c) => c.value)).toEqual(["unpaid", "paid", "refunded"]);
  });
});
