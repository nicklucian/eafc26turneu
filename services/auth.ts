
import { db } from './db';
import { User, UserRole } from '../types';

const AUTH_KEY = 'fc26_auth_user';

export const auth = {
  getCurrentUser: (): User | null => {
    const saved = localStorage.getItem(AUTH_KEY);
    return saved ? JSON.parse(saved) : null;
  },

  login: (username: string, password: string): User | null => {
    // In production, we'd hash and check against DB. 
    // Here we handle the default admin and simulate verification.
    if (username === 'admin' && password === '142356') {
      const user = db.getUsers().find(u => u.username === 'admin');
      if (user) {
        localStorage.setItem(AUTH_KEY, JSON.stringify(user));
        return user;
      }
    }
    
    // Simulate lookup for registered members (assume password check passed for demo)
    const user = db.getUsers().find(u => u.username === username);
    if (user && password.length >= 6) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(user));
      return user;
    }

    return null;
  },

  register: (username: string, password: string, inviteCode: string): User | null => {
    const codes = db.getCodes();
    const validCode = codes.find(c => c.code === inviteCode && c.isActive);
    
    if (!validCode) throw new Error('Invalid or inactive invitation code.');
    if (password.length < 6) throw new Error('Password must be at least 6 characters.');
    if (db.getUsers().some(u => u.username === username)) throw new Error('Username already exists.');

    const newUser: User = {
      id: Math.random().toString(36).substr(2, 9),
      username,
      role: UserRole.MEMBER,
      createdAt: new Date().toISOString()
    };

    db.addUser(newUser);
    db.log(newUser.id, 'Register', `User ${username} joined with code ${inviteCode}`);
    localStorage.setItem(AUTH_KEY, JSON.stringify(newUser));
    return newUser;
  },

  logout: () => {
    localStorage.removeItem(AUTH_KEY);
  }
};
