
import React, { useState } from 'react';
import { DatabaseService } from '../services/db';
import { generateFixturesAlgorithm, calculateStandingsLogic } from '../utils/logic';
import { TournamentStatus, TournamentType, UserRole } from '../types';

export const AutoTestRunner: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [logs, setLogs] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [summary, setSummary] = useState<string>('');

  const addLog = (msg: string) => setLogs(prev => [...prev, msg]);

  const runTests = async () => {
    setRunning(true);
    setLogs(['Initializing isolated test environment...', '-----------------------------------']);
    setSummary('');

    // Small delay to allow UI to render
    await new Promise(r => setTimeout(r, 100));

    try {
      // 1. SETUP
      const testKey = 'fc26_autotest_temp';
      localStorage.removeItem(testKey); // Ensure clean state
      const db = new DatabaseService(testKey);
      
      addLog('✓ Test Database Instantiated (Isolated)');

      // 2. ADMIN & SETUP TESTS
      db.seedTestUsers();
      const users = db.getUsers();
      if (users.length < 6) throw new Error('Seeding failed');
      addLog('✓ User Seeding Verified');

      // Create Admin
      const admin = users.find(u => u.username === 'admin') || users[0];

      // Create Tournament
      const tId = 'test-tourn-1';
      db.addTournament({
        id: tId,
        name: 'AutoTest Cup',
        type: TournamentType.USERS_ONLY, // Easier setup for auto test
        startDate: new Date().toISOString(),
        status: TournamentStatus.UPCOMING,
        createdAt: new Date().toISOString(),
        participantUserIds: [],
        selectedTeamIds: []
      });
      addLog('✓ Tournament Creation Verified');

      // Add Participants
      const p1 = users[1].id; // TestPlayer_One
      const p2 = users[2].id; // TestPlayer_Two
      db.updateTournamentParticipants(tId, [p1, p2]);
      
      const tAfterAdd = db.getTournamentById(tId);
      if (tAfterAdd?.participantUserIds.length !== 2) throw new Error('Participant addition failed');
      addLog('✓ Participant Management Verified');

      // 3. FIXTURE GENERATION
      const matches = generateFixturesAlgorithm(tId, [p1, p2], [], true);
      if (matches.length !== 2) throw new Error(`Fixture generation failed for 2 players. Expected 2, got ${matches.length}`);
      
      db.deployFixtures(tId, matches);
      const dbMatches = db.getMatches(tId);
      const tActive = db.getTournamentById(tId);
      
      if (tActive?.status !== TournamentStatus.ACTIVE) throw new Error('Tournament status not updated to ACTIVE');
      if (dbMatches.length !== 2) throw new Error('Matches not saved to DB');
      addLog('✓ Fixture Generation & Deployment Verified (Round Robin 2 Players)');

      // 4. SCORING & INTEGRITY
      const m1 = dbMatches[0];
      
      // Determine scores so P1 wins for verification
      // Fixture gen might swap home/away, so we verify IDs
      const sA = m1.playerAId === p1 ? 2 : 1; 
      const sB = m1.playerBId === p1 ? 2 : 1;

      db.updateMatch(m1.id, sA, sB); // P1 beats P2
      
      let updatedMatch = db.getMatches(tId).find(m => m.id === m1.id);
      if (updatedMatch?.scoreA !== sA || updatedMatch?.scoreB !== sB || !updatedMatch.isCompleted) {
        throw new Error('Match update failed');
      }
      addLog('✓ Score Updates Verified');

      // Standings Check
      const standings = calculateStandingsLogic([p1, p2], db.getMatches(tId), users, [], [], true);
      if (standings[0].id !== p1 || standings[0].pts !== 3) throw new Error(`Standings calculation incorrect. Expected P1 (3pts), got ${standings[0].username} (${standings[0].pts}pts)`);
      if (standings[1].id !== p2 || standings[1].pts !== 0) throw new Error('Standings calculation incorrect (Loss should be 0pts)');
      addLog('✓ Standings Calculation Logic Verified');

      // 5. UNDO OPERATIONS
      db.undoMatchResult(m1.id);
      updatedMatch = db.getMatches(tId).find(m => m.id === m1.id);
      if (updatedMatch?.isCompleted) throw new Error('Undo failed: isCompleted is still true');
      addLog('✓ Undo Logic Verified');

      // Re-apply score for finish
      // Setup a draw for m1, and P2 winning m2 for variety
      db.updateMatch(m1.id, 1, 1); 
      
      const m2 = dbMatches[1];
      // P2 wins match 2
      const m2sA = m2.playerAId === p2 ? 2 : 0;
      const m2sB = m2.playerBId === p2 ? 2 : 0;
      db.updateMatch(m2.id, m2sA, m2sB); 

      // 6. FINISH TOURNAMENT
      db.updateTournamentStatus(tId, TournamentStatus.FINISHED);
      const tFinished = db.getTournamentById(tId);
      if (tFinished?.status !== TournamentStatus.FINISHED) throw new Error('Finish status update failed');
      addLog('✓ Finish Tournament Workflow Verified');

      // 7. MEMBER RESTRICTIONS (LOGIC SIMULATION)
      // We simulate what happens if a "Member" tries to call updateMatch on a finished tournament.
      // The DB service itself currently doesn't throw, but the UI protects it. 
      // We verify the DB *can* still accept valid input, proving we rely on UI/Controller logic.
      // However, let's verify invalid inputs are rejected.
      try {
        db.updateMatch(m1.id, -1, 0);
        throw new Error('DB accepted negative score');
      } catch (e: any) {
        if (!e.message.includes('non-negative')) throw e;
      }
      addLog('✓ Data Integrity: Negative scores rejected');

      try {
        db.updateMatch('invalid-id', 1, 0);
        throw new Error('DB accepted invalid match ID');
      } catch (e: any) {
         if (!e.message.includes('not found')) throw e;
      }
      addLog('✓ Data Integrity: Invalid IDs rejected');

      // 8. CASCADE DELETION
      db.deleteTournament(tId);
      if (db.getTournamentById(tId)) throw new Error('Tournament deletion failed');
      if (db.getMatches(tId).length > 0) throw new Error('Cascade delete failed (Matches remained)');
      addLog('✓ Cascade Deletion Verified');

      // 9. AUDIT LOGS
      if (db.getAuditLogs().length === 0) throw new Error('Audit logs are empty');
      addLog('✓ Audit Logging Verified');

      // Cleanup
      localStorage.removeItem(testKey);
      
      setSummary('PASSED: All critical Admin functions, Integrity checks, and Business Logic verified.');
      addLog('-----------------------------------');
      addLog('Autotest completed successfully.');
      
    } catch (err: any) {
      console.error(err);
      setSummary(`FAILED: ${err.message}`);
      addLog('X TEST FAILED. See console for details.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-[100] flex items-center justify-center p-8">
      <div className="bg-[#111114] border border-white/20 w-full max-w-3xl rounded-3xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="p-8 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="text-2xl font-black italic tracking-tighter text-[#00ff88]">SYSTEM DIAGNOSTICS</h3>
            <p className="text-gray-500 text-xs font-bold uppercase tracking-widest mt-1">Automated Integration Testing Suite</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-full transition-colors">✕</button>
        </div>
        
        <div className="flex-1 bg-black/50 p-6 overflow-y-auto font-mono text-sm space-y-2">
          {logs.length === 0 && <p className="text-gray-600 italic">Ready to start diagnostics...</p>}
          {logs.map((l, i) => (
            <div key={i} className={l.startsWith('X') ? 'text-red-500 font-bold' : l.startsWith('✓') ? 'text-[#00ff88]' : 'text-gray-300'}>
              {l}
            </div>
          ))}
        </div>

        <div className="p-8 border-t border-white/10 bg-[#1a1a1e] flex justify-between items-center">
          <div className="text-sm font-bold">
            {summary && <span className={summary.startsWith('PASSED') ? 'text-[#00ff88]' : 'text-red-500'}>{summary}</span>}
          </div>
          <button 
            onClick={runTests} 
            disabled={running}
            className="ea-bg-accent text-black font-black px-8 py-3 rounded-xl italic hover:scale-105 active:scale-95 transition-all disabled:opacity-50 disabled:scale-100"
          >
            {running ? 'RUNNING...' : 'EXECUTE TESTS'}
          </button>
        </div>
      </div>
    </div>
  );
};
