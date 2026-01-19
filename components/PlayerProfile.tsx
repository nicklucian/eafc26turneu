
import React, { useState, useEffect, useMemo } from 'react';
import { User, Match, Assignment, GlobalTeam, Tournament } from '../types';
import { databaseService } from '../services/db';
import { authService } from '../services/auth'; // Import for current user check context if needed

const Avatar: React.FC<{ username: string; size?: 'sm' | 'lg' }> = ({ username, size = 'lg' }) => {
    // Deterministic random generation based on username hash
    const identity = useMemo(() => {
        const hash = username.split('').reduce((acc, c) => c.charCodeAt(0) + ((acc << 5) - acc), 0);
        const h = Math.abs(hash);
        
        const hue = h % 360;
        const panelColor1 = `hsl(${hue}, 70%, 50%)`;
        const panelColor2 = `hsl(${(hue + 45) % 360}, 80%, 30%)`;
        const rotation = h % 360;
        
        return { panelColor1, panelColor2, rotation };
    }, [username]);

    const sizeClasses = size === 'lg' ? 'w-32 h-32' : 'w-12 h-12';
    
    return (
        <div className={`${sizeClasses} rounded-full shadow-2xl relative overflow-hidden ring-4 ring-black/20 bg-black`}>
            <svg viewBox="0 0 100 100" className="w-full h-full transform transition-transform duration-700 hover:rotate-[360deg]" style={{ transform: `rotate(${identity.rotation}deg)` }}>
                <defs>
                    <radialGradient id={`grad-${username}`} cx="30%" cy="30%" r="70%">
                        <stop offset="0%" stopColor="#ffffff" stopOpacity="0.4"/>
                        <stop offset="100%" stopColor="#000000" stopOpacity="0.5"/>
                    </radialGradient>
                </defs>
                <circle cx="50" cy="50" r="50" fill="#f0f0f0" />
                <g fill={identity.panelColor2} stroke={identity.panelColor1} strokeWidth="2">
                    <path d="M50 25 L74 42 L65 70 L35 70 L26 42 Z" />
                    <path d="M50 25 L50 0 L26 8 L26 42 Z" opacity="0.8" />
                    <path d="M50 25 L50 0 L74 8 L74 42 Z" opacity="0.8" />
                    <path d="M74 42 L100 35 L100 65 L65 70 Z" opacity="0.8" />
                    <path d="M65 70 L50 100 L35 70 Z" opacity="0.8" />
                    <path d="M35 70 L0 65 L0 35 L26 42 Z" opacity="0.8" />
                </g>
                <circle cx="50" cy="50" r="50" fill={`url(#grad-${username})`} />
                <text x="50" y="55" textAnchor="middle" fill="white" fontSize="24" fontFamily="Arial, sans-serif" fontWeight="900" style={{ textShadow: '0px 2px 4px rgba(0,0,0,0.8)' }} transform={`rotate(${-identity.rotation} 50 50)`}>
                    {username.substring(0, 2).toUpperCase()}
                </text>
            </svg>
        </div>
    );
};

export const PlayerProfile: React.FC<{ user: User }> = ({ user }) => {
    const [matches, setMatches] = useState<Match[]>([]);
    const [tournaments, setTournaments] = useState<Tournament[]>([]);
    const [teams, setTeams] = useState<GlobalTeam[]>([]);
    const [users, setUsers] = useState<User[]>([]);
    const [assignments, setAssignments] = useState<Assignment[]>([]);
    const [loading, setLoading] = useState(true);

    // Edit State
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(user.username);
    const [isSaving, setIsSaving] = useState(false);
    const [editError, setEditError] = useState('');

    useEffect(() => {
        const load = async () => {
            try {
                // Fetch all necessary data to build profile history
                const [m, t, tm, u] = await Promise.all([
                    databaseService.getAllMatches(),
                    databaseService.getTournaments(),
                    databaseService.getGlobalTeams(),
                    databaseService.getUsers(),
                ]);
                
                let allAssigns: Assignment[] = [];
                for(const tourn of t) {
                    const asg = await databaseService.getAssignments(tourn.id);
                    allAssigns = [...allAssigns, ...asg];
                }

                setMatches(m);
                setTournaments(t);
                setTeams(tm);
                setUsers(u);
                setAssignments(allAssigns);
            } catch(e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSaveProfile = async () => {
        if (!editName.trim()) {
            setEditError('Username cannot be empty');
            return;
        }
        if (editName.length < 3) {
            setEditError('Username must be at least 3 characters');
            return;
        }

        setIsSaving(true);
        setEditError('');

        try {
            // Check for duplicates
            const latestUsers = await databaseService.getUsers();
            const exists = latestUsers.some(u => u.username.toLowerCase() === editName.trim().toLowerCase() && u.id !== user.id);
            
            if (exists) {
                setEditError('Username already taken');
                setIsSaving(false);
                return;
            }

            await databaseService.updateUser(user.id, { username: editName.trim() });
            // Update local users array to reflect change immediately without full reload if possible,
            // but app architecture might require a reload or state lift. 
            // For now, we rely on the parent or a refresh, but let's update local user object visualization
            user.username = editName.trim(); 
            setIsEditing(false);
            alert('Profile updated successfully!');
        } catch (e: any) {
            setEditError(e.message || 'Failed to update profile');
        } finally {
            setIsSaving(false);
        }
    };

    // 2. Statistics Calculation
    const userStats = useMemo(() => {
        const completed = matches.filter(m => m.isCompleted && (m.playerAId === user.id || m.playerBId === user.id));
        
        let wins = 0, draws = 0, losses = 0, gf = 0, ga = 0;
        let biggestWin = { diff: -1, match: null as Match | null, opponent: '', score: '' };
        let biggestLoss = { diff: -1, match: null as Match | null, opponent: '', score: '' };

        completed.forEach(m => {
            const isA = m.playerAId === user.id;
            const myScore = isA ? m.scoreA! : m.scoreB!;
            const oppScore = isA ? m.scoreB! : m.scoreA!;
            const oppId = isA ? m.playerBId : m.playerAId;
            const oppName = users.find(u => u.id === oppId)?.username || 'Unknown';

            gf += myScore;
            ga += oppScore;

            if (myScore > oppScore) {
                wins++;
                const diff = myScore - oppScore;
                if (diff > biggestWin.diff) {
                    biggestWin = { diff, match: m, opponent: oppName, score: `${myScore} - ${oppScore}` };
                }
            } else if (myScore < oppScore) {
                losses++;
                const diff = oppScore - myScore;
                if (diff > biggestLoss.diff) {
                    biggestLoss = { diff, match: m, opponent: oppName, score: `${myScore} - ${oppScore}` };
                }
            } else {
                draws++;
            }
        });

        return {
            played: completed.length,
            wins, draws, losses,
            gf, ga, gd: gf - ga,
            biggestWin, biggestLoss
        };
    }, [matches, user.id, users]);

    // 3. Match History Compilation
    const history = useMemo(() => {
        const allUserMatches = matches.filter(m => m.playerAId === user.id || m.playerBId === user.id);
        
        return [...allUserMatches].reverse().map(m => {
            const isA = m.playerAId === user.id;
            const tourn = tournaments.find(t => t.id === m.tournamentId);
            const oppId = isA ? m.playerBId : m.playerAId;
            const oppUser = users.find(u => u.id === oppId);
            
            const myAssign = assignments.find(a => a.tournamentId === m.tournamentId && a.userId === user.id);
            const oppAssign = assignments.find(a => a.tournamentId === m.tournamentId && a.userId === oppId);
            
            const myTeam = teams.find(t => t.id === myAssign?.teamId);
            const oppTeam = teams.find(t => t.id === oppAssign?.teamId);

            return {
                id: m.id,
                tournament: tourn?.name || 'Unknown Cup',
                matchday: m.matchday,
                opponent: oppUser?.username || 'Ghost',
                myTeam: myTeam?.name,
                oppTeam: oppTeam?.name,
                score: m.isCompleted ? (isA ? `${m.scoreA} - ${m.scoreB}` : `${m.scoreB} - ${m.scoreA}`) : 'vs',
                result: !m.isCompleted ? 'UPCOMING' : (
                    (isA && m.scoreA! > m.scoreB!) || (!isA && m.scoreB! > m.scoreA!) ? 'WIN' :
                    (isA && m.scoreA! < m.scoreB!) || (!isA && m.scoreB! < m.scoreA!) ? 'LOSS' : 'DRAW'
                )
            };
        });
    }, [matches, tournaments, teams, users, user.id, assignments]);

    const winRate = userStats.played > 0 ? Math.round((userStats.wins / userStats.played) * 100) : 0;

    const statsConfig = [
        { label: 'Matches', val: userStats.played, color: 'text-white' },
        { label: 'Wins', val: userStats.wins, color: 'text-[#00ff88]' },
        { label: 'Draws', val: userStats.draws, color: 'text-yellow-400' },
        { label: 'Losses', val: userStats.losses, color: 'text-red-400' },
        { label: 'Goals For', val: userStats.gf, color: 'text-blue-400' },
        { label: 'Goals Ag.', val: userStats.ga, color: 'text-orange-400' },
        { label: 'Goal Diff', val: userStats.gd > 0 ? `+${userStats.gd}` : userStats.gd, color: userStats.gd >= 0 ? 'text-[#00ff88]' : 'text-red-500' },
        { label: 'Win Rate', val: `${winRate}%`, color: winRate >= 50 ? 'text-[#00ff88]' : 'text-gray-400' }
    ];

    if (loading) {
        return <div className="p-10 text-center"><div className="loader mx-auto"></div></div>;
    }

    return (
        <div className="space-y-8 animate-fade-in pb-12">
            {/* --- HERO SECTION: AVATAR & OVERVIEW --- */}
            <div className="ea-card p-8 md:p-10 rounded-[2.5rem] border-white/5 relative overflow-hidden shadow-2xl group">
                {/* Decorative Background Elements */}
                <div className="absolute top-0 right-0 p-48 bg-gradient-to-br from-[#00ff88]/10 to-transparent blur-[120px] rounded-full pointer-events-none transform translate-x-1/3 -translate-y-1/3"></div>
                
                <div className="flex flex-col md:flex-row items-center gap-10 relative z-10">
                    <div className="transform transition-transform duration-500 group-hover:scale-105 group-hover:rotate-3 flex-shrink-0">
                        <Avatar username={isEditing ? editName : user.username} />
                    </div>
                    
                    <div className="text-center md:text-left flex-1 min-w-0 w-full">
                        {isEditing ? (
                            <div className="flex flex-col gap-2 max-w-xs mx-auto md:mx-0">
                                <label className="text-[10px] uppercase font-black text-gray-500">Edit Username</label>
                                <input 
                                    type="text" 
                                    value={editName}
                                    onChange={(e) => setEditName(e.target.value)}
                                    className="bg-black/50 border border-white/20 rounded-xl px-4 py-2 font-black italic text-2xl text-white outline-none focus:border-[#00ff88]"
                                />
                                {editError && <span className="text-red-500 text-[10px] font-bold uppercase">{editError}</span>}
                                <div className="flex gap-2 mt-2">
                                    <button 
                                        onClick={handleSaveProfile}
                                        disabled={isSaving}
                                        className="bg-[#00ff88] text-black px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:brightness-110 disabled:opacity-50"
                                    >
                                        {isSaving ? 'Saving...' : 'Save'}
                                    </button>
                                    <button 
                                        onClick={() => { setIsEditing(false); setEditName(user.username); setEditError(''); }}
                                        className="bg-white/10 text-white px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest hover:bg-white/20"
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                <div className="mb-2">
                                    <h2 className="text-5xl md:text-6xl font-black italic tracking-tighter uppercase truncate text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 leading-tight">
                                        {user.username}
                                    </h2>
                                </div>
                                <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mt-3">
                                    <span className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest border ${user.role === 'Admin' ? 'bg-purple-500/10 border-purple-500/30 text-purple-400' : 'bg-blue-500/10 border-blue-500/30 text-blue-400'}`}>
                                        {user.role}
                                    </span>
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest border border-white/5 px-3 py-1.5 rounded-lg">
                                        Member Since {new Date(user.createdAt).toLocaleDateString()}
                                    </span>
                                    <button 
                                        onClick={() => setIsEditing(true)} 
                                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-white/5 bg-white/5 hover:bg-[#00ff88]/10 hover:border-[#00ff88]/30 hover:text-[#00ff88] text-gray-400 transition-all group/edit"
                                    >
                                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                                        <span className="text-[9px] font-black uppercase tracking-widest">Edit</span>
                                    </button>
                                </div>
                            </>
                        )}
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4 w-full md:w-auto mt-6 md:mt-0">
                        {statsConfig.map((stat, i) => (
                            <div key={i} className="p-4 bg-black/40 rounded-2xl border border-white/10 flex flex-col items-center justify-center min-w-[80px]">
                                <span className={`text-2xl font-black italic tracking-tighter ${stat.color}`}>{stat.val}</span>
                                <span className="text-[9px] font-bold text-gray-600 uppercase tracking-widest mt-1">{stat.label}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* --- ANIMATED HIGHLIGHTS --- */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="ea-card p-8 rounded-3xl border-l-4 border-[#00ff88] bg-gradient-to-r from-[#00ff88]/5 to-transparent relative overflow-hidden group">
                    <div className="absolute top-0 right-0 p-2 opacity-5">
                        <svg className="w-24 h-24" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/></svg>
                    </div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-[#00ff88] mb-4 flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#00ff88] animate-pulse"></span>
                        Biggest Victory
                    </h3>
                    {userStats.biggestWin.match ? (
                        <div className="animate-[slideIn_0.5s_ease-out]">
                            <div className="text-5xl font-black italic mb-2 tracking-tighter text-white">{userStats.biggestWin.score}</div>
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide">
                                vs <span className="text-white">{userStats.biggestWin.opponent}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-gray-600 italic font-bold text-sm">No wins recorded yet.</div>
                    )}
                </div>

                <div className="ea-card p-8 rounded-3xl border-l-4 border-red-500 bg-gradient-to-r from-red-500/5 to-transparent relative overflow-hidden">
                    <h3 className="text-xs font-black uppercase tracking-widest text-red-500 mb-4">Heaviest Defeat</h3>
                    {userStats.biggestLoss.match ? (
                        <div className="animate-[slideIn_0.5s_ease-out]">
                            <div className="text-5xl font-black italic mb-2 tracking-tighter text-white">{userStats.biggestLoss.score}</div>
                            <div className="text-sm font-bold text-gray-400 uppercase tracking-wide">
                                vs <span className="text-white">{userStats.biggestLoss.opponent}</span>
                            </div>
                        </div>
                    ) : (
                        <div className="text-gray-600 italic font-bold text-sm">Unbeaten / No losses recorded.</div>
                    )}
                </div>
            </div>

            {/* --- MATCH HISTORY TABLE --- */}
            <div className="ea-card rounded-3xl overflow-hidden border border-white/10 shadow-2xl">
                <div className="p-6 border-b border-white/5 bg-white/5 flex justify-between items-center">
                    <h3 className="text-lg font-black italic tracking-tighter uppercase">Match History</h3>
                    <span className="text-[10px] font-bold uppercase text-gray-500 tracking-widest">{history.length} Matches</span>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-black/20 text-gray-500 text-[9px] uppercase font-black tracking-widest">
                            <tr>
                                <th className="p-5">Status</th>
                                <th className="p-5">Score</th>
                                <th className="p-5">Opponent</th>
                                <th className="p-5 hidden md:table-cell">Competition</th>
                                <th className="p-5 hidden sm:table-cell">Club Used</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {history.length > 0 ? history.map(h => (
                                <tr key={h.id} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-5">
                                        <span className={`px-3 py-1.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${
                                            h.result === 'WIN' ? 'bg-green-500/10 border-green-500/20 text-green-400' :
                                            h.result === 'LOSS' ? 'bg-red-500/10 border-red-500/20 text-red-400' :
                                            h.result === 'DRAW' ? 'bg-gray-500/10 border-gray-500/20 text-gray-300' :
                                            'bg-blue-500/10 border-blue-500/20 text-blue-400'
                                        }`}>
                                            {h.result}
                                        </span>
                                    </td>
                                    <td className="p-5 font-black italic text-xl tracking-tight text-white group-hover:text-[#00ff88] transition-colors">{h.score}</td>
                                    <td className="p-5 font-bold text-gray-300">
                                        <div className="flex flex-col">
                                            <span className="text-white">{h.opponent}</span>
                                            {h.oppTeam && <span className="text-[9px] text-gray-600 uppercase tracking-wider font-black md:hidden">{h.oppTeam}</span>}
                                        </div>
                                    </td>
                                    <td className="p-5 text-gray-400 hidden md:table-cell font-bold text-xs uppercase tracking-wide">
                                        {h.tournament}
                                        <span className="block text-[9px] text-gray-600 mt-0.5">Matchday {h.matchday}</span>
                                    </td>
                                    <td className="p-5 text-gray-500 hidden sm:table-cell font-black italic uppercase text-xs">{h.myTeam || '-'}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={5} className="p-12 text-center text-gray-600 font-bold italic uppercase tracking-widest">
                                        No matches played yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default PlayerProfile;
