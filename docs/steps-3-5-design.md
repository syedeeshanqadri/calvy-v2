# Steps 3 to 5 design: business packs, token mode, India monetization (plan only)

Base: `main` @ 54a8239. Money in integer paise/cents (`*Minor`). Times UTC + `Business.timezone`. All new rows carry `businessId`.

## Schema (one migration per chunk, `prisma migrate dev`)
- **Enums:** `PackId {CLINIC, SALON_SPA, LAWYER, FITNESS, OTHER}`, `BookingMode {SLOT, TOKEN}`, `OnlinePayMode {BOOKING_FEE_ONLY, FULL_ONLINE}`, `FeePayer {CUSTOMER, BUSINESS}`, `QueueState {WAITING, SERVING, DONE, NO_SHOW, MOVED}`, `BookingSource {ONLINE, DASHBOARD, WALK_IN}`, `PayProvider {MOCK, CASHFREE, INTL}`, `PayStatus {CREATED, PAID, FAILED, EXPIRED, REFUNDED}`, `FeeEntryKind {CHARGED, CARRIED_OVER, WAIVED, REFUNDED}`.
- **Business:** `packId PackId @default(OTHER)` (backfill from `businessType`), `country String @default("IN")` (ISO-2), `bookingMode @default(SLOT)`, `onlinePayMode @default(BOOKING_FEE_ONLY)`, `feePayer @default(CUSTOMER)`, `termsOverride Json?`. Keep `primaryColor` as the theme colour.
- **TokenSession** (new): `id, businessId, name, weekdays Int[], startMin, endMin, minutesPerToken, isActive`. Capacity = floor((end-start)/minutes).
- **Appointment:** `source @default(ONLINE)`, `holdExpiresAt DateTime?` (status `pending_payment`), `tokenSessionId?`, `sessionDate Date?`, `tokenNumber Int?`, `queuePosition Int?`, `queueState?`, `estimatedAt Timestamptz?`, `notPresentCount Int @default(0)`, `carriedFromId String?`. `@@unique([tokenSessionId, sessionDate, tokenNumber])`, `@@index([businessId, sessionDate, queuePosition])`.
- **Payment** (new): `businessId, appointmentId, provider, providerOrderId @unique, amountMinor, platformFeeMinor, businessShareMinor, currency, status, method?, rawRef`. **PlatformFeeEntry** (ledger, append-only): `businessId, appointmentId, paymentId?, kind, amountMinor, createdAt`. **PayoutAccount**: `businessId @unique, provider, accountId, kycStatus`. **WebhookEvent**: `provider, eventId` unique (idempotency).
- **PlanConfig:** `platformFeeMinorIN Int @default(0)` (Free = 1000; paid = 0). International never charged.

## Shared libs (pure, unit-tested)
`lib/packs/*` (pack = terms, lucide icon keys, default services, default `bookingMode`, theme presets, email phrases); `lib/terms.ts` `t(term, {plural, cap})` resolving `termsOverride` → pack → OTHER, with `TermsProvider` for client components; `lib/tokens.ts` (capacity, `eta = max(sessionStart, servingStartedAt) + k*min`, move-back-2, carry-over); `lib/fees.ts` (charge/split calculator); `lib/payments/{provider.ts,mock.ts,cashfree.ts}` (`createOrder`, `verifyWebhook`, `refund`, `createSplitAccount`).

## Settings UI
1. Business type (pack picker, preview of words + icons, "apply default services" once). 2. Terms override table. 3. Theme colour: pack presets + hex picker, contrast check, all plans. 4. Booking mode: Slot / Token. 5. Token sessions editor with live capacity per session and per day. 6. Online payment (country-aware): mode radio, fee-payer toggle with worked example (500 → 510 / 490), Paid-plan waiver note. 7. Payout account (KYC status, only needed for FULL_ONLINE). Dashboard: Queue screen, Walk-in token button.

## Booking flow per mode
- **Slot (today):** unchanged unless payment needed. **Token:** customer picks date + session, sees "~N left"; on confirm, in one transaction with advisory lock on (session, date): count tokens incl. live holds, `n = max+1`, `estimatedAt = start + (n-1)*min`, reject if `n > capacity`.
- **Payment needed?** `fee = country=IN ? plan.platformFeeMinorIN : 0`. BOOKING_FEE_ONLY charges `fee` (Calvy keeps it; no business KYC). FULL_ONLINE: payer CUSTOMER charges `P+fee`, business gets `P`; payer BUSINESS charges `P`, business gets `P-fee`. Charge 0 → confirm immediately. Gateway fees absorbed by Calvy.
- **Pending + hold:** create Appointment `pending_payment` + slot/token hold (`holdExpiresAt = now+10m`) + Payment `CREATED`; checkout lists UPI first ("Recommended"). Webhook `PAID` (idempotent) → confirm, write fee ledger, send email. `FAILED`/timeout → release (lazy on read + cron sweep); token numbers of released holds are not reused. Paid after expiry → auto-refund.
- **Queue actions:** Next (SERVING → DONE, next WAITING → SERVING). Not present #1: position += 2 (or end), recompute ETAs, email new position/time. #2: NO_SHOW, closed, email, no refund. Not coming: MOVED; new appointment same session next working day at end of queue, `carriedFromId`, ledger `CARRIED_OVER`, no new charge, email. Walk-in: source WALK_IN, fee 0, token at end.
- **Live tracking:** `/{slug}/q/{signedCode}` polls 15s: "Now serving #8 · you are #12 · ~25 min"; no PII.

## Email templates (all via `t()`)
Slot confirmed (+ fee receipt), Token confirmed (number, ETA, tracking link), Payment failed / hold expired, Moved back (new position + ETA), No-show closed, Moved to next day, Owner: new paid booking. Walk-in only if email given.

## Chunk order (one branch each)
1. `step-3/packs-terms-engine`: schema PackId/termsOverride, `lib/packs`, `lib/terms`, backfill. Tests: term fallback, plural, override, pack Zod validation.
2. `step-3/packs-onboarding`: five packs' defaults, pack picker at signup + settings, idempotent apply. Tests: apply twice harmless, defaults valid.
3. `step-3/terms-rollout`: `t()` across website, booking page, dashboard, emails. Tests: snapshot of rendered email strings per pack.
4. `step-3/theme-colour`: presets + picker on all plans, CSS var on website + booking page. Tests: hex/contrast helper.
5. `step-4/token-sessions`: TokenSession, bookingMode, settings + capacity preview. Tests: capacity, overlapping sessions rejected.
6. `step-4/token-booking`: atomic assignment, token booking UI, confirmation email. Tests: numbering, ETA, capacity full (pure part).
7. `step-4/queue-screen`: walk-ins, Next / Not present / Not coming, ETA recompute, emails. Tests: move-back-2, second skip = no-show, next-working-day, ETA after skips.
8. `step-4/live-tracking`: public page + signed code. Tests: code sign/verify, payload has no PII.
9. `step-5/payments-core`: enums, Payment, ledger, WebhookEvent, provider interface + mock, `lib/fees`. Tests: fee matrix (IN free/paid, intl, both payers, both modes), mock contract, idempotency.
10. `step-5/pending-holds-checkout`: pending booking, hold expiry + sweep, UPI-first mock checkout, refund-after-expiry. Tests: expiry/release logic, token not reused.
11. `step-5/online-payment-settings`: country, mode, payer, plan waiver, PayoutAccount screen. Tests: settings Zod, waiver resolution.
12. `step-5/cashfree-split`: Cashfree adapter (test creds), vendor onboarding, split at order. Tests: signature verify, split amounts.

## Open questions
1. PLAN.md conflicts: Step 3 lists six packs (Spa separate, Dental variant, Hindi); Step 4 has REQUEST/CLASS/QUEUE items; Step 5 is messaging and monetization is Step 8. Does this design supersede them, and under which new item IDs?
2. Payment code is off-limits by CLAUDE.md: please authorise chunks 9 to 12. Does Cashfree replace Razorpay for India (and retire wallet/withdrawals), or do both coexist?
3. Which international gateway (Stripe Connect?) and does international allow FULL_ONLINE at launch?
4. Can an India Free business turn online payment off (pay at venue, no Rs 10)? Assumed no: every public booking pays Rs 10; dashboard bookings and walk-ins are free.
5. Refund when the business cancels a paid booking: is the Rs 10 refunded?
6. One queue per business per session, or per staff member? Assumed per business.
7. Not coming: same session next working day, end of queue? Limit on carry-overs?
8. GST on the Rs 10 (inclusive or extra) and invoice requirement.
9. Hold length (assumed 10 min) and slot-mode hold release rules for group (capacity > 1) services.
