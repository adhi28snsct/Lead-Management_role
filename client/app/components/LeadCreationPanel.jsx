// app/components/LeadCreationPanel.jsx
'use client';

import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../../lib/firebaseClient';

const LEAD_STATUS = ['New', 'Contacted', 'Qualified', 'Lost'];
const EMAIL_REGEX = /^\S+@\S+\.\S+$/;
const PHONE_SIMPLE_REGEX = /^[\d+\-\s().]{6,20}$/; // permissive but practical

export default function LeadCreationPanel({ users = [], teams = [] }) {
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
  const [info, setInfo] = useState({ kind: '', message: '' }); // { kind: 'error'|'success'|'info', message }

  // Reset info banner after short delay
  useEffect(() => {
    if (!info.message) return;
    const t = setTimeout(() => setInfo({ kind: '', message: '' }), 6000);
    return () => clearTimeout(t);
  }, [info]);

  // Fetch and filter TeamAdmins who are members of selected team
  useEffect(() => {
    setLeadForm((p) => ({ ...p, assignedTeamAdmin: '' })); // clear previous assignment
    setTeamAdmins([]);

    const fetchAdminsForTeam = async () => {
      if (!leadForm.teamId) return;

      // 1) gather users with role TeamAdmin
      const potential = users.filter((u) => u.role === 'TeamAdmin');

      if (potential.length === 0) {
        setTeamAdmins([]);
        return;
      }

      // 2) verify membership in selected team in parallel
      try {
        const checks = potential.map(async (u) => {
          const memberRef = doc(db, 'teams', leadForm.teamId, 'members', u.uid);
          const snap = await getDoc(memberRef);
          return snap.exists() ? u : null;
        });

        const results = await Promise.all(checks);
        const adminsInTeam = results.filter(Boolean);
        setTeamAdmins(adminsInTeam);

        // auto-select if exactly one admin, otherwise leave blank for choice
        if (adminsInTeam.length === 1) {
          setLeadForm((p) => ({ ...p, assignedTeamAdmin: adminsInTeam[0].uid }));
        }
      } catch (err) {
        console.error('Failed to verify team admins:', err);
        setInfo({ kind: 'error', message: 'Failed to load team admins — check network or rules.' });
      }
    };

    fetchAdminsForTeam();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadForm.teamId, users]);

  const onChange = (key) => (e) => {
    const val = e?.target?.value ?? '';
    setLeadForm((p) => ({ ...p, [key]: val }));
  };

  const validate = () => {
    const { teamId, assignedTeamAdmin, name, email, contactNumber } = leadForm;
    if (!teamId || !assignedTeamAdmin || !name || !email || !contactNumber) {
      setInfo({ kind: 'error', message: 'Team, Team Admin, Name, Email and Contact Number are required.' });
      return false;
    }
    if (!EMAIL_REGEX.test(email.trim())) {
      setInfo({ kind: 'error', message: 'Please enter a valid email address.' });
      return false;
    }
    if (!PHONE_SIMPLE_REGEX.test(contactNumber.trim())) {
      setInfo({ kind: 'error', message: 'Please enter a valid contact number (min 6 digits).' });
      return false;
    }
    return true;
  };

  const createLead = async (e) => {
    e?.preventDefault();
    if (isSubmitting) return;
    setInfo({ kind: '', message: '' });

    if (!validate()) return;

    setIsSubmitting(true);

    const {
      teamId,
      assignedTeamAdmin,
      name,
      email,
      contactNumber,
      source,
      notes,
      status,
    } = leadForm;

    try {
      // double-check selected admin is actually TeamAdmin inside the team
      const memberRef = doc(db, 'teams', teamId, 'members', assignedTeamAdmin);
      const memberSnap = await getDoc(memberRef);
      if (!memberSnap.exists() || memberSnap.data()?.role !== 'TeamAdmin') {
        setInfo({ kind: 'error', message: 'Selected user is not a verified TeamAdmin for this team.' });
        setIsSubmitting(false);
        return;
      }

      const payload = {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        contactNumber: contactNumber.trim(),
        source: source?.trim() || 'Manual Admin Entry',
        notes: notes?.trim() || '',
        status: status || 'New',
        createdBy: auth.currentUser?.uid || null,
        createdAt: serverTimestamp(),
        lastModified: serverTimestamp(),
        assignedTo: assignedTeamAdmin,
        assignedRole: 'TeamAdmin',
      };

      await addDoc(collection(db, 'teams', teamId, 'leads'), payload);

      setInfo({ kind: 'success', message: 'Lead created and assigned to Team Admin successfully.' });

      // reset form but retain teams list
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
      setTeamAdmins([]);
    } catch (err) {
      console.error('Create lead failed:', err);
      setInfo({ kind: 'error', message: `Lead creation failed: ${err?.message || 'unknown error'}` });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-2xl p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Manual Lead Intake</h2>

      {info.message && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 p-3 rounded ${
            info.kind === 'success' ? 'bg-green-50 border border-green-200 text-green-800' :
            info.kind === 'error' ? 'bg-red-50 border border-red-200 text-red-800' :
            'bg-blue-50 border border-blue-200 text-blue-800'
          }`}
        >
          {info.message}
        </div>
      )}

      <form onSubmit={createLead} className="space-y-6">
        {/* Assignment */}
        <div className="border-b pb-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">1. Assign Lead</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Select Team <span className="text-red-500">*</span></label>
              <select
                aria-label="Select team"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-white focus:ring-purple-500 focus:border-purple-500"
                value={leadForm.teamId}
                onChange={onChange('teamId')}
                required
              >
                <option value="">-- Select Team --</option>
                {teams.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.teamName || t.name || t.id}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Assign to Team Admin <span className="text-red-500">*</span></label>
              <select
                aria-label="Assign to team admin"
                className={`border rounded-lg px-3 py-2 w-full bg-white transition ${
                  !leadForm.teamId ? 'bg-gray-100 cursor-not-allowed' : 'border-gray-300 focus:ring-purple-500 focus:border-purple-500'
                }`}
                value={leadForm.assignedTeamAdmin}
                onChange={onChange('assignedTeamAdmin')}
                disabled={!leadForm.teamId || teamAdmins.length === 0}
                required
              >
                <option value="">
                  {leadForm.teamId
                    ? (teamAdmins.length > 0 ? '-- Select Admin --' : 'No Admins found in this team')
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

        {/* Contact Information */}
        <div className="border-b pb-4">
          <h3 className="text-lg font-semibold text-gray-700 mb-3">2. Contact Information</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Full Name <span className="text-red-500">*</span></label>
              <input
                aria-label="Lead full name"
                type="text"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500"
                value={leadForm.name}
                onChange={onChange('name')}
                placeholder="e.g., Jane Doe"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Email Address <span className="text-red-500">*</span></label>
              <input
                aria-label="Lead email"
                type="email"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500"
                value={leadForm.email}
                onChange={onChange('email')}
                placeholder="e.g., jane@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Contact Number <span className="text-red-500">*</span></label>
              <input
                aria-label="Lead contact number"
                type="tel"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500"
                value={leadForm.contactNumber}
                onChange={onChange('contactNumber')}
                placeholder="e.g., +1 (555) 123-4567"
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-600 mb-1">Source (Optional)</label>
              <input
                aria-label="Lead source"
                type="text"
                className="border border-gray-300 rounded-lg px-3 py-2 w-full focus:ring-purple-500 focus:border-purple-500"
                value={leadForm.source}
                onChange={onChange('source')}
                placeholder="e.g., Website, Referral"
              />
            </div>
          </div>
        </div>

        {/* Notes & Status */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-600 mb-1">Status</label>
            <select
              aria-label="Lead status"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full"
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

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-600 mb-1">Notes (Optional)</label>
            <textarea
              aria-label="Lead notes"
              className="border border-gray-300 rounded-lg px-3 py-2 w-full min-h-[80px]"
              value={leadForm.notes}
              onChange={onChange('notes')}
              placeholder="Any special requirements or initial assessment notes."
            />
          </div>
        </div>

        {/* Submit */}
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
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-3" />
                Creating Lead...
              </>
            ) : (
              'Create Lead'
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

LeadCreationPanel.propTypes = {
  users: PropTypes.array,
  teams: PropTypes.array,
};
