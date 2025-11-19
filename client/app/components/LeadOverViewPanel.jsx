'use client';

import { useEffect, useState } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';
// import { FiList, FiChevronDown, FiEdit, FiRefreshCw } from 'react-icons/fi'; // Recommended icons

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Lost'];

// Helper to determine role badge class
const getStatusBadgeClass = (status) => {
    switch (status) {
        case 'New':
            return 'bg-blue-100 text-blue-800';
        case 'Contacted':
            return 'bg-yellow-100 text-yellow-800';
        case 'Qualified':
            return 'bg-green-100 text-green-800';
        case 'Lost':
            return 'bg-red-100 text-red-800';
        default:
            return 'bg-gray-100 text-gray-800';
    }
};

export default function LeadOverviewPanel({ teams }) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  // State to manage which lead's notes textarea is actively being edited
  const [activeNotesId, setActiveNotesId] = useState(null); 

  const loadLeads = async (teamId) => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'teams', teamId, 'leads'));
      setLeads(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    } catch (err) {
      console.error('Error loading leads:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedTeamId) {
      loadLeads(selectedTeamId);
    } else {
      setLeads([]);
    }
  }, [selectedTeamId]);

  const updateLeadStatus = async (leadId, newStatus) => {
    try {
      await updateDoc(doc(db, 'teams', selectedTeamId, 'leads', leadId), {
        status: newStatus,
        lastModified: new Date(), // Add timestamp for better tracking
      });
      // Update state directly for faster feedback, then refresh
      setLeads(prevLeads => prevLeads.map(lead => 
          lead.id === leadId ? { ...lead, status: newStatus } : lead
      ));
      // Optionally remove alert: alert('Status updated');
    } catch (err) {
      console.error('Failed to update status:', err);
      alert('Failed to update status');
    }
  };

  const updateLeadNotes = async (leadId, notes) => {
    if (activeNotesId !== leadId) return; // Only save if the field was the active one
    
    try {
      await updateDoc(doc(db, 'teams', selectedTeamId, 'leads', leadId), {
        notes,
        lastModified: new Date(),
      });
      // Optionally remove alert: alert('Notes updated');
    } catch (err) {
      console.error('Failed to update notes:', err);
      alert('Failed to update notes');
    } finally {
        setActiveNotesId(null);
    }
  };

  // --- UI RENDER ---
  return (
    <div className="bg-white rounded-xl shadow-2xl p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 border-b pb-3 flex items-center">
        {/* <FiList className="mr-3 text-purple-600" /> */}
        Lead Data Overview
      </h2>

      {/* Team Selection Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between p-4 border rounded-lg bg-gray-50">
        <label className="block text-sm font-medium text-gray-700 mb-2 md:mb-0">
          Select Team to View Leads:
        </label>
        <div className="flex space-x-2 w-full md:w-1/2">
            <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 w-full bg-white focus:ring-blue-500 focus:border-blue-500 transition"
            >
                <option value="">-- Select Team --</option>
                {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                        {t.teamName}
                    </option>
                ))}
            </select>
            <button
                onClick={() => selectedTeamId && loadLeads(selectedTeamId)}
                disabled={!selectedTeamId || loading}
                className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg transition disabled:bg-gray-400"
                title="Refresh Leads"
            >
                {/* <FiRefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} /> */}
                Refresh
            </button>
        </div>
      </div>

      {/* Lead List Display */}
      <div className="mt-6">
        {!selectedTeamId ? (
            <div className="p-4 bg-blue-50 border-l-4 border-blue-400 text-blue-700 rounded-md">
                Please select a team from the dropdown above to view leads.
            </div>
        ) : loading ? (
            <div className="flex items-center justify-center p-10 bg-white rounded-xl shadow-md">
                <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mr-3"></div>
                <p className="text-lg text-gray-600">Loading leads for the selected team...</p>
            </div>
        ) : leads.length === 0 ? (
          <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 rounded-md">
            No leads found for this team yet.
          </div>
        ) : (
          <div className="bg-white border rounded-lg shadow-md overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                    <tr>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/4">
                            Contact Info
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/6">
                            Source / ID
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/6">
                            Status
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/3">
                            Notes
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider w-1/12">
                            Assigned To
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {leads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-gray-50 transition duration-100 align-top">
                            {/* Contact Info */}
                            <td className="px-6 py-4">
                                <p className="text-sm font-semibold text-gray-900">{lead.name}</p>
                                <p className="text-xs text-gray-600 truncate">{lead.email}</p>
                                <p className="text-xs text-gray-600 whitespace-nowrap">{lead.contactNumber}</p>
                            </td>
                            {/* Source / ID */}
                            <td className="px-6 py-4">
                                <p className="text-sm text-gray-700">{lead.source || '-'}</p>
                                <p className="text-xs text-gray-400 mt-1" title="Lead ID">ID: {lead.id.substring(0, 8)}...</p>
                            </td>
                            {/* Status Update */}
                            <td className="px-6 py-4 whitespace-nowrap">
                                <span 
                                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full mb-2 ${getStatusBadgeClass(lead.status)}`}
                                >
                                    {lead.status}
                                </span>
                                <select
                                    className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-full focus:ring-blue-500 focus:border-blue-500"
                                    defaultValue={lead.status}
                                    onChange={(e) => updateLeadStatus(lead.id, e.target.value)}
                                >
                                    {STATUS_OPTIONS.map((s) => (
                                        <option key={s} value={s}>
                                            {s}
                                        </option>
                                    ))}
                                </select>
                            </td>
                            {/* Notes (Editable) */}
                            <td className="px-6 py-4">
                                <textarea
                                    className={`border rounded-lg px-3 py-2 w-full text-sm min-h-[80px] transition ${
                                        activeNotesId === lead.id ? 'border-purple-500 ring-1 ring-purple-500' : 'border-gray-300'
                                    }`}
                                    defaultValue={lead.notes || ''}
                                    onFocus={() => setActiveNotesId(lead.id)}
                                    onBlur={(e) => updateLeadNotes(lead.id, e.target.value)}
                                    placeholder="Click to add or edit notes (saves on blur)..."
                                />
                            </td>
                            {/* Assignment Info */}
                            <td className="px-6 py-4 text-xs text-right text-gray-500">
                                {lead.assignedTo.substring(0, 10)}...
                                <p className="mt-1 text-gray-400">({lead.assignedRole})</p>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}