"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

interface Ctx {
  detail: string | null;
  setDetail: (v: string | null) => void;
}

const HeaderDetailContext = createContext<Ctx>({ detail: null, setDetail: () => {} });

export function HeaderDetailProvider({ children }: { children: ReactNode }) {
  const [detail, setDetail] = useState<string | null>(null);
  return (
    <HeaderDetailContext.Provider value={{ detail, setDetail }}>
      {children}
    </HeaderDetailContext.Provider>
  );
}

export function useHeaderDetail(): string | null {
  return useContext(HeaderDetailContext).detail;
}

/** Render from a page to add a detail (for example a team name) to the top bar label. */
export function HeaderDetail({ value }: { value: string }) {
  const { setDetail } = useContext(HeaderDetailContext);
  useEffect(() => {
    setDetail(value);
    return () => setDetail(null);
  }, [value, setDetail]);
  return null;
}
