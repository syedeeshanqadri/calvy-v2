/**
 * Digital Asset Links for the Android app (a Trusted Web Activity wrapping this site). Served at /.well-known/assetlinks.json.
 * Both values come from the environment and stay EMPTY until the real app is built on the production domain (Pre-launch):
 *   TWA_PACKAGE_NAME            e.g. in.calvy.business
 *   TWA_SHA256_FINGERPRINTS     comma-separated signing-certificate SHA-256 fingerprints, AA:BB:...:FF (32 bytes each)
 * With either missing or malformed the answer is a valid, empty list: nothing is claimed.
 */
export interface AssetLink {
  relation: string[];
  target: { namespace: "android_app"; package_name: string; sha256_cert_fingerprints: string[] };
}

const PACKAGE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/i;
const FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function buildAssetLinks(env: Record<string, string | undefined> = process.env): AssetLink[] {
  const pkg = (env.TWA_PACKAGE_NAME ?? "").trim();
  const prints = (env.TWA_SHA256_FINGERPRINTS ?? "").split(",").map((f) => f.trim().toUpperCase()).filter(Boolean);
  if (!PACKAGE.test(pkg) || prints.length === 0 || !prints.every((f) => FINGERPRINT.test(f))) return [];
  return [{ relation: ["delegate_permission/common.handle_all_urls"], target: { namespace: "android_app", package_name: pkg, sha256_cert_fingerprints: prints } }];
}
