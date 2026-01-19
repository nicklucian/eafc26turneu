
import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { databaseService } from '../services/db';
import { Tournament, GlobalTeam, Assignment, User, Match, TournamentStatus, TournamentType, UserRole, TeamType } from '../types';
import { generateFixturesAlgorithm, calculateStandingsLogic } from '../utils/logic';

interface Props {
  tournament: Tournament;
  currentUser: User;
  onBack: () => void;
}

// Sub-component for isolated match score editing.
const MatchInputGroup: React.FC<{ 
  match: Match, 
  onSave: (id: string, a: number, b: number) => void 
}> = ({ match, onSave }) => {
  const [a, setA] = useState(match.scoreA !== null ? match.scoreA.toString() : '');
  const [b, setB] = useState(match.scoreB !== null ? match.scoreB.toString() : '');

  useEffect(() => {
    setA(match.scoreA !== null ? match.scoreA.toString() : '');
    setB(match.scoreB !== null ? match.scoreB.toString() : '');
  }, [match.scoreA, match.scoreB]);

  const handleChange = (val: string, setFn: React.Dispatch<React.SetStateAction<string>>) => {
    const sanitized = val.replace(/\D/g, ''); 
    setFn(sanitized);
  };

  const handleSave = () => {
    if (a.trim() === '' || b.trim() === '') return alert('Both scores are required.');
    const valA = parseInt(a, 10);
    const valB = parseInt(b, 10);
    if (isNaN(valA) || isNaN(valB)) return alert('Invalid score.');
    onSave(match.id, valA, valB);
  };

  return (
    <div className="flex flex-col sm:flex-row items-center gap-4 bg-black/80 p-4 rounded-3xl border border-white/10 shadow-2xl animate-fade-in w-full sm:w-auto">
      <div className="flex items-center gap-4">
        <input 
            type="text" 
            inputMode="numeric" 
            value={a} 
            onChange={e => handleChange(e.target.value, setA)} 
            className="w-16 bg-transparent text-center font-black text-3xl text-white outline-none border-b-2 border-white/10 focus:border-[#00ff88] placeholder-gray-600" 
            placeholder="0" 
        />
        <span className="text-gray-800 font-black italic text-xl">VS</span>
        <input 
            type="text" 
            inputMode="numeric" 
            value={b} 
            onChange={e => handleChange(e.target.value, setB)} 
            className="w-16 bg-transparent text-center font-black text-3xl text-white outline-none border-b-2 border-white/10 focus:border-[#00ff88] placeholder-gray-600" 
            placeholder="0" 
        />
      </div>
      <button 
        onClick={handleSave} 
        className="w-full sm:w-auto ea-bg-accent text-black font-black px-6 py-2.5 rounded-2xl text-[10px] uppercase italic hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(0,255,136,0.3)]"
      >
        SET RESULT
      </button>
    </div>
  );
};

const TournamentDetail: React.FC<Props> = ({ tournament, currentUser, onBack }) => {
  const [globalTeams, setGlobalTeams] = useState<GlobalTeam[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allSystemUsers, setAllSystemUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const [showTeamPicker, setShowTeamPicker] = useState<{userId: string} | null>(null);
  const [activeTab, setActiveTab] = useState<'info' | 'standings' | 'matches' | 'admin'>('info');
  const [isFinishing, setIsFinishing] = useState(false);

  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isUsersOnly = tournament.type === TournamentType.USERS_ONLY;

  const [localTournament, setLocalTournament] = useState<Tournament>(tournament);

  useEffect(() => {
    refreshData();
  }, [tournament.id]);

  const refreshData = async () => {
    // Keep loading state mostly for first load
    try {
      const updatedTournament = await databaseService.getTournamentById(tournament.id);
      if (!updatedTournament) {
          onBack();
          return;
      }
      
      const [teams, assigns, usrs, matchArr] = await Promise.all([
        databaseService.getGlobalTeams(),
        databaseService.getAssignments(tournament.id),
        databaseService.getUsers(),
        databaseService.getMatches(tournament.id)
      ]);

      setLocalTournament(updatedTournament);
      setGlobalTeams(teams);
      setAssignments(assigns);
      setAllSystemUsers(usrs);
      setMatches(matchArr);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  const progressStats = useMemo(() => {
    const total = matches.length;
    const completed = matches.filter(m => m.isCompleted).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [matches]);

  const triggerConfetti = () => {
    confetti({
      particleCount: 150,
      spread: 70,
      origin: { y: 0.6 },
      colors: ['#00ff88', '#ffffff', '#fbbf24', '#ef4444', '#60a5fa'],
      zIndex: 9999
    });
  };

  const handleFinishTournament = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    if (!isAdmin || progressStats.percent < 100 || localTournament.status !== TournamentStatus.ACTIVE) return;
    setIsFinishing(true);
    try {
        await databaseService.updateTournamentStatus(localTournament.id, TournamentStatus.FINISHED);
        await databaseService.log(currentUser.id, 'TOURNAMENT_FINISHED', `Tournament ${localTournament.name} officially concluded.`);
        await refreshData();
        setActiveTab('standings');
    } catch (err) {
        console.error("Finishing error:", err);
        alert('Critical error finishing tournament.');
    } finally {
        setIsFinishing(false);
    }
  };

  const isFinished = localTournament.status === TournamentStatus.FINISHED;

  const handleSaveScore = async (matchId: string, sA: number, sB: number) => {
    if (!isAdmin || isFinished) return;
    try {
      await databaseService.updateMatch(matchId, sA, sB);
      await databaseService.log(currentUser.id, 'RESULT_POSTED', `Match result finalized for ${matchId}`);
      await refreshData();
    } catch (err: any) {
      alert(`Save Failed: ${err.message}`);
    }
  };

  const handleUndoResult = async (e: React.MouseEvent, matchId: string) => {
    e.preventDefault();
    e.stopPropagation(); 
    if (!isAdmin || isFinished) return;
    try {
      await databaseService.undoMatchResult(matchId);
      await databaseService.log(currentUser.id, 'RESULT_REVERTED', `Reopened match: ${matchId}`);
      await refreshData();
    } catch (err: any) {
      alert(`Undo Failed: ${err.message}`);
    }
  };

  const standings = useMemo(() => {
    return calculateStandingsLogic(
      localTournament.participantUserIds || [],
      matches,
      allSystemUsers,
      assignments,
      globalTeams,
      isUsersOnly
    );
  }, [matches, localTournament.participantUserIds, allSystemUsers, assignments, globalTeams, isUsersOnly]);

  const previousStandingsMap = useMemo(() => {
    const completedMatches = matches.filter(m => m.isCompleted);
    if (completedMatches.length === 0) return {};

    const currentMaxMatchday = Math.max(...completedMatches.map(m => m.matchday));
    if (currentMaxMatchday <= 1) return {};

    const prevMatches = matches.filter(m => m.isCompleted && m.matchday < currentMaxMatchday);
    
    const prevList = calculateStandingsLogic(
      localTournament.participantUserIds || [],
      prevMatches,
      allSystemUsers,
      assignments,
      globalTeams,
      isUsersOnly
    );

    const map: Record<string, number> = {};
    prevList.forEach((s, idx) => {
        map[s.id] = idx + 1;
    });
    return map;
  }, [matches, localTournament, allSystemUsers, assignments, globalTeams, isUsersOnly]);

  const getRecentForm = (userId: string) => {
    const userMatches = matches
        .filter(m => m.isCompleted && (m.playerAId === userId || m.playerBId === userId))
        .sort((a, b) => b.matchday - a.matchday);

    return userMatches.slice(0, 5).map(m => {
        const isA = m.playerAId === userId;
        const myScore = isA ? m.scoreA! : m.scoreB!;
        const oppScore = isA ? m.scoreB! : m.scoreA!;
        if (myScore > oppScore) return 'W';
        if (myScore < oppScore) return 'L';
        return 'D';
    });
  };

  const groupedMatches = useMemo(() => {
    const groups: Record<number, Match[]> = {};
    matches.filter(m => m.playerAId !== 'GHOST' && m.playerBId !== 'GHOST').forEach(m => {
      if (!groups[m.matchday]) groups[m.matchday] = [];
      groups[m.matchday].push(m);
    });
    return groups;
  }, [matches]);

  const generateFixtures = async () => {
    if (isFinished) return;
    const players = [...(localTournament.participantUserIds || [])];
    if (players.length < 2) return alert('Need at least 2 managers.');
    
    if (!isUsersOnly && assignments.length < players.length) {
      return alert('Lottery Draw required before schedule generation.');
    }

    const fixtures = generateFixturesAlgorithm(localTournament.id, players, assignments, isUsersOnly);

    triggerConfetti();

    await databaseService.deployFixtures(localTournament.id, fixtures);
    await databaseService.log(currentUser.id, 'FIXTURES_ACTIVE', `${localTournament.name} schedule live.`);
    await refreshData();
  };

  const runLottery = async () => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    const participantsCount = localTournament.participantUserIds?.length || 0;
    const pool = globalTeams
      .filter(t => (localTournament.selectedTeamIds || []).includes(t.id))
      .sort(() => Math.random() - 0.5);

    if (pool.length < participantsCount) return alert(`Draw pool too small. Need at least ${participantsCount} teams.`);
    
    triggerConfetti();

    await databaseService.resetTournamentSchedule(localTournament.id);
    const newAssignments: Assignment[] = (localTournament.participantUserIds || []).map((uid, idx) => ({
      id: Math.random().toString(36).substr(2, 9),
      tournamentId: localTournament.id,
      userId: uid,
      teamId: pool[idx].id
    }));
    await databaseService.addAssignments(newAssignments);
    await databaseService.log(currentUser.id, 'LOTTERY_COMMIT', `Fair-draw logic applied to ${localTournament.name}`);
    await refreshData();
  };

  const handleManualAssign = async (userId: string, teamId: string) => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    const existing = assignments.filter(a => a.userId !== userId);
    await databaseService.addAssignments([...existing, {
      id: Math.random().toString(36).substr(2, 9),
      tournamentId: localTournament.id,
      userId,
      teamId
    }]);
    setShowTeamPicker(null);
    await refreshData();
  };

  const toggleParticipant = async (userId: string) => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    let current = [...(localTournament.participantUserIds || [])];
    if (current.includes(userId)) {
      current = current.filter(id => id !== userId);
    } else {
      current.push(userId);
    }
    await databaseService.updateTournamentParticipants(localTournament.id, current);
    await refreshData();
  };

  const toggleTeamInPool = async (teamId: string) => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    let current = [...(localTournament.selectedTeamIds || [])];
    if (current.includes(teamId)) {
      current = current.filter(id => id !== teamId);
    } else {
      current.push(teamId);
    }
    await databaseService.updateTournamentTeams(localTournament.id, current);
    await refreshData();
  };

  const canDeploy = useMemo(() => {
    const count = (localTournament.participantUserIds || []).length;
    return count >= 2 && (isUsersOnly || assignments.length >= count) && matches.length === 0 && localTournament.status === TournamentStatus.UPCOMING;
  }, [localTournament, assignments, isUsersOnly, matches]);

  if (isLoading) {
      return <div className="p-10 text-center"><div className="loader mx-auto"></div></div>;
  }

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#1a1a1e] p-6 rounded-2xl border border-white/5 gap-4 shadow-xl">
        <div className="w-full md:w-auto">
          <button onClick={onBack} className="text-[10px] font-black uppercase text-gray-500 hover:text-white transition-colors mb-2 block tracking-widest">← Return to Lobby</button>
          <h2 className="text-3xl md:text-4xl font-black italic tracking-tighter uppercase break-words">{localTournament.name}</h2>
          <div className="flex items-center gap-2 mt-2">
            <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${
                localTournament.status === TournamentStatus.ACTIVE ? 'ea-bg-accent text-black' : 
                isFinished ? 'bg-red-600 text-white shadow-[0_0_15px_rgba(239,68,68,0.4)]' : 
                'bg-white/5 text-gray-400'
            }`}>
                {localTournament.status}
            </span>
            <span className="text-[9px] font-black uppercase text-blue-400 bg-blue-400/10 px-2 py-1 rounded">{localTournament.type}</span>
          </div>
        </div>
        <div className="flex gap-2 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 no-scrollbar">
          {['info', 'standings', 'matches', (isAdmin && !isFinished) ? 'admin' : null].filter(Boolean).map(tab => (
            <button key={tab!} onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === tab ? 'ea-bg-accent text-black shadow-[0_10px_30px_rgba(0,255,136,0.3)]' : 'bg-white/5 text-gray-500 hover:text-white'}`}
            >
              {tab}
            </button>
          ))}
        </div>
      </header>

      {(activeTab === 'standings' || activeTab === 'matches') && matches.length > 0 && (
        <div className="ea-card p-6 rounded-3xl border-white/5 animate-fade-in mb-6">
            <div className="flex justify-between items-end mb-3">
                <div>
                    <h4 className="text-[10px] font-black uppercase text-gray-500 tracking-widest italic">Tournament Progress</h4>
                    <p className="text-sm font-black italic uppercase tracking-tighter mt-1">
                        {progressStats.completed} / {progressStats.total} Matches Recorded
                    </p>
                </div>
                <div className="text-right">
                    <span className={`text-2xl font-black italic ${isFinished ? 'text-white' : 'ea-accent'}`}>{progressStats.percent}%</span>
                </div>
            </div>
            <div className="w-full h-3 bg-black/40 rounded-full overflow-hidden border border-white/5">
                <div 
                    className={`h-full transition-all duration-700 ease-out ${isFinished ? 'bg-white/40' : 'ea-bg-accent shadow-[0_0_15px_rgba(0,255,136,0.3)]'}`} 
                    style={{ width: `${progressStats.percent}%` }}
                />
            </div>
            <div className="mt-6 flex justify-end gap-3">
              {isAdmin && localTournament.status === TournamentStatus.ACTIVE && progressStats.percent === 100 && (
                  <button 
                      onClick={handleFinishTournament}
                      disabled={isFinishing}
                      className="ea-bg-accent text-black font-black px-8 py-3 rounded-2xl text-[10px] uppercase italic hover:scale-105 active:scale-95 transition-all shadow-[0_10px_25px_rgba(0,255,136,0.4)] w-full sm:w-auto"
                  >
                      {isFinishing ? 'FINISHING...' : 'CONCLUDE TOURNAMENT'}
                  </button>
              )}
            </div>
        </div>
      )}

      {/* RENDER CONTENT BASED ON TABS */}
      {activeTab === 'info' && (
        <div className="grid lg:grid-cols-3 gap-8 animate-fade-in">
          <div className="lg:col-span-2 space-y-6">
            <div className="ea-card p-8 rounded-3xl border-white/5">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
                <div>
                  <h4 className="text-xl font-black italic uppercase tracking-tighter">Managers</h4>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest italic">Official Roster</p>
                </div>
                {isAdmin && localTournament.status === TournamentStatus.UPCOMING && localTournament.type === TournamentType.LOTTERY && (localTournament.participantUserIds?.length || 0) >= 2 && (
                  <button 
                    onClick={runLottery} 
                    disabled={(localTournament.selectedTeamIds?.length || 0) < (localTournament.participantUserIds?.length || 0)}
                    className="ea-bg-accent text-black font-black px-6 py-2 rounded-xl text-[10px] uppercase italic hover:scale-105 transition-transform disabled:opacity-20 shadow-[0_10px_20px_rgba(0,255,136,0.2)] w-full sm:w-auto"
                  >
                    Randomize Teams
                  </button>
                )}
              </div>
              <div className="space-y-3">
                {(localTournament.participantUserIds || []).map(uid => {
                  const u = allSystemUsers.find(user => user.id === uid);
                  const assignment = assignments.find(a => a.userId === uid);
                  const team = globalTeams.find(t => t.id === assignment?.teamId);
                  return (
                    <div key={uid} className="flex items-center justify-between p-5 bg-black/40 border border-white/10 rounded-2xl group hover:border-[#00ff88]/20 transition-all">
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-black italic text-2xl text-[#00ff88] flex-shrink-0">{u?.username[0].toUpperCase() || '?'}</div>
                        <div className="min-w-0">
                          <span className="font-black italic text-xl tracking-tight block truncate">{u?.username || 'Unknown'}</span>
                          {!isUsersOnly && (
                            <div className="mt-1 flex items-center gap-2">
                                {team ? (
                                    <span className="text-[10px] font-black uppercase ea-accent tracking-widest truncate">{team.name}</span>
                                ) : (
                                    <span className="text-[10px] font-black uppercase text-gray-700 italic">Unassigned</span>
                                )}
                                {isAdmin && localTournament.status === TournamentStatus.UPCOMING && (
                                  <button onClick={() => setShowTeamPicker({userId: uid})} className="text-[8px] font-black uppercase text-[#00ff88]/40 hover:text-[#00ff88] transition-colors">[Change]</button>
                                )}
                            </div>
                          )}
                        </div>
                      </div>
                      {isAdmin && localTournament.status === TournamentStatus.UPCOMING && (
                        <button onClick={() => toggleParticipant(uid)} className="p-2 text-gray-600 hover:text-red-500 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
            {isAdmin && localTournament.status === TournamentStatus.UPCOMING && (
              <div className="space-y-6">
                <div className="ea-card p-8 rounded-3xl border-white/5">
                  <h4 className="text-xs font-black uppercase text-gray-500 mb-6 tracking-widest italic">Add Managers</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {allSystemUsers.filter(u => !localTournament.participantUserIds?.includes(u.id)).map(u => (
                      <button key={u.id} onClick={() => toggleParticipant(u.id)} className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl hover:border-[#00ff88]/50 hover:bg-[#00ff88]/5 transition-all group">
                        <span className="font-black italic text-gray-500 group-hover:text-white transition-colors truncate">{u.username}</span>
                        <span className="text-[10px] font-black uppercase text-[#00ff88]">Add +</span>
                      </button>
                    ))}
                  </div>
                </div>
                {!isUsersOnly && localTournament.type === TournamentType.LOTTERY && (
                  <div className="ea-card p-8 rounded-3xl border-white/5">
                    <h4 className="text-xs font-black uppercase text-gray-500 mb-6 tracking-widest italic">Team Selection Pool</h4>
                    <p className="text-[10px] text-gray-500 font-bold uppercase mb-6 tracking-tighter">Allocated {localTournament.selectedTeamIds?.length || 0} / {(localTournament.participantUserIds || []).length} slots.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 max-h-[300px] overflow-y-auto no-scrollbar pr-2">
                      {globalTeams.filter(t => t.isActive).map(team => {
                        const isInPool = (localTournament.selectedTeamIds || []).includes(team.id);
                        return (
                          <button key={team.id} onClick={() => toggleTeamInPool(team.id)} 
                            className={`p-3 rounded-xl border text-left transition-all ${isInPool ? 'bg-[#00ff88]/10 border-[#00ff88]/50 text-[#00ff88]' : 'bg-white/5 border-white/5 text-gray-600 hover:border-white/10'}`}
                          >
                            <span className="text-[10px] font-black italic tracking-tighter block truncate">{team.name}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="ea-card p-8 rounded-3xl border-white/5 h-fit space-y-8 sticky top-6 shadow-2xl">
            <h4 className="text-xs font-black uppercase text-[#00ff88] tracking-widest italic border-b border-white/5 pb-4">Competition Stats</h4>
            <div className="space-y-6">
                <div className="flex justify-between text-[11px] font-black uppercase italic">
                    <span className="text-gray-500">Registered</span>
                    <span>{(localTournament.participantUserIds || []).length} / 2 Min</span>
                </div>
                {!isUsersOnly && (
                    <div className="flex justify-between text-[11px] font-black uppercase italic">
                        <span className="text-gray-500">Asset Pot</span>
                        <span className={(localTournament.selectedTeamIds?.length || 0) >= (localTournament.participantUserIds?.length || 0) ? 'text-[#00ff88]' : 'text-red-500'}>
                            {(localTournament.selectedTeamIds?.length || 0)} / {(localTournament.participantUserIds?.length || 0)}
                        </span>
                    </div>
                )}
                <div className="flex justify-between text-[11px] font-black uppercase italic">
                    <span className="text-gray-500">Status</span>
                    <span className={`font-black ${isFinished ? 'text-red-500' : 'text-blue-400'}`}>{localTournament.status}</span>
                </div>
            </div>
            {isAdmin && localTournament.status === TournamentStatus.UPCOMING && (
              <button onClick={() => setActiveTab('admin')} className="w-full py-4 bg-white/5 border border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-[#00ff88]/10 hover:text-[#00ff88] transition-all">
                Deploy Schedule →
              </button>
            )}
          </div>
        </div>
      )}

      {activeTab === 'standings' && (
        <div className="ea-card rounded-3xl overflow-hidden border border-white/10 animate-fade-in shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-white/5 text-gray-500 text-[10px] uppercase font-black tracking-widest border-b border-white/5">
                  <th className="py-6 px-6">Pos</th>
                  <th className="py-6 px-6">Manager</th>
                  <th className="py-6 px-4 text-center">P</th>
                  <th className="py-6 px-4 text-center">W</th>
                  <th className="py-6 px-4 text-center">D</th>
                  <th className="py-6 px-4 text-center">L</th>
                  <th className="py-6 px-4 text-center">GF</th>
                  <th className="py-6 px-4 text-center">GA</th>
                  <th className="py-6 px-4 text-center">GD</th>
                  <th className="py-6 px-6 text-center text-[#00ff88]">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {standings.map((s, idx) => {
                  const isCurrentUser = s.id === currentUser.id;
                  const rank = idx + 1;
                  const prevRank = previousStandingsMap[s.id];
                  const form = getRecentForm(s.id);
                  
                  // Rank styling logic
                  let rowClasses = "transition-all border-l-4 ";
                  let rankColor = "text-white";
                  let rankIndicator = null;

                  // Highlighting
                  if (rank === 1) {
                      rowClasses += "border-[#00ff88] bg-gradient-to-r from-[#00ff88]/10 to-transparent";
                      rankColor = "text-[#00ff88]";
                      rankIndicator = <span className="ml-2">🏆</span>;
                  } else if (rank === 2) {
                      rowClasses += "border-yellow-400 bg-gradient-to-r from-yellow-400/10 to-transparent";
                      rankColor = "text-yellow-400";
                  } else if (rank === 3) {
                      rowClasses += "border-red-500 bg-gradient-to-r from-red-500/10 to-transparent";
                      rankColor = "text-red-500";
                  } else {
                      rowClasses += `border-transparent hover:bg-white/5 ${isCurrentUser ? 'bg-white/[0.02]' : ''}`;
                  }

                  let trendArrow = <span className="text-gray-700 w-3 inline-block text-center">-</span>;
                  if (prevRank) {
                    if (prevRank > rank) trendArrow = <span className="text-[#00ff88] animate-pulse">▲</span>;
                    else if (prevRank < rank) trendArrow = <span className="text-red-500 animate-pulse">▼</span>;
                  }

                  return (
                    <tr key={s.id} className={rowClasses}>
                      <td className="py-6 px-6 font-black italic text-2xl tracking-tighter flex items-center gap-3">
                        <span className="text-xs">{trendArrow}</span>
                        <span className={rankColor}>{rank}</span>
                      </td>
                      <td className="py-6 px-6">
                        <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                                <span className={`font-black italic text-xl tracking-tighter uppercase truncate max-w-[150px] sm:max-w-none pr-2 ${isCurrentUser ? 'text-[#00ff88]' : 'text-white'}`}>
                                    {s.username} {rankIndicator}
                                </span>
                                <div className="hidden sm:flex gap-1 ml-2">
                                    {form.map((res, i) => (
                                        <div key={i} className={`w-2 h-2 rounded-full ${
                                            res === 'W' ? 'bg-[#00ff88] shadow-[0_0_5px_#00ff88]' : 
                                            res === 'D' ? 'bg-yellow-400' : 
                                            'bg-red-500'
                                        }`} title={res === 'W' ? 'Win' : res === 'D' ? 'Draw' : 'Loss'} />
                                    ))}
                                </div>
                            </div>
                            {!isUsersOnly && (
                                <p className="text-[9px] font-black uppercase text-gray-500 truncate max-w-[120px]">
                                    {globalTeams.find(t => t.id === assignments.find(a => a.userId === s.id)?.teamId)?.name || 'UNASSIGNED'}
                                </p>
                            )}
                        </div>
                      </td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.p}</td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.w}</td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.d}</td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.l}</td>
                      <td className="py-6 px-4 text-center font-bold text-blue-400">{s.gf}</td>
                      <td className="py-6 px-4 text-center font-bold text-red-400">{s.ga}</td>
                      <td className={`py-6 px-4 text-center font-bold ${s.gf - s.ga >= 0 ? 'text-gray-300' : 'text-red-900'}`}>{s.gf - s.ga}</td>
                      <td className="py-6 px-6 text-center ea-accent font-black text-4xl italic tracking-tighter">{s.pts}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'matches' && (
        <div className="space-y-10 animate-fade-in">
          {Object.entries(groupedMatches).sort(([a],[b]) => parseInt(a) - parseInt(b)).map(([day, dayMatches]: [string, Match[]]) => (
            <div key={day} className="space-y-6">
              <div className="flex items-center gap-6">
                <span className={`text-[12px] font-black uppercase px-5 py-1.5 rounded-sm italic tracking-tighter shadow-xl ${isFinished ? 'bg-gray-800 text-gray-400' : 'bg-[#00ff88] text-black shadow-[#00ff88]/10'}`}>Matchday {day}</span>
                <div className="h-px bg-white/5 flex-1"></div>
              </div>
              <div className="grid gap-4">
                {dayMatches.map(m => {
                  const uA = allSystemUsers.find(u => u.id === m.playerAId);
                  const uB = allSystemUsers.find(u => u.id === m.playerBId);
                  const teamAName = globalTeams.find(t => t.id === m.teamAId)?.name;
                  const teamBName = globalTeams.find(t => t.id === m.teamBId)?.name;
                  const isEditing = isAdmin && !isFinished && !m.isCompleted;

                  return (
                    <div key={m.id} className={`ea-card p-6 rounded-3xl flex flex-col items-center justify-between border-white/5 group transition-all relative overflow-hidden ${isFinished ? 'opacity-80' : 'hover:border-[#00ff88]/40'}`}>
                      
                      {/* Match Row Flex Container */}
                      <div className="flex flex-col sm:flex-row items-center w-full justify-between gap-6 sm:gap-0 relative z-10">
                          <div className="flex-1 text-center sm:text-right min-w-0 sm:pr-12 md:pr-16 w-full">
                            <p className="font-black italic text-2xl truncate tracking-tighter uppercase pr-1">{uA?.username || 'Unknown'}</p>
                            {!isUsersOnly && teamAName && <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1 mr-1">{teamAName}</p>}
                          </div>
                          
                          <div className="flex flex-col items-center w-full sm:w-auto">
                            {isEditing ? (
                              <MatchInputGroup key={`edit-${m.id}`} match={m} onSave={handleSaveScore} />
                            ) : (
                              <div className="flex flex-col items-center relative">
                                <div className={`flex items-center gap-10 px-12 py-5 rounded-[2.5rem] border shadow-inner relative group/score ${isFinished ? 'bg-white/5 border-white/5' : 'bg-black/50 border-white/10'}`}>
                                  <span className={`text-6xl font-black italic tracking-tighter ${m.scoreA !== null && m.scoreA > (m.scoreB || 0) ? (isFinished ? 'text-white' : 'ea-accent') : 'text-gray-500'}`}>{m.scoreA ?? '-'}</span>
                                  <span className="text-gray-900 font-black text-3xl italic">:</span>
                                  <span className={`text-6xl font-black italic tracking-tighter ${m.scoreB !== null && m.scoreB > (m.scoreA || 0) ? (isFinished ? 'text-white' : 'ea-accent') : 'text-gray-500'}`}>{m.scoreB ?? '-'}</span>
                                  {m.isCompleted && <div className={`absolute -top-3 left-1/2 -translate-x-1/2 border px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${isFinished ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20'}`}>Final</div>}
                                </div>
                                
                                {isAdmin && m.isCompleted && !isFinished && (
                                  <button 
                                    onClick={(e) => handleUndoResult(e, m.id)} 
                                    className="text-[10px] font-black uppercase text-gray-700 hover:text-[#00ff88] transition-colors mt-4 italic tracking-widest cursor-pointer z-10 block w-full text-center relative hover:scale-105 active:scale-95"
                                  >
                                    Re-edit Result
                                  </button>
                                )}
                              </div>
                            )}
                          </div>

                          <div className="flex-1 text-center sm:text-left min-w-0 sm:pl-12 md:pl-16 w-full">
                            <p className="font-black italic text-2xl truncate tracking-tighter uppercase pr-1">{uB?.username || 'Unknown'}</p>
                            {!isUsersOnly && teamBName && <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1 ml-1">{teamBName}</p>}
                          </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'admin' && (
        <div className="max-w-3xl mx-auto py-12 space-y-12 animate-fade-in">
          {!isAdmin ? (
            <div className="text-center p-12 text-red-500 font-black uppercase italic">Access Denied</div>
          ) : (
            <>
              <div className="ea-card p-12 rounded-[3.5rem] bg-gradient-to-br from-[#00ff88]/5 to-transparent border-[#00ff88]/10 text-center shadow-2xl">
                <h3 className="text-4xl font-black italic uppercase mb-4 tracking-tighter">Competition Deployment</h3>
                <p className="text-gray-500 mb-12 font-medium">Create a balanced double round-robin league schedule for all assigned participants.</p>
                <div className="flex flex-col items-center gap-6">
                  <button 
                    onClick={generateFixtures} 
                    disabled={!canDeploy}
                    className="w-full py-10 ea-bg-accent text-black font-black rounded-[2.5rem] text-4xl italic tracking-tighter disabled:opacity-10 transition-all hover:scale-[1.01] active:scale-[0.99] shadow-[0_25px_50px_rgba(0,255,136,0.25)]"
                  >
                    {matches.length > 0 ? 'FIXTURES GENERATED' : 'LAUNCH SEASON'}
                  </button>
                  {matches.length === 0 && (
                    <div className="grid grid-cols-2 gap-8 w-full">
                      <div className={`p-4 rounded-2xl border ${ (localTournament.participantUserIds?.length || 0) >= 2 ? 'border-[#00ff88]/20 bg-[#00ff88]/5 text-[#00ff88]' : 'border-red-500/20 bg-red-500/5 text-red-500'}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1">Roster</p>
                        <p className="font-black italic">{(localTournament.participantUserIds?.length || 0)} Managers</p>
                      </div>
                      <div className={`p-4 rounded-2xl border ${ (isUsersOnly || (assignments.length >= (localTournament.participantUserIds?.length || 0) && (localTournament.participantUserIds?.length || 0) > 0)) ? 'border-[#00ff88]/20 bg-[#00ff88]/5 text-[#00ff88]' : 'border-red-500/20 bg-red-500/5 text-red-500'}`}>
                        <p className="text-[9px] font-black uppercase tracking-widest mb-1">Asset Status</p>
                        <p className="font-black italic">{isUsersOnly ? 'Manual' : (assignments.length >= (localTournament.participantUserIds?.length || 0) ? 'All Allocated' : 'Pending Allocation')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
              
              {matches.length > 0 && (
                <div className="ea-card p-10 rounded-[2.5rem] border-red-500/20 bg-red-500/5 text-center shadow-xl">
                  <h4 className="text-red-500 font-black italic uppercase mb-2">Emergency Reset</h4>
                  <p className="text-gray-500 text-[10px] font-black uppercase mb-8 tracking-widest">Wiping the schedule is irreversible and deletes all score data.</p>
                  <button 
                    onClick={async () => { 
                        if(confirm('IRREVERSIBLE: Wipe all results and reset to Upcoming state?')) { 
                            await databaseService.resetTournamentSchedule(localTournament.id); 
                            await databaseService.log(currentUser.id, 'HARD_RESET', `League reset to pre-deployment for ${localTournament.name}`); 
                            await refreshData(); 
                        } 
                    }} 
                    className="px-12 py-4 border border-red-500/30 text-red-500 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/10"
                  >
                    Clear Results & Reset
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {showTeamPicker && !isFinished && (
        <div className="fixed inset-0 bg-black/95 backdrop-blur-xl flex items-center justify-center p-4 z-[70]">
          <div className="ea-card w-full max-w-2xl p-10 rounded-[3rem] border border-white/10 flex flex-col max-h-[85vh] shadow-[0_50px_100px_rgba(0,0,0,0.8)]">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h3 className="text-3xl font-black italic tracking-tighter uppercase text-[#00ff88]">Manual Assignment</h3>
                <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest mt-1">Assigning to {allSystemUsers.find(u => u.id === showTeamPicker.userId)?.username}</p>
              </div>
              <button onClick={() => setShowTeamPicker(null)} className="text-gray-500 hover:text-white transition-all scale-150 p-2">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto pr-4 space-y-10 no-scrollbar">
              {[TeamType.CLUB, TeamType.NATIONAL].map(type => (
                <div key={type} className="space-y-4">
                  <h4 className="text-xs font-black uppercase tracking-[0.2em] text-gray-600 italic">{type} ASSETS</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {globalTeams.filter(t => t.type === type && t.isActive).map(team => {
                      const isAssigned = assignments.some(a => a.teamId === team.id && a.userId !== showTeamPicker.userId);
                      return (
                        <button key={team.id} disabled={isAssigned} onClick={() => handleManualAssign(showTeamPicker.userId, team.id)}
                          className={`p-5 rounded-2xl border flex items-center justify-between group transition-all ${isAssigned ? 'opacity-20 grayscale' : 'bg-white/5 border-white/5 hover:border-[#00ff88]/50 hover:bg-[#00ff88]/5'}`}
                        >
                          <span className="font-black italic tracking-tight text-lg">{team.name}</span>
                          {!isAssigned && <span className="text-[10px] font-black uppercase ea-accent opacity-0 group-hover:opacity-100 transition-opacity tracking-widest">Select</span>}
                          {isAssigned && <span className="text-[10px] font-black uppercase text-gray-700 italic tracking-widest">In Use</span>}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TournamentDetail;
