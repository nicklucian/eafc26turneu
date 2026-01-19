
import { Match, Assignment, StandingStat, User, GlobalTeam } from '../types';

export const generateFixturesAlgorithm = (
  tournamentId: string,
  participants: string[],
  assignments: Assignment[],
  isUsersOnly: boolean
): Match[] => {
  // Deep copy to avoid mutating source
  const players = [...participants];
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
        
        const teamA = isUsersOnly ? undefined : assignments.find(a => a.userId === playerA)?.teamId;
        const teamB = isUsersOnly ? undefined : assignments.find(a => a.userId === playerB)?.teamId;

        firstHalf.push({
          id: Math.random().toString(36).substr(2, 9),
          tournamentId: tournamentId,
          matchday: round + 1,
          playerAId: playerA, 
          playerBId: playerB,
          // Conditionally add teams only if defined to avoid 'undefined' values
          ...(teamA ? { teamAId: teamA } : {}),
          ...(teamB ? { teamBId: teamB } : {}),
          scoreA: null, 
          scoreB: null, 
          isCompleted: false
        });
      }
    }
    // Round robin rotation
    rotation.splice(1, 0, rotation.pop()!);
  }

  const secondHalf = firstHalf.map(m => ({
    id: Math.random().toString(36).substr(2, 9), 
    tournamentId: m.tournamentId,
    matchday: m.matchday + rounds,
    playerAId: m.playerBId, 
    playerBId: m.playerAId, 
    // Swap teams and ensure no undefined values
    ...(m.teamBId ? { teamAId: m.teamBId } : {}),
    ...(m.teamAId ? { teamBId: m.teamAId } : {}),
    scoreA: null,
    scoreB: null,
    isCompleted: false
  }));

  return [...firstHalf, ...secondHalf];
};

export const calculateStandingsLogic = (
  participants: string[],
  matches: Match[],
  allUsers: User[],
  allAssignments: Assignment[],
  globalTeams: GlobalTeam[],
  isUsersOnly: boolean
): StandingStat[] => {
  const statsMap: Record<string, StandingStat> = {};
  
  participants.forEach(userId => {
    const user = allUsers.find(u => u.id === userId);
    const username = user ? user.username : 'Unknown User';
    statsMap[userId] = { 
      id: userId, username, p: 0, w: 0, d: 0, l: 0, gf: 0, ga: 0, pts: 0 
    };
  });

  matches.filter(m => m.isCompleted).forEach(m => {
    const sA = statsMap[m.playerAId];
    const sB = statsMap[m.playerBId];
    if (!sA || !sB) return;
    
    // Safety check for null scores (though isCompleted implies valid scores usually)
    const scoreA = m.scoreA ?? 0;
    const scoreB = m.scoreB ?? 0;

    sA.p++; sB.p++;
    sA.gf += scoreA; sA.ga += scoreB;
    sB.gf += scoreB; sB.ga += scoreA;
    
    if (scoreA > scoreB) { sA.w++; sA.pts += 3; sB.l++; }
    else if (scoreA < scoreB) { sB.w++; sB.pts += 3; sA.l++; }
    else { sA.d++; sB.d++; sA.pts += 1; sB.pts += 1; }
  });

  return Object.values(statsMap).sort((a, b) => 
    b.pts - a.pts || (b.gf - b.ga) - (a.gf - a.ga) || b.gf - a.gf
  );
};
