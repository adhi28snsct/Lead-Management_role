'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  signInWithEmailAndPassword,
  getIdTokenResult,
  signOut,
} from 'firebase/auth';
import { auth, db } from '../../lib/firebaseClient';
import { doc, getDoc } from 'firebase/firestore';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState(''); // optional helper
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState(null);
  const [error, setError] = useState('');
  const router = useRouter();

  const isValidEmail = (value) => /\S+@\S+\.\S+/.test(value);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');

    const normalizedEmail = (email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      setError('Please enter both email and password.');
      return;
    }

    if (!isValidEmail(normalizedEmail)) {
      setError('Please enter a valid email address.');
      return;
    }

    setSubmitting(true);
    const baseInfo = { email: normalizedEmail, role: role || 'Not selected' };
    setInfo(baseInfo);

    try {
      // 1) Firebase auth sign-in
      const userCredential = await signInWithEmailAndPassword(
        auth,
        normalizedEmail,
        password
      );
      const user = userCredential.user;

      // 2) Get custom claims from ID token (if used)
      const tokenResult = await getIdTokenResult(user);
      const claimsRole = tokenResult.claims.role || null;

      // 3) Get Firestore user doc
      const userDocRef = doc(db, 'users', user.uid);
      const userDoc = await getDoc(userDocRef);

      if (!userDoc.exists()) {
        setError('User profile not found in Firestore.');
        setInfo({ ...baseInfo, status: 'Profile missing in Firestore' });
        return;
      }

      const data = userDoc.data();
      const firestoreRole = data.role || null;
      const isActive = data.isActive;

      // 3.5) Block deactivated users
      if (isActive === false) {
        setError('Your account has been deactivated by the admin.');
        setInfo({
          ...baseInfo,
          role: firestoreRole || 'Unknown',
          status: 'Account deactivated',
        });

        await signOut(auth);
        return;
      }

      // 4) Decide effective role (lowercase for routing)
      const rawRole = claimsRole || firestoreRole || '';
      const effectiveRole = rawRole.toLowerCase();

      console.log('[Login Debug] claimsRole =', claimsRole);
      console.log('[Login Debug] firestoreRole =', firestoreRole);
      console.log('[Login Debug] effectiveRole =', effectiveRole);

      setInfo({
        ...baseInfo,
        role: effectiveRole || 'unknown',
        status: 'Login Successful! Redirecting…',
      });

      // 5) Redirect by effectiveRole
      if (effectiveRole === 'admin') {
        router.replace('/dashboard');
      } else if (effectiveRole === 'teamadmin') {
        router.replace('/teamadmin');
      } else if (effectiveRole === 'executive' || effectiveRole === 'master') {
        router.replace('/tasks');
      } else {
        router.replace('/unauthorized');
      }
    } catch (firebaseError) {
      console.error('Firebase sign-in error:', firebaseError);
      let displayError = 'Login failed. Please check your credentials.';

      if (
        firebaseError.code === 'auth/user-not-found' ||
        firebaseError.code === 'auth/wrong-password'
      ) {
        displayError = 'Invalid email or password.';
      } else if (firebaseError.code === 'auth/invalid-email') {
        displayError = 'The email address is badly formatted.';
      }

      setError(displayError);
      setInfo({ ...baseInfo, status: 'Login Failed.' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-sky-900 flex items-center justify-center px-4 py-6">
      <div className="w-full max-w-4xl grid md:grid-cols-2 bg-white/90 rounded-2xl shadow-2xl overflow-hidden border border-slate-200">
        {/* Left panel */}
        <div className="hidden md:flex flex-col justify-center gap-6 px-10 py-10 bg-slate-900 text-slate-50">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-sky-300 mb-2">
              Lead Management System
            </p>
            <h1 className="text-3xl font-bold leading-tight">
              Track leads.
              <span className="text-sky-300"> Close deals faster.</span>
            </h1>
          </div>

          <p className="text-sm text-slate-300">
            A clean, role-based dashboard to help admins, team leaders and executives
            manage leads with clarity and control.
          </p>

          <ul className="space-y-2 text-sm text-slate-200">
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400" />
              <span>Separate access for Admin, Team Admin and Executives.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400" />
              <span>View, update and assign leads in one place.</span>
            </li>
            <li className="flex gap-2">
              <span className="mt-1 h-1.5 w-1.5 rounded-full bg-sky-400" />
              <span>Simple authentication flow for quick onboarding.</span>
            </li>
          </ul>

          <p className="text-xs text-slate-400 mt-2">
            Sign in with your registered account credentials.
          </p>
        </div>

        {/* Right panel – form */}
        <div className="px-8 py-10 md:px-10 bg-white">
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-slate-900">Sign in</h2>
            <p className="text-sm text-slate-500 mt-1">
              Enter your credentials to continue.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            {/* Error */}
            {error && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg p-3">
                <p className="font-semibold mb-0.5">Login Error</p>
                <p>{error}</p>
              </div>
            )}

            {/* Email */}
            <div className="space-y-1">
              <label htmlFor="email" className="block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="you@company.com"
                required
              />
            </div>

            {/* Password */}
            <div className="space-y-1">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
                placeholder="••••••••"
                required
              />
            </div>

            {/* Role – informational only */}
            <div className="space-y-1">
              <label htmlFor="role" className="block text-sm font-medium text-slate-700">
                Role (optional)</label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-sky-500"
              >
                <option value="">Select role (if known)</option>
                <option value="Admin">Admin</option>
                <option value="TeamAdmin">Team Admin</option>
                <option value="Executive">Executive</option>
                <option value="Master">Master</option>
              </select>
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-sm font-semibold py-2.5 shadow-md focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-60 disabled:cursor-not-allowed transition"
            >
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>

            {/* Links */}
            <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
              <a href="/register" className="hover:text-sky-600 hover:underline">
                Don’t have an account? Register
              </a>
              <a href="#" className="hover:text-sky-600 hover:underline">
                Forgot password?
              </a>
            </div>

            {/* Debug info */}
            {info && (
              <div
                className={`mt-3 text-[11px] border rounded-lg p-3 ${
                  error
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-sky-100 bg-sky-50 text-slate-700'
                }`}
              >
                <p className="font-semibold mb-1">Status (Firebase Check):</p>
                <p>
                  <span className="font-semibold">Email:</span> {info.email}
                </p>
                <p>
                  <span className="font-semibold">Role:</span> {info.role}
                </p>
                {info.status && (
                  <p
                    className={`mt-1 font-medium ${
                      error ? 'text-red-700' : 'text-emerald-700'
                    }`}
                  >
                    {info.status}
                  </p>
                )}
              </div>
            )}
          </form>

          <footer className="mt-6 text-[11px] text-slate-400 text-center">
            &copy; {new Date().getFullYear()} Lead Management System.
          </footer>
        </div>
      </div>
    </div>
  );
}
