
import React, { useState, useEffect } from 'react';
import { auth } from './services/auth';
import { db } from './services/db';
import { User, Tournament, TournamentStatus, TournamentType, UserRole, ChatMessage } from './types';
import Layout from './components/Layout';
import AdminPanel from './components/AdminPanel';
import TournamentDetail from './components/TournamentDetail';

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(auth.getCurrentUser());
  const [currentPage, setCurrentPage] = useState('dashboard');
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  
  // Auth Form State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regInvite, setRegInvite] = useState('');
  const [error, setError] = useState('');

  // Tournament Create Modal
  const [showTModal, setShowTModal] = useState(false);
  const [newTName, setNewTName] = useState('');
  const [newTType, setNewTType] = useState<TournamentType>(TournamentType.LOTTERY);

  // Global Chat State
  const [chatMsg, setChatMsg] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  useEffect(() => {
    if (user) {
      setTournaments(db.getTournaments());
      setMessages(db.getChat());
    }
  }, [user, currentPage]);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const result = auth.login(loginUser, loginPass);
    if (result) {
      setUser(result);
      setError('');
    } else {
      setError('Invalid credentials.');
    }
  };

  const handleRegister = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const result = auth.register(regUser, regPass, regInvite);
      if (result) setUser(result);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateTournament = (e: React.FormEvent) => {
    e.preventDefault();
    const nt: Tournament = {
      id: Math.random().toString(36).substr(2, 9),
      name: newTName,
      type: newTType,
      startDate: new Date().toISOString(),
      status: TournamentStatus.UPCOMING,
      createdAt: new Date().toISOString(),
      participantUserIds: [],
      selectedTeamIds: []
    };
    db.addTournament(nt);
    db.log(user!.id, 'Tournament Create', `Created ${newTName} (${newTType})`);
    setTournaments(db.getTournaments());
    setShowTModal(false);
    setNewTName('');
  };

  const sendChatMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMsg) return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user!.id,
      username: user!.username,
      role: user!.role,
      text: chatMsg,
      timestamp: new Date().toISOString()
    };
    db.addChatMessage(msg);
    setMessages(db.getChat());
    setChatMsg('');
  };

  if (!user) {
    return (
      <div className="min-h-screen bg-[#0a0a0c] flex items-center justify-center p-4">
        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div className="hidden md:block">
            <h1 className="text-6xl font-black italic tracking-tighter mb-4">
              FC <span className="ea-accent">26</span> PRO
            </h1>
            <p className="text-gray-500 text-lg">Manage private tournaments like a champion. Double Round-Robin fixtures, atomic lottery draws, and safe audit logs.</p>
            <div className="mt-8 flex gap-4">
              <div className="ea-card p-4 rounded-lg flex-1 text-center">
                <p className="ea-accent font-bold text-2xl">2X</p>
                <p className="text-[10px] uppercase text-gray-500">H/A Fixtures</p>
              </div>
              <div className="ea-card p-4 rounded-lg flex-1 text-center">
                <p className="ea-accent font-bold text-2xl">100%</p>
                <p className="text-[10px] uppercase text-gray-500">Atomic Draws</p>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg text-sm font-bold animate-pulse">
                {error}
              </div>
            )}
            
            <div className="ea-card p-8 rounded-2xl shadow-2xl border border-white/5">
              <h2 className="text-2xl font-black mb-6">SIGN IN</h2>
              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-gray-500 mb-2">Username</label>
                  <input type="text" value={loginUser} onChange={e => setLoginUser(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00ff88] outline-none font-bold" placeholder="admin" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-gray-500 mb-2">Password</label>
                  <input type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00ff88] outline-none font-bold" placeholder="••••••••" />
                </div>
                <button type="submit" className="w-full ea-bg-accent text-black font-black py-4 rounded-lg hover:brightness-110 transition-all mt-4 italic">ENTER PITCH</button>
              </form>
            </div>

            <div className="ea-card p-8 rounded-2xl border border-white/5">
              <h2 className="text-2xl font-black mb-6">REGISTER</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <input type="text" value={regUser} onChange={e => setRegUser(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none font-bold" placeholder="Username" />
                <input type="password" value={regPass} onChange={e => setRegPass(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none font-bold" placeholder="Password (min 6)" />
                <input type="text" value={regInvite} onChange={e => setRegInvite(e.target.value)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none font-bold" placeholder="Invite Code" />
                <button type="submit" className="w-full border border-[#00ff88] text-[#00ff88] font-black py-3 rounded-lg hover:bg-[#00ff88]/10 transition-all italic">CLAIM SEAT</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    if (selectedTournament) {
      return (
        <TournamentDetail 
          tournament={selectedTournament} 
          currentUser={user} 
          onBack={() => { setSelectedTournament(null); setCurrentPage('tournaments'); }} 
        />
      );
    }

    switch (currentPage) {
      case 'dashboard':
        return (
          <div className="space-y-8">
            <h2 className="text-4xl font-extrabold tracking-tight italic">Welcome back, <span className="ea-accent">{user.username}</span></h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="ea-card p-6 rounded-2xl border-l-4 border-[#00ff88]">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Active Tournaments</p>
                <p className="text-4xl font-black mt-2 italic">{tournaments.filter(t => t.status === TournamentStatus.ACTIVE).length}</p>
              </div>
              <div className="ea-card p-6 rounded-2xl border-l-4 border-blue-500">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Total Matches</p>
                <p className="text-4xl font-black mt-2 italic">{db.getAllMatches().length}</p>
              </div>
              <div className="ea-card p-6 rounded-2xl border-l-4 border-purple-500">
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Global Teams</p>
                <p className="text-4xl font-black mt-2 italic">{db.getGlobalTeams().length}</p>
              </div>
            </div>
          </div>
        );

      case 'tournaments':
        return (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-3xl font-black italic tracking-tighter uppercase">Leagues & Cups</h2>
              {user.role === UserRole.ADMIN && (
                <button onClick={() => setShowTModal(true)} className="ea-bg-accent text-black font-black px-6 py-2 rounded-lg italic">Create Tournament</button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {tournaments.map(t => (
                <div key={t.id} onClick={() => setSelectedTournament(t)} className="ea-card p-6 rounded-2xl cursor-pointer hover:border-[#00ff88]/50 transition-all group">
                  <div className="flex justify-between items-start mb-4">
                    <span className={`px-2 py-1 rounded text-[10px] font-black uppercase ${t.status === TournamentStatus.ACTIVE ? 'ea-bg-accent text-black' : 'bg-gray-800 text-gray-500'}`}>{t.status}</span>
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{t.type}</span>
                  </div>
                  <h3 className="text-2xl font-black group-hover:ea-accent transition-colors italic">{t.name}</h3>
                  <div className="mt-6 pt-4 border-t border-white/5 flex justify-between items-center text-xs font-black uppercase text-gray-500">
                    <span>{t.participantUserIds.length} Players</span>
                    <span className="text-[#00ff88] opacity-0 group-hover:opacity-100 transition-opacity">Manage →</span>
                  </div>
                </div>
              ))}
            </div>

            {showTModal && (
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
                <div className="ea-card w-full max-w-md p-8 rounded-2xl border border-[#00ff88]/20 animate-fade-in">
                  <h3 className="text-2xl font-black mb-6 italic">New Competition</h3>
                  <form onSubmit={handleCreateTournament} className="space-y-5">
                    <div>
                      <label className="block text-[10px] uppercase font-black text-gray-500 mb-2">Tournament Name</label>
                      <input autoFocus type="text" value={newTName} onChange={e => setNewTName(e.target.value)} placeholder="Premier League" className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-[#00ff88] font-bold italic" required />
                    </div>
                    <div>
                      <label className="block text-[10px] uppercase font-black text-gray-500 mb-2">Format Type</label>
                      <select value={newTType} onChange={e => setNewTType(e.target.value as TournamentType)} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none focus:border-[#00ff88] font-bold">
                        <option value={TournamentType.LOTTERY}>Lottery Assignment (Teams Required)</option>
                        <option value={TournamentType.USERS_ONLY}>Users Only (Manual Teams)</option>
                      </select>
                    </div>
                    <div className="flex gap-4 pt-4">
                      <button type="button" onClick={() => setShowTModal(false)} className="flex-1 px-6 py-3 rounded-lg font-black text-[10px] uppercase tracking-widest text-gray-400 hover:bg-white/5">Cancel</button>
                      <button type="submit" className="flex-1 ea-bg-accent text-black font-black px-6 py-3 rounded-lg italic tracking-widest">Confirm</button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        );

      case 'rankings':
        const allUsers = db.getUsers();
        const allMatches = db.getAllMatches().filter(m => m.isCompleted);
        const rankings = allUsers.map(u => {
          let pts = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
          allMatches.forEach(m => {
            if (m.playerAId === u.id) {
              gf += m.scoreA!; ga += m.scoreB!;
              if (m.scoreA! > m.scoreB!) { pts += 3; w++; }
              else if (m.scoreA! < m.scoreB!) l++;
              else { pts += 1; d++; }
            } else if (m.playerBId === u.id) {
              gf += m.scoreB!; ga += m.scoreA!;
              if (m.scoreB! > m.scoreA!) { pts += 3; w++; }
              else if (m.scoreB! < m.scoreA!) l++;
              else { pts += 1; d++; }
            }
          });
          return { ...u, pts, w, d, l, gf, ga, played: w+d+l };
        }).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga));

        return (
          <div className="space-y-6">
            <h2 className="text-3xl font-black italic tracking-tighter">HALL OF <span className="ea-accent">FAME</span></h2>
            <div className="ea-card rounded-2xl overflow-hidden border border-white/5 shadow-2xl">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-white/5 text-gray-500 text-[10px] uppercase font-black tracking-widest">
                    <th className="py-5 px-6">Rank</th>
                    <th className="py-5 px-6">User</th>
                    <th className="py-5 px-6">MP</th>
                    <th className="py-5 px-6">W-D-L</th>
                    <th className="py-5 px-6">GD</th>
                    <th className="py-5 px-6">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rankings.map((r, i) => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-5 px-6 font-black italic text-2xl">#{i+1}</td>
                      <td className="py-5 px-6 font-black italic text-xl tracking-tight">{r.username}</td>
                      <td className="py-5 px-6 text-gray-500 font-bold">{r.played}</td>
                      <td className="py-5 px-6 text-gray-500 font-bold">{r.w}-{r.d}-{r.l}</td>
                      <td className="py-5 px-6 text-gray-500 font-bold">{r.gf - r.ga}</td>
                      <td className="py-5 px-6 ea-accent font-black text-3xl italic tracking-tighter">{r.pts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'profile':
        return (
          <div className="space-y-8">
            <div className="ea-card p-12 rounded-3xl flex flex-col md:flex-row items-center gap-12 shadow-2xl border-white/5">
              <div className="w-40 h-40 rounded-full ea-bg-accent text-black flex items-center justify-center text-6xl font-black shadow-2xl italic tracking-tighter ring-8 ring-white/5">
                {user.username[0].toUpperCase()}
              </div>
              <div>
                <h2 className="text-6xl font-black italic tracking-tighter uppercase">{user.username}</h2>
                <p className="text-[#00ff88] font-black uppercase tracking-widest mt-2">{user.role}</p>
                <div className="mt-8 space-y-2">
                  <p className="text-[10px] text-gray-500 font-black uppercase tracking-widest">Membership Profile</p>
                  <p className="text-sm font-bold text-gray-400">UID: {user.id}</p>
                  <p className="text-sm font-bold text-gray-400">Joined: {new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          </div>
        );

      case 'chat':
        return (
          <div className="h-[calc(100vh-160px)] flex flex-col ea-card rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
            <header className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
              <h3 className="text-xl font-black italic tracking-tighter uppercase">Global <span className="ea-accent">Locker</span> Room</h3>
              <span className="text-[10px] font-black text-gray-500 uppercase tracking-widest">{messages.length} Active Feeds</span>
            </header>
            <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
              {messages.map(m => (
                <div key={m.id} className={`max-w-[75%] ${m.userId === user.id ? 'ml-auto text-right' : 'mr-auto'}`}>
                  <div className={`text-[9px] font-black uppercase mb-1 ${m.role === UserRole.ADMIN ? 'text-purple-400' : 'text-gray-500'}`}>{m.username} {m.role === UserRole.ADMIN ? '(ADMIN)' : ''}</div>
                  <div className={`p-4 rounded-2xl inline-block shadow-lg ${m.userId === user.id ? 'ea-bg-accent text-black font-black italic' : 'bg-white/5 border border-white/10'}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <form onSubmit={sendChatMessage} className="p-6 bg-white/5 border-t border-white/5 flex gap-4">
              <input type="text" value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Broadcast strategy..." className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-[#00ff88] font-bold italic" />
              <button type="submit" className="ea-bg-accent text-black font-black px-12 rounded-2xl italic tracking-widest shadow-xl shadow-[#00ff88]/10">SEND</button>
            </form>
          </div>
        );

      case 'admin':
        return <AdminPanel adminId={user.id} />;

      default:
        return <div>Not Found</div>;
    }
  };

  return (
    <Layout 
      user={user} 
      currentPage={currentPage} 
      setCurrentPage={(p) => { setSelectedTournament(null); setCurrentPage(p); }}
      onLogout={() => { auth.logout(); setUser(null); }}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
