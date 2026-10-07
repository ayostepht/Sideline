import { describe, expect, it } from "vitest";
import { isModalMounted, shouldSkipFocusMove, trackModalMount } from "./focus-return";

describe("shouldSkipFocusMove", () => {
  it("skips while the pop-up opens", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: true,
        modalMountedNow: true,
        modalWasMounted: false,
      }),
    ).toBe(true);
  });
  it("skips while the pop-up closes", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: false,
        modalMountedNow: false,
        modalWasMounted: true,
      }),
    ).toBe(true);
  });
  it("moves focus when a full-page player view navigates elsewhere", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: false,
        modalMountedNow: false,
        modalWasMounted: false,
      }),
    ).toBe(false);
  });
  it("moves focus on a full-page player view opened without a pop-up", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: true,
        modalMountedNow: false,
        modalWasMounted: false,
      }),
    ).toBe(false);
  });
});

describe("trackModalMount", () => {
  it("counts mounts and never goes negative", () => {
    trackModalMount(true);
    trackModalMount(true);
    trackModalMount(false);
    expect(isModalMounted()).toBe(true);
    trackModalMount(false);
    trackModalMount(false);
    expect(isModalMounted()).toBe(false);
  });
});
