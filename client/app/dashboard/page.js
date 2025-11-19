'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { db, auth } from '../../lib/firebaseClient';
import { collection, getDocs, doc, getDoc, setDoc } from 'firebase/firestore';
import { onAuthStateChanged, signOut } from 'firebase/auth';

// NOTE: Assuming these components exist in your project structure
import TeamManagementPanel from '../components/teamManagementPanel';
import LeadCreationPanel from '../components/LeadCreationPanel';
import LeadOverviewPanel from '../components/LeadOverViewPanel'; 


// --- Helper Component: Role Assignment Select ---
const RoleAssignmentSelect = ({ user, handleAssignRole, disabled = false }) => {
    const [isUpdating, setIsUpdating] = useState(false);
    
    const handleChange = async (e) => {
        const selectedRole = e.target.value;
        if (selectedRole && user.uid && !isUpdating) {
            setIsUpdating(true);
            const result = await handleAssignRole(user.uid, selectedRole);
            setIsUpdating(false);
            if (result.success) {
                e.target.value = ''; 
            } else {
                 e.target.value = '';
            }
        }
    };
    
    const getRoleBadgeClass = (role) => {
        switch (role) {
            case 'Admin': return 'bg-red-500 text-white font-bold border border-red-700';
            case 'TeamAdmin': return 'bg-green-500 text-white font-semibold border border-green-700';
            case 'Master': return 'bg-yellow-500 text-gray-900 font-semibold border border-yellow-700';
            case 'Executive': return 'bg-blue-500 text-white border border-blue-700';
            default: return 'bg-gray-200 text-gray-700 border border-gray-400';
        }
    };
    
    return (
        <div className="flex items-center space-x-4">
            <span 
                className={`px-3 py-1 inline-flex text-xs leading-5 font-bold rounded-lg tracking-wider shadow-sm ${getRoleBadgeClass(user.role)}`}
            >
                {user.role || 'NONE'}
            </span>
            <select
                defaultValue=""
                onChange={handleChange}
                className={`border-2 rounded-xl px-4 py-2 text-sm font-medium transition duration-150 appearance-none cursor-pointer ${
                    isUpdating 
                        ? 'bg-gray-100 border-gray-300 text-gray-500' 
                        : 'bg-white border-blue-400 text-gray-800 hover:border-blue-600 focus:ring-blue-600 focus:border-blue-600'
                } disabled:opacity-70`}
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


// --- Helper Component: User Management Tab Content ---
const UserManagementTab = ({ users, handleAssignRole, loading }) => {
    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center p-10 bg-white rounded-xl shadow-2xl">
                <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-xl text-gray-700 font-medium">Fetching user directory...</p>
            </div>
        );
    }
    
    return (
        <div className="bg-white rounded-xl shadow-2xl overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-blue-50">
                    <tr>
                        <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">
                            User Email
                        </th>
                        <th className="px-6 py-4 text-left text-xs font-bold text-blue-700 uppercase tracking-wider">
                            Current Role / Assign New
                        </th>
                        <th className="px-6 py-4 text-right text-xs font-bold text-blue-700 uppercase tracking-wider">
                            UID (Excerpt)
                        </th>
                    </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-100">
                    {users.length === 0 ? (
                        <tr>
                            <td colSpan="3" className="px-6 py-8 text-center text-gray-500">
                                No users found in the directory.
                            </td>
                        </tr>
                    ) : (
                        users.map((user) => (
                            <tr key={user.uid} className="hover:bg-gray-50 transition duration-100">
                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                                    {user.email || 'N/A'}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <RoleAssignmentSelect user={user} handleAssignRole={handleAssignRole} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-xs text-gray-500 font-mono">
                                    {user.uid.substring(0, 10)}...
                                </td>
                            </tr>
                        ))
                    )}
                </tbody>
            </table>
        </div>
    );
}

// --- Placeholder for Task Panel ---
const TaskFeaturePlaceholder = () => (
    <div className="p-10 text-center bg-white rounded-xl shadow-2xl border-4 border-dashed border-yellow-200">
        <span className="text-6xl mb-4 block">🚧</span>
        <h2 className="text-2xl font-bold text-gray-800 mb-2">Task Management Integration</h2>
        <p className="text-gray-600">
            Task creation and assignment are handled at the **Team Admin/Lead** level.
            <br />
            This feature should be accessed via the **TeamAdminPage** component.
        </p>
    </div>
);

// --- Helper Component for Sidebar Buttons ---
const TabButton = ({ name, tabId, activeTab, setActiveTab }) => (
    <button
        onClick={() => setActiveTab(tabId)}
        className={`w-full text-left p-4 rounded-xl flex items-center font-semibold transition duration-200 text-lg ${
            activeTab === tabId 
                ? 'bg-sky-600 text-white shadow-xl hover:bg-sky-700' 
                : 'hover:bg-slate-700 text-gray-300'
        }`}
    >
        {/* Placeholder icons (emojis for quick, no-import icons) */}
        <span className="mr-3 w-5 h-5 text-xl">
            {tabId === 'users' && '👥'}
            {tabId === 'teams' && '🏗️'}
            {tabId === 'leads-create' && '📝'}
            {tabId === 'leads-overview' && '📈'}
            {tabId === 'tasks' && '✅'}
        </span>
        {name}
    </button>
);


// --- Main Dashboard Component ---

export default function DashboardPage() {
    const [users, setUsers] = useState([]);
    const [teams, setTeams] = useState([]);
    const [loading, setLoading] = useState(true);
    const [roleLoading, setRoleLoading] = useState(true);
    const [activeTab, setActiveTab] = useState('users'); // Default tab
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const router = useRouter();
    const [errorMsg, setErrorMsg] = useState(null); // Dedicated state for alerts

    // Unified data fetching function
    const fetchData = useCallback(async () => {
        setLoading(true);
        setErrorMsg(null);
        try {
            const userSnap = await getDocs(collection(db, 'users'));
            const teamSnap = await getDocs(collection(db, 'teams'));
            setUsers(userSnap.docs.map((d) => ({ uid: d.id, ...d.data(), email: d.data().email || 'N/A' })));
            setTeams(teamSnap.docs.map((d) => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error('Error fetching data:', err);
            setErrorMsg('Failed to fetch data. Check network and Firestore rules.');
        } finally {
            setLoading(false);
        }
    }, []);

    // 1. Auth and Role Check
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (!user) {
                router.push('/login');
                return;
            }
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                const role = userDoc.exists() ? userDoc.data().role : '';
                if (role !== 'Admin') {
                    router.push('/unauthorized');
                    return;
                }
                setRoleLoading(false);
            } catch (err) {
                console.error('Error checking role:', err);
                router.push('/unauthorized');
            }
        });
        return () => unsubscribe();
    }, [router]);

    // 2. Fetch Data
    useEffect(() => {
        if (!roleLoading) {
            fetchData();
        }
    }, [roleLoading, fetchData]);

    // 3. Assign role via Cloud Function
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
            // NOTE: Assuming the Cloud Function URL is correct for your Firebase project
            const response = await fetch(
                'http://localhost:5001/lead-management-role/us-central1/assignRole',
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        requesterUid: currentUser.uid,
                        uid,
                        role,
                    }),
                }
            );
            const data = await response.json();

            if (!response.ok || !data.success) {
                const error = data?.error || `HTTP ${response.status} ${response.statusText}`;
                setErrorMsg('Role assignment failed: ' + error);
                return { success: false };
            }

            // Success: Update the local state optimistically before full refresh
            setUsers(prevUsers => prevUsers.map(u => 
                u.uid === uid ? { ...u, role } : u
            ));
            
            alert(data.message || `Role for ${uid.substring(0, 5)}... updated to ${role}`);
            return { success: true, message: data.message };
        } catch (err) {
            console.error('Role assignment failed (fetch error):', err);
            setErrorMsg('Role assignment failed: ' + (err.message || 'Network error.'));
            return { success: false };
        }
    };

    // Determine Main Content Title
    const getTabTitle = () => {
        switch (activeTab) {
            case 'users': return '👥 User Role Management';
            case 'teams': return '🏗️ Team Structure Configuration';
            case 'leads-create': return '📝 New Lead Intake';
            case 'leads-overview': return '📈 Lead Data Overview';
            case 'tasks': return '✅ Task Management Feature';
            default: return 'Admin Dashboard Overview';
        }
    };


    // --- UI RENDERING ---

    if (roleLoading) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
                <p className="text-xl font-semibold text-gray-700">
                    Verifying Administrator Privileges...
                </p>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen bg-gray-100">

            {/* --- Sidebar Navigation (Desktop & Mobile) --- */}
            {isSidebarOpen && (
                <div 
                    className="fixed inset-0 bg-black opacity-60 z-20 md:hidden" 
                    onClick={() => setIsSidebarOpen(false)} 
                />
            )}

            <aside className={`
                fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} 
                md:relative md:translate-x-0 transition-transform duration-300 ease-in-out 
                w-72 bg-slate-900 text-white flex flex-col p-6 shadow-2xl z-30
            `}>
                <h2 className="text-3xl font-extrabold text-sky-400 mb-10 tracking-wider">
                    LMS Admin
                </h2>
                <nav className="flex-grow space-y-3">
                    <TabButton name="User Management" tabId="users" activeTab={activeTab} setActiveTab={setActiveTab} />
                    <TabButton name="Team Management" tabId="teams" activeTab={activeTab} setActiveTab={setActiveTab} />
                    
                    <div className="pt-4 border-t border-slate-700 space-y-3">
                        <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider pl-4">Team Focus</h3>
                        <TabButton name="Create Lead" tabId="leads-create" activeTab={activeTab} setActiveTab={setActiveTab} />
                        <TabButton name="Lead Overview" tabId="leads-overview" activeTab={activeTab} setActiveTab={setActiveTab} />
                        <TabButton name="Task Management" tabId="tasks" activeTab={activeTab} setActiveTab={setActiveTab} />
                    </div>
                </nav>
                <button
                    onClick={() => signOut(auth).then(() => router.push('/login'))}
                    className="bg-red-700 hover:bg-red-800 text-white font-semibold py-3 px-4 rounded-xl mt-auto flex items-center justify-center transition shadow-lg"
                >
                    Sign Out
                </button>
            </aside>

            {/* --- Main Content Area --- */}
            <main className="flex-1 p-4 md:p-10 overflow-y-auto">
                
                {/* Mobile Menu Button & Header */}
                <div className="flex justify-between items-center mb-6 md:hidden">
                    <button
                        className="p-3 text-gray-700 bg-white rounded-xl shadow-lg"
                        onClick={() => setIsSidebarOpen(true)}
                    >
                        {/* Hamburger Icon */}
                        <span className="text-2xl">☰</span>
                    </button>
                    <h1 className="text-2xl font-extrabold text-gray-900">{getTabTitle()}</h1>
                    <div className="w-8"></div> 
                </div>
                
                {/* Desktop Header */}
                <h1 className="text-4xl font-extrabold mb-8 text-gray-900 border-b-4 border-blue-100 pb-4 hidden md:block">
                    {getTabTitle()}
                </h1>

                {/* Error Alert Box */}
                {errorMsg && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-4 mb-6 rounded-lg shadow-md" role="alert">
                        <p className="font-bold">Error</p>
                        <p className="text-sm">{errorMsg}</p>
                    </div>
                )}

                {/* Content Area */}
                {loading ? (
                    <div className="p-10 text-center bg-white rounded-xl shadow-2xl">
                        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                        <p className="text-xl text-gray-600 font-medium">Refreshing data, please wait...</p>
                    </div>
                ) : (
                    <div className="mt-8">
                        {activeTab === 'users' && (
                            <UserManagementTab 
                                users={users} 
                                handleAssignRole={handleAssignRole} 
                                loading={loading} 
                            />
                        )}

                        {activeTab === 'teams' && (
                            <TeamManagementPanel 
                                users={users} 
                            />
                        )}

                        {activeTab === 'leads-create' && (
                            <LeadCreationPanel 
                                users={users} 
                                teams={teams} 
                            />
                        )}

                        {activeTab === 'leads-overview' && (
                            <LeadOverviewPanel 
                                teams={teams} 
                            />
                        )}

                        {activeTab === 'tasks' && (
                            <TaskFeaturePlaceholder /> 
                        )}
                    </div>
                )}
            </main>
        </div>
    );
}