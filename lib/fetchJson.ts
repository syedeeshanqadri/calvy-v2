/**
 * Read a fetch Response as JSON without throwing. An empty or non-JSON body
 * (a crashed route, a proxy error page) becomes `{ error }` with a readable
 * message instead of "Unexpected end of JSON input".
 */
export async function readJson<T extends Record<string, unknown> = Record<string, unknown>>(
  res: Response,
): Promise<T & { error?: string }> {
  const text = await res.text();
  if (text) {
    try {
      return JSON.parse(text);
    } catch {
      /* fall through */
    }
  }
  const msg = res.ok
    ? "The server sent an unreadable response. Please refresh and check the result."
    : `The server had a problem (error ${res.status}). Nothing was changed, please try again.`;
  return { error: msg } as T & { error?: string };
}
