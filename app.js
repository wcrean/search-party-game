import { firebaseConfig } from "./firebase-config.js";
import { QUESTIONS } from "./questions.js";

// Browser-safe Firebase imports for GitHub Pages.
// These are full HTTPS URLs, so no npm, Vite, Webpack, or build step is required.
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
  setPersistence,
  browserLocalPersistence
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  getDocs,
  increment
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";


window.addEventListener("error", (event) => {
  console.error("Unhandled page error:", event.error || event.message);
});

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

const $ = (id) => document.getElementById(id);
const screens = [...document.querySelectorAll(".screen")];

const ui = {
  roomLabel: $("room-label"),
  homeButton: $("home-button"),
  connectionDot: $("connection-dot"),
  offlineBanner: $("offline-banner"),
  loadingText: $("loading-text"),
  startupDetails: $("startup-details"),

  createGameButton: $("create-game-button"),
  showJoinButton: $("show-join-button"),
  joinForm: $("join-form"),
  joinName: $("join-name"),
  joinCode: $("join-code"),
  homeError: $("home-error"),

  createForm: $("create-form"),
  hostName: $("host-name"),
  roundCount: $("round-count"),
  createError: $("create-error"),

  roomCode: $("room-code"),
  shareRoomButton: $("share-room-button"),
  playerCount: $("player-count"),
  playerList: $("player-list"),
  hostLobbyControls: $("host-lobby-controls"),
  startGameButton: $("start-game-button"),
  deleteRoomButton: $("delete-room-button"),
  lobbyStatus: $("lobby-status"),
  lobbyError: $("lobby-error"),

  roundProgress: $("round-progress"),
  answerProgress: $("answer-progress"),
  questionStem: $("question-stem"),
  choiceList: $("choice-list"),
  submittedPanel: $("submitted-panel"),
  hostQuestionControls: $("host-question-controls"),
  revealButton: $("reveal-button"),
  questionError: $("question-error"),

  revealAnswer: $("reveal-answer"),
  revealNote: $("reveal-note"),
  voteResults: $("vote-results"),
  scoreboard: $("scoreboard"),
  hostRevealControls: $("host-reveal-controls"),
  nextRoundButton: $("next-round-button"),
  revealStatus: $("reveal-status"),

  winnerText: $("winner-text"),
  finalScoreboard: $("final-scoreboard"),
  hostFinalControls: $("host-final-controls"),
  playAgainButton: $("play-again-button"),
  finishRoomButton: $("finish-room-button"),
  leaveGameButton: $("leave-game-button")
};

const state = {
  app: null,
  auth: null,
  db: null,
  user: null,
  roomCode: localStorage.getItem("searchPartyRoom") || "",
  nickname: localStorage.getItem("searchPartyName") || "",
  game: null,
  players: [],
  answers: [],
  isHost: false,
  selectedChoice: null,
  unsubs: [],
  restoring: true
};

function showScreen(name) {
  screens.forEach((screen) => screen.classList.toggle("active", screen.id === `screen-${name}`));
}

function setError(element, message = "") {
  element.textContent = message;
}

function normalizeRoomCode(value) {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 5);
}

function randomCode(length = 5) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("");
}

function shuffledQuestionIds(count) {
  const ids = QUESTIONS.map((q) => q.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids.slice(0, Math.min(count, ids.length));
}

function currentQuestion() {
  if (!state.game?.questionIds?.length) return null;
  const id = state.game.questionIds[state.game.currentRound];
  return QUESTIONS.find((q) => q.id === id) || null;
}

function clearSubscriptions() {
  state.unsubs.forEach((unsub) => {
    try { unsub(); } catch (_) {}
  });
  state.unsubs = [];
}

function resetLocalRoom() {
  clearSubscriptions();
  state.roomCode = "";
  state.game = null;
  state.players = [];
  state.answers = [];
  state.isHost = false;
  state.selectedChoice = null;
  localStorage.removeItem("searchPartyRoom");
  ui.roomLabel.textContent = "";
  ui.homeButton.classList.add("hidden");
}

async function initialize() {
  try {
    const missingConfig = Object.values(firebaseConfig).some(
      (value) => !value || String(value).includes("PASTE_")
    );

    if (missingConfig) {
      ui.loadingText.textContent = "Firebase setup is incomplete.";
      ui.startupDetails.textContent =
        "Open firebase-config.js and replace every PASTE_... value with your Firebase web app configuration.";
      ui.startupDetails.classList.remove("hidden");
      return;
    }

    state.app = initializeApp(firebaseConfig);
    state.auth = getAuth(state.app);
    await setPersistence(state.auth, browserLocalPersistence);

    state.db = getFirestore(state.app);

    onAuthStateChanged(state.auth, async (user) => {
      if (!user) {
        await signInAnonymously(state.auth);
        return;
      }

      state.user = user;
      if (state.roomCode) {
        await restoreRoom();
      } else {
        state.restoring = false;
        showScreen("home");
      }
    });
  } catch (error) {
    console.error("Search Party startup failed:", error);
    ui.loadingText.textContent = "The game could not start.";
    ui.startupDetails.textContent = `${friendlyError(error)}\n\nTechnical detail: ${error?.message || error}`;
    ui.startupDetails.classList.remove("hidden");
  }
}

async function restoreRoom() {
  try {
    const gameRef = doc(state.db, "games", state.roomCode);
    const playerRef = doc(state.db, "games", state.roomCode, "players", state.user.uid);
    const [gameSnap, playerSnap] = await Promise.all([getDoc(gameRef), getDoc(playerRef)]);

    if (!gameSnap.exists() || !playerSnap.exists()) {
      resetLocalRoom();
      showScreen("home");
      return;
    }

    subscribeToRoom(state.roomCode);
  } catch (error) {
    console.error(error);
    ui.loadingText.textContent = "Could not restore the room. Check your connection.";
  } finally {
    state.restoring = false;
  }
}

function subscribeToRoom(code) {
  clearSubscriptions();
  state.roomCode = code;
  localStorage.setItem("searchPartyRoom", code);
  ui.roomLabel.textContent = `Room ${code}`;
  ui.homeButton.classList.remove("hidden");

  const gameRef = doc(state.db, "games", code);
  const playersRef = collection(state.db, "games", code, "players");

  state.unsubs.push(onSnapshot(gameRef, (snapshot) => {
    if (!snapshot.exists()) {
      resetLocalRoom();
      showScreen("home");
      setError(ui.homeError, "That room has ended.");
      return;
    }

    state.game = { id: snapshot.id, ...snapshot.data() };
    state.isHost = state.game.hostId === state.user.uid;
    renderGame();
    subscribeToAnswersForCurrentQuestion();
  }, handleRoomListenerError));

  state.unsubs.push(onSnapshot(playersRef, (snapshot) => {
    state.players = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    renderPlayers();
    renderScoreboards();
    updateAnswerProgress();
  }, handleRoomListenerError));
}

let answerUnsub = null;
let subscribedQuestionKey = "";

function subscribeToAnswersForCurrentQuestion() {
  const question = currentQuestion();
  if (!question || !state.roomCode) return;

  const key = `${state.roomCode}:${question.id}`;
  if (key === subscribedQuestionKey) return;

  if (answerUnsub) answerUnsub();
  subscribedQuestionKey = key;

  const answersRef = collection(state.db, "games", state.roomCode, "rounds", question.id, "answers");
  answerUnsub = onSnapshot(answersRef, (snapshot) => {
    state.answers = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
    const mine = state.answers.find((a) => a.playerId === state.user.uid);
    state.selectedChoice = mine?.choiceIndex ?? null;
    renderChoices();
    updateAnswerProgress();
    renderVoteResults();
  }, handleRoomListenerError);

  state.unsubs.push(() => {
    if (answerUnsub) answerUnsub();
    answerUnsub = null;
    subscribedQuestionKey = "";
  });
}

function handleRoomListenerError(error) {
  console.error(error);
  const message = friendlyError(error);
  setError(ui.lobbyError, message);
  setError(ui.questionError, message);
}

function renderGame() {
  if (!state.game) return;

  const status = state.game.status;
  if (status === "lobby") {
    showScreen("lobby");
    renderLobby();
  } else if (status === "question") {
    showScreen("question");
    renderQuestion();
  } else if (status === "reveal") {
    showScreen("reveal");
    renderReveal();
  } else if (status === "final") {
    showScreen("final");
    renderFinal();
  }
}

function renderLobby() {
  ui.roomCode.textContent = state.roomCode;
  ui.hostLobbyControls.classList.toggle("hidden", !state.isHost);
  ui.lobbyStatus.textContent = state.isHost
    ? "Start whenever everyone has joined."
    : "Waiting for the host to start…";
  ui.startGameButton.disabled = state.players.length < 2;
}

function renderPlayers() {
  ui.playerCount.textContent = state.players.length;
  const sorted = [...state.players].sort((a, b) => {
    if (a.isHost !== b.isHost) return a.isHost ? -1 : 1;
    return (a.name || "").localeCompare(b.name || "");
  });

  ui.playerList.innerHTML = sorted.map((player) => `
    <div class="player-row ${player.id === state.user?.uid ? "me" : ""}">
      <div>
        <strong>${escapeHtml(player.name || "Player")}</strong>
        ${player.isHost ? '<span class="host-tag">HOST</span>' : ""}
      </div>
      <span>${player.score || 0} pts</span>
    </div>
  `).join("");
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) return;

  ui.roundProgress.textContent = `Round ${state.game.currentRound + 1} of ${state.game.questionIds.length}`;
  ui.questionStem.textContent = question.stem;
  ui.hostQuestionControls.classList.toggle("hidden", !state.isHost);
  renderChoices();
  updateAnswerProgress();
}

function renderChoices() {
  const question = currentQuestion();
  if (!question) return;

  ui.choiceList.innerHTML = question.choices.map((choice, index) => `
    <button class="choice-button ${state.selectedChoice === index ? "selected" : ""}"
            data-choice-index="${index}"
            ${state.game?.status !== "question" ? "disabled" : ""}>
      ${String.fromCharCode(65 + index)}. ${escapeHtml(choice)}
    </button>
  `).join("");

  ui.choiceList.querySelectorAll(".choice-button").forEach((button) => {
    button.addEventListener("click", () => submitAnswer(Number(button.dataset.choiceIndex)));
  });

  ui.submittedPanel.classList.toggle("hidden", state.selectedChoice === null);
}

function updateAnswerProgress() {
  if (!state.game || state.game.status !== "question") return;
  const activePlayers = state.players.length;
  const submitted = new Set(state.answers.map((a) => a.playerId)).size;
  ui.answerProgress.textContent = `${submitted} of ${activePlayers} answered`;
  ui.revealButton.disabled = submitted === 0;
}

function renderReveal() {
  const question = currentQuestion();
  if (!question) return;

  ui.revealAnswer.textContent = question.choices[question.correctIndex];
  ui.revealNote.textContent = question.sourceNote || "";
  ui.hostRevealControls.classList.toggle("hidden", !state.isHost);
  ui.revealStatus.textContent = state.isHost ? "Continue when the group is ready." : "Waiting for the host…";

  const lastRound = state.game.currentRound >= state.game.questionIds.length - 1;
  ui.nextRoundButton.textContent = lastRound ? "Show Final Results" : "Next Round";

  renderVoteResults();
  renderScoreboards();
}

function renderVoteResults() {
  const question = currentQuestion();
  if (!question || state.game?.status !== "reveal") return;

  const counts = question.choices.map((_, index) =>
    state.answers.filter((a) => a.choiceIndex === index).length
  );
  const max = Math.max(1, ...counts);

  ui.voteResults.innerHTML = question.choices.map((choice, index) => `
    <div class="vote-row ${index === question.correctIndex ? "correct" : ""}">
      <strong>${escapeHtml(choice)}${index === question.correctIndex ? " ✓" : ""}</strong>
      <span>${counts[index]} vote${counts[index] === 1 ? "" : "s"}</span>
      <div class="vote-meter"><span style="width:${(counts[index] / max) * 100}%"></span></div>
    </div>
  `).join("");
}

function renderScoreboards() {
  const sorted = [...state.players].sort((a, b) => {
    const scoreDiff = (b.score || 0) - (a.score || 0);
    return scoreDiff || (a.name || "").localeCompare(b.name || "");
  });

  const rows = sorted.map((player, index) => `
    <div class="score-row ${player.id === state.user?.uid ? "me" : ""}">
      <div>
        <span class="score-rank">${index + 1}</span>
        <strong>${escapeHtml(player.name || "Player")}</strong>
      </div>
      <span class="score-points">${player.score || 0} pts</span>
    </div>
  `).join("");

  ui.scoreboard.innerHTML = rows;
  ui.finalScoreboard.innerHTML = rows;
}

function renderFinal() {
  ui.hostFinalControls.classList.toggle("hidden", !state.isHost);
  renderScoreboards();

  const sorted = [...state.players].sort((a, b) => (b.score || 0) - (a.score || 0));
  if (!sorted.length) {
    ui.winnerText.textContent = "Game over!";
    return;
  }

  const topScore = sorted[0].score || 0;
  const winners = sorted.filter((p) => (p.score || 0) === topScore);
  ui.winnerText.textContent = winners.length === 1
    ? `${winners[0].name} wins!`
    : `${winners.map((w) => w.name).join(" & ")} tie!`;
}

async function createRoom(name, roundCount) {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Enter a nickname.");

  let code = "";
  let gameRef = null;

  for (let attempt = 0; attempt < 8; attempt++) {
    code = randomCode();
    gameRef = doc(state.db, "games", code);
    const snap = await getDoc(gameRef);
    if (!snap.exists()) break;
    code = "";
  }

  if (!code || !gameRef) throw new Error("Could not generate a room code. Try again.");

  const questionIds = shuffledQuestionIds(roundCount);
  const batch = writeBatch(state.db);

  batch.set(gameRef, {
    hostId: state.user.uid,
    status: "lobby",
    currentRound: 0,
    questionIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  batch.set(doc(state.db, "games", code, "players", state.user.uid), {
    name: cleanName,
    score: 0,
    isHost: true,
    joinedAt: serverTimestamp()
  });

  await batch.commit();

  state.nickname = cleanName;
  localStorage.setItem("searchPartyName", cleanName);
  subscribeToRoom(code);
}

async function joinRoom(code, name) {
  const cleanCode = normalizeRoomCode(code);
  const cleanName = name.trim();

  if (cleanCode.length !== 5) throw new Error("Enter the five-character room code.");
  if (!cleanName) throw new Error("Enter a nickname.");

  const gameRef = doc(state.db, "games", cleanCode);
  const gameSnap = await getDoc(gameRef);

  if (!gameSnap.exists()) throw new Error("Room not found. Check the code.");
  if (gameSnap.data().status !== "lobby") throw new Error("That game has already started.");

  await setDoc(doc(state.db, "games", cleanCode, "players", state.user.uid), {
    name: cleanName,
    score: 0,
    isHost: gameSnap.data().hostId === state.user.uid,
    joinedAt: serverTimestamp()
  }, { merge: true });

  state.nickname = cleanName;
  localStorage.setItem("searchPartyName", cleanName);
  subscribeToRoom(cleanCode);
}

async function submitAnswer(choiceIndex) {
  if (!state.game || state.game.status !== "question") return;
  const question = currentQuestion();
  if (!question) return;

  try {
    state.selectedChoice = choiceIndex;
    renderChoices();

    const answerRef = doc(
      state.db,
      "games",
      state.roomCode,
      "rounds",
      question.id,
      "answers",
      state.user.uid
    );

    await setDoc(answerRef, {
      playerId: state.user.uid,
      choiceIndex,
      submittedAt: serverTimestamp()
    });
  } catch (error) {
    console.error(error);
    setError(ui.questionError, friendlyError(error));
  }
}

async function startGame() {
  if (!state.isHost) return;
  await updateDoc(doc(state.db, "games", state.roomCode), {
    status: "question",
    currentRound: 0,
    updatedAt: serverTimestamp()
  });
}

async function revealAnswer() {
  if (!state.isHost) return;
  const question = currentQuestion();
  if (!question) return;

  ui.revealButton.disabled = true;
  setError(ui.questionError);

  try {
    const gameRef = doc(state.db, "games", state.roomCode);
    const playersRef = collection(state.db, "games", state.roomCode, "players");
    const answersRef = collection(state.db, "games", state.roomCode, "rounds", question.id, "answers");
    const [playersSnap, answersSnap] = await Promise.all([getDocs(playersRef), getDocs(answersRef)]);

    const correctPlayerIds = new Set(
      answersSnap.docs
        .map((d) => d.data())
        .filter((answer) => answer.choiceIndex === question.correctIndex)
        .map((answer) => answer.playerId)
    );

    const batch = writeBatch(state.db);
    playersSnap.docs.forEach((playerDoc) => {
      if (correctPlayerIds.has(playerDoc.id)) {
        batch.update(playerDoc.ref, { score: increment(3) });
      }
    });

    batch.update(gameRef, {
      status: "reveal",
      updatedAt: serverTimestamp()
    });

    await batch.commit();
  } catch (error) {
    console.error(error);
    setError(ui.questionError, friendlyError(error));
    ui.revealButton.disabled = false;
  }
}

async function nextRound() {
  if (!state.isHost) return;
  const lastRound = state.game.currentRound >= state.game.questionIds.length - 1;

  await updateDoc(doc(state.db, "games", state.roomCode), {
    status: lastRound ? "final" : "question",
    currentRound: lastRound ? state.game.currentRound : state.game.currentRound + 1,
    updatedAt: serverTimestamp()
  });
}

async function playAgain() {
  if (!state.isHost) return;

  const playersRef = collection(state.db, "games", state.roomCode, "players");
  const playersSnap = await getDocs(playersRef);
  const batch = writeBatch(state.db);

  playersSnap.docs.forEach((playerDoc) => batch.update(playerDoc.ref, { score: 0 }));

  batch.update(doc(state.db, "games", state.roomCode), {
    status: "lobby",
    currentRound: 0,
    questionIds: shuffledQuestionIds(state.game.questionIds.length),
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

async function endRoom() {
  if (!state.isHost) return;
  const confirmed = confirm("End this room for everyone?");
  if (!confirmed) return;

  await deleteDoc(doc(state.db, "games", state.roomCode));
  resetLocalRoom();
  showScreen("home");
}

function leaveGame() {
  resetLocalRoom();
  showScreen("home");
}

async function shareRoom() {
  const url = `${location.origin}${location.pathname}?room=${state.roomCode}`;
  const text = `Join my Search Party game. Room code: ${state.roomCode}`;

  try {
    if (navigator.share) {
      await navigator.share({ title: "Search Party", text, url });
    } else {
      await navigator.clipboard.writeText(`${text}\n${url}`);
      ui.shareRoomButton.textContent = "Invite copied!";
      setTimeout(() => { ui.shareRoomButton.textContent = "Share Invite"; }, 1600);
    }
  } catch (error) {
    if (error.name !== "AbortError") console.error(error);
  }
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("permission-denied")) return "Firebase blocked this action. Publish the included Firestore rules.";
  if (code.includes("network-request-failed") || code.includes("unavailable")) return "Connection lost. Try again when service returns.";
  if (code.includes("operation-not-allowed")) return "Enable Anonymous sign-in in Firebase Authentication.";
  return error?.message || "Something went wrong. Please try again.";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

ui.createGameButton.addEventListener("click", () => {
  ui.hostName.value = state.nickname;
  showScreen("create");
});

ui.showJoinButton.addEventListener("click", () => {
  ui.joinForm.classList.remove("hidden");
  ui.joinName.value = state.nickname;
  ui.joinName.focus();
});

ui.joinCode.addEventListener("input", () => {
  ui.joinCode.value = normalizeRoomCode(ui.joinCode.value);
});

ui.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError(ui.createError);
  showScreen("loading");
  ui.loadingText.textContent = "Creating room…";

  try {
    await createRoom(ui.hostName.value, Number(ui.roundCount.value));
  } catch (error) {
    console.error(error);
    showScreen("create");
    setError(ui.createError, friendlyError(error));
  }
});

ui.joinForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setError(ui.homeError);
  showScreen("loading");
  ui.loadingText.textContent = "Joining room…";

  try {
    await joinRoom(ui.joinCode.value, ui.joinName.value);
  } catch (error) {
    console.error(error);
    showScreen("home");
    ui.joinForm.classList.remove("hidden");
    setError(ui.homeError, friendlyError(error));
  }
});

ui.startGameButton.addEventListener("click", () => startGame().catch((e) => setError(ui.lobbyError, friendlyError(e))));
ui.revealButton.addEventListener("click", () => revealAnswer());
ui.nextRoundButton.addEventListener("click", () => nextRound().catch((e) => setError(ui.questionError, friendlyError(e))));
ui.playAgainButton.addEventListener("click", () => playAgain().catch(console.error));
ui.deleteRoomButton.addEventListener("click", () => endRoom().catch(console.error));
ui.finishRoomButton.addEventListener("click", () => endRoom().catch(console.error));
ui.leaveGameButton.addEventListener("click", leaveGame);
ui.shareRoomButton.addEventListener("click", shareRoom);
ui.homeButton.addEventListener("click", () => {
  if (state.roomCode) {
    const leave = confirm("Leave this game on this phone?");
    if (!leave) return;
  }
  leaveGame();
});

window.addEventListener("online", () => {
  ui.offlineBanner.classList.add("hidden");
  ui.connectionDot.classList.add("online");
  ui.connectionDot.classList.remove("offline");
});

window.addEventListener("offline", () => {
  ui.offlineBanner.classList.remove("hidden");
  ui.connectionDot.classList.add("offline");
  ui.connectionDot.classList.remove("online");
});

const urlRoom = normalizeRoomCode(new URLSearchParams(location.search).get("room") || "");
if (urlRoom) {
  ui.joinForm.classList.remove("hidden");
  ui.joinCode.value = urlRoom;
}

ui.connectionDot.classList.add(navigator.onLine ? "online" : "offline");
if (!navigator.onLine) ui.offlineBanner.classList.remove("hidden");

initialize();
