import { describe, expect, it } from "vitest";
import { InMemoryEtagStore } from "./etag-store.js";

describe("InMemoryEtagStore", () => {
  it("stores and returns entries per url", async () => {
    const s = new InMemoryEtagStore();
    expect(await s.get("a")).toBeUndefined();
    await s.set("a", '"1"', { x: 1 });
    await s.set("a", '"2"', { x: 2 });
    expect(await s.get("a")).toEqual({ etag: '"2"', body: { x: 2 } });
    expect(await s.get("b")).toBeUndefined();
  });
});
