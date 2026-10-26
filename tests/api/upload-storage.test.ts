import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";
import sharp from "sharp";

// step-6/redesign-site-foundation: website photo uploads work without Vercel Blob (local disk in
// development, S3/R2 in production), keep using Blob where its token is set, and crop to a fixed size.

const mocks = vi.hoisted(() => ({
  storage: { put: vi.fn(), remove: vi.fn(), keyFromUrl: vi.fn() },
  getStorage: vi.fn(),
  put: vi.fn(),
  list: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => ({ user: { businessId: "biz1" } })) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/limits", () => ({ checkLimit: vi.fn(async () => null), denialResponse: vi.fn() }));
vi.mock("@/lib/ratelimit", () => ({ rateLimit: vi.fn(async () => ({ ok: true, retryAfter: 0 })) }));
vi.mock("@/lib/storage", () => ({ getStorage: mocks.getStorage }));
vi.mock("@vercel/blob", () => ({ put: mocks.put, list: mocks.list }));

import { POST } from "@/app/api/upload/route";

async function request(purpose: "hero" | "about" = "hero") {
  const jpeg = await sharp({ create: { width: 900, height: 2000, channels: 3, background: "#cc3366" } }).jpeg().toBuffer();
  const fd = new FormData();
  fd.append("file", new File([new Uint8Array(jpeg)], "tall.jpg", { type: "image/jpeg" }));
  fd.append("purpose", purpose);
  return new NextRequest("http://localhost/api/upload", { method: "POST", body: fd });
}

describe("website photo upload storage", () => {
  const OLD = process.env.BLOB_READ_WRITE_TOKEN;
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.BLOB_READ_WRITE_TOKEN;
    mocks.getStorage.mockReturnValue(mocks.storage);
    mocks.storage.put.mockImplementation(async (key: string) => ({ key, url: `/uploads/${key}` }));
  });
  afterEach(() => {
    if (OLD === undefined) delete process.env.BLOB_READ_WRITE_TOKEN;
    else process.env.BLOB_READ_WRITE_TOKEN = OLD;
  });

  it("without a Blob token, saves through the storage adapter as a cropped WebP", async () => {
    const res = await POST(await request("hero"));
    expect(res.status).toBe(200);
    const { url } = await res.json();
    expect(url).toMatch(/^\/uploads\/website\/biz1\/\d+-[a-z0-9]+\.webp$/);
    expect(mocks.put).not.toHaveBeenCalled();
    const [, body, contentType] = mocks.storage.put.mock.calls[0];
    expect(contentType).toBe("image/webp");
    const meta = await sharp(body).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["webp", 1600, 1200]);
  });

  it("the about photo is cropped to its own smaller size", async () => {
    await POST(await request("about"));
    const meta = await sharp(mocks.storage.put.mock.calls[0][1]).metadata();
    expect([meta.width, meta.height]).toEqual([1200, 900]);
  });

  it("with a Blob token, keeps using Vercel Blob (and its quota)", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    mocks.list.mockResolvedValue({ blobs: [] });
    mocks.put.mockResolvedValue({ url: "https://blob.example/x.webp" });
    const res = await POST(await request());
    expect((await res.json()).url).toBe("https://blob.example/x.webp");
    expect(mocks.storage.put).not.toHaveBeenCalled();
  });

  it("a full Blob quota is refused", async () => {
    process.env.BLOB_READ_WRITE_TOKEN = "token";
    mocks.list.mockResolvedValue({ blobs: Array.from({ length: 51 }, () => ({ size: 1 })) });
    const res = await POST(await request());
    expect(res.status).toBe(403);
    expect(mocks.put).not.toHaveBeenCalled();
  });

  it("when no storage is configured, says so with a 503 instead of crashing", async () => {
    mocks.getStorage.mockImplementation(() => { throw new Error("Object storage is not configured"); });
    const res = await POST(await request());
    expect(res.status).toBe(503);
    expect((await res.json()).error).toBe("Image upload is not available right now.");
  });
});
