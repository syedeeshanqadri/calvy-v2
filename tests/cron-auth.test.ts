import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

const { findMany, update, sendBookingReminder, sendReminderWhatsApp } = vi.hoisted(() => ({
  findMany: vi.fn(),
  update: vi.fn(),
  sendBookingReminder: vi.fn(),
  sendReminderWhatsApp: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { appointment: { findMany, update } } }));
vi.mock("@/lib/email", () => ({ sendBookingReminder }));
vi.mock("@/lib/whatsapp", () => ({ sendReminderWhatsApp }));
vi.mock("@/lib/push", () => ({ sendPushToBusiness: vi.fn().mockResolvedValue(undefined) }));

function appt(client: { email: string; phone: string | null }) {
  return {
    id: "a1",
    businessId: "b1",
    date: new Date("2026-10-16T10:00:00Z"),
    client: { name: "C", ...client },
    service: { name: "S" },
    business: { name: "B", timezone: "Asia/Kolkata" },
  };
}
const req = (auth?: string) =>
  new NextRequest("http://localhost/api/cron/reminders", { headers: auth ? { authorization: auth } : {} });

async function call(auth?: string) {
  const { GET } = await import("@/app/api/cron/reminders/route");
  return GET(req(auth));
}

describe("cron reminders", () => {
  beforeEach(() => {
    // 15 Oct 2026 11:30 IST, so the fixture appointment (16 Oct 15:30 IST) is "tomorrow" in the business zone.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-15T06:00:00Z"));
    vi.resetModules();
    findMany.mockReset().mockResolvedValue([]);
    update.mockReset().mockResolvedValue({});
    sendBookingReminder.mockReset();
    sendReminderWhatsApp.mockReset().mockResolvedValue(undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

  describe("auth", () => {
    it("production without CRON_SECRET -> 401 and does not run", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CRON_SECRET", "");
      expect((await call()).status).toBe(401);
      expect((await call("Bearer ")).status).toBe(401);
      expect(findMany).not.toHaveBeenCalled();
    });
    it("wrong secret -> 401 (also different length / missing header)", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CRON_SECRET", "s3cret");
      expect((await call("Bearer wrong!")).status).toBe(401);
      expect((await call("Bearer x")).status).toBe(401);
      expect((await call()).status).toBe(401);
      expect(findMany).not.toHaveBeenCalled();
    });
    it("right secret -> 200", async () => {
      vi.stubEnv("NODE_ENV", "production");
      vi.stubEnv("CRON_SECRET", "s3cret");
      expect((await call("Bearer s3cret")).status).toBe(200);
      expect(findMany).toHaveBeenCalled();
    });
    it("non-production without secret is allowed", async () => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("CRON_SECRET", "");
      expect((await call()).status).toBe(200);
    });
  });

  describe("reminderSent rules", () => {
    beforeEach(() => {
      vi.stubEnv("NODE_ENV", "development");
      vi.stubEnv("CRON_SECRET", "");
    });
    it("email delivered -> marked sent", async () => {
      findMany.mockResolvedValue([appt({ email: "a@b.c", phone: null })]);
      sendBookingReminder.mockResolvedValue({ ok: true, id: "1" });
      const body = await (await call()).json();
      expect(update).toHaveBeenCalledWith({ where: { id: "a1" }, data: { reminderSent: true } });
      expect(body.sent).toBe(1);
    });
    it("email failed (ok:false) -> not marked", async () => {
      findMany.mockResolvedValue([appt({ email: "a@b.c", phone: null })]);
      sendBookingReminder.mockResolvedValue({ ok: false });
      const body = await (await call()).json();
      expect(update).not.toHaveBeenCalled();
      expect(body.sent).toBe(0);
    });
    it("email throws -> not marked", async () => {
      findMany.mockResolvedValue([appt({ email: "a@b.c", phone: null })]);
      sendBookingReminder.mockRejectedValue(new Error("boom"));
      await call();
      expect(update).not.toHaveBeenCalled();
    });
    it("email failed but whatsapp attempted -> not marked (whatsapp result unverifiable)", async () => {
      findMany.mockResolvedValue([appt({ email: "a@b.c", phone: "+15550001" })]);
      sendBookingReminder.mockResolvedValue({ ok: false });
      await call();
      expect(update).not.toHaveBeenCalled();
    });
    it("phone only, whatsapp resolved -> marked", async () => {
      findMany.mockResolvedValue([appt({ email: "", phone: "+15550001" })]);
      await call();
      expect(update).toHaveBeenCalledTimes(1);
    });
    it("phone only, whatsapp threw -> not marked", async () => {
      findMany.mockResolvedValue([appt({ email: "", phone: "+15550001" })]);
      sendReminderWhatsApp.mockRejectedValue(new Error("x"));
      await call();
      expect(update).not.toHaveBeenCalled();
    });
    it("no email and no phone -> marked (nothing to send)", async () => {
      findMany.mockResolvedValue([appt({ email: "", phone: null })]);
      await call();
      expect(update).toHaveBeenCalledTimes(1);
      expect(sendBookingReminder).not.toHaveBeenCalled();
    });
  });
});
