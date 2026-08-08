# Sakred Body — working agreements

Two Claude sessions work in this repo at once. These are the rules that stop
them standing on each other.

---

## 1. Deploy exactly once: `git push`, and nothing else

**Never run `vercel deploy`, `vercel --prod`, or `vercel redeploy`.**

This project has the Vercel GitHub integration enabled. Pushing to `main`
already builds and promotes to production. Running the CLI on top of it
produces a **second** production deploy of the same commit, seconds after the
first, which then overwrites it.

Every commit from `186f2c8` onward shipped twice this way. The two are easy to
tell apart in the dashboard: the Git one carries `branchAlias` and
`repoPushedAt`; the extra one carries `"actor": "claude-code_…_agent"`, and at
least one carried `"gitDirty": 1` — a production deploy built from an
uncommitted working tree, which is a build nobody can reproduce from a SHA.

If a deploy is genuinely needed without a commit, ask first. Otherwise:

```
git push        # this is the deploy
```

## 2. Never `git add -A`

The working tree is shared. `git add -A` sweeps whatever the other session has
in flight into your commit. It has happened three times (`30d163e`, `b6a049b`,
`5eb89ea`) — nothing was lost, but the commit messages describe half of what
they contain.

Stage by path, always:

```
git add client/src/components/Thing.tsx server/thing/routes.ts
```

If you find yourself wanting `-A`, that is the signal you don't know what's
dirty. Run `git status` and look.

## 3. Ownership

| area | owner |
|---|---|
| `client/src/pages/` marketing (Home, Philosophy, Restore, Build, Embody, Terrain, BodyLiteracy, Retreats, Executive, FoodChart, Mastermind) | the site session |
| motion + design components (`Deck`, `StarDust`, `ConstellationBody`, `JungleCanopy`, `FlowField`, `MoonPhase`, …) | the site session |
| `client/src/pages/MemberDashboard`, `CoachingDashboard`, `AdminPortal` | the portal session |
| `client/src/components/admin/`, `CommunityTab`, `DailyRitual`, `ApothecaryTab`, `LibraryTab`, `MastermindsTab` | the portal session |
| `server/`, `shared/`, `supabase/`, `script/` | the portal session |
| `client/index.html`, `client/src/index.css`, `App.tsx` | shared — say so in the commit |

Consume the other side's modules (`breath.ts`, `canvasStage.ts`, `gem.ts`);
don't edit them.

## 4. Don't "fix" a file that is mid-edit

If `npx tsc --noEmit` fails on a file you don't own, that is almost certainly
the other session typing. Check `git status` before touching it. It will
compile in a minute.

## 5. Migrations are transactional and forward-only

`supabase/*.sql` runs whole-file through the Management API — one bad column
rolls the entire file back. After any migration, verify the result rather than
trusting the success response:

```sql
SELECT tablename, rowsecurity,
       (SELECT count(*) FROM pg_policies p WHERE p.tablename = t.tablename)
FROM pg_tables t WHERE schemaname = 'public';
```

RLS-on-with-zero-policies is the failure that looks like success.

## 6. Secrets

`.env` is gitignored and holds AWS credentials. Never commit it, never print
its values, never paste a key into a commit message or a chat.

Vercel marks the AWS and database vars **Sensitive**, so `vercel env pull`
returns them empty by design. That is not a bug; don't "fix" it.

---

## The stack, in one line each

- **Vite + React 18 + wouter** on the client. **Not Next.js** — ignore any
  tooling that suggests `"use client"`, App Router, or `next.config`.
- **Express 5 + Drizzle** on the server, deployed as one Vercel function
  (`api/index.ts`, `maxDuration: 30`).
- **Supabase Postgres**, project `zcvanbozvtojmnyuzsjh`. Every table has RLS.
- **AWS Bedrock, `zai.glm-5`**, via the Converse API — model-agnostic on
  purpose, since GLM-5 isn't an Anthropic model.
- `npm test` — 192 assertions across engine, almanac, voice and community.
  Run it before you commit server or shared changes.
