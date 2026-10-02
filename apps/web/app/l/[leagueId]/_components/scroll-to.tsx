"use client";

import { useEffect } from "react";

/** Scrolls the element with this id to the middle of the view once after mount. */
export function ScrollToTarget({ targetId }: { targetId: string }) {
  useEffect(() => {
    document.getElementById(targetId)?.scrollIntoView({ block: "center" });
  }, [targetId]);
  return null;
}
