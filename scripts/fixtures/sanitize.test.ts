import { describe, expect, it } from "vitest";
import {
  buildMapping,
  collectIdentifiers,
  fakeId,
  fakeLeagueId,
  fakeManagerName,
  sanitizeDoc,
  sanitizeDrafts,
  sanitizeLeague,
  sanitizeRosters,
  sanitizeUser,
  sanitizeUserLeagues,
  sanitizeUsers,
  SYNTHETIC_LEAGUE_ID,
} from "./sanitize.js";
import { REAL, syntheticRaw } from "./test-data.js";

const raw = syntheticRaw();
const mapping = buildMapping(raw, REAL.leagueId);

function asRec(v: unknown): Record<string, unknown> {
  return v as Record<string, unknown>;
}

describe("buildMapping determinism", () => {
  it("yields identical mappings for the same input", () => {
    const a = buildMapping(syntheticRaw(), REAL.leagueId);
    const b = buildMapping(syntheticRaw(), REAL.leagueId);
    expect([...a.ids]).toEqual([...b.ids]);
    expect([...a.exactNames]).toEqual([...b.exactNames]);
    expect([...a.avatars]).toEqual([...b.avatars]);
  });

  it("produces byte-identical sanitized output", () => {
    const run = (): string =>
      JSON.stringify([
        sanitizeUser(raw.user, buildMapping(syntheticRaw(), REAL.leagueId)),
        sanitizeUsers(raw.users, buildMapping(syntheticRaw(), REAL.leagueId)),
        sanitizeDoc(raw.rosters, buildMapping(syntheticRaw(), REAL.leagueId)),
      ]);
    expect(run()).toBe(run());
  });

  it("is independent of the order users are listed in", () => {
    const shuffled = syntheticRaw();
    shuffled.users = [...(shuffled.users as unknown[])].reverse();
    shuffled.rosters = [...(shuffled.rosters as unknown[])].reverse();
    const other = buildMapping(shuffled, REAL.leagueId);
    expect([...other.userSlots].sort()).toEqual([...mapping.userSlots].sort());
  });

  it("numbers managers by roster id, not by id value or list order", () => {
    // roster 1 owner is userB, roster 2 is userA, roster 3 is userC
    expect(fakeManagerName(mapping, REAL.userB)).toBe("manager_01");
    expect(fakeManagerName(mapping, REAL.userA)).toBe("manager_02");
    expect(fakeManagerName(mapping, REAL.userC)).toBe("manager_03");
  });

  it("assigns fake ids that look like Sleeper ids and do not derive from the real value", () => {
    const fakes = [...mapping.ids.values()];
    for (const f of fakes) expect(f).toMatch(/^1000\d{14,15}$/);
    expect(new Set(fakes).size).toBe(fakes.length);
    expect(fakeLeagueId(mapping)).toBe("1000000000000000001");
    expect(fakeId(mapping, REAL.userB)).toBe("100000000000000001");
    for (const real of mapping.ids.keys()) {
      for (const f of fakes) expect(f.includes(real)).toBe(false);
    }
  });
});

describe("sanitizeUser", () => {
  const out = asRec(sanitizeUser(raw.user, mapping));

  it("keeps only the allowlisted keys and drops email, phone, token and the rest", () => {
    expect(Object.keys(out).sort()).toEqual([
      "avatar",
      "display_name",
      "is_bot",
      "user_id",
      "username",
    ]);
    expect(JSON.stringify(out)).not.toMatch(/email|phone|token|real_name/);
  });

  it("replaces username, display name, user id and avatar", () => {
    expect(out.username).toBe("manager_02");
    expect(out.display_name).toBe("manager_02");
    expect(out.user_id).toBe("100000000000000002");
    expect(out.avatar).toBe(`a${"0".repeat(30)}2`);
  });
});

describe("sanitizeUsers", () => {
  const out = sanitizeUsers(raw.users, mapping) as Record<string, unknown>[];
  const byId = (id: string): Record<string, unknown> => {
    const hit = out.find((u) => u.user_id === id);
    if (hit === undefined) throw new Error("user missing");
    return hit;
  };

  it("replaces user ids, display names, team names and league ids", () => {
    const b = byId("100000000000000001");
    expect(b.display_name).toBe("manager_01");
    expect(asRec(b.metadata).team_name).toBe("Team 01");
    expect(b.league_id).toBe("1000000000000000001");
  });

  it("keeps a missing team_name missing (no invented value)", () => {
    const c = byId("100000000000000003");
    expect("team_name" in asRec(c.metadata)).toBe(false);
    expect(c.display_name).toBe("manager_03");
  });

  it("replaces metadata.avatar URLs and avatar ids", () => {
    const a = byId("100000000000000002");
    expect(asRec(a.metadata).avatar).toBe("https://example.com/avatars/team_01.png");
    expect(a.avatar).toMatch(/^a0+\d$/);
    expect(JSON.stringify(out)).not.toContain(REAL.avatarA);
    expect(JSON.stringify(out)).not.toContain("0a1b2c3d4e5f6071");
  });

  it("leaves non-sensitive fields untouched", () => {
    const b = byId("100000000000000001");
    expect(asRec(b.metadata).allow_pn).toBeUndefined();
    expect(asRec(byId("100000000000000003").metadata).allow_pn).toBe("on");
  });
});

describe("sanitizeDoc on rosters, transactions, drafts", () => {
  it("rewrites owner_id and co_owners, keeps roster ids and player ids", () => {
    const out = sanitizeDoc(raw.rosters, mapping) as Record<string, unknown>[];
    const r1 = out.find((r) => r.roster_id === 1);
    expect(r1?.owner_id).toBe("100000000000000001");
    expect(r1?.co_owners).toEqual(["100000000000000003"]);
    expect(r1?.players).toEqual(["1002", "1003"]);
    expect(r1?.starters).toEqual(["1002", "0"]);
    expect(r1?.league_id).toBe("1000000000000000001");
    const r3 = out.find((r) => r.roster_id === 3);
    expect(r3?.players).toEqual(["1001", "ATL"]);
  });

  it("rewrites transaction creator and transaction_id, keeps adds, drops and roster ids", () => {
    const week1 = raw.transactions[0];
    const out = sanitizeDoc(week1, mapping) as Record<string, unknown>[];
    expect(out[0]?.creator).toBe("100000000000000002");
    expect(out[0]?.transaction_id).toMatch(/^10000000000001\d+$/);
    expect(out[0]?.adds).toEqual({ "1005": 2 });
    expect(out[0]?.drops).toEqual({ "1004": 2 });
    expect(out[0]?.roster_ids).toEqual([2]);
    expect(out[0]?.metadata).toEqual({ notes: "Your waiver claim was processed successfully!" });
    expect(out[1]?.metadata).toBeNull();
  });

  it("rewrites draft_order keys, creators, ids, name and description", () => {
    const out = sanitizeDrafts(raw.drafts, mapping) as Record<string, unknown>[];
    const d = out[0] ?? {};
    expect(d.draft_order).toEqual({
      "100000000000000001": 2,
      "100000000000000002": 1,
      "100000000000000003": 3,
    });
    expect(d.creators).toEqual(["100000000000000001"]);
    expect(d.draft_id).toBe("1000000000000001001");
    expect(asRec(d.metadata).name).toBe("Example League");
    expect(asRec(d.metadata).description).toBe("Example draft description");
    expect(asRec(d.metadata).scoring_type).toBe("ppr");
    expect(asRec(d.settings).rounds).toBe(15);
  });

  it("rewrites picked_by and keeps player data and public names untouched", () => {
    const out = sanitizeDoc(raw.draftPicks[0], mapping) as Record<string, unknown>[];
    expect(out[0]?.picked_by).toBe("100000000000000002");
    expect(out[0]?.player_id).toBe("1004");
    expect(asRec(out[0]?.metadata)).toEqual({ first_name: "Pat", last_name: "Player" });
  });

  it("nulls chat free text and rewrites last_author fields", () => {
    const leagues = sanitizeDoc(raw.userLeagues, mapping) as Record<string, unknown>[];
    const other = leagues[0] ?? {};
    expect(other.last_message_text_map).toBeNull();
    expect(other.last_author_display_name).toBe("manager_01");
    expect(other.name).toBe("Example League 2");
    expect(JSON.stringify(leagues)).not.toContain(REAL.leagueName);
  });

  it("does not touch stats, scoring settings or matchup numbers", () => {
    const matchup = [{ roster_id: 1, points: 12.3, players_points: { "1002": 12.3, ATL: 4 } }];
    expect(sanitizeDoc(matchup, mapping)).toEqual(matchup);
    expect(sanitizeDoc(raw.league, mapping)).toMatchObject({
      scoring_settings: { rec: 1, pass_yd: 0.04, rush_yd: 0.1 },
    });
  });

  it("never rewrites public player name fields, even if a manager is named like a player", () => {
    const players = {
      "1008": { full_name: "Gridiron Goblins", first_name: "Gridiron", team: "ATL" },
    };
    expect(sanitizeDoc(players, mapping)).toEqual(players);
    // The same string outside a player name key is rewritten.
    expect(sanitizeDoc({ note: "Gridiron Goblins" }, mapping)).toEqual({ note: "Team 02" });
  });

  it("replaces identifiers embedded in longer strings and in object keys", () => {
    const out = sanitizeDoc(
      { text: `${REAL.displayB} traded with id ${REAL.userA}`, [REAL.userC]: 1 },
      mapping,
    ) as Record<string, unknown>;
    expect(out.text).toBe("manager_01 traded with id 100000000000000002");
    expect(out["100000000000000003"]).toBe(1);
  });

  it("matches short names only as whole values", () => {
    expect(sanitizeDoc({ name: REAL.displayC, text: "Quick" }, mapping)).toEqual({
      name: "manager_03",
      text: "Quick",
    });
  });

  it("drops sensitive keys anywhere, even when null", () => {
    const out = sanitizeDoc(
      { nested: [{ email: null, phone: null, token: null, keep: 1 }] },
      mapping,
    );
    expect(out).toEqual({ nested: [{ keep: 1 }] });
  });
});

describe("sanitizeUserLeagues", () => {
  const out = sanitizeUserLeagues(raw.userLeagues, mapping) as Record<string, unknown>[];

  it("keeps the primary league plus one synthetic entry and nothing from other leagues", () => {
    expect(out).toHaveLength(2);
    expect(out[0]?.league_id).toBe("1000000000000000001");
    expect(out[0]?.name).toBe("Example League");
    expect(out[1]?.league_id).toBe(SYNTHETIC_LEAGUE_ID);
    expect(out[1]?.name).toBe("Example League 2");
    expect(JSON.stringify(out)).not.toContain(REAL.otherLeagueName);
    expect(JSON.stringify(out)).not.toContain(REAL.otherLeagueId);
  });
});

describe("collectIdentifiers", () => {
  const ids = collectIdentifiers(raw, REAL.leagueId, { names: [REAL.username] });

  it("finds ids, names and avatars from the raw data", () => {
    expect(ids.ids).toEqual(
      expect.arrayContaining([REAL.userA, REAL.userB, REAL.leagueId, REAL.txId]),
    );
    expect(ids.names).toEqual(
      expect.arrayContaining([REAL.displayA, REAL.teamB, REAL.leagueName, REAL.otherLeagueName]),
    );
    expect(ids.avatars).toEqual(
      expect.arrayContaining([REAL.avatarA, REAL.avatarUrlB, "0a1b2c3d4e5f60718293a4b5c6d7e8f9"]),
    );
  });

  it("de-duplicates names case-insensitively", () => {
    const lower = ids.names.map((n) => n.toLowerCase());
    expect(new Set(lower).size).toBe(lower.length);
  });
});

describe("metadata allowlists and display-text-only name replacement", () => {
  it("drops an unknown users[].metadata key that holds a name, keeps flags and rewritten team_name", () => {
    const r = syntheticRaw();
    const users = r.users as Record<string, unknown>[];
    users[1] = {
      ...users[1],
      metadata: {
        team_name: REAL.teamA,
        allow_pn: "on",
        allow_sms: "off",
        mention_pn: "on",
        bio: `Hi I am ${REAL.displayB}`,
        p_nick_4046: "Some Nickname",
      },
    };
    const m = buildMapping(r, REAL.leagueId);
    const out = asRec(
      (sanitizeUsers(r.users, m) as Record<string, unknown>[]).find(
        (u) => u.user_id === fakeId(m, REAL.userA),
      ),
    );
    expect(asRec(out.metadata)).toEqual({
      team_name: "Team 02",
      allow_pn: "on",
      allow_sms: "off",
      mention_pn: "on",
    });
    expect(JSON.stringify(out)).not.toContain(REAL.displayB);
  });

  it("limits league, roster and draft metadata to allowlisted keys", () => {
    const m = buildMapping(syntheticRaw(), REAL.leagueId);
    const league = asRec(
      sanitizeLeague({ metadata: { auto_continue: "on", motto: REAL.teamA }, name: "x" }, m),
    );
    expect(league.metadata).toEqual({ auto_continue: "on" });
    const rosters = sanitizeRosters(
      [{ roster_id: 1, metadata: { record: "WL", streak: "1W", p_nick_1: REAL.displayB } }],
      m,
    ) as Record<string, unknown>[];
    expect(rosters[0]?.metadata).toEqual({ record: "WL", streak: "1W" });
    const drafts = sanitizeDrafts(
      [{ metadata: { name: REAL.leagueName, scoring_type: "ppr", secret: REAL.teamB } }],
      m,
    ) as Record<string, unknown>[];
    expect(drafts[0]?.metadata).toEqual({ name: "Example League", scoring_type: "ppr" });
  });

  it("leaves null metadata alone", () => {
    const m = buildMapping(syntheticRaw(), REAL.leagueId);
    expect(asRec(sanitizeLeague({ metadata: null }, m)).metadata).toBeNull();
  });

  it("does not corrupt status or type fields when a manager is named like an enum value", () => {
    const r = syntheticRaw();
    const users = r.users as Record<string, unknown>[];
    users[0] = { ...users[0], display_name: "draft" };
    users[1] = { ...users[1], display_name: "complete" };
    users[2] = { ...users[2], display_name: "snake" };
    const m = buildMapping(r, REAL.leagueId);
    const doc = [
      {
        status: "complete",
        type: "snake",
        season_type: "draft",
        description: "complete",
        metadata: { notes: "the draft is complete" },
      },
    ];
    const out = asRec((sanitizeDoc(doc, m) as unknown[])[0]);
    expect(out.status).toBe("complete");
    expect(out.type).toBe("snake");
    expect(out.season_type).toBe("draft");
    // Display-text keys still get replaced.
    expect(String(out.description)).toMatch(/^manager_\d{2}$/);
    expect(asRec(out.metadata).notes).toMatch(/manager_\d{2}/);
    const d = asRec((sanitizeDrafts([{ status: "complete", type: "snake" }], m) as unknown[])[0]);
    expect(d).toEqual({ status: "complete", type: "snake" });
  });
});
