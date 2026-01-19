
import { 
  collection, getDocs, doc, setDoc, updateDoc, deleteDoc, 
  query, where, orderBy, limit, addDoc, writeBatch, onSnapshot 
} from "firebase/firestore";
import { db } from "./firebase";
import { 
  User, UserRole, Tournament, TournamentStatus, TeamType, 
  InvitationCode, GlobalTeam, Assignment, Match, AuditLog, ChatMessage 
} from '../types';

export class DatabaseService {
  
  // Helper to convert Firestore docs (which might not have ID in data) to our Types
  private convertDocs<T>(snapshot: any): T[] {
    return snapshot.docs.map((doc: any) => ({ id: doc.id, ...doc.data() })) as T[];
  }

  // Helper to remove undefined fields which Firestore rejects
  private cleanPayload(obj: any): any {
    const cleaned: any = {};
    Object.keys(obj).forEach(key => {
      if (obj[key] !== undefined) {
        cleaned[key] = obj[key];
      }
    });
    return cleaned;
  }

  // --- USERS ---
  async getUsers(): Promise<User[]> {
    const q = query(collection(db, "users"));
    const snapshot = await getDocs(q);
    return this.convertDocs<User>(snapshot);
  }

  async addUser(user: User): Promise<void> {
    await setDoc(doc(db, "users", user.id), this.cleanPayload(user));
  }

  async updateUser(id: string, data: Partial<User>): Promise<void> {
    await updateDoc(doc(db, "users", id), this.cleanPayload(data));
  }

  async deleteUser(id: string): Promise<void> {
    await deleteDoc(doc(db, "users", id));
  }

  // --- INVITATION CODES ---
  async getCodes(): Promise<InvitationCode[]> {
    const snapshot = await getDocs(collection(db, "invitationCodes"));
    return this.convertDocs<InvitationCode>(snapshot);
  }

  async addCode(code: InvitationCode): Promise<void> {
    await setDoc(doc(db, "invitationCodes", code.id), this.cleanPayload(code));
  }

  async toggleCode(id: string, currentStatus: boolean): Promise<void> {
    await updateDoc(doc(db, "invitationCodes", id), { isActive: !currentStatus });
  }

  async deleteCode(id: string): Promise<void> {
    await deleteDoc(doc(db, "invitationCodes", id));
  }

  // --- GLOBAL TEAMS ---
  async getGlobalTeams(): Promise<GlobalTeam[]> {
    const snapshot = await getDocs(collection(db, "globalTeams"));
    return this.convertDocs<GlobalTeam>(snapshot);
  }

  async addGlobalTeam(team: Omit<GlobalTeam, 'id' | 'createdAt' | 'updatedAt' | 'isActive'>): Promise<GlobalTeam> {
    const newId = doc(collection(db, "globalTeams")).id;
    const newTeam: GlobalTeam = {
      ...team,
      id: newId,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    await setDoc(doc(db, "globalTeams", newId), this.cleanPayload(newTeam));
    return newTeam;
  }

  async updateGlobalTeam(id: string, updates: Partial<GlobalTeam>): Promise<void> {
    await updateDoc(doc(db, "globalTeams", id), { ...this.cleanPayload(updates), updatedAt: new Date().toISOString() });
  }

  async deleteGlobalTeam(id: string): Promise<void> {
    await deleteDoc(doc(db, "globalTeams", id));
  }

  // --- TOURNAMENTS ---
  async getTournaments(): Promise<Tournament[]> {
    const snapshot = await getDocs(collection(db, "tournaments"));
    return this.convertDocs<Tournament>(snapshot);
  }

  async getTournamentById(id: string): Promise<Tournament | undefined> {
    const q = query(collection(db, "tournaments"), where("id", "==", id));
    const snapshot = await getDocs(q);
    if (snapshot.empty) return undefined;
    return { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as Tournament;
  }

  async addTournament(t: Tournament): Promise<void> {
    await setDoc(doc(db, "tournaments", t.id), this.cleanPayload(t));
  }

  async deleteTournament(id: string): Promise<void> {
    // 1. Delete the tournament document first
    await deleteDoc(doc(db, "tournaments", id));
    
    // 2. Cascade delete related data
    // We fetch related data. Note: If we just deleted the tournament, getMatches might still find them as they are in a diff collection.
    const matches = await this.getMatches(id);
    const assignments = await this.getAssignments(id);
    const chat = await this.getChat(id);
    
    const allOps: any[] = [];
    matches.forEach(m => allOps.push(doc(db, "matches", m.id)));
    assignments.forEach(a => allOps.push(doc(db, "assignments", a.id)));
    chat.forEach(c => allOps.push(doc(db, "chatMessages", c.id)));
    
    await this.processBatchDelete(allOps);
  }

  async updateTournamentTeams(id: string, teamIds: string[]): Promise<void> {
    await updateDoc(doc(db, "tournaments", id), { selectedTeamIds: teamIds });
  }

  async updateTournamentParticipants(id: string, userIds: string[]): Promise<void> {
    await updateDoc(doc(db, "tournaments", id), { participantUserIds: userIds });
  }

  async updateTournamentStatus(id: string, status: TournamentStatus): Promise<void> {
    await updateDoc(doc(db, "tournaments", id), { status });
  }

  // --- MATCHES ---
  async getMatches(tournamentId: string): Promise<Match[]> {
    const q = query(collection(db, "matches"), where("tournamentId", "==", tournamentId));
    const snapshot = await getDocs(q);
    return this.convertDocs<Match>(snapshot);
  }

  async getAllMatches(): Promise<Match[]> {
    const snapshot = await getDocs(collection(db, "matches"));
    return this.convertDocs<Match>(snapshot);
  }

  async updateMatch(id: string, scoreA: number, scoreB: number): Promise<void> {
    if (scoreA < 0 || scoreB < 0) throw new Error("Scores must be non-negative.");
    await updateDoc(doc(db, "matches", id), {
      scoreA,
      scoreB,
      isCompleted: true
    });
  }

  async undoMatchResult(id: string): Promise<void> {
    await updateDoc(doc(db, "matches", id), {
      isCompleted: false
    });
  }

  async deployFixtures(tournamentId: string, matches: Match[]): Promise<void> {
    const batch = writeBatch(db);
    matches.forEach(m => {
      const ref = doc(db, "matches", m.id);
      const safeMatch = this.cleanPayload(m);
      batch.set(ref, safeMatch);
    });
    const tRef = doc(db, "tournaments", tournamentId);
    batch.update(tRef, { status: TournamentStatus.ACTIVE });
    await batch.commit();
  }

  async resetTournamentSchedule(id: string): Promise<void> {
    const matches = await this.getMatches(id);
    const assignments = await this.getAssignments(id);
    
    const allOps: any[] = [];
    matches.forEach(m => allOps.push(doc(db, "matches", m.id)));
    assignments.forEach(a => allOps.push(doc(db, "assignments", a.id)));
    
    await this.processBatchDelete(allOps);
    await updateDoc(doc(db, "tournaments", id), { status: TournamentStatus.UPCOMING });
  }

  // --- ASSIGNMENTS ---
  async getAssignments(tournamentId: string): Promise<Assignment[]> {
    const q = query(collection(db, "assignments"), where("tournamentId", "==", tournamentId));
    const snapshot = await getDocs(q);
    return this.convertDocs<Assignment>(snapshot);
  }

  async addAssignments(assignments: Assignment[]): Promise<void> {
    const batch = writeBatch(db);
    assignments.forEach(a => {
      const ref = doc(db, "assignments", a.id);
      batch.set(ref, this.cleanPayload(a));
    });
    await batch.commit();
  }

  // --- CHAT ---
  async getChat(tournamentId?: string): Promise<ChatMessage[]> {
    const q = query(collection(db, "chatMessages"), orderBy("timestamp", "asc"), limit(100));
    const snapshot = await getDocs(q);
    let msgs = this.convertDocs<ChatMessage>(snapshot);
    if (tournamentId) {
      msgs = msgs.filter(m => m.tournamentId === tournamentId);
    } else {
      msgs = msgs.filter(m => !m.tournamentId);
    }
    return msgs;
  }

  subscribeToChat(callback: (msgs: ChatMessage[]) => void, tournamentId?: string): () => void {
    const q = query(collection(db, "chatMessages"), orderBy("timestamp", "asc"), limit(100));
    return onSnapshot(q, (snapshot) => {
      let msgs = this.convertDocs<ChatMessage>(snapshot);
      if (tournamentId) {
        msgs = msgs.filter(m => m.tournamentId === tournamentId);
      } else {
        msgs = msgs.filter(m => !m.tournamentId);
      }
      callback(msgs);
    });
  }

  async addChatMessage(msg: ChatMessage): Promise<void> {
    await setDoc(doc(db, "chatMessages", msg.id), this.cleanPayload(msg));
  }

  // --- AUDIT LOGS ---
  async getAuditLogs(): Promise<AuditLog[]> {
    const q = query(collection(db, "auditLogs"), orderBy("timestamp", "desc"), limit(100));
    const snapshot = await getDocs(q);
    return this.convertDocs<AuditLog>(snapshot);
  }

  async log(userId: string, action: string, details: string): Promise<void> {
    const id = doc(collection(db, "auditLogs")).id;
    const entry: AuditLog = {
      id,
      userId,
      action,
      timestamp: new Date().toISOString(),
      details
    };
    await setDoc(doc(db, "auditLogs", id), this.cleanPayload(entry));
  }

  // --- SEEDING / UTILS ---
  async seedDefaultTeams(): Promise<void> {
    const snapshot = await getDocs(collection(db, "globalTeams"));
    if (!snapshot.empty) return;
    const batch = writeBatch(db);
    const clubs = ['Real Madrid', 'Manchester City', 'FC Barcelona', 'Bayern Munich', 'Paris Saint-Germain', 'Liverpool', 'Arsenal', 'Inter Milan', 'AC Milan', 'Atletico Madrid'];
    const nationals = ['France', 'Brazil', 'England', 'Argentina', 'Spain', 'Portugal', 'Germany', 'Netherlands', 'Italy', 'Belgium'];
    const now = new Date().toISOString();
    clubs.forEach(name => {
      const id = `team-club-${name.toLowerCase().replace(/\s+/g, '-')}`;
      batch.set(doc(db, "globalTeams", id), { id, name, type: TeamType.CLUB, isActive: true, createdAt: now, updatedAt: now });
    });
    nationals.forEach(name => {
      const id = `team-nat-${name.toLowerCase().replace(/\s+/g, '-')}`;
      batch.set(doc(db, "globalTeams", id), { id, name, type: TeamType.NATIONAL, isActive: true, createdAt: now, updatedAt: now });
    });
    await batch.commit();
  }

  async seedTestUsers(): Promise<void> {
    const testUsers = [
      { id: 'test-1', username: 'TestPlayer_One', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-2', username: 'TestPlayer_Two', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-3', username: 'TestPlayer_Three', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-4', username: 'TestPlayer_Four', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-5', username: 'TestPlayer_Five', role: UserRole.MEMBER, createdAt: new Date().toISOString() },
      { id: 'test-6', username: 'TestPlayer_Six', role: UserRole.MEMBER, createdAt: new Date().toISOString() }
    ];
    const batch = writeBatch(db);
    testUsers.forEach(u => batch.set(doc(db, "users", u.id), u));
    await batch.commit();
  }
  
  // SCAN ONLY
  async getOrphanStats(): Promise<{ matches: number, assignments: number }> {
      const tournaments = await this.getTournaments();
      const tournamentIds = new Set(tournaments.map(t => t.id));
      
      const matchSnapshot = await getDocs(collection(db, "matches"));
      const assignSnapshot = await getDocs(collection(db, "assignments"));
      
      let mCount = 0;
      let aCount = 0;

      matchSnapshot.forEach(d => {
          if(!tournamentIds.has(d.data().tournamentId)) mCount++;
      });
      assignSnapshot.forEach(d => {
          if(!tournamentIds.has(d.data().tournamentId)) aCount++;
      });
      
      return { matches: mCount, assignments: aCount };
  }

  // DELETE ONLY ORPHANS (SAFE)
  async purgeOrphans(): Promise<number> {
    console.log("Starting Targeted Orphan Cleanup...");
    const tournaments = await this.getTournaments();
    const tournamentIds = new Set(tournaments.map(t => t.id));
    
    const matchSnapshot = await getDocs(collection(db, "matches"));
    const assignmentSnapshot = await getDocs(collection(db, "assignments"));
    
    const allOps: any[] = [];

    matchSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.tournamentId || !tournamentIds.has(data.tournamentId)) {
            allOps.push(doc(db, "matches", docSnap.id));
        }
    });

    assignmentSnapshot.docs.forEach(docSnap => {
        const data = docSnap.data();
        if (!data.tournamentId || !tournamentIds.has(data.tournamentId)) {
            allOps.push(doc(db, "assignments", docSnap.id));
        }
    });

    if (allOps.length > 0) {
        await this.processBatchDelete(allOps);
    }
    return allOps.length;
  }

  // Brutal wipe of ALL matches and assignments (DANGER)
  async wipeAllMatchData(): Promise<number> {
      console.log("Wiping ALL match data...");
      const matchSnapshot = await getDocs(collection(db, "matches"));
      const assignmentSnapshot = await getDocs(collection(db, "assignments"));
      const chatSnapshot = await getDocs(collection(db, "chatMessages"));

      const allOps: any[] = [];
      matchSnapshot.forEach(d => allOps.push(doc(db, "matches", d.id)));
      assignmentSnapshot.forEach(d => allOps.push(doc(db, "assignments", d.id)));
      chatSnapshot.forEach(d => {
          if (d.data().tournamentId) {
             allOps.push(doc(db, "chatMessages", d.id));
          }
      });

      if (allOps.length > 0) {
          await this.processBatchDelete(allOps);
      }
      return allOps.length;
  }

  // Batch Helper to handle limits > 500
  private async processBatchDelete(refs: any[]): Promise<void> {
    const BATCH_SIZE = 400; 
    for (let i = 0; i < refs.length; i += BATCH_SIZE) {
        const batch = writeBatch(db);
        const chunk = refs.slice(i, i + BATCH_SIZE);
        chunk.forEach(ref => batch.delete(ref));
        await batch.commit();
    }
  }

  async wipeEverything(): Promise<void> {
      window.location.reload(); 
  }
}

export const databaseService = new DatabaseService();
