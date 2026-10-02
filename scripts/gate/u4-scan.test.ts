import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { scanRepo, scanText } from "./u4-scan.js";

// Violations are assembled from parts so this test file does not trip the real scan.
const ANY = `an${"y"}`;
const ONLY = `.on${"ly"}(`;
const SKIP = `.sk${"ip"}(`;
const MARKER = `TO${"DO"}`;
const DISABLE = `eslint-${"disable"}`;
const FIXME = `.fi${"xme"}(`;
const TODO_CALL = `.to${"do"}(`;
const SKIP_IF = `.skip${"If"}(`;
const FAIL = `test.fa${"il"}(`;

const rules = (path: string, text: string): string[] => scanText(path, text).map((f) => f.rule);

describe("U4 scanner", () => {
  it("flags focused and skipped tests in test files only", () => {
    expect(rules("a/foo.test.ts", `it${ONLY}"x", () => {});`)).toEqual(["skip-only"]);
    expect(rules("e2e/foo.spec.ts", `test.describe${SKIP}"x", () => {});`)).toEqual(["skip-only"]);
    expect(rules("a/foo.ts", `it${ONLY}"x", () => {});`)).toEqual([]);
  });

  it("flags explicit any in its common spellings", () => {
    expect(rules("a.ts", `const x: ${ANY} = 1;`)).toEqual(["any"]);
    expect(rules("a.ts", `const x = y as ${ANY};`)).toEqual(["any"]);
    expect(rules("a.ts", `const x = <${ANY}>y;`)).toEqual(["any"]);
    expect(rules("a.ts", `const x: Record<string, ${ANY}> = {};`)).toEqual(["any"]);
    expect(rules("a.ts", `function f(a: ${ANY}[]) {}`)).toEqual(["any"]);
  });

  it("does not flag words that merely contain any", () => {
    expect(rules("a.ts", "const company = many.anything;")).toEqual([]);
    expect(rules("a.ts", "// returns any value the caller wants")).toEqual([]);
  });

  it("flags a lint disable without a justification and allows one with `-- reason`", () => {
    expect(rules("a.ts", `// ${DISABLE}-next-line no-console`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `/* ${DISABLE} */`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `// ${DISABLE}-next-line no-console -- CLI output is the point`)).toEqual(
      [],
    );
  });

  it("flags a TODO without a task id and allows ones with an id", () => {
    expect(rules("a.ts", `// ${MARKER}: fix later`)).toEqual(["todo"]);
    expect(rules("a.ts", `// ${MARKER}`)).toEqual(["todo"]);
    expect(rules("a.ts", `// ${MARKER}(T1.2): fix later`)).toEqual([]);
    expect(rules("a.ts", `// ${MARKER}(T0.3b) fix later`)).toEqual([]);
    expect(rules("a.ts", `// ${MARKER} T4.3 wire it up`)).toEqual([]);
  });

  it("reports file, line and the offending text", () => {
    const [finding] = scanText("src/a.ts", `ok();\nconst x: ${ANY} = 1;\n`);
    expect(finding).toMatchObject({ file: "src/a.ts", line: 2, rule: "any" });
  });

  it("flags todo, fixme, skipIf and test.fail in test files, not runIf", () => {
    expect(rules("a.test.ts", `it${TODO_CALL}"x");`)).toEqual(["skip-only"]);
    expect(rules("e2e/a.spec.ts", `test${FIXME}"x", async () => {});`)).toEqual(["skip-only"]);
    expect(rules("a.test.ts", `describe${SKIP_IF}(cond)("x", () => {});`)).toEqual(["skip-only"]);
    expect(rules("e2e/a.spec.ts", `${FAIL})`)).toEqual(["skip-only"]);
    expect(rules("a.test.ts", `it.runIf(cond)("x", () => {});`)).toEqual([]);
    expect(rules("a.ts", `test${FIXME}"x");`)).toEqual([]);
  });

  it("honors gate-allow with a reason on the same line only", () => {
    expect(rules("e2e/a.spec.ts", `${FAIL}) // gate-allow: self-test of the helper`)).toEqual([]);
    expect(rules("e2e/a.spec.ts", `${FAIL}) // gate-allow:`)).toEqual(["skip-only"]);
    expect(rules("e2e/a.spec.ts", `// gate-allow: nope\n${FAIL})`)).toEqual(["skip-only"]);
  });

  it("checks TODOs on every line of a block comment", () => {
    const text = `/*\n * intro\n * ${MARKER} later\n */\nconst a = 1;`;
    expect(scanText("a.ts", text)).toMatchObject([{ rule: "todo", line: 3 }]);
    expect(rules("a.ts", `/*\n * ${MARKER}(T1.2) later\n */`)).toEqual([]);
    expect(rules("a.ts", `/** ${MARKER} fix */`)).toEqual(["todo"]);
  });

  it("does not treat code after a block comment as comment text", () => {
    expect(rules("a.ts", `/* note */ const x: ${ANY} = 1;`)).toEqual(["any"]);
    expect(rules("a.ts", `/*\n ${ANY} stuff\n*/\nconst x = 1;`)).toEqual([]);
  });

  it("detects lint disables in doc-comment and block forms", () => {
    expect(rules("a.ts", `/** ${DISABLE} no-console */`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `/* ${DISABLE} no-console */`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `/*\n * ${DISABLE}-next-line foo\n */`)).toEqual(["eslint-disable"]);
    expect(rules("a.ts", `/* ${DISABLE} no-console -- reason here */`)).toEqual([]);
    expect(rules("a.ts", `// we never use ${DISABLE} here`)).toEqual([]);
  });

  it("catches any in generics, unions, arrays and promises", () => {
    expect(rules("a.ts", `const m: Map<string, ${ANY}> = new Map();`)).toEqual(["any"]);
    expect(rules("a.ts", `const f: Foo<string, ${ANY}, number> = x;`)).toEqual(["any"]);
    expect(rules("a.ts", `type U = string | ${ANY};`)).toEqual(["any"]);
    expect(rules("a.ts", `type U = ${ANY};`)).toEqual(["any"]);
    expect(rules("a.ts", `let a: ${ANY}[] = [];`)).toEqual(["any"]);
    expect(rules("a.ts", `async function f(): Promise<${ANY} | null> {}`)).toEqual(["any"]);
    expect(rules("a.ts", `type X<T extends ${ANY}> = T;`)).toEqual(["any"]);
  });

  it("does not flag any inside strings or comments", () => {
    expect(rules("a.ts", `const s = "value: ${ANY}";`)).toEqual([]);
    expect(rules("a.ts", `const s = 'Record<string, ${ANY}>';`)).toEqual([]);
    expect(rules("a.ts", "const s = `as " + ANY + "`;")).toEqual([]);
    expect(rules("a.ts", `// x: ${ANY}`)).toEqual([]);
    expect(rules("a.ts", `/** returns Promise<${ANY}> sometimes */`)).toEqual([]);
    expect(rules("a.ts", `const a = any.thing(); anyFn(any);`)).toEqual([]);
  });

  describe("scanRepo", () => {
    const roots: string[] = [];
    afterEach(() => {
      for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true });
    });

    it("scans TS and JS sources, including .ts under tests/fixtures, but not JSON or build dirs", () => {
      const root = mkdtempSync(path.join(tmpdir(), "u4-"));
      roots.push(root);
      const bad = `const x: ${ANY} = 1;\n`;
      for (const rel of [
        "src/a.ts",
        "src/b.tsx",
        "src/c.mjs",
        "tests/fixtures/sleeper/helper.ts",
        "node_modules/pkg/index.js",
        ".next/x.js",
        "tests/fixtures/data.json",
      ]) {
        mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
        writeFileSync(path.join(root, rel), bad);
      }
      const result = scanRepo(root);
      expect(result.findings.map((f) => f.file).sort()).toEqual([
        "src/a.ts",
        "src/b.tsx",
        "src/c.mjs",
        "tests/fixtures/sleeper/helper.ts",
      ]);
      expect(result.filesScanned).toBe(4);
    });
  });
});
