/**
 * Migrations the application code expects, embedded at build time so the web process can detect
 * migration state without reading the drizzle folder (a bundled server has no reliable path to it).
 * `when` is the journal's `when`, which drizzle stores as `created_at` in `__drizzle_migrations`.
 * Keep in sync with `drizzle/meta/_journal.json`: `migrations-manifest.test.ts` fails otherwise.
 */
export interface ExpectedMigration {
  readonly tag: string;
  readonly when: number;
}

export const EXPECTED_MIGRATIONS: readonly ExpectedMigration[] = [
  { tag: "0000_fuzzy_snowbird", when: 1790949381949 },
  { tag: "0001_volatile_tinkerer", when: 1790953813425 },
  { tag: "0002_material_leader", when: 1791331056794 },
  { tag: "0003_illegal_omega_sentinel", when: 1791332889609 },
  { tag: "0004_lonely_maelstrom", when: 1791382107449 },
  { tag: "0005_eager_nick_fury", when: 1791390315378 },
];
