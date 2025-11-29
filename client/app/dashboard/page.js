'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '../../lib/firebaseClient';
import {
  collection,
  getDocs,
  doc,
  getDoc,
  updateDoc,        // for user activate/deactivate
} from 'firebase/firestore';
import {
  onAuthStateChanged,
  signOut,
  getIdTokenResult,
} from 'firebase/auth';

// Local component imports — adjust paths if your structure differs
import TeamManagementPanel from '../components/teamManagementPanel';
import LeadCreationPanel from '../components/LeadCreationPanel';
import LeadOverviewPanel from '../components/LeadOverViewPanel';

// --- ICONS (Retained) ---
const UserIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
  </svg>
);
const TeamIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M13 6a3 3 0 11-6 0 3 3 0 016 0zM18 8a2 2 0 11-4 0 2 2 0 014 0zM14 15a4 4 0 00-8 0v3h8v-3zM6 8a2 2 0 11-4 0 2 2 0 014 0zM16 18H4a2 2 0 00-2 2h16a2 2 0 01-2-2z" />
  </svg>
);
const LeadCreateIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
    <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
  </svg>
);
const LeadOverviewIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v5a1 1 0 002 0V7zm-1 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
  </svg>
);
const TaskIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 10-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
  </svg>
);

const tabIcons = {
  users: <UserIcon />,
  teams: <TeamIcon />,
  'leads-create': <LeadCreateIcon />,
  'leads-overview': <LeadOverviewIcon />,
  tasks: <TaskIcon />,
};

// --- COMPONENT: TabButton ---
const TabButton = ({ name, tabId, activeTab, setActiveTab }) => (
  <button
    onClick={() => setActiveTab(tabId)}
    className={`w-full text-left p-3 rounded-lg flex items-center transition-all duration-200 group ${
      activeTab === tabId
        ? 'bg-violet-600 text-white shadow-lg shadow-violet-600/40 font-semibold'
        : 'hover:bg-indigo-800 text-indigo-200 hover:text-white'
    }`}
  >
    <span className={`mr-3 w-5 h-5 ${activeTab !== tabId ? 'text-violet-400 group-hover:text-white' : ''}`}>
      {tabIcons[tabId]}
    </span>
    <span className="font-medium text-sm">{name}</span>
  </button>
);

// --- COMPONENT: RoleAssignmentSelect ---
const RoleAssignmentSelect = ({ user, handleAssignRole, disabled = false }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [tempRole, setTempRole] = useState('');

  const getRoleBadgeClass = (role) => {
    const r = (role || '').toLowerCase();
    switch (r) {
      case 'admin':
        return 'bg-red-600 text-white font-bold';
      case 'teamadmin':
        return 'bg-emerald-600 text-white font-semibold';
      case 'master':
        return 'bg-violet-500 text-white font-semibold';
      case 'executive':
        return 'bg-indigo-600 text-white';
      default:
        return 'bg-gray-200 text-gray-700';
    }
  };

  const handleChange = async (e) => {
    const selectedRole = e.target.value;
    setTempRole(selectedRole);
    if (!selectedRole || isUpdating) return;
    if (selectedRole === 'Change Role') return;

    setIsUpdating(true);
    try {
      await handleAssignRole(user.uid, selectedRole);
    } catch (err) {
      console.error(err);
    } finally {
      setIsUpdating(false);
      setTempRole('');
    }
  };

  return (
    <div className="flex items-center space-x-4">
      <span
        className={`px-3 py-1 inline-flex text-xs leading-5 rounded-full tracking-wide ${getRoleBadgeClass(
          user.role,
        )}`}
      >
        {user.role ? user.role : 'NONE'}
      </span>

      <select
        value={tempRole}
        onChange={handleChange}
        className={`border rounded-lg px-3 py-1.5 text-sm font-medium transition duration-150 appearance-none cursor-pointer focus:ring-2 focus:ring-offset-2 ${
          isUpdating || disabled
            ? 'bg-gray-50 border-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-white border-gray-300 text-gray-800 hover:border-violet-500 focus:ring-violet-500'
        }`}
        disabled={isUpdating || disabled}
      >
        <option value="" disabled>
          {isUpdating ? 'Updating...' : 'Change Role'}
        </option>
        <option value="Admin">Admin</option>
        <option value="TeamAdmin">TeamAdmin</option>
        <option value="Master">Master</option>
        <option value="Executive">Executive</option>
      </select>
    </div>
  );
};

// --- COMPONENT: UserManagementTab (with Activate/Deactivate) ---
const UserManagementTab = ({
  users,
  handleAssignRole,
  handleToggleActive,
  currentUserId,
  loading,
}) => {
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-10 bg-white rounded-xl shadow-lg">
        <div className="w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xl text-gray-600 font-medium">Fetching user directory...</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              User Email
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Role
            </th>
            <th className="px-6 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Status
            </th>
            <th className="px-6 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">
              Action
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-100">
          {users.length === 0 ? (
            <tr>
              <td
                colSpan="4"
                className="px-6 py-8 text-center text-gray-500 bg-gray-50"
              >
                <span className="text-3xl block mb-2">🤷‍♂️</span>
                No users found in the directory.
              </td>
            </tr>
          ) : (
            users.map((u, index) => (
              <tr
                key={u.uid}
                className={`${
                  index % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                } hover:bg-violet-50 transition duration-150`}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {u.email || 'N/A'}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <RoleAssignmentSelect
                    user={u}
                    handleAssignRole={handleAssignRole}
                  />
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  {u.isActive ? (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 text-xs font-semibold">
                      Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-100 text-red-700 text-xs font-semibold">
                      Inactive
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-xs text-gray-500 font-mono">
                  {u.uid === currentUserId ? (
                    <span className="text-[11px] text-gray-400">(You)</span>
                  ) : (
                    <button
                      onClick={() => handleToggleActive(u.uid, u.isActive)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        u.isActive
                          ? 'bg-red-500 text-white hover:bg-red-600'
                          : 'bg-emerald-500 text-white hover:bg-emerald-600'
                      }`}
                    >
                      {u.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

// --- OPTIONAL: Task Placeholder ---
const TaskFeaturePlaceholder = () => (
  <div className="bg-white rounded-xl shadow p-6 text-sm text-gray-600">
    Task management module can be implemented as a future enhancement.
  </div>
);

// --- NEW: Dashboard Stats Components ---
const StatCard = ({ label, value, subtitle, accent }) => (
  <div className="relative overflow-hidden rounded-2xl bg-white shadow-sm border border-gray-100 px-4 py-4 flex flex-col">
    {/* soft accent bar */}
    <div
      className="absolute inset-x-0 top-0 h-1"
      style={{
        background:
          accent ||
          'linear-gradient(to right, rgb(129, 140, 248), rgb(56, 189, 248))',
      }}
    />
    <span className="mt-2 text-[11px] font-semibold text-gray-500 uppercase tracking-[0.18em]">
      {label}
    </span>
    <span className="mt-1 text-2xl font-bold text-slate-900">
      {value}
    </span>
    {subtitle && (
      <span className="mt-1 text-xs text-slate-500">
        {subtitle}
      </span>
    )}
  </div>
);

const StatsOverview = ({ stats }) => {
  const {
    totalLeads = 0,
    newCount = 0,
    contactedCount = 0,
    qualifiedCount = 0,
    lostCount = 0,
  } = stats || {};

  const conversionRate =
    totalLeads > 0 ? Math.round((qualifiedCount / totalLeads) * 100) : 0;

  return (
    <section className="mb-6">
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg md:text-xl font-bold text-slate-900">
            Pipeline Snapshot
          </h2>
          <p className="text-xs md:text-sm text-slate-500">
            High-level view of your current lead flow across all teams.
          </p>
        </div>
        <div className="text-[11px] text-slate-400 md:text-right">
          <p>Updated from Firestore in real-time*</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          label="Total Leads"
          value={totalLeads}
          subtitle="Across all teams"
          accent="linear-gradient(to right, rgb(129, 140, 248), rgb(56, 189, 248))"
        />
        <StatCard
          label="New"
          value={newCount}
          subtitle="Freshly created"
          accent="linear-gradient(to right, rgb(59, 130, 246), rgb(147, 197, 253))"
        />
        <StatCard
          label="Contacted"
          value={contactedCount}
          subtitle="Initial touch done"
          accent="linear-gradient(to right, rgb(250, 204, 21), rgb(251, 191, 36))"
        />
        <StatCard
          label="Qualified"
          value={qualifiedCount}
          subtitle="Good potential"
          accent="linear-gradient(to right, rgb(16, 185, 129), rgb(52, 211, 153))"
        />
        <StatCard
          label="Lost"
          value={lostCount}
          subtitle="Closed as lost"
          accent="linear-gradient(to right, rgb(239, 68, 68), rgb(252, 165, 165))"
        />
      </div>

      {/* Optional second row: conversion metric */}
      <div className="mt-4">
        <div className="inline-flex items-center gap-2 rounded-full bg-slate-900 text-slate-100 px-4 py-1.5 text-xs shadow-sm">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
          <span className="font-medium">
            Qualified conversion: {conversionRate}% of total leads
          </span>
        </div>
      </div>
    </section>
  );
};


// --- Main Dashboard Implementation ---
export default function DashboardPage() {
  const [users, setUsers] = useState([]);
  const [teams, setTeams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roleLoading, setRoleLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('users');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const router = useRouter();
  const [errorMsg, setErrorMsg] = useState(null);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserId, setCurrentUserId] = useState('');

  // NEW: dashboard stats state
  const [stats, setStats] = useState({
    totalLeads: 0,
    newCount: 0,
    contactedCount: 0,
    qualifiedCount: 0,
    lostCount: 0,
  });

  // --- Auth & Role Check Logic ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (!user) {
        router.push('/login');
        return;
      }

      setCurrentUserId(user.uid);

      try {
        const tokenResult = await getIdTokenResult(user);
        const claimsRole = tokenResult.claims.role || null;

        let firestoreRole = null;
        try {
          const userDocSnap = await getDoc(doc(db, 'users', user.uid));
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            firestoreRole = data.role || null;
            setCurrentUserEmail(data.email || user.email || '');

            if (data.isActive === false) {
              alert('Your account has been deactivated by the admin.');
              await signOut(auth);
              router.push('/login');
              return;
            }
          } else {
            setCurrentUserEmail(user.email || '');
          }
        } catch (e) {
          console.error('Error fetching user doc for email/role:', e);
          setCurrentUserEmail(user.email || '');
        }

        const effectiveRoleRaw = claimsRole || firestoreRole || '';
        const effectiveRole = effectiveRoleRaw.toLowerCase();

        console.log(
          '[Auth Debug] claimsRole =',
          claimsRole,
          ', firestoreRole =',
          firestoreRole,
          ', effectiveRole =',
          effectiveRole,
        );

        if (effectiveRole !== 'admin') {
          router.push('/unauthorized');
          return;
        }

        setRoleLoading(false);
      } catch (err) {
        console.error('Error checking role via custom claims/Firestore:', err);
        router.push('/unauthorized');
      }
    });

    return () => unsubscribe();
  }, [router]);

  // --- Data Fetching Logic (users + teams + stats) ---
  const fetchData = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const userSnap = await getDocs(collection(db, 'users'));
      const teamSnap = await getDocs(collection(db, 'teams'));

      const fetchedUsers = userSnap.docs.map((d) => {
        const data = d.data();
        return {
          uid: d.id,
          email: data.email || 'N/A',
          role: data.role || '',
          isActive: data.isActive !== undefined ? data.isActive : true,
        };
      });

      setUsers(fetchedUsers);
      const teamDocs = teamSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTeams(teamDocs);

      // --- NEW: compute stats across all teams' leads ---
      let totalLeads = 0;
      let newCount = 0;
      let contactedCount = 0;
      let qualifiedCount = 0;
      let lostCount = 0;

      // loop through each team and fetch its leads
      for (const teamDoc of teamSnap.docs) {
        const teamId = teamDoc.id;
        const leadsSnap = await getDocs(collection(db, 'teams', teamId, 'leads'));
        totalLeads += leadsSnap.size;

        leadsSnap.forEach((ld) => {
          const data = ld.data();
          const status = (data.status || '').toLowerCase();
          if (status === 'new') newCount++;
          else if (status === 'contacted') contactedCount++;
          else if (status === 'qualified') qualifiedCount++;
          else if (status === 'lost') lostCount++;
        });
      }

      setStats({
        totalLeads,
        newCount,
        contactedCount,
        qualifiedCount,
        lostCount,
      });
    } catch (err) {
      console.error('Error fetching data:', err);
      setErrorMsg('Failed to fetch data. Check network and Firestore rules.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!roleLoading) fetchData();
  }, [roleLoading, fetchData]);

  // --- Role Assignment Logic (Cloud Function) ---
  const handleAssignRole = async (uid, role) => {
    setErrorMsg(null);
    if (!uid || !role) {
      setErrorMsg('Role assignment failed: Invalid parameters.');
      return { success: false };
    }
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setErrorMsg('You must be logged in to assign roles.');
      return { success: false };
    }

    try {
      const idToken = await currentUser.getIdToken();

      const ASSIGN_URL =
        process.env.NEXT_PUBLIC_ASSIGN_ROLE_URL ||
        'http://localhost:5001/lead-management-role/us-central1/assignRole';

      const response = await fetch(ASSIGN_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          uid,
          role,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        const error =
          data?.error || `HTTP ${response.status} ${response.statusText}`;
        setErrorMsg('Role assignment failed: ' + error);
        return { success: false };
      }

      setUsers((prev) =>
        prev.map((u) => (u.uid === uid ? { ...u, role } : u)),
      );

      const targetUser = users.find((u) => u.uid === uid);
      const label = targetUser?.email || uid.substring(0, 8);

      alert(`Role successfully updated to ${role} for user ${label}`);
      return { success: true, message: data.message };
    } catch (err) {
      console.error('Role assignment failed (fetch error):', err);
      setErrorMsg(
        'Role assignment failed: ' + (err.message || 'Network error.'),
      );
      return { success: false };
    }
  };

  // --- Activate / Deactivate Logic ---
  const handleToggleActive = async (uid, currentIsActive) => {
    setErrorMsg(null);
    if (!uid) return;

    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, {
        isActive: !currentIsActive,
      });

      setUsers((prev) =>
        prev.map((u) =>
          u.uid === uid ? { ...u, isActive: !currentIsActive } : u
        ),
      );
    } catch (err) {
      console.error('Error toggling user active state:', err);
      setErrorMsg('Failed to update user active status.');
    }
  };

  const getTabTitle = () => {
    switch (activeTab) {
      case 'users':
        return '👥 User Role & Access Management';
      case 'teams':
        return '🏗️ Team Structure Configuration';
      case 'leads-create':
        return '📝 New Lead Intake';
      case 'leads-overview':
        return '📈 Lead Data Overview';
      case 'tasks':
        return '✅ Task Management Feature';
      default:
        return 'Admin Dashboard Overview';
    }
  };

  if (roleLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
        <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-xl font-semibold text-gray-700">
          Verifying Administrator Privileges...
        </p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-gray-100">
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black opacity-60 z-30 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 transform ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } md:relative md:translate-x-0 transition-transform duration-300 ease-in-out w-64 bg-indigo-950 text-white flex flex-col p-4 shadow-2xl z-40`}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-violet-400 mb-8 tracking-wider">
            Admin Dashboard
          </h2>
          <button
            className="text-white text-3xl md:hidden"
            onClick={() => setIsSidebarOpen(false)}
          >
            &times;
          </button>
        </div>

        <nav className="flex-grow space-y-2">
          <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest pl-3 mb-1 mt-4">
            Administration
          </h3>
          <TabButton
            name="User Management"
            tabId="users"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            name="Team Management"
            tabId="teams"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />

          <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest pl-3 mb-1 pt-6 border-t border-indigo-800">
            Operations
          </h3>
          <TabButton
            name="Create Lead"
            tabId="leads-create"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            name="Lead Overview"
            tabId="leads-overview"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </nav>

        <button
          onClick={() =>
            signOut(auth).then(() => {
              router.push('/login');
            })
          }
          className="bg-indigo-900 hover:bg-indigo-800 text-red-400 font-semibold py-3 px-4 rounded-lg mt-auto flex items-center justify-center transition text-sm border-t border-indigo-800"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4 mr-2"
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M3 3a1 1 0 00-1 1v12a1 1 0 001 1h5a1 1 0 000-2H4V5h4a1 1 0 100-2H3zm13.707 8.707a1 1 0 00-1.414-1.414L13 11.586V6a1 1 0 10-2 0v5.586l-1.293-1.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3z"
              clipRule="evenodd"
            />
          </svg>
          Sign Out
        </button>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <header className="sticky top-0 z-20 bg-white border-b border-gray-200 shadow-md p-4 flex items-center justify-between h-16">
          <div className="flex items-center">
            <button
              className="p-2 text-gray-700 bg-gray-100 rounded-lg shadow-sm mr-4 md:hidden"
              onClick={() => setIsSidebarOpen(true)}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>
            <h1 className="text-xl font-extrabold text-gray-900 hidden md:block">
              {getTabTitle()}
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-sm font-medium text-gray-700 hidden sm:block">
              Logged in as:{' '}
              <strong className="text-violet-600">{currentUserEmail}</strong>
            </span>
            <button
              onClick={() =>
                signOut(auth).then(() => {
                  router.push('/login');
                })
              }
              className="p-2 text-violet-500 hover:bg-violet-50 rounded-full transition hidden sm:inline-flex"
              title="Sign Out"
            >
              <UserIcon />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 p-4 md:p-8 overflow-y-auto">
          {errorMsg && (
            <div
              className="bg-red-50 border-l-4 border-red-500 text-red-700 p-4 mb-8 rounded-lg shadow-md flex items-start"
              role="alert"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-6 w-6 mr-3 mt-0.5 flex-shrink-0"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <div>
                <p className="font-bold">Operation Error</p>
                <p className="text-sm">{errorMsg}</p>
              </div>
            </div>
          )}

          {loading ? (
            <div className="p-10 text-center bg-white rounded-xl shadow-lg">
              <div className="w-10 h-10 border-4 border-violet-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
              <p className="text-xl text-gray-600 font-medium">
                Refreshing data, please wait...
              </p>
            </div>
          ) : (
            <div className="space-y-8">
              {/* NEW: Stats cards at top */}
              <StatsOverview stats={stats} />

              {activeTab === 'users' && (
                <UserManagementTab
                  users={users}
                  handleAssignRole={handleAssignRole}
                  handleToggleActive={handleToggleActive}
                  currentUserId={currentUserId}
                  loading={loading}
                />
              )}

              {activeTab === 'teams' && (
                <TeamManagementPanel users={users} />
              )}

              {activeTab === 'leads-create' && (
                <LeadCreationPanel users={users} teams={teams} />
              )}

              {activeTab === 'leads-overview' && (
                <LeadOverviewPanel teams={teams} />
              )}

              {activeTab === 'tasks' && <TaskFeaturePlaceholder />}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
