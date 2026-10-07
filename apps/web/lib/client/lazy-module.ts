"use client";

import { useEffect, useState } from "react";

/** Module-level cache for one lazily imported module. A failed import is not cached, so a later mount retries. */
export interface LazyLoader<T> {
  /** The module once loaded, else undefined. */
  peek(): T | undefined;
  /** Resolves with the module, or `undefined` if the import failed. Never rejects. */
  load(): Promise<T | undefined>;
}

export function createLazyLoader<T>(importer: () => Promise<T>): LazyLoader<T> {
  let value: T | undefined;
  let pending: Promise<T | undefined> | undefined;
  return {
    peek: () => value,
    load() {
      if (value !== undefined) return Promise.resolve(value);
      pending ??= importer().then(
        (m) => {
          value = m;
          pending = undefined;
          return m;
        },
        () => {
          pending = undefined;
          return undefined;
        },
      );
      return pending;
    },
  };
}

export interface LazyState<T> {
  mod: T | undefined;
  /** True once an import attempt has failed. */
  failed: boolean;
}

/**
 * Loads a lazy module after hydration. `onBeforeSwap` runs just before the loaded module is
 * committed, while the placeholder is still in the DOM (use it to remember focus).
 */
export function useLazyModule<T>(
  loader: LazyLoader<T>,
  options: { enabled?: boolean; onBeforeSwap?: () => void } = {},
): LazyState<T> {
  const { enabled = true, onBeforeSwap } = options;
  const [mod, setMod] = useState<T | undefined>(() => loader.peek());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled || mod !== undefined) return;
    let live = true;
    void loader.load().then((m) => {
      if (!live) return;
      if (m === undefined) {
        setFailed(true);
        return;
      }
      onBeforeSwap?.();
      setMod(() => m);
    });
    return () => {
      live = false;
    };
    // onBeforeSwap is read at swap time and is not a trigger.
  }, [enabled, mod, loader]);
  return { mod, failed };
}
