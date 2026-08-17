/**
 * What production actually contains, read from production.
 *
 * ── Why this is one file and not nine numbers scattered around ────────────
 *
 * Because it is the only thing here that cannot be derived. Everything else a
 * verifier wants to know — how many tables the baseline creates, how many
 * policies the migrations add — is countable from files in the repository, and
 * counting is better than remembering. This is the far end of the comparison:
 * the database nobody can introspect from a test run, because its connection
 * string is a Vercel Sensitive variable and deliberately absent locally.
 *
 * So it is recorded once, with the date, and with the query that produced it,
 * so anyone with production access can reproduce the reading rather than
 * trusting it.
 *
 * ── When these change ─────────────────────────────────────────────────────
 *
 * A figure moving means production gained something. That is either a
 * migration this repository already contains — in which case the derived side
 * moves with it and nothing here needs touching — or it is a change made to
 * production that the repository has not been told about, which is the exact
 * failure the whole from-zero exercise exists to catch. Update these only
 * after establishing which of the two it was.
 *
 * The 16 Aug figures (93 tables, 154 policies, 89 enables) are historical and
 * appear in prose where the story needs them. They are not assertions anywhere.
 */

/**
 * Read 17 Aug 2026 with:
 *
 *   select
 *     (select count(*) from pg_tables where schemaname='public'),
 *     (select count(*) from pg_policies where schemaname='public'),
 *     (select count(*) from pg_tables where schemaname='public' and rowsecurity),
 *     (select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 *        where n.nspname='public' and p.oid not in (
 *          select objid from pg_depend d join pg_extension e on e.oid=d.refobjid
 *          where d.deptype='e')),
 *     (select count(*) from pg_constraint c join pg_class t on t.oid=c.conrelid
 *        join pg_namespace n on n.oid=t.relnamespace
 *        where n.nspname='public' and c.contype='f'),
 *     (select count(*) ... and c.contype='c'),
 *     (select count(*) from pg_indexes where schemaname='public'),
 *     (select count(*) from information_schema.columns where table_schema='public'),
 *     (select count(*) from pg_trigger t join pg_class c on c.oid=t.tgrelid
 *        join pg_namespace n on n.oid=c.relnamespace
 *        where n.nspname='public' and not t.tgisinternal);
 */
export const PRODUCTION_SHAPE = {
  tables: 94,
  policies: 155,
  rlsEnabled: 90,
  /** Ours. The other 31 in `public` arrive with pg_trgm. */
  functions: 6,
  foreignKeys: 99,
  checkConstraints: 116,
  indexes: 325,
  columns: 1008,
  triggers: 2,
} as const;

/** The queries that read each figure back out of a rebuilt database. */
export const SHAPE_QUERIES: Record<keyof typeof PRODUCTION_SHAPE, string> = {
  tables: "select count(*)::int n from pg_tables where schemaname='public'",
  policies: "select count(*)::int n from pg_policies where schemaname='public'",
  rlsEnabled: "select count(*)::int n from pg_tables where schemaname='public' and rowsecurity",
  functions:
    "select count(*)::int n from pg_proc p join pg_namespace ns on ns.oid=p.pronamespace where ns.nspname='public' and p.oid not in (select objid from pg_depend d join pg_extension e on e.oid=d.refobjid where d.deptype='e')",
  foreignKeys:
    "select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and c.contype='f'",
  checkConstraints:
    "select count(*)::int n from pg_constraint c join pg_class t on t.oid=c.conrelid join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public' and c.contype='c'",
  indexes: "select count(*)::int n from pg_indexes where schemaname='public'",
  columns: "select count(*)::int n from information_schema.columns where table_schema='public'",
  triggers:
    "select count(*)::int n from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace ns on ns.oid=c.relnamespace where ns.nspname='public' and not t.tgisinternal",
};
