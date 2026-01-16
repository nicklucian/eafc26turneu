
import React from 'react';
import { User, UserRole } from '../types';
import { auth } from '../services/auth';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  children: React.ReactNode;
  setCurrentPage: (page: string) => void;
  currentPage: string;
}

const Layout: React.FC<LayoutProps> = ({ user, onLogout, children, setCurrentPage, currentPage }) => {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', roles: [UserRole.ADMIN, UserRole.MEMBER] },
    { id: 'tournaments', label: 'Tournaments', roles: [UserRole.ADMIN, UserRole.MEMBER] },
    { id: 'rankings', label: 'Global Rankings', roles: [UserRole.ADMIN, UserRole.MEMBER] },
    { id: 'profile', label: 'My Profile', roles: [UserRole.ADMIN, UserRole.MEMBER] },
    { id: 'chat', label: 'Global Chat', roles: [UserRole.ADMIN, UserRole.MEMBER] },
    { id: 'admin', label: 'Admin Panel', roles: [UserRole.ADMIN] },
  ];

  return (
    <div className="min-h-screen flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-[#111114] border-r border-white/10 flex flex-col sticky top-0 h-auto md:h-screen">
        <div className="p-6">
          <h1 className="text-xl font-extrabold tracking-tighter italic">
            FC <span className="ea-accent">26</span> PRO
          </h1>
        </div>

        <nav className="flex-1 px-4 space-y-2">
          {navItems.map(item => item.roles.includes(user.role) && (
            <button
              key={item.id}
              onClick={() => setCurrentPage(item.id)}
              className={`w-full text-left px-4 py-3 rounded-lg transition-all duration-200 font-medium ${
                currentPage === item.id 
                  ? 'ea-bg-accent text-black shadow-lg shadow-[#00ff88]/20' 
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="p-4 mt-auto border-t border-white/5">
          <div className="flex items-center space-x-3 px-4 py-3">
            <div className="w-10 h-10 rounded-full ea-bg-accent flex items-center justify-center text-black font-bold">
              {user.username[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">{user.username}</p>
              <p className="text-xs text-gray-500 uppercase tracking-widest">{user.role}</p>
            </div>
          </div>
          <button 
            onClick={onLogout}
            className="w-full mt-2 text-left px-4 py-2 text-red-400 hover:text-red-300 text-sm font-medium transition-colors"
          >
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-6 md:p-10 overflow-y-auto">
        <div className="max-w-6xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
