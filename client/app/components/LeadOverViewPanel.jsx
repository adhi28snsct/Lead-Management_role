'use client';

import { useEffect, useState, useMemo } from 'react';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../../lib/firebaseClient';

const STATUS_OPTIONS = ['New', 'Contacted', 'Qualified', 'Lost'];

export default function LeadOverviewPanel({ teams }) {
  const [selectedTeamId, setSelectedTeamId] = useState('');
  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(false);

  // which lead's notes textarea is actively being edited
  const [activeNotesId, setActiveNotesId] = useState(null);

  // NEW: filters
  const [statusFilter, setStatusFilter] = useState('All');
  const [search, setSearch] = useState('');

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
      // Update state directly for faster feedback
      setLeads((prevLeads) =>
        prevLeads.map((lead) =>
          lead.id === leadId ? { ...lead, status: newStatus } : lead
        )
      );
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
    } catch (err) {
      console.error('Failed to update notes:', err);
      alert('Failed to update notes');
    } finally {
      setActiveNotesId(null);
    }
  };

  // --- FILTER + SEARCH LOGIC ---
  const filteredLeads = useMemo(() => {
    return leads.filter((lead) => {
      const statusOk =
        statusFilter === 'All' ||
        (lead.status && lead.status === statusFilter);

      const s = search.trim().toLowerCase();
      const searchOk =
        !s ||
        (lead.name && String(lead.name).toLowerCase().includes(s)) ||
        (lead.email && String(lead.email).toLowerCase().includes(s)) ||
        (lead.contactNumber &&
          String(lead.contactNumber).toLowerCase().includes(s)) ||
        (lead.source && String(lead.source).toLowerCase().includes(s));

      return statusOk && searchOk;
    });
  }, [leads, statusFilter, search]);

  // --- UI RENDER ---
  return (
    <div className="bg-white rounded-xl shadow-2xl p-6 space-y-6">
      <h2 className="text-2xl font-bold text-gray-800 border-b pb-3 flex items-center">
        Lead Data Overview
      </h2>

      {/* Team Selection Panel */}
      <div className="flex flex-col gap-4 p-4 border rounded-lg bg-gray-50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <label className="block text-sm font-medium text-gray-700">
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
                  {t.teamName || t.name || t.id}
                </option>
              ))}
            </select>
            <button
              onClick={() => selectedTeamId && loadLeads(selectedTeamId)}
              disabled={!selectedTeamId || loading}
              className="bg-blue-500 hover:bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg transition disabled:bg-gray-400"
              title="Refresh Leads"
            >
              Refresh
            </button>
          </div>
        </div>

        {/* Filter + Search controls */}
        <div className="flex flex-col md:flex-row gap-3 md:items-center">
          <div className="flex flex-col w-full md:w-48">
            <label className="text-xs font-semibold text-gray-600 mb-1">
              Status Filter
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="All">All</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="flex flex-col w-full md:flex-1">
            <label className="text-xs font-semibold text-gray-600 mb-1">
              Search (name / email / contact / source)
            </label>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search…"
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          <div className="text-xs text-gray-500 md:text-right md:flex-1 md:justify-end md:flex">
            {selectedTeamId && (
              <span className="mt-2 md:mt-6">
                Showing <strong>{filteredLeads.length}</strong> of{' '}
                <strong>{leads.length}</strong> leads
              </span>
            )}
          </div>
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
            <p className="text-lg text-gray-600">
              Loading leads for the selected team...
            </p>
          </div>
        ) : filteredLeads.length === 0 ? (
          <div className="p-4 bg-yellow-50 border-l-4 border-yellow-400 text-yellow-700 rounded-md">
            No leads found for this team with the current filter/search.
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
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="hover:bg-gray-50 transition duration-100 align-top"
                  >
                    {/* Contact Info */}
                    <td className="px-6 py-4">
                      <p className="text-sm font-semibold text-gray-900">
                        {lead.name || '-'}
                      </p>
                      <p className="text-xs text-gray-600 truncate">
                        {lead.email || '-'}
                      </p>
                      <p className="text-xs text-gray-600 whitespace-nowrap">
                        {lead.contactNumber || '-'}
                      </p>
                    </td>

                    {/* Source / ID */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-gray-700">
                        {lead.source || '-'}
                      </p>
                      <p
                        className="text-xs text-gray-400 mt-1"
                        title="Lead ID"
                      >
                        ID: {String(lead.id).substring(0, 8)}...
                      </p>
                    </td>

                    {/* Status Update */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <p className="text-xs text-gray-500 mb-1">
                        Current: <strong>{lead.status || 'Unknown'}</strong>
                      </p>
                      <select
                        className="border border-gray-300 rounded-lg px-2 py-1 text-xs w-full focus:ring-blue-500 focus:border-blue-500"
                        value={lead.status || 'New'}
                        onChange={(e) =>
                          updateLeadStatus(lead.id, e.target.value)
                        }
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
                          activeNotesId === lead.id
                            ? 'border-purple-500 ring-1 ring-purple-500'
                            : 'border-gray-300'
                        }`}
                        defaultValue={lead.notes || ''}
                        onFocus={() => setActiveNotesId(lead.id)}
                        onBlur={(e) => updateLeadNotes(lead.id, e.target.value)}
                        placeholder="Click to add or edit notes (saves on blur)..."
                      />
                    </td>

                    {/* Assignment Info */}
                    <td className="px-6 py-4 text-xs text-right text-gray-500">
                      {lead.assignedTo
                        ? `${String(lead.assignedTo).substring(0, 10)}...`
                        : '-'}
                      {lead.assignedRole && (
                        <p className="mt-1 text-gray-400">
                          ({lead.assignedRole})
                        </p>
                      )}
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
