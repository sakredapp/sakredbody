# Supabase migrations

Project ref: **`zcvanbozvtojmnyuzsjh`** (the sakredbody project — distinct from
the CRM and app projects).

Every file here is idempotent. Paste into the SQL editor and run, in this order
— later files reference tables created by earlier ones.

| # | File | Creates | Run? |
|---|---|---|---|
| 1 | `rls-policies.sql` | `is_sakred_admin()` and base policies | pre-existing |
| 2 | `executive-applications.sql` | `executive_applications` | **pending** |
| 3 | `habit-integrity.sql` | habit dedupe, FK, tombstones, coin dedupe | **pending** |
| 4 | `apothecary.sql` | `products`, `product_links`, `habit_products`, `routine_products`, `user_shop_checkoffs` | **pending** |
| 5 | `library.sql` | `ebooks`, `ebook_sections`, `ebook_entitlements`, `ebook_progress` | **pending** |
| 6 | `energy.sql` | `energy_centres` (+ nine seeded), `centre_habits`, `centre_routines`, `user_centre_readings`, `user_cosmology` | **pending** |
| 7 | `cohorts.sql` | `cohorts`, `cohort_members`, `cohort_sessions`, `cohort_attendance` | **pending** |

**Order matters** for 3–7: `habit-integrity.sql` de-duplicates `habits` before
adding the unique index, and `apothecary.sql` / `energy.sql` both take foreign
keys against `routine_habits` and `wellness_routines`.

`habit-integrity.sql` is the only file that deletes rows. It removes duplicate
`habits` (keeping any completed one over an incomplete one), orphaned habits
whose enrollment no longer exists, and duplicate coin awards. Everything else is
`CREATE … IF NOT EXISTS`.

## The alternative to the SQL editor

With `SAKREDBODY_DATABASE_URL` in a local `.env`:

```bash
npm run db:push
```

Drizzle will create the tables from `shared/schema.ts`. It will **not** create
the RLS policies, the CHECK constraints, or the seeded energy centres — those
only exist in the SQL files. Run both if you go this route.

The env var is marked Sensitive in Vercel, so `vercel env pull` returns it
empty by design; the connection string has to be pasted in by hand.
