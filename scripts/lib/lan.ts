interface Addr {
  family: string | number;
  internal: boolean;
  address: string;
}

/** First non-internal IPv4 address, or undefined when the machine has no LAN connection. */
export function lanIPv4(interfaces: Record<string, Addr[] | undefined>): string | undefined {
  for (const list of Object.values(interfaces)) {
    for (const info of list ?? []) {
      if ((info.family === "IPv4" || info.family === 4) && !info.internal) return info.address;
    }
  }
  return undefined;
}
