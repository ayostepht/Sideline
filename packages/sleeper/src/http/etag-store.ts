export interface EtagEntry {
  etag: string;
  body: unknown;
}

export interface EtagStore {
  get(url: string): Promise<EtagEntry | undefined>;
  set(url: string, etag: string, body: unknown): Promise<void>;
}

export class InMemoryEtagStore implements EtagStore {
  private readonly map = new Map<string, EtagEntry>();
  get(url: string): Promise<EtagEntry | undefined> {
    return Promise.resolve(this.map.get(url));
  }
  set(url: string, etag: string, body: unknown): Promise<void> {
    this.map.set(url, { etag, body });
    return Promise.resolve();
  }
}
