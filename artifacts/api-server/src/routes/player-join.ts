export type PlayerJoinRecord = {
  id: string;
  nickname: string;
  nicknameKey: string;
  playerTokenHash: string;
};

export type PlayerJoinDecision =
  | { kind: "rejoin"; player: PlayerJoinRecord }
  | { kind: "create" }
  | { kind: "nickname-taken" }
  | { kind: "invalid-token" }
  | { kind: "nickname-mismatch"; player: PlayerJoinRecord };

export function decidePlayerJoin(
  players: PlayerJoinRecord[],
  nicknameKey: string,
  playerTokenHash?: string,
): PlayerJoinDecision {
  if (playerTokenHash !== undefined) {
    const existingPlayer = players.find(
      (player) => player.playerTokenHash === playerTokenHash,
    );
    if (!existingPlayer) {
      return players.some((player) => player.nicknameKey === nicknameKey)
        ? { kind: "nickname-taken" }
        : { kind: "invalid-token" };
    }
    if (existingPlayer.nicknameKey !== nicknameKey) {
      return { kind: "nickname-mismatch", player: existingPlayer };
    }
    return { kind: "rejoin", player: existingPlayer };
  }

  if (players.some((player) => player.nicknameKey === nicknameKey)) {
    return { kind: "nickname-taken" };
  }
  return { kind: "create" };
}
