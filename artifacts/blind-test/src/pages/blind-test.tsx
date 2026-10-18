import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useLocation, useParams } from 'wouter';
import { QRCodeSVG } from 'qrcode.react';
import {
  ArrowLeft, ArrowRight, Check, CircleHelp, Copy, Disc3, LoaderCircle,
  Radio, RotateCw, Send, Sparkles, Trophy, Users, X,
} from 'lucide-react';
import {
  getGetBlindTestQueryKey,
  getGetHostBlindTestQueryKey,
  useCloseBlindTest,
  useCreateBlindTest,
  useEndBlindTestRound,
  useGetBlindTest,
  useGetHostBlindTest,
  useHeartbeatBlindTestPlayer,
  useJoinBlindTest,
  useStartBlindTestRound,
  useSubmitBlindTestAnswer,
} from '@workspace/api-client-react';
import type { AnswerResult, BlindTest } from '@workspace/api-client-react';

const hostKey = (roomCode: string) => `blazed:host:${roomCode}`;
const playerKey = (roomCode: string) => `blazed:player:${roomCode}`;
const playerIdKey = (roomCode: string) => `blazed:player-id:${roomCode}`;
const nicknameKey = (roomCode: string) => `blazed:nickname:${roomCode}`;
const submissionKey = (roomCode: string) => `blazed:submission:${roomCode}`;

function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" className="brand" aria-label="Blind Test by DJ Blazed, accueil">
      <span className="brand-mark"><span>B</span></span>
      <span className="brand-name">Blind Test <em>by DJ BLAZED</em></span>
      {light && <span className="top-note">Le bar devient la scène</span>}
    </Link>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return <div className="shell"><div className="content">{children}</div></div>;
}

function Topbar() {
  return <header className="topbar"><Brand /><span className="top-note">Le bar devient la scène</span></header>;
}

function errorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error) return String(error.message);
  return 'Une erreur est survenue. Réessayez dans un instant.';
}

function submittedTime(value: Date | string) {
  return new Intl.DateTimeFormat('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(value instanceof Date ? value : new Date(value));
}

function readStoredSubmission(roomCode: string) {
  try {
    const stored = sessionStorage.getItem(submissionKey(roomCode));
    if (!stored) return null;
    const parsed = JSON.parse(stored) as {
      roundNumber: number;
      result: AnswerResult;
    };
    return Number.isInteger(parsed.roundNumber) && parsed.result?.answer
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function LoadingCard() {
  return <div className="surface loading-card" aria-label="Chargement">
    <div className="skeleton" style={{ width: 90 }} />
    <div className="skeleton large" />
    <div className="skeleton" style={{ width: '82%', marginBottom: 12 }} />
    <div className="skeleton" style={{ width: '58%' }} />
  </div>;
}

function ErrorCard({ title, message, retry }: { title: string; message: string; retry?: () => void }) {
  return <div className="surface error-screen">
    <CircleHelp size={31} color="var(--gold)" />
    <h1>{title}</h1>
    <p>{message}</p>
    <div className="button-row" style={{ justifyContent: 'center' }}>
      {retry && <button className="quiet-button" onClick={retry} data-testid="button-retry"><RotateCw size={16} /> Réessayer</button>}
      <Link href="/" className="quiet-button"><ArrowLeft size={16} /> Accueil</Link>
    </div>
  </div>;
}

function HomePage() {
  const [, setLocation] = useLocation();
  const [djName, setDjName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [formError, setFormError] = useState('');
  const createRoom = useCreateBlindTest();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('room')?.trim().toUpperCase();
    if (code) setLocation(`/room/${encodeURIComponent(code)}`);
  }, [setLocation]);

  const create = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const cleanName = djName.trim();
    if (!cleanName || cleanName.length > 40) {
      setFormError('Entre ton nom de DJ (1 à 40 caractères).');
      return;
    }
    createRoom.mutate({ data: { djName: cleanName } }, {
      onSuccess: (result) => {
        sessionStorage.setItem(hostKey(result.session.roomCode), result.hostToken);
        queryClient.invalidateQueries({ queryKey: getGetHostBlindTestQueryKey(result.session.roomCode, { hostToken: result.hostToken }) });
        setLocation(`/host/${encodeURIComponent(result.session.roomCode)}`);
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = roomCode.trim().toUpperCase();
    if (!code) { setFormError('Saisis le code affiché par le DJ.'); return; }
    setLocation(`/room/${encodeURIComponent(code)}`);
  };

  return <Shell>
    <Topbar />
    <main className="hero">
      <section className="hero-copy">
        <div className="eyebrow">Le jeu du bar · en direct</div>
        <h1>À toi de<span>reconnaître.</span></h1>
        <p>Le DJ lance le son. À vous de retrouver le titre et l’artiste avant tout le monde. Le téléphone devient votre buzzer.</p>
        <div className="hero-deck"><span className="deck-line" /> <span className="mono">Pas de playlist. Juste le son du DJ.</span></div>
      </section>
      <section className="home-panel" aria-label="Créer ou rejoindre une salle">
        <div className="panel-kicker">01 / En régie</div>
        <h2 className="panel-heading">Lancer une session</h2>
        <form className="form-stack" onSubmit={create}>
          <label>
            <span className="field-label">Nom de DJ</span>
            <input className="field" value={djName} onChange={(event) => setDjName(event.target.value)} maxLength={40} placeholder="DJ BLAZED" autoComplete="nickname" data-testid="input-dj-name" />
          </label>
          <button className="gold-button wide" type="submit" disabled={createRoom.isPending} data-testid="button-create-room">
            {createRoom.isPending ? <LoaderCircle size={17} className="spin" /> : <Radio size={17} />}
            {createRoom.isPending ? 'Ouverture de la régie…' : 'Créer ma salle'} <ArrowRight size={17} />
          </button>
          {formError && <p className="form-error" role="alert" data-testid="status-home-error">{formError}</p>}
        </form>
        <div className="divider" style={{ margin: '23px 0' }}>ou rejoindre la partie</div>
        <form className="form-stack" onSubmit={join}>
          <label>
            <span className="field-label">Code de la salle</span>
            <div className="split">
              <input className="field mono" value={roomCode} onChange={(event) => { setRoomCode(event.target.value.toUpperCase()); setFormError(''); }} maxLength={12} placeholder="Ex. BLAZED" data-testid="input-room-code" />
              <button className="quiet-button" type="submit" data-testid="button-join-room">Rejoindre <ArrowRight size={15} /></button>
            </div>
          </label>
        </form>
        <p className="tiny-note" style={{ margin: '18px 0 0' }}>Le DJ diffuse sa musique depuis son propre logiciel. Cette salle ne lit ni ne stocke aucun son.</p>
      </section>
    </main>
  </Shell>;
}

function RankBoard({ session }: { session: BlindTest }) {
  const board = session.leaderboard ?? [];
  return <section className="surface">
    <header className="surface-head"><h2 className="surface-title">Classement</h2><Trophy size={18} color="var(--gold)" /></header>
    <div className="surface-content">
      {board.length ? <div className="rank-list">
        {board.map((entry, index) => <div className="rank-row" key={entry.playerId} data-testid={`row-rank-${entry.playerId}`}>
          <span className="rank-num">{String(entry.rank ?? index + 1).padStart(2, '0')}</span>
          <span className="rank-name">{entry.nickname}</span>
          <span className="rank-points">{entry.points} PTS</span>
        </div>)}
      </div> : <div className="empty-state"><strong>La piste est libre</strong>Les points apparaîtront après la première manche.</div>}
    </div>
  </section>;
}

function HostPage() {
  const { roomCode = '' } = useParams();
  const queryClient = useQueryClient();
  const [hostToken] = useState(() => sessionStorage.getItem(hostKey(roomCode)) ?? '');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');
  const hostQueryKey = getGetHostBlindTestQueryKey(roomCode, { hostToken });
  const { data: session, isLoading, isError, error, refetch } = useGetHostBlindTest(roomCode, { hostToken }, {
    query: { queryKey: hostQueryKey, enabled: Boolean(roomCode && hostToken), refetchInterval: 1000 },
  });
  const startRound = useStartBlindTestRound();
  const endRound = useEndBlindTestRound();
  const closeSession = useCloseBlindTest();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: hostQueryKey });

  if (!hostToken) return <Shell><Topbar /><ErrorCard title="Régie introuvable" message="Le jeton hôte de cette salle n’est pas disponible dans cette session de navigateur. Recrée une salle depuis l’accueil." /></Shell>;
  if (isLoading && !session) return <Shell><Topbar /><LoadingCard /></Shell>;
  if (isError || !session) return <Shell><Topbar /><ErrorCard title="Salle inaccessible" message={errorMessage(error)} retry={() => { void refetch(); }} /></Shell>;

  const isLive = session.currentRound?.status === 'live';
  const playerUrl = `${window.location.origin}/room/${encodeURIComponent(roomCode)}`;
  const beginRound = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError('');
    const cleanArtist = artist.trim();
    const cleanTitle = title.trim();
    if (!cleanArtist || !cleanTitle) { setFormError('Renseigne l’artiste et le titre avant de lancer la manche.'); return; }
    startRound.mutate({ roomCode, data: { hostToken, artist: cleanArtist, title: cleanTitle } }, {
      onSuccess: () => { setArtist(''); setTitle(''); setNotice('Manche lancée. Le public peut envoyer ses réponses.'); void invalidate(); },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };
  const finishRound = () => {
    setFormError('');
    endRound.mutate({ roomCode, data: { hostToken } }, {
      onSuccess: () => { setNotice('Manche terminée. Les résultats sont affichés.'); void invalidate(); },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };
  const finishSession = () => {
    if (!window.confirm('Terminer définitivement cette session ?')) return;
    closeSession.mutate({ roomCode, data: { hostToken } }, {
      onSuccess: () => { setNotice('Session terminée. Merci d’avoir joué.'); void invalidate(); },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };
  const copyUrl = async () => {
    try { await navigator.clipboard.writeText(playerUrl); setNotice('Lien joueur copié.'); }
    catch { setNotice(`Lien joueur : ${playerUrl}`); }
  };

  return <Shell><Topbar />
    <main className="page-wrap">
      <header className="page-head">
        <div>
          <div className="eyebrow">Régie DJ · {session.djName}</div>
          <h1 className="page-title">Le jeu est<span> à vous.</span></h1>
          <div style={{ marginTop: 17 }} className="status-pill"><i className="status-dot" />{session.status === 'lobby' ? 'En attente des joueurs' : session.status === 'playing' ? 'Manche en cours' : 'Session terminée'}</div>
        </div>
        <div style={{ display: 'grid', gap: 8, justifyItems: 'start' }}>
          <span className="field-label" style={{ margin: 0 }}>Code joueur</span>
          <div className="room-code" data-testid="text-room-code">{roomCode}</div>
        </div>
      </header>
      {notice && <div className="notice" style={{ marginBottom: 16 }} role="status" data-testid="status-host-notice">{notice}</div>}
      {formError && <div className="notice" style={{ marginBottom: 16, borderColor: '#ff988a', color: '#ffb7a7' }} role="alert" data-testid="status-host-error">{formError}</div>}
      <div className="host-grid">
        <div className="round-controls">
          <section className="round-banner">
            <div className="round-number">Session / Manche {session.roundCount + (isLive ? 0 : 1)}</div>
            <h2>{session.status === 'ended' ? 'Rideau.' : isLive ? 'À vos réponses.' : 'Prochain morceau.'}</h2>
            <p>{isLive ? 'La musique est dans le logiciel du DJ. Les réponses arrivent en direct.' : session.status === 'ended' ? 'Le classement final est disponible.' : 'Saisissez la réponse attendue, puis lancez le son depuis votre logiciel.'}</p>
          </section>
          {isLive ? <section className="surface">
            <header className="surface-head"><h2 className="surface-title">Manche en direct</h2><span className="status-pill"><i className="status-dot" />En direct</span></header>
            <div className="surface-content">
              <div className="notice">Réponse masquée pendant la manche. Les réponses des joueurs ne sont jamais affichées ici avant la fin.</div>
              <p className="tiny-note" style={{ margin: '14px 0 18px' }}>{session.currentRound?.answers?.length ?? 0} réponse(s) reçue(s) sur {session.players.length} joueurs.</p>
              <button className="gold-button" onClick={finishRound} disabled={endRound.isPending} data-testid="button-end-round">
                {endRound.isPending ? <LoaderCircle size={17} /> : <Check size={17} />} Terminer la manche
              </button>
            </div>
          </section> : session.status !== 'ended' ? <section className="surface">
            <header className="surface-head"><h2 className="surface-title">Préparer la manche</h2><Disc3 size={18} color="var(--gold)" /></header>
            <div className="surface-content">
              <form className="round-form" onSubmit={beginRound}>
                <label><span className="field-label">Artiste attendu</span><input className="field" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={100} placeholder="Ex. Nina Simone" data-testid="input-answer-artist" /></label>
                <label><span className="field-label">Titre attendu</span><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Ex. Feeling Good" data-testid="input-answer-title" /></label>
                <p className="tiny-note" style={{ margin: 0 }}>Ces réponses sont envoyées à l’API et restent cachées aux joueurs pendant la manche. Lancez le morceau dans votre logiciel DJ.</p>
                <button className="gold-button" type="submit" disabled={startRound.isPending} data-testid="button-start-round">
                  {startRound.isPending ? <LoaderCircle size={17} /> : <Radio size={17} />} Lancer la manche <ArrowRight size={16} />
                </button>
              </form>
            </div>
          </section> : <section className="surface">
            <header className="surface-head"><h2 className="surface-title">Classement final</h2><Trophy size={18} color="var(--gold)" /></header>
            <div className="surface-content"><p className="tiny-note">Session clôturée par {session.djName}.</p></div>
          </section>}
          {session.currentRound?.status === 'ended' && <section className="surface">
            <header className="surface-head"><h2 className="surface-title">Révélation · manche {session.currentRound.number}</h2><Sparkles size={17} color="var(--gold)" /></header>
            <div className="surface-content">
              {session.currentRound.artist && session.currentRound.title
                ? <><div className="result-line"><span>Artiste</span><strong>{session.currentRound.artist}</strong></div><div className="result-line"><span>Titre</span><strong>{session.currentRound.title}</strong></div></>
                : <p className="tiny-note">La réponse n’est pas disponible dans les données renvoyées.</p>}
              {session.currentRound.answers?.length > 0 && <div style={{ marginTop: 18 }}>
                {session.currentRound.answers.map((answer) => <div className="answer-row" key={answer.id}>
                  <div><strong>{answer.nickname}</strong><br /><span>{answer.artist} — {answer.title}</span><br /><span className="tiny-note">Envoyée à {submittedTime(answer.submittedAt)}</span></div>
                  <strong style={{ color: answer.correct ? 'var(--gold)' : '#aaa9ad' }}>{answer.points} pts</strong>
                </div>)}
              </div>}
            </div>
          </section>}
        </div>
        <aside className="round-controls">
          {session.status !== 'ended' && <section className="surface">
            <header className="surface-head"><h2 className="surface-title">Rejoindre la salle</h2><Users size={18} color="var(--gold)" /></header>
            <div className="surface-content qr-panel">
              <div className="qr-box"><QRCodeSVG value={playerUrl} size={152} bgColor="#f4edda" fgColor="#17150e" level="M" /></div>
              <div><div className="field-label" style={{ marginBottom: 5 }}>Scannez pour jouer</div><p className="qr-caption">Ou entrez le code <strong style={{ color: 'var(--gold)' }}>{roomCode}</strong> sur l’accueil.</p></div>
              <button className="quiet-button" onClick={() => void copyUrl()} data-testid="button-copy-link"><Copy size={15} /> Copier le lien joueur</button>
            </div>
          </section>}
          <section className="surface">
            <header className="surface-head"><h2 className="surface-title">Dans la salle</h2><span className="counter" data-testid="text-player-count">{session.players.length} JOUEURS</span></header>
            <div className="surface-content">
              {session.players.length ? <div className="player-list">
                {session.players.map((player, index) => <div className="player-row" key={player.id} data-testid={`row-player-${player.id}`}>
                  <span className="player-index">{String(index + 1).padStart(2, '0')}</span>
                  <span className="player-avatar">{player.nickname.slice(0, 1).toUpperCase()}</span><strong>{player.nickname}</strong>
                </div>)}
              </div> : <div className="empty-state"><strong>La salle s’éveille</strong>Partagez le QR code. Les joueurs apparaîtront ici.</div>}
            </div>
          </section>
          <RankBoard session={session} />
          {session.status !== 'ended' && <button className="danger-button" onClick={finishSession} disabled={closeSession.isPending} data-testid="button-close-session">
            {closeSession.isPending ? <LoaderCircle size={16} /> : <X size={16} />} Terminer la session
          </button>}
        </aside>
      </div>
    </main>
  </Shell>;
}

function PlayerPage() {
  const { roomCode = '' } = useParams();
  const queryClient = useQueryClient();
  const [nickname, setNickname] = useState(() => sessionStorage.getItem(nicknameKey(roomCode)) ?? '');
  const [playerToken, setPlayerToken] = useState(() => sessionStorage.getItem(playerKey(roomCode)) ?? '');
  const [playerId, setPlayerId] = useState(() => sessionStorage.getItem(playerIdKey(roomCode)) ?? '');
  const [artist, setArtist] = useState('');
  const [title, setTitle] = useState('');
  const [formError, setFormError] = useState('');
  const [answerResult, setAnswerResult] = useState<AnswerResult | null>(
    () => readStoredSubmission(roomCode)?.result ?? null,
  );
  const [submittedRound, setSubmittedRound] = useState<number | null>(
    () => readStoredSubmission(roomCode)?.roundNumber ?? null,
  );
  const joinRoom = useJoinBlindTest();
  const heartbeatPlayer = useHeartbeatBlindTestPlayer();
  const sendAnswer = useSubmitBlindTestAnswer();
  const queryKey = getGetBlindTestQueryKey(roomCode);
  const { data: session, isLoading, isError, error, refetch } = useGetBlindTest(roomCode, {
    query: { queryKey, enabled: Boolean(roomCode), refetchInterval: 1000 },
  });

  useEffect(() => {
    setNickname(sessionStorage.getItem(nicknameKey(roomCode)) ?? '');
    setPlayerToken(sessionStorage.getItem(playerKey(roomCode)) ?? '');
    setPlayerId(sessionStorage.getItem(playerIdKey(roomCode)) ?? '');
    const storedSubmission = readStoredSubmission(roomCode);
    setAnswerResult(storedSubmission?.result ?? null);
    setSubmittedRound(storedSubmission?.roundNumber ?? null);
  }, [roomCode]);

  useEffect(() => {
    const currentRoundNumber = session?.currentRound?.number;
    if (
      currentRoundNumber == null ||
      submittedRound == null ||
      currentRoundNumber === submittedRound
    ) {
      return;
    }
    setAnswerResult(null);
    setSubmittedRound(null);
    sessionStorage.removeItem(submissionKey(roomCode));
  }, [roomCode, session?.currentRound?.number, submittedRound]);

  useEffect(() => {
    if (!playerToken || !roomCode) return;
    const sendHeartbeat = () => {
      heartbeatPlayer.mutate({ roomCode, data: { playerToken } });
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 15_000);
    return () => window.clearInterval(timer);
  }, [heartbeatPlayer.mutate, playerToken, roomCode]);

  if (isLoading && !session) return <Shell><Topbar /><LoadingCard /></Shell>;
  if (isError || !session) return <Shell><Topbar /><ErrorCard title="Code introuvable" message={errorMessage(error)} retry={() => { void refetch(); }} /></Shell>;

  const join = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const clean = nickname.trim();
    if (!clean || clean.length > 24) { setFormError('Choisis un pseudo de 1 à 24 caractères.'); return; }
    setFormError('');
    joinRoom.mutate({ roomCode, data: { nickname: clean } }, {
      onSuccess: (result) => {
        sessionStorage.setItem(playerKey(roomCode), result.playerToken);
        sessionStorage.setItem(nicknameKey(roomCode), clean);
        const joinedPlayer = [...(result.session.players ?? [])].reverse().find((player) => player.nickname === clean);
        if (joinedPlayer) {
          sessionStorage.setItem(playerIdKey(roomCode), joinedPlayer.id);
          setPlayerId(joinedPlayer.id);
        }
        setPlayerToken(result.playerToken);
        setNickname(clean);
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!playerToken) { setFormError('Rejoins la salle avant de proposer une réponse.'); return; }
    const cleanArtist = artist.trim();
    const cleanTitle = title.trim();
    if (!cleanArtist || !cleanTitle) { setFormError('Complète l’artiste et le titre.'); return; }
    setFormError('');
    sendAnswer.mutate({ roomCode, data: { playerToken, artist: cleanArtist, title: cleanTitle } }, {
      onSuccess: (result) => {
        setAnswerResult(result);
        setPlayerId(result.answer.playerId);
        sessionStorage.setItem(playerIdKey(roomCode), result.answer.playerId);
        const roundNumber = session.currentRound?.number ?? null;
        setSubmittedRound(roundNumber);
        if (roundNumber !== null) {
          sessionStorage.setItem(
            submissionKey(roomCode),
            JSON.stringify({ roundNumber, result }),
          );
        }
        setArtist('');
        setTitle('');
        void queryClient.invalidateQueries({ queryKey });
      },
      onError: (error) => setFormError(errorMessage(error)),
    });
  };
  const isLive = session.currentRound?.status === 'live';
  const didSubmit = Boolean(isLive && submittedRound === session.currentRound?.number && answerResult);
  const myAnswer = answerResult?.answer ?? session.currentRound?.answers?.find((answer) => answer.playerId === playerId);

  return <Shell>
    <Topbar />
    <main className="player-layout">
      <div className="player-top">
        <div className="eyebrow">Salle <span className="mono" style={{ color: '#e8bd4e' }}>{roomCode}</span></div>
        <Link href="/" className="top-note" style={{ textDecoration: 'none' }}>Accueil <ArrowRight size={12} /></Link>
      </div>
      <section className="surface player-card">
        <div className="eyebrow">Animé par {session.djName}</div>
        {!playerToken ? <>
          <h1>Entre dans<span> la partie.</span></h1>
          <p>Choisis un pseudo, garde ton téléphone près de toi. Le DJ s’occupe du son, toi de la mémoire.</p>
          <form className="player-form" onSubmit={join}>
            <label><span className="field-label">Ton pseudo</span><input className="field" value={nickname} onChange={(event) => setNickname(event.target.value)} maxLength={24} placeholder="Comment t’appelle-t-on ?" autoComplete="nickname" data-testid="input-player-nickname" /></label>
            {formError && <p className="form-error" role="alert" data-testid="status-player-error">{formError}</p>}
            <button className="gold-button wide" type="submit" disabled={joinRoom.isPending || session.status === 'ended'} data-testid="button-player-join">
              {joinRoom.isPending ? <LoaderCircle size={17} /> : <ArrowRight size={17} />} {joinRoom.isPending ? 'Entrée dans la salle…' : 'Rejoindre la partie'}
            </button>
            {session.status === 'ended' && <p className="tiny-note">Cette session est terminée, les nouvelles inscriptions sont fermées.</p>}
          </form>
        </> : <>
          <h1>Salut, <span>{nickname}.</span></h1>
          <div className="status-pill"><i className="status-dot" />{session.status === 'ended' ? 'Partie terminée' : isLive ? `Manche ${session.currentRound?.number} en cours` : 'En attente du DJ'}</div>
          {session.status === 'ended' ? <div className="confirmation">
            <div className="confirmation-mark"><Trophy size={25} /></div>
            <h2>Merci d’avoir joué.</h2>
            <p>La session est terminée. Voici le classement final.</p>
          </div> : isLive ? didSubmit ? <div className="confirmation" data-testid="status-answer-confirmation">
            <div className="confirmation-mark"><Check size={25} /></div>
            <h2>Réponse envoyée.</h2>
            <p>{answerResult?.message || 'C’est noté. Reste prêt pour le verdict du DJ.'}</p>
            <div className="result-line"><span>Artiste proposé</span><strong>{myAnswer?.artist}</strong></div>
            <div className="result-line"><span>Titre proposé</span><strong>{myAnswer?.title}</strong></div>
          </div> : <div style={{ marginTop: 25 }}>
            <div className="notice" style={{ marginBottom: 19 }}>Écoute le morceau diffusé par le DJ, puis envoie ta réponse. Les réponses restent privées jusqu’à la fin de la manche.</div>
            <form className="player-form" onSubmit={submit}>
              <div className="answer-fields">
                <label><span className="field-label">Artiste</span><input className="field" value={artist} onChange={(event) => setArtist(event.target.value)} maxLength={100} placeholder="Qui chante ?" data-testid="input-answer-artist" /></label>
                <label><span className="field-label">Titre du morceau</span><input className="field" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={100} placeholder="Quel est le titre ?" data-testid="input-answer-title" /></label>
              </div>
              {formError && <p className="form-error" role="alert" data-testid="status-player-error">{formError}</p>}
              <button className="gold-button wide" type="submit" disabled={sendAnswer.isPending} data-testid="button-submit-answer">
                {sendAnswer.isPending ? <LoaderCircle size={17} /> : <Send size={16} />} {sendAnswer.isPending ? 'Envoi…' : 'Envoyer ma réponse'}
              </button>
            </form>
          </div> : <div className="confirmation" data-testid="status-waiting">
            <div className="confirmation-mark"><Radio size={25} /></div>
            <h2>Garde l’oreille ouverte.</h2>
            <p>Le DJ prépare la prochaine manche. La page se met à jour automatiquement.</p>
            <div className="mono" style={{ color: 'var(--gold)', fontSize: 11, marginTop: 20 }}>EN SALLE · {session.players.length} JOUEURS</div>
          </div>}
          {session.leaderboard?.length > 0 && <section style={{ marginTop: 23 }}>
            <header className="surface-head" style={{ padding: '16px 0' }}><h2 className="surface-title">Classement en direct</h2><Trophy size={17} color="var(--gold)" /></header>
            <div className="rank-list">{session.leaderboard.map((entry) => <div className="rank-row" key={entry.playerId}>
              <span className="rank-num">{String(entry.rank).padStart(2, '0')}</span><span className="rank-name">{entry.nickname}</span><span className="rank-points">{entry.points} PTS</span>
            </div>)}</div>
          </section>}
          {session.currentRound?.status === 'ended' && <>
            <div className="result-highlight">Manche {session.currentRound.number} · verdict du DJ</div>
            {session.currentRound.artist && session.currentRound.title
              ? <div className="answer-table" style={{ marginTop: 10 }}>
                <div className="answer-row"><span>Artiste</span><strong>{session.currentRound.artist}</strong></div>
                <div className="answer-row"><span>Titre</span><strong>{session.currentRound.title}</strong></div>
              </div>
              : <p className="tiny-note">Le verdict n’est pas présent dans les données reçues.</p>}
            {session.currentRound.answers?.length > 0 && <div style={{ marginTop: 18 }}>
              <div className="field-label">Réponses visibles après la manche</div>
              {session.currentRound.answers.map((answer) => <div className="answer-row" key={answer.id} data-testid={`row-answer-${answer.id}`}>
                <div><strong>{answer.nickname}</strong><br /><span>{answer.artist} — {answer.title}</span></div>
                <strong style={{ color: answer.playerId === playerId ? 'var(--gold)' : '#aaa9ad' }}>{answer.points} pts</strong>
              </div>)}
              {myAnswer && <div className="notice" style={{ marginTop: 12 }}>Ta réponse : {myAnswer.correct ? 'correcte' : 'à côté'} · {myAnswer.points} point(s)</div>}
            </div>}
          </>}
        </>}
      </section>
      <p className="tiny-note" style={{ textAlign: 'center', marginTop: 19 }}>La musique est diffusée par le DJ dans son propre logiciel. Blind Test ne lit ni ne stocke de musique.</p>
    </main>
  </Shell>;
}

export { HomePage, HostPage, PlayerPage };
