"use client";
import { useEffect } from "react";

// Replaces the root layout when it fails, so it renders its own <html>/<body>.
// In production the layout's stylesheet, fonts and providers are NOT available here
// (verified: Tailwind classes do not apply), so this page is self-contained with a
// small inline stylesheet. Values mirror the brand tokens: brand #0f0f1a, accent
// #0284c7 / hover #0369a1, muted #6b6b80.
const css = `
  .ge-wrap,.ge-card{box-sizing:border-box}
  .ge-wrap{min-height:100vh;min-height:100dvh;margin:0;display:flex;align-items:center;justify-content:center;padding:16px;background:#0f0f1a;font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif}
  .ge-card{width:100%;max-width:448px;background:#fff;border-radius:24px;padding:32px 24px;text-align:center;box-shadow:0 25px 50px -12px rgba(0,0,0,.25)}
  .ge-brand{margin:0 0 24px;text-align:center;color:#fff;font-weight:700;font-size:24px}
  .ge-card h1{margin:0 0 8px;font-size:24px;line-height:32px;font-weight:700;color:#0f0f1a}
  .ge-card p{margin:0;font-size:14px;line-height:22px;color:#6b6b80}
  .ge-actions{margin-top:24px;display:flex;flex-direction:column;gap:12px;align-items:stretch}
  .ge-btn,.ge-link{box-sizing:border-box;display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:10px 24px;border-radius:9999px;font:inherit;font-size:14px;font-weight:500;cursor:pointer;text-decoration:none}
  .ge-btn{border:0;background:#0284c7;color:#fff}
  .ge-btn:hover{background:#0369a1}
  .ge-link{color:#0369a1;text-decoration:underline;text-underline-offset:4px;background:transparent}
  .ge-btn:focus-visible,.ge-link:focus-visible{outline:2px solid #0284c7;outline-offset:2px}
  .ge-ref{margin-top:20px!important;font-size:12px!important;line-height:16px!important;word-break:break-all}
  @media (min-width:640px){.ge-card{padding:32px}.ge-actions{flex-direction:row;justify-content:center;align-items:center}}
`;

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("App error (root)", error.digest ?? "");
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong · Calvy</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body style={{ margin: 0 }}>
        <main className="ge-wrap">
          <div style={{ width: "100%", maxWidth: 448 }}>
            <p className="ge-brand" aria-label="Calvy">Calvy</p>
            <div className="ge-card">
              <h1>Something went wrong</h1>
              <div role="alert">
                <p>Sorry, we hit a problem loading this page. Please try again. If it keeps happening, come back in a few minutes.</p>
              </div>
              <div className="ge-actions">
                <button type="button" className="ge-btn" onClick={reset}>Try again</button>
                {/* Plain anchor: next/link needs router context that may be broken here. */}
                <a href="/" className="ge-link">Go to home</a>
              </div>
              {error.digest && <p className="ge-ref">Reference: {error.digest}</p>}
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
