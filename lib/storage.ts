// Storage adapter for tenant uploads (logos, website photos). Three drivers:
//   blob   Vercel Blob. The production default: used whenever BLOB_READ_WRITE_TOKEN is set.
//   s3     S3-compatible (Cloudflare R2), optional: S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL.
//   local  files under public/uploads. Development only: those files exist on one machine, so a URL saved with this
//          driver is broken anywhere else (see usableImageUrl in lib/images.ts).
// Choice: STORAGE_DRIVER if set, else blob when the token is set, else s3 when its variables are all set, else local in
// development. In production with none of them configured there is no driver: uploads say "not available" (never local disk).
import { promises as fs } from "fs";
import path from "path";

export interface StoredObject { key: string; url: string }

export interface Storage {
  put(key: string, body: Buffer, contentType: string): Promise<StoredObject>;
  remove(key: string): Promise<void>;
  /** The object key for a URL this adapter produced, else null. */
  keyFromUrl(url: string): string | null;
  /** Object count and total bytes under a key prefix, counting at most `limit` objects. */
  usage(prefix: string, limit: number): Promise<{ files: number; bytes: number }>;
}

/** Keys are built by the server, but guard against traversal anyway. */
export function assertSafeKey(key: string) {
  if (!/^[a-z0-9][a-z0-9/_.-]*$/i.test(key) || key.includes("..") || key.includes("//")) throw new Error("Invalid storage key");
}

const LOCAL_PREFIX = "/uploads/";

export const localStorageAdapter: Storage = {
  async put(key, body) {
    assertSafeKey(key);
    const file = path.join(process.cwd(), "public", "uploads", key);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, body);
    return { key, url: `${LOCAL_PREFIX}${key}` };
  },
  async remove(key) {
    assertSafeKey(key);
    await fs.rm(path.join(process.cwd(), "public", "uploads", key), { force: true });
  },
  keyFromUrl(url) {
    return url.startsWith(LOCAL_PREFIX) ? url.slice(LOCAL_PREFIX.length) : null;
  },
  async usage(prefix, limit) {
    assertSafeKey(prefix.replace(/\/$/, ""));
    const dir = path.join(process.cwd(), "public", "uploads", prefix);
    let names: string[] = [];
    try {
      names = await fs.readdir(dir);
    } catch {
      return { files: 0, bytes: 0 };
    }
    let files = 0;
    let bytes = 0;
    for (const name of names.slice(0, limit)) {
      const stat = await fs.stat(path.join(dir, name));
      if (stat.isFile()) { files++; bytes += stat.size; }
    }
    return { files, bytes };
  },
};

function s3Adapter(): Storage {
  const { S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL } = process.env;
  if (!S3_ENDPOINT || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY || !S3_PUBLIC_URL) {
    throw new Error("Object storage is not configured");
  }
  const base = S3_PUBLIC_URL.replace(/\/$/, "");
  const client = async () => {
    const { S3Client } = await import("@aws-sdk/client-s3");
    return new S3Client({
      region: "auto",
      endpoint: S3_ENDPOINT,
      credentials: { accessKeyId: S3_ACCESS_KEY_ID, secretAccessKey: S3_SECRET_ACCESS_KEY },
    });
  };
  return {
    async put(key, body, contentType) {
      assertSafeKey(key);
      const { PutObjectCommand } = await import("@aws-sdk/client-s3");
      await (await client()).send(
        new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType, CacheControl: "public, max-age=31536000, immutable" }),
      );
      return { key, url: `${base}/${key}` };
    },
    async remove(key) {
      assertSafeKey(key);
      const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
      await (await client()).send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    },
    keyFromUrl(url) {
      return url.startsWith(`${base}/`) ? url.slice(base.length + 1) : null;
    },
    async usage(prefix, limit) {
      assertSafeKey(prefix.replace(/\/$/, ""));
      const { ListObjectsV2Command } = await import("@aws-sdk/client-s3");
      const res = await (await client()).send(new ListObjectsV2Command({ Bucket: S3_BUCKET, Prefix: prefix, MaxKeys: limit }));
      const objects = res.Contents ?? [];
      return { files: objects.length, bytes: objects.reduce((n, o) => n + (o.Size ?? 0), 0) };
    },
  };
}

function blobAdapter(): Storage {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("Object storage is not configured");
  return {
    async put(key, body, contentType) {
      assertSafeKey(key);
      const { put } = await import("@vercel/blob");
      const r = await put(key, body, { access: "public", contentType, addRandomSuffix: false, allowOverwrite: true, cacheControlMaxAge: 31536000, token });
      return { key, url: r.url };
    },
    async remove(key) {
      assertSafeKey(key);
      const { del } = await import("@vercel/blob");
      await del(key, { token });
    },
    keyFromUrl(url) {
      try {
        const u = new URL(url);
        return /\.public\.blob\.vercel-storage\.com$/.test(u.hostname) ? decodeURIComponent(u.pathname.slice(1)) : null;
      } catch {
        return null;
      }
    },
    async usage(prefix, limit) {
      assertSafeKey(prefix.replace(/\/$/, ""));
      const { list } = await import("@vercel/blob");
      const res = await list({ prefix, limit, token });
      return { files: res.blobs.length, bytes: res.blobs.reduce((n, b) => n + b.size, 0) };
    },
  };
}

export type StorageDriver = "blob" | "s3" | "local" | "none";

/** Which driver applies for this environment (pure, for tests and the health/env checks). */
export function storageDriver(env: Record<string, string | undefined> = process.env): StorageDriver {
  const set = (n: string) => !!env[n]?.trim();
  const explicit = env.STORAGE_DRIVER?.trim().toLowerCase();
  if (explicit === "blob" || explicit === "s3" || explicit === "local") return explicit;
  if (set("BLOB_READ_WRITE_TOKEN")) return "blob";
  if (["S3_ENDPOINT", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_PUBLIC_URL"].every(set)) return "s3";
  return env.NODE_ENV === "production" ? "none" : "local";
}

export function getStorage(): Storage {
  switch (storageDriver()) {
    case "blob": return blobAdapter();
    case "s3": return s3Adapter();
    case "local": return localStorageAdapter;
    default: throw new Error("Object storage is not configured");
  }
}

/** Absolute form of a stored URL (emails need it; local uploads are site-relative). */
export function absoluteAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXTAUTH_URL ?? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io"}`;
  return `${base.replace(/\/$/, "")}${url}`;
}
