// lib/firebaseClient.js
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

// Prefer environment variables (set these in .env.local for local dev)
// NEXT_PUBLIC_ prefix is required for values used in client-side code.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDR5ce0XNnsEPw2rX3v6CMSUnUlLO8PZc8',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'lead-management-role.firebaseapp.com',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lead-management-role',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || 'lead-management-role.appspot.com',
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '376075494836',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || '1:376075494836:web:8698a53b7221e201c53ee1',
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-FSTYLK69VN',
};

// Avoid re-initializing app during HMR / multiple imports
const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

// Exports
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);

export default app;
