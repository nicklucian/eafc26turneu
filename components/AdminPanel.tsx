
import React, { useState, useEffect } from 'react';
import { databaseService } from '../services/db';
import { InvitationCode, User, AuditLog, Tournament, GlobalTeam, TeamType, TournamentStatus } from '../types';
import { AutoTestRunner } from './AutoTestRunner';

const AdminPanel: React.FC<{ adminId: string }> = ({ adminId }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'codes' | 'tournaments' | 'teams' | 'audit' | 'system'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [globalTeams, setGlobalTeams] = useState<GlobalTeam[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showAutoTest, setShowAutoTest] = useState(false);
  const [orphanStats, setOrphanStats] = useState<{ matches: number, assignments: number } | null>(null);
  
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState<TeamType>(TeamType.CLUB);
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  const refreshData = async () => {
    setIsLoading(true);
    setOrphanStats(null);
    try {
        setUsers(await databaseService.getUsers());
        setCodes(await databaseService.getCodes());
        setTournaments(await databaseService.getTournaments());
        setGlobalTeams(await databaseService.getGlobalTeams());
        setLogs(await databaseService.getAuditLogs());
    } catch(e) {
        console.error(e);
    } finally {
        setIsLoading(false);
    }
  };

  const handleDeleteTournament = async (id: string) => {
    if (confirm('CRITICAL: Delete tournament and ALL related data (matches, assignments)?')) {
      await databaseService.deleteTournament(id);
      await databaseService.log(adminId, 'Tournament Delete', `Purged tournament ID: ${id}`);
      refreshData(); 
    }
  };

  const handleAddCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode) return;
    await databaseService.addCode({
      id: Math.random().toString(36).substr(2, 9),
      code: newCode,
      isActive: true,
      createdBy: adminId,
      createdAt: new Date().toISOString()
    });
    await databaseService.log(adminId, 'Code Create', `Created invitation code: ${newCode}`);
    setNewCode('');
    refreshData();
  };

  const handleAddGlobalTeam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName) return;
    await databaseService.addGlobalTeam({
      name: newTeamName,
      type: newTeamType
    });
    await databaseService.log(adminId, 'Team Create', `Created global team: ${newTeamName} (${newTeamType})`);
    setNewTeamName('');
    refreshData();
  };

  const handleWipe = () => {
    if (confirm('CRITICAL: This will reload the application. Are you sure?')) {
      databaseService.wipeEverything();
    }
  };

  const handleSeedTestUsers = async () => {
    await databaseService.seedTestUsers();
    refreshData();
    alert('6 Test Users have been added to the database.');
  };
  
  const handleScanOrphans = async () => {
      setIsLoading(true);
      const stats = await databaseService.getOrphanStats();
      setOrphanStats(stats);
      setIsLoading(false);
  }
  
  const handlePurgeOrphans = async () => {
      if (!orphanStats) return;
      if (confirm(`Confirm deletion of ${orphanStats.matches} matches and ${orphanStats.assignments} assignments that belong to deleted tournaments? This will NOT affect active tournaments.`)) {
          setIsLoading(true);
          try {
            const count = await databaseService.purgeOrphans();
            await databaseService.log(adminId, 'DB Clean', `Purged ${count} orphaned records.`);
            alert(`Maintenance Complete.\n\nSuccessfully removed ${count} orphaned records.\n\nThe application will now reload.`);
            window.location.reload();
          } catch(e: any) {
            alert(`Error during purge: ${e.message}`);
            setIsLoading(false);
          }
      }
  };

  const handleWipeMatchData = async () => {
      if(confirm('DANGER: This will delete ALL matches and assignments from the database (Active AND Inactive). Are you sure?')) {
          setIsLoading(true);
          try {
              const count = await databaseService.wipeAllMatchData();
              await databaseService.log(adminId, 'DB Wipe Matches', `Nuked ${count} match/assignment records.`);
              alert(`Success. Deleted ${count} records. All stats are reset.`);
              window.location.reload();
          } catch(e: any) {
              alert(`Error: ${e.message}`);
              setIsLoading(false);
          }
      }
  }

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-3xl font-bold italic tracking-tighter">ADMIN <span className="ea-accent">PRO</span> PANEL</h2>
        <p className="text-gray-400 mt-2">Manage users, tournaments, and global team assets.</p>
        <p className="text-[10px] text-[#00ff88] uppercase tracking-widest mt-2">Logged in as ID: {adminId}</p>
      </header>

      <div className="flex space-x-2 border-b border-white/10 pb-4 overflow-x-auto no-scrollbar">
        {['users', 'codes', 'tournaments', 'teams', 'audit', 'system'].map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={`px-4 py-2 capitalize font-black text-xs tracking-widest transition-all whitespace-nowrap ${
              activeTab === tab ? 'ea-accent border-b-2 border-current' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab === 'teams' ? 'GLOBAL TEAMS' : tab.toUpperCase()}
          </button>
        ))}
      </div>

      <div className="ea-card rounded-xl p-6 min-h-[400px]">
        {isLoading ? (
            <div className="h-full flex items-center justify-center py-20 flex-col gap-4">
                <div className="loader"></div>
                <p className="text-xs font-black uppercase tracking-widest text-[#00ff88] animate-pulse">Running System Operations...</p>
            </div>
        ) : (
            <>
            {activeTab === 'users' && (
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="pb-4 px-2">Username & ID</th>
                    <th className="pb-4 px-2">Role</th>
                    <th className="pb-4 px-2">Auth Provider</th>
                    <th className="pb-4 px-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {users.map(u => (
                    <tr key={u.id} className={`hover:bg-white/5 transition-colors ${u.id === adminId ? 'bg-[#00ff88]/5' : ''}`}>
                        <td className="py-4 px-2">
                             <div className="font-bold text-lg italic">{u.username}</div>
                             <div className="text-[9px] font-mono text-gray-600 uppercase">ID: {u.id}</div>
                        </td>
                        <td className="py-4 px-2">
                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${u.role === 'Admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                            {u.role}
                        </span>
                        </td>
                        <td className="py-4 px-2">
                            <span className="text-[10px] text-gray-600 font-bold uppercase tracking-widest">Firebase Auth</span>
                        </td>
                        <td className="py-4 px-2 text-right">
                        {u.id !== adminId && (
                            <button 
                            onClick={async () => { if(confirm(`Delete user '${u.username}' (ID: ${u.id})? This cannot be undone.`)) { await databaseService.deleteUser(u.id); refreshData(); } }}
                            className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase"
                            >
                            Delete
                            </button>
                        )}
                        {u.id === adminId && (
                            <span className="text-[9px] font-black text-[#00ff88] uppercase tracking-widest">You</span>
                        )}
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            )}

            {activeTab === 'teams' && (
            <div className="space-y-8">
                <div className="bg-white/5 p-6 rounded-xl border border-white/10">
                <h4 className="text-xs font-black uppercase tracking-widest text-gray-500 mb-4">Register Global Team</h4>
                <form onSubmit={handleAddGlobalTeam} className="flex flex-col md:flex-row gap-4">
                    <input
                    type="text"
                    value={newTeamName}
                    onChange={(e) => setNewTeamName(e.target.value)}
                    placeholder="Team Name (e.g. Juventus)"
                    className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 flex-1 outline-none focus:border-[#00ff88] font-bold italic"
                    />
                    <select 
                    value={newTeamType}
                    onChange={(e) => setNewTeamType(e.target.value as TeamType)}
                    className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-[#00ff88] font-bold"
                    >
                    <option value={TeamType.CLUB}>CLUB</option>
                    <option value={TeamType.NATIONAL}>NATIONAL</option>
                    </select>
                    <button type="submit" className="ea-bg-accent text-black font-black px-8 py-3 rounded-lg hover:brightness-110 transition-all">
                    ADD TEAM
                    </button>
                </form>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.values(TeamType).map(type => (
                    <div key={type} className="space-y-4">
                    <h4 className="text-xs font-black uppercase tracking-widest text-[#00ff88]">{type}S</h4>
                    <div className="space-y-2 max-h-[400px] overflow-y-auto no-scrollbar pr-2">
                        {globalTeams.filter(t => t.type === type).map(t => (
                        <div key={t.id} className="flex justify-between items-center p-3 bg-white/5 border border-white/5 rounded-lg group">
                            <div>
                            <p className={`font-bold italic ${!t.isActive ? 'text-gray-600 line-through' : ''}`}>{t.name}</p>
                            <p className="text-[8px] text-gray-500 uppercase tracking-tighter">Added: {new Date(t.createdAt).toLocaleDateString()}</p>
                            </div>
                            <div className="flex gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button 
                                onClick={async () => { await databaseService.updateGlobalTeam(t.id, { isActive: !t.isActive }); refreshData(); }}
                                className={`text-[9px] font-black uppercase ${t.isActive ? 'text-orange-400' : 'text-green-400'}`}
                            >
                                {t.isActive ? 'Deactivate' : 'Reactivate'}
                            </button>
                            <button 
                                onClick={async () => { if(confirm('Permanently delete this team?')) { await databaseService.deleteGlobalTeam(t.id); refreshData(); } }}
                                className="text-[9px] font-black uppercase text-red-500"
                            >
                                Delete
                            </button>
                            </div>
                        </div>
                        ))}
                    </div>
                    </div>
                ))}
                </div>
            </div>
            )}

            {activeTab === 'tournaments' && (
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                    <th className="pb-4 px-2">Tournament Name</th>
                    <th className="pb-4 px-2">Status</th>
                    <th className="pb-4 px-2 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                    {tournaments.map(t => (
                    <tr key={t.id}>
                        <td className="py-4 px-2 font-bold italic text-lg">{t.name}</td>
                        <td className="py-4 px-2">
                        <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${t.status === TournamentStatus.ACTIVE ? 'ea-bg-accent text-black' : 'bg-gray-800 text-gray-500'}`}>
                            {t.status}
                        </span>
                        </td>
                        <td className="py-4 px-2 text-right">
                        <button 
                            onClick={() => handleDeleteTournament(t.id)}
                            className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase"
                        >
                            Wipe
                        </button>
                        </td>
                    </tr>
                    ))}
                </tbody>
                </table>
            </div>
            )}

            {activeTab === 'codes' && (
            <div className="space-y-6">
                <form onSubmit={handleAddCode} className="flex gap-4">
                <input
                    type="text"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                    placeholder="Enter new code..."
                    className="bg-black/40 border border-white/10 rounded-lg px-4 py-3 flex-1 outline-none focus:border-[#00ff88] font-bold"
                />
                <button type="submit" className="ea-bg-accent text-black font-black px-8 py-3 rounded-lg hover:brightness-110 transition-all">
                    Create Code
                </button>
                </form>
                <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead>
                    <tr className="border-b border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                        <th className="pb-4 px-2">Code</th>
                        <th className="pb-4 px-2">Status</th>
                        <th className="pb-4 px-2 text-right">Actions</th>
                    </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5">
                    {codes.map(c => (
                        <tr key={c.id}>
                        <td className="py-4 px-2 font-mono font-bold text-lg">{c.code}</td>
                        <td className="py-4 px-2">
                            <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${c.isActive ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                            {c.isActive ? 'Active' : 'Inactive'}
                            </span>
                        </td>
                        <td className="py-4 px-2 text-right space-x-3">
                            <button onClick={async () => { await databaseService.toggleCode(c.id, c.isActive); refreshData(); }} className="text-blue-400 hover:text-blue-300 text-[10px] font-black uppercase">Toggle</button>
                            <button onClick={async () => { await databaseService.deleteCode(c.id); refreshData(); }} className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase">Remove</button>
                        </td>
                        </tr>
                    ))}
                    </tbody>
                </table>
                </div>
            </div>
            )}

            {activeTab === 'audit' && (
            <div className="max-h-[500px] overflow-y-auto space-y-3 pr-2 no-scrollbar">
                {logs.map(log => (
                <div key={log.id} className="p-4 bg-white/5 border border-white/5 rounded-lg text-sm">
                    <div className="flex justify-between items-start mb-1">
                    <span className="ea-accent font-black uppercase tracking-wider text-[9px]">{log.action}</span>
                    <span className="text-gray-600 text-[9px] font-black">{new Date(log.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-gray-300 italic">{log.details}</p>
                </div>
                ))}
            </div>
            )}

            {activeTab === 'system' && (
            <div className="space-y-8 py-4">
                <div className="bg-purple-500/10 border border-purple-500/20 p-8 rounded-xl flex justify-between items-center">
                <div>
                    <h4 className="text-purple-400 font-black italic text-xl mb-2">SYSTEM DIAGNOSTICS</h4>
                    <p className="text-gray-400 text-sm">Run automated integration tests on database integrity, fixtures, and admin permissions.</p>
                </div>
                <button 
                    onClick={() => setShowAutoTest(true)}
                    className="bg-purple-600 hover:bg-purple-500 text-white font-black px-8 py-4 rounded-lg transition-all tracking-widest italic shadow-lg shadow-purple-500/20"
                >
                    RUN AUTOTEST
                </button>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/20 p-8 rounded-xl">
                <h4 className="text-blue-400 font-black italic text-xl mb-2">TEST DATA SEEDING</h4>
                <p className="text-gray-400 text-sm mb-6">Inject 6 dummy users into the database for tournament testing.</p>
                <button 
                    onClick={handleSeedTestUsers}
                    className="bg-blue-600 hover:bg-blue-500 text-white font-black px-8 py-4 rounded-lg transition-all tracking-widest italic shadow-lg shadow-blue-500/20"
                >
                    GENERATE TEST USERS
                </button>
                </div>
                
                <div className="bg-yellow-500/10 border border-yellow-500/20 p-8 rounded-xl">
                <h4 className="text-yellow-400 font-black italic text-xl mb-2">DATABASE HYGIENE</h4>
                <p className="text-gray-400 text-sm mb-6">Tools to fix data inconsistency and remove junk records.</p>
                <div className="flex flex-col gap-4">
                    {/* SAFE SCAN UI */}
                    <div className="flex justify-between items-center bg-black/20 p-4 rounded-lg border border-white/5">
                        <div className="text-sm text-gray-400">
                            {orphanStats === null ? 'Scan for matches from deleted tournaments' : 
                             `Found ${orphanStats.matches} matches & ${orphanStats.assignments} assignments from wiped tournaments.`}
                        </div>
                        {orphanStats === null ? (
                            <button 
                                onClick={handleScanOrphans}
                                className="bg-white/10 hover:bg-white/20 text-white font-black px-4 py-2 rounded-lg transition-all text-[10px] uppercase tracking-widest"
                            >
                                Scan First
                            </button>
                        ) : (
                            <button 
                                onClick={handlePurgeOrphans}
                                disabled={orphanStats.matches === 0 && orphanStats.assignments === 0}
                                className="bg-yellow-600 hover:bg-yellow-500 text-white font-black px-4 py-2 rounded-lg transition-all text-[10px] uppercase tracking-widest disabled:opacity-50"
                            >
                                {orphanStats.matches === 0 && orphanStats.assignments === 0 ? 'Nothing to Clean' : 'Purge Found Items'}
                            </button>
                        )}
                    </div>
                    
                    {/* DANGER UI */}
                    <div className="pt-4 border-t border-white/5">
                        <button 
                            onClick={handleWipeMatchData}
                            className="w-full bg-red-900/50 border border-red-500/30 hover:bg-red-600 hover:text-white text-red-400 font-black px-8 py-3 rounded-lg transition-all tracking-widest italic"
                        >
                            WIPE EVERYTHING (DANGER)
                        </button>
                    </div>
                </div>
                </div>

                <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-xl">
                <h4 className="text-red-400 font-black italic text-xl mb-2">CRITICAL: APP RELOAD</h4>
                <p className="text-gray-400 text-sm mb-6">Reload the application state.</p>
                <button 
                    onClick={handleWipe}
                    className="bg-red-600 hover:bg-red-500 text-white font-black px-8 py-4 rounded-lg transition-all tracking-widest italic shadow-lg shadow-red-500/20"
                >
                    RELOAD APP
                </button>
                </div>
            </div>
            )}
            </>
        )}
      </div>

      {showAutoTest && <AutoTestRunner onClose={() => setShowAutoTest(false)} />}
    </div>
  );
};

export default AdminPanel;
