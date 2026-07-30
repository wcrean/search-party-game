import { firebaseConfig } from "./firebase-config.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js";
import {
  getAuth,
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
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
  increment
} from "https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js";

let auth;
let db;
let currentUser;

export async function initializeFirebase() {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  await setPersistence(auth, browserLocalPersistence);

  if (auth.currentUser) {
    currentUser = auth.currentUser;
  } else {
    const credential = await signInAnonymously(auth);
    currentUser = credential.user;
  }

  return { user: currentUser };
}

export function getCurrentUser() {
  if (!currentUser) {
    throw new Error("Firebase authentication has not completed.");
  }
  return currentUser;
}

export async function createRoom({ code, hostName, roundCount, questionIds }) {
  const user = getCurrentUser();
  const roomRef = doc(db, "rooms", code);
  const existing = await getDoc(roomRef);

  if (existing.exists()) {
    throw new Error("That room code is already in use. Please try again.");
  }

  await setDoc(roomRef, {
    code,
    hostId: user.uid,
    status: "lobby",
    roundCount,
    roundIndex: 0,
    questionIds,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  await setDoc(doc(db, "rooms", code, "players", user.uid), {
    name: hostName,
    score: 0,
    isHost: true,
    joinedAt: serverTimestamp()
  });
}

export async function joinRoom({ code, playerName }) {
  const user = getCurrentUser();
  const roomRef = doc(db, "rooms", code);
  const roomSnap = await getDoc(roomRef);

  if (!roomSnap.exists()) {
    throw new Error("Room not found. Check the code and try again.");
  }

  if (roomSnap.data().status !== "lobby") {
    throw new Error("That game has already started.");
  }

  await setDoc(doc(db, "rooms", code, "players", user.uid), {
    name: playerName,
    score: 0,
    isHost: roomSnap.data().hostId === user.uid,
    joinedAt: serverTimestamp()
  }, { merge: true });
}

export function subscribeToRoom(code, onRoom, onError) {
  return onSnapshot(doc(db, "rooms", code), (snapshot) => {
    onRoom(snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null);
  }, onError);
}

export function subscribeToPlayers(code, onPlayers, onError) {
  return onSnapshot(collection(db, "rooms", code, "players"), (snapshot) => {
    const players = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
    players.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || a.name.localeCompare(b.name));
    onPlayers(players);
  }, onError);
}

export function subscribeToAnswers(code, roundIndex, onAnswers, onError) {
  return onSnapshot(collection(db, "rooms", code, "rounds", String(roundIndex), "answers"), (snapshot) => {
    onAnswers(snapshot.docs.map(item => ({ id: item.id, ...item.data() })));
  }, onError);
}

export async function startGame(code) {
  await updateDoc(doc(db, "rooms", code), {
    status: "question",
    roundIndex: 0,
    updatedAt: serverTimestamp()
  });
}

export async function submitAnswer(code, roundIndex, choiceIndex) {
  const user = getCurrentUser();
  await setDoc(
    doc(db, "rooms", code, "rounds", String(roundIndex), "answers", user.uid),
    { choiceIndex, submittedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function revealRound(code, roundIndex, correctIndex) {
  const answersSnap = await getDocs(
    collection(db, "rooms", code, "rounds", String(roundIndex), "answers")
  );

  const batch = writeBatch(db);

  answersSnap.forEach(answerDoc => {
    if (answerDoc.data().choiceIndex === correctIndex) {
      batch.update(doc(db, "rooms", code, "players", answerDoc.id), {
        score: increment(3)
      });
    }
  });

  batch.update(doc(db, "rooms", code), {
    status: "reveal",
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export async function nextRound(code, currentIndex, roundCount) {
  const nextIndex = currentIndex + 1;
  await updateDoc(doc(db, "rooms", code), {
    roundIndex: nextIndex,
    status: nextIndex >= roundCount ? "finished" : "question",
    updatedAt: serverTimestamp()
  });
}

export async function resetGame(code) {
  const roomRef = doc(db, "rooms", code);
  const roomSnap = await getDoc(roomRef);
  if (!roomSnap.exists()) return;

  const playersSnap = await getDocs(collection(db, "rooms", code, "players"));
  const batch = writeBatch(db);

  playersSnap.forEach(playerDoc => {
    batch.update(playerDoc.ref, { score: 0 });
  });

  batch.update(roomRef, {
    status: "lobby",
    roundIndex: 0,
    updatedAt: serverTimestamp()
  });

  await batch.commit();
}

export async function deleteRoom(code) {
  const playersSnap = await getDocs(collection(db, "rooms", code, "players"));
  const batch = writeBatch(db);
  playersSnap.forEach(playerDoc => batch.delete(playerDoc.ref));
  batch.delete(doc(db, "rooms", code));
  await batch.commit();
}
