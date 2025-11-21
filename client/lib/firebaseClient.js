// lib/firebaseClient.js

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDR5ce0XNnsEPw2rX3v6CMSUnUlLO8PZc8',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'lead-management-role.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lead-management-role',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'lead-management-role.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '376075494836',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:376075494836:web:8698a53b7221e201c53ee1',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-FSTYLK69VN',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

// -----------------------------
// CONNECT TO EMULATORS
// -----------------------------
if (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true') {
  console.log('🔥 Connecting Firebase to local emulators...');

  try {
    connectFirestoreEmulator(db, '127.0.0.1', 8080);
    console.log('✔ Firestore emulator connected');
  } catch (e) {
    console.error('❌ Firestore emulator connection failed:', e);
  }

  try {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    console.log('✔ Auth emulator connected');
  } catch (e) {
    console.error('❌ Auth emulator connection failed:', e);
  }
}

export default app;
