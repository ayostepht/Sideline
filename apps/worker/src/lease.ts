import { hostname } from "node:os";
import { randomBytes } from "node:crypto";
import { acquireLease, releaseLease, renewLease, type DbHandle } from "@sideline/db";

export const LEASE_TTL_MS = 2 * 60 * 1000;
export const LEASE_RENEW_MS = 30 * 1000;
export const LEASE_RETRY_MS = 10 * 1000;

export function newHolderId(): string {
  return `${hostname()}:${process.pid}:${randomBytes(4).toString("hex")}`;
}

/** Holds the sync lease for this process and exposes an abort signal that fires on loss. */
export class LeaseKeeper {
  private controller = new AbortController();
  private _held = false;

  constructor(
    private readonly db: DbHandle,
    readonly holder: string,
    private readonly now: () => Date,
    private readonly ttlMs: number = LEASE_TTL_MS,
  ) {}

  get held(): boolean {
    return this._held;
  }

  /** Aborted when the lease is lost (or `abort` is called); replaced on each new acquisition. */
  get signal(): AbortSignal {
    return this.controller.signal;
  }

  tryAcquire(): boolean {
    if (this._held) return true;
    if (!acquireLease(this.db, this.holder, this.ttlMs, this.now())) return false;
    this._held = true;
    if (this.controller.signal.aborted) this.controller = new AbortController();
    return true;
  }

  /** Renews; on failure marks the lease lost and aborts the signal. Returns whether still held. */
  renew(): boolean {
    if (!this._held) return false;
    let ok: boolean;
    try {
      ok = renewLease(this.db, this.holder, this.ttlMs, this.now());
    } catch {
      ok = false;
    }
    if (!ok) {
      this._held = false;
      this.controller.abort(new Error("sync lease lost"));
    }
    return ok;
  }

  abort(reason: string): void {
    this.controller.abort(new Error(reason));
  }

  release(): void {
    if (this._held) {
      releaseLease(this.db, this.holder);
      this._held = false;
    }
  }
}
