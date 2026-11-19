// Run zod without its just-in-time compiler. By default zod 4 probes whether it may use `new Function` (a fast path for object schemas) and swallows
// the error when it may not. Under our enforced Content-Security-Policy (no 'unsafe-eval') that caught probe is still REPORTED as a
// `securitypolicyviolation`, so every page showed a CSP violation in the console. `jitless` skips the probe; parsing is a touch slower, which is
// irrelevant for form-sized input. Imported first by the client Providers, so it applies before any schema is parsed in the browser.
import { z } from "zod";

z.config({ jitless: true });
