# Step 2 design: core booking engine (S2-01 to S2-19)

**Data model.** All instants are UTC `@db.Timestamptz(3)`; wall-clock rules (hours) are minutes-since-midnight in `Business.timezone` (IANA, default `Asia/Kolkata`, picked at signup). New `lib/time.ts` (Intl-based, no new dependency) converts zone day/time to UTC and back, DST-safe.
- `WorkingHours {businessId, staffId?, weekday 0-6, startMin, endMin}`: several rows per day = breaks; `staffId null` = business hours; a staff member with no rows inherits business hours.
- `TimeOff {businessId, staffId?, startAt, endAt, reason}`: `staffId null` = holiday/closure, else staff leave.
- `StaffService` (exists) becomes mandatory: a staff member is offered for a service only when linked.
- `Service.bufferBeforeMin`, `bufferAfterMin` (0); `Business.minNoticeMinutes` (0), `maxAdvanceDays` (90), `cancellationCutoffHours` (0). Defaults keep today's behaviour.
- `Appointment.endAt` (start + total duration) plus snapshot `bufferBeforeMin`/`bufferAfterMin`, so later service edits never move past conflicts.
- `AppointmentService {appointmentId, serviceId, position, name, durationMin, price}` (snapshots). `Appointment.serviceId` stays as the primary FK; nothing parses `notes`.
- `Appointment.manageTokenHash @unique` (SHA-256 of a random token, same pattern as `PasswordResetToken`); raw token only in the customer email link.

**Double-booking: recommend transaction + advisory lock.** An exclusion constraint (btree_gist on `staffId` + `tstzrange`) cannot express group capacity (>1), the owner's "allow overlap" option, buffers that live on the other row, or staffless businesses; it would also need a partial-index workaround per case. Instead: `$transaction` → `pg_advisory_xact_lock(hashtextextended(staffId ?? businessId, 0))` → re-check the one slot with the same engine → insert → commit → side effects via `after()`. One lock at a time (no deadlocks); "any staff" tries candidates in deterministic order. Works with read committed and Neon pooled connections (xact locks release at commit).

**Migrations (one per PR, `prisma migrate dev` on the dev DB only):**
1. `business_timezone_utc` (S2-01): add `timezone`; `Appointment.date` to timestamptz, reinterpreting stored wall-clock as IST: `(date AT TIME ZONE 'Asia/Kolkata')`; add `endAt` = date + duration.
2. `schedules_timeoff_rules` (S2-04): `WorkingHours`, `TimeOff`, buffers, notice/advance/cutoff; backfill `WorkingHours` from `availabilityJson` and `Staff.workingHours` JSON (JSON columns kept, dropped in Step 3); link every active staff to every service that has no `StaffService` rows.
3. `booking_indexes` (S2-11): `Appointment(businessId, date)`, `(staffId, date)`, `(date, reminderSent)`, `TimeOff(businessId, startAt)`, plus the PLAN list.
4. `appointment_services` (S2-09): create rows from `serviceId`, then from `__services__:A|B` names matched by name within the business (prefer active, then oldest); strip the prefix; unmatched names stay in `notes` and are counted in the migration output.
5. `client_phone_dedupe` (S2-08), 6. `money_enums` (S2-10, wallet type changes need owner approval first), 7. `appointment_manage_token` (null for old rows; issued on next email).
Demo data: snapshot a Neon branch before each `db:deploy`; each migration is idempotent on re-run and checked with row counts before/after.

**Availability algorithm** (pure function in `lib/booking.ts`, DB loading in a thin wrapper):
1. Load business rules, requested services (active only), candidate staff = active and linked to **all** requested services.
2. Turn the requested zone date into a UTC window; clip to [now + minNotice, now + maxAdvanceDays].
3. Per staff: working intervals for that weekday (staff rows, else business rows) → UTC; subtract business and staff `TimeOff`.
4. Busy intervals = non-cancelled appointments of that staff, expanded by their stored buffers.
5. Need = bufferBefore + sum of durations + bufferAfter (services run back to back, same staff).
6. Step through each free interval every `slotInterval` (> 0, max `MAX_SLOTS`); keep starts where the needed block fits and avoids busy time; capacity > 1 allows up to capacity bookings of the same service at the same start.
7. Return slot → staff ids; "any available" picks fewest bookings that day, then `staffId` order.
8. Booking and reschedule (S2-07) run steps 1-6 for one slot inside the lock; cancel/no-show free it; cutoff enforced on customer cancel.

**Chunk order:** 1 `step-2/timezone-locking` (S2-01, S2-02, S2-06) → 2 `step-2/schedules-availability` (S2-04, S2-03, S2-05, S2-11) → 3 `step-2/appointment-data` (S2-09, S2-08, S2-10, manage token) → 4 `step-2/rules-side-effects` (S2-07, S2-12) → 5 `step-2/owner-screens` (S2-13, S2-14, S2-16) → 6 `step-2/calendar-booking-tests` (S2-15, S2-17, S2-18); S2-19 on request.
