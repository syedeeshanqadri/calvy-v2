import { describe, it, expect, vi, beforeEach } from "vitest";

// The web-push send itself: how the push service's answers map to "sent", "device expired (404/410)", "retry" and "permanent".

const wp = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "BPublicKeyForTests";
  process.env.VAPID_PRIVATE_KEY = "privateKeyForTests";
  return { sendNotification: vi.fn(), setVapidDetails: vi.fn() };
});
vi.mock("web-push", () => ({ default: wp }));

import { deliverPush, isPushConfigured } from "@/lib/push";

const sub = { endpoint: "https://push.example/abc", p256dh: "p", auth: "a" };
const fail = (statusCode?: number) => Object.assign(new Error("push failed"), statusCode === undefined ? {} : { statusCode });
beforeEach(() => { wp.sendNotification.mockReset(); });

describe("deliverPush", () => {
  it("is configured with the two VAPID keys", () => expect(isPushConfigured()).toBe(true));
  it("sends the payload to the subscription", async () => {
    wp.sendNotification.mockResolvedValue({});
    expect(await deliverPush(sub, { title: "New booking", body: "Riya K." })).toEqual({ kind: "sent" });
    const [s, payload] = wp.sendNotification.mock.calls[0];
    expect(s).toEqual({ endpoint: sub.endpoint, keys: { p256dh: "p", auth: "a" } });
    expect(JSON.parse(payload)).toEqual({ title: "New booking", body: "Riya K." });
  });
  it.each([[404], [410]])("%i means the browser dropped the subscription: expired, so the device is deleted", async (status) => {
    wp.sendNotification.mockImplementation(async () => { throw fail(status); });
    expect(await deliverPush(sub, { title: "t", body: "b" })).toEqual({ kind: "expired" });
  });
  it.each([[429], [500], [503], [408]])("%i and network errors are worth a retry", async (status) => {
    wp.sendNotification.mockImplementation(async () => { throw fail(status); });
    expect((await deliverPush(sub, { title: "t", body: "b" })).kind).toBe("retry");
  });
  it("a network error with no status is retried", async () => {
    wp.sendNotification.mockImplementation(async () => { throw fail(); });
    expect((await deliverPush(sub, { title: "t", body: "b" })).kind).toBe("retry");
  });
  it.each([[400], [401], [403], [413]])("%i is permanent for this message", async (status) => {
    wp.sendNotification.mockImplementation(async () => { throw fail(status); });
    expect((await deliverPush(sub, { title: "t", body: "b" })).kind).toBe("permanent");
  });
});
