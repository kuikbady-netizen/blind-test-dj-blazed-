import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export type BlindTestStatus = "lobby" | "playing" | "ended";
export type BlindTestRoundStatus = "live" | "ended";

export type StoredBlindTestAnswer = {
  id: string;
  playerId: string;
  nickname: string;
  artist: string;
  title: string;
  submittedAt: string;
  correct: boolean;
  points: number;
};

export type StoredBlindTestRound = {
  number: number;
  status: BlindTestRoundStatus;
  artist: string;
  title: string;
  startedAt: string;
  endedAt: string | null;
  answers: StoredBlindTestAnswer[];
};

export const blindTestSessionsTable = pgTable("blind_test_sessions", {
  roomCode: varchar("room_code", { length: 5 }).primaryKey(),
  djName: text("dj_name").notNull(),
  hostTokenHash: text("host_token_hash").notNull(),
  status: text("status").$type<BlindTestStatus>().notNull().default("lobby"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  roundCount: integer("round_count").notNull().default(0),
  currentRound: jsonb("current_round").$type<StoredBlindTestRound | null>(),
});

export const blindTestPlayersTable = pgTable(
  "blind_test_players",
  {
    id: uuid("id").primaryKey(),
    roomCode: varchar("room_code", { length: 5 })
      .notNull()
      .references(() => blindTestSessionsTable.roomCode, { onDelete: "cascade" }),
    nickname: text("nickname").notNull(),
    nicknameKey: text("nickname_key").notNull(),
    playerTokenHash: text("player_token_hash").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }).notNull(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
    score: integer("score").notNull().default(0),
  },
  (table) => [
    uniqueIndex("blind_test_players_room_nickname_unique").on(
      table.roomCode,
      table.nicknameKey,
    ),
    uniqueIndex("blind_test_players_token_unique").on(table.playerTokenHash),
    index("blind_test_players_room_joined_idx").on(
      table.roomCode,
      table.joinedAt,
    ),
  ],
);
