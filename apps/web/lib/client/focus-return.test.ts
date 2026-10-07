import { describe, expect, it } from "vitest";
import { isModalMounted, shouldSkipFocusMove, trackModalMount } from "./focus-return";

describe("shouldSkipFocusMove", () => {
  it("skips while the pop-up opens", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: true,
        modalMountedNow: true,
        modalWasMounted: false,
        nextIsUnderlyingPage: true,
      }),
    ).toBe(true);
  });
  it("skips while the pop-up closes", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: false,
        modalMountedNow: false,
        modalWasMounted: true,
        nextIsUnderlyingPage: true,
      }),
    ).toBe(true);
  });
  it("moves focus when a full-page player view navigates elsewhere", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: false,
        modalMountedNow: false,
        modalWasMounted: false,
        nextIsUnderlyingPage: true,
      }),
    ).toBe(false);
  });
  it("moves focus on a full-page player view opened without a pop-up", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: true,
        modalMountedNow: false,
        modalWasMounted: false,
        nextIsUnderlyingPage: true,
      }),
    ).toBe(false);
  });
});

describe("shouldSkipFocusMove (leaving and switching)", () => {
  it("skips player to player while the pop-up stays open", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: true,
        modalMountedNow: true,
        modalWasMounted: true,
        nextIsUnderlyingPage: false,
      }),
    ).toBe(true);
  });
  it("moves focus when leaving the open pop-up for a different page", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: false,
        modalMountedNow: false,
        modalWasMounted: true,
        nextIsUnderlyingPage: false,
      }),
    ).toBe(false);
  });
  it("moves focus when a full-page player view goes to another page", () => {
    expect(
      shouldSkipFocusMove({
        nextIsPlayerPath: false,
        modalMountedNow: false,
        modalWasMounted: false,
        nextIsUnderlyingPage: false,
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
