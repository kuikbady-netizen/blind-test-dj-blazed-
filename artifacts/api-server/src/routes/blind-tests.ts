import { randomInt, randomUUID } from "node:crypto";
import { Router, type IRouter, type Response } from "express";
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

type SessionState = ApiTypes.BlindTest & {
  hostToken: string;
  playerTokens: Map<string, string>;
  lastSeenAt: Map<string, number>;
  scores: Map<string, number>;
};

const router: IRouter = Router();
const sessions = new Map<string, SessionState>();
const roomAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function findSession(roomCode: string): SessionState | undefined {
  return sessions.get(roomCode.toUpperCase());
}

function getRoomCode(): string {
  let code = "";
  do {
    code = Array.from(
      { length: 5 },
      () => roomAlphabet[randomInt(roomAlphabet.length)],
    ).join("");
  } while (sessions.has(code));
  return code;
}

function makeLeaderboard(session: SessionState): ApiTypes.LeaderboardEntry[] {
  return session.players
    .map((player) => ({
      playerId: player.id,
      nickname: player.nickname,
      points: session.scores.get(player.id) ?? 0,
      rank: 0,
      joinedAt: player.joinedAt.getTime(),
    }))
    .sort((a, b) => b.points - a.points || a.joinedAt - b.joinedAt)
    .map(({ joinedAt: _joinedAt, ...entry }, index) => ({
      ...entry,
      rank: index + 1,
    }));
}

function makeSessionView(
  session: SessionState,
  isHost: boolean,
): ApiTypes.BlindTest {
  const reveal = isHost || session.status === "ended" ||
    session.currentRound?.status === "ended";
  const currentRound = session.currentRound
    ? {
        ...session.currentRound,
        artist: reveal ? session.currentRound.artist : null,
        title: reveal ? session.currentRound.title : null,
        answers: reveal ? session.currentRound.answers : [],
      }
    : null;

  return {
    roomCode: session.roomCode,
    djName: session.djName,
    status: session.status,
    createdAt: session.createdAt,
    players: session.players.filter(
      (player) => (session.lastSeenAt.get(player.id) ?? 0) > Date.now() - 60_000,
    ),
    leaderboard: makeLeaderboard(session),
    currentRound,
    roundCount: session.roundCount,
  };
}

function normalizeAnswer(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]/gu, "");
}

function validHost(
  res: Response,
  session: SessionState,
  hostToken: string,
): boolean {
  if (session.hostToken === hostToken) return true;
  res.status(401).json({ error: "Accès DJ non autorisé." });
  return false;
}

router.post("/blind-tests", (req, res): void => {
  const parsedBody = CreateBlindTestBody.safeParse(req.body);
  if (!parsedBody.success) {
    res.status(400).json({ error: "Le nom du DJ est obligatoire." });
    return;
  }
  const djName = parsedBody.data.djName.trim();
  if (!djName) {
    res.status(400).json({ error: "Le nom du DJ est obligatoire." });
    return;
  }

  const roomCode = getRoomCode();
  const session: SessionState = {
    roomCode,
    djName,
    status: "lobby",
    createdAt: new Date(),
    players: [],
    leaderboard: [],
    currentRound: null,
    roundCount: 0,
    hostToken: randomUUID(),
    playerTokens: new Map(),
    lastSeenAt: new Map(),
    scores: new Map(),
  };
  sessions.set(roomCode, session);
  res.status(201).json(
    CreateBlindTestResponse.parse({
      session: makeSessionView(session, true),
      hostToken: session.hostToken,
    }),
  );
});

router.get("/blind-tests/:roomCode", (req, res): void => {
  const parsedParams = GetBlindTestParams.safeParse(req.params);
  if (!parsedParams.success) {
    res.status(400).json({ error: "Code de salle invalide." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  res.json(GetBlindTestResponse.parse(makeSessionView(session, false)));
});

router.get("/blind-tests/:roomCode/host", (req, res): void => {
  const parsedParams = GetHostBlindTestParams.safeParse(req.params);
  const parsedQuery = GetHostBlindTestQueryParams.safeParse(req.query);
  if (!parsedParams.success || !parsedQuery.success) {
    res.status(400).json({ error: "Accès à la régie invalide." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (session.hostToken !== parsedQuery.data.hostToken) {
    res.status(401).json({ error: "Accès DJ non autorisé." });
    return;
  }
  res.json(GetHostBlindTestResponse.parse(makeSessionView(session, true)));
});

router.post("/blind-tests/:roomCode/players", (req, res): void => {
  const parsedParams = JoinBlindTestParams.safeParse(req.params);
  const parsedBody = JoinBlindTestBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Vérifie le code de salle et ton pseudo." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (session.status === "ended") {
    res.status(409).json({ error: "Cette session est terminée." });
    return;
  }

  const nickname = parsedBody.data.nickname.trim();
  if (!nickname) {
    res.status(400).json({ error: "Choisis un pseudo." });
    return;
  }
  if (
    session.players.some(
      (player) => normalizeAnswer(player.nickname) === normalizeAnswer(nickname),
    )
  ) {
    res.status(409).json({ error: "Ce pseudo est déjà pris dans cette salle." });
    return;
  }

  const player: ApiTypes.Player = {
    id: randomUUID(),
    nickname,
    joinedAt: new Date(),
  };
  const playerToken = randomUUID();
  session.players.push(player);
  session.playerTokens.set(player.id, playerToken);
  session.lastSeenAt.set(player.id, Date.now());
  session.scores.set(player.id, 0);
  res.status(201).json(
    JoinBlindTestResponse.parse({
      session: makeSessionView(session, false),
      playerToken,
    }),
  );
});

router.post("/blind-tests/:roomCode/players/heartbeat", (req, res): void => {
  const parsedParams = HeartbeatBlindTestPlayerParams.safeParse(req.params);
  const parsedBody = HeartbeatBlindTestPlayerBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Signal de présence invalide." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  const playerId = [...session.playerTokens.entries()].find(
    ([, token]) => token === parsedBody.data.playerToken,
  )?.[0];
  if (!playerId) {
    res.status(401).json({ error: "Rejoins la salle pour signaler ta présence." });
    return;
  }
  session.lastSeenAt.set(playerId, Date.now());
  res.json(HeartbeatBlindTestPlayerResponse.parse({ ok: true }));
});

router.post("/blind-tests/:roomCode/rounds", (req, res): void => {
  const parsedParams = StartBlindTestRoundParams.safeParse(req.params);
  const parsedBody = StartBlindTestRoundBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Renseigne le titre et l’artiste." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (!validHost(res, session, parsedBody.data.hostToken)) return;
  if (session.status === "ended") {
    res.status(409).json({ error: "Cette session est déjà terminée." });
    return;
  }
  if (session.currentRound?.status === "live") {
    res.status(409).json({ error: "Termine la manche en cours avant d’en lancer une autre." });
    return;
  }
  const artist = parsedBody.data.artist.trim();
  const title = parsedBody.data.title.trim();
  if (!artist || !title) {
    res.status(400).json({ error: "Renseigne le titre et l’artiste." });
    return;
  }

  session.roundCount += 1;
  session.status = "playing";
  session.currentRound = {
    number: session.roundCount,
    status: "live",
    artist,
    title,
    startedAt: new Date(),
    endedAt: null,
    answers: [],
  };
  res.json(StartBlindTestRoundResponse.parse(makeSessionView(session, true)));
});

router.post("/blind-tests/:roomCode/rounds/end", (req, res): void => {
  const parsedParams = EndBlindTestRoundParams.safeParse(req.params);
  const parsedBody = EndBlindTestRoundBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Action de régie invalide." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (!validHost(res, session, parsedBody.data.hostToken)) return;
  if (!session.currentRound || session.currentRound.status !== "live") {
    res.status(409).json({ error: "Aucune manche n’est en cours." });
    return;
  }

  session.currentRound.status = "ended";
  session.currentRound.endedAt = new Date();
  res.json(EndBlindTestRoundResponse.parse(makeSessionView(session, true)));
});

router.post("/blind-tests/:roomCode/answers", (req, res): void => {
  const parsedParams = SubmitBlindTestAnswerParams.safeParse(req.params);
  const parsedBody = SubmitBlindTestAnswerBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Renseigne l’artiste et le titre." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (session.status !== "playing" || session.currentRound?.status !== "live") {
    res.status(409).json({ error: "Aucune manche n’est ouverte aux réponses." });
    return;
  }

  const playerId = [...session.playerTokens.entries()].find(
    ([, token]) => token === parsedBody.data.playerToken,
  )?.[0];
  const player = session.players.find((candidate) => candidate.id === playerId);
  if (!player) {
    res.status(401).json({ error: "Rejoins la salle avant d’envoyer une réponse." });
    return;
  }
  if (session.currentRound.answers.some((answer) => answer.playerId === player.id)) {
    res.status(409).json({ error: "Tu as déjà répondu à cette manche." });
    return;
  }

  const correct =
    normalizeAnswer(parsedBody.data.artist) === normalizeAnswer(session.currentRound.artist ?? "") &&
    normalizeAnswer(parsedBody.data.title) === normalizeAnswer(session.currentRound.title ?? "");
  const correctAnswers = session.currentRound.answers.filter((answer) => answer.correct).length;
  const points = correct ? Math.max(100, 1000 - correctAnswers * 100) : 0;
  const answer: ApiTypes.Answer = {
    id: randomUUID(),
    playerId: player.id,
    nickname: player.nickname,
    artist: parsedBody.data.artist.trim(),
    title: parsedBody.data.title.trim(),
    submittedAt: new Date(),
    correct,
    points,
  };
  session.currentRound.answers.push(answer);
  if (points > 0) {
    session.scores.set(player.id, (session.scores.get(player.id) ?? 0) + points);
  }

  res.status(201).json(
    SubmitBlindTestAnswerResponse.parse({
      answer,
      message: correct
        ? `Bonne réponse ! ${points} points gagnés.`
        : "Réponse enregistrée. Résultat révélé à la fin de la manche.",
    }),
  );
});

router.post("/blind-tests/:roomCode/end", (req, res): void => {
  const parsedParams = CloseBlindTestParams.safeParse(req.params);
  const parsedBody = CloseBlindTestBody.safeParse(req.body);
  if (!parsedParams.success || !parsedBody.success) {
    res.status(400).json({ error: "Action de régie invalide." });
    return;
  }
  const session = findSession(parsedParams.data.roomCode);
  if (!session) {
    res.status(404).json({ error: "Cette salle n’existe pas." });
    return;
  }
  if (!validHost(res, session, parsedBody.data.hostToken)) return;
  if (session.currentRound?.status === "live") {
    session.currentRound.status = "ended";
    session.currentRound.endedAt = new Date();
  }
  session.status = "ended";
  res.json(CloseBlindTestResponse.parse(makeSessionView(session, true)));
});

export default router;
