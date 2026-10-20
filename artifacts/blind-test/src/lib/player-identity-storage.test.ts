import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readPlayerIdentity,
  storePlayerIdentity,
  type PlayerIdentityStorage,
} from "./player-identity-storage";

class MemoryStorage implements PlayerIdentityStorage {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe("player identity storage", () => {
  it("migrates an existing player token from tab storage", () => {
    const persistentStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    legacyStorage.setItem("player", "existing-token");

    assert.equal(
      readPlayerIdentity("player", persistentStorage, legacyStorage),
      "existing-token",
    );
    assert.equal(persistentStorage.getItem("player"), "existing-token");
  });

  it("restores the same token from a new tab's storage context", () => {
    const persistentStorage = new MemoryStorage();
    const firstTabStorage = new MemoryStorage();
    storePlayerIdentity(
      "player",
      "same-player-token",
      persistentStorage,
      firstTabStorage,
    );

    const secondTabStorage = new MemoryStorage();
    assert.equal(
      readPlayerIdentity("player", persistentStorage, secondTabStorage),
      "same-player-token",
    );
  });

  it("prefers the persistent token over an older tab-scoped value", () => {
    const persistentStorage = new MemoryStorage();
    const legacyStorage = new MemoryStorage();
    persistentStorage.setItem("player", "current-token");
    legacyStorage.setItem("player", "stale-token");

    assert.equal(
      readPlayerIdentity("player", persistentStorage, legacyStorage),
      "current-token",
    );
  });
});
