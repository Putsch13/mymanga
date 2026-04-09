export function hashSeed(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

export function createSeededRng(seed: number) {
  let state = seed >>> 0;
  return {
    next() {
      state += 0x6d2b79f5;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    pickOne<T>(items: T[]): T {
      return items[Math.floor(this.next() * items.length)] as T;
    },
    pickMany<T>(items: T[], count: number): T[] {
      const pool = [...items];
      const picked: T[] = [];
      while (pool.length > 0 && picked.length < count) {
        const index = Math.floor(this.next() * pool.length);
        picked.push(pool.splice(index, 1)[0] as T);
      }
      return picked;
    },
  };
}
