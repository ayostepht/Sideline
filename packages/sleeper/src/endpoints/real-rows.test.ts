import { describe, expect, it } from "vitest";
import { filterRows, isRealRow } from "./real-rows.js";

const row = (
  position: string | null,
  opponent: string | null,
  stats: Record<string, unknown>,
  id = "1",
) => ({ player_id: id, opponent, stats, player: { position } });

describe("ADR-002: projections drop placeholder rows", () => {
  it("keeps gp plus opponent rows; drops ADP-only placeholders and counts them", () => {
    const res = filterRows(
      "projections",
      [
        row("QB", "KC", { gp: 1, pass_yd: 200 }, "a"),
        row("RB", null, { adp_dd_ppr: 120 }, "b"),
        row("WR", "KC", { adp_dd_ppr: 90 }, "c"), // opponent but no gp: still a placeholder
        row("TE", null, { gp: 1 }, "d"), // gp but no opponent: placeholder
      ],
      false,
    );
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.rows.map((r) => r.player_id)).toEqual(["a"]);
    expect(res.dropped).toEqual({ placeholder: 3, position: 0, other: 0 });
  });

  it("ADR-005 item 12: a real row is never dropped for lacking points", () => {
    const res = filterRows("projections", [row("K", "NYJ", { gp: 1, fgm_30_39: 0.01 })], false);
    expect(res.status).toBe("ok");
    const zero = filterRows("projections", [row("DEF", "NYJ", { gp: 1 })], false);
    expect(zero.status).toBe("ok");
  });
});

describe("ADR-002: stats real-row rule differs from projections", () => {
  it("keeps rows with an opponent even without gp (active but did not play, DEF)", () => {
    const res = filterRows(
      "stats",
      [
        row("WR", "KC", { gms_active: 1 }, "a"),
        row("DEF", "KC", { sack: 2 }, "b"),
        row("WR", null, {}, "c"),
      ],
      false,
    );
    expect(res.status).toBe("ok");
    if (res.status === "ok") expect(res.rows).toHaveLength(2);
    expect(res.dropped.placeholder).toBe(1);
  });

  it("isRealRow differs by kind", () => {
    const r = { player_id: "1", opponent: "KC", stats: { gms_active: 1 } };
    expect(isRealRow("stats", r)).toBe(true);
    expect(isRealRow("projections", r)).toBe(false);
  });
});

describe("ADR-002: position leak and unavailable results", () => {
  it("drops leaked positions (FB, P, CB, DB) and rows with no position", () => {
    const res = filterRows(
      "projections",
      [
        row("FB", "KC", { gp: 1 }),
        row("P", "KC", { gp: 1 }),
        row("CB", null, { adp_dd_ppr: 1 }),
        row("DB", "KC", { gp: 1 }),
        row(null, "KC", { gp: 1 }),
        row("QB", "KC", { gp: 1 }),
      ],
      false,
    );
    expect(res.status).toBe("ok");
    expect(res.dropped).toEqual({ placeholder: 0, position: 5, other: 0 });
  });

  it("a placeholder-only payload is unavailable (never success on HTTP 200 alone)", () => {
    const res = filterRows(
      "projections",
      [row("QB", null, { adp_dd_ppr: 1 }), row("RB", null, { adp_dd_ppr: 2 })],
      true,
    );
    expect(res).toEqual({
      status: "unavailable",
      reason: "no_real_rows",
      dropped: { placeholder: 2, position: 0, other: 0 },
      notModified: true,
    });
  });

  it("an empty array is unavailable with reason empty", () => {
    expect(filterRows("stats", [], false)).toMatchObject({
      status: "unavailable",
      reason: "empty",
    });
  });

  it("counts malformed rows as other", () => {
    const res = filterRows("stats", [null, "x", { player_id: 1 }], false);
    expect(res).toMatchObject({ status: "unavailable", dropped: { other: 3 } });
  });
});
