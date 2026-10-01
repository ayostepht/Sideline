import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

export type U4Rule = "skip-only" | "any" | "eslint-disable" | "todo";

export interface U4Finding {
  file: string;
  line: number;
  rule: U4Rule;
  message: string;
  text: string;
}

const SOURCE_EXT = /\.(?:[cm]?[jt]sx?)$/;
const EXCLUDED_DIRS = new Set([
  "node_modules",
  ".next",
  "coverage",
  "dist",
  "out",
  ".git",
  ".gate",
  ".screens",
  ".lighthouseci",
  ".spike-cache",
  ".turbo",
  ".claude",
  "playwright-report",
  "test-results",
]);
/** Repo-relative path prefixes that are never scanned (recorded fixtures, not source). */
const EXCLUDED_PREFIXES = ["tests/fixtures/"];

// Directive words are built from parts so this file does not trip its own scan.
const DISABLE = `eslint-${"disable"}`;
const TODO_WORD = `TO${"DO"}`;

// A real directive starts the comment; prose that merely mentions the word is not one.
const DISABLE_RE = new RegExp(`(?://|/\\*)\\s*${DISABLE}(?:-next-line|-line)?(?![\\w-])(.*)$`);
const JUSTIFIED_RE = /(?:^|\s)--\s+\S/;
const SKIP_ONLY_RES = [
  /\b(?:it|test|describe|suite)(?:\.\w+)*\.(?:skip|only)\b/,
  /\.(?:skip|only)\s*\(/,
  /\b(?:xit|xtest|xdescribe|fdescribe)\s*\(/,
];
const ANY_RES = [/:\s*any\b/, /\bas\s+any\b/, /<any\b[>,]/, /,\s*any\s*>/, /\bany\[\]/];
const TODO_RE = new RegExp(`\\b${TODO_WORD}\\b`);
const TODO_WITH_ID_RE = new RegExp(`\\b${TODO_WORD}\\b(?:\\s*[:(]\\s*|\\s+)T\\d+\\.\\d+[a-z]?\\b`);

export function isTestFile(relPath: string): boolean {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relPath) ||
    relPath.startsWith("tests/") ||
    relPath.startsWith("e2e/")
  );
}

/** True when `re` matches inside a comment (after `//` or `/*`, or on a `*` continuation line). */
function inComment(line: string, re: RegExp): boolean {
  const start = line.search(/\/\/|\/\*|^\s*\*/);
  return start >= 0 && re.test(line.slice(start));
}

function isCommentLine(line: string): boolean {
  const t = line.trimStart();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

/** Scans the text of one source file. `relPath` is repo-relative with forward slashes. */
export function scanText(relPath: string, text: string): U4Finding[] {
  const findings: U4Finding[] = [];
  const testFile = isTestFile(relPath);
  const lines = text.split(/\r?\n/);
  lines.forEach((line, index) => {
    const add = (rule: U4Rule, message: string): void => {
      findings.push({ file: relPath, line: index + 1, rule, message, text: line.trim() });
    };
    const comment = isCommentLine(line);
    if (testFile && !comment && SKIP_ONLY_RES.some((re) => re.test(line))) {
      add("skip-only", "skipped or focused test");
    }
    if (!comment && ANY_RES.some((re) => re.test(line))) {
      add("any", "explicit any (use unknown plus zod)");
    }
    const disable = DISABLE_RE.exec(line);
    if (disable !== null) {
      if (!JUSTIFIED_RE.test(disable[1] ?? "")) {
        add("eslint-disable", "lint disable without a justification after --");
      }
    }
    if (inComment(line, TODO_RE) && !TODO_WITH_ID_RE.test(line)) {
      add("todo", "TODO without a task id such as T1.2");
    }
  });
  return findings;
}

function walk(root: string, rel: string, out: string[]): void {
  for (const entry of readdirSync(path.join(root, rel), { withFileTypes: true })) {
    const childRel = rel === "" ? entry.name : `${rel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (EXCLUDED_DIRS.has(entry.name)) continue;
      if (EXCLUDED_PREFIXES.some((p) => `${childRel}/`.startsWith(p))) continue;
      walk(root, childRel, out);
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
      if (EXCLUDED_PREFIXES.some((p) => childRel.startsWith(p))) continue;
      out.push(childRel);
    }
  }
}

export interface U4Result {
  filesScanned: number;
  findings: U4Finding[];
}

export function scanRepo(root: string): U4Result {
  const files: string[] = [];
  walk(root, "", files);
  files.sort();
  const findings: U4Finding[] = [];
  for (const file of files) {
    findings.push(...scanText(file, readFileSync(path.join(root, file), "utf8")));
  }
  return { filesScanned: files.length, findings };
}
