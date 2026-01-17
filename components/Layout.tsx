
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
    <div className="min-h-screen flex flex-col md:flex-row relative overflow-hidden">
      
      {/* --- GLOBAL FOOTBALL THEMED BACKGROUND --- */}
      <div className="fixed inset-0 z-0 pointer-events-none select-none">
        {/* 1. Base Gradient - Lighter start for visibility */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#15151a] via-[#0a0a0c] to-[#050506]" />
        
        {/* 2. Tactical Dot Grid Pattern (Visible Manager's Board) */}
        <div className="absolute inset-0 opacity-20" 
             style={{ 
               backgroundImage: 'radial-gradient(rgba(255, 255, 255, 0.15) 1px, transparent 1px)', 
               backgroundSize: '32px 32px' 
             }} 
        />
        
        {/* 3. Pitch Markings - Enhanced Opacity */}
        {/* Center Circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vh] h-[80vh] rounded-full border-2 border-dashed border-white/10 animate-[spin_120s_linear_infinite]" />
        
        {/* Inner Circle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[50vh] h-[50vh] rounded-full border border-white/10" />
        
        {/* Midfield Line */}
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-gradient-to-b from-transparent via-white/20 to-transparent" />
        
        {/* Corner Arcs */}
        <div className="absolute top-0 left-0 w-64 h-64 border-r border-b border-white/10 rounded-br-[80px] opacity-20" />
        <div className="absolute bottom-0 right-0 w-64 h-64 border-l border-t border-white/10 rounded-tl-[80px] opacity-20" />
        
        {/* 4. Vignette Overlay */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(5,5,6,0.5)_100%)]" />
      </div>

      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-[#111114]/90 backdrop-blur-md border-r border-white/10 flex flex-col sticky top-0 h-auto md:h-screen z-20 relative shadow-2xl">
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
      <main className="flex-1 p-6 md:p-10 overflow-y-auto z-10 relative">
        <div className="max-w-6xl mx-auto animate-fade-in">
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;
