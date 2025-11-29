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
  addDoc,
  updateDoc,
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

  const [members, setMembers] = useState([]); // team members
  const [leads, setLeads] = useState([]);
  const [tasks, setTasks] = useState([]);

  // 🔥 All users from /users for dropdown
  const [allUsers, setAllUsers] = useState([]); // [{uid, email, role}]

  const [loadingTeams, setLoadingTeams] = useState(true);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [loadingLeads, setLoadingLeads] = useState(false);
  const [loadingTasks, setLoadingTasks] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);

  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [createdLeadInfo, setCreatedLeadInfo] = useState(null);
  const [createdTaskInfo, setCreatedTaskInfo] = useState(null);

  // Add Member form state
  const [newMemberUid, setNewMemberUid] = useState('');
  const [newMemberEmail, setNewMemberEmail] = useState(''); // we store email label
  const [newMemberRole, setNewMemberRole] = useState('Executive');
  const [addingMember, setAddingMember] = useState(false);

  // Lead form states
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
        // allowed by rules: user can read their own /users/{uid}
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

  // ---------- Load ALL users for dropdown ----------
  useEffect(() => {
    if (!user || userRole !== 'TeamAdmin') return;

    const loadUsers = async () => {
      try {
        setLoadingUsers(true);
        setError('');
        const snap = await getDocs(collection(db, 'users'));
        const list = snap.docs.map((d) => {
          const data = d.data() || {};
          return {
            uid: d.id,
            email: data.email || '',
            role: data.role || '',
          };
        });
        setAllUsers(list);
      } catch (e) {
        console.error('Error loading users for dropdown:', e);
        setError('Unable to load user list for member assignment.');
      } finally {
        setLoadingUsers(false);
      }
    };

    loadUsers();
  }, [user, userRole]);

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
            const memberDoc = await getDoc(
              doc(db, 'teams', t.id, 'members', user.uid)
            );
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
        setError(
          'Unable to load teams. Ensure you are added as TeamAdmin in at least one team.'
        );
      } finally {
        setLoadingTeams(false);
      }
    })();
  }, [user, userRole, selectedTeamId]);

  // ---------- Load members for selected team (resolve email using /users + fallback) ----------
  useEffect(() => {
    if (!user || !selectedTeamId) return;

    setError('');
    setLoadingMembers(true);

    const membersColRef = collection(db, 'teams', selectedTeamId, 'members');

    const unsub = onSnapshot(
      membersColRef,
      async (snapshot) => {
        try {
          const baseMembers = snapshot.docs.map((d) => {
            const data = d.data() || {};
            return {
              id: d.id,
              role: data.role || '',
              name: data.name || '', // old stored label (email or name)
            };
          });

          // Try to use allUsers first to resolve email quickly
          const membersWithEmail = await Promise.all(
            baseMembers.map(async (m) => {
              // try from allUsers
              const fromAll = allUsers.find((u) => u.uid === m.id);
              if (fromAll && fromAll.email) {
                return {
                  ...m,
                  email: fromAll.email,
                };
              }

              // fallback: direct read from /users/{uid}
              try {
                const userSnap = await getDoc(doc(db, 'users', m.id));
                if (userSnap.exists()) {
                  const udata = userSnap.data() || {};
                  return {
                    ...m,
                    email: udata.email || m.name || '',
                  };
                }
              } catch (err) {
                console.error('Error loading user email for member:', m.id, err);
              }

              return {
                ...m,
                email: m.name || '',
              };
            })
          );

          setMembers(membersWithEmail);
          setLoadingMembers(false);
        } catch (e) {
          console.error('Error resolving member emails:', e);
          setError(
            'Unable to load team member details (email). Check your permissions or rules.'
          );
          setLoadingMembers(false);
        }
      },
      (e) => {
        console.error('Error loading members:', e);
        setError(
          'Unable to load team members. Check your permissions or team selection.'
        );
        setLoadingMembers(false);
      }
    );

    return () => unsub();
  }, [user, selectedTeamId, allUsers]);

  // ---------- Load leads ----------
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
        setError(
          'Unable to load team leads. Check your permissions or team selection.'
        );
        setLoadingLeads(false);
      }
    );

    return () => unsub();
  }, [user, selectedTeamId]);

  // ---------- Load tasks ----------
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
        const normalized = list.map((t) => {
          if (!t.assignedTo && t.assignedto) t.assignedTo = t.assignedto;
          return t;
        });

        setTasks(normalized);
        setLoadingTasks(false);
      },
      (e) => {
        console.error('Error loading tasks (team subcollection):', e);
        setError(
          'Unable to load tasks for this team. Check your permissions or team selection.'
        );
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

  // Add member using dropdown-selected user
  const handleAddMember = async (e) => {
    e?.preventDefault();
    setError('');
    setInfo('');

    const uid = newMemberUid.trim();
    const emailText = newMemberEmail.trim(); // label shown in UI

    if (!uid || !newMemberRole || !selectedTeamId || !emailText) {
      setError(
        'Please select a user, choose a role, and ensure a team is selected.'
      );
      return;
    }

    setAddingMember(true);

    try {
      if (members.find((m) => m.id === uid)) {
        setError('This user is already a member of the team.');
        setAddingMember(false);
        return;
      }

      const memberRef = doc(db, 'teams', selectedTeamId, 'members', uid);
      await setDoc(memberRef, {
        role: newMemberRole,
        addedBy: user.uid,
        addedAt: new Date(),
        name: emailText, // keep as fallback; real email also in /users
      });

      setNewMemberUid('');
      setNewMemberEmail('');
      setNewMemberRole('Executive');
      setInfo('Member added successfully.');
    } catch (e) {
      console.error('Error adding member:', e);
      setError('Unable to add member. Check your permissions.');
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

  const onTaskCreated = (newTask) => {
    setInfo('Task created successfully.');
    if (newTask?.id) setCreatedTaskInfo({ id: newTask.id, teamId: selectedTeamId });
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

  // Assign lead to a member
  const handleAssignLeadOwner = async (leadId, memberId) => {
    if (!selectedTeamId) return;

    setError('');
    setInfo('');

    const member = members.find((m) => m.id === memberId);

    try {
      const leadRef = doc(db, 'teams', selectedTeamId, 'leads', leadId);

      if (!memberId) {
        await updateDoc(leadRef, {
          assignedTo: null,
          assignedRole: null,
          assignedToName: null,
          lastModifiedBy: user?.uid || null,
          lastModifiedAt: new Date(),
        });

        setLeads((prev) =>
          prev.map((l) =>
            l.id === leadId
              ? { ...l, assignedTo: null, assignedRole: null, assignedToName: null }
              : l
          )
        );
        setInfo('Lead unassigned.');
        return;
      }

      await updateDoc(leadRef, {
        assignedTo: memberId,
        assignedRole: member?.role || null,
        assignedToName: member?.email || member?.name || null, // use email as display
        lastModifiedBy: user?.uid || null,
        lastModifiedAt: new Date(),
      });

      setLeads((prev) =>
        prev.map((l) =>
          l.id === leadId
            ? {
                ...l,
                assignedTo: memberId,
                assignedRole: member?.role || null,
                assignedToName: member?.email || member?.name || null,
              }
            : l
        )
      );

      setInfo('Lead assignment updated.');
    } catch (e) {
      console.error('Error assigning lead owner:', e);
      setError('Unable to update lead assignment. Check your permissions.');
    }
  };

  const openConsolePath = (type, infoObj) => {
    if (!infoObj) return;
    const { teamId, id } = infoObj;
    const path =
      type === 'lead'
        ? `teams/${teamId}/leads/${id}`
        : `teams/${teamId}/tasks/${id}`;
    const consoleUrl = `https://console.firebase.google.com/project/${
      process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'lead-management-role'
    }/firestore/data/~2Fteams~2F${teamId}~2F${
      type === 'lead' ? 'leads' : 'tasks'
    }~2F${id}`;
    window.open(consoleUrl, '_blank') || alert(`Path: ${path}`);
  };

  const assignableMembers = members.filter(
    (m) => m.role === 'Executive' || m.role === 'Master'
  );

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
              Managing team:{' '}
              <span className="font-semibold text-sky-300">
                {selectedTeamName || 'No Team Selected'}
              </span>
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
            <div
              role="alert"
              className="rounded-lg border border-red-500 bg-red-800/20 p-4 text-red-300 shadow-xl"
            >
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
            <div
              role="status"
              aria-live="polite"
              className="rounded-lg border border-emerald-500 bg-emerald-900/10 p-4 text-emerald-200 shadow-md"
            >
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
              <p className="text-slate-400 mt-3">
                No teams where you are TeamAdmin.
              </p>
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
                  <p className="text-slate-400">Loading members…</p>
                </div>
              ) : members.length > 0 ? (
                <ul className="mt-3 space-y-3">
                  {members.map((m) => (
                    <li
                      key={m.id}
                      className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          {/* Format 1: email then UID below */}
                          <span className="text-sm font-semibold text-slate-100 block">
                            {m.email || m.name || '(no email set)'}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            UID: {m.id}
                          </span>
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

            {/* Add member Form with user dropdown */}
            <div className="mt-6 pt-6 border-t border-slate-700">
              <h3 className="text-lg font-bold text-sky-300 mb-3">
                Add New Member
              </h3>
              {!selectedTeamId ? (
                <p className="text-slate-400">
                  Select a team first to add members.
                </p>
              ) : (
                <form onSubmit={handleAddMember} className="space-y-3">
                  {/* User dropdown by email */}
                  <div className="space-y-1">
                    <label className="text-xs text-slate-300">
                      Select user by email
                    </label>
                    {loadingUsers ? (
                      <div className="flex items-center gap-2 text-slate-400 text-xs">
                        <Spinner size={1.5} />
                        <span>Loading users…</span>
                      </div>
                    ) : (
                      <select
                        value={newMemberUid}
                        onChange={(e) => {
                          const uid = e.target.value;
                          setNewMemberUid(uid);
                          const selected = allUsers.find((u) => u.uid === uid);
                          setNewMemberEmail(selected?.email || '');
                        }}
                        className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-sky-500 shadow-inner"
                        disabled={addingMember || allUsers.length === 0}
                      >
                        <option value="">
                          {allUsers.length === 0
                            ? 'No users found in system'
                            : 'Choose a user…'}
                        </option>
                        {allUsers.map((u) => (
                          <option key={u.uid} value={u.uid}>
                            {u.email || '(no email)'}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>

                  {/* Show selected email + UID preview */}
                  {newMemberUid && newMemberEmail && (
                    <div className="text-[11px] text-slate-300 border border-slate-700 bg-slate-900/60 rounded p-2">
                      <div>
                        <span className="font-semibold">Email:</span>{' '}
                        {newMemberEmail}
                      </div>
                      <div className="font-mono">
                        <span className="font-semibold">UID:</span> {newMemberUid}
                      </div>
                    </div>
                  )}

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
                      {addingMember ? 'Adding…' : 'Add Member'}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setNewMemberUid('');
                        setNewMemberEmail('');
                        setNewMemberRole('Executive');
                      }}
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
                <span className="text-sm text-slate-400 font-normal">
                  ({tasks.length})
                </span>
              </h2>
              <div className="text-xs text-slate-400">
                Team:{' '}
                <span className="font-mono">{selectedTeamId || '—'}</span>
              </div>
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
                    <li
                      key={t.id}
                      className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2"
                    >
                      <div className="flex justify-between items-start gap-3">
                        <div>
                          <div className="text-sm font-medium text-slate-100 truncate">
                            {t.title}
                          </div>
                          <div className="text-xs text-slate-400 mt-1">
                            To: {t.assignedToName || t.assignedTo || '—'}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] font-bold rounded-full px-2 py-0.5 ml-4 inline-block bg-orange-600/40 border border-orange-400 text-orange-100">
                            {t.status}
                          </div>
                          <div className="text-xs text-slate-500 mt-1">
                            {t.deadline
                              ? String(t.deadline).slice(0, 10)
                              : 'No due'}
                          </div>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

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
                <span className="text-sm text-slate-400 font-normal">
                  ({leads.length})
                </span>
              </h2>
              <div className="text-xs text-slate-400">
                Team:{' '}
                <span className="font-mono">{selectedTeamId || '—'}</span>
              </div>
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
                  {leads.map((l) => {
                    const assignedMember = members.find(
                      (m) => m.id === l.assignedTo
                    );
                    const assignedLabel =
                      l.assignedToName ||
                      assignedMember?.email ||
                      assignedMember?.name ||
                      'Unassigned';

                    return (
                      <li
                        key={l.id}
                        className="rounded-lg border border-slate-700 bg-slate-900/50 px-3 py-2"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1">
                            <div className="text-sm font-medium text-slate-100 truncate">
                              {l.name}
                            </div>
                            <div className="text-xs text-slate-400 mt-1 truncate">
                              ID: {l.id}
                            </div>
                            {l.notes && (
                              <div className="text-xs text-slate-300 mt-1 italic truncate">
                                Notes: {l.notes}
                              </div>
                            )}

                            <div className="mt-2 text-xs text-slate-300">
                              <span className="font-semibold">
                                Assigned to:
                              </span>{' '}
                              {assignedLabel}
                              {l.assignedRole && (
                                <span className="ml-1 text-slate-400">
                                  ({l.assignedRole})
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="text-right w-40 flex flex-col items-end gap-2">
                            <div
                              className={`text-[10px] font-bold rounded-full px-2 py-0.5 ${
                                l.status === 'Closed Won' ||
                                l.status === 'Complete'
                                  ? 'bg-green-600/50 border-green-400 text-green-100'
                                  : 'bg-orange-600/40 border-orange-400 text-orange-100'
                              }`}
                            >
                              {l.status}
                            </div>

                            <select
                              value={l.assignedTo || ''}
                              onChange={(e) =>
                                handleAssignLeadOwner(l.id, e.target.value)
                              }
                              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[11px] text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                            >
                              <option value="">Unassigned</option>
                              {assignableMembers.map((m) => (
                                <option key={m.id} value={m.id}>
                                  {m.email || m.name || m.id} ({m.role})
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            <div className="mt-6 pt-6 border-t border-slate-700">
              <h3 className="text-lg font-bold text-emerald-300 mb-3">
                Create New Lead
              </h3>
              {!selectedTeamId ? (
                <p className="text-slate-400">
                  Select a team first to create leads.
                </p>
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
                      onClick={() => {
                        setLeadName('');
                        setLeadStatus('Pending');
                        setLeadNotes('');
                      }}
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

        <footer className="mt-10 text-[11px] text-slate-500 text-center border-t border-slate-800 pt-4">
          &copy; {new Date().getFullYear()} Lead Management System. Powered by
          Next.js & Firebase.
        </footer>
      </div>
    </div>
  );
}
