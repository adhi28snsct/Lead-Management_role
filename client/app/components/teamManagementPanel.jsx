'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  addDoc,
  updateDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebaseClient';

// --- ICONS ---
const PlusCircleIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V7z"
      clipRule="evenodd"
    />
  </svg>
);

const SettingsIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" viewBox="0 0 20 20" fill="currentColor">
    <path
      fillRule="evenodd"
      d="M11.49 3.17c-.38-.28-.86-.51-1.4-.66-.64-.17-1.29-.22-1.94-.12C5.64 3.09 4.34 4.04 3.6 5.24c-.74 1.2-.84 2.58-.33 3.93.51 1.35 1.7 2.37 3.08 2.76 1.38.39 2.8-.02 4.02-.95 1.22-.93 1.83-2.3 1.63-3.72-.2-1.42-.91-2.73-2.09-3.7zM16.48 10.3c.08.18.17.36.26.54.34.78.6 1.62.6 2.5a6 6 0 01-5.9 6.01L10 19.99h.01a6 6 0 01-6.01-5.9.999.999 0 01.07-.37l.03-.07c.3-.67.76-1.28 1.34-1.8.58-.52 1.25-.92 1.98-1.18.73-.26 1.5-.32 2.27-.18 1.5.28 2.87 1.05 3.93 2.1l.01.01.01.01z"
      clipRule="evenodd"
    />
  </svg>
);

const RoleIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-4 w-4 inline-block align-text-bottom mr-1"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path d="M10 2a5 5 0 00-5 5v2a2 2 0 00-2 2v5a2 2 0 002 2h10a2 2 0 002-2v-5a2 2 0 00-2-2V7a5 5 0 00-5-5zm-9 9a1 1 0 011-1h16a1 1 0 110 2H2a1 1 0 01-1-1z" />
  </svg>
);

const UpgradeIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
  </svg>
);

const TrashIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
    />
  </svg>
);

const ErrorIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6 mr-2"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const SuccessIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6 mr-2"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const WarningIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6 mr-2"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
    />
  </svg>
);

// --- MAIN COMPONENT ---
export default function TeamManagementPanel({ users }) {
  const [teams, setTeams] = useState([]);
  const [members, setMembers] = useState([]);

  const [newTeamName, setNewTeamName] = useState('');
  const [teamAdminUid, setTeamAdminUid] = useState('');

  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMemberUid, setSelectedMemberUid] = useState('');

  const [feedbackMsg, setFeedbackMsg] = useState(null);
  const [activeAccordion, setActiveAccordion] = useState('create');

  const [isCreating, setIsCreating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);

  // Fetch all teams
  const loadTeams = useCallback(async () => {
    try {
      const snap = await getDocs(collection(db, 'teams'));
      setTeams(
        snap.docs.map((d) => ({
          id: d.id,
          name: d.data().name || `(Name Missing for ID: ${d.id.substring(0, 8)}...)`,
          ...d.data(),
        }))
      );
    } catch (err) {
      console.error('Load teams error:', err);
      setFeedbackMsg({ type: 'error', message: 'Failed to load teams' });
    }
  }, []);

  // Fetch members of selected team
  const loadMembers = useCallback(async (teamId) => {
    if (!teamId) {
      setMembers([]);
      return;
    }
    try {
      const snap = await getDocs(collection(db, 'teams', teamId, 'members'));
      setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() })));
    } catch (err) {
      console.error('Load members error:', err);
      setFeedbackMsg({ type: 'error', message: 'Failed to load team members' });
    }
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  useEffect(() => {
    if (selectedTeamId) loadMembers(selectedTeamId);
    else setMembers([]);
  }, [selectedTeamId, loadMembers]);

  // -----------------------------
  // CREATE TEAM (Admin only)
  // -----------------------------
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setFeedbackMsg(null);

    if (!newTeamName || !teamAdminUid) {
      setFeedbackMsg({ type: 'error', message: 'Team name & Team Admin required.' });
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setFeedbackMsg({ type: 'error', message: 'You must be logged in to create a team.' });
      return;
    }

    setIsCreating(true);
    try {
      // Check for duplicate name
      if (teams.some((t) => t.name.toLowerCase() === newTeamName.toLowerCase())) {
        setFeedbackMsg({
          type: 'error',
          message: `Team **${newTeamName}** already exists.`,
        });
        setIsCreating(false);
        return;
      }

      // Create team document (matches rules: /teams/{teamId})
      const teamRef = await addDoc(collection(db, 'teams'), {
        name: newTeamName,
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });

      // Assign team admin into members subcollection
      await setDoc(doc(db, 'teams', teamRef.id, 'members', teamAdminUid), {
        role: 'TeamAdmin',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });

      setFeedbackMsg({
        type: 'success',
        message: `Team **${newTeamName}** created successfully!`,
      });
      setNewTeamName('');
      setTeamAdminUid('');

      await loadTeams();
      setSelectedTeamId(teamRef.id);
      setActiveAccordion('manage');
    } catch (err) {
      console.error('Create team error:', err);
      setFeedbackMsg({
        type: 'error',
        message: 'Failed to create team: ' + (err.message || err.code || 'Unknown error'),
      });
    }

    setIsCreating(false);
  };

  // -----------------------------
  // ADD MEMBER
  // -----------------------------
  const handleAddMember = async () => {
    setFeedbackMsg(null);

    if (!selectedTeamId || !selectedMemberUid) {
      setFeedbackMsg({ type: 'error', message: 'Choose team & user to add.' });
      return;
    }

    if (members.some((m) => m.uid === selectedMemberUid)) {
      setFeedbackMsg({ type: 'warning', message: 'User already in team.' });
      setSelectedMemberUid('');
      return;
    }

    const currentUser = auth.currentUser;
    if (!currentUser) {
      setFeedbackMsg({ type: 'error', message: 'You must be logged in to add members.' });
      return;
    }

    setIsAdding(true);
    try {
      await setDoc(doc(db, 'teams', selectedTeamId, 'members', selectedMemberUid), {
        role: 'Executive',
        createdBy: currentUser.uid,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
      });

      setFeedbackMsg({
        type: 'success',
        message: 'Member added as **Executive**.',
      });
      loadMembers(selectedTeamId);
      setSelectedMemberUid('');
    } catch (err) {
      console.error('Add member error:', err);
      setFeedbackMsg({
        type: 'error',
        message: 'Failed to add member: ' + (err.message || err.code || 'Unknown error'),
      });
    }

    setIsAdding(false);
  };

  // -----------------------------
  // PROMOTE
  // -----------------------------
  const handlePromoteToMaster = async (uid) => {
    if (!window.confirm(`Promote ${getUserEmail(uid)} to Master role in **${selectedTeamName}**?`)) return;

    try {
      await updateDoc(doc(db, 'teams', selectedTeamId, 'members', uid), {
        role: 'Master',
        lastModified: serverTimestamp(),
      });

      setFeedbackMsg({
        type: 'success',
        message: `Member **${getUserEmail(uid)}** successfully promoted to **Master**.`,
      });
      loadMembers(selectedTeamId);
    } catch (err) {
      console.error('Promote error:', err);
      setFeedbackMsg({
        type: 'error',
        message: 'Failed to promote: ' + (err.message || err.code || 'Unknown error'),
      });
    }
  };

  // -----------------------------
  // REMOVE MEMBER
  // -----------------------------
  const handleRemoveMember = async (uid) => {
    if (!window.confirm(`Are you sure you want to remove ${getUserEmail(uid)} from **${selectedTeamName}**?`)) return;

    try {
      await deleteDoc(doc(db, 'teams', selectedTeamId, 'members', uid));
      setFeedbackMsg({
        type: 'success',
        message: `Member **${getUserEmail(uid)}** successfully removed.`,
      });
      loadMembers(selectedTeamId);
    } catch (err) {
      console.error('Remove member error:', err);
      setFeedbackMsg({
        type: 'error',
        message: 'Failed to remove: ' + (err.message || err.code || 'Unknown error'),
      });
    }
  };

  // -----------------------------
  // STYLING HELPERS
  // -----------------------------
  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'TeamAdmin':
        return 'bg-violet-600 text-white font-semibold';
      case 'Master':
        return 'bg-amber-400 text-gray-900 font-semibold';
      case 'Executive':
        return 'bg-emerald-500 text-white font-semibold';
      default:
        return 'bg-gray-400 text-black';
    }
  };

  const getUserEmail = (uid) => {
    const u = users.find((x) => x.uid === uid);
    return u?.email || `${uid.substring(0, 8)}... (Unknown User)`;
  };

  const renderFeedback = () => {
    if (!feedbackMsg) return null;

    let classes =
      'p-3 sm:p-4 flex items-start sm:items-center gap-2 rounded-xl border-l-4 font-medium shadow-md bg-white/90 backdrop-blur-md';
    let Icon = SuccessIcon;

    switch (feedbackMsg.type) {
      case 'success':
        classes += ' border-green-600 text-green-800';
        Icon = SuccessIcon;
        break;
      case 'error':
        classes += ' border-red-600 text-red-800';
        Icon = ErrorIcon;
        break;
      case 'warning':
        classes += ' border-yellow-600 text-yellow-800';
        Icon = WarningIcon;
        break;
      default:
        classes += ' border-gray-600 text-gray-800';
    }

    return (
      <div className="relative">
        <div className={classes} role="alert">
          <Icon />
          <div
            className="text-sm sm:text-base"
            dangerouslySetInnerHTML={{
              __html: feedbackMsg.message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>'),
            }}
          />
        </div>
      </div>
    );
  };

  const selectedTeamName = teams.find((t) => t.id === selectedTeamId)?.name;
  const totalTeams = teams.length;
  const totalMembersInSelectedTeam = members.length;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-900 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto space-y-6 bg-white/95 shadow-2xl shadow-violet-500/20 rounded-2xl border border-white/40 p-6 md:p-8 backdrop-blur">
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-violet-100 pb-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-gray-900 flex items-center gap-2">
              🚀 Team Management Console
            </h2>
            <p className="mt-1 text-sm md:text-base text-gray-500 max-w-2xl">
              Create teams, assign admins, and manage roles for your organization in one clean dashboard.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="px-3 py-2 rounded-xl bg-violet-50 border border-violet-100 text-xs sm:text-sm text-violet-700">
              <div className="font-semibold">Total Teams</div>
              <div className="text-lg sm:text-xl font-extrabold">{totalTeams}</div>
            </div>
            {selectedTeamId && (
              <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-100 text-xs sm:text-sm text-slate-700">
                <div className="font-semibold">Members in {selectedTeamName || 'Team'}</div>
                <div className="text-lg sm:text-xl font-extrabold">{totalMembersInSelectedTeam}</div>
              </div>
            )}
          </div>
        </header>

        {renderFeedback()}

        {/* Create & Manage sections in a responsive grid */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1.3fr)]">
          {/* Create Team */}
          <section className="rounded-2xl overflow-hidden shadow-lg border border-violet-100 bg-gradient-to-br from-violet-600 to-indigo-600 text-white">
            <button
              className="w-full p-4 flex items-center justify-between text-left font-bold transition duration-200"
              onClick={() => setActiveAccordion(activeAccordion === 'create' ? '' : 'create')}
              aria-expanded={activeAccordion === 'create'}
            >
              <div className="flex items-center">
                <PlusCircleIcon /> <span>Create New Team</span>
              </div>
              <span className="text-2xl transform transition-transform duration-300">
                {activeAccordion === 'create' ? '−' : '+'}
              </span>
            </button>

            {activeAccordion === 'create' && (
              <form
                onSubmit={handleCreateTeam}
                className="p-5 sm:p-6 space-y-5 bg-white/10 backdrop-blur-sm animate-fade-in"
              >
                <div>
                  <label
                    htmlFor="teamName"
                    className="block text-xs sm:text-sm font-semibold text-violet-50 mb-1 tracking-wide"
                  >
                    Team Name
                  </label>
                  <input
                    id="teamName"
                    type="text"
                    placeholder="e.g., Product Ninjas, Marketing Titans"
                    className="mt-1 w-full p-3 rounded-xl border border-violet-200/70 bg-white/90 text-gray-900 shadow-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition duration-150 text-sm"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    required
                  />
                  <p className="mt-1 text-[11px] text-violet-100">
                    Use a clear, recognizable name. This will be visible to all members.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="teamAdmin"
                    className="block text-xs sm:text-sm font-semibold text-violet-50 mb-1 tracking-wide"
                  >
                    Select Team Admin
                  </label>
                  <select
                    id="teamAdmin"
                    className="mt-1 w-full p-3 rounded-xl border border-violet-200/70 bg-white/90 text-gray-900 shadow-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition duration-150 text-sm"
                    value={teamAdminUid}
                    onChange={(e) => setTeamAdminUid(e.target.value)}
                    required
                  >
                    <option value="" disabled>
                      Choose a user to be the Admin
                    </option>
                    {users.map((u) => (
                      <option key={u.uid} value={u.uid}>
                        {u.email}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-violet-100">
                    Admins can manage members and have the highest control inside the team.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isCreating}
                  className={`flex items-center justify-center w-full p-3 rounded-xl text-sm sm:text-base font-semibold transition duration-200 shadow-md hover:shadow-xl
                    ${
                      isCreating
                        ? 'bg-violet-400 cursor-not-allowed'
                        : 'bg-white text-violet-700 hover:bg-violet-50'
                    }`}
                >
                  {isCreating ? 'Creating Team…' : 'Create Team'}
                </button>
              </form>
            )}
          </section>

          {/* Manage Teams */}
          <section className="rounded-2xl overflow-hidden shadow-lg border border-slate-200 bg-slate-50/80">
            <button
              className="w-full p-4 flex items-center justify-between text-left bg-slate-900 hover:bg-slate-800 text-white text-lg font-bold transition duration-200"
              onClick={() => setActiveAccordion(activeAccordion === 'manage' ? '' : 'manage')}
              aria-expanded={activeAccordion === 'manage'}
            >
              <div className="flex items-center">
                <SettingsIcon /> <span>Manage Teams</span>
              </div>
              <span className="text-2xl transform transition-transform duration-300">
                {activeAccordion === 'manage' ? '−' : '+'}
              </span>
            </button>

            {activeAccordion === 'manage' && (
              <div className="p-5 sm:p-6 space-y-6 bg-slate-50/80 animate-fade-in">
                {/* Team selector */}
                <div className="space-y-1">
                  <label
                    htmlFor="selectTeam"
                    className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 tracking-wide"
                  >
                    Select Team to Manage
                  </label>
                  <select
                    id="selectTeam"
                    className="mt-1 w-full p-3 border border-gray-300 rounded-xl shadow-sm bg-white text-sm focus:ring-2 focus:ring-violet-500 focus:border-violet-500 transition duration-150"
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                  >
                    <option value="">-- Choose a Team --</option>
                    {teams.map((team) => (
                      <option key={team.id} value={team.id}>
                        {team.name}
                      </option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-gray-500">
                    Pick a team to view its members, promote roles, or remove access.
                  </p>
                </div>

                {selectedTeamId && (
                  <div className="space-y-6 p-4 border border-slate-200 rounded-2xl bg-white shadow-inner">
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-slate-100 pb-3">
                      <h3 className="text-lg sm:text-xl font-bold text-gray-800">
                        <span className="text-sm font-semibold text-violet-600 uppercase tracking-wide block">
                          Current Team
                        </span>
                        {selectedTeamName}
                      </h3>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="px-2 py-1 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                          Members: <strong>{members.length}</strong>
                        </span>
                        <span className="px-2 py-1 rounded-full bg-violet-50 text-violet-700 border border-violet-100">
                          Admins:{' '}
                          <strong>{members.filter((m) => m.role === 'TeamAdmin').length}</strong>
                        </span>
                        <span className="px-2 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-100">
                          Masters: <strong>{members.filter((m) => m.role === 'Master').length}</strong>
                        </span>
                        <span className="px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                          Executives:{' '}
                          <strong>{members.filter((m) => m.role === 'Executive').length}</strong>
                        </span>
                      </div>
                    </div>

                    {/* Add New Executive */}
                    <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
                      <div className="flex-1 w-full">
                        <label className="block text-xs sm:text-sm font-semibold text-gray-700 mb-1 tracking-wide">
                          Add New Executive
                        </label>
                        <select
                          className="w-full p-3 border border-gray-300 rounded-xl shadow-sm bg-white text-sm focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
                          value={selectedMemberUid}
                          onChange={(e) => setSelectedMemberUid(e.target.value)}
                        >
                          <option value="">Select user to add as Executive</option>
                          {users
                            .filter((u) => !members.some((m) => m.uid === u.uid))
                            .map((u) => (
                              <option key={u.uid} value={u.uid}>
                                {u.email}
                              </option>
                            ))}
                        </select>
                        <p className="mt-1 text-[11px] text-gray-500">
                          Executives can view and work inside the team but have limited admin permissions.
                        </p>
                      </div>

                      <button
                        onClick={handleAddMember}
                        disabled={isAdding || !selectedMemberUid}
                        className={`flex items-center justify-center px-6 py-3 rounded-xl text-white text-sm sm:text-base font-semibold transition duration-200 min-w-[150px]
                          ${
                            isAdding || !selectedMemberUid
                              ? 'bg-emerald-300 cursor-not-allowed'
                              : 'bg-emerald-600 hover:bg-emerald-700 shadow-md hover:shadow-lg'
                          }`}
                      >
                        {isAdding ? 'Adding…' : 'Add Member'}
                      </button>
                    </div>

                    {/* Members Table */}
                    <div className="overflow-hidden rounded-2xl border border-slate-100 mt-4 bg-slate-50">
                      <div className="overflow-x-auto">
                        <table className="min-w-full divide-y divide-slate-200 text-sm">
                          <thead className="bg-slate-100/80">
                            <tr>
                              <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                Member
                              </th>
                              <th className="px-6 py-3 text-left text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                Role
                              </th>
                              <th className="px-6 py-3 text-right text-[11px] font-semibold text-slate-600 uppercase tracking-wider">
                                Actions
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-slate-100">
                            {members.length === 0 ? (
                              <tr className="bg-slate-50/80">
                                <td
                                  colSpan="3"
                                  className="px-6 py-6 text-center text-sm text-slate-500"
                                >
                                  No members in this team yet. Add executives to get started.
                                </td>
                              </tr>
                            ) : (
                              members.map((m) => (
                                <tr
                                  key={m.uid}
                                  className={`hover:bg-violet-50/50 transition duration-150 ${
                                    m.role === 'TeamAdmin' ? 'bg-violet-50/70' : ''
                                  }`}
                                >
                                  <td className="px-6 py-3 whitespace-nowrap text-sm text-gray-900 font-medium">
                                    {getUserEmail(m.uid)}
                                  </td>

                                  <td className="px-6 py-3 whitespace-nowrap">
                                    <span
                                      className={`px-3 py-1 inline-flex items-center text-[11px] leading-5 rounded-full shadow-sm ${getRoleBadgeClass(
                                        m.role
                                      )}`}
                                    >
                                      <RoleIcon /> {m.role}
                                    </span>
                                  </td>

                                  <td className="px-6 py-3 whitespace-nowrap text-right text-xs font-medium space-x-2">
                                    {m.role === 'Executive' && (
                                      <button
                                        onClick={() => handlePromoteToMaster(m.uid)}
                                        title="Promote to Master"
                                        className="inline-flex items-center p-2 border border-transparent leading-4 rounded-full shadow-sm text-white bg-amber-500 hover:bg-amber-600 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-amber-500 transition duration-150"
                                      >
                                        <UpgradeIcon />
                                      </button>
                                    )}

                                    {m.role !== 'TeamAdmin' && (
                                      <button
                                        onClick={() => handleRemoveMember(m.uid)}
                                        title="Remove Member"
                                        className="inline-flex items-center p-2 border border-transparent leading-4 rounded-full shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-red-500 transition duration-150"
                                      >
                                        <TrashIcon />
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
