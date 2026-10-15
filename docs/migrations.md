# Database migrations

Calvy changes its database schema with **Prisma migrations only**. `prisma db push` is never used (not by hand, not in the build, not in CI).

## The baseline

The old migration folders (April 2026, five files) did not cover most tables, because the schema was being pushed with `db push`. They are archived, unchanged, in `prisma/migrations-archive/` for history and are **not** applied by anything.

`prisma/migrations/20261015000000_baseline/migration.sql` creates the whole schema as of 15 Oct 2026 (20 tables). It was generated with:

```powershell
node --env-file=.env.local node_modules/prisma/build/index.js migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script
```

and verified two ways:
1. Replaying `prisma/migrations` on an empty shadow database gives exactly the schema in `prisma/schema.prisma` (`migrate diff --from-migrations ... --exit-code` returned 0).
2. The live dev database already matched `prisma/schema.prisma` (no difference), so the baseline was marked as applied there with `migrate resolve --applied`.

## Everyday commands (PowerShell, from the repo root)

Prisma's own CLI reads only `.env`, not `.env.local`. The npm scripts below load `.env.local` for you.

```powershell
npm run db:status          # which migrations are applied
npm run db:migrate         # create and apply a new migration in development (asks for a name)
npm run db:seed            # seed demo data and the dev-only test accounts
npm run db:deploy          # apply pending migrations (production, CI, staging); no prompts, no shadow DB
npx prisma generate        # regenerate the client (also runs on npm install and in npm run build)
```

`npm run build` is now `prisma generate && next build`. **It never touches the database schema.**

## Making a schema change

1. Edit `prisma/schema.prisma`.
2. `npm run db:migrate` and give the migration a short name (for example `add_password_reset_token`). Prisma writes `prisma/migrations/<timestamp>_<name>/migration.sql` and applies it to the database in `DATABASE_URL`.
3. Read the generated SQL before committing it. It must not drop or rewrite data you care about.
4. Commit the migration folder together with the schema change and the code that uses it.
5. Never edit a migration that has been merged. Fix forward with a new one.
6. Migration files must stay byte-identical on every machine (Prisma checksums them). `.gitattributes` forces LF line endings for `prisma/migrations/**/*.sql`; do not change that.

Rules for safe migrations (zero-downtime style):
- Add new columns as nullable or with a default; backfill; only then tighten (`NOT NULL`, unique) in a later migration.
- Do not rename or drop a column in the same release that stops using it; split into two releases.
- A migration that could fail on existing data (a new unique index, for example) must first detect and report the offending rows, never delete them.

## Shadow database

`prisma migrate dev` needs a scratch database to compare migrations with the schema. It is configured in `prisma/schema.prisma` as `shadowDatabaseUrl = env("SHADOW_DATABASE_URL")`. Put the connection string of a separate, empty database (a Neon branch named `shadow` in our setup) in `.env.local`:

```
SHADOW_DATABASE_URL="postgresql://..."
```

It is **not** needed for `generate`, `build`, `migrate deploy`, `migrate status` or CI; those work without it. Never point it at the same database as `DATABASE_URL`: Prisma resets it.

## Production and staging: one-time step, then routine

Production was created with `db push`, so its tables already exist but it has no migration history. **Before the first deploy that uses `migrate deploy`**, tell Prisma the baseline is already there (this changes no tables, it only records the baseline in `_prisma_migrations`):

```powershell
# PowerShell, with the PRODUCTION connection string in this shell only (do not save it to a file)
$env:DATABASE_URL = "<production connection string>"
npx prisma migrate status                                  # expect: 1 migration found, not yet applied
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code   # expect: No difference detected
npx prisma migrate resolve --applied 20261015000000_baseline
npx prisma migrate status                                  # expect: Database schema is up to date
Remove-Item Env:\DATABASE_URL
```

**Step 0: take a database backup or create a Neon branch of production first.** If the `migrate diff` step reports differences, stop and compare them with `prisma/schema.prisma` before resolving anything.

After that, every release that contains new migrations runs `npm run db:deploy` **before** the new code starts serving traffic.

### Vercel

`npm run build` no longer pushes the schema, so something else has to apply migrations on deploy. **Preconditions (do these first):**

1. Do the one-time production step above.
2. `DATABASE_URL` in Vercel must be scoped to **Production only**. Preview and Development must use a different database (a Neon branch). Vercel runs one Build Command for Production and Preview, so if Preview inherits the production `DATABASE_URL`, a pull-request preview would run its unmerged migrations against production. Check Project Settings, then Environment Variables, and confirm the Production-only scope before changing the Build Command.
3. For the migration step use the **direct** (non-pooled) Neon connection string, not the `-pooler` host. Migrations take a database lock that pooled connections can hang on. The easiest way is a second variable, for example `MIGRATE_DATABASE_URL` (direct URL, Production only), and the command below passes it to Prisma.

Then set the **Build Command** to a guarded form that migrates only for Production:

```
if [ "$VERCEL_ENV" = "production" ]; then DATABASE_URL="$MIGRATE_DATABASE_URL" npm run db:deploy; fi && npm run build
```

If `db:deploy` fails the deploy stops and the previous version keeps serving. Step 7 (S7-02, S7-03 in `docs/PLAN.md`) replaces this with environments and a proper release step.

## Safety checks before any Prisma command

- Node's `--env-file` does not override variables that are already set in your shell. If you ran the production procedure and left `$env:DATABASE_URL` set, `npm run db:migrate` will target **production**. Always finish that procedure with `Remove-Item Env:\DATABASE_URL`, and run `echo $env:DATABASE_URL` (it should be empty) before `npm run db:migrate`.
- `DATABASE_URL` and `SHADOW_DATABASE_URL` must be different databases. If they were the same, `migrate dev` would wipe the main database.
- Never run `prisma migrate reset` or `prisma db push` against anything but a throwaway local database. The production procedure uses only `migrate status`, `migrate diff` and `migrate resolve`.
- Typing the production connection string into PowerShell can leave it in the command history. Prefer `$env:DATABASE_URL = Read-Host "Production URL"` (type it when asked) and clear it afterwards.
- The `--env-file-if-exists` flag used by `db:migrate`, `db:status` and `db:seed` needs Node 22.9 or newer on your machine (Node 24 is installed here). CI and Vercel do not use these scripts.

## Troubleshooting

- *"Environment variable not found: DATABASE_URL"* when running `npx prisma ...` directly: the CLI does not read `.env.local`. Use the npm scripts, or `node --env-file=.env.local node_modules/prisma/build/index.js <command>`.
- *Prisma wants to reset the database* during `db:migrate`: do not accept on a database that holds data you need. It means the migration history and the database disagree. Check `npm run db:status` and ask before resetting anything.
- *Drift detected*: someone changed the database outside migrations. Compare with `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`, then capture the change as a migration.
