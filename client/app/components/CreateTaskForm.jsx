// app/components/CreateTaskForm.jsx
'use client';

import { useState } from 'react';
import PropTypes from 'prop-types';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';

export default function CreateTaskForm({
  user,
  selectedTeamId,
  members = [],
  onCreated = () => {},
  setGlobalError = () => {},
}) {
  const [title, setTitle] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [deadline, setDeadline] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState('Pending');
  const [loading, setLoading] = useState(false);

  const resetForm = () => {
    setTitle('');
    setAssignedTo('');
    setDeadline('');
    setDescription('');
    setNotes('');
    setStatus('Pending');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setGlobalError('');

    if (!user || !user.uid) {
      setGlobalError('You must be signed in to create a task.');
      return;
    }
    if (!selectedTeamId) {
      setGlobalError('Select a team first.');
      return;
    }
    if (!title.trim() || !assignedTo || !deadline) {
      setGlobalError('Please provide a title, assignee and a deadline.');
      return;
    }

    setLoading(true);
    try {
      const assignedMember = members.find((m) => m.id === assignedTo);

      const payload = {
        title: title.trim(),
        assignedTo, // uid
        assignedToName:
          assignedMember?.name ||
          assignedMember?.email ||
          assignedMember?.id ||
          '',
        assignedBy: user.uid,
        assignedByName: user.displayName || user.email || user.uid,
        status: status || 'Pending',
        notes: notes.trim() || '',
        description: description.trim() || '',
        deadline: new Date(deadline),
        createdAt: serverTimestamp(),
        teamId: selectedTeamId,
        attachments: [],
      };

      const tasksRef = collection(db, 'teams', selectedTeamId, 'tasks');
      const docRef = await addDoc(tasksRef, payload);

      onCreated({
        id: docRef.id,
        ...payload,
        createdAt: new Date().toISOString(), // local placeholder
      });

      resetForm();
    } catch (err) {
      console.error('Create Task Error:', err);
      setGlobalError(
        'Failed to create task. Check your permissions and Firestore rules.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mt-6 pt-6 border-t border-slate-700">
      <h3 className="text-lg font-bold text-orange-300 mb-3">
        Create New Task
      </h3>

      {!selectedTeamId ? (
        <p className="text-slate-400">Select a team first.</p>
      ) : members.length === 0 ? (
        <p className="text-slate-400">This team has no members yet.</p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            placeholder="Task Title (e.g., Follow up with lead X)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
            disabled={loading}
            required
          />

          {/* Assign to member */}
          <select
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
            disabled={loading}
            required
          >
            <option value="" disabled>
              Assign to Team Member
            </option>
            {members.map((m) => {
              const labelName = m.name || m.email || m.id;
              return (
                <option key={m.id} value={m.id}>
                  {labelName} ({m.role})
                </option>
              );
            })}
          </select>

          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
            disabled={loading}
            required
          />

          <textarea
            placeholder="Short description (optional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
            disabled={loading}
          />

          <textarea
            placeholder="Notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
            disabled={loading}
          />

          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full rounded-lg border border-slate-600 bg-slate-900 px-4 py-2 text-sm text-white"
            disabled={loading}
          >
            <option value="Pending">Pending</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Complete">Complete</option>
            <option value="Cancelled">Cancelled</option>
          </select>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-base font-semibold py-2.5"
          >
            {loading ? 'Assigning Task…' : 'Assign Task'}
          </button>
        </form>
      )}
    </div>
  );
}

CreateTaskForm.propTypes = {
  user: PropTypes.object.isRequired,
  selectedTeamId: PropTypes.string,
  members: PropTypes.array,
  onCreated: PropTypes.func,
  setGlobalError: PropTypes.func,
};
