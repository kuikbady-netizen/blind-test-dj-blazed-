import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decidePlayerJoin, type PlayerJoinRecord } from "./player-join";

const existingPlayer: PlayerJoinRecord = {
  id: "player-1",
  nickname: "Camille",
  nicknameKey: "camille",
  playerTokenHash: "token-hash-1",
};

describe("decidePlayerJoin", () => {
  it("recognizes the same player by their token without creating a duplicate", () => {
    assert.deepEqual(
      decidePlayerJoin([existingPlayer], "camille", "token-hash-1"),
      { kind: "rejoin", player: existingPlayer },
    );
  });

  it("keeps the nickname reserved when a different player tries to use it", () => {
    assert.deepEqual(decidePlayerJoin([existingPlayer], "camille"), {
      kind: "nickname-taken",
    });
    assert.deepEqual(
      decidePlayerJoin([existingPlayer], "camille", "different-token-hash"),
      { kind: "nickname-taken" },
    );
  });

  it("rejects an unknown token instead of creating a new identity", () => {
    assert.deepEqual(
      decidePlayerJoin([existingPlayer], "autre-pseudo", "unknown-token-hash"),
      { kind: "invalid-token" },
    );
  });

  it("does not allow a valid player token to change the reserved nickname", () => {
    assert.deepEqual(
      decidePlayerJoin([existingPlayer], "autre-pseudo", "token-hash-1"),
      { kind: "nickname-mismatch", player: existingPlayer },
    );
  });

  it("allows a new player to join with an unused nickname", () => {
    assert.deepEqual(decidePlayerJoin([existingPlayer], "alex"), {
      kind: "create",
    });
  });
});
