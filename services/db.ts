
import { 
  User, UserRole, Tournament, TournamentStatus, TournamentType,
  InvitationCode, GlobalTeam, TeamType, Assignment, Match, AuditLog, ChatMessage 
} from '../types';

export class DatabaseService {
  private storageKey: string;

  private data: {
    users: User[];
    invitationCodes: InvitationCode[];
    globalTeams: GlobalTeam[];
    tournaments: Tournament[];
    assignments: Assignment[];
    matches: Match[];
    auditLogs: AuditLog[];
    chatMessages: ChatMessage[];
  };

  constructor(storageKey: string = 'fc26_db_v5_final') {
    this.storageKey = storageKey;
    const saved = localStorage.getItem(this.storageKey);
    if (saved) {
      this.data = JSON.parse(saved);
    } else {
      this.data = this.getInitialState();
      this.seedDefaultTeams();
      this.save();
    }
  }

  private getInitialState() {
    return {
      users: [
        { id: 'admin-1', username: 'admin', role: UserRole.ADMIN, createdAt: new Date().toISOString() },
        { id: 'u1', username: 'Striker99', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
        { id: 'u2', username: 'GoalMachine', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      ],
      invitationCodes: [{ id: 'init-1', code: 'welcomechamp', isActive: true, createdBy: 'system', createdAt: new Date().toISOString() }],
      globalTeams: [],
      tournaments: [],
      assignments: [],
      matches: [],
      auditLogs: [],
      chatMessages: []
    };
  }

  private seedDefaultTeams() {
    const clubs = ['Real Madrid', 'Manchester City', 'FC Barcelona', 'Bayern Munich', 'Paris Saint-Germain', 'Liverpool', 'Arsenal', 'Inter Milan', 'AC Milan', 'Atletico Madrid'];
    const nationals = ['France', 'Brazil', 'England', 'Argentina', 'Spain', 'Portugal', 'Germany', 'Netherlands', 'Italy', 'Belgium'];
    const now = new Date().toISOString();
    clubs.forEach(name => {
      this.data.globalTeams.push({ id: `team-club-${name.toLowerCase().replace(/\s+/g, '-')}`, name, type: TeamType.CLUB, isActive: true, createdAt: now, updatedAt: now });
    });
    nationals.forEach(name => {
      this.data.globalTeams.push({ id: `team-nat-${name.toLowerCase().replace(/\s+/g, '-')}`, name, type: TeamType.NATIONAL, isActive: true, createdAt: now, updatedAt: now });
    });
  }

  private save() {
    localStorage.setItem(this.storageKey, JSON.stringify(this.data));
  }

  private clone<T>(obj: T): T {
    if (obj === undefined || obj === null) return obj;
    return JSON.parse(JSON.stringify(obj));
  }

  // --- PUBLIC API ---

  getUsers() { return this.clone(this.data.users); }
  getCodes() { return this.clone(this.data.invitationCodes); }
  getGlobalTeams() { return this.clone(this.data.globalTeams); }
  getTournaments() { return this.clone(this.data.tournaments); }
  getTournamentById(id: string) { return this.clone(this.data.tournaments.find(t => t.id === id)); }
  getMatches(tId: string) { return this.clone(this.data.matches.filter(m => m.tournamentId === tId)); }
  getAllMatches() { return this.clone(this.data.matches); }
  getAssignments(tId: string) { return this.clone(this.data.assignments.filter(a => a.tournamentId === tId)); }
  getChat(tId?: string) { return tId ? this.clone(this.data.chatMessages.filter(m => m.tournamentId === tId)) : this.clone(this.data.chatMessages.filter(m => !m.tournamentId)); }
  getAuditLogs() { return this.clone(this.data.auditLogs); }

  updateMatch(id: string, scoreA: number, scoreB: number) {
    if (typeof scoreA !== 'number' || typeof scoreB !== 'number') {
      throw new Error("Scores must be valid numbers.");
    }
    if (isNaN(scoreA) || isNaN(scoreB)) {
      throw new Error("Invalid score value (NaN).");
    }
    if (scoreA < 0 || scoreB < 0 || !Number.isInteger(scoreA) || !Number.isInteger(scoreB)) {
      throw new Error("Scores must be non-negative integers.");
    }

    const matchIndex = this.data.matches.findIndex(m => m.id === id);
    if (matchIndex === -1) throw new Error("Match not found.");
    
    const updatedMatches = [...this.data.matches];
    updatedMatches[matchIndex] = { ...updatedMatches[matchIndex], scoreA, scoreB, isCompleted: true };
    this.data.matches = updatedMatches;
    this.save();
  }

  undoMatchResult(id: string) {
    const matchIndex = this.data.matches.findIndex(m => m.id === id);
    if (matchIndex === -1) throw new Error("Match not found.");
    
    const updatedMatches = [...this.data.matches];
    updatedMatches[matchIndex] = { ...updatedMatches[matchIndex], isCompleted: false };
    this.data.matches = updatedMatches;
    this.save();
  }

  deleteTournament(id: string) {
    this.data.tournaments = this.data.tournaments.filter(t => t.id !== id);
    this.data.matches = this.data.matches.filter(m => m.tournamentId !== id);
    this.data.assignments = this.data.assignments.filter(a => a.tournamentId !== id);
    this.data.chatMessages = this.data.chatMessages.filter(c => c.tournamentId !== id);
    this.save();
  }

  addTournament(t: Tournament) { this.data.tournaments.push(t); this.save(); }
  updateTournamentTeams(id: string, teamIds: string[]) {
    this.data.tournaments = this.data.tournaments.map(t => t.id === id ? { ...t, selectedTeamIds: teamIds } : t);
    this.save();
  }
  updateTournamentParticipants(id: string, userIds: string[]) {
    this.data.tournaments = this.data.tournaments.map(t => t.id === id ? { ...t, participantUserIds: userIds } : t);
    this.save();
  }
  updateTournamentStatus(id: string, status: TournamentStatus) {
    this.data.tournaments = this.data.tournaments.map(t => t.id === id ? { ...t, status } : t);
    this.save();
  }
  
  resetTournamentSchedule(id: string) {
    this.data.tournaments = this.data.tournaments.map(t => t.id === id ? { ...t, status: TournamentStatus.UPCOMING } : t);
    this.data.matches = this.data.matches.filter(m => m.tournamentId !== id);
    this.data.assignments = this.data.assignments.filter(a => a.tournamentId !== id);
    this.save();
  }

  deployFixtures(tournamentId: string, matches: Match[]) {
    this.data.matches.push(...matches);
    this.data.tournaments = this.data.tournaments.map(t => 
      t.id === tournamentId ? { ...t, status: TournamentStatus.ACTIVE } : t
    );
    this.save();
  }

  addMatches(batch: Match[]) { this.data.matches.push(...batch); this.save(); }
  addAssignments(batch: Assignment[]) { this.data.assignments.push(...batch); this.save(); }
  addUser(user: User) { this.data.users.push(user); this.save(); }

  deleteUser(id: string) {
    this.data.assignments = this.data.assignments.filter(a => a.userId !== id);
    this.data.matches = this.data.matches.filter(m => m.playerAId !== id && m.playerBId !== id);
    this.data.chatMessages = this.data.chatMessages.filter(c => c.userId !== id);
    this.data.tournaments = this.data.tournaments.map(t => ({
      ...t,
      participantUserIds: t.participantUserIds.filter(uid => uid !== id)
    }));
    this.data.users = this.data.users.filter(u => u.id !== id);
    this.save(); 
  }

  addCode(code: InvitationCode) { this.data.invitationCodes.push(code); this.save(); }
  toggleCode(id: string) {
    const code = this.data.invitationCodes.find(c => c.id === id);
    if (code) code.isActive = !code.isActive;
    this.save();
  }
  deleteCode(id: string) { this.data.invitationCodes = this.data.invitationCodes.filter(c => c.id !== id); this.save(); }
  
  addGlobalTeam(team: Omit<GlobalTeam, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>) {
    const newTeam: GlobalTeam = { 
      ...team, id: Math.random().toString(36).substr(2, 9), isActive: true, 
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() 
    };
    this.data.globalTeams.push(newTeam);
    this.save();
    return this.clone(newTeam);
  }
  updateGlobalTeam(id: string, updates: Partial<GlobalTeam>) {
    this.data.globalTeams = this.data.globalTeams.map(t => t.id === id ? { ...t, ...updates, updatedAt: new Date().toISOString() } : t);
    this.save();
  }
  deleteGlobalTeam(id: string) { this.data.globalTeams = this.data.globalTeams.filter(t => t.id !== id); this.save(); }
  
  addChatMessage(msg: ChatMessage) { this.data.chatMessages.push(msg); this.save(); }

  log(userId: string, action: string, details: string) {
    this.data.auditLogs.unshift({ 
      id: Math.random().toString(36).substr(2, 9), 
      userId, 
      action, 
      timestamp: new Date().toISOString(), 
      details 
    });
    if (this.data.auditLogs.length > 100) {
      this.data.auditLogs = this.data.auditLogs.slice(0, 100);
    }
    this.save();
  }

  seedTestUsers() {
    const testUsers = [
      { id: 'test-1', username: 'TestPlayer_One', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-2', username: 'TestPlayer_Two', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-3', username: 'TestPlayer_Three', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-4', username: 'TestPlayer_Four', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-5', username: 'TestPlayer_Five', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-6', username: 'TestPlayer_Six', role: UserRole.MEMBER, createdAt: new Date().toISOString() }
    ];

    let addedCount = 0;
    testUsers.forEach(u => {
      if (!this.data.users.some(existing => existing.id === u.id)) {
        this.data.users.push(u);
        addedCount++;
      }
    });

    if (addedCount > 0) {
      this.save();
      this.log('system', 'SEED_USERS', `Injected ${addedCount} test users.`);
    }
  }

  wipeEverything() {
    localStorage.removeItem(this.storageKey);
    window.location.reload();
  }

  // Testing utility to wipe without reload
  wipeForTest() {
    this.data = this.getInitialState();
    this.save();
  }
}

export const db = new DatabaseService();
