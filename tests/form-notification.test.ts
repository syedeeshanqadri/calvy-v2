import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { create, row } = vi.hoisted(() => ({ create: vi.fn(), row: { current: null as Record<string, unknown> | null } }));
const send = vi.hoisted(() => vi.fn());
vi.mock("resend", () => ({ Resend: class { emails = { send }; } }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    notificationOutbox: {
      createMany: create,
      findMany: vi.fn(async () => [{ id: "n1" }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => row.current),
    },
  },
}));

import { sendFormNotification } from "@/lib/email";

beforeEach(() => {
  send.mockReset().mockResolvedValue({ data: { id: "m1" }, error: null });
  create.mockReset().mockImplementation(async ({ data }: { data: Record<string, unknown>[] }) => {
    row.current = { id: "n1", attempts: 1, expiresAt: null, secret: null, ...data[0] };
    return { count: 1 };
  });
  vi.stubEnv("RESEND_API_KEY", "re_test_key");
});
afterEach(() => vi.unstubAllEnvs());

describe("sendFormNotification", () => {
  it("emails the owner a table of the fields, skipping empty values", async () => {
    vi.stubEnv("NOTIFY_EMAIL", "owner@example.test");
    await sendFormNotification({ title: "New lead", fields: { Name: "Jo", Phone: "", Demo: true, Note: undefined } });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("owner@example.test");
    expect(arg.subject).toBe("New lead");
    expect(arg.html).toContain("Jo");
    expect(arg.html).toContain("yes");
    expect(arg.html).not.toContain("Phone");
    expect(arg.html).not.toContain("Note");
  });

  it("defaults to the support address when NOTIFY_EMAIL is unset", async () => {
    vi.stubEnv("NOTIFY_EMAIL", "");
    await sendFormNotification({ title: "New signup", fields: { Email: "a@b.test" } });
    expect(send.mock.calls[0][0].to).toBe("qadri.eeshan@gmail.com");
  });

  it("escapes HTML in submitted values", async () => {
    await sendFormNotification({ title: "New lead", fields: { Message: "<script>alert(1)</script>" } });
    expect(send.mock.calls[0][0].html).not.toContain("<script>alert(1)</script>");
  });

  it("two submissions are two messages, and the provider gets a retry-safe key", async () => {
    await sendFormNotification({ title: "x", fields: { a: 1 } });
    await sendFormNotification({ title: "x", fields: { a: 1 } });
    const keys = create.mock.calls.map(([{ data }]) => data[0].idempotencyKey);
    expect(keys[0]).not.toBe(keys[1]);
    expect(send.mock.calls[0][1]).toEqual({ idempotencyKey: "n1" });
  });

  it("never throws, even when the provider or the database fails or email is not configured", async () => {
    send.mockRejectedValue(new Error("boom"));
    await expect(sendFormNotification({ title: "x", fields: { a: 1 } })).resolves.toBeUndefined();
    vi.stubEnv("RESEND_API_KEY", "");
    await expect(sendFormNotification({ title: "x", fields: { a: 1 } })).resolves.toBeUndefined();
    create.mockRejectedValue(new Error("db down"));
    await expect(sendFormNotification({ title: "x", fields: { a: 1 } })).resolves.toBeUndefined();
  });
});
