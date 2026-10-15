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

Take a database backup or a Neon branch first. If the `migrate diff` step reports differences, stop and compare them with `prisma/schema.prisma` before resolving anything.

After that, every release that contains new migrations runs `npm run db:deploy` **before** the new code starts serving traffic.

### Vercel

`npm run build` no longer pushes the schema, so on Vercel set the **Build Command** to:

```
npm run db:deploy && npm run build
```

(or run `db:deploy` in a release step; Step 7, item S7-03 of `docs/PLAN.md`, formalises this). Do this only after the one-time production step above. If `db:deploy` fails, the deploy stops and the old version keeps serving.

Preview deployments must not use the production `DATABASE_URL` (see S7-02).

## Troubleshooting

- *"Environment variable not found: DATABASE_URL"* when running `npx prisma ...` directly: the CLI does not read `.env.local`. Use the npm scripts, or `node --env-file=.env.local node_modules/prisma/build/index.js <command>`.
- *Prisma wants to reset the database* during `db:migrate`: do not accept on a database that holds data you need. It means the migration history and the database disagree. Check `npm run db:status` and ask before resetting anything.
- *Drift detected*: someone changed the database outside migrations. Compare with `prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma`, then capture the change as a migration.
