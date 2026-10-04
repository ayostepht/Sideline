/**
 * LEAGUE-6 (PLAN 5.8): manager tendencies -- transaction count, waiver claims won, trade count;
 * FAAB spent and remaining plus average and max winning bid, only in FAAB leagues.
 *
 * `ManagerTransactionInput` narrows `@sideline/shared`'s `Transaction` down to just the fields
 * this module needs, rather than importing the full type: `status`, `type`, `rosterIds` (which
 * `Transaction`'s own doc comment says "lists involved rosters" -- the generic test for "this
 * team was part of this transaction" for any transaction type), `adds` (player id -> roster id,
 * used to tell which side of a transaction added a player, i.e. who "won" a waiver claim), and
 * `waiverBid` (FAAB amount, null unless FAAB).
 *
 * Counting rules (all exclude anything other than `status === "complete"`: a "failed" or
 * "pending" transaction never happened):
 *
 * - `transactionCount`: every complete transaction where this team's roster id appears in
 *   `rosterIds`.
 * - `tradeCount`: the subset of the above with `type === "trade"`.
 * - `waiverClaimsWon`: complete transactions with `type === "waiver"` where this team's roster id
 *   appears as a *value* in `adds` (i.e. this team is the one that added the claimed player, not
 *   merely a bystander roster id some other field might reference).
 *
 * FAAB fields (only computed when `isFaab`; otherwise every FAAB field is `null`, never `0` or
 * omitted, even if the input transactions happen to carry `waiverBid` values -- a non-FAAB league
 * simply has no meaningful FAAB numbers to report):
 *
 * - `faabSpent`: sum of `waiverBid` across this team's winning waiver claims (as defined above).
 * - `faabRemaining`: `faabBudgetTotal - faabBudgetUsed`, both taken as plain caller-supplied
 *   inputs (e.g. a league setting and `Roster.waiverBudgetUsed` respectively) rather than derived
 *   from the transaction list here, per the brief. `null` when either input is `null` (budget
 *   totals unavailable), flagged with reason `LEAGUE_MANAGER_FAAB_BUDGET_UNAVAILABLE`.
 * - `faabAverageWinningBid` / `faabMaxWinningBid`: average and max of the winning claims'
 *   `waiverBid` values; `0` when there are no winning claims yet (a team with zero FAAB activity
 *   has spent exactly nothing, which is a meaningful, non-null number, unlike the "league isn't
 *   FAAB at all" case above).
 */
import type { Reason } from "@sideline/shared";

export interface ManagerTransactionInput {
  type: string;
  status: string;
  /** Player id -> roster id; `null` when there were no adds (mirrors `Transaction.adds`). */
  adds: Readonly<Record<string, number>> | null;
  /** Every roster id involved in this transaction (mirrors `Transaction.rosterIds`). */
  rosterIds: readonly number[];
  /** FAAB bid amount; `null` unless this is a FAAB waiver claim (mirrors `Transaction.waiverBid`). */
  waiverBid: number | null;
}

export interface ManagerTendenciesInput {
  rosterId: number;
  transactions: readonly ManagerTransactionInput[];
  isFaab: boolean;
  /** Total FAAB budget for this team (e.g. a league setting); used only when `isFaab`. */
  faabBudgetTotal: number | null;
  /** FAAB budget already used this season (e.g. `Roster.waiverBudgetUsed`); used only when `isFaab`. */
  faabBudgetUsed: number | null;
}

export interface ManagerTendenciesResult {
  transactionCount: number;
  waiverClaimsWon: number;
  tradeCount: number;
  faabSpent: number | null;
  faabRemaining: number | null;
  faabAverageWinningBid: number | null;
  faabMaxWinningBid: number | null;
  reasons: Reason[];
}

function isComplete(t: ManagerTransactionInput): boolean {
  return t.status === "complete";
}

function isWinningWaiverClaim(t: ManagerTransactionInput, rosterId: number): boolean {
  return (
    isComplete(t) &&
    t.type === "waiver" &&
    t.adds !== null &&
    Object.values(t.adds).includes(rosterId)
  );
}

/** Manager tendencies for one team's season transactions (LEAGUE-6). */
export function computeManagerTendencies(input: ManagerTendenciesInput): ManagerTendenciesResult {
  const { rosterId, transactions, isFaab, faabBudgetTotal, faabBudgetUsed } = input;

  const completeForTeam = transactions.filter(
    (t) => isComplete(t) && t.rosterIds.includes(rosterId),
  );
  const transactionCount = completeForTeam.length;
  const tradeCount = completeForTeam.filter((t) => t.type === "trade").length;

  const winningClaims = transactions.filter((t) => isWinningWaiverClaim(t, rosterId));
  const waiverClaimsWon = winningClaims.length;

  let faabSpent: number | null = null;
  let faabRemaining: number | null = null;
  let faabAverageWinningBid: number | null = null;
  let faabMaxWinningBid: number | null = null;
  const reasons: Reason[] = [];

  if (isFaab) {
    const bids = winningClaims.map((t) => t.waiverBid).filter((bid): bid is number => bid !== null);

    faabSpent = bids.reduce((sum, bid) => sum + bid, 0);
    faabAverageWinningBid = bids.length > 0 ? faabSpent / bids.length : 0;
    faabMaxWinningBid = bids.length > 0 ? Math.max(...bids) : 0;

    if (faabBudgetTotal !== null && faabBudgetUsed !== null) {
      faabRemaining = faabBudgetTotal - faabBudgetUsed;
    } else {
      reasons.push({
        code: "LEAGUE_MANAGER_FAAB_BUDGET_UNAVAILABLE",
        label: "FAAB budget totals unavailable, so remaining budget could not be computed",
      });
    }

    if (bids.length === 0) {
      reasons.push({
        code: "LEAGUE_MANAGER_NO_WINNING_CLAIMS",
        label: "No winning waiver claims with a FAAB bid yet",
        value: 0,
      });
    }
  }

  return {
    transactionCount,
    waiverClaimsWon,
    tradeCount,
    faabSpent,
    faabRemaining,
    faabAverageWinningBid,
    faabMaxWinningBid,
    reasons,
  };
}
