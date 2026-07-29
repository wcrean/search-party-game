// Paste the Firebase configuration object from:
// Firebase Console → Project settings → General → Your apps → SDK setup and configuration
//
// Keep the export statement exactly as shown.

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyD5f86Wz10WUaqrISWhe-QH25pvVxhCuhk",
  authDomain: "search-party-game.firebaseapp.com",
  projectId: "search-party-game",
  storageBucket: "search-party-game.firebasestorage.app",
  messagingSenderId: "892714848487",
  appId: "1:892714848487:web:c98d84938c76675d5e5242"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);