
import React, { useState, useEffect, useMemo, useRef, Suspense } from 'react';
import type { User as FirebaseUser } from "firebase/auth";
import { authService } from './services/auth';
import { databaseService } from './services/db';
import { initError } from './services/firebase'; 
import { User, Tournament, TournamentStatus, TournamentType, UserRole, ChatMessage, Match } from './types';
import Layout from './components/Layout';
import { InvitationGate } from './components/InvitationGate';

// Lazy load heavy components to split chunks and improve performance
const AdminPanel = React.lazy(() => import('./components/AdminPanel'));
const TournamentDetail = React.lazy(() => import('./components/TournamentDetail'));
const PlayerProfile = React.lazy(() => import('./components/PlayerProfile'));

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [pendingAuthUser, setPendingAuthUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState('dashboard');
  
  // Data States
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [allMatches, setAllMatches] = useState<Match[]>([]);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [globalTeamsCount, setGlobalTeamsCount] = useState(0);
  
  const [dataLoading, setDataLoading] = useState(false);
  
  const [selectedTournament, setSelectedTournament] = useState<Tournament | null>(null);
  const [selectedProfileUser, setSelectedProfileUser] = useState<User | null>(null);
  
  // Auth Form State
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [regUser, setRegUser] = useState('');
  const [regPass, setRegPass] = useState('');
  const [regInvite, setRegInvite] = useState('');
  const [error, setError] = useState('');

  // UI UX State
  const [showLoginPass, setShowLoginPass] = useState(false);
  const [showRegPass, setShowRegPass] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [savePassword, setSavePassword] = useState(false);

  // Tournament Create Modal
  const [showTModal, setShowTModal] = useState(false);
  const [newTName, setNewTName] = useState('');
  const [newTType, setNewTType] = useState<TournamentType>(TournamentType.LOTTERY);

  // Global Chat State
  const [chatMsg, setChatMsg] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Derived Auth State
  const hasAdmin = useMemo(() => allUsers.some(u => u.role === UserRole.ADMIN), [allUsers]);

  // --- INITIALIZATION & AUTH ---
  useEffect(() => {
    // If there was an init error (missing config), we don't try to connect auth
    if (initError) {
        setAuthLoading(false);
        return;
    }

    // 1. Listen for Auth Changes
    const unsubscribe = authService.onAuthStateChanged((u, fbUser) => {
      if (u) {
        // Full profile exists
        setUser(u);
        setPendingAuthUser(null);
      } else if (fbUser) {
        // Authenticated but no profile -> Ghost State
        setPendingAuthUser(fbUser);
        setUser(null);
      } else {
        // Logged out
        setUser(null);
        setPendingAuthUser(null);
      }
      setAuthLoading(false);
    });

    // 2. Check System Health (User Count) for correct UI State
    const checkSystemHealth = async () => {
      try {
        const users = await databaseService.getUsers();
        setAllUsers(users);
      } catch (e) {
        console.warn("System state check failed:", e);
      }
    };
    checkSystemHealth();

    return () => unsubscribe();
  }, []);

  // --- DATA FETCHING ---
  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user, currentPage]); 

  // --- REAL-TIME CHAT SUBSCRIPTION ---
  useEffect(() => {
    if (!user) return;
    
    // Subscribe to chat updates
    const unsubscribeChat = databaseService.subscribeToChat((msgs) => {
        setMessages(msgs);
        // Scroll to bottom on new message
        setTimeout(() => {
            chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
        }, 100);
    });

    return () => {
        unsubscribeChat();
    }
  }, [user]);

  const loadDashboardData = async () => {
    if (initError) return; // Guard
    setDataLoading(true);
    try {
      const [tList, mList, uList, teamsList] = await Promise.all([
        databaseService.getTournaments(),
        databaseService.getAllMatches(),
        databaseService.getUsers(),
        databaseService.getGlobalTeams()
      ]);
      
      // --- CRITICAL SAFETY FILTER ---
      // We create a Set of IDs for tournaments that ACTUALLY exist in the DB.
      const validTournamentIds = new Set(tList.map(t => t.id));
      
      // We filter the raw match list. If a match points to a tournament ID 
      // that is NOT in our valid list (i.e., it was deleted), we exclude it.
      const validMatches = mList.filter(m => validTournamentIds.has(m.tournamentId));

      // Debug log to confirm filtering works
      console.log(`Loaded ${mList.length} total matches. Filtered down to ${validMatches.length} valid matches.`);

      setTournaments(tList);
      setAllMatches(validMatches); // State now only holds clean data
      setAllUsers(uList);
      setGlobalTeamsCount(teamsList.length);

      // Seed if empty (First run)
      if (teamsList.length === 0) {
        await databaseService.seedDefaultTeams();
        const recheck = await databaseService.getGlobalTeams();
        setGlobalTeamsCount(recheck.length);
      }

    } catch (err) {
      console.error("Failed to load dashboard data", err);
    } finally {
      setDataLoading(false);
    }
  };

  const playTypingSound = () => {
    if (!soundEnabled) return;
    try {
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContext) return;
      
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600 + Math.random() * 200, ctx.currentTime);
      
      gain.gain.setValueAtTime(0.02, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch (e) {
      // Silently fail
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await authService.login(loginUser, loginPass);
    } catch (err: any) {
      setError('Invalid credentials or connection error.');
      console.error(err);
    }
  };

  const handleGoogleLogin = async () => {
    setError('');
    try {
        const { isNew, user } = await authService.signInWithGoogle();
        // If isNew is true, the AuthListener useEffect will catch the 
        // updated firebase user without a profile and trigger setPendingAuthUser
        if (!isNew && user) {
            setUser(user);
        }
    } catch (err: any) {
        console.error(err);
        setError('Google Sign-In failed or cancelled.');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      await authService.register(regUser, regPass, regInvite);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
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
    await databaseService.addTournament(nt);
    await databaseService.log(user.id, 'Tournament Create', `Created ${newTName} (${newTType})`);
    
    setNewTName('');
    setShowTModal(false);
    loadDashboardData();
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatMsg || !user) return;
    const msg: ChatMessage = {
      id: Math.random().toString(36).substr(2, 9),
      userId: user.id,
      username: user.username,
      role: user.role,
      text: chatMsg,
      timestamp: new Date().toISOString()
    };
    await databaseService.addChatMessage(msg);
    setChatMsg('');
    // No need to reload data, subscription handles it
  };

  // Helper for Podiums
  const Podium = ({ title, data, valueKey, valueLabel, icon, colorClass }: { title: string, data: any[], valueKey: string, valueLabel: string, icon: any, colorClass: string }) => {
     const [first, second, third] = data;
     const hasData = data.length > 0;
     
     return (
        <div className="ea-card p-8 rounded-[2rem] border border-white/5 bg-gradient-to-b from-white/[0.02] to-transparent relative overflow-hidden group flex flex-col h-full min-h-[320px]">
            <div className="flex items-center gap-3 mb-8 relative z-10">
                <div className={`p-2 rounded-lg bg-white/5 text-${colorClass}`}>{icon}</div>
                <h3 className="text-sm font-black uppercase tracking-widest text-gray-400">{title}</h3>
            </div>

            {!hasData ? (
                 <div className="flex-1 flex flex-col items-center justify-center border-t border-white/5 mt-auto opacity-50">
                    <p className="text-gray-600 font-black uppercase text-[10px] tracking-widest italic">No Data Available</p>
                    <p className="text-gray-700 text-[9px] mt-1 font-bold">Play matches to populate</p>
                 </div>
            ) : (
                <div className="flex items-end justify-center gap-4 h-48 relative z-10 pb-4 mt-auto">
                    {/* 2nd Place */}
                    <div className="flex flex-col items-center w-1/3 group-hover:-translate-y-1 transition-transform duration-500 delay-100">
                        {second ? (
                            <>
                                <div className="text-center mb-2">
                                    <div className="text-[10px] font-black uppercase text-gray-500 tracking-widest">2nd</div>
                                    <div className="font-black italic text-white truncate w-full px-1 text-xs sm:text-sm">{second.username}</div>
                                    <div className={`text-[10px] font-bold text-${colorClass}`}>{second[valueKey]} {valueLabel}</div>
                                </div>
                                <div className="w-full h-24 bg-gradient-to-t from-gray-500/20 to-gray-400/10 rounded-t-lg border-t border-gray-500/30 relative">
                                     <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-30"></div>
                                </div>
                            </>
                        ) : <div className="w-full h-24 opacity-0" />}
                    </div>
                    
                    {/* 1st Place */}
                    <div className="flex flex-col items-center w-1/3 -mt-4 group-hover:-translate-y-2 transition-transform duration-500">
                         {first ? (
                            <>
                                <div className="text-center mb-2">
                                    <div className="text-xs font-black uppercase text-yellow-500 tracking-widest mb-1">👑 1st</div>
                                    <div className="font-black italic text-lg sm:text-xl text-white truncate w-full px-1">{first.username}</div>
                                    <div className={`text-xs sm:text-sm font-black text-${colorClass}`}>{first[valueKey]} {valueLabel}</div>
                                </div>
                                <div className={`w-full h-32 bg-gradient-to-t from-${colorClass}/20 to-${colorClass}/10 rounded-t-lg border-t border-${colorClass}/30 relative shadow-[0_-10px_40px_rgba(0,0,0,0.5)]`}>
                                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-30"></div>
                                    <div className={`absolute top-0 left-0 right-0 h-1 bg-${colorClass} shadow-[0_0_15px_${colorClass}]`}></div>
                                </div>
                            </>
                         ) : null}
                    </div>

                    {/* 3rd Place */}
                    <div className="flex flex-col items-center w-1/3 group-hover:-translate-y-1 transition-transform duration-500 delay-200">
                         {third ? (
                            <>
                                <div className="text-center mb-2">
                                    <div className="text-[10px] font-black uppercase text-orange-700 tracking-widest">3rd</div>
                                    <div className="font-black italic text-white truncate w-full px-1 text-xs sm:text-sm">{third.username}</div>
                                    <div className={`text-[10px] font-bold text-${colorClass}`}>{third[valueKey]} {valueLabel}</div>
                                </div>
                                <div className="w-full h-16 bg-gradient-to-t from-orange-800/20 to-orange-700/10 rounded-t-lg border-t border-orange-700/30 relative">
                                    <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMDUiLz48L3N2Zz4=')] opacity-30"></div>
                                </div>
                            </>
                         ) : <div className="w-full h-16 opacity-0" />}
                    </div>
                </div>
            )}
        </div>
     );
  };

  // --- RENDERING ---
  
  if (initError) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white p-8">
            <div className="ea-card p-10 rounded-3xl border-red-500/30 bg-red-500/5 max-w-2xl text-center shadow-2xl">
                <div className="w-16 h-16 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6 text-2xl">⚠️</div>
                <h1 className="text-3xl font-black italic tracking-tighter uppercase mb-4 text-red-500">Setup Required</h1>
                <p className="text-gray-300 mb-8 font-medium">The application cannot connect to the cloud database because the configuration is missing.</p>
                <div className="text-[10px] font-bold text-red-400 uppercase tracking-widest border border-red-500/20 py-2 px-4 rounded-lg inline-block">
                    Error: {initError}
                </div>
            </div>
        </div>
      );
  }

  if (authLoading) {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-[#0a0a0c] text-white">
            <div className="loader mb-4"></div>
            <p className="text-[10px] uppercase font-black tracking-widest text-gray-500">Connecting to FC26 Pro Cloud...</p>
        </div>
    );
  }

  // GHOST USER STATE (Google Auth Success, DB Profile Missing)
  if (pendingAuthUser && !user) {
      return (
        <InvitationGate 
            firebaseUser={pendingAuthUser} 
            onSuccess={(newUser) => {
                setPendingAuthUser(null);
                setUser(newUser);
            }}
            onCancel={() => {
                authService.logout();
                setPendingAuthUser(null);
            }}
        />
      );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden">
        {/* --- GLOBAL FOOTBALL THEMED BACKGROUND (Login) --- */}
        <div className="fixed inset-0 z-0 pointer-events-none select-none">
          <div className="absolute inset-0 bg-gradient-to-br from-[#15151a] via-[#0a0a0c] to-[#050506]" />
          <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vh] h-[80vh] rounded-full border-2 border-dashed border-white/10 animate-[spin_120s_linear_infinite]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,6,0.5)_100%)]" />
        </div>

        <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 items-center relative z-10">
          <div className="hidden md:block">
            <h1 className="text-6xl font-black italic tracking-tighter mb-4">
              FC <span className="ea-accent">26</span> PRO
            </h1>
            <p className="text-gray-500 text-lg">Manage private tournaments like a champion. Real-time cloud sync, automated fixtures, and secure audit logs.</p>
          </div>

          <div className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 text-red-400 p-4 rounded-lg text-sm font-bold animate-pulse">
                {error}
              </div>
            )}
            
            <div className="ea-card p-8 rounded-2xl shadow-2xl border border-white/5">
              <h2 className="text-2xl font-black mb-6">SIGN IN</h2>
              
              {/* GOOGLE AUTH BUTTON */}
              <button 
                type="button"
                onClick={handleGoogleLogin}
                className="w-full bg-white text-black font-black py-4 rounded-lg hover:bg-gray-200 transition-all mb-4 flex items-center justify-center gap-3"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24">
                   <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                   <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                   <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                   <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                CONTINUE WITH GOOGLE
              </button>

              <div className="relative flex py-2 items-center">
                <div className="flex-grow border-t border-white/10"></div>
                <span className="flex-shrink-0 mx-4 text-[10px] font-black uppercase text-gray-500 tracking-widest">Or using password</span>
                <div className="flex-grow border-t border-white/10"></div>
              </div>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label className="block text-[10px] uppercase font-black text-gray-500 mb-2">Email / Username</label>
                  <input type="text" value={loginUser} onChange={e => { setLoginUser(e.target.value); playTypingSound(); }} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00ff88] outline-none font-bold" placeholder="user@fc26pro.com" />
                </div>
                <div>
                  <label className="block text-[10px] uppercase font-black text-gray-500 mb-2">Password</label>
                  <div className="relative">
                    <input 
                      type={showLoginPass ? "text" : "password"} 
                      value={loginPass} 
                      onChange={e => { setLoginPass(e.target.value); playTypingSound(); }} 
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 focus:border-[#00ff88] outline-none font-bold pr-12" 
                      placeholder="••••••••" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowLoginPass(!showLoginPass)} 
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showLoginPass ? "HIDE" : "SHOW"}
                    </button>
                  </div>
                </div>
                
                <button type="submit" className="w-full ea-bg-accent text-black font-black py-4 rounded-lg hover:brightness-110 transition-all mt-4 italic">ENTER PITCH</button>
              </form>
            </div>

            <div className="ea-card p-8 rounded-2xl border border-white/5">
              <h2 className="text-2xl font-black mb-6">REGISTER</h2>
              <form onSubmit={handleRegister} className="space-y-4">
                <input type="text" value={regUser} onChange={e => { setRegUser(e.target.value); playTypingSound(); }} className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none font-bold" placeholder="Username" />
                
                <div className="relative">
                    <input 
                      type={showRegPass ? "text" : "password"} 
                      value={regPass} 
                      onChange={e => { setRegPass(e.target.value); playTypingSound(); }} 
                      className="w-full bg-black/40 border border-white/10 rounded-lg px-4 py-3 outline-none font-bold pr-12" 
                      placeholder="Password (min 6)" 
                    />
                    <button 
                      type="button" 
                      onClick={() => setShowRegPass(!showRegPass)} 
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                    >
                      {showRegPass ? "HIDE" : "SHOW"}
                    </button>
                </div>

                <input 
                    type="text" 
                    value={regInvite} 
                    onChange={e => { setRegInvite(e.target.value); playTypingSound(); }} 
                    className={`w-full bg-black/40 border rounded-lg px-4 py-3 outline-none font-bold transition-colors ${!hasAdmin ? 'border-[#00ff88]/50 text-[#00ff88]' : 'border-white/10'}`} 
                    placeholder={!hasAdmin ? "No Code Needed (Become Admin)" : "Invite Code"} 
                />
                <button type="submit" className="w-full border border-[#00ff88] text-[#00ff88] font-black py-3 rounded-lg hover:bg-[#00ff88]/10 transition-all italic">CLAIM SEAT</button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const renderContent = () => {
    // SUSPENSE WRAPPER FOR LAZY COMPONENTS
    const SuspenseLoader = () => (
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
            <div className="loader mb-4"></div>
            <p className="text-xs font-black uppercase tracking-widest">Loading Component...</p>
        </div>
    );

    if (selectedTournament) {
      return (
        <Suspense fallback={<SuspenseLoader />}>
            <TournamentDetail 
              tournament={selectedTournament} 
              currentUser={user} 
              onBack={() => { setSelectedTournament(null); setCurrentPage('tournaments'); }} 
            />
        </Suspense>
      );
    }

    if (dataLoading) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                <div className="loader mb-4"></div>
                <p className="text-xs font-black uppercase tracking-widest">Loading Live Data...</p>
            </div>
        );
    }

    switch (currentPage) {
      case 'dashboard':
        // 2. Simple Counts
        const activeCount = tournaments.filter(t => t.status === TournamentStatus.ACTIVE).length;
        const finishedCount = tournaments.filter(t => t.status === TournamentStatus.FINISHED).length;
        const totalUsers = allUsers.length;
        // Calculation now strictly uses 'allMatches' which has been pre-filtered in loadDashboardData
        const totalGoals = allMatches.reduce((acc, m) => acc + (m.scoreA || 0) + (m.scoreB || 0), 0);
        
        // 3. Biggest Win Calculation
        let biggestWin = null;
        let maxDiff = -1;
        
        // 4. Advanced User Aggregation (for Podiums)
        const userStatsMap = new Map<string, { username: string, pts: number, gf: number, ga: number, w: number, d: number, l: number, played: number }>();
        allUsers.forEach(u => {
            userStatsMap.set(u.id, { username: u.username, pts: 0, gf: 0, ga: 0, w: 0, d: 0, l: 0, played: 0 });
        });

        allMatches.forEach(m => {
          if (m.isCompleted && m.scoreA !== null && m.scoreB !== null) {
            // Biggest Win Logic
            const diff = Math.abs(m.scoreA - m.scoreB);
            if (diff > maxDiff) {
              maxDiff = diff;
              biggestWin = m;
            }

            // User Stats Aggregation
            const sA = userStatsMap.get(m.playerAId);
            const sB = userStatsMap.get(m.playerBId);
            
            if (sA) {
                sA.played++;
                sA.gf += m.scoreA;
                sA.ga += m.scoreB;
                if (m.scoreA > m.scoreB) { sA.w++; sA.pts += 3; }
                else if (m.scoreA < m.scoreB) { sA.l++; }
                else { sA.d++; sA.pts += 1; }
            }
            if (sB) {
                sB.played++;
                sB.gf += m.scoreB;
                sB.ga += m.scoreA;
                if (m.scoreB > m.scoreA) { sB.w++; sB.pts += 3; }
                else if (m.scoreB < m.scoreA) { sB.l++; }
                else { sB.d++; sB.pts += 1; }
            }
          }
        });

        // 5. Derived Rankings
        const rankedUsers = Array.from(userStatsMap.values())
            .filter(s => s.played > 0)
            .sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);
        
        const topScorers = Array.from(userStatsMap.values())
            .filter(s => s.gf > 0)
            .sort((a, b) => b.gf - a.gf || b.played - a.played);

        // 6. Format Biggest Win Display
        let biggestWinUser = 'None';
        let biggestWinScore = '0 - 0';
        let biggestWinOpponent = '';
        
        if (biggestWin) {
          const bwMatch = biggestWin as unknown as Match; 
          const isA = (bwMatch.scoreA || 0) > (bwMatch.scoreB || 0);
          const wId = isA ? bwMatch.playerAId : bwMatch.playerBId;
          const lId = isA ? bwMatch.playerBId : bwMatch.playerAId;
          const wUser = allUsers.find(u => u.id === wId)?.username || 'Unknown';
          const lUser = allUsers.find(u => u.id === lId)?.username || 'Unknown';
          biggestWinUser = wUser;
          biggestWinScore = isA ? `${bwMatch.scoreA} - ${bwMatch.scoreB}` : `${bwMatch.scoreB} - ${bwMatch.scoreA}`;
          biggestWinOpponent = `vs ${lUser}`;
        }

        return (
          <div className="space-y-10 animate-fade-in pb-20">
            {/* Header */}
            <div className="relative">
                <h2 className="text-5xl font-black tracking-tighter italic text-transparent bg-clip-text bg-gradient-to-br from-white to-gray-500">
                  DASHBOARD
                </h2>
                <p className="text-gray-400 font-bold uppercase tracking-widest text-xs mt-2 flex items-center gap-2">
                   <span>Manager ID: {user.id.substring(0,8)}</span>
                   <span className="w-1 h-1 bg-[#00ff88] rounded-full animate-pulse"></span>
                   <span>Status: <span className="ea-accent">Cloud Connected</span></span>
                </p>
            </div>
            
            {/* Standard Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Active Tournaments */}
              <div className="ea-card p-6 rounded-2xl border border-[#00ff88]/20 bg-gradient-to-br from-[#00ff88]/5 to-transparent relative group hover:-translate-y-1 transition-transform duration-300">
                <p className="text-[10px] font-black text-[#00ff88] uppercase tracking-widest mb-1">Active Competitions</p>
                <p className="text-5xl font-black italic tracking-tighter text-white">{activeCount}</p>
                <div className="w-full h-1 bg-white/5 mt-4 rounded-full overflow-hidden">
                    <div className="h-full bg-[#00ff88] w-2/3 opacity-50"></div>
                </div>
              </div>

              {/* Total Matches */}
              <div className="ea-card p-6 rounded-2xl border border-blue-500/20 bg-gradient-to-br from-blue-500/5 to-transparent relative group hover:-translate-y-1 transition-transform duration-300">
                <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Total Matches</p>
                <p className="text-5xl font-black italic tracking-tighter text-white">{allMatches.length}</p>
                <div className="w-full h-1 bg-white/5 mt-4 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 w-1/2 opacity-50"></div>
                </div>
              </div>

              {/* Global Teams */}
              <div className="ea-card p-6 rounded-2xl border border-purple-500/20 bg-gradient-to-br from-purple-500/5 to-transparent relative group hover:-translate-y-1 transition-transform duration-300">
                <p className="text-[10px] font-black text-purple-400 uppercase tracking-widest mb-1">Available Football Teams</p>
                <p className="text-5xl font-black italic tracking-tighter text-white">{globalTeamsCount}</p>
                <div className="w-full h-1 bg-white/5 mt-4 rounded-full overflow-hidden">
                    <div className="h-full bg-purple-500 w-3/4 opacity-50"></div>
                </div>
              </div>
            </div>

            {/* Extended Stats */}
            <div className="pt-8 border-t border-white/5">
                <h3 className="text-sm font-black italic uppercase tracking-widest text-gray-500 mb-6 flex items-center gap-2">
                    <span className="w-8 h-0.5 bg-gray-700"></span>
                    Performance Analytics
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  {/* Finished Tournaments */}
                  <div className="ea-card p-6 rounded-2xl border border-gray-700 bg-white/[0.02] hover:bg-white/[0.04] transition-colors relative">
                    <div className="flex justify-between items-start">
                         <div>
                            <p className="text-[9px] font-black text-gray-400 uppercase tracking-widest">Finished Tournaments</p>
                            <p className="text-3xl font-black mt-2 italic text-gray-200">{finishedCount}</p>
                         </div>
                    </div>
                  </div>

                  {/* Total Users */}
                  <div className="ea-card p-6 rounded-2xl border border-yellow-500/20 bg-yellow-500/[0.02] hover:bg-yellow-500/[0.05] transition-colors relative">
                    <div className="flex justify-between items-start">
                         <div>
                            <p className="text-[9px] font-black text-yellow-500 uppercase tracking-widest">Total Managers</p>
                            <p className="text-3xl font-black mt-2 italic text-yellow-500">{totalUsers}</p>
                         </div>
                    </div>
                  </div>

                  {/* Total Goals */}
                  <div className="ea-card p-6 rounded-2xl border border-red-500/20 bg-red-500/[0.02] hover:bg-red-500/[0.05] transition-colors relative">
                    <div className="flex justify-between items-start">
                         <div>
                            <p className="text-[9px] font-black text-red-500 uppercase tracking-widest">Total Goals Scored</p>
                            <p className="text-3xl font-black mt-2 italic text-red-500">{totalGoals}</p>
                         </div>
                    </div>
                  </div>

                  {/* Biggest Win */}
                  {biggestWin ? (
                    <div className="ea-card p-6 rounded-2xl border border-[#00ff88]/30 bg-gradient-to-br from-[#00ff88]/20 to-black relative overflow-hidden group">
                      <p className="text-[9px] font-black text-[#00ff88] uppercase tracking-widest mb-2 flex items-center gap-1">
                          Biggest Win
                      </p>
                      <div className="relative z-10">
                        <p className="text-lg font-black italic text-white truncate">{biggestWinUser}</p>
                        <p className="text-4xl font-black italic ea-accent tracking-tighter my-1 drop-shadow-[0_0_10px_rgba(0,255,136,0.5)]">{biggestWinScore}</p>
                        <p className="text-[9px] font-bold text-gray-400 uppercase tracking-wide truncate">{biggestWinOpponent}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="ea-card p-6 rounded-2xl border border-white/10 flex items-center justify-center opacity-50">
                      <p className="text-[10px] font-black uppercase text-gray-500">No Records Yet</p>
                    </div>
                  )}
                </div>

                {/* All-Time Leaderboards */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <Podium 
                        title="All-Time Ranking (Top 3)" 
                        data={rankedUsers.slice(0, 3)} 
                        valueKey="pts" 
                        valueLabel="PTS" 
                        colorClass="green-400"
                        icon={<span>🏆</span>}
                    />
                    
                    <Podium 
                        title="Golden Boot (Top Scorers)" 
                        data={topScorers.slice(0, 3)} 
                        valueKey="gf" 
                        valueLabel="Goals" 
                        colorClass="yellow-400"
                        icon={<span>⚽</span>}
                    />
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
              <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex justify-center items-start pt-32 p-4 z-50">
                <div className="ea-card w-full max-w-md p-8 rounded-2xl border border-[#00ff88]/20 animate-fade-in shadow-2xl">
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
        const rankings = allUsers.map(u => {
          let pts = 0, w = 0, d = 0, l = 0, gf = 0, ga = 0;
          const completedMatches = allMatches.filter(m => m.isCompleted);
          
          completedMatches.forEach(m => {
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
        }).sort((a, b) => b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf);

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
                    <th className="py-5 px-6">GF</th>
                    <th className="py-5 px-6">GA</th>
                    <th className="py-5 px-6">GD</th>
                    <th className="py-5 px-6">Points</th>
                    <th className="py-5 px-6 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {rankings.map((r, i) => (
                    <tr key={r.id} className="hover:bg-white/5 transition-colors">
                      <td className="py-5 px-6 font-black italic text-2xl">#{i+1}</td>
                      <td className="py-5 px-6 font-black italic text-xl tracking-tight">{r.username}</td>
                      <td className="py-5 px-6 text-gray-500 font-bold">{r.played}</td>
                      <td className="py-5 px-6 text-gray-500 font-bold">{r.w}-{r.d}-{r.l}</td>
                      <td className="py-5 px-6 text-blue-400 font-bold">{r.gf}</td>
                      <td className="py-5 px-6 text-red-400 font-bold">{r.ga}</td>
                      <td className="py-5 px-6 text-gray-300 font-bold">{r.gf - r.ga}</td>
                      <td className="py-5 px-6 ea-accent font-black text-3xl italic tracking-tighter">{r.pts}</td>
                      <td className="py-5 px-6 text-right">
                          <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                setSelectedProfileUser(r);
                                setCurrentPage('profile');
                            }}
                            className="text-[10px] font-black uppercase tracking-widest bg-white/5 hover:bg-[#00ff88] hover:text-black px-4 py-2 rounded-lg transition-all"
                          >
                            View Profile
                          </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );

      case 'profile':
        const profileUser = selectedProfileUser || user;
        return (
            <div className="space-y-6">
                {selectedProfileUser && (
                    <button 
                        onClick={() => { setSelectedProfileUser(null); setCurrentPage('rankings'); }}
                        className="text-[10px] font-black uppercase text-gray-500 hover:text-white transition-colors flex items-center gap-2 mb-2 block tracking-widest"
                    >
                        <span>← Back to Rankings</span>
                    </button>
                )}
                <Suspense fallback={<SuspenseLoader />}>
                    <PlayerProfile user={profileUser} />
                </Suspense>
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
              <div ref={chatEndRef} />
            </div>
            <form onSubmit={sendChatMessage} className="p-6 bg-white/5 border-t border-white/5 flex gap-4">
              <input type="text" value={chatMsg} onChange={e => setChatMsg(e.target.value)} placeholder="Broadcast strategy..." className="flex-1 bg-black/40 border border-white/10 rounded-2xl px-6 py-4 outline-none focus:border-[#00ff88] font-bold italic" />
              <button type="submit" className="ea-bg-accent text-black font-black px-12 rounded-2xl italic tracking-widest shadow-xl shadow-[#00ff88]/10">SEND</button>
            </form>
          </div>
        );

      case 'admin':
        return <Suspense fallback={<SuspenseLoader />}><AdminPanel adminId={user.id} /></Suspense>;

      default:
        return <div>Not Found</div>;
    }
  };

  return (
    <Layout 
      user={user} 
      currentPage={currentPage} 
      setCurrentPage={(p) => { 
        setSelectedTournament(null); 
        setSelectedProfileUser(null);
        setCurrentPage(p); 
      }}
      onLogout={() => { authService.logout(); setUser(null); }}
    >
      {renderContent()}
    </Layout>
  );
};

export default App;
