'use client';

import { useState, useEffect } from 'react';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebaseClient';
// import { FiUserPlus, FiSend } from 'react-icons/fi'; // Recommended icons

const LEAD_STATUS = ['New', 'Contacted', 'Qualified', 'Lost'];

export default function LeadCreationPanel({ users, teams }) {
  const [leadForm, setLeadForm] = useState({
    teamId: '',
    assignedTeamAdmin: '',
    name: '',
    email: '',
    contactNumber: '',
    source: '',
    notes: '',
    status: 'New',
  });
  const [teamAdmins, setTeamAdmins] = useState([]); 
  const [isSubmitting, setIsSubmitting] = useState(false);

  // --- Filtering Team Admins based on selected Team ---
  useEffect(() => {
    // Reset assigned admin whenever the team changes
    setLeadForm((p) => ({ ...p, assignedTeamAdmin: '' }));
    setTeamAdmins([]);
    
    const fetchTeamAdmins = async () => {
        if (!leadForm.teamId) return;

        // 1. Find the users globally marked as TeamAdmin
        const potentialAdmins = users.filter(u => u.role === 'TeamAdmin');
        
        // 2. Verify if these potential admins are actual members of the selected team
        const adminsInTeam = [];
        for (const admin of potentialAdmins) {
            const memberRef = doc(db, 'teams', leadForm.teamId, 'members', admin.uid);
            const memberSnap = await getDoc(memberRef);
            
            if (memberSnap.exists()) {
                adminsInTeam.push(admin);
            }
        }
        setTeamAdmins(adminsInTeam);
    };

    fetchTeamAdmins();
  }, [leadForm.teamId, users]);

  // --- Change Handler ---
  const onChange = (key) => (e) => setLeadForm((p) => ({ ...p, [key]: e.target.value }));

  // --- Lead Creation Handler ---
  const createLead = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { teamId, assignedTeamAdmin, name, email, contactNumber, source, notes, status } =
      leadForm;

    if (!teamId || !assignedTeamAdmin || !name || !email || !contactNumber) {
      alert('Required fields: Team, TeamAdmin, Name, Email, and Contact Number.');
      setIsSubmitting(false);
      return;
    }

    try {
        // Final validation check before creation
        const memberDoc = await getDoc(doc(db, 'teams', teamId, 'members', assignedTeamAdmin));
        if (!memberDoc.exists() || memberDoc.data()?.role !== 'TeamAdmin') {
            alert('Selected user is not a verified TeamAdmin of this team.');
            setIsSubmitting(false);
            return;
        }

        await addDoc(collection(db, 'teams', teamId, 'leads'), {
            name,
            email,
            contactNumber,
            source: source || 'Manual Admin Entry',
            notes: notes || '',
            status,
            createdBy: auth.currentUser.uid,
            createdAt: serverTimestamp(),
            lastModified: serverTimestamp(),
            assignedTo: assignedTeamAdmin,
            assignedRole: 'TeamAdmin',
        });

        alert('Lead created and assigned successfully!');
        // Reset form on success
        setLeadForm({
            teamId: '',
            assignedTeamAdmin: '',
            name: '',
            email: '',
            contactNumber: '',
            source: '',
            notes: '',
            status: 'New',
        });
    } catch (error) {
        console.error('Error creating lead:', error);
        alert(`Lead creation failed: ${error.message}`);
    } finally {
        setIsSubmitting(false);
    }
  };

  // --- UI RENDER ---
  return (
    <div className="bg-white rounded-xl shadow-2xl p-6">
        <h2 className="text-2xl font-bold text-gray-800 mb-6 flex items-center">
            {/* <FiUserPlus className="mr-3 text-purple-600" /> */}
            Manual Lead Intake
        </h2>

        <form onSubmit={createLead} className="space-y-6">
            
            {/* --- Section 1: Assignment Details --- */}
            <div className="border-b pb-4">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">1. Assign Lead</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Team Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Select Team (Required)</label>
                        <select 
                            className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-white focus:ring-purple-500 focus:border-purple-500 transition" 
                            value={leadForm.teamId} 
                            onChange={onChange('teamId')}
                            required
                        >
                            <option value="">-- Select Team --</option>
                            {teams.map((t) => (
                                <option key={t.id} value={t.id}>
                                    {t.teamName}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Team Admin Selection (Filtered) */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Assign to Team Admin (Required)</label>
                        <select
                            className={`border rounded-lg px-3 py-2 w-full bg-white transition ${!leadForm.teamId ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:ring-purple-500 focus:border-purple-500'}`}
                            value={leadForm.assignedTeamAdmin}
                            onChange={onChange('assignedTeamAdmin')}
                            disabled={!leadForm.teamId || teamAdmins.length === 0}
                            required
                        >
                            <option value="">
                                {leadForm.teamId ? 
                                    (teamAdmins.length > 0 ? '-- Select Admin --' : 'No Admins found in this team') 
                                    : 'Select a Team First'}
                            </option>
                            {teamAdmins.map((u) => (
                                <option key={u.uid} value={u.uid}>
                                    {u.email || u.uid.substring(0, 8) + '...'}
                                </option>
                            ))}
                        </select>
                        {leadForm.teamId && teamAdmins.length === 0 && (
                            <p className="mt-1 text-xs text-red-500">No TeamAdmins verified for this selected team.</p>
                        )}
                    </div>
                </div>
            </div>

            {/* --- Section 2: Lead Contact Details --- */}
            <div className="border-b pb-4">
                <h3 className="text-xl font-semibold text-gray-700 mb-4">2. Contact Information</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    
                    {/* Name */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Full Name (Required)</label>
                        <input
                            type="text"
                            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500 transition"
                            value={leadForm.name}
                            onChange={onChange('name')}
                            placeholder="e.g., Jane Doe"
                            required
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Email Address (Required)</label>
                        <input
                            type="email"
                            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500 transition"
                            value={leadForm.email}
                            onChange={onChange('email')}
                            placeholder="e.g., jane@example.com"
                            required
                        />
                    </div>

                    {/* Contact Number */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Contact Number (Required)</label>
                        <input
                            type="text"
                            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500 transition"
                            value={leadForm.contactNumber}
                            onChange={onChange('contactNumber')}
                            placeholder="e.g., +1 (555) 123-4567"
                            required
                        />
                    </div>

                    {/* Source */}
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">Source (Optional)</label>
                        <input
                            type="text"
                            className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500 transition"
                            value={leadForm.source}
                            onChange={onChange('source')}
                            placeholder="e.g., Website, Referral"
                        />
                    </div>
                </div>
            </div>
            
            {/* --- Section 3: Notes and Status --- */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                
                {/* Status */}
                <div>
                    <label className="block text-sm font-medium text-gray-600 mb-1">Status (Default: New)</label>
                    <select
                        className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-white focus:ring-purple-500 focus:border-purple-500 transition"
                        value={leadForm.status}
                        onChange={onChange('status')}
                    >
                        {LEAD_STATUS.map((s) => (
                            <option key={s} value={s}>
                                {s}
                            </option>
                        ))}
                    </select>
                </div>

                {/* Notes */}
                <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-600 mb-1">Notes (Optional)</label>
                    <textarea
                        className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500 transition min-h-[80px]"
                        value={leadForm.notes}
                        onChange={onChange('notes')}
                        placeholder="Any special requirements or initial assessment notes."
                    />
                </div>
            </div>


            {/* --- Submit Button --- */}
            <div className="pt-4 flex justify-end">
                <button 
                    type="submit" 
                    className={`flex items-center justify-center font-bold py-3 px-6 rounded-lg transition duration-300 text-white shadow-lg ${
                        isSubmitting ? 'bg-gray-400 cursor-not-allowed' : 'bg-purple-600 hover:bg-purple-700'
                    }`}
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3"></div>
                            Creating Lead...
                        </>
                    ) : (
                        <>
                            {/* <FiSend className="mr-2" /> */}
                            Create Lead
                        </>
                    )}
                </button>
            </div>
        </form>
    </div>
  );
}