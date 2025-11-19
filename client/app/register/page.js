'use client';
import { useState } from 'react';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../../lib/firebaseClient';
import { doc, setDoc } from 'firebase/firestore';
import { useRouter } from 'next/navigation';

export default function RegisterPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const router = useRouter();

  const handleRegister = async () => {
    if (!email || !password || !role) {
      alert('All fields are required');
      return;
    }
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCredential.user.uid;

      await setDoc(doc(db, 'users', uid), {
        email,
        role,
        createdAt: new Date().toISOString(),
      });

      alert('User registered with role: ' + role);
      router.push('/login');
    } catch (err) {
      alert('Registration failed: ' + err.message);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Register User</h1>
        <input
          className="border p-2 w-full mb-4 rounded"
          value={email}
          onChange={e => setEmail(e.target.value)}
          placeholder="Email"
        />
        <input
          className="border p-2 w-full mb-4 rounded"
          value={password}
          onChange={e => setPassword(e.target.value)}
          type="password"
          placeholder="Password"
        />
        <select
          className="border p-2 w-full mb-6 rounded"
          value={role}
          onChange={e => setRole(e.target.value)}
        >
          <option value="" disabled>Select Role</option>
          <option value="Admin">Admin</option>
          <option value="TeamAdmin">TeamAdmin</option>
          <option value="Executive">Executive</option>
        </select>
        <button
          className="bg-green-600 text-white px-4 py-2 rounded w-full hover:bg-green-700 transition"
          onClick={handleRegister}
        >
          Register
        </button>
      </div>
    </div>
  );
}