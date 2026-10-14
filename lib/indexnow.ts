// IndexNow — instantly notify Bing & Yandex when content changes.
// The key is public by design and must match the file at /{KEY}.txt.
const KEY = "d5d83239c52c90ffbcfbfb47ad7b6fe0";
const HOST = (process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? "calvy.io").replace(/^https?:\/\//, "");

/** Submit one or more absolute URLs to IndexNow (best-effort, never throws). */
export async function submitToIndexNow(urls: string[]): Promise<void> {
  const list = urls.filter(Boolean);
  if (list.length === 0) return;
  try {
    await fetch("https://api.indexnow.org/indexnow", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        host: HOST,
        key: KEY,
        keyLocation: `https://${HOST}/${KEY}.txt`,
        urlList: list,
      }),
    });
  } catch (err) {
    console.error("[IndexNow] submit failed:", err);
  }
}
