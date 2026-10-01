/**
 * Fixture sanitizer: pure functions, no I/O.
 *
 * Builds a deterministic mapping from real identifiers (ids, usernames, display names, team names,
 * league names, avatars) to fakes, then rewrites JSON (deep walk, keys AND values).
 *
 * Determinism rules:
 *  - Fakes are assigned by sorted order of first appearance in a canonical walk, never by hashing
 *    the real value. Manager slot N is the owner of roster N (then remaining users by id order).
 *  - The same input always yields byte-identical output.
 *
 * Public data stays as-is: roster ids, player ids, NFL team codes, stats and scoring settings.
 * Player name fields (`full_name`, `first_name`, ...) are public and are never rewritten, even if a
 * manager happens to be named like a player. The leak check ignores the same keys.
 */

export const SANITIZER_VERSION = 1;

/** Leaf keys that carry public NFL player or team names. Never rewritten; ignored by the leak check. */
export const PLAYER_NAME_KEYS: ReadonlySet<string> = new Set([
  "full_name",
  "search_full_name",
  "first_name",
  "last_name",
  "search_first_name",
  "search_last_name",
]);

/** Keys removed everywhere, even when null. */
export const DROPPED_KEYS: ReadonlySet<string> = new Set([
  "email",
  "phone",
  "token",
  "cookies",
  "real_name",
  "summoner_name",
  "summoner_region",
  "verification",
]);

/** Chat free text: nulled out wherever it appears. */
const NULLED_KEYS: ReadonlySet<string> = new Set([
  "last_message_text_map",
  "last_message_attachment",
]);

/** Allowlist for the `GET /user/{username}` object. */
const USER_KEEP_KEYS = ["avatar", "display_name", "is_bot", "user_id", "username"] as const;

const ID_RUN = /\d{16,}/g;
const MIN_SUBSTRING_NAME = 4;
const MIN_AVATAR_TOKEN = 16;

/** Synthetic second league added to the user's league list so the league picker can be tested. */
export const SYNTHETIC_LEAGUE_ID = "1000000000000000999";
export const SYNTHETIC_DRAFT_ID = "1000000000000001999";
export const SYNTHETIC_LEAGUE_NAME = "Example League 2";

export interface RawLeagueData {
  /** `GET /user/{username}` */
  user: unknown;
  /** `GET /user/{user_id}/leagues/nfl/{season}` */
  userLeagues: unknown;
  /** `GET /league/{id}` */
  league: unknown;
  /** `GET /league/{id}/users` */
  users: unknown;
  /** `GET /league/{id}/rosters` */
  rosters: unknown;
  /** `GET /league/{id}/drafts` */
  drafts: unknown;
  /** One `GET /draft/{id}/picks` response per draft. */
  draftPicks: readonly unknown[];
  /** One `GET /league/{id}/transactions/{week}` response per week. */
  transactions: readonly unknown[];
  /** Any other league documents (matchups, brackets, traded picks): scanned for id runs only. */
  extra: readonly unknown[];
}

export interface IdentifierSet {
  /** Digit ids of 16 or more digits: user, league, draft, transaction and message ids. */
  ids: string[];
  /** Usernames, display names, team names, league names, free-text draft descriptions. */
  names: string[];
  /** Avatar ids and avatar URLs (and the id inside a URL). */
  avatars: string[];
}

export interface Mapping {
  readonly ids: ReadonlyMap<string, string>;
  /** Real user id to 1-based manager slot. */
  readonly userSlots: ReadonlyMap<string, number>;
  /** Lowercase real name to fake. */
  readonly exactNames: ReadonlyMap<string, string>;
  readonly nameRegex: RegExp | null;
  readonly avatars: ReadonlyMap<string, string>;
  readonly avatarRegex: RegExp | null;
  readonly primaryLeagueId: string;
}

/* ------------------------------------------------------------------ helpers */

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? (v as unknown[]) : [];
}

function asRecords(v: unknown): Record<string, unknown>[] {
  return asArray(v).filter(isRecord);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number {
  return typeof v === "number" ? v : Number.MAX_SAFE_INTEGER;
}

/** Numeric-string compare that works for ids beyond 2^53. */
export function compareIds(a: string, b: string): number {
  if (a.length !== b.length) return a.length - b.length;
  return a < b ? -1 : a > b ? 1 : 0;
}

class OrderedSet {
  private readonly seen = new Set<string>();
  readonly items: string[] = [];
  add(v: string | null): void {
    if (v === null || this.seen.has(v)) return;
    this.seen.add(v);
    this.items.push(v);
  }
  addSorted(values: Iterable<string | null>): void {
    const fresh = new Set<string>();
    for (const v of values) if (v !== null && !this.seen.has(v)) fresh.add(v);
    for (const v of [...fresh].sort(compareIds)) this.add(v);
  }
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function allDocs(raw: RawLeagueData): unknown[] {
  return [
    raw.user,
    raw.userLeagues,
    raw.league,
    raw.users,
    raw.rosters,
    raw.drafts,
    ...raw.draftPicks,
    ...raw.transactions,
    ...raw.extra,
  ];
}

/* ------------------------------------------------------------- fact gathering */

interface NameFacts {
  /** Real user id (or null) with the display name seen for it. */
  displayNames: { userId: string | null; name: string }[];
  usernames: { userId: string | null; name: string }[];
  teams: { userId: string; name: string }[];
  /** Primary league name first, then other leagues. */
  leagueNames: string[];
  draftNames: string[];
  draftDescriptions: string[];
}

function gatherNameFacts(raw: RawLeagueData, primaryLeagueId: string): NameFacts {
  const facts: NameFacts = {
    displayNames: [],
    usernames: [],
    teams: [],
    leagueNames: [],
    draftNames: [],
    draftDescriptions: [],
  };
  const user = isRecord(raw.user) ? raw.user : null;
  if (user) {
    const dn = str(user.display_name);
    const un = str(user.username);
    if (dn) facts.displayNames.push({ userId: str(user.user_id), name: dn });
    if (un) facts.usernames.push({ userId: str(user.user_id), name: un });
  }
  for (const u of asRecords(raw.users)) {
    const id = str(u.user_id);
    const dn = str(u.display_name);
    if (dn) facts.displayNames.push({ userId: id, name: dn });
    const meta = isRecord(u.metadata) ? u.metadata : null;
    const tn = meta ? str(meta.team_name) : null;
    if (tn && id) facts.teams.push({ userId: id, name: tn });
  }
  const leagues = [raw.league, ...asArray(raw.userLeagues)].filter(isRecord);
  const primary = leagues.filter((l) => l.league_id === primaryLeagueId);
  const others = leagues
    .filter((l) => l.league_id !== primaryLeagueId)
    .sort((a, b) => compareIds(str(a.league_id) ?? "", str(b.league_id) ?? ""));
  for (const l of [...primary, ...others]) {
    const name = str(l.name);
    if (name) facts.leagueNames.push(name);
    const author = str(l.last_author_display_name);
    if (author) facts.displayNames.push({ userId: str(l.last_author_id), name: author });
  }
  for (const d of asRecords(raw.drafts)) {
    const meta = isRecord(d.metadata) ? d.metadata : null;
    if (!meta) continue;
    const name = str(meta.name);
    const description = str(meta.description);
    if (name) facts.draftNames.push(name);
    if (description) facts.draftDescriptions.push(description);
  }
  return facts;
}

function avatarUrlToken(url: string): string | null {
  const last = url.split("?")[0]?.split("/").pop() ?? "";
  return last.length >= MIN_AVATAR_TOKEN ? last : null;
}

interface AvatarFacts {
  /** Plain avatar ids, in canonical order (slot order for users). */
  ids: string[];
  /** Full `metadata.avatar` URLs. */
  urls: string[];
}

function gatherAvatarFacts(raw: RawLeagueData, slots: ReadonlyMap<string, number>): AvatarFacts {
  const ids = new OrderedSet();
  const urls = new OrderedSet();
  const addAvatar = (v: unknown): void => {
    const s = str(v);
    if (!s) return;
    if (/^https?:\/\//i.test(s)) urls.add(s);
    else ids.add(s);
  };
  const users = asRecords(raw.users).sort(
    (a, b) =>
      (slots.get(str(a.user_id) ?? "") ?? Number.MAX_SAFE_INTEGER) -
      (slots.get(str(b.user_id) ?? "") ?? Number.MAX_SAFE_INTEGER),
  );
  for (const u of users) {
    addAvatar(u.avatar);
    if (isRecord(u.metadata)) addAvatar(u.metadata.avatar);
  }
  if (isRecord(raw.user)) addAvatar(raw.user.avatar);
  for (const l of [raw.league, ...asArray(raw.userLeagues)].filter(isRecord)) {
    addAvatar(l.avatar);
    addAvatar(l.last_author_avatar);
  }
  return { ids: ids.items, urls: urls.items };
}

/** Canonical user id order: roster owners by roster_id, then co-owners, the account, league users, others. */
function orderedUserIds(raw: RawLeagueData): string[] {
  const out = new OrderedSet();
  const rosters = asRecords(raw.rosters).sort((a, b) => num(a.roster_id) - num(b.roster_id));
  for (const r of rosters) out.add(str(r.owner_id));
  for (const r of rosters) for (const c of asArray(r.co_owners)) out.add(str(c));
  if (isRecord(raw.user)) out.add(str(raw.user.user_id));
  out.addSorted(asRecords(raw.users).map((u) => str(u.user_id)));
  const rest: (string | null)[] = [];
  for (const week of raw.transactions) for (const t of asRecords(week)) rest.push(str(t.creator));
  for (const d of asRecords(raw.drafts)) {
    for (const c of asArray(d.creators)) rest.push(str(c));
    if (isRecord(d.draft_order)) for (const k of Object.keys(d.draft_order)) rest.push(k);
  }
  for (const picks of raw.draftPicks) for (const p of asRecords(picks)) rest.push(str(p.picked_by));
  for (const l of [raw.league, ...asArray(raw.userLeagues)].filter(isRecord)) {
    rest.push(str(l.last_author_id));
  }
  out.addSorted(rest);
  return out.items;
}

function orderedLeagueIds(raw: RawLeagueData, primaryLeagueId: string): string[] {
  const out = new OrderedSet();
  out.add(primaryLeagueId);
  const rest: (string | null)[] = [];
  for (const l of [raw.league, ...asArray(raw.userLeagues)].filter(isRecord)) {
    rest.push(str(l.league_id), str(l.previous_league_id));
  }
  for (const d of asRecords(raw.drafts)) rest.push(str(d.league_id));
  for (const u of asRecords(raw.users)) rest.push(str(u.league_id));
  for (const r of asRecords(raw.rosters)) rest.push(str(r.league_id));
  out.addSorted(rest);
  return out.items;
}

function orderedDraftIds(raw: RawLeagueData): string[] {
  const out = new OrderedSet();
  const rest: (string | null)[] = [];
  for (const l of [raw.league, ...asArray(raw.userLeagues)].filter(isRecord))
    rest.push(str(l.draft_id));
  for (const d of asRecords(raw.drafts)) rest.push(str(d.draft_id));
  for (const picks of raw.draftPicks) for (const p of asRecords(picks)) rest.push(str(p.draft_id));
  out.addSorted(rest);
  return out.items;
}

function orderedTransactionIds(raw: RawLeagueData): string[] {
  const out = new OrderedSet();
  const rest: (string | null)[] = [];
  for (const week of raw.transactions)
    for (const t of asRecords(week)) rest.push(str(t.transaction_id));
  for (const l of asRecords(raw.userLeagues)) rest.push(str(l.last_transaction_id));
  out.addSorted(rest);
  return out.items;
}

function scanIdRuns(docs: readonly unknown[]): string[] {
  const found = new Set<string>();
  for (const doc of docs) {
    const text = JSON.stringify(doc) ?? "";
    for (const m of text.matchAll(ID_RUN)) found.add(m[0]);
  }
  return [...found].sort(compareIds);
}

/* ------------------------------------------------------------------ public API */

/**
 * Every original identifier found in the raw data. Used by `--check` to verify that none survive in
 * the fixtures. `extraIds` and `extraNames` let the caller add values from `.env`.
 */
export function collectIdentifiers(
  raw: RawLeagueData,
  primaryLeagueId: string,
  extra: { ids?: readonly string[]; names?: readonly string[] } = {},
): IdentifierSet {
  const facts = gatherNameFacts(raw, primaryLeagueId);
  const slots = new Map(orderedUserIds(raw).map((id, i) => [id, i + 1]));
  const avatars = gatherAvatarFacts(raw, slots);

  const ids = new OrderedSet();
  for (const v of extra.ids ?? []) ids.add(v);
  ids.addSorted(scanIdRuns(allDocs(raw)));

  const names: string[] = [];
  const seen = new Set<string>();
  const addName = (n: string | undefined): void => {
    if (n === undefined || n.length === 0) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    names.push(n);
  };
  for (const n of extra.names ?? []) addName(n);
  for (const f of facts.displayNames) addName(f.name);
  for (const f of facts.usernames) addName(f.name);
  for (const f of facts.teams) addName(f.name);
  for (const n of facts.leagueNames) addName(n);
  for (const n of facts.draftNames) addName(n);
  for (const n of facts.draftDescriptions) addName(n);

  const avatarList = new OrderedSet();
  for (const a of avatars.ids) avatarList.add(a);
  for (const u of avatars.urls) {
    avatarList.add(u);
    avatarList.add(avatarUrlToken(u));
  }
  return { ids: ids.items, names, avatars: avatarList.items };
}

/** Builds the real-to-fake mapping. Pure and deterministic. */
export function buildMapping(raw: RawLeagueData, primaryLeagueId: string): Mapping {
  const ids = new Map<string, string>();
  const assign = (list: readonly string[], base: bigint): void => {
    list.forEach((real, i) => {
      if (!ids.has(real)) ids.set(real, String(base + BigInt(i + 1)));
    });
  };
  const userIds = orderedUserIds(raw);
  const userSlots = new Map(userIds.map((id, i) => [id, i + 1]));
  assign(userIds, 100000000000000000n);
  assign(orderedLeagueIds(raw, primaryLeagueId), 1000000000000000000n);
  assign(orderedDraftIds(raw), 1000000000000001000n);
  assign(orderedTransactionIds(raw), 1000000000000100000n);
  const misc = scanIdRuns(allDocs(raw)).filter((id) => !ids.has(id));
  assign(misc, 1000000000000200000n);

  // Names. Display names and usernames first (they win conflicts), then teams, then leagues.
  const facts = gatherNameFacts(raw, primaryLeagueId);
  const exact = new Map<string, string>();
  let nextSlot = userIds.length + 1;
  const slotFor = (userId: string | null): number => {
    if (userId !== null) {
      const s = userSlots.get(userId);
      if (s !== undefined) return s;
    }
    return nextSlot++;
  };
  const setName = (real: string, fake: string): void => {
    const k = real.toLowerCase();
    if (!exact.has(k)) exact.set(k, fake);
  };
  const managerFake = (slot: number): string => `manager_${pad(slot, 2)}`;
  for (const f of [...facts.displayNames, ...facts.usernames]) {
    const known = exact.get(f.name.toLowerCase());
    if (known !== undefined) continue;
    setName(f.name, managerFake(slotFor(f.userId)));
  }
  for (const t of facts.teams) setName(t.name, `Team ${pad(slotFor(t.userId), 2)}`);
  const leagueNames = [...new Map(facts.leagueNames.map((n) => [n.toLowerCase(), n])).values()];
  leagueNames.forEach((n, i) => setName(n, i === 0 ? "Example League" : `Example League ${i + 1}`));
  facts.draftNames.forEach((n) => setName(n, "Example League"));
  facts.draftDescriptions.forEach((n) => setName(n, "Example draft description"));

  const longNames = [...exact.keys()]
    .filter((n) => n.length >= MIN_SUBSTRING_NAME)
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const nameRegex =
    longNames.length > 0 ? new RegExp(longNames.map(escapeRegex).join("|"), "gi") : null;

  // Avatars.
  const avatarFacts = gatherAvatarFacts(raw, userSlots);
  const avatars = new Map<string, string>();
  avatarFacts.ids.forEach((real, i) => avatars.set(real, `a${pad(i + 1, 31)}`));
  avatarFacts.urls.forEach((real, i) => {
    avatars.set(real, `https://example.com/avatars/team_${pad(i + 1, 2)}.png`);
    const token = avatarUrlToken(real);
    if (token !== null && !avatars.has(token)) avatars.set(token, `b${pad(i + 1, 31)}`);
  });
  const tokens = [...avatars.keys()]
    .filter((k) => k.length >= MIN_AVATAR_TOKEN && !/^https?:\/\//i.test(k))
    .sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const avatarRegex = tokens.length > 0 ? new RegExp(tokens.map(escapeRegex).join("|"), "g") : null;

  return {
    ids,
    userSlots,
    exactNames: exact,
    nameRegex,
    avatars,
    avatarRegex,
    primaryLeagueId,
  };
}

function sanitizeString(s: string, m: Mapping, key: string | null): string {
  const id = m.ids.get(s);
  if (id !== undefined) return id;
  const av = m.avatars.get(s);
  if (av !== undefined) return av;
  const nameExempt = key !== null && PLAYER_NAME_KEYS.has(key);
  if (nameExempt) return s;
  const exactName = m.exactNames.get(s.toLowerCase());
  if (exactName !== undefined) return exactName;
  let out = s;
  if (out.length >= 16) out = out.replace(ID_RUN, (x) => m.ids.get(x) ?? x);
  if (m.avatarRegex !== null && out.length >= MIN_AVATAR_TOKEN) {
    out = out.replace(m.avatarRegex, (x) => m.avatars.get(x) ?? x);
  }
  if (m.nameRegex !== null && out.length >= MIN_SUBSTRING_NAME) {
    out = out.replace(m.nameRegex, (x) => m.exactNames.get(x.toLowerCase()) ?? x);
  }
  return out;
}

function sanitizeKey(k: string, m: Mapping): string {
  return m.ids.get(k) ?? m.avatars.get(k) ?? k;
}

function walk(value: unknown, m: Mapping, key: string | null): unknown {
  if (typeof value === "string") return sanitizeString(value, m, key);
  if (Array.isArray(value)) return (value as unknown[]).map((v) => walk(v, m, key));
  if (isRecord(value)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) {
      if (DROPPED_KEYS.has(k)) continue;
      out[sanitizeKey(k, m)] = NULLED_KEYS.has(k) ? null : walk(v, m, k);
    }
    return out;
  }
  return value;
}

/** Generic deep rewrite of any league-related document (keys and values). */
export function sanitizeDoc(doc: unknown, m: Mapping): unknown {
  return walk(doc, m, null);
}

function managerName(m: Mapping, userId: string | null): string | null {
  if (userId === null) return null;
  const slot = m.userSlots.get(userId);
  return slot === undefined ? null : `manager_${pad(slot, 2)}`;
}

/** `GET /user/{username}`: allowlist keys only (drops email, phone, token and the rest). */
export function sanitizeUser(doc: unknown, m: Mapping): unknown {
  if (!isRecord(doc)) return doc;
  const kept: Record<string, unknown> = {};
  for (const k of USER_KEEP_KEYS) if (k in doc) kept[k] = doc[k];
  const fake = managerName(m, str(doc.user_id));
  if (fake !== null) {
    if (typeof kept.display_name === "string") kept.display_name = fake;
    if (typeof kept.username === "string") kept.username = fake;
  }
  return walk(kept, m, null);
}

/** `GET /league/{id}/users`: structured team and display names, then the generic rewrite. */
export function sanitizeUsers(doc: unknown, m: Mapping): unknown {
  if (!Array.isArray(doc)) return walk(doc, m, null);
  const prepared = (doc as unknown[]).map((u) => {
    if (!isRecord(u)) return u;
    const out: Record<string, unknown> = { ...u };
    const id = str(u.user_id);
    const slot = id === null ? undefined : m.userSlots.get(id);
    if (slot !== undefined) {
      if (typeof u.display_name === "string") out.display_name = `manager_${pad(slot, 2)}`;
      if (isRecord(u.metadata)) {
        const meta: Record<string, unknown> = { ...u.metadata };
        if (typeof meta.team_name === "string") meta.team_name = `Team ${pad(slot, 2)}`;
        out.metadata = meta;
      }
    }
    return out;
  });
  return walk(prepared, m, null);
}

/** `GET /league/{id}/drafts`: generic rewrite, then free-text metadata. */
export function sanitizeDrafts(doc: unknown, m: Mapping): unknown {
  const out = walk(doc, m, null);
  if (!Array.isArray(out)) return out;
  return (out as unknown[]).map((d) => {
    if (!isRecord(d) || !isRecord(d.metadata)) return d;
    const meta: Record<string, unknown> = { ...d.metadata };
    if (typeof meta.description === "string" && meta.description.length > 0) {
      meta.description = "Example draft description";
    }
    return { ...d, metadata: meta };
  });
}

/**
 * `GET /user/{id}/leagues/nfl/{season}`: keep only the primary league (sanitized) plus one synthetic
 * second league so the league picker can be tested. Real names of other leagues never survive.
 */
export function sanitizeUserLeagues(doc: unknown, m: Mapping): unknown[] {
  const primary = asRecords(doc).find((l) => l.league_id === m.primaryLeagueId);
  if (primary === undefined) return [];
  const first = walk(primary, m, null) as Record<string, unknown>;
  const second: Record<string, unknown> = {
    ...first,
    league_id: SYNTHETIC_LEAGUE_ID,
    draft_id: SYNTHETIC_DRAFT_ID,
    name: SYNTHETIC_LEAGUE_NAME,
    display_order: typeof first.display_order === "number" ? first.display_order + 1 : 1,
  };
  return [first, second];
}

/** The fake league id for the primary league. */
export function fakeLeagueId(m: Mapping): string {
  return m.ids.get(m.primaryLeagueId) ?? m.primaryLeagueId;
}

/** The fake manager name (also the fake username) for a real user id. */
export function fakeManagerName(m: Mapping, realUserId: string): string | null {
  return managerName(m, realUserId);
}

/** The fake id for any real id seen in the raw data. */
export function fakeId(m: Mapping, realId: string): string | null {
  return m.ids.get(realId) ?? null;
}
