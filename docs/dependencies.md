# Dependency maintenance (Nov 3 2026)

## Updated now (patch/minor, inside the existing `^` ranges; lockfile only)
`next` and `eslint-config-next` 16.4.4, `@aws-sdk/client-s3`, `@sentry/nextjs` 10.78, `@upstash/redis`, `@vercel/blob`, `resend`, `@radix-ui/*` minors, `marked`, `postcss`, `autoprefixer`, `dotenv-cli`, `@types/node` (20.x).

Left alone on purpose: `razorpay` 2.9.6 (payment code is off-limits; the package is removed when subscriptions move to Cashfree).

## Major versions waiting (each is its own chunk; decide which, if any)
| Package | Now | Latest | Risk / note |
|---|---|---|---|
| prisma, @prisma/client | 5.22 | 7.x | High. Client and config changes touch every query; do alone, with a DB backup |
| tailwindcss | 3.4 | 4.x | High. New config and CSS-first setup; visual regressions across the app |
| typescript | 5.9 | 7.x | Medium. Wait for Next and the linters to support it |
| eslint | 9.39 | 10.x | Medium. Plugins (react, jsx-a11y, import) must support 10 first |
| vitest, @vitest/coverage-v8 | 4.1 | 5.x | Low to medium. Tests only |
| recharts | 2.15 | 3.x | Medium. Chart components change |
| framer-motion | 11 | 14 (motion) | Medium. Import path and API changes |
| lucide-react | 0.400 | 1.x | Low to medium. Icon renames |
| @sentry/nextjs | 10.x | 11.x | Medium. Config and init changes |
| date-fns | 3 | 4 | Low |
| tailwind-merge | 2 | 3 | Low, but needs Tailwind 4 |

## npm audit
21 moderate, 0 high, 0 critical. All trace to `minimatch` (< 11.0.1, a glob DoS) inside dev tooling: the ESLint plugins and `react-email`'s `glob`. It never runs on user input in production. The only offered fix is `npm audit fix --force`, which downgrades `react-email` (breaking), so it is not applied. Re-check after the ESLint 10 / react-email upgrades.
