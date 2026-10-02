import { FIXTURE } from "./servers";

/** Base path of the seeded league. */
export const L = `/l/${FIXTURE.leagueId}`;

/** Facts about the recorded fixture league (tests/fixtures/README.md), seeded as the stored identity. */
export const DATA = {
  /** The fixture user's roster (manager_04) and a player on it. */
  myRosterId: 4,
  myTeamName: "Team 04",
  myPlayerId: "9221", // Jahmyr Gibbs, on roster 4
  /** A rostered player owned by someone else: Patrick Mahomes on roster 3 "Team 03". */
  otherPlayerQuery: "mahomes",
  otherPlayerName: "Patrick Mahomes",
  otherPlayerId: "4046",
  otherRosterId: 3,
  otherTeamName: "Team 03",
  /** A player on no roster in the fixture league. */
  freeAgentQuery: "jerry jeudy",
  freeAgentName: "Jerry Jeudy",
  teamCount: 10,
  unknownLeagueId: "9999999999999999999",
} as const;
