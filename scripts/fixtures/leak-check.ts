/**
 * Leak detection: pure functions, no I/O.
 *
 * Given the original identifier set (derived from raw data, never from tracked files) and the
 * fixture files, report which files still contain an original identifier. Reports file, category
 * and the identifier's index in its list, never the identifier itself.
 *
 * Matching:
 *  - ids and avatars: exact substring (also in file paths).
 *  - names of 4+ characters: case-insensitive substring in string values.
 *  - shorter names (under 4 characters): case-insensitive whole-word match (word boundaries) inside
 *    any string value, and inside the raw text of non-JSON files such as .md. Whole-value equality
 *    alone is not enough: a short name in a sentence would slip through.
 *  - values under player name keys (full_name, first_name, ...) are public data and are skipped
 *    for names (ids and avatars are still checked everywhere).
 */
import { PLAYER_NAME_KEYS, type IdentifierSet } from "./sanitize.js";

export interface FixtureFile {
  /** Path relative to the fixture root. */
  path: string;
  text: string;
}

export type LeakCategory = "id" | "name" | "avatar";

export interface Leak {
  file: string;
  category: LeakCategory;
  /** Index into `IdentifierSet[category]`. */
  index: number;
}

const MIN_SUBSTRING_NAME = 4;

function wordRegex(name: string): RegExp {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu");
}

interface Leaf {
  key: string | null;
  text: string;
}

function collectLeaves(value: unknown, key: string | null, out: Leaf[]): void {
  if (typeof value === "string") {
    out.push({ key, text: value });
  } else if (Array.isArray(value)) {
    for (const v of value as unknown[]) collectLeaves(v, key, out);
  } else if (typeof value === "object" && value !== null) {
    for (const [k, v] of Object.entries(value)) collectLeaves(v, k, out);
  }
}

function leavesOf(file: FixtureFile): Leaf[] {
  try {
    const leaves: Leaf[] = [];
    collectLeaves(JSON.parse(file.text) as unknown, null, leaves);
    return leaves;
  } catch {
    return [{ key: null, text: file.text }];
  }
}

export function findLeaks(files: readonly FixtureFile[], ids: IdentifierSet): Leak[] {
  const leaks: Leak[] = [];
  const names = ids.names.map((n) => n.toLowerCase());
  for (const file of files) {
    const hay = `${file.path}\n${file.text}`;
    ids.ids.forEach((id, index) => {
      if (id.length > 0 && hay.includes(id)) leaks.push({ file: file.path, category: "id", index });
    });
    ids.avatars.forEach((a, index) => {
      if (a.length > 0 && hay.includes(a)) {
        leaks.push({ file: file.path, category: "avatar", index });
      }
    });
    const leaves: Leaf[] = [{ key: null, text: file.path }, ...leavesOf(file)];
    const lowered = leaves.map((l) => ({
      key: l.key,
      text: l.text.toLowerCase(),
    }));
    names.forEach((name, index) => {
      if (name.length === 0) return;
      const long = name.length >= MIN_SUBSTRING_NAME;
      const word = long ? null : wordRegex(name);
      const hit = lowered.some((l) => {
        if (l.key !== null && PLAYER_NAME_KEYS.has(l.key)) return false;
        return word === null ? l.text.includes(name) : word.test(l.text);
      });
      if (hit) leaks.push({ file: file.path, category: "name", index });
    });
  }
  return leaks;
}
