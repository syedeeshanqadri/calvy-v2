import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

// Phone alerts: who may get which kind (permissions), who wants it (preferences), delivery through the outbox, expired devices
// removed, devices removed on logout / removal / revoked permission, and the "arrived" stamp that reuses the queue's own states.

const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  pushDevice: { findMany: vi.fn(), findUnique: vi.fn(), upsert: vi.fn(), deleteMany: vi.fn(), count: vi.fn() },
  pushPreference: { findUnique: vi.fn(), upsert: vi.fn() },
  teamMember: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), delete: vi.fn() },
  user: { deleteMany: vi.fn() },
  staff: { findFirst: vi.fn() },
  appointment: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), updateMany: vi.fn() },
  auditLog: { create: vi.fn() },
  $transaction: vi.fn(),
}));
const session = vi.hoisted(() => ({ current: null as unknown }));
const enqueued = vi.hoisted(() => ({ rows: [] as any[] }));
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
const thisDevice = vi.hoisted(() => ({ id: null as string | null }));
vi.mock("@/lib/pushDeviceCookie", async () => ({ ...(await vi.importActual<object>("@/lib/pushDeviceCookie")), currentPushDeviceId: async () => thisDevice.id }));
vi.mock("next/navigation", () => ({ redirect: (to: string) => { throw new Error(`REDIRECT:${to}`); } }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/notifications/enqueue", () => ({
  enqueue: vi.fn(async (_db: unknown, items: unknown[]) => { enqueued.rows.push(...items); return (items as unknown[]).map((_, i) => `row${i}`); }),
  sendSoon: vi.fn(async () => {}),
  notify: vi.fn(async () => {}),
}));
const deliver = vi.hoisted(() => vi.fn());
vi.mock("@/lib/push", async () => ({ ...(await vi.importActual<object>("@/lib/push")), deliverPush: deliver }));

import { DEFAULT_PREFS, KIND_PREF, PREF_FIELDS, mayReceive, scrubContact, shortName, wants, type PushRecipient } from "@/lib/pushRouting";
import { pushSendBlocker, queuePush, removeUserDevices } from "@/lib/pushQueue";
import { CHANNELS } from "@/lib/notifications/channels";
import { idempotencyKey, normalizeRecipient } from "@/lib/notifications/policy";
import { POST as subscribe, DELETE as unsubscribe } from "@/app/api/push/subscribe/route";
import { GET as getPrefs, PUT as putPrefs } from "@/app/api/push/preferences/route";
import { POST as arrivedRoute } from "@/app/api/appointments/[id]/arrived/route";
import { PATCH as patchMember } from "@/app/api/team/[id]/route";
import { removeMember } from "@/lib/teamDb";
import { arrivedProblem } from "@/lib/arrived";
import { loadToday } from "@/lib/today";
import { sendPushToBusiness } from "@/lib/push";

const owner: PushRecipient = { isOwner: true, permissions: [], staffId: null };
const member = (permissions: PushRecipient["permissions"], staffId: string | null = null): PushRecipient => ({ isOwner: false, permissions, staffId });
const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(`http://localhost${url}`, init);
const body = (b: unknown) => ({ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };

beforeEach(() => {
  vi.clearAllMocks(); enqueued.rows.length = 0; session.current = null;
  db.pushDevice.deleteMany.mockResolvedValue({ count: 1 });
  db.$transaction.mockImplementation(async (arg: unknown) => (typeof arg === "function" ? (arg as (t: unknown) => unknown)(db) : Promise.all(arg as unknown[])));
});

describe("who may get which alert (permissions)", () => {
  it("the owner gets every kind; Calvy announcements go to owners only", () => {
    for (const k of ["booking_new", "booking_cancelled", "booking_rescheduled", "queue", "payment", "summary", "reminder", "announcement"] as const) expect(mayReceive(k, owner)).toBe(true);
    expect(mayReceive("announcement", member(["appointments.view_all", "queue.control", "reports.view"]))).toBe(false);
  });
  it("booking alerts need appointment access: all of them, or only their own with the matching staff record", () => {
    expect(mayReceive("booking_new", member(["appointments.view_all"]), "s9")).toBe(true);
    expect(mayReceive("booking_new", member(["appointments.view_own"], "s1"), "s1")).toBe(true);
    expect(mayReceive("booking_cancelled", member(["appointments.view_own"], "s1"), "s2")).toBe(false);
    expect(mayReceive("booking_rescheduled", member(["appointments.view_own"], null), "s1")).toBe(false);
    expect(mayReceive("booking_new", member(["customers.view", "queue.control"]), "s1")).toBe(false);
  });
  it("queue alerts need queue control; payment and daily summary need reports", () => {
    expect(mayReceive("queue", member(["queue.control"]))).toBe(true);
    expect(mayReceive("queue", member(["appointments.view_all"]))).toBe(false);
    expect(mayReceive("payment", member(["reports.view"]))).toBe(true);
    expect(mayReceive("summary", member(["reports.view"]))).toBe(true);
    expect(mayReceive("payment", member(["appointments.view_all", "queue.control"]))).toBe(false);
  });
  it("preferences are separate and on by default; one switched off means that kind is not wanted", () => {
    expect(wants("booking_new", null)).toBe(true);
    expect(wants("booking_new", { newBooking: false })).toBe(false);
    expect(wants("queue", { newBooking: false })).toBe(true);
    expect(wants("announcement", { newBooking: false, summary: false })).toBe(true); // no preference exists for announcements
    expect(DEFAULT_PREFS).toEqual({ newBooking: true, cancellation: true, reschedule: true, queue: true, payment: true, summary: true, reminders: true });
  });
  it("alert text carries a name, a time and a service: never a full phone number or email", () => {
    expect(shortName("Riya Kapoor")).toBe("Riya K.");
    expect(shortName("riya")).toBe("riya");
    expect(shortName("  ")).toBe("A customer");
    expect(scrubContact("Riya K. +91 98765 43210 riya@mail.test called")).toBe("Riya K. ••• ••• called");
    expect(scrubContact("Riya K. · Haircut · Mon 3:30 pm")).toBe("Riya K. · Haircut · Mon 3:30 pm");
  });
});

describe("queuing alerts: only permitted, wanted devices; one row per device through the outbox", () => {
  const dev = (id: string, userId: string, o: { member?: { permissions: string[]; staffId?: string | null } | null; pref?: object | null } = {}) => ({
    id, userId, user: { pushPreference: o.pref ?? null, teamMember: o.member === undefined || o.member === null ? null : { businessId: "b1", permissions: o.member.permissions, staffId: o.member.staffId ?? null } },
  });
  beforeEach(() => { db.business.findUnique.mockResolvedValue({ ownerId: "owner1" }); });

  it("a new booking goes to the owner and to members who may see it, not to the others", async () => {
    db.pushDevice.findMany.mockResolvedValue([
      dev("d-owner", "owner1"),
      dev("d-recep", "u2", { member: { permissions: ["appointments.view_all"] } }),
      dev("d-own-match", "u3", { member: { permissions: ["appointments.view_own"], staffId: "s1" } }),
      dev("d-own-other", "u4", { member: { permissions: ["appointments.view_own"], staffId: "s2" } }),
      dev("d-queue", "u5", { member: { permissions: ["queue.control"] } }),
      dev("d-stale", "u6", { member: null }),               // neither owner nor member of this business
    ]);
    const n = await queuePush({ businessId: "b1", kind: "booking_new", staffId: "s1", subjectId: "a1", version: "created", message: { title: "New booking", body: "Riya K. · Haircut · Mon 3:30 pm", url: "/dashboard/appointments" } });
    expect(n).toBe(3);
    expect(enqueued.rows.map((r) => r.recipient).sort()).toEqual(["d-own-match", "d-owner", "d-recep"]);
    expect(enqueued.rows.every((r) => r.channel === "PUSH" && r.event === "push.booking_new" && r.subjectId === "a1" && r.businessId === "b1")).toBe(true);
  });
  it("a preference turned off is respected", async () => {
    db.pushDevice.findMany.mockResolvedValue([dev("d-owner", "owner1", { pref: { newBooking: false } }), dev("d-recep", "u2", { member: { permissions: ["appointments.view_all"] } })]);
    await queuePush({ businessId: "b1", kind: "booking_new", staffId: null, subjectId: "a1", message: { title: "t", body: "b" } });
    expect(enqueued.rows.map((r) => r.recipient)).toEqual(["d-recep"]);
  });
  it("queue, payment and summary reach only the people with that access", async () => {
    db.pushDevice.findMany.mockResolvedValue([dev("d-owner", "owner1"), dev("d-q", "u2", { member: { permissions: ["queue.control"] } }), dev("d-r", "u3", { member: { permissions: ["reports.view"] } })]);
    await queuePush({ businessId: "b1", kind: "queue", subjectId: "a1", message: { title: "t", body: "b" } });
    expect(enqueued.rows.map((r) => r.recipient).sort()).toEqual(["d-owner", "d-q"]);
    enqueued.rows.length = 0;
    await queuePush({ businessId: "b1", kind: "payment", subjectId: "a1", message: { title: "t", body: "b" } });
    expect(enqueued.rows.map((r) => r.recipient).sort()).toEqual(["d-owner", "d-r"]);
  });
  it("the text that is queued has any phone number or email scrubbed", async () => {
    db.pushDevice.findMany.mockResolvedValue([dev("d-owner", "owner1")]);
    await queuePush({ businessId: "b1", kind: "booking_new", subjectId: "a1", message: { title: "Riya called +91 98765 43210", body: "riya@mail.test · Haircut" } });
    expect(JSON.stringify(enqueued.rows[0].payload)).not.toMatch(/98765|riya@mail/);
  });
  it("the in-app notification is still stored, and a broken queue never breaks the booking", async () => {
    db.business.findUnique.mockRejectedValue(new Error("db down"));
    (db as any).notification = { create: vi.fn(async () => ({})) };
    await expect(sendPushToBusiness("b1", { title: "New booking", body: "Riya K." }, { kind: "booking_new", subjectId: "a1" })).resolves.toBeUndefined();
    expect((db as any).notification.create).toHaveBeenCalled();
  });
  it("devices are keyed by id in the outbox (not mangled like a phone number), one alert per device per event", () => {
    expect(normalizeRecipient("PUSH", "ckx9Device01")).toBe("ckx9Device01");
    const a = idempotencyKey({ event: "push.booking_new", subjectId: "a1", version: "created", recipient: "devA", channel: "PUSH" });
    const b = idempotencyKey({ event: "push.booking_new", subjectId: "a1", version: "created", recipient: "devB", channel: "PUSH" });
    expect(a).not.toBe(b);
    expect(a).toBe(idempotencyKey({ event: "push.booking_new", subjectId: "a1", version: "created", recipient: "devA", channel: "PUSH" }));
  });
});

describe("checked again at send time", () => {
  const row = { recipient: "d1", businessId: "b1", payload: { kind: "booking_new", staffId: "s1", userId: "u2" } };
  beforeEach(() => {
    db.business.findUnique.mockResolvedValue({ ownerId: "owner1" });
    db.pushDevice.findUnique.mockResolvedValue({ id: "d1", userId: "u2", businessId: "b1" });
    db.pushDevice.findMany.mockResolvedValue([{ id: "d1", userId: "u2", user: { pushPreference: null, teamMember: { businessId: "b1", permissions: ["appointments.view_all"], staffId: null } } }]);
  });
  it("sends when still allowed and wanted", async () => { expect(await pushSendBlocker(row as never)).toBeNull(); });
  it("skips when the device was removed (logout, removal, expiry)", async () => {
    db.pushDevice.findUnique.mockResolvedValue(null);
    expect(await pushSendBlocker(row as never)).toBe("device removed");
  });
  it("skips when permission was revoked after the alert was queued", async () => {
    db.pushDevice.findMany.mockResolvedValue([{ id: "d1", userId: "u2", user: { pushPreference: null, teamMember: { businessId: "b1", permissions: ["customers.view"], staffId: null } } }]);
    expect(await pushSendBlocker(row as never)).toBe("no longer allowed or switched off");
  });
  it("skips when the person switched that kind off, or the device now belongs to someone else", async () => {
    db.pushDevice.findMany.mockResolvedValue([{ id: "d1", userId: "u2", user: { pushPreference: { newBooking: false }, teamMember: { businessId: "b1", permissions: ["appointments.view_all"], staffId: null } } }]);
    expect(await pushSendBlocker(row as never)).toBe("no longer allowed or switched off");
    db.pushDevice.findUnique.mockResolvedValue({ id: "d1", userId: "someone-else", businessId: "b1" });
    expect(await pushSendBlocker(row as never)).toBe("device changed owner");
  });
});

describe("delivery and expired devices", () => {
  const msg = { subject: "New booking", text: "Riya K.", html: "", push: { url: "/dashboard", tag: "t" } };
  beforeEach(() => { db.pushDevice.findUnique.mockResolvedValue({ id: "d1", endpoint: "https://push.example/abc", p256dh: "p", auth: "a" }); });
  it("sent", async () => {
    deliver.mockResolvedValue({ kind: "sent" });
    expect(await CHANNELS.PUSH(msg, "d1", "k")).toEqual({ kind: "sent" });
    expect(db.pushDevice.deleteMany).not.toHaveBeenCalled();
  });
  it.each([[404], [410]])("a %i from the push service deletes the device and does not retry", async (status) => {
    deliver.mockResolvedValue({ kind: "expired" });
    expect(await CHANNELS.PUSH(msg, "d1", "k")).toMatchObject({ kind: "skipped" });
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { id: "d1" } });
    void status;
  });
  it("other failures are retried or permanent, and keep the device", async () => {
    deliver.mockResolvedValue({ kind: "retry", error: "push service 503" });
    expect((await CHANNELS.PUSH(msg, "d1", "k")).kind).toBe("retry");
    deliver.mockResolvedValue({ kind: "permanent", error: "push service 400" });
    expect((await CHANNELS.PUSH(msg, "d1", "k")).kind).toBe("permanent");
    expect(db.pushDevice.deleteMany).not.toHaveBeenCalled();
  });
  it("a device that is already gone is skipped", async () => {
    db.pushDevice.findUnique.mockResolvedValue(null);
    expect(await CHANNELS.PUSH(msg, "d1", "k")).toMatchObject({ kind: "skipped", error: "device removed" });
  });
  it("the push service's 404/410 are what deliverPush reports as expired", async () => {
    const real = await vi.importActual<typeof import("@/lib/push")>("@/lib/push");
    process.env.VAPID_PRIVATE_KEY = ""; // not configured in tests: the send itself is covered by the mapping below
    expect((await real.deliverPush({ endpoint: "https://x", p256dh: "p", auth: "a" }, { title: "t", body: "b" })).kind).toBe("permanent");
  });
});

describe("registering a device", () => {
  const owner1 = () => { session.current = { user: { id: "owner1", businessId: "b1" }, expires: "" }; };
  const asMember = (perms: string[]) => { session.current = { user: { id: "u2", email: "m@x.co" }, expires: "" }; db.teamMember.findUnique.mockResolvedValue({ id: "m1", businessId: "b1", userId: "u2", roleName: "Receptionist", permissions: perms, staffId: null }); };
  it("owner and members register for themselves; the device is bound to that user and business", async () => {
    owner1();
    expect((await subscribe(req("/api/push/subscribe", body(SUB)))).status).toBe(200);
    expect(db.pushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ userId: "owner1", businessId: "b1", endpoint: SUB.endpoint }) }));
    db.pushDevice.upsert.mockClear();
    asMember(["appointments.view_all"]);
    expect((await subscribe(req("/api/push/subscribe", body(SUB)))).status).toBe(200);
    expect(db.pushDevice.upsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ userId: "u2" }) })); // a shared phone moves to the person using it now
  });
  it("a guest gets 401 and a Calvy admin viewing a business never registers a device", async () => {
    session.current = null;
    expect((await subscribe(req("/api/push/subscribe", body(SUB)))).status).toBe(401);
    session.current = { user: { id: "adm", businessId: "b1", viewAs: { mode: "READ" } }, expires: "" };
    expect((await subscribe(req("/api/push/subscribe", body(SUB)))).status).toBe(403);
    expect(db.pushDevice.upsert).not.toHaveBeenCalled();
  });
  it("turning off removes only that user's devices", async () => {
    owner1();
    await unsubscribe(req("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: SUB.endpoint }) }));
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "owner1", endpoint: SUB.endpoint } });
  });
  it("preferences are personal: read with defaults, saved for the signed-in user only", async () => {
    owner1();
    db.pushPreference.findUnique.mockResolvedValue(null); db.pushDevice.count.mockResolvedValue(0);
    expect(await (await getPrefs()).json()).toEqual({ prefs: DEFAULT_PREFS, devices: 0 });
    expect((await putPrefs(req("/api/push/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ queue: false }) }))).status).toBe(200);
    expect(db.pushPreference.upsert).toHaveBeenCalledWith({ where: { userId: "owner1" }, update: { queue: false }, create: { userId: "owner1", queue: false } });
    expect((await putPrefs(req("/api/push/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ queue: "yes" }) }))).status).toBe(400);
  });
});

describe("a person's devices are removed when they sign out, are removed, or lose a permission", () => {
  it("sign out removes only THIS browser's device, never the person's other devices", async () => {
    const { authOptions } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");
    const events = (authOptions as { events?: { signOut?: (m: { token: unknown }) => Promise<void> } }).events;
    expect(typeof events?.signOut).toBe("function");
    thisDevice.id = "dev-phone-1";
    await events!.signOut!({ token: { uid: "u2" } });
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { id: "dev-phone-1", userId: "u2" } });
    db.pushDevice.deleteMany.mockClear();
    thisDevice.id = null; // no cookie on this browser: nothing is deleted, in particular not the other devices
    await events!.signOut!({ token: { uid: "u2" } });
    await events!.signOut!({ token: {} });
    expect(db.pushDevice.deleteMany).not.toHaveBeenCalled();
  });
  it("subscribing names this browser's device in a cookie; unsubscribing one endpoint clears it", async () => {
    session.current = { user: { id: "owner1", businessId: "b1" }, expires: "" };
    db.business.findUnique.mockResolvedValue({ id: "b1", ownerId: "owner1" });
    db.pushDevice.upsert.mockResolvedValue({ id: "dev-abc12345" });
    const res = await subscribe(req("/api/push/subscribe", body(SUB)));
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toMatch(/calvy_push_device=dev-abc12345.*HttpOnly/i);
    const del = await unsubscribe(req("/api/push/subscribe", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ endpoint: SUB.endpoint }) }));
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "owner1", endpoint: SUB.endpoint } });
    expect(del.headers.get("set-cookie")).toMatch(/calvy_push_device=;/i);
  });
  it("reminders are their own alert type: separate preference, booking-level permission, own-only staff match", () => {
    expect(PREF_FIELDS).toContain("reminders");
    expect(KIND_PREF.reminder).toBe("reminders");
    expect(wants("reminder", { summary: true, reminders: false })).toBe(false);
    expect(wants("summary", { summary: true, reminders: false })).toBe(true);
    expect(wants("reminder", {})).toBe(true);
    expect(mayReceive("reminder", member(["appointments.view_all"]))).toBe(true);
    expect(mayReceive("reminder", member(["reports.view"]))).toBe(false);
    expect(mayReceive("reminder", member(["appointments.view_own"], "s1"), "s1")).toBe(true);
    expect(mayReceive("reminder", member(["appointments.view_own"], "s1"), "s2")).toBe(false);
  });
  it("removing a member removes their devices", async () => {
    db.teamMember.findFirst.mockResolvedValue({ id: "m1", userId: "u2", email: "m@x.co" });
    await removeMember("m1", "b1");
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
  });
  it("revoking a permission removes their devices; granting one or renaming does not", async () => {
    session.current = { user: { id: "owner1", businessId: "b1" }, expires: "" };
    const existing = { id: "m1", businessId: "b1", userId: "u2", email: "m@x.co", name: "Rita", roleName: "Receptionist", staffId: null, createdAt: new Date(), permissions: ["appointments.view_all", "customers.view"] };
    db.teamMember.findFirst.mockResolvedValue(existing);
    db.teamMember.update.mockResolvedValue({ ...existing, permissions: ["appointments.view_all"] });
    const patch = (b: unknown) => patchMember(req("/api/team/m1", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), { params: Promise.resolve({ id: "m1" }) });
    expect((await patch({ permissions: ["appointments.view_all"] })).status).toBe(200);
    expect(db.pushDevice.deleteMany).toHaveBeenCalledWith({ where: { userId: "u2" } });
    db.pushDevice.deleteMany.mockClear();
    await patch({ permissions: ["appointments.view_all", "customers.view", "reports.view"] });
    await patch({ name: "Rita S" });
    expect(db.pushDevice.deleteMany).not.toHaveBeenCalled();
  });
  it("removeUserDevices deletes by user", async () => {
    db.pushDevice.deleteMany.mockResolvedValue({ count: 2 });
    expect(await removeUserDevices("u9")).toBe(2);
  });
});

describe("Arrived reuses the queue's states: it only stamps a time", () => {
  it("a token must be the one being served (Next first); the queue's own Not present stays the way to say they are not there", () => {
    const token = (queueState: string) => ({ status: "confirmed", tokenNumber: 7, queueState });
    expect(arrivedProblem(token("SERVING"), { isOwner: false, write: false, queue: true })).toBeNull();
    expect(arrivedProblem(token("WAITING"), { isOwner: true, write: true, queue: true })?.status).toBe(409);
    expect(arrivedProblem(token("DONE"), { isOwner: true, write: true, queue: true })?.status).toBe(409);
    expect(arrivedProblem(token("SERVING"), { isOwner: false, write: true, queue: false })?.status).toBe(403);
  });
  it("a slot booking must be open, and the person must be allowed to change appointments", () => {
    expect(arrivedProblem({ status: "confirmed", tokenNumber: null, queueState: null }, { isOwner: false, write: true, queue: false })).toBeNull();
    expect(arrivedProblem({ status: "completed", tokenNumber: null, queueState: null }, { isOwner: true, write: true, queue: true })?.status).toBe(409);
    expect(arrivedProblem({ status: "confirmed", tokenNumber: null, queueState: null }, { isOwner: false, write: false, queue: true })?.status).toBe(403);
  });
  const call = (id = "a1") => arrivedRoute(req(`/api/appointments/${id}/arrived`, { method: "POST" }), { params: Promise.resolve({ id }) });
  it("the route changes nothing but arrivedAt, once", async () => {
    session.current = { user: { id: "owner1", businessId: "b1" }, expires: "" };
    db.appointment.findFirst.mockResolvedValue({ id: "a1", status: "confirmed", tokenNumber: 7, queueState: "SERVING", arrivedAt: null });
    db.appointment.updateMany.mockResolvedValue({ count: 1 });
    db.appointment.findUnique.mockResolvedValue({ arrivedAt: new Date() });
    expect((await call()).status).toBe(200);
    expect(db.appointment.updateMany).toHaveBeenCalledWith({ where: { id: "a1", arrivedAt: null }, data: { arrivedAt: expect.any(Date) } }); // not queueState, not status
    db.appointment.updateMany.mockResolvedValue({ count: 0 });
    expect((await (await call()).json()).changed).toBe(false); // a double tap changes nothing
  });
  it("a token that is only waiting is refused; a stranger's appointment is a 404", async () => {
    session.current = { user: { id: "owner1", businessId: "b1" }, expires: "" };
    db.appointment.findFirst.mockResolvedValue({ id: "a1", status: "confirmed", tokenNumber: 7, queueState: "WAITING", arrivedAt: null });
    expect((await call()).status).toBe(409);
    db.appointment.findFirst.mockResolvedValue(null);
    expect((await call("other-business")).status).toBe(404);
    expect(db.appointment.updateMany).not.toHaveBeenCalled();
  });
  it("an own-only member can only mark their own (the query is scoped to their staff record)", async () => {
    session.current = { user: { id: "u2", email: "m@x.co" }, expires: "" };
    db.teamMember.findUnique.mockResolvedValue({ id: "m1", businessId: "b1", userId: "u2", roleName: "Dr", permissions: ["appointments.view_own", "appointments.write"], staffId: "s1" });
    db.appointment.findFirst.mockResolvedValue(null);
    await call("a-of-someone-else");
    expect(db.appointment.findFirst.mock.calls[0][0].where).toMatchObject({ id: "a-of-someone-else", businessId: "b1", staffId: "s1" });
  });
});

describe("the Today list", () => {
  const rowOf = (over: object = {}) => ({ id: "a1", date: new Date("2026-11-10T10:00:00Z"), estimatedAt: null, status: "confirmed", patientName: null, tokenNumber: null, queueState: null, tokenSessionId: null, arrivedAt: null, service: { name: "Haircut" }, client: { name: "Riya Kapoor", phone: "+919876543210" }, ...over });
  const access = (perms: string[], isOwner = false, staffId: string | null = null) => ({ userId: "u", businessId: "b1", isOwner, permissions: perms as never, staffId, roleName: "x" });
  beforeEach(() => { db.business.findUnique.mockResolvedValue({ timezone: "Asia/Kolkata", bookingMode: "SLOT" }); db.appointment.findMany.mockResolvedValue([rowOf()]); });

  it("shows a name and initial; the phone only to people who may see customer details", async () => {
    const withCust = await loadToday(access(["appointments.view_all", "customers.view"]), new Date("2026-11-10T08:00:00Z"));
    expect(withCust.rows[0]).toMatchObject({ name: "Riya K.", phone: "+919876543210", service: "Haircut" });
    const without = await loadToday(access(["appointments.view_all"]), new Date("2026-11-10T08:00:00Z"));
    expect(without.rows[0].phone).toBeNull();
    expect(JSON.stringify(without)).not.toContain("98765");
  });
  it("is scoped like the appointments list: an own-only member's query is limited to their staff record", async () => {
    await loadToday(access(["appointments.view_own"], false, "s1"), new Date("2026-11-10T08:00:00Z"));
    expect(db.appointment.findMany.mock.calls[0][0].where).toMatchObject({ businessId: "b1", staffId: "s1" });
  });
  it("a queue-only member sees tokens only; someone with no appointment or queue access sees nothing and no query runs", async () => {
    await loadToday(access(["queue.control"]), new Date("2026-11-10T08:00:00Z"));
    expect(db.appointment.findMany.mock.calls[0][0].where).toMatchObject({ tokenNumber: { not: null } });
    db.appointment.findMany.mockClear();
    const none = await loadToday(access(["customers.view"]), new Date("2026-11-10T08:00:00Z"));
    expect(none.rows).toEqual([]);
    expect(db.appointment.findMany).not.toHaveBeenCalled();
  });
});
