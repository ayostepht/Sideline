import { describe, expect, it, vi } from "vitest";
import { createLazyLoader } from "./lazy-module";

describe("createLazyLoader", () => {
  it("caches a successful import", async () => {
    const importer = vi.fn(() => Promise.resolve({ a: 1 }));
    const l = createLazyLoader(importer);
    expect(l.peek()).toBeUndefined();
    await expect(l.load()).resolves.toEqual({ a: 1 });
    await l.load();
    expect(importer).toHaveBeenCalledTimes(1);
    expect(l.peek()).toEqual({ a: 1 });
  });

  it("resolves undefined (never rejects) when the import fails, then retries", async () => {
    const importer = vi
      .fn<() => Promise<{ a: number }>>()
      .mockRejectedValueOnce(new Error("chunk"))
      .mockResolvedValueOnce({ a: 2 });
    const l = createLazyLoader(importer);
    await expect(l.load()).resolves.toBeUndefined();
    expect(l.peek()).toBeUndefined();
    await expect(l.load()).resolves.toEqual({ a: 2 });
  });

  it("shares one in-flight import", async () => {
    const importer = vi.fn(() => Promise.resolve(1));
    const l = createLazyLoader(importer);
    await Promise.all([l.load(), l.load()]);
    expect(importer).toHaveBeenCalledTimes(1);
  });
});
