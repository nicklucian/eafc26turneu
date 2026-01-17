
export enum UserRole {
  ADMIN = 'Admin',
  MEMBER = 'Member'
}

export enum TournamentStatus {
  UPCOMING = 'Upcoming',
  ACTIVE = 'Active',
  FINISHED = 'Finished'
}

export enum TournamentType {
  LOTTERY = 'Lottery Assignment',
  USERS_ONLY = 'Users Only'
}

export enum TeamType {
  CLUB = 'CLUB',
  NATIONAL = 'NATIONAL'
}

export interface User {
  id: string;
  username: string;
  role: UserRole;
  avatar?: string;
  createdAt: string;
  password?: string;
}

export interface InvitationCode {
  id: string;
  code: string;
  isActive: boolean;
  createdBy: string;
  createdAt: string;
}

export interface GlobalTeam {
  id: string;
  name: string;
  type: TeamType;
  logo?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Tournament {
  id: string;
  name: string;
  type: TournamentType;
  startDate: string;
  status: TournamentStatus;
  description?: string;
  createdAt: string;
  participantUserIds: string[];
  selectedTeamIds: string[];
}

export interface Assignment {
  id: string;
  tournamentId: string;
  userId: string;
  teamId: string;
}

export interface Match {
  id: string;
  tournamentId: string;
  matchday: number;
  playerAId: string;
  playerBId: string;
  teamAId?: string;
  teamBId?: string;
  scoreA: number | null;
  scoreB: number | null;
  isCompleted: boolean;
  isSimulated?: boolean;
  // Snapshot for Undo (Option B)
  history?: {
    scoreA: number | null;
    scoreB: number | null;
    isCompleted: boolean;
  };
}

export interface AuditLog {
  id: string;
  userId: string;
  action: string;
  timestamp: string;
  details: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  role: UserRole;
  text: string;
  timestamp: string;
  tournamentId?: string;
}

export interface StandingStat {
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
