import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { sniffImage, checkImageUpload } from "@/lib/validation/upload";

const session = { current: null as unknown };
const db = vi.hoisted(() => ({
  business: { findUnique: vi.fn() },
  broadcast: { count: vi.fn(), create: vi.fn() },
  client: { findMany: vi.fn() },
}));
const features = vi.hoisted(() => vi.fn());
vi.mock("@/lib/prisma", () => ({ prisma: db }));
vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => session.current) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/getFeatures", () => ({ getBusinessFeatures: features }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })), clientIp: () => "1.1.1.1" }));
vi.mock("@/lib/whatsapp", () => ({ sendWhatsApp: vi.fn(async () => true) }));
vi.mock("resend", () => ({ Resend: class { batch = { send: vi.fn(async () => ({})) }; } }));

import { POST as broadcastPost } from "@/app/api/broadcasts/send/route";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const fileOf = (u8: Uint8Array, type = "image/png", size = u8.length) => {
  const f = new File([u8 as BlobPart], "x.png", { type });
  return size === u8.length ? f : Object.defineProperty(f, "size", { value: size });
};

describe("sniffImage / checkImageUpload", () => {
  const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
  const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
  const WEBP = bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50);

  it("detects jpeg, png, webp from bytes", () => {
    expect(sniffImage(JPEG)?.ext).toBe("jpg");
    expect(sniffImage(PNG)?.ext).toBe("png");
    expect(sniffImage(WEBP)?.ext).toBe("webp");
  });
  it("rejects SVG, GIF, HTML and empty input", () => {
    const enc = (s: string) => new TextEncoder().encode(s);
    expect(sniffImage(enc("<svg xmlns='http://www.w3.org/2000/svg'></svg>"))).toBeNull();
    expect(sniffImage(enc("GIF89a......"))).toBeNull();
    expect(sniffImage(enc("<html><script>"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
  });
  it("ignores a lying MIME type and file name: the extension comes from the bytes", async () => {
    const r = await checkImageUpload(fileOf(PNG, "image/jpeg"));
    expect(r).toMatchObject({ ok: true, ext: "png", contentType: "image/png" });
  });
  it("rejects a script labelled image/png, an empty file and oversize files", async () => {
    expect((await checkImageUpload(fileOf(new TextEncoder().encode("<svg onload=alert(1)>"), "image/png"))).ok).toBe(false);
    expect((await checkImageUpload(null)).ok).toBe(false);
    expect((await checkImageUpload(fileOf(PNG, "image/png", 6 * 1024 * 1024))).ok).toBe(false);
  });
});

describe("POST /api/broadcasts/send", () => {
  const req = (body: unknown) =>
    new NextRequest("http://localhost/api/broadcasts/send", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  const valid = { subject: "Hi", message: "Hello", medium: "email" };

  beforeEach(() => {
    vi.clearAllMocks();
    session.current = { user: { id: "u1", businessId: "b1" } };
    db.business.findUnique.mockResolvedValue({ id: "b1", name: "A <b>&", plan: "business", planStatus: "active" });
    features.mockResolvedValue({ broadcasts: true, maxBroadcastsPerMonth: 5 });
    db.broadcast.count.mockResolvedValue(0);
    db.client.findMany.mockResolvedValue([]);
  });

  it("403 when the plan flag is off", async () => {
    features.mockResolvedValue({ broadcasts: false, maxBroadcastsPerMonth: -1 });
    expect((await broadcastPost(req(valid))).status).toBe(403);
  });
  it("402 once the monthly limit from PlanConfig is used", async () => {
    db.broadcast.count.mockResolvedValue(5);
    const res = await broadcastPost(req(valid));
    expect(res.status).toBe(402);
    expect(db.client.findMany).not.toHaveBeenCalled();
  });
  it("unlimited (-1) skips the monthly count", async () => {
    features.mockResolvedValue({ broadcasts: true, maxBroadcastsPerMonth: -1 });
    const res = await broadcastPost(req(valid));
    expect(res.status).toBe(200);
    expect(db.broadcast.count).not.toHaveBeenCalled();
  });
  it("caps recipients at 500 per request and says so", async () => {
    const many = Array.from({ length: 501 }, (_, i) => ({ email: `c${i}@x.com`, phone: null, name: "c" }));
    db.client.findMany.mockResolvedValue(many);
    const res = await broadcastPost(req({ ...valid, medium: "email" }));
    const body = await res.json();
    expect(db.client.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 501 }));
    expect(body).toMatchObject({ ok: true, sentTo: 500, capped: true, limit: 500 });
  });
  it("400 on invalid medium", async () => {
    expect((await broadcastPost(req({ ...valid, medium: "pigeon" }))).status).toBe(400);
  });
});
