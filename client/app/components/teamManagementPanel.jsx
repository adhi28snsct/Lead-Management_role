'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  doc,
  getDocs,
  setDoc,
  deleteDoc,
  updateDoc,
  addDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../../lib/firebaseClient';

// Helper function to get user email from UID using the 'users' prop
const getUserEmailByUid = (uid, users) => {
  const user = users.find(u => u.uid === uid);
  // Assume user object contains email if loaded by DashboardPage
  return user ? user.email : 'User Not Found';
};

export default function TeamManagementPanel({ users }) {
  const [teams, setTeams] = useState([]);
  const [newTeamName, setNewTeamName] = useState('');
  const [teamAdminUid, setTeamAdminUid] = useState('');
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [selectedMemberUid, setSelectedMemberUid] = useState('');
  const [members, setMembers] = useState([]);
  const [activeAccordion, setActiveAccordion] = useState('create');
  const [isCreating, setIsCreating] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState(null);

  // Helper to determine role badge class
  const getRoleBadgeClass = (role) => {
    switch (role) {
      case 'TeamAdmin':
        return 'bg-pink-500 text-white font-semibold border-pink-700';
      case 'Master':
        return 'bg-yellow-500 text-gray-900 font-semibold border-yellow-700';
      case 'Executive':
        return 'bg-blue-500 text-white font-semibold border-blue-700';
      default:
        return 'bg-gray-400 text-gray-900 border-gray-600';
    }
  };


  // --- Data Loading Logic ---
  useEffect(() => {
    loadTeams();
  }, []);

  useEffect(() => {
    if (selectedTeamId) loadMembers(selectedTeamId);
    else setMembers([]);
  }, [selectedTeamId]);

  const loadTeams = async () => {
    try {
      const snap = await getDocs(collection(db, 'teams'));
      setTeams(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })));
    } catch (error) {
        console.error("Error loading teams:", error);
        setFeedbackMsg({ type: 'error', message: 'Failed to load team data.' });
    }
  };

  const loadMembers = async (teamId) => {
    try {
      const snap = await getDocs(collection(db, 'teams', teamId, 'members'));
      setMembers(snap.docs.map((doc) => ({ uid: doc.id, ...doc.data() })));
    } catch (error) {
        console.error("Error loading members:", error);
        setFeedbackMsg({ type: 'error', message: `Failed to load members for team ${teamId}.` });
    }
  };


  // --- Handlers ---
  const handleCreateTeam = async (e) => {
    e.preventDefault();
    setFeedbackMsg(null);
    if (!newTeamName || !teamAdminUid) {
        setFeedbackMsg({ type: 'error', message: 'Team name and Team Admin must be selected.' });
        return;
    }
    
    setIsCreating(true);
    try {
        const teamRef = await addDoc(collection(db, 'teams'), {
            teamName: newTeamName,
            createdBy: auth.currentUser.uid,
            createdAt: serverTimestamp(),
        });

        await setDoc(doc(db, 'teams', teamRef.id, 'members', teamAdminUid), {
            role: 'TeamAdmin',
            addedBy: auth.currentUser.uid,
            addedAt: serverTimestamp(),
        });

        setFeedbackMsg({ type: 'success', message: `Team '${newTeamName}' created successfully.` });
        setNewTeamName('');
        setTeamAdminUid('');
        loadTeams();
        setSelectedTeamId(teamRef.id);
        setActiveAccordion('manage');
    } catch (error) {
        console.error('Error creating team:', error);
        setFeedbackMsg({ type: 'error', message: `Failed to create team: ${error.message}` });
    } finally {
      setIsCreating(false);
    }
  };

  const handleAddMember = async () => {
    setFeedbackMsg(null);
    if (!selectedTeamId || !selectedMemberUid) {
        setFeedbackMsg({ type: 'error', message: 'Please select both a team and a user to add.' });
        return;
    }

    if (members.some(m => m.uid === selectedMemberUid)) {
        setFeedbackMsg({ type: 'warning', message: 'This user is already a member of the selected team.' });
        setSelectedMemberUid('');
        return;
    }
    
    setIsAdding(true);
    try {
        await setDoc(doc(db, 'teams', selectedTeamId, 'members', selectedMemberUid), {
            role: 'Executive', // Default role upon adding
            addedBy: auth.currentUser.uid,
            addedAt: serverTimestamp(),
        });
        setFeedbackMsg({ type: 'success', message: 'Member added successfully (Default role: Executive).' });
        setSelectedMemberUid('');
        loadMembers(selectedTeamId);
    } catch (error) {
        console.error('Error adding member:', error);
        setFeedbackMsg({ type: 'error', message: `Failed to add member: ${error.message}` });
    } finally {
      setIsAdding(false);
    }
  };

  const handlePromoteToMaster = async (uid) => {
    setFeedbackMsg(null);
    if (!selectedTeamId) return;
    try {
        await updateDoc(doc(db, 'teams', selectedTeamId, 'members', uid), {
            role: 'Master',
            lastModified: serverTimestamp(),
        });
        setFeedbackMsg({ type: 'success', message: 'Promoted to Master successfully.' });
        loadMembers(selectedTeamId);
    } catch (error) {
        console.error('Error promoting member:', error);
        setFeedbackMsg({ type: 'error', message: `Failed to promote member: ${error.message}` });
    }
  };

  const handleRemoveMember = async (uid) => {
    setFeedbackMsg(null);
    if (!selectedTeamId) return;
    const memberEmail = getUserEmailByUid(uid, users);

    if (!window.confirm(`Are you sure you want to remove user ${memberEmail} from the team? This action is permanent.`)) return;

    try {
        await deleteDoc(doc(db, 'teams', selectedTeamId, 'members', uid));
        setFeedbackMsg({ type: 'success', message: 'Member removed successfully.' });
        loadMembers(selectedTeamId);
    } catch (error) {
        console.error('Error removing member:', error);
        setFeedbackMsg({ type: 'error', message: `Failed to remove member: ${error.message}` });
    }
  };

  // Helper for message styles
  const getMessageClass = (type) => {
    switch (type) {
        case 'success':
            return 'bg-green-100 border-green-400 text-green-700';
        case 'error':
            return 'bg-red-100 border-red-400 text-red-700';
        case 'warning':
            return 'bg-yellow-100 border-yellow-400 text-yellow-700';
        default:
            return 'bg-gray-100 border-gray-400 text-gray-700';
    }
  }


  // --- UI RENDER ---
  return (
    <div className="space-y-8 p-8 bg-gray-50 rounded-xl shadow-2xl border border-gray-200">
      
      {/* HEADER */}
      <h2 className="text-3xl font-extrabold text-gray-900 border-b-2 border-blue-100 pb-3 flex items-center space-x-3">
        <span className="text-blue-600 text-3xl">🏗️</span>
        <span>Team Management</span> 
      </h2>

      {/* FEEDBACK/ERROR MESSAGE */}
      {feedbackMsg && (
        <div 
          className={`p-4 border-l-4 rounded-md shadow-inner transition duration-200 ${getMessageClass(feedbackMsg.type)}`}
          role="alert"
        >
            <p className="font-semibold">{feedbackMsg.type.toUpperCase()}:</p>
            <p className="text-sm">{feedbackMsg.message}</p>
        </div>
      )}

      {/* --- Section 1: Create Team (Accordion Card) --- */}
      <section className="border border-blue-300/50 rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => setActiveAccordion(activeAccordion === 'create' ? null : 'create')}
          className="w-full text-left p-4 text-xl font-bold bg-blue-600 text-white hover:bg-blue-700 transition flex justify-between items-center"
        >
          <span><span className="mr-3 text-2xl">➕</span> Create New Team</span>
          <span className="text-2xl transform transition-transform duration-300">
            {activeAccordion === 'create' ? '▼' : '►'}
          </span>
        </button>

        {activeAccordion === 'create' && (
          <form onSubmit={handleCreateTeam} className="p-6 space-y-5 bg-white">
            <input
              type="text"
              placeholder="Team Name (e.g., Alpha Squad)"
              value={newTeamName}
              onChange={(e) => setNewTeamName(e.target.value)}
              className="border-2 border-gray-300 rounded-xl px-4 py-2 w-full focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
              required
            />
            <select
              value={teamAdminUid}
              onChange={(e) => setTeamAdminUid(e.target.value)}
              className="border-2 border-gray-300 rounded-xl px-4 py-2 w-full bg-white text-gray-800 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
              required
            >
              <option value="" disabled>Select Team Admin to assign (Required)</option>
              {users
                .filter((u) => u.role === 'TeamAdmin')
                .map((u) => (
                  <option key={u.uid} value={u.uid}>
                    {u.email || `UID: ${u.uid.substring(0, 8)}...`}
                  </option>
                ))}
            </select>
            <button 
              type="submit" 
              className={`w-full font-bold py-3 rounded-xl transition duration-150 shadow-md text-white text-lg ${isCreating ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              disabled={isCreating}
            >
              {isCreating ? 'Creating Team...' : 'Create Team and Assign Admin'}
            </button>
          </form>
        )}
      </section>
      
      {/* --- Section 2: Manage Team Members (Accordion Card) --- */}
      <section className="border border-blue-300/50 rounded-xl overflow-hidden shadow-lg">
        <button
          onClick={() => setActiveAccordion(activeAccordion === 'manage' ? null : 'manage')}
          className="w-full text-left p-4 text-xl font-bold bg-gray-700 text-white hover:bg-gray-800 transition flex justify-between items-center"
        >
          <span><span className="mr-3 text-2xl">⚙️</span> Manage Existing Teams & Members</span>
          <span className="text-2xl transform transition-transform duration-300">
            {activeAccordion === 'manage' ? '▼' : '►'}
          </span>
        </button>

        {activeAccordion === 'manage' && (
          <div className="p-6 space-y-6 bg-white">
            
            {/* Team Selection and Member Addition */}
            <div className="space-y-4 p-5 border-2 border-gray-100 rounded-xl bg-white shadow-inner">
                
                <h4 className="font-bold text-gray-800 text-lg">1. Team Selection</h4>
                <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="border-2 border-blue-300 rounded-xl px-4 py-2 w-full bg-white text-gray-800 focus:ring-blue-500 focus:border-blue-500 transition shadow-sm"
                >
                    <option value="">-- Select a Team --</option>
                    {teams.map((team) => (
                        <option key={team.id} value={team.id}>
                            {team.teamName} ({team.id.substring(0, 4)}...)
                        </option>
                    ))}
                </select>
                
                {selectedTeamId && (
                    <>
                    <h4 className="font-bold text-gray-800 text-lg pt-4">2. Add New Member (Executive Role Default)</h4>
                    <div className="flex space-x-3">
                        <select
                            value={selectedMemberUid}
                            onChange={(e) => setSelectedMemberUid(e.target.value)}
                            className="border-2 border-gray-300 rounded-xl px-4 py-2 flex-grow bg-white text-gray-800 focus:ring-green-500 focus:border-green-500 transition shadow-sm"
                            disabled={isAdding}
                        >
                            <option value="">Select User (Executive/Master role)</option>
                            {users
                                .filter((u) => u.role === 'Executive' || u.role === 'Master')
                                .map((u) => (
                                <option key={u.uid} value={u.uid}>
                                    {u.email || `UID: ${u.uid.substring(0, 8)}...`}
                                </option>
                                ))}
                        </select>
                        <button
                            type="button"
                            onClick={handleAddMember}
                            className={`font-bold py-2 px-4 rounded-xl transition duration-150 whitespace-nowrap shadow-md text-white ${isAdding ? 'bg-gray-400 cursor-not-allowed' : 'bg-green-600 hover:bg-green-700'}`}
                            disabled={isAdding || !selectedMemberUid}
                        >
                            {isAdding ? 'Adding...' : 'Add Member'}
                        </button>
                    </div>
                    </>
                )}
            </div>

            {/* Member List Table */}
            {selectedTeamId && (
                <div className="mt-6">
                    <h3 className="text-xl font-bold mb-4 text-gray-800 border-l-4 border-blue-400 pl-3">
                        Team Roster
                    </h3>

                    {members.length === 0 ? (
                        <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 rounded-md">
                            No members found in this team. The admin user should be here.
                        </div>
                    ) : (
                        <div className="bg-white border-2 border-gray-100 rounded-xl shadow-lg overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-blue-50">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-extrabold text-blue-700 uppercase tracking-wider">
                                            User Email / UID
                                        </th>
                                        <th className="px-6 py-4 text-left text-xs font-extrabold text-blue-700 uppercase tracking-wider w-32">
                                            Team Role
                                        </th>
                                        <th className="px-6 py-4 text-right text-xs font-extrabold text-blue-700 uppercase tracking-wider w-40">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-100">
                                    {members.map((m) => (
                                        <tr key={m.uid} className="hover:bg-gray-50 transition duration-100">
                                            <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                                {getUserEmailByUid(m.uid, users)}
                                                <p className="text-xs text-gray-500 font-mono mt-0.5" title="User UID">
                                                    ID: {m.uid.substring(0, 10)}...
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <span 
                                                    className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-full border ${getRoleBadgeClass(m.role)}`}
                                                >
                                                    {m.role}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium space-x-2">
                                                {/* Promote Button */}
                                                {m.role !== 'TeamAdmin' && (
                                                    <button
                                                        onClick={() => handlePromoteToMaster(m.uid)}
                                                        className={`font-semibold px-3 py-1 rounded-lg transition disabled:opacity-50 text-white shadow-sm text-xs ${m.role === 'Master' ? 'bg-yellow-800' : 'bg-yellow-600 hover:bg-yellow-700'}`}
                                                        disabled={m.role === 'Master'}
                                                        title={m.role === 'Master' ? 'Highest non-admin role achieved' : 'Promote to Master'}
                                                    >
                                                        {m.role === 'Master' ? 'Master' : 'Promote'}
                                                    </button>
                                                )}
                                                
                                                {/* Remove Button (Cannot remove the primary TeamAdmin) */}
                                                {m.role !== 'TeamAdmin' ? (
                                                    <button
                                                        onClick={() => handleRemoveMember(m.uid)}
                                                        className="bg-red-600 hover:bg-red-700 text-white font-semibold px-3 py-1 rounded-lg transition shadow-sm text-xs"
                                                    >
                                                        Remove
                                                    </button>
                                                ) : (
                                                    <span className="text-xs text-gray-500 font-semibold">(Primary Admin)</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}