
import React, { useState, useEffect } from 'react';
import { db } from '../services/db';
import { InvitationCode, User, AuditLog, Tournament, GlobalTeam, TeamType, TournamentStatus } from '../types';

const AdminPanel: React.FC<{ adminId: string }> = ({ adminId }) => {
  const [activeTab, setActiveTab] = useState<'users' | 'codes' | 'tournaments' | 'teams' | 'audit' | 'system'>('users');
  const [users, setUsers] = useState<User[]>([]);
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [globalTeams, setGlobalTeams] = useState<GlobalTeam[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  
  const [newTeamName, setNewTeamName] = useState('');
  const [newTeamType, setNewTeamType] = useState<TeamType>(TeamType.CLUB);
  const [newCode, setNewCode] = useState('');

  useEffect(() => {
    refreshData();
  }, [activeTab]);

  const refreshData = () => {
    setUsers(db.getUsers());
    setCodes(db.getCodes());
    setTournaments(db.getTournaments());
    setGlobalTeams(db.getGlobalTeams());
    setLogs(db.getAuditLogs());
  };

  const handleDeleteTournament = (id: string) => {
    if (confirm('CRITICAL: Delete tournament and ALL related data (matches, assignments)?')) {
      db.deleteTournament(id);
      db.log(adminId, 'Tournament Delete', `Purged tournament ID: ${id}`);
      refreshData(); // Force re-sync local state
    }
  };

  const handleAddCode = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCode) return;
    db.addCode({
      id: Math.random().toString(36).substr(2, 9),
      code: newCode,
      isActive: true,
      createdBy: adminId,
      createdAt: new Date().toISOString()
    });
    db.log(adminId, 'Code Create', `Created invitation code: ${newCode}`);
    setNewCode('');
    refreshData();
  };

  const handleAddGlobalTeam = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTeamName) return;
    db.addGlobalTeam({
      name: newTeamName,
      type: newTeamType
    });
    db.log(adminId, 'Team Create', `Created global team: ${newTeamName} (${newTeamType})`);
    setNewTeamName('');
    refreshData();
  };

  const handleWipe = () => {
    if (confirm('CRITICAL: This will wipe all data. Default teams will be re-seeded on next load. Are you sure?')) {
      db.wipeEverything();
    }
  };

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h2 className="text-3xl font-bold italic tracking-tighter">ADMIN <span className="ea-accent">PRO</span> PANEL</h2>
        <p className="text-gray-400 mt-2">Manage users, tournaments, and global team assets.</p>
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
        {activeTab === 'users' && (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-white/10 text-gray-400 text-[10px] font-black uppercase tracking-widest">
                  <th className="pb-4 px-2">Username</th>
                  <th className="pb-4 px-2">Role</th>
                  <th className="pb-4 px-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map(u => (
                  <tr key={u.id} className="hover:bg-white/5 transition-colors">
                    <td className="py-4 px-2 font-bold text-lg italic">{u.username}</td>
                    <td className="py-4 px-2">
                      <span className={`px-2 py-1 rounded text-[9px] font-black uppercase ${u.role === 'Admin' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="py-4 px-2 text-right">
                      {u.username !== 'admin' && (
                        <button 
                          onClick={() => { if(confirm('Delete user?')) { db.deleteUser(u.id); refreshData(); } }}
                          className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase"
                        >
                          Delete
                        </button>
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
                            onClick={() => { db.updateGlobalTeam(t.id, { isActive: !t.isActive }); refreshData(); }}
                            className={`text-[9px] font-black uppercase ${t.isActive ? 'text-orange-400' : 'text-green-400'}`}
                          >
                            {t.isActive ? 'Deactivate' : 'Reactivate'}
                          </button>
                          <button 
                            onClick={() => { if(confirm('Permanently delete this team?')) { db.deleteGlobalTeam(t.id); refreshData(); } }}
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
                        <button onClick={() => { db.toggleCode(c.id); refreshData(); }} className="text-blue-400 hover:text-blue-300 text-[10px] font-black uppercase">Toggle</button>
                        <button onClick={() => { db.deleteCode(c.id); refreshData(); }} className="text-red-400 hover:text-red-300 text-[10px] font-black uppercase">Remove</button>
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
            <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-xl">
              <h4 className="text-red-400 font-black italic text-xl mb-2">CRITICAL: DANGER ZONE</h4>
              <p className="text-gray-400 text-sm mb-6">Resetting the database wipes all users, tournaments, and custom teams. Default teams will be re-seeded.</p>
              <button 
                onClick={handleWipe}
                className="bg-red-600 hover:bg-red-500 text-white font-black px-8 py-4 rounded-lg transition-all tracking-widest italic"
              >
                FULL SYSTEM PURGE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AdminPanel;
