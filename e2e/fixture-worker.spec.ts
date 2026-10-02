import { expect, test } from "@playwright/test";
import { z } from "zod";
import { FIXTURE, onboardingBaseUrl } from "./helpers/servers";

/**
 * The onboarding server runs the fixture-mode worker (no network). State is shared across the run,
 * so these tests are serial and tolerate having been run by another project first.
 */
test.describe.configure({ mode: "serial" });

const Health = z.object({ worker: z.object({ status: z.string() }) });
const Status = z.object({
  phase: z.string(),
  leagues: z.array(z.object({ leagueId: z.string() })).optional(),
});

test("HOST-3: fixture worker heartbeat is ok on the onboarding server within 30 s", async ({
  request,
}) => {
  await expect
    .poll(
      async () => {
        const res = await request.get(`${onboardingBaseUrl}/api/health`);
        return Health.parse(await res.json()).worker.status;
      },
      { timeout: 30_000, message: "worker heartbeat never became ok" },
    )
    .toBe("ok");
});

test("ONBOARD-1: onboarding as the fixture user reaches ready with the fixture league", async ({
  request,
}) => {
  const start = await request.post(`${onboardingBaseUrl}/api/onboarding`, {
    data: { username: FIXTURE.username },
  });
  expect([200, 202]).toContain(start.status());
  await expect
    .poll(
      async () => {
        const res = await request.get(`${onboardingBaseUrl}/api/onboarding/status`);
        return Status.parse(await res.json()).phase;
      },
      { timeout: 30_000, message: "onboarding never reached ready" },
    )
    .toBe("ready");
  const status = Status.parse(
    await (await request.get(`${onboardingBaseUrl}/api/onboarding/status`)).json(),
  );
  expect(status.leagues?.map((l) => l.leagueId)).toContain(FIXTURE.leagueId);
});
