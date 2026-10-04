import { describe, expect, it } from "vitest";
import { computeManagerTendencies, type ManagerTransactionInput } from "./manager-tendencies.js";

const ROSTER_ID = 1;

function waiverClaim(
  status: string,
  winnerRosterId: number,
  waiverBid: number | null,
): ManagerTransactionInput {
  return {
    type: "waiver",
    status,
    adds: { somePlayerId: winnerRosterId },
    rosterIds: [winnerRosterId],
    waiverBid,
  };
}

function trade(status: string, rosterIds: readonly number[]): ManagerTransactionInput {
  return { type: "trade", status, adds: null, rosterIds, waiverBid: null };
}

describe("computeManagerTendencies (LEAGUE-6)", () => {
  it("zero transactions: every count is 0, no FAAB fields when not FAAB", () => {
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions: [],
      isFaab: false,
      faabBudgetTotal: null,
      faabBudgetUsed: null,
    });
    expect(result.transactionCount).toBe(0);
    expect(result.waiverClaimsWon).toBe(0);
    expect(result.tradeCount).toBe(0);
    expect(result.faabSpent).toBeNull();
    expect(result.faabRemaining).toBeNull();
    expect(result.faabAverageWinningBid).toBeNull();
    expect(result.faabMaxWinningBid).toBeNull();
  });

  it("a pending or failed transaction is excluded from every count", () => {
    const transactions: ManagerTransactionInput[] = [
      waiverClaim("pending", ROSTER_ID, 10),
      waiverClaim("failed", ROSTER_ID, 20),
      trade("pending", [ROSTER_ID, 2]),
      trade("failed", [ROSTER_ID, 2]),
    ];
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions,
      isFaab: true,
      faabBudgetTotal: 100,
      faabBudgetUsed: 0,
    });
    expect(result.transactionCount).toBe(0);
    expect(result.waiverClaimsWon).toBe(0);
    expect(result.tradeCount).toBe(0);
    expect(result.faabSpent).toBe(0);
  });

  it("counts complete waiver claims won (this team is the adder) and complete trades involving this team", () => {
    const transactions: ManagerTransactionInput[] = [
      waiverClaim("complete", ROSTER_ID, 15), // won
      waiverClaim("complete", 2, 25), // someone else's claim, not counted
      trade("complete", [ROSTER_ID, 3]), // involves this team
      trade("complete", [2, 3]), // does not involve this team
    ];
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions,
      isFaab: false,
      faabBudgetTotal: null,
      faabBudgetUsed: null,
    });
    expect(result.waiverClaimsWon).toBe(1);
    expect(result.tradeCount).toBe(1);
    // transactionCount = complete transactions where this team's roster id appears in rosterIds:
    // the won waiver claim (rosterIds [1]) + the trade involving team 1 = 2.
    expect(result.transactionCount).toBe(2);
  });

  it("non-FAAB league returns null for every FAAB field even when transactions carry waiverBid values", () => {
    const transactions: ManagerTransactionInput[] = [waiverClaim("complete", ROSTER_ID, 42)];
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions,
      isFaab: false,
      faabBudgetTotal: 100,
      faabBudgetUsed: 10,
    });
    expect(result.waiverClaimsWon).toBe(1);
    expect(result.faabSpent).toBeNull();
    expect(result.faabRemaining).toBeNull();
    expect(result.faabAverageWinningBid).toBeNull();
    expect(result.faabMaxWinningBid).toBeNull();
  });

  it("FAAB league: spent, remaining, average and max winning bid computed from winning claims", () => {
    const transactions: ManagerTransactionInput[] = [
      waiverClaim("complete", ROSTER_ID, 10),
      waiverClaim("complete", ROSTER_ID, 30),
      waiverClaim("complete", 2, 999), // someone else's claim, excluded
      waiverClaim("failed", ROSTER_ID, 500), // failed, excluded
    ];
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions,
      isFaab: true,
      faabBudgetTotal: 100,
      faabBudgetUsed: 40,
    });
    expect(result.faabSpent).toBe(40); // 10 + 30
    expect(result.faabRemaining).toBe(60); // 100 - 40
    expect(result.faabAverageWinningBid).toBe(20); // 40 / 2
    expect(result.faabMaxWinningBid).toBe(30);
    expect(result.reasons).toEqual([]);
  });

  it("FAAB league with no winning claims yet: spent/avg/max are 0, NO_WINNING_CLAIMS reason", () => {
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions: [],
      isFaab: true,
      faabBudgetTotal: 100,
      faabBudgetUsed: 0,
    });
    expect(result.faabSpent).toBe(0);
    expect(result.faabAverageWinningBid).toBe(0);
    expect(result.faabMaxWinningBid).toBe(0);
    expect(result.faabRemaining).toBe(100);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LEAGUE_MANAGER_NO_WINNING_CLAIMS" }),
      ]),
    );
  });

  it("FAAB league with budget totals unavailable: faabRemaining is null with a reason", () => {
    const result = computeManagerTendencies({
      rosterId: ROSTER_ID,
      transactions: [waiverClaim("complete", ROSTER_ID, 10)],
      isFaab: true,
      faabBudgetTotal: null,
      faabBudgetUsed: null,
    });
    expect(result.faabRemaining).toBeNull();
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "LEAGUE_MANAGER_FAAB_BUDGET_UNAVAILABLE" }),
      ]),
    );
  });
});
