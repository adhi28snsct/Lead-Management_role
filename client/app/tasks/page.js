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

  // ---------- Auth listener ----------
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

  // ---------- Teams list ----------
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

  // ---------- Membership check ----------
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

  // ---------- Robust task listeners (team subcollection preferred, root fallback) ----------
  useEffect(() => {
    if (!user || !selectedTeamId) {
      setTasks([]);
      return;
    }

    setLoadingTasks(true);
    setError('');
    setDebug((d) => ({ ...d, sources: [] }));
    const unsubList = [];

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

        // sort by createdAt (desc)
        const getSec = (x) => {
          const c = x.createdAt;
          if (!c) return 0;
          if (typeof c === 'object' && 'seconds' in c) return Number(c.seconds);
          if (c instanceof Date) return Math.floor(c.getTime() / 1000);
          if (typeof c === 'number') return Math.floor(c / 1000);
          return 0;
        };
        arr.sort((a, b) => getSec(b) - getSec(a));

        setDebug((d) => {
          if (d.sources.includes(sourceLabel)) return d;
          return { ...d, sources: [...d.sources, sourceLabel] };
        });

        return arr;
      });
    };

    // team subcollection
    try {
      const teamTasksCol = collection(db, 'teams', selectedTeamId, 'tasks');
      const teamQuery = query(teamTasksCol, where('assignedTo', '==', user.uid));
      const unsubTeam = onSnapshot(
        teamQuery,
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          mergeAndSet(docs, 'team-subcollection');
          setLoadingTasks(false);
        },
        (err) => {
          console.error('[TasksPage] team-subcollection onSnapshot error:', err);
          setError('Unable to read team tasks (team subcollection): ' + (err?.message || err));
          setLoadingTasks(false);
        }
      );
      unsubList.push(unsubTeam);
    } catch (e) {
      console.error('[TasksPage] team subcollection listener failed', e);
    }

    // root tasks fallback (assignedTo)
    try {
      const rootTasksCol = collection(db, 'tasks');

      const q1 = query(rootTasksCol, where('teamId', '==', selectedTeamId), where('assignedTo', '==', user.uid));
      const unsubRoot1 = onSnapshot(
        q1,
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          mergeAndSet(docs, 'root-assignedTo');
          setLoadingTasks(false);
        },
        (err) => {
          if (err?.code === 'permission-denied') {
            setError((prev) => (prev ? prev + ' | root-assignedTo blocked' : 'root-assignedTo blocked by rules'));
          } else {
            console.error('[TasksPage] root-assignedTo onSnapshot error:', err);
          }
        }
      );
      unsubList.push(unsubRoot1);

      const q2 = query(rootTasksCol, where('teamId', '==', selectedTeamId), where('assignedto', '==', user.uid));
      const unsubRoot2 = onSnapshot(
        q2,
        (snap) => {
          const docs = snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
          mergeAndSet(docs, 'root-assignedto');
          setLoadingTasks(false);
        },
        (err) => {
          if (err?.code === 'permission-denied') {
            setError((prev) => (prev ? prev + ' | root-assignedto blocked' : 'root-assignedto blocked by rules'));
          } else {
            console.error('[TasksPage] root-assignedto onSnapshot error:', err);
          }
        }
      );
      unsubList.push(unsubRoot2);
    } catch (e) {
      console.error('[TasksPage] root tasks listener failed', e);
    }

    return () => unsubList.forEach((u) => { try { u(); } catch (e) {} });
  }, [user, selectedTeamId]);

  const statusOptions = useMemo(() => ['Pending', 'In Progress', 'Blocked', 'Completed'], []);

  // ---------- Update task ----------
  const updateTask = async (taskId, payload) => {
    setError('');
    try {
      const taskRefTeam = doc(db, 'teams', selectedTeamId, 'tasks', taskId);
      await updateDoc(taskRefTeam, {
        ...payload,
        updatedAt: serverTimestamp(),
        statusHistory: arrayUnion({
          at: Date.now(),
          by: user.uid,
          payload,
        }),
      });
    } catch (e) {
      console.warn('[TasksPage] update in team subcollection failed, trying root tasks:', e);
      try {
        const taskRefRoot = doc(db, 'tasks', taskId);
        await updateDoc(taskRefRoot, {
          ...payload,
          updatedAt: serverTimestamp(),
          statusHistory: arrayUnion({
            at: Date.now(),
            by: user.uid,
            payload,
          }),
        });
      } catch (err) {
        console.error('Update task error (both paths):', err);
        setError('Failed to update task. Check your permissions.');
      }
    }
  };

  // ---------- Upload attachment ----------
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
        await updateDoc(taskRef, {
          attachments: arrayUnion({
            url,
            name: file.name,
            type: file.type,
            size: file.size,
            uploadedBy: user.uid,
            uploadedAt: Date.now(),
            path,
          }),
          status: 'Completed',
        });
      } catch (e) {
        const taskRefRoot = doc(db, 'tasks', taskId);
        await updateDoc(taskRefRoot, {
          attachments: arrayUnion({
            url,
            name: file.name,
            type: file.type,
            size: file.size,
            uploadedBy: user.uid,
            uploadedAt: Date.now(),
            path,
          }),
          status: 'Completed',
        });
      }
    } catch (e) {
      console.error('Upload attachment error:', e);
      setError('Failed to upload attachment. Try again or use a smaller file.');
    }
  };

  // ---------- Create task ----------
  const createTask = async (e) => {
    e?.preventDefault();
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
      // clear form
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

  // ---------- Format helpers ----------
  const formatDate = (d) => {
    if (!d) return '—';
    try {
      // Firestore Timestamp object
      if (typeof d === 'object' && 'seconds' in d) return new Date(d.seconds * 1000).toLocaleDateString();
      // ISO or Date string
      return new Date(d).toLocaleDateString();
    } catch {
      return String(d).slice(0, 10);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-900 text-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        <header className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Tasks</h1>
            <p className="text-sm text-slate-300 mt-1">View assigned tasks, update status and upload deliverables.</p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-300">
            <div className="bg-white/5 rounded px-3 py-2">
              UID: <span className="font-mono text-slate-100">{debug.uid || 'not signed in'}</span>
            </div>
            <div className="bg-white/5 rounded px-3 py-2">Member doc: <strong className="ml-1">{String(debug.memberDocExists)}</strong></div>
            <div className="bg-white/5 rounded px-3 py-2">Sources: <strong className="ml-1">{(debug.sources.length && debug.sources.join(', ')) || 'none'}</strong></div>
          </div>
        </header>

        <main className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Left column: team selector & create */}
          <aside className="lg:col-span-1 space-y-4">
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
              <h2 className="text-sm text-sky-300 font-semibold">Select Team</h2>
              <div className="mt-3">
                {loadingTeams ? (
                  <div className="text-slate-400">Loading teams…</div>
                ) : teams.length === 0 ? (
                  <div className="text-slate-400">No teams available.</div>
                ) : (
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-white"
                    aria-label="Select team"
                  >
                    {teams.map((t) => <option key={t.id} value={t.id}>{t.teamName || t.name || t.id}</option>)}
                  </select>
                )}
                {selectedTeamId && <p className="text-xs mt-2 text-slate-400">Selected: <span className="font-mono text-slate-200">{selectedTeamId}</span></p>}
              </div>
            </div>

            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm text-sky-300 font-semibold">Create Task</h2>
                <button
                  onClick={() => setShowCreate((s) => !s)}
                  className="text-xs bg-slate-700 px-2 py-1 rounded hover:bg-slate-600"
                  aria-expanded={showCreate}
                >
                  {showCreate ? 'Hide' : 'Show'}
                </button>
              </div>

              {showCreate && (
                <form onSubmit={createTask} className="mt-3 space-y-3">
                  <label className="text-xs text-slate-300">Title</label>
                  <input className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm" value={newTitle} onChange={(e) => setNewTitle(e.target.value)} required />

                  <label className="text-xs text-slate-300">Assign to (UID)</label>
                  <input className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm" value={newAssignedTo} onChange={(e) => setNewAssignedTo(e.target.value)} required />

                  <label className="text-xs text-slate-300">Deadline</label>
                  <input type="date" className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm" value={newDeadline} onChange={(e) => setNewDeadline(e.target.value)} />

                  <label className="text-xs text-slate-300">Description</label>
                  <textarea rows="3" className="w-full rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />

                  <div className="flex gap-2">
                    <button type="submit" disabled={creating || !selectedTeamId} className="flex-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-sm font-semibold disabled:opacity-60">
                      {creating ? 'Creating…' : 'Create Task'}
                    </button>
                    <button type="button" onClick={() => { setNewTitle(''); setNewDesc(''); setNewAssignedTo(''); setNewDeadline(''); }} className="rounded bg-slate-700 px-4 py-2 text-sm">
                      Reset
                    </button>
                  </div>
                </form>
              )}

              {!showCreate && (
                <p className="mt-3 text-xs text-slate-400">Click "Show" to open the create task form.</p>
              )}
            </div>
          </aside>

          {/* Right: task list */}
          <section className="lg:col-span-3 space-y-4">
            <div className="rounded-xl bg-slate-800/60 border border-slate-700 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold">Assigned Tasks</h2>
                  <p className="text-xs text-slate-400 mt-1">Showing tasks assigned to you in the selected team</p>
                </div>

                <div className="text-sm text-slate-300">
                  <span className="font-medium">{tasks.length}</span> tasks
                </div>
              </div>

              <div className="mt-4">
                {error && <div className="mb-3 text-sm text-red-400">{error}</div>}

                {loadingTasks ? (
                  <div className="text-slate-400">Loading tasks…</div>
                ) : tasks.length === 0 ? (
                  <div className="text-slate-400">No tasks assigned yet. Create a task or check team selection.</div>
                ) : (
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {tasks.map((t) => (
                      <TaskCard
                        key={t.id}
                        task={t}
                        statusOptions={statusOptions}
                        onUpdate={(payload) => updateTask(t.id, payload)}
                        onUpload={(file) => uploadAttachment(t.id, file)}
                        formatDate={formatDate}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </section>
        </main>

        <footer className="mt-8 text-[12px] text-slate-400 text-center">&copy; {new Date().getFullYear()} Lead Management System.</footer>
      </div>
    </div>
  );
}

/* ---------- TaskCard component (cleaner UI + accessible controls) ---------- */
function TaskCard({ task, statusOptions, onUpdate, onUpload, formatDate }) {
  const [status, setStatus] = useState(task.status || 'Pending');
  const [notes, setNotes] = useState(task.notes || '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setStatus(task.status || 'Pending');
    setNotes(task.notes || '');
  }, [task.status, task.notes]);

  const handleUpdate = async () => {
    setBusy(true);
    try {
      await onUpdate({ status, notes });
    } catch (e) {
      console.error('Task update failed', e);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="rounded-lg border border-slate-700 bg-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold truncate">{task.title || '(Untitled task)'}</h3>
            <div className="text-xs text-slate-300">{task.assignedToName || task.assignedTo}</div>
          </div>

          {task.description && <p className="mt-2 text-xs text-slate-300 line-clamp-3">{task.description}</p>}

          <div className="mt-3 text-[12px] text-slate-400 flex items-center gap-3">
            <span>Due: <strong className="ml-1 text-slate-200">{formatDate(task.deadline)}</strong></span>
            <span className="font-mono ml-auto text-xs text-slate-500">ID: {task.id}</span>
          </div>
        </div>

        <div className="flex-shrink-0 text-right">
          <div className={`px-3 py-1 rounded-full text-xs font-semibold ${task.status === 'Completed' ? 'bg-green-600/40' : 'bg-slate-800/40'} border border-slate-700`}>
            {task.status}
          </div>
        </div>
      </div>

      {Array.isArray(task.attachments) && task.attachments.length > 0 && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-slate-300">Attachments</div>
          <ul className="mt-2 grid grid-cols-1 gap-2">
            {task.attachments.map((a, i) => (
              <li key={a.path || a.url || a.name || i} className="text-[12px]">
                <a href={a.url} target="_blank" rel="noreferrer" className="text-sky-300 underline">{a.name || 'file'}</a>
                <span className="ml-2 text-slate-400">({a.type || 'file'})</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-2">
        <select aria-label="Change status" value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm">
          {statusOptions.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>

        <textarea aria-label="Notes" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} className="md:col-span-2 rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm" rows={2} />

        <button onClick={handleUpdate} disabled={busy} className="md:col-span-3 mt-1 rounded bg-indigo-600 hover:bg-indigo-700 text-white py-2 text-sm font-semibold disabled:opacity-60">
          {busy ? 'Updating…' : 'Update status'}
        </button>
      </div>

      <div className="mt-3">
        <label className="text-xs text-slate-300">Upload deliverable</label>
        <div className="mt-1 flex items-center gap-2">
          <input
            type="file"
            accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onUpload(file);
              e.target.value = '';
            }}
            className="text-xs file:bg-slate-700 file:text-white file:rounded file:px-3"
          />
        </div>
      </div>
    </li>
  );
}
