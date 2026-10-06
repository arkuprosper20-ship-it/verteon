// Firebase configuration for the Verteon website.
//
// Loaded as an ES module from the Firebase CDN — no build step, no bundler.
// The web API key below is a client-side Firebase key. It is designed to be
// visible in the browser and is not a secret; access is controlled by Firebase
// Security Rules, not by hiding this value.

import { initializeApp, getApps, getApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
} from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyABAXYh1zoSl2f0arMs7rGxQ5FzWpQMWlo',
  authDomain: 'planning-with-ai-5ebb1.firebaseapp.com',
  projectId: 'planning-with-ai-5ebb1',
  storageBucket: 'planning-with-ai-5ebb1.firebasestorage.app',
  messagingSenderId: '532218813806',
  appId: '1:532218813806:web:2e8f116c4235830aa0b57f'
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Remember signed-in users across browser sessions.
setPersistence(auth, browserLocalPersistence).catch(() => {
  // Falling back to session persistence is a safety net only.
  console.warn('Auth persistence not available; sessions will not be remembered.');
});
const googleProvider = new GoogleAuthProvider();

/** Human-readable message for a Firebase Auth error code. */
export function describeAuthError(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account already exists for that email. Sign in instead.';
    case 'auth/invalid-email':
      return 'That email address is not valid.';
    case 'auth/weak-password':
      return 'Password is too weak. Use at least 8 characters.';
    case 'auth/operation-not-allowed':
      return 'Email and password sign-in is not enabled for this project yet.';
    case 'auth/network-request-failed':
      return 'Network error. Check your connection and try again.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a moment and try again.';
    default:
      return code || 'Something went wrong. Please try again.';
  }
}

export {
  app,
  auth,
  googleProvider,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  sendPasswordResetEmail,
  updateProfile,
  onAuthStateChanged,
  signOut,
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence
};
