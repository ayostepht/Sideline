import { z } from "zod";

interface PwSuite {
  title?: string | undefined;
  specs?:
    { title: string; tests: { projectName?: string | undefined; status: string }[] }[] | undefined;
  suites?: PwSuite[] | undefined;
}

const SuiteSchema: z.ZodType<PwSuite> = z.lazy(() =>
  z.object({
    title: z.string().optional(),
    specs: z
      .array(
        z.object({
          title: z.string(),
          tests: z.array(z.object({ projectName: z.string().optional(), status: z.string() })),
        }),
      )
      .optional(),
    suites: z.array(SuiteSchema).optional(),
  }),
);

const ReportSchema = z.object({
  suites: z.array(SuiteSchema),
  stats: z.object({
    expected: z.number(),
    unexpected: z.number(),
    flaky: z.number(),
    skipped: z.number(),
  }),
});

export interface TagTally {
  passed: number;
  failed: number;
  skipped: number;
}

export interface PlaywrightSummary {
  expected: number;
  unexpected: number;
  flaky: number;
  skipped: number;
  projects: string[];
  /** Tests whose title contains a tag such as "UI5", tallied per tag. */
  tags: Record<string, TagTally>;
}

function visit(
  suite: PwSuite,
  fn: (title: string, project: string | undefined, status: string) => void,
): void {
  for (const spec of suite.specs ?? []) {
    for (const test of spec.tests) fn(spec.title, test.projectName, test.status);
  }
  for (const child of suite.suites ?? []) visit(child, fn);
}

/** Summarizes Playwright's JSON reporter output; tags are matched by substring of the test title. */
export function summarizePlaywright(
  json: unknown,
  tags: readonly string[],
): PlaywrightSummary | undefined {
  const parsed = ReportSchema.safeParse(json);
  if (!parsed.success) return undefined;
  const tally: Record<string, TagTally> = {};
  for (const tag of tags) tally[tag] = { passed: 0, failed: 0, skipped: 0 };
  const projects = new Set<string>();
  for (const suite of parsed.data.suites) {
    visit(suite, (title, project, status) => {
      if (project !== undefined) projects.add(project);
      for (const tag of tags) {
        if (!title.includes(tag)) continue;
        const t = tally[tag];
        if (t === undefined) continue;
        if (status === "expected" || status === "flaky") t.passed += 1;
        else if (status === "skipped") t.skipped += 1;
        else t.failed += 1;
      }
    });
  }
  return { ...parsed.data.stats, projects: [...projects].sort(), tags: tally };
}
