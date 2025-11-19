// app/tasks/page.js
'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db, storage } from '../../lib/firebaseClient';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  where,
  updateDoc,
  addDoc,
  serverTimestamp,
  arrayUnion,
  query,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

export default function TasksPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('');

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [loadingTeams, setLoadingTeams] = useState(true);

  const [tasks, setTasks] = useState([]);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAssignedTo, setNewAssignedTo] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [creating, setCreating] = useState(false);

  const [error, setError] = useState('');

  // debug
  const [debug, setDebug] = useState({ uid: null, memberDocExists: null, sources: [] });

  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        router.push('/login');
        return;
      }
      setUser(u);
      setDebug((d) => ({ ...d, uid: u.uid }));
      try {
        const usersCol = collection(db, 'users');
        const snapshot = await getDocs(usersCol);
        const me = snapshot.docs.find((d) => d.id === u.uid);
        const role = me?.data()?.role || '';
        setUserRole(role);
      } catch (e) {
        console.warn('[TasksPage] failed to read role', e);
      }
    });
    return () => unsub();
  }, [router]);

  // teams list
  useEffect(() => {
    if (!user) return;
    setLoadingTeams(true);
    setError('');
    (async () => {
      try {
        const snapshot = await getDocs(collection(db, 'teams'));
        const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setTeams(list);
        if (!selectedTeamId && list.length > 0) setSelectedTeamId(list[0].id);
      } catch (e) {
        console.error('Load teams error:', e);
        setError('Unable to load teams. Ensure you’re added as a member.');
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, [user, selectedTeamId]);

  // membership check
  useEffect(() => {
    if (!user || !selectedTeamId) {
      setDebug((d) => ({ ...d, memberDocExists: null }));
      return;
    }
    (async () => {
      try {
        const memberRef = doc(db, 'teams', selectedTeamId, 'members', user.uid);
        const memberDoc = await getDoc(memberRef);
        const exists = memberDoc.exists();
        setDebug((d) => ({ ...d, memberDocExists: exists }));
      } catch (e) {
        console.error('[TasksPage] membership check failed:', e);
        setDebug((d) => ({ ...d, memberDocExists: false }));
      }
    })();
  }, [user, selectedTeamId]);

  // robust task listeners
  useEffect(() => {
    if (!user || !selectedTeamId) {
      setTasks([]);
      return;
    }

    setLoadingTasks(true);
    setError('');
    setDebug((d) => ({ ...d, sources: [] }));
    const unsubList = [];

    // helper merges + dedupes by id
    const mergeAndSet = (incomingDocs, sourceLabel) => {
      setTasks((prev) => {
        const map = {};
        prev.forEach((p) => (map[p.id] = p));
        incomingDocs.forEach((c) => (map[c.id] = c));
        const arr = Object.values(map);
        // normalize assignedTo
        arr.forEach((it) => {
          if (!it.assignedTo && it.assignedto) it.assignedTo = it.assignedto;
        });
        // sort by createdAt (if present)
        const getSec = (x) => {
          const c = x.createdAt;
          if (!c) return 0;
          if (typeof c === 'object' && 'seconds' in c) return Number(c.seconds);
          if (c instanceof Date) return Math.floor(c.getTime() / 1000);
          if (typeof c === 'number') return Math.floor(c / 1000);
          return 0;
        };
        arr.sort((a, b) => getSec(b) - getSec(a));
        // debug sources
        setDebug((d) => {
          if (d.sources.includes(sourceLabel)) return d;
          return { ...d, sources: [...d.sources, sourceLabel] };
        });
        return arr;
      });
    };

    // team subcollection where assignedTo == uid
    try {
      const teamTasksCol = collection(db, 'teams', selectedTeamId, 'tasks');
      const teamQuery = query(teamTasksCol, where('assignedTo', '==', user.uid));
      const unsubTeam = onSnapshot(teamQuery, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        mergeAndSet(docs, 'team-subcollection');
        setLoadingTasks(false);
      }, (err) => {
        console.error('[TasksPage] team-subcollection onSnapshot error:', err);
        setError('Unable to read team tasks (team subcollection): ' + (err?.message || err));
        setLoadingTasks(false);
      });
      unsubList.push(unsubTeam);
    } catch (e) {
      console.error('[TasksPage] team subcollection listener failed', e);
    }

    // root tasks queries (assignedTo and assignedto)
    try {
      const rootTasksCol = collection(db, 'tasks');

      const q1 = query(rootTasksCol, where('teamId', '==', selectedTeamId), where('assignedTo', '==', user.uid));
      const unsubRoot1 = onSnapshot(q1, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        mergeAndSet(docs, 'root-assignedTo');
        setLoadingTasks(false);
      }, (err) => {
        if (err?.code === 'permission-denied') {
          setError((prev) => prev ? prev + ' | root-assignedTo blocked' : 'root-assignedTo blocked by rules');
        } else {
          console.error('[TasksPage] root-assignedTo onSnapshot error:', err);
        }
      });
      unsubList.push(unsubRoot1);

      const q2 = query(rootTasksCol, where('teamId', '==', selectedTeamId), where('assignedto', '==', user.uid));
      const unsubRoot2 = onSnapshot(q2, (snap) => {
        const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        mergeAndSet(docs, 'root-assignedto');
        setLoadingTasks(false);
      }, (err) => {
        if (err?.code === 'permission-denied') {
          setError((prev) => prev ? prev + ' | root-assignedto blocked' : 'root-assignedto blocked by rules');
        } else {
          console.error('[TasksPage] root-assignedto onSnapshot error:', err);
        }
      });
      unsubList.push(unsubRoot2);
    } catch (e) {
      console.error('[TasksPage] root tasks listener failed', e);
    }

    return () => unsubList.forEach((u) => { try { u(); } catch (e) {} });
  }, [user, selectedTeamId]);

  const statusOptions = useMemo(() => ['Pending', 'In Progress', 'Blocked', 'Completed'], []);

  // update task (tries team path then root path)
  const updateTask = async (taskId, payload) => {
    setError('');
    try {
      const taskRefTeam = doc(db, 'teams', selectedTeamId, 'tasks', taskId);
      await updateDoc(taskRefTeam, { ...payload, updatedAt: serverTimestamp(), statusHistory: arrayUnion({ at: Date.now(), by: user.uid, payload }) });
    } catch (e) {
      console.warn('[TasksPage] update in team subcollection failed, trying root tasks:', e);
      try {
        const taskRefRoot = doc(db, 'tasks', taskId);
        await updateDoc(taskRefRoot, { ...payload, updatedAt: serverTimestamp(), statusHistory: arrayUnion({ at: Date.now(), by: user.uid, payload }) });
      } catch (err) {
        console.error('Update task error (both paths):', err);
        setError('Failed to update task. Check your permissions.');
      }
    }
  };

  const uploadAttachment = async (taskId, file) => {
    if (!file) return;
    setError('');
    try {
      const path = `teams/${selectedTeamId}/tasks/${taskId}/${Date.now()}_${file.name}`;
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);

      try {
        const taskRef = doc(db, 'teams', selectedTeamId, 'tasks', taskId);
        await updateDoc(taskRef, { attachments: arrayUnion({ url, name: file.name, type: file.type, size: file.size, uploadedBy: user.uid, uploadedAt: Date.now(), path }) });
        await updateDoc(taskRef, { status: 'Completed' });
      } catch (e) {
        const taskRefRoot = doc(db, 'tasks', taskId);
        await updateDoc(taskRefRoot, { attachments: arrayUnion({ url, name: file.name, type: file.type, size: file.size, uploadedBy: user.uid, uploadedAt: Date.now(), path }) });
        await updateDoc(taskRefRoot, { status: 'Completed' });
      }
    } catch (e) {
      console.error('Upload attachment error:', e);
      setError('Failed to upload attachment. Try again or use a smaller file.');
    }
  };

  const createTask = async (e) => {
    e.preventDefault();
    if (!newTitle || !newAssignedTo) {
      setError('Please provide title and assigned user UID.');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const tasksRef = collection(db, 'teams', selectedTeamId, 'tasks');
      await addDoc(tasksRef, {
        title: newTitle,
        description: newDesc,
        assignedTo: newAssignedTo,
        createdBy: user.uid,
        status: 'Pending',
        notes: '',
        deadline: newDeadline || null,
        attachments: [],
        createdAt: serverTimestamp(),
        teamId: selectedTeamId,
      });
      setNewTitle('');
      setNewDesc('');
      setNewAssignedTo('');
      setNewDeadline('');
      setShowCreate(false);
    } catch (e) {
      console.error('Create task error:', e);
      setError('Failed to create task. Check your permissions.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-900 text-slate-50 p-6">
      <div className="mx-auto max-w-6xl">
        <header className="mb-6">
          <h1 className="text-2xl font-bold">Tasks</h1>
          <p className="text-sm text-slate-300 mt-1">View assigned tasks, update status and upload deliverables.</p>
        </header>

        <div className="mb-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-xl bg-white/5 p-3 text-xs border border-slate-700">
            <p className="font-semibold">Debug</p>
            <p>UID: <span className="font-mono">{debug.uid || 'not signed in'}</span></p>
            <p>Member doc exists: <strong>{String(debug.memberDocExists)}</strong></p>
            <p>Task sources: <strong>{debug.sources.join(', ') || 'none yet'}</strong></p>
            <p className="text-xs text-slate-400 mt-2">Open console to see listener logs.</p>
          </div>

          <div className="rounded-xl bg-white/10 p-4 md:col-span-1">
            <h2 className="text-lg font-semibold">Select team</h2>
            {loadingTeams ? <p>Loading teams…</p> : teams.length === 0 ? <p>No teams available.</p> : (
              <>
                <select value={selectedTeamId} onChange={(e) => setSelectedTeamId(e.target.value)} className="w-full rounded-lg">
                  {teams.map((t) => <option key={t.id} value={t.id}>{t.teamName || t.name || t.id}</option>)}
                </select>
                {selectedTeamId && <p className="text-xs mt-2">Selected: <span className="font-semibold">{selectedTeamId}</span></p>}
              </>
            )}
          </div>

          <div className="rounded-xl bg-white/10 p-4 md:col-span-2">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Assigned tasks ({tasks.length})</h2>
              {/* create button for Master */}
            </div>

            <div className="mt-4">
              {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
              {loadingTasks ? <p>Loading tasks…</p> : tasks.length === 0 ? <p>No tasks assigned yet.</p> : (
                <ul className="space-y-3">
                  {tasks.map((t) => (
                    <TaskCard key={t.id} task={t} statusOptions={statusOptions} onUpdate={(payload) => updateTask(t.id, payload)} onUpload={(file) => uploadAttachment(t.id, file)} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <footer className="mt-8 text-[11px] text-slate-400 text-center">&copy; {new Date().getFullYear()} Lead Management System.</footer>
      </div>
    </div>
  );
}

function TaskCard({ task, statusOptions, onUpdate, onUpload }) {
  const [status, setStatus] = useState(task.status || 'Pending');
  const [notes, setNotes] = useState(task.notes || '');

  useEffect(() => {
    setStatus(task.status || 'Pending');
    setNotes(task.notes || '');
  }, [task.status, task.notes]);

  return (
    <li className="rounded-lg border border-slate-700 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">{task.title || '(Untitled)'}</p>
          {task.description && <p className="text-xs text-slate-300 mt-0.5">{task.description}</p>}
          <p className="text-[11px] text-slate-400 mt-0.5">Task ID: {task.id} {task.deadline && <span className="ml-2">• Deadline: {new Date(task.deadline).toLocaleDateString()}</span>}</p>
          <p className="text-[11px] text-slate-400 mt-0.5">Assigned to: {task.assignedToName || task.assignedTo} • Created by: {task.assignedBy || task.createdBy}</p>
        </div>
        <span className="text-xs rounded bg-sky-700/40 px-2 py-0.5">{status}</span>
      </div>

      {Array.isArray(task.attachments) && task.attachments.length > 0 && (
        <div className="mt-3">
          <p className="text-xs font-semibold">Attachments</p>
          <ul className="mt-1 grid grid-cols-1 md:grid-cols-2 gap-2">
            {task.attachments.map((a, i) => (
              <li key={a.path || a.url || a.name || i} className="text-[11px] rounded border border-slate-700 px-2 py-1">
                <a href={a.url} target="_blank" rel="noreferrer" className="text-sky-300 underline">{a.name}</a>
                <span className="ml-2 text-slate-400">({a.type || 'file'})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-600 px-3 py-2 text-sm">
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <textarea placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="md:col-span-2 rounded-lg border border-slate-600 px-3 py-2 text-sm" rows={2} />
        <button onClick={() => onUpdate({ status, notes })} className="md:col-span-3 rounded bg-indigo-600 text-white text-sm font-semibold px-3 py-2">Update status</button>
      </div>

      <div className="mt-3">
        <p className="text-xs font-semibold mb-1">Upload deliverable (image/document)</p>
        <input type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" onChange={(e) => { const file = e.target.files?.[0]; if (file) onUpload(file); e.target.value = ''; }} className="text-xs" />
      </div>
    </li>
  );
}
