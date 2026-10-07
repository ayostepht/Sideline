import { loadConfig } from "@sideline/shared";
import { DbError } from "../../../../components/db-error";
import { getDb } from "../../../../lib/server/db";
import { gameNow } from "../../../../lib/server/game-clock";
import { getLeagueChoices, getSettings } from "../../../../lib/server/identity";
import { getLeagueOverview } from "../../../../lib/server/league-views";
import { SettingsSections } from "./_components/settings-sections";
import { APP_VERSION } from "./_components/version";

export const dynamic = "force-dynamic";

export default async function SettingsPage({ params }: { params: Promise<{ leagueId: string }> }) {
  const { leagueId } = await params;
  let data;
  try {
    const db = getDb();
    if (!db.ok) return <DbError retryHref={`/l/${encodeURIComponent(leagueId)}/settings`} />;
    const overview = getLeagueOverview(db.handle, leagueId, gameNow());
    data = {
      settings: getSettings(db.handle),
      leagues: getLeagueChoices(db.handle),
      leagueName: overview.ok ? overview.data.name : leagueId,
    };
  } catch {
    return <DbError retryHref={`/l/${encodeURIComponent(leagueId)}/settings`} />;
  }
  return (
    <div className="flex flex-col gap-3" data-testid="settings-page">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <SettingsSections
        leagueId={leagueId}
        leagueName={data.leagueName}
        username={data.settings.sleeperUsername}
        leagues={data.leagues}
        version={APP_VERSION}
        loginEnabled={loadConfig(process.env).appPassword !== null}
      />
    </div>
  );
}
