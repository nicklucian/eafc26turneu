
import React, { useState } from 'react';
import type { User as FirebaseUser } from "firebase/auth";
import { authService } from '../services/auth';

interface Props {
  firebaseUser: FirebaseUser;
  onSuccess: (user: any) => void;
  onCancel: () => void;
}

export const InvitationGate: React.FC<Props> = ({ firebaseUser, onSuccess, onCancel }) => {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const user = await authService.finalizeGoogleRegistration(firebaseUser, code);
      onSuccess(user);
    } catch (err: any) {
      setError(err.message || 'Invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-sm p-4 animate-fade-in">
       <div className="ea-card w-[95%] max-w-md p-8 rounded-3xl border border-[#00ff88]/30 shadow-[0_0_50px_rgba(0,255,136,0.1)] relative overflow-hidden">
          {/* Decorative */}
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-[#00ff88] to-transparent"></div>
          
          <div className="text-center mb-8">
            <div className="w-16 h-16 rounded-full bg-[#00ff88]/10 border border-[#00ff88]/20 flex items-center justify-center mx-auto mb-4 text-2xl">
                🔒
            </div>
            <h2 className="text-2xl font-black italic uppercase tracking-tighter text-white">Private Access</h2>
            <p className="text-gray-400 text-sm mt-2">
                Hello <span className="text-[#00ff88]">{firebaseUser.displayName}</span>. 
                This is a private league. Please enter your invitation code to create your manager profile.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
                 <input 
                    autoFocus
                    type="text" 
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="ENTER CODE"
                    className="w-full bg-black/50 border-2 border-white/10 rounded-xl px-4 py-4 text-center font-black text-xl tracking-[0.2em] outline-none focus:border-[#00ff88] transition-colors text-white placeholder-gray-700"
                 />
            </div>
            
            {error && (
                <div className="text-red-500 text-xs font-bold uppercase tracking-widest text-center animate-pulse">
                    {error}
                </div>
            )}

            <button 
                type="submit" 
                disabled={loading || !code}
                className="w-full ea-bg-accent text-black font-black py-4 rounded-xl italic tracking-widest hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'VERIFYING...' : 'UNLOCK PROFILE'}
            </button>
          </form>

          <button 
            onClick={onCancel}
            className="w-full mt-4 text-gray-600 hover:text-gray-400 text-[10px] font-black uppercase tracking-widest transition-colors"
          >
            Cancel & Sign Out
          </button>
       </div>
    </div>
  );
};
