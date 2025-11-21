// app/teamadmin/page.js
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth, db } from '../../lib/firebaseClient';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  setDoc,
  query,
  where,
  addDoc,
} from 'firebase/firestore';
import { signOut } from 'firebase/auth';

import CreateTaskForm from '../components/CreateTaskForm';

function Spinner({ size = 5 }) {
  const s = `${size}rem`;
  return (
    <div
      aria-hidden
      style={{ width: s, height: s }}
      className="border-4 border-slate-600 border-t-transparent rounded-full animate-spin"
    />
  );
}

export default function TeamAdminPage() {
  const router = useRouter();

  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState('');

  const [teams, setTeams] = useState([]);
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedTeamName, setSelectedTeamName] = useState('');

  const [members, setMembers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);

  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);

  const [error, setError] = useState('');
  const [info, setInfo] = useState(''); // success/info messages
  const [createdLeadInfo, setCreatedLeadInfo] = useState(null); // { id, teamId }
  const [createdTaskInfo, setCreatedTaskInfo] = useState(null); // { id, teamId }

  // Add Member form state
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('Executive');
  const [addingMember, setAddingMember] = useState(false);

  // Lead form states (if quick create inside this page — we also use separate Lead component)
  const [leadName, setLeadName] = useState('');
  const [leadStatus, setLeadStatus] = useState('Pending');
  const [leadNotes, setLeadNotes] = useState('');
  const [creatingLead, setCreatingLead] = useState(false);

  // ---------- Auth + role check ----------
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(async (u) => {
      if (!u) {
        router.push('/login');
        return;
      }

      try {
        setError('');
        const userDoc = await getDoc(doc(db, 'users', u.uid));
        const role = userDoc.exists() ? userDoc.data().role : '';

        setUser(u);
        setUserRole(role);

        if (role !== 'TeamAdmin') {
          router.push('/unauthorized');
        }
      } catch (e) {
        console.error('Error loading user role:', e);
        setError('Unable to verify your role. Please try again.');
      }
    });

    return () => unsub();
  }, [router]);

  // ---------- Load teams where this user is TeamAdmin ----------
  useEffect(() => {
    if (!user || userRole !== 'TeamAdmin') return;

    setError('');
    setLoadingTeams(true);

    (async () => {
      try {
        const teamsCol = collection(db, 'teams');
        const snapshot = await getDocs(teamsCol);

        const myTeams = [];
        for (const t of snapshot.docs) {
          try {
            const memberDoc = await getDoc(doc(db, 'teams', t.id, 'members', user.uid));
            if (memberDoc.exists() && memberDoc.data().role === 'TeamAdmin') {
              myTeams.push({ id: t.id, ...(t.data() || {}) });
            }
          } catch (innerErr) {
            console.error('Error checking team membership:', innerErr);
          }
        }

        setTeams(myTeams);

        if (!selectedTeamId && myTeams.length > 0) {
          const firstTeam = myTeams[0];
          setSelectedTeamId(firstTeam.id);
          setSelectedTeamName(firstTeam.name || firstTeam.teamName || firstTeam.id);
        }
      } catch (e) {
        console.error('Error loading teams:', e);
        setError('Unable to load teams. Ensure you are added as TeamAdmin in at least one team.');
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, [user, userRole, selectedTeamId]);

  // ---------- Load members for selected team (with user details) ----------
  useEffect(() => {
    if (!user || !selectedTeamId) return;

    setError('');
    setLoadingMembers(true);

    const membersColRef = collection(db, 'teams', selectedTeamId, 'members');

    const unsub = onSnapshot(
      membersColRef,
      async (snapshot) => {
        const memberUids = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));

        const membersWithDetails = await Promise.all(
          memberUids.map(async (member) => {
            try {
              const userDoc = await getDoc(doc(db, 'users', member.id));

              return {
                id: member.id,
                role: member.role,
                email: userDoc.exists() ? userDoc.data().email : 'Email not found',
                name: userDoc.exists() ? userDoc.data().name : member.id,
              };
            } catch (e) {
              console.error('Error fetching user detail for member:', member.id, e);
              return {
                id: member.id,
                role: member.role,
                email: 'Error fetching email',
                name: `Error: ${member.id}`,
              };
            }
          })
        );

        setMembers(membersWithDetails);
        setLoadingMembers(false);
      },
      (e) => {
        console.error('Error loading members:', e);
        setError('Unable to load team members. Check your permissions or team selection.');
        setLoadingMembers(false);
      }
    );

    return () => unsub();
  }, [user, selectedTeamId]);

  // ---------- Load leads for selected team ----------
  useEffect(() => {
    if (!user || !selectedTeamId) return;

    setError('');
    setLoadingLeads(true);

    const leadsColRef = collection(db, 'teams', selectedTeamId, 'leads');
    const unsub = onSnapshot(
      leadsColRef,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
        setLeads(list);
        setLoadingLeads(false);
      },
      (e) => {
        console.error('Error loading leads:', e);
        setError('Unable to load team leads. Check your permissions or team selection.');
        setLoadingLeads(false);
      }
    );

    return () => unsub();
  }, [user, selectedTeamId]);

  // ---------- Load Tasks from team subcollection teams/{teamId}/tasks ----------
  useEffect(() => {
    if (!user || !selectedTeamId) {
      setTasks([]);
      return;
    }

    setError('');
    setLoadingTasks(true);

    const tasksColRef = collection(db, 'teams', selectedTeamId, 'tasks');

    const unsub = onSnapshot(
      tasksColRef,
      (snapshot) => {
        const list = snapshot.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));

        // normalize: ensure assignedTo key exists even if older docs used 'assignedto'
        const normalized = list.map((t) => {
          if (!t.assignedTo && t.assignedto) t.assignedTo = t.assignedto;
          return t;
        });

        setTasks(normalized);
        setLoadingTasks(false);
      },
      (e) => {
        console.error('Error loading tasks (team subcollection):', e);
        setError('Unable to load tasks for this team. Check your permissions or team selection.');
        setLoadingTasks(false);
      }
    );

    return () => unsub();
  }, [user, selectedTeamId]);

  // ---------- Handlers ----------
  const handleTeamChange = (teamId) => {
    setSelectedTeamId(teamId);
    const t = teams.find((x) => x.id === teamId);
    setSelectedTeamName(t?.name || t?.teamName || teamId);
    // clear transient messages when switching
    setError('');
    setInfo('');
    setCreatedLeadInfo(null);
    setCreatedTaskInfo(null);
  };

  const handleSignOut = () => {
    signOut(auth)
      .then(() => {
        router.push('/login');
      })
      .catch((e) => {
        console.error('Sign Out Error:', e);
        setError('Failed to sign out.');
      });
  };

  // Find UID from email (email should be stored lowercased in /users)
  const findUserByEmail = async (email) => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('email', '==', email.toLowerCase()));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return null;
    return snapshot.docs[0].id;
  };

  const handleAddMember = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');

    const emailToAdd = newMemberEmail.trim().toLowerCase();

    if (!emailToAdd || !newMemberRole || !selectedTeamId) {
      setError('Please enter member email, select a role, and ensure a team is selected.');
      return;
    }

    setAddingMember(true);

    try {
      const memberUid = await findUserByEmail(emailToAdd);
      if (!memberUid) {
        setError(`User with email "${emailToAdd}" not found in the system.`);
        setAddingMember(false);
        return;
      }

      if (members.find((m) => m.id === memberUid)) {
        setError('This user is already a member of the team.');
        setAddingMember(false);
        return;
      }

      const memberRef = doc(db, 'teams', selectedTeamId, 'members', memberUid);
      await setDoc(memberRef, {
        role: newMemberRole,
        addedBy: user.uid,
        addedAt: new Date(),
      });

      setNewMemberEmail('');
      setNewMemberRole('Executive');
      setInfo('Member added successfully.');
    } catch (e) {
      console.error('Error adding member:', e);
      setError('Unable to add member. Check if your Firestore rules and indexes allow the email lookup.');
    } finally {
      setAddingMember(false);
    }
  };

  const handleCreateLead = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');

    if (!leadName || !selectedTeamId) {
      setError('Please enter lead name and ensure a team is selected.');
      return;
    }

    setCreatingLead(true);

    try {
      const leadsRef = collection(db, 'teams', selectedTeamId, 'leads');
      const docRef = await addDoc(leadsRef, {
        name: leadName,
        status: leadStatus,
        notes: leadNotes,
        createdBy: user.uid,
        createdAt: new Date(),
      });

      setLeadName('');
      setLeadStatus('Pending');
      setLeadNotes('');

      setInfo('Lead created successfully.');
      setCreatedLeadInfo({ id: docRef.id, teamId: selectedTeamId });
    } catch (e) {
      console.error('Error creating lead:', e);
      setError('Unable to create lead. Check your permissions.');
    } finally {
      setCreatingLead(false);
    }
  };

  // Called by CreateTaskForm when it successfully creates a task
  const onTaskCreated = (newTask) => {
    setInfo('Task created successfully.');
    if (newTask?.id) setCreatedTaskInfo({ id: newTask.id, teamId: selectedTeamId });
    // Add to local tasks state for immediate UI update (the snapshot will also pick it up)
    setTasks((prev) => {
      if (!newTask?.id) return prev;
      const exists = prev.some((p) => p.id === newTask.id);
      if (exists) return prev;
      const normalized = {
        id: newTask.id,
        title: newTask.title,
        assignedTo: newTask.assignedTo,
        assignedToName: newTask.assignedToName || newTask.assignedTo,
        status: newTask.status || 'Open',
        dueDate: newTask.deadline || newTask.dueDate || null,
        createdAt: newTask.createdAt || new Date().toISOString(),
      };
      return [normalized, ...prev];
    });
  };

  // Helper to open the Firestore console (or in-app route) for created lead/task
  const openConsolePath = (type, infoObj) => {
    if (!infoObj) return;
    const { teamId, id } = infoObj;
    // This link is a helpful quick navigator string — you may change to in-app route if available
    const path = type === 'lead'
      ? `teams/${teamId}/leads/${id}`
      : `teams/${teamId}/tasks/${id}`;
    // open in new tab (user may want to inspect in firebase console or your own admin route)
    const consoleUrl = `https://console.firebase.google.com/project/${process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lead-management-role'}/firestore/data/~2Fteams~2F${teamId}~2F${type === 'lead' ? 'leads' : 'tasks'}~2F${id}`;
    // try open firebase console; fallback to path print
    window.open(consoleUrl, '_blank') || alert(`Path: ${path}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-sky-900 text-slate-50 p-6">
      <div className="mx-auto max-w-7xl">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center pb-4 border-b border-slate-700 gap-4">
          <div>
            <h1 className="text-3xl font-extrabold text-white flex items-center space-x-3">
              <span className="text-sky-400 text-4xl">🛠️</span>
              <span>TeamAdmin Dashboard</span>
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Managing team: <span className="font-semibold text-sky-300">{selectedTeamName || 'No Team Selected'}</span>
            </p>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 text-white transition shadow-lg"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Info/Error banners */}
        <div className="space-y-3">
          {error && (
            <div role="alert" className="rounded-lg border border-red-500 bg-red-800/20 p-4 text-red-300 shadow-xl">
              <div className="flex items-start gap-3">
                <div className="text-xl">🚨</div>
                <div>
                  <p className="font-bold">Operation Failed</p>
                  <p className="text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {info && (
            <div role="status" aria-live="polite" className="rounded-lg border border-emerald-500 bg-emerald-900/10 p-4 text-emerald-200 shadow-md">
              <div className="flex items-start gap-3">
                <div className="text-xl">✅</div>
                <div>
                  <p className="font-semibold">{info}</p>
                  <div className="mt-2 flex gap-2">
                    {createdLeadInfo && (
                      <button
                        onClick={() => openConsolePath('lead', createdLeadInfo)}
                        className="text-xs bg-emerald-600/80 px-3 py-1 rounded hover:bg-emerald-600/90"
                      >
                        Open created lead
                      </button>
                    )}
                    {createdTaskInfo && (
                      <button
                        onClick={() => openConsolePath('task', createdTaskInfo)}
                        className="text-xs bg-emerald-600/80 px-3 py-1 rounded hover:bg-emerald-600/90"
                      >
                        Open created task
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* MAIN CONTENT GRID */}
        <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-6">
          {/* 1. Team Selector */}
          <div className="rounded-xl bg-slate-800/85 backdrop-blur border border-sky-700/40 p-6 shadow-2xl h-fit">
            <h2 className="text-xl font-bold text-sky-400 mb-4 flex items-center space-x-2">
              <span className="text-2xl">🏢</span>
              <span>Select Team</span>
            </h2>
            {loadingTeams ? (
              <div className="flex items-center gap-3">
                <Spinner size={2.5} />
                <p className="text-slate-400">Loading teams…</p>
              </div>
            ) : teams.length === 0 ? (
              <p className="text-slate-400 mt-3">No teams where you are TeamAdmin.</p>
            ) : (
              <div className="mt-3 space-y-3">
                <select
                  value={selectedTeamId}
                  onChange={(e) => handleTeamChange(e.target.value)}
                  className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 transition shadow-inner"
                >
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name || t.teamName || t.id}
                    </option>
                  ))}
                </select>
                {selectedTeamId && (
                  <p className="text-xs text-slate-400 p-2 border-l-2 border-sky-500 bg-slate-700/30 rounded-r">
                    Selected:{' '}
                    <span className="font-semibold text-sky-300">
                      {selectedTeamName}
                    </span>
                    <br />
                    <span className="font-mono text-xs text-slate-500">
                      ID: {selectedTeamId}
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 2. Team Members & Add Member Form */}
          <div className="rounded-xl bg-slate-800/85 backdrop-blur border border-sky-700/40 p-6 shadow-2xl">
            <h2 className="text-xl font-bold text-sky-400 mb-4 flex items-center space-x-2">
              <span className="text-2xl">👥</span>
              <span>Team Members ({members.length})</span>
            </h2>

            <div className="min-h-[150px] max-h-72 overflow-y-auto pr-2">
              {loadingMembers ? (
                <div className="flex items-center gap-3">
                  <Spinner size={2} />
                  <p className="text-slate-400">Loading members details…</p>
                </div>
              ) : members.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {members.map((m) => (
                    <li key={m.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-sm font-semibold text-slate-100 block">{m.name || m.id}</span>
                          <span className="text-xs text-slate-400">{m.email}</span>
                        </div>
                        <span className="text-[10px] font-bold rounded-full px-2 py-0.5 ml-4 flex-shrink-0 bg-sky-600/50 border border-sky-400 text-sky-100">
                          {m.role}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-slate-400">No members in this team yet.</p>
              )}
            </div>

            {/* Add member Form */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <h3 className="text-lg font-bold text-sky-300 mb-3">Add New Member</h3>
              {!selectedTeamId ? (
                <p className="text-slate-400">Select a team first to add members.</p>
              ) : (
                <form onSubmit={handleAddMember} className="space-y-3">
                  <input
                    type="email"
                    placeholder="Member Email Address"
                    value={newMemberEmail}
                    onChange={(e) => setNewMemberEmail(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-inner"
                    disabled={addingMember}
                    required
                  />
                  <select
                    value={newMemberRole}
                    onChange={(e) => setNewMemberRole(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-inner"
                    disabled={addingMember}
                  >
                    <option value="Executive">Executive (default)</option>
                    <option value="Master">Master</option>
                    <option value="TeamAdmin">Team Admin</option>
                  </select>

                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={addingMember}
                      className="flex-1 w-full rounded-lg bg-sky-600 hover:bg-sky-700 text-white text-base font-semibold py-2.5 shadow-md focus:outline-none focus:ring-2 focus:ring-sky-400 disabled:opacity-50 transition"
                    >
                      {addingMember ? 'Finding User & Adding…' : 'Add Member'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setNewMemberEmail(''); setNewMemberRole('Executive'); }}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2.5"
                    >
                      Reset
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* 3. Task Assignment */}
          <div className="rounded-xl bg-slate-800/85 backdrop-blur border border-orange-700/40 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-orange-400 mb-1 flex items-center gap-2">
                <span className="text-2xl">✅</span>
                <span>Task Assignment</span>
                <span className="text-sm text-slate-400 font-normal">({tasks.length})</span>
              </h2>
              <div className="text-xs text-slate-400">Team: <span className="font-mono">{selectedTeamId || '—'}</span></div>
            </div>

            <div className="min-h-[150px] max-h-96 overflow-y-auto pr-2 mt-3">
              {loadingTasks ? (
                <div className="flex items-center gap-3">
                  <Spinner size={2} />
                  <p className="text-slate-400">Loading tasks…</p>
                </div>
              ) : tasks.length === 0 ? (
                <p className="text-slate-400">No tasks assigned yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {tasks.map((t) => (
                    <li key={t.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-100 truncate">{t.title}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            To: {t.assignedToName || t.assignedTo || '—'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold rounded-full px-2 py-0.5 ml-4 inline-block bg-orange-600/40 border border-orange-400 text-orange-100">
                            {t.status}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">{t.deadline ? String(t.deadline).slice(0,10) : 'No due'}</div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Create Task Component (extracted) */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <CreateTaskForm
                user={user}
                selectedTeamId={selectedTeamId}
                members={members}
                setGlobalError={(msg) => setError(msg)}
                onCreated={onTaskCreated}
              />
            </div>
          </div>

          {/* 4. Leads & Quick Create Lead Form */}
          <div className="rounded-xl bg-slate-800/85 backdrop-blur border border-emerald-700/40 p-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-emerald-400 mb-1 flex items-center gap-2">
                <span className="text-2xl">🎯</span>
                <span>Team Leads</span>
                <span className="text-sm text-slate-400 font-normal">({leads.length})</span>
              </h2>
              <div className="text-xs text-slate-400">Team: <span className="font-mono">{selectedTeamId || '—'}</span></div>
            </div>

            <div className="min-h-[150px] max-h-56 overflow-y-auto pr-2 mt-3">
              {loadingLeads ? (
                <div className="flex items-center gap-3">
                  <Spinner size={2} />
                  <p className="text-slate-400">Loading leads…</p>
                </div>
              ) : leads.length === 0 ? (
                <p className="text-slate-400">No leads yet.</p>
              ) : (
                <ul className="mt-3 space-y-3">
                  {leads.map((l) => (
                    <li key={l.id} className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-sm font-medium text-slate-100 truncate">{l.name}</div>
                          <div className="text-xs text-slate-400 mt-1 truncate">ID: {l.id}</div>
                          {l.notes && <div className="text-xs text-slate-300 mt-1 italic truncate">Notes: {l.notes}</div>}
                        </div>
                        <div className="text-right">
                          <div className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${l.status === 'Closed Won' || l.status === 'Complete' ? 'bg-green-600/50 border-green-400 text-green-100' : 'bg-orange-600/40 border-orange-400 text-orange-100'}`}>
                            {l.status}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Quick create lead form */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <h3 className="text-lg font-bold text-emerald-300 mb-3">Create New Lead</h3>
              {!selectedTeamId ? (
                <p className="text-slate-400">Select a team first to create leads.</p>
              ) : (
                <form onSubmit={handleCreateLead} className="space-y-3">
                  <input
                    type="text"
                    placeholder="Lead Name"
                    value={leadName}
                    onChange={(e) => setLeadName(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
                    disabled={creatingLead}
                    required
                  />
                  <select
                    value={leadStatus}
                    onChange={(e) => setLeadStatus(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
                    disabled={creatingLead}
                  >
                    <option value="Pending">Pending</option>
                    <option value="Contacted">Contacted</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Closed Won">Closed Won</option>
                    <option value="Closed Lost">Closed Lost</option>
                  </select>
                  <textarea
                    placeholder="Notes (optional)"
                    value={leadNotes}
                    onChange={(e) => setLeadNotes(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
                    rows={3}
                    disabled={creatingLead}
                  />
                  <div className="flex gap-3">
                    <button
                      type="submit"
                      disabled={creatingLead}
                      className="flex-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-base font-semibold py-2.5"
                    >
                      {creatingLead ? 'Creating lead…' : 'Create Lead'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setLeadName(''); setLeadStatus('Pending'); setLeadNotes(''); }}
                      className="rounded-lg bg-slate-700 hover:bg-slate-600 text-slate-200 px-4 py-2.5"
                    >
                      Reset
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </section>

        {/* Footer */}
        <footer className="mt-10 text-[11px] text-slate-500 text-center border-t border-slate-800 pt-4">
          &copy; {new Date().getFullYear()} Lead Management System. Powered by Next.js & Firebase.
        </footer>
      </div>
    </div>
  );
}
