
import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../services/db';
import { Tournament, GlobalTeam, Assignment, User, Match, TournamentStatus, TournamentType, UserRole } from '../types';

interface Props {
  tournament: Tournament;
  currentUser: User;
  onBack: () => void;
}

// Added interface for Standings statistics
interface StandingStat {
  id: string;
  username: string;
  p: number;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  pts: number;
}

const TournamentDetail: React.FC<Props> = ({ tournament, currentUser, onBack }) => {
  const [globalTeams, setGlobalTeams] = useState<GlobalTeam[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [matches, setMatches] = useState<Match[]>([]);
  const [allSystemUsers, setAllSystemUsers] = useState<User[]>([]);
  
  const [showTeamPicker, setShowTeamPicker] = useState<{userId: string} | null>(null);
  const [matchInputs, setMatchInputs] = useState<Record<string, { a: string, b: string }>>({});
  const [activeTab, setActiveTab] = useState<'info' | 'standings' | 'matches' | 'admin'>('info');
  const [isFinishing, setIsFinishing] = useState(false);

  const isAdmin = currentUser.role === UserRole.ADMIN;
  const isUsersOnly = tournament.type === TournamentType.USERS_ONLY;

  const [localTournament, setLocalTournament] = useState<Tournament>(tournament);

  useEffect(() => {
    refreshData();
  }, [tournament.id]);

  const refreshData = () => {
    const updatedTournament = db.getTournamentById(tournament.id);
    if (!updatedTournament) {
        onBack();
        return;
    }
    
    setLocalTournament(updatedTournament);
    setGlobalTeams(db.getGlobalTeams() || []);
    setAssignments(db.getAssignments(tournament.id) || []);
    setAllSystemUsers(db.getUsers() || []);
    const freshMatches = db.getMatches(tournament.id) || [];
    setMatches(freshMatches);
    
    setMatchInputs(prev => {
        const next = { ...prev };
        freshMatches.forEach(m => {
            // Only initialize inputs if they are empty or for unplayed matches
            if (!next[m.id] || (m.isCompleted && next[m.id].a === '')) {
                next[m.id] = { 
                    a: m.scoreA === null ? '' : m.scoreA.toString(), 
                    b: m.scoreB === null ? '' : m.scoreB.toString() 
                };
            }
        });
        return next;
    });
  };

  const progressStats = useMemo(() => {
    const total = matches.length;
    const completed = matches.filter(m => m.isCompleted).length;
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    return { total, completed, percent };
  }, [matches]);

  const handleFinishTournament = async () => {
    if (!isAdmin || progressStats.percent < 100 || localTournament.status !== TournamentStatus.ACTIVE) return;
    
    if (!confirm('Are you sure you want to FINISH this tournament? This will lock all results and standings permanently.')) return;

    setIsFinishing(true);
    try {
        db.updateTournamentStatus(localTournament.id, TournamentStatus.FINISHED);
        db.log(currentUser.id, 'TOURNAMENT_FINISHED', `Tournament ${localTournament.name} officially concluded.`);
        const updated = db.getTournamentById(localTournament.id);
        if (updated) setLocalTournament(updated);
        refreshData();
        setActiveTab('standings');
    } catch (err) {
        console.error("Finishing error:", err);
        alert('Critical error finishing tournament.');
    } finally {
        setIsFinishing(false);
    }
  };

  const isFinished = localTournament.status === TournamentStatus.FINISHED;

  const handleInputChange = (matchId: string, side: 'a' | 'b', value: string) => {
    if (isFinished) return;
    const sanitizedValue = value.replace(/\D/g, '');
    setMatchInputs(prev => ({
      ...prev,
      [matchId]: { 
        ...(prev[matchId] || { a: '', b: '' }), 
        [side]: sanitizedValue 
      }
    }));
  };

  const submitScore = (matchId: string) => {
    if (isFinished) return;
    const scores = matchInputs[matchId];
    if (!scores) return;

    const valA = scores.a.trim();
    const valB = scores.b.trim();

    if (valA === '' || valB === '') {
      return alert('Scores for both sides are mandatory.');
    }

    const sA = parseInt(valA, 10);
    const sB = parseInt(valB, 10);
    
    if (isNaN(sA) || isNaN(sB)) return;

    try {
      db.updateMatch(matchId, sA, sB);
      db.log(currentUser.id, 'RESULT_POSTED', `Match result finalized for ${matchId}`);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleUndoResult = (matchId: string) => {
    if (isFinished) return;
    const matchToEdit = matches.find(m => m.id === matchId);
    if (!matchToEdit) return;

    if (!confirm('Reopen this match for editing?')) return;

    // CRITICAL FIX: Explicitly preserve current scores in input state before resetting DB
    setMatchInputs(prev => ({
      ...prev,
      [matchId]: {
        a: matchToEdit.scoreA === null ? '' : matchToEdit.scoreA.toString(),
        b: matchToEdit.scoreB === null ? '' : matchToEdit.scoreB.toString()
      }
    }));

    try {
      db.undoMatchResult(matchId);
      db.log(currentUser.id, 'RESULT_REVERTED', `Reopened match: ${matchId}`);
      refreshData();
    } catch (err: any) {
      alert(err.message);
    }
  };

  const standings = useMemo<StandingStat[]>(() => {
    const statsMap: Record<string, StandingStat> = {};
    const participants = localTournament.participantUserIds || [];
    
    participants.forEach(userId => {
      const user = allSystemUsers.find(u => u.id === userId);
      statsMap[userId] = { 
        id: userId, 
        username: user?.username || 'Legacy User',
        p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 
      };
    });

    matches.filter(m => m.isCompleted).forEach(m => {
      const sA = statsMap[m.playerAId];
      const sB = statsMap[m.playerBId];
      if (!sA || !sB) return;
      sA.p++; sB.p++;
      sA.gf += (m.scoreA || 0); sA.ga += (m.scoreB || 0);
      sB.gf += (m.scoreB || 0); sB.ga += (m.scoreA || 0);
      if (m.scoreA! > m.scoreB!) { sA.w++; sA.pts += 3; sB.l++; }
      else if (m.scoreA! < m.scoreB!) { sB.w++; sB.pts += 3; sA.l++; }
      else { sA.d++; sB.d++; sA.pts += 1; sB.pts += 1; }
    });

    return Object.values(statsMap).sort((a, b) => 
      b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
    );
  }, [matches, localTournament.participantUserIds, allSystemUsers]);

  const groupedMatches = useMemo(() => {
    const groups: Record<number, Match[]> = {};
    matches.filter(m => m.playerAId !== 'GHOST' && m.playerBId !== 'GHOST').forEach(m => {
      if (!groups[m.matchday]) groups[m.matchday] = [];
      groups[m.matchday].push(m);
    });
    return groups;
  }, [matches]);

  const generateFixtures = () => {
    if (isFinished) return;
    const players = [...(localTournament.participantUserIds || [])];
    if (players.length < 2) return alert('Need at least 2 managers.');
    
    if (!isUsersOnly && assignments.length < players.length) {
      return alert('Lottery Draw required before schedule generation.');
    }

    const isOdd = players.length % 2 !== 0;
    const fixturePlayers = isOdd ? [...players, 'GHOST'] : [...players];
    const numPlayers = fixturePlayers.length;
    const rounds = numPlayers - 1;
    const firstHalf: Match[] = [];

    const rotation = [...fixturePlayers];
    for (let round = 0; round < rounds; round++) {
      for (let i = 0; i < numPlayers / 2; i++) {
        const p1 = rotation[i];
        const p2 = rotation[numPlayers - 1 - i];
        
        if (p1 !== 'GHOST' && p2 !== 'GHOST') {
          const swap = (round + i) % 2 === 0;
          const playerA = swap ? p2 : p1;
          const playerB = swap ? p1 : p2;
          firstHalf.push({
            id: Math.random().toString(36).substr(2, 9),
            tournamentId: localTournament.id,
            matchday: round + 1,
            playerAId: playerA, 
            playerBId: playerB,
            teamAId: assignments.find(a => a.userId === playerA)?.teamId,
            teamBId: assignments.find(a => a.userId === playerB)?.teamId,
            scoreA: null, scoreB: null, isCompleted: false
          });
        }
      }
      rotation.splice(1, 0, rotation.pop()!);
    }

    const secondHalf = firstHalf.map(m => ({
      ...m, id: Math.random().toString(36).substr(2, 9), matchday: m.matchday + rounds,
      playerAId: m.playerBId, playerBId: m.playerAId, teamAId: m.teamBId, teamBId: m.teamAId
    }));

    db.addMatches([...firstHalf, ...secondHalf]);
    db.updateTournamentStatus(localTournament.id, TournamentStatus.ACTIVE);
    db.log(currentUser.id, 'FIXTURES_ACTIVE', `${localTournament.name} schedule live.`);
    refreshData();
  };

  const runLottery = () => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    const participantsCount = localTournament.participantUserIds?.length || 0;
    const pool = globalTeams
      .filter(t => (localTournament.selectedTeamIds || []).includes(t.id))
      .sort(() => Math.random() - 0.5);

    if (pool.length < participantsCount) {
      return alert(`Draw pool too small. Need at least ${participantsCount} teams.`);
    }
    
    db.resetTournamentSchedule(localTournament.id);
    const newAssignments: Assignment[] = (localTournament.participantUserIds || []).map((uid, idx) => ({
      id: Math.random().toString(36).substr(2, 9),
      tournamentId: localTournament.id,
      userId: uid,
      teamId: pool[idx].id
    }));
    db.addAssignments(newAssignments);
    db.log(currentUser.id, 'LOTTERY_COMMIT', `Fair-draw logic applied to ${localTournament.name}`);
    refreshData();
  };

  const handleManualAssign = (userId: string, teamId: string) => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    const existing = assignments.filter(a => a.userId !== userId);
    db.addAssignments([...existing, {
      id: Math.random().toString(36).substr(2, 9),
      tournamentId: localTournament.id,
      userId,
      teamId
    }]);
    setShowTeamPicker(null);
    refreshData();
  };

  const toggleParticipant = (userId: string) => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    let current = [...(localTournament.participantUserIds || [])];
    if (current.includes(userId)) {
      current = current.filter(id => id !== userId);
      const remainingAssignments = assignments.filter(a => a.userId !== userId);
      db.addAssignments(remainingAssignments);
    } else {
      current.push(userId);
    }
    db.updateTournamentParticipants(localTournament.id, current);
    refreshData();
  };

  const toggleTeamInPool = (teamId: string) => {
    if (localTournament.status !== TournamentStatus.UPCOMING) return;
    let current = [...(localTournament.selectedTeamIds || [])];
    if (current.includes(teamId)) {
      current = current.filter(id => id !== teamId);
    } else {
      current.push(teamId);
    }
    db.updateTournamentTeams(localTournament.id, current);
    refreshData();
  };

  const canDeploy = useMemo(() => {
    const count = (localTournament.participantUserIds || []).length;
    return count >= 2 && (isUsersOnly || assignments.length >= count) && matches.length === 0 && localTournament.status === TournamentStatus.UPCOMING;
  }, [localTournament, assignments, isUsersOnly, matches]);

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center bg-[#1a1a1e] p-6 rounded-2xl border border-white/5 gap-4 shadow-xl">
        <div>
          <button onClick={onBack} className="text-[10px] font-black uppercase text-gray-500 hover:text-white transition-colors mb-2 block tracking-widest">← Return to Lobby</button>
          <h2 className="text-4xl font-black italic tracking-tighter uppercase">{localTournament.name}</h2>
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
                      className="ea-bg-accent text-black font-black px-8 py-3 rounded-2xl text-[10px] uppercase italic hover:scale-105 active:scale-95 transition-all shadow-[0_10px_25px_rgba(0,255,136,0.4)]"
                  >
                      {isFinishing ? 'FINISHING...' : 'CONCLUDE TOURNAMENT'}
                  </button>
              )}
            </div>
        </div>
      )}

      {activeTab === 'info' && (
        <div className="grid lg:grid-cols-3 gap-8 animate-fade-in">
          <div className="lg:col-span-2 space-y-6">
            <div className="ea-card p-8 rounded-3xl border-white/5">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h4 className="text-xl font-black italic uppercase tracking-tighter">Managers</h4>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest italic">Official Roster</p>
                </div>
                {isAdmin && localTournament.status === TournamentStatus.UPCOMING && localTournament.type === TournamentType.LOTTERY && (localTournament.participantUserIds?.length || 0) >= 2 && (
                  <button 
                    onClick={runLottery} 
                    disabled={(localTournament.selectedTeamIds?.length || 0) < (localTournament.participantUserIds?.length || 0)}
                    className="ea-bg-accent text-black font-black px-6 py-2 rounded-xl text-[10px] uppercase italic hover:scale-105 transition-transform disabled:opacity-20 shadow-[0_10px_20px_rgba(0,255,136,0.2)]"
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
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-full bg-white/5 border border-white/10 flex items-center justify-center font-black italic text-2xl text-[#00ff88]">{u?.username[0].toUpperCase() || '?'}</div>
                        <div>
                          <span className="font-black italic text-xl tracking-tight block">{u?.username || 'Unknown'}</span>
                          {!isUsersOnly && (
                            <div className="mt-1 flex items-center gap-2">
                                {team ? (
                                    <span className="text-[10px] font-black uppercase ea-accent tracking-widest">{team.name}</span>
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
                        <span className="font-black italic text-gray-500 group-hover:text-white transition-colors">{u.username}</span>
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
                  <th className="py-6 px-4 text-center">GD</th>
                  <th className="py-6 px-6 text-center text-[#00ff88]">PTS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {standings.map((s, idx) => {
                  const isCurrentUser = s.id === currentUser.id;
                  return (
                    <tr key={s.id} className={`transition-colors ${isCurrentUser ? 'bg-[#00ff88]/5' : 'hover:bg-white/5'}`}>
                      <td className="py-6 px-6 font-black italic text-2xl tracking-tighter">{(idx + 1).toString().padStart(2, '0')}</td>
                      <td className="py-6 px-6">
                        <p className={`font-black italic text-xl tracking-tighter uppercase ${isCurrentUser ? 'text-[#00ff88]' : 'text-white'}`}>{s.username}</p>
                        {!isUsersOnly && (
                            <p className="text-[9px] font-black uppercase text-gray-600 mt-0.5">
                                {globalTeams.find(t => t.id === assignments.find(a => a.userId === s.id)?.teamId)?.name || 'UNASSIGNED'}
                            </p>
                        )}
                      </td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.p}</td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.w}</td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.d}</td>
                      <td className="py-6 px-4 text-center font-bold text-gray-500">{s.l}</td>
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
          {Object.entries(groupedMatches).sort(([a],[b]) => parseInt(a) - parseInt(b)).map(([day, dayMatches]) => (
            <div key={day} className="space-y-6">
              <div className="flex items-center gap-6">
                <span className={`text-[12px] font-black uppercase px-5 py-1.5 rounded-sm italic tracking-tighter shadow-xl ${isFinished ? 'bg-gray-800 text-gray-400' : 'bg-[#00ff88] text-black shadow-[#00ff88]/10'}`}>Matchday {day}</span>
                <div className="h-px bg-white/5 flex-1"></div>
              </div>
              <div className="grid gap-4">
                {dayMatches.map(m => {
                  const uA = allSystemUsers.find(u => u.id === m.playerAId);
                  const uB = allSystemUsers.find(u => u.id === m.playerBId);
                  const inputs = matchInputs[m.id] || { a: '', b: '' };
                  const teamAName = globalTeams.find(t => t.id === m.teamAId)?.name;
                  const teamBName = globalTeams.find(t => t.id === m.teamBId)?.name;

                  return (
                    <div key={m.id} className={`ea-card p-6 rounded-3xl flex flex-col sm:flex-row items-center justify-between border-white/5 group transition-all gap-6 sm:gap-0 ${isFinished ? 'opacity-80' : 'hover:border-[#00ff88]/40'}`}>
                      <div className="flex-1 text-center sm:text-right min-w-0 sm:pr-8">
                        <p className="font-black italic text-2xl truncate tracking-tighter uppercase">{uA?.username || 'Unknown'}</p>
                        {!isUsersOnly && teamAName && <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">{teamAName}</p>}
                      </div>
                      
                      <div className="flex flex-col items-center">
                        {isAdmin && !m.isCompleted && !isFinished ? (
                          <div className="flex items-center gap-4 bg-black/80 p-3 rounded-3xl border border-white/10 shadow-2xl">
                            <input type="text" inputMode="numeric" value={inputs.a} onChange={e => handleInputChange(m.id, 'a', e.target.value)} className="w-16 bg-transparent text-center font-black text-3xl outline-none border-b-2 border-white/10 focus:border-[#00ff88] placeholder-gray-900" placeholder="0" />
                            <span className="text-gray-800 font-black italic text-xl">VS</span>
                            <input type="text" inputMode="numeric" value={inputs.b} onChange={e => handleInputChange(m.id, 'b', e.target.value)} className="w-16 bg-transparent text-center font-black text-3xl outline-none border-b-2 border-white/10 focus:border-[#00ff88] placeholder-gray-900" placeholder="0" />
                            <button onClick={() => submitScore(m.id)} className="ea-bg-accent text-black font-black px-6 py-2.5 rounded-2xl text-[10px] uppercase italic hover:scale-105 active:scale-95 transition-all shadow-[0_10px_20px_rgba(0,255,136,0.3)]">SET</button>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center">
                            <div className={`flex items-center gap-10 px-12 py-5 rounded-[2.5rem] border shadow-inner relative group/score ${isFinished ? 'bg-white/5 border-white/5' : 'bg-black/50 border-white/10'}`}>
                              <span className={`text-6xl font-black italic tracking-tighter ${m.scoreA! > m.scoreB! ? (isFinished ? 'text-white' : 'ea-accent') : 'text-gray-500'}`}>{m.scoreA ?? '-'}</span>
                              <span className="text-gray-900 font-black text-3xl italic">:</span>
                              <span className={`text-6xl font-black italic tracking-tighter ${m.scoreB! > m.scoreA! ? (isFinished ? 'text-white' : 'ea-accent') : 'text-gray-500'}`}>{m.scoreB ?? '-'}</span>
                              {m.isCompleted && <div className={`absolute -top-3 left-1/2 -translate-x-1/2 border px-3 py-0.5 rounded-full text-[8px] font-black uppercase tracking-widest ${isFinished ? 'bg-gray-800 text-gray-400 border-gray-700' : 'bg-[#00ff88]/10 text-[#00ff88] border-[#00ff88]/20'}`}>Final</div>}
                            </div>
                            {isAdmin && m.isCompleted && !isFinished && (
                              <button onClick={() => handleUndoResult(m.id)} className="text-[10px] font-black uppercase text-gray-700 hover:text-[#00ff88] transition-colors mt-4 italic tracking-widest">
                                Re-edit Result
                              </button>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 text-center sm:text-left min-w-0 sm:pl-8">
                        <p className="font-black italic text-2xl truncate tracking-tighter uppercase">{uB?.username || 'Unknown'}</p>
                        {!isUsersOnly && teamBName && <p className="text-[10px] text-gray-500 uppercase font-black tracking-widest mt-1">{teamBName}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'admin' && isAdmin && !isFinished && (
        <div className="max-w-3xl mx-auto py-12 space-y-12 animate-fade-in">
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
                onClick={() => { if(confirm('IRREVERSIBLE: Wipe all results and reset to Upcoming state?')) { db.resetTournamentSchedule(localTournament.id); db.log(currentUser.id, 'HARD_RESET', `League reset to pre-deployment for ${localTournament.name}`); refreshData(); } }} 
                className="px-12 py-4 border border-red-500/30 text-red-500 text-[11px] font-black uppercase tracking-widest rounded-2xl hover:bg-red-500 hover:text-white transition-all shadow-xl shadow-red-500/10"
              >
                Clear Results & Reset
              </button>
            </div>
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
              {['CLUB', 'NATIONAL'].map(type => (
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
