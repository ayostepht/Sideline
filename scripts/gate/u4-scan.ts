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

// Directive words are built from parts so this file does not trip its own scan.
const DISABLE = `eslint-${"disable"}`;
const TODO_WORD = `TO${"DO"}`;

// A real directive starts the comment; prose that merely mentions the word is not one.
// Block comment lines start with `*`, so leading stars and spaces are allowed.
const DISABLE_RE = new RegExp(`^[\\s*]*${DISABLE}(?:-next-line|-line)?(?![\\w-])(.*)$`);
const JUSTIFIED_RE = /(?:^|\s)--\s+\S/;
const SKIP_ONLY_RES = [
  /\b(?:it|test|describe|suite)(?:\.\w+)*\.(?:skip|only|skipIf|todo|fixme|fail)\b/,
  /\.(?:skip|only|skipIf|todo|fixme)\s*\(/,
  /\btest\.fail\s*\(/,
  /\b(?:xit|xtest|xdescribe|fdescribe)\s*\(/,
];
/** `any` in a type position: after : < , | & as extends, or `type X = any`. Run on code only. */
const ANY_RES = [
  /(?:[:<,|&]|\bas|\bextends)\s*any\b(?![\w$]|\s*[.(])/,
  /\btype\s+\w+(?:<[^>]*>)?\s*=\s*any\b(?![\w$])/,
];
const TODO_RE = new RegExp(`\\b${TODO_WORD}\\b`);
const TODO_WITH_ID_RE = new RegExp(`\\b${TODO_WORD}\\b(?:\\s*[:(]\\s*|\\s+)T\\d+\\.\\d+[a-z]?\\b`);
/** Same-line exemption for the skip-only rule: `// gate-allow: <reason>` (reason required). */
const ALLOW_RE = /gate-allow:\s*\S/;

export function isTestFile(relPath: string): boolean {
  return (
    /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(relPath) ||
    relPath.startsWith("tests/") ||
    relPath.startsWith("e2e/")
  );
}

interface LexState {
  inBlock: boolean;
  inTemplate: boolean;
}

interface LexedLine {
  /** The line with comments removed and string contents blanked. */
  code: string;
  /** Each comment fragment on the line (text after the comment opener, or the whole line). */
  comments: string[];
}

/** Splits one line into code and comment text, carrying block-comment and template state. */
function lexLine(line: string, state: LexState): LexedLine {
  let code = "";
  const comments: string[] = [];
  let i = 0;
  while (i < line.length) {
    if (state.inBlock) {
      const end = line.indexOf("*/", i);
      comments.push(line.slice(i, end === -1 ? undefined : end));
      if (end === -1) return { code, comments };
      state.inBlock = false;
      i = end + 2;
      continue;
    }
    if (state.inTemplate) {
      let j = i;
      while (j < line.length && line[j] !== "`") j += line[j] === "\\" ? 2 : 1;
      if (j >= line.length) return { code, comments };
      state.inTemplate = false;
      i = j + 1;
      code += '""';
      continue;
    }
    const ch = line[i] ?? "";
    const next = line[i + 1];
    if (ch === "/" && next === "/") {
      comments.push(line.slice(i + 2));
      return { code, comments };
    }
    if (ch === "/" && next === "*") {
      state.inBlock = true;
      i += 2;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      if (j >= line.length) {
        // Unterminated on this line: only template literals continue onto the next line.
        if (ch === "`") state.inTemplate = true;
        return { code: `${code}""`, comments };
      }
      code += '""';
      i = j + 1;
      continue;
    }
    code += ch;
    i += 1;
  }
  return { code, comments };
}

/** Scans the text of one source file. `relPath` is repo-relative with forward slashes. */
export function scanText(relPath: string, text: string): U4Finding[] {
  const findings: U4Finding[] = [];
  const testFile = isTestFile(relPath);
  const state: LexState = { inBlock: false, inTemplate: false };
  text.split(/\r?\n/).forEach((line, index) => {
    const add = (rule: U4Rule, message: string): void => {
      findings.push({ file: relPath, line: index + 1, rule, message, text: line.trim() });
    };
    const { code, comments } = lexLine(line, state);
    const allowed = comments.some((c) => ALLOW_RE.test(c));
    if (testFile && !allowed && SKIP_ONLY_RES.some((re) => re.test(code))) {
      add("skip-only", "skipped, focused, todo or expected-failure test");
    }
    if (ANY_RES.some((re) => re.test(code))) {
      add("any", "explicit any (use unknown plus zod)");
    }
    for (const c of comments) {
      const disable = DISABLE_RE.exec(c);
      if (disable !== null && !JUSTIFIED_RE.test(disable[1] ?? "")) {
        add("eslint-disable", "lint disable without a justification after --");
        break;
      }
    }
    if (comments.some((c) => TODO_RE.test(c) && !TODO_WITH_ID_RE.test(c))) {
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
      walk(root, childRel, out);
    } else if (entry.isFile() && SOURCE_EXT.test(entry.name)) {
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
