// Storage adapter for tenant uploads. Local disk in development, S3-compatible
// (Cloudflare R2) in production, so uploads do not depend on Vercel.
//
// Env (production): STORAGE_DRIVER=s3 (default when NODE_ENV=production),
// S3_ENDPOINT (R2: https://<account>.r2.cloudflarestorage.com), S3_BUCKET,
// S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL (public base URL of the bucket).
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

export function getStorage(): Storage {
  const driver = process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "s3" : "local");
  return driver === "s3" ? s3Adapter() : localStorageAdapter;
}

/** Absolute form of a stored URL (emails need it; local uploads are site-relative). */
export function absoluteAssetUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = process.env.NEXTAUTH_URL ?? `https://${process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io"}`;
  return `${base.replace(/\/$/, "")}${url}`;
}
