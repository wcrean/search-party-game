import { QUESTIONS } from "./questions.js";
import {
  initializeFirebase,
  getCurrentUser,
  createRoom,
  joinRoom,
  subscribeToRoom,
  subscribeToPlayers,
  subscribeToAnswers,
  startGame,
  submitAnswer,
  revealRound,
  nextRound,
  resetGame,
  deleteRoom
} from "./firebase-service.js";

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const state = {
  roomCode: localStorage.getItem("searchPartyRoom") || "",
  room: null,
  players: [],
  answers: [],
  isHost: false,
  selectedChoice: null,
  unsubscribers: []
};

const screens = {
  loading: $("#screen-loading"),
  home: $("#screen-home"),
  create: $("#screen-create"),
  lobby: $("#screen-lobby"),
  question: $("#screen-question"),
  reveal: $("#screen-reveal"),
  finished: $("#screen-finished"),
  error: $("#screen-error")
};

function showScreen(name) {
  Object.entries(screens).forEach(([key, element]) => {
    element.classList.toggle("active", key === name);
  });
}

function setError(message, technical = "") {
  $("#error-message").textContent = message;
  $("#error-details").textContent = technical;
  showScreen("error");
}

function friendlyError(error) {
  const code = error?.code || "";
  if (code.includes("auth/operation-not-allowed")) {
    return "Anonymous sign-in is not enabled in Firebase Authentication.";
  }
  if (code.includes("permission-denied")) {
    return "Firestore denied access. Publish the included firestore.rules file.";
  }
  if (code.includes("network-request-failed")) {
    return "Firebase could not be reached. Check your internet connection.";
  }
  return error?.message || "An unexpected error occurred.";
}

function randomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function shuffledQuestionIds(count) {
  return [...QUESTIONS]
    .sort(() => Math.random() - 0.5)
    .slice(0, count)
    .map(question => question.id);
}

function currentQuestion() {
  if (!state.room) return null;
  const id = state.room.questionIds?.[state.room.roundIndex];
  return QUESTIONS.find(question => question.id === id) || null;
}

function saveRoom(code) {
  state.roomCode = code;
  localStorage.setItem("searchPartyRoom", code);
}

function leaveRoom() {
  state.unsubscribers.forEach(unsubscribe => unsubscribe?.());
  state.unsubscribers = [];
  state.roomCode = "";
  state.room = null;
  state.players = [];
  state.answers = [];
  state.selectedChoice = null;
  localStorage.removeItem("searchPartyRoom");
  $("#room-label").textContent = "";
  showScreen("home");
}

function subscribe(code) {
  state.unsubscribers.forEach(unsubscribe => unsubscribe?.());
  state.unsubscribers = [];

  const roomUnsub = subscribeToRoom(code, room => {
    if (!room) {
      leaveRoom();
      return;
    }

    state.room = room;
    state.isHost = room.hostId === getCurrentUser().uid;
    $("#room-label").textContent = `Room ${code}`;
    routeRoom();
  }, error => setError(friendlyError(error), error?.message));

  const playerUnsub = subscribeToPlayers(code, players => {
    state.players = players;
    renderPlayers();
    renderScoreboard();
  }, error => setError(friendlyError(error), error?.message));

  state.unsubscribers.push(roomUnsub, playerUnsub);
}

function routeRoom() {
  if (!state.room) return;

  const status = state.room.status;
  if (status === "lobby") {
    renderLobby();
    showScreen("lobby");
  } else if (status === "question") {
    renderQuestion();
    showScreen("question");
  } else if (status === "reveal") {
    renderReveal();
    showScreen("reveal");
  } else if (status === "finished") {
    renderFinished();
    showScreen("finished");
  }
}

function renderPlayers() {
  const html = state.players.map(player => `
    <div class="player-row">
      <span>${escapeHtml(player.name)}${player.isHost ? " 👑" : ""}</span>
      <strong>${player.score ?? 0}</strong>
    </div>
  `).join("");

  $("#player-list").innerHTML = html || '<p class="muted">No players yet.</p>';
  $("#player-count").textContent = String(state.players.length);
}

function renderLobby() {
  $("#room-code").textContent = state.roomCode;
  $("#host-lobby-controls").classList.toggle("hidden", !state.isHost);
  $("#lobby-status").textContent = state.isHost
    ? "Share the room code, then start when everyone has joined."
    : "Waiting for the host to start the game.";
}

function resetAnswerSubscription() {
  const answerUnsub = state.unsubscribers.pop();
  if (state.unsubscribers.length > 1) answerUnsub?.();

  const unsubscribe = subscribeToAnswers(
    state.roomCode,
    state.room.roundIndex,
    answers => {
      state.answers = answers;
      $("#answer-progress").textContent = `${answers.length} answered`;
      renderRevealVotes();
    },
    error => setError(friendlyError(error), error?.message)
  );
  state.unsubscribers.push(unsubscribe);
}

function renderQuestion() {
  const question = currentQuestion();
  if (!question) {
    setError("The question could not be loaded.");
    return;
  }

  state.selectedChoice = null;
  $("#round-progress").textContent =
    `Round ${state.room.roundIndex + 1} of ${state.room.roundCount}`;
  $("#question-stem").textContent = question.stem;
  $("#choice-list").innerHTML = question.choices.map((choice, index) => `
    <button class="choice-button" data-choice="${index}">
      <span class="choice-letter">${String.fromCharCode(65 + index)}</span>
      <span>${escapeHtml(choice)}</span>
    </button>
  `).join("");

  $("#host-question-controls").classList.toggle("hidden", !state.isHost);
  $("#submitted-panel").classList.add("hidden");
  resetAnswerSubscription();
}

function renderReveal() {
  const question = currentQuestion();
  if (!question) return;

  $("#reveal-answer").textContent = question.choices[question.correctIndex];
  $("#reveal-note").textContent = question.note;
  $("#host-reveal-controls").classList.toggle("hidden", !state.isHost);
  $("#next-round-button").textContent =
    state.room.roundIndex + 1 >= state.room.roundCount ? "Show Final Results" : "Next Round";
  renderRevealVotes();
  renderScoreboard();
}

function renderRevealVotes() {
  const container = $("#vote-results");
  if (!state.room || !container) return;
  const question = currentQuestion();
  if (!question) return;

  const counts = question.choices.map((_, index) =>
    state.answers.filter(answer => answer.choiceIndex === index).length
  );

  container.innerHTML = question.choices.map((choice, index) => `
    <div class="result-row ${index === question.correctIndex ? "correct" : ""}">
      <span>${escapeHtml(choice)}</span>
      <strong>${counts[index]}</strong>
    </div>
  `).join("");
}

function renderScoreboard() {
  const html = state.players.map((player, index) => `
    <div class="score-row">
      <span><strong>${index + 1}.</strong> ${escapeHtml(player.name)}</span>
      <strong>${player.score ?? 0}</strong>
    </div>
  `).join("");

  $("#scoreboard").innerHTML = html;
  $("#final-scoreboard").innerHTML = html;
}

function renderFinished() {
  renderScoreboard();
  const winner = state.players[0];
  $("#winner-text").textContent = winner
    ? `${winner.name} wins with ${winner.score ?? 0} points!`
    : "Game over!";
  $("#host-final-controls").classList.toggle("hidden", !state.isHost);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[character]);
}

async function restoreSavedRoom() {
  if (!state.roomCode) {
    showScreen("home");
    return;
  }
  subscribe(state.roomCode);
}

$("#show-create-button").addEventListener("click", () => showScreen("create"));
$("#show-join-button").addEventListener("click", () => {
  $("#join-card").classList.toggle("hidden");
});
$("#back-home-button").addEventListener("click", () => showScreen("home"));
$("#retry-button").addEventListener("click", () => location.reload());
$("#leave-game-button").addEventListener("click", leaveRoom);

$("#create-form").addEventListener("submit", async event => {
  event.preventDefault();
  const hostName = $("#host-name").value.trim();
  const roundCount = Number($("#round-count").value);
  const button = event.submitter;
  button.disabled = true;

  try {
    let code;
    let attempts = 0;
    while (attempts < 5) {
      code = randomCode();
      try {
        await createRoom({
          code,
          hostName,
          roundCount,
          questionIds: shuffledQuestionIds(roundCount)
        });
        break;
      } catch (error) {
        if (!error.message.includes("already in use")) throw error;
      }
      attempts += 1;
    }

    if (!code) throw new Error("Could not create a unique room code.");
    saveRoom(code);
    subscribe(code);
  } catch (error) {
    setError(friendlyError(error), error?.message);
  } finally {
    button.disabled = false;
  }
});

$("#join-form").addEventListener("submit", async event => {
  event.preventDefault();
  const playerName = $("#join-name").value.trim();
  const code = $("#join-code").value.trim().toUpperCase();
  const button = event.submitter;
  button.disabled = true;

  try {
    await joinRoom({ code, playerName });
    saveRoom(code);
    subscribe(code);
  } catch (error) {
    $("#home-error").textContent = friendlyError(error);
  } finally {
    button.disabled = false;
  }
});

$("#share-room-button").addEventListener("click", async () => {
  const url = `${location.origin}${location.pathname}?room=${state.roomCode}`;
  try {
    await navigator.share({ title: "Join Search Party", text: `Join room ${state.roomCode}`, url });
  } catch {
    await navigator.clipboard.writeText(`${state.roomCode} — ${url}`);
    $("#lobby-status").textContent = "Invite copied to clipboard.";
  }
});

$("#start-game-button").addEventListener("click", () =>
  startGame(state.roomCode).catch(error => setError(friendlyError(error), error?.message))
);

$("#choice-list").addEventListener("click", async event => {
  const button = event.target.closest("[data-choice]");
  if (!button) return;

  const choiceIndex = Number(button.dataset.choice);
  state.selectedChoice = choiceIndex;
  $$(".choice-button").forEach(choice =>
    choice.classList.toggle("selected", Number(choice.dataset.choice) === choiceIndex)
  );

  try {
    await submitAnswer(state.roomCode, state.room.roundIndex, choiceIndex);
    $("#submitted-panel").classList.remove("hidden");
  } catch (error) {
    setError(friendlyError(error), error?.message);
  }
});

$("#reveal-button").addEventListener("click", () => {
  const question = currentQuestion();
  if (!question) return;
  revealRound(state.roomCode, state.room.roundIndex, question.correctIndex)
    .catch(error => setError(friendlyError(error), error?.message));
});

$("#next-round-button").addEventListener("click", () =>
  nextRound(state.roomCode, state.room.roundIndex, state.room.roundCount)
    .catch(error => setError(friendlyError(error), error?.message))
);

$("#play-again-button").addEventListener("click", () =>
  resetGame(state.roomCode).catch(error => setError(friendlyError(error), error?.message))
);

async function endRoom() {
  try {
    await deleteRoom(state.roomCode);
    leaveRoom();
  } catch (error) {
    setError(friendlyError(error), error?.message);
  }
}
$("#delete-room-button").addEventListener("click", endRoom);
$("#finish-room-button").addEventListener("click", endRoom);

window.addEventListener("online", () => $("#offline-banner").classList.add("hidden"));
window.addEventListener("offline", () => $("#offline-banner").classList.remove("hidden"));

(async function start() {
  try {
    $("#loading-text").textContent = "Signing in anonymously…";
    await initializeFirebase();

    const roomFromUrl = new URLSearchParams(location.search).get("room");
    if (roomFromUrl && !state.roomCode) {
      $("#join-code").value = roomFromUrl.toUpperCase();
      $("#join-card").classList.remove("hidden");
    }

    $("#loading-text").textContent = "Ready.";
    await restoreSavedRoom();
  } catch (error) {
    console.error("Search Party startup failed:", error);
    setError(friendlyError(error), `${error?.code || ""}\n${error?.message || error}`);
  }
})();
