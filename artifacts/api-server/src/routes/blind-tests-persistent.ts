import { createHash, randomInt, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db,
  blindTestPlayersTable,
  blindTestSessionsTable,
  type StoredBlindTestAnswer,
  type StoredBlindTestRound,
} from "@workspace/db";
import {
  CloseBlindTestBody,
  CloseBlindTestParams,
  CloseBlindTestResponse,
  CreateBlindTestBody,
  CreateBlindTestResponse,
  EndBlindTestRoundBody,
  EndBlindTestRoundParams,
  EndBlindTestRoundResponse,
  GetBlindTestParams,
  GetBlindTestResponse,
  GetHostBlindTestParams,
  GetHostBlindTestQueryParams,
  GetHostBlindTestResponse,
  HeartbeatBlindTestPlayerBody,
  HeartbeatBlindTestPlayerParams,
  HeartbeatBlindTestPlayerResponse,
  JoinBlindTestBody,
  JoinBlindTestParams,
  JoinBlindTestResponse,
  StartBlindTestRoundBody,
  StartBlindTestRoundParams,
  StartBlindTestRoundResponse,
  SubmitBlindTestAnswerBody,
  SubmitBlindTestAnswerParams,
  SubmitBlindTestAnswerResponse,
  type ApiTypes,
} from "@workspace/api-zod";

const router: IRouter = Router();
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const ACTIVE_PLAYER_WINDOW_MS = 60_000;

type SessionRow = typeof blindTestSessionsTable.$inferSelect;
type PlayerRow = typeof blindTestPlayersTable.$inferSelect;
type RouteResult<T> =
  | { ok: true; value: T }
  | { ok: false; status: number; error: string };

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeRoomCode(value: string): string {
  return value.trim().toUpperCase().replace(/[\s-]/g, "");
}

function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function makeRoomCode(): string {
  return Array.from(
    { length: 5 },
    () => roomAlphabet[randomInt(roomAlphabet.length)],
  ).join("");
}

async function readSession(roomCode: string): Promise<SessionRow | undefined> {
  const [session] = await db
    .select()
    .from(blindTestSessionsTable)
    .where(eq(blindTestSessionsTable.roomCode, roomCode))
    .limit(1);
  return session;
}

async function readPlayers(roomCode: string): Promise<PlayerRow[]> {
  return db
    .select()
    .from(blindTestPlayersTable)
    .where(eq(blindTestPlayersTable.roomCode, roomCode))
    .orderBy(blindTestPlayersTable.joinedAt);
}

function makeLeaderboard(players: PlayerRow[]): ApiTypes.LeaderboardEntry[] {
  return [...players]
    .sort(
      (a, b) =>
        b.score - a.score || a.joinedAt.getTime() - b.joinedAt.getTime(),
    )
    .map((player, index) => ({
      playerId: player.id,
      nickname: player.nickname,
      points: player.score,
      rank: index + 1,
    }));
}

function makeSessionView(
  session: SessionRow,
  allPlayers: PlayerRow[],
  isHost: boolean,
): ApiTypes.BlindTest {
  const reveal =
    isHost ||
    session.status === "ended" ||
    session.currentRound?.status === "ended";
  const currentRound = session.currentRound
    ? {
        number: session.currentRound.number,
        status: session.currentRound.status,
        artist: reveal ? session.currentRound.artist : null,
        title: reveal ? session.currentRound.title : null,
        startedAt: new Date(session.currentRound.startedAt),
        endedAt: session.currentRound.endedAt
          ? new Date(session.currentRound.endedAt)
          : null,
        answers: reveal
          ? session.currentRound.answers.map((answer) => ({
              ...answer,
              submittedAt: new Date(answer.submittedAt),
            }))
          : [],
      }
    : null;

  return {
    roomCode: session.roomCode,
    djName: session.djName,
    status: session.status,
    createdAt: session.createdAt,
    players: allPlayers
      .filter(
        (player) =>
          player.lastSeenAt.getTime() > Date.now() - ACTIVE_PLAYER_WINDOW_MS,
      )
      .map(({ id, nickname, joinedAt }) => ({ id, nickname, joinedAt })),
    leaderboard: makeLeaderboard(allPlayers),
    currentRound,
    roundCount: session.roundCount,
  };
}

async function readSessionView(
  roomCode: string,
  isHost: boolean,
): Promise<ApiTypes.BlindTest | undefined> {
  const session = await readSession(roomCode);
  if (!session) return undefined;
  const players = await readPlayers(roomCode);
  return makeSessionView(session, players, isHost);
}

router.post("/blind-tests", async (req, res): Promise<void> => {
  const parsedBody = CreateBlindTestBody.safeParse(req.body);
  if (!parsedBody.success || !parsedBody.data.djName.trim()) {
    res.status(400).json({ error: "Le nom du DJ est obligatoire." });
    return;
  }

  const djName = parsedBody.data.djName.trim();
  const hostToken = randomUUID();
  let createdRoomCode: string | undefined;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const roomCode = makeRoomCode();
    const inserted = await db
      .insert(blindTestSessionsTable)
      .values({
        roomCode,
        djName,
        hostTokenHash: tokenHash(hostToken),
        status: "lobby",
        roundCount: 0,
        currentRound: null,
      })
      .onConflictDoNothing()
      .returning({ roomCode: blindTestSessionsTable.roomCode });
    if (inserted.length) {
      createdRoomCode = roomCode;
      break;
    }
  }

  if (!createdRoomCode) {
    res.status(503).json({ error: "Impossible de créer un code de salle. Réessaie." });
    return;
  }

  const session = await readSessionView(createdRoomCode, true);
  if (!session) {
    res.status(500).json({ error: "La salle vient d’être créée mais ne peut pas être relue." });
    return;
  }
  res.status(201).json(
    CreateBlindTestResponse.parse({ session, hostToken }),
  );
});

router.get("/blind-tests/:roomCode", async (req, res): Promise<void> => {
  const parsedParams = GetBlindTestParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Code de salle invalide." });
    return;
  }
  const session = await readSessionView(
    normalizeRoomCode(parsedParams.data.roomCode),
    false,
  );
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  res.json(GetBlindTestResponse.parse(session));
});

router.get("/blind-tests/:roomCode/host", async (req, res): Promise<void> => {
  const parsedParams = GetHostBlindTestParams.safeParse(req.params);
  const parsedQuery = GetHostBlindTestQueryParams.safeParse(req.query);
  if (!parsedParams.success || !parsedQuery.success) {
    res.status(400).json({ error: "Accès à la régie invalide." });
    return;
  }

  const roomCode = normalizeRoomCode(parsedParams.data.roomCode);
  const session = await readSession(roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (session.hostTokenHash !== tokenHash(parsedQuery.data.hostToken)) {
    res.status(401).json({ error: "Accès DJ non autorisé." });
    return;
  }

  const players = await readPlayers(roomCode);
  res.json(
    GetHostBlindTestResponse.parse(makeSessionView(session, players, true)),
  );
});

router.post(
  "/blind-tests/:roomCode/players",
  async (req, res): Promise<void> => {
    const parsedParams = JoinBlindTestParams.safeParse(req.params);
    const parsedBody = JoinBlindTestBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "Vérifie le code de salle et ton pseudo." });
      return;
    }

    const roomCode = normalizeRoomCode(parsedParams.data.roomCode);
    const nickname = parsedBody.data.nickname.trim();
    if (!nickname) {
      res.status(400).json({ error: "Choisis un pseudo." });
      return;
    }

    const playerToken = randomUUID();
    const playerId = randomUUID();
    const joinedAt = new Date();
    const result = await db.transaction<RouteResult<null>>(async (tx) => {
      const [session] = await tx
        .select()
        .from(blindTestSessionsTable)
        .where(eq(blindTestSessionsTable.roomCode, roomCode))
        .for("update")
        .limit(1);
      if (!session) {
        return { ok: false, status: 404, error: "Cette salle n’existe pas." };
      }
      if (session.status === "ended") {
        return { ok: false, status: 409, error: "Cette session est terminée." };
      }

      const players = await tx
        .select({ nicknameKey: blindTestPlayersTable.nicknameKey })
        .from(blindTestPlayersTable)
        .where(eq(blindTestPlayersTable.roomCode, roomCode));
      const nicknameKey = normalizeAnswer(nickname);
      if (players.some((player) => player.nicknameKey === nicknameKey)) {
        return {
          ok: false,
          status: 409,
          error: "Ce pseudo est déjà pris dans cette salle.",
        };
      }

      await tx.insert(blindTestPlayersTable).values({
        id: playerId,
        roomCode,
        nickname,
        nicknameKey,
        playerTokenHash: tokenHash(playerToken),
        joinedAt,
        lastSeenAt: joinedAt,
        score: 0,
      });
      return { ok: true, value: null };
    });

    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }
    const session = await readSessionView(roomCode, false);
    if (!session) {
      res.status(404).json({ error: "Cette salle n’existe plus." });
      return;
    }
    res.status(201).json(
      JoinBlindTestResponse.parse({ session, playerToken }),
    );
  },
);

router.post(
  "/blind-tests/:roomCode/players/heartbeat",
  async (req, res): Promise<void> => {
    const parsedParams = HeartbeatBlindTestPlayerParams.safeParse(req.params);
    const parsedBody = HeartbeatBlindTestPlayerBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "Signal de présence invalide." });
      return;
    }

    const [player] = await db
      .update(blindTestPlayersTable)
      .set({ lastSeenAt: new Date() })
      .where(
        and(
          eq(
            blindTestPlayersTable.roomCode,
            normalizeRoomCode(parsedParams.data.roomCode),
          ),
          eq(
            blindTestPlayersTable.playerTokenHash,
            tokenHash(parsedBody.data.playerToken),
          ),
        ),
      )
      .returning({ id: blindTestPlayersTable.id });
    if (!player) {
      res.status(401).json({ error: "Rejoins la salle pour signaler ta présence." });
      return;
    }
    res.json(HeartbeatBlindTestPlayerResponse.parse({ ok: true }));
  },
);

router.post(
  "/blind-tests/:roomCode/rounds",
  async (req, res): Promise<void> => {
    const parsedParams = StartBlindTestRoundParams.safeParse(req.params);
    const parsedBody = StartBlindTestRoundBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "Renseigne le titre et l’artiste." });
      return;
    }
    const roomCode = normalizeRoomCode(parsedParams.data.roomCode);
    const { artist, title, hostToken } = parsedBody.data;
    if (!artist.trim() || !title.trim()) {
      res.status(400).json({ error: "Renseigne le titre et l’artiste." });
      return;
    }

    const result = await db.transaction<RouteResult<null>>(async (tx) => {
      const [session] = await tx
        .select()
        .from(blindTestSessionsTable)
        .where(eq(blindTestSessionsTable.roomCode, roomCode))
        .for("update")
        .limit(1);
      if (!session) {
        return { ok: false, status: 404, error: "Cette salle n’existe pas." };
      }
      if (session.hostTokenHash !== tokenHash(hostToken)) {
        return { ok: false, status: 401, error: "Accès DJ non autorisé." };
      }
      if (session.status === "ended") {
        return { ok: false, status: 409, error: "Cette session est déjà terminée." };
      }
      if (session.currentRound?.status === "live") {
        return {
          ok: false,
          status: 409,
          error: "Termine la manche en cours avant d’en lancer une autre.",
        };
      }

      const now = new Date();
      const currentRound: StoredBlindTestRound = {
        number: session.roundCount + 1,
        status: "live",
        artist: artist.trim(),
        title: title.trim(),
        startedAt: now.toISOString(),
        endedAt: null,
        answers: [],
      };
      await tx
        .update(blindTestSessionsTable)
        .set({
          status: "playing",
          roundCount: currentRound.number,
          currentRound,
        })
        .where(eq(blindTestSessionsTable.roomCode, roomCode));
      return { ok: true, value: null };
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const session = await readSessionView(roomCode, true);
    if (!session) {
      res.status(404).json({ error: "Cette salle n’existe plus." });
      return;
    }
    res.json(StartBlindTestRoundResponse.parse(session));
  },
);

router.post(
  "/blind-tests/:roomCode/rounds/end",
  async (req, res): Promise<void> => {
    const parsedParams = EndBlindTestRoundParams.safeParse(req.params);
    const parsedBody = EndBlindTestRoundBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "Action de régie invalide." });
      return;
    }
    const roomCode = normalizeRoomCode(parsedParams.data.roomCode);

    const result = await db.transaction<RouteResult<null>>(async (tx) => {
      const [session] = await tx
        .select()
        .from(blindTestSessionsTable)
        .where(eq(blindTestSessionsTable.roomCode, roomCode))
        .for("update")
        .limit(1);
      if (!session) {
        return { ok: false, status: 404, error: "Cette salle n’existe pas." };
      }
      if (session.hostTokenHash !== tokenHash(parsedBody.data.hostToken)) {
        return { ok: false, status: 401, error: "Accès DJ non autorisé." };
      }
      if (!session.currentRound || session.currentRound.status !== "live") {
        return { ok: false, status: 409, error: "Aucune manche n’est en cours." };
      }

      await tx
        .update(blindTestSessionsTable)
        .set({
          currentRound: {
            ...session.currentRound,
            status: "ended",
            endedAt: new Date().toISOString(),
          },
        })
        .where(eq(blindTestSessionsTable.roomCode, roomCode));
      return { ok: true, value: null };
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const session = await readSessionView(roomCode, true);
    if (!session) {
      res.status(404).json({ error: "Cette salle n’existe plus." });
      return;
    }
    res.json(EndBlindTestRoundResponse.parse(session));
  },
);

router.post(
  "/blind-tests/:roomCode/answers",
  async (req, res): Promise<void> => {
    const parsedParams = SubmitBlindTestAnswerParams.safeParse(req.params);
    const parsedBody = SubmitBlindTestAnswerBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "Renseigne l’artiste ou le titre." });
      return;
    }
    const roomCode = normalizeRoomCode(parsedParams.data.roomCode);
    const submittedAt = new Date();
    const playerTokenHash = tokenHash(parsedBody.data.playerToken);
    const artist = parsedBody.data.artist?.trim() ?? "";
    const title = parsedBody.data.title?.trim() ?? "";
    if (!artist && !title) {
      res.status(400).json({ error: "Renseigne l’artiste ou le titre." });
      return;
    }

    const result = await db.transaction<
      RouteResult<{ answer: StoredBlindTestAnswer; message: string }>
    >(async (tx) => {
      const [session] = await tx
        .select()
        .from(blindTestSessionsTable)
        .where(eq(blindTestSessionsTable.roomCode, roomCode))
        .for("update")
        .limit(1);
      if (!session) {
        return { ok: false, status: 404, error: "Cette salle n’existe pas." };
      }
      if (session.status !== "playing" || session.currentRound?.status !== "live") {
        return {
          ok: false,
          status: 409,
          error: "Aucune manche n’est ouverte aux réponses.",
        };
      }

      const [player] = await tx
        .select()
        .from(blindTestPlayersTable)
        .where(
          and(
            eq(blindTestPlayersTable.roomCode, roomCode),
            eq(blindTestPlayersTable.playerTokenHash, playerTokenHash),
          ),
        )
        .limit(1);
      if (!player) {
        return {
          ok: false,
          status: 401,
          error: "Rejoins la salle avant d’envoyer une réponse.",
        };
      }

      const currentRound = session.currentRound;
      if (currentRound.answers.some((answer) => answer.playerId === player.id)) {
        return {
          ok: false,
          status: 409,
          error: "Tu as déjà répondu à cette manche.",
        };
      }

      const correct =
        (!artist ||
          normalizeAnswer(artist) === normalizeAnswer(currentRound.artist)) &&
        (!title ||
          normalizeAnswer(title) === normalizeAnswer(currentRound.title));
      const correctAnswers = currentRound.answers.filter(
        (answer) => answer.correct,
      ).length;
      const points = correct ? Math.max(100, 1000 - correctAnswers * 100) : 0;
      const answer: StoredBlindTestAnswer = {
        id: randomUUID(),
        playerId: player.id,
        nickname: player.nickname,
        artist,
        title,
        submittedAt: submittedAt.toISOString(),
        correct,
        points,
      };

      await tx
        .update(blindTestSessionsTable)
        .set({
          currentRound: {
            ...currentRound,
            answers: [...currentRound.answers, answer],
          },
        })
        .where(eq(blindTestSessionsTable.roomCode, roomCode));
      if (points > 0) {
        await tx
          .update(blindTestPlayersTable)
          .set({ score: player.score + points })
          .where(eq(blindTestPlayersTable.id, player.id));
      }

      return {
        ok: true,
        value: {
          answer,
          message: correct
            ? `Bonne réponse ! ${points} points gagnés.`
            : "Réponse enregistrée. Résultat révélé à la fin de la manche.",
        },
      };
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json(
      SubmitBlindTestAnswerResponse.parse({
        answer: {
          ...result.value.answer,
          submittedAt: new Date(result.value.answer.submittedAt),
        },
        message: result.value.message,
      }),
    );
  },
);

router.post(
  "/blind-tests/:roomCode/end",
  async (req, res): Promise<void> => {
    const parsedParams = CloseBlindTestParams.safeParse(req.params);
    const parsedBody = CloseBlindTestBody.safeParse(req.body);
    if (!parsedParams.success || !parsedBody.success) {
      res.status(400).json({ error: "Action de régie invalide." });
      return;
    }
    const roomCode = normalizeRoomCode(parsedParams.data.roomCode);

    const result = await db.transaction<RouteResult<null>>(async (tx) => {
      const [session] = await tx
        .select()
        .from(blindTestSessionsTable)
        .where(eq(blindTestSessionsTable.roomCode, roomCode))
        .for("update")
        .limit(1);
      if (!session) {
        return { ok: false, status: 404, error: "Cette salle n’existe pas." };
      }
      if (session.hostTokenHash !== tokenHash(parsedBody.data.hostToken)) {
        return { ok: false, status: 401, error: "Accès DJ non autorisé." };
      }

      const currentRound =
        session.currentRound?.status === "live"
          ? {
              ...session.currentRound,
              status: "ended" as const,
              endedAt: new Date().toISOString(),
            }
          : session.currentRound;
      await tx
        .update(blindTestSessionsTable)
        .set({ status: "ended", currentRound })
        .where(eq(blindTestSessionsTable.roomCode, roomCode));
      return { ok: true, value: null };
    });
    if (!result.ok) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    const session = await readSessionView(roomCode, true);
    if (!session) {
      res.status(404).json({ error: "Cette salle n’existe plus." });
      return;
    }
    res.json(CloseBlindTestResponse.parse(session));
  },
);

export default router;
