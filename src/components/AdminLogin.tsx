import React, { useState } from 'react';
import { ScreenType } from '../types';

interface AdminLoginProps {
  onNavigate: (screen: ScreenType) => void;
  showToast: (msg: string, icon?: string) => void;
}

export const AdminLogin: React.FC<AdminLoginProps> = ({ onNavigate, showToast }) => {
  const [adminId, setAdminId] = useState('principal_varma');
  const [password, setPassword] = useState('admin123');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminId.trim() || !password) {
      showToast('Please enter Admin ID and Master Key.', 'error');
      return;
    }

    setIsSubmitting(true);
    showToast('Authenticating Administrator...', 'admin_panel_settings');

    setTimeout(() => {
      setIsSubmitting(false);
      showToast('Welcome, Principal Sharma! Terminal unlocked.', 'verified_user');
      onNavigate('admin-dashboard');
    }, 800);
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Admin Sign In Card */}
      <div className="w-full bg-white rounded-2xl p-6 shadow-md border border-[#eaedff]">
        <h1 className="text-[26px] font-bold text-[#131b2e] tracking-tight mb-5">
          Admin Sign In
        </h1>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Username or Employee ID */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-id" className="text-[14px] font-semibold text-[#131b2e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#3525cd]">
                badge
              </span>
              <span>Username or Employee ID</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[20px] text-[#464555] pointer-events-none">
                person
              </span>
              <input
                id="admin-id"
                type="text"
                required
                value={adminId}
                onChange={(e) => setAdminId(e.target.value)}
                placeholder="e.g. principal_varma or navodaya_adm"
                className="w-full h-12 pl-10 pr-4 rounded-xl bg-[#f2f3ff] text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:bg-white focus:outline-none transition-all shadow-inner"
              />
            </div>
          </div>

          {/* Master Key / Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="admin-password" className="text-[14px] font-semibold text-[#131b2e] flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-[#3525cd]">
                lock
              </span>
              <span>Master Key / Password</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[20px] text-[#464555] pointer-events-none">
                shield_lock
              </span>
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className="w-full h-12 pl-10 pr-12 rounded-xl bg-[#f2f3ff] text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:bg-white focus:outline-none transition-all shadow-inner"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 p-1.5 rounded-lg text-[#464555] hover:text-[#3525cd] transition-colors"
                aria-label="Toggle password visibility"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Remember me & Forgot Key */}
          <div className="flex items-center justify-between pt-1 text-[12px]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="w-5 h-5 rounded accent-[#3525cd] cursor-pointer"
              />
              <span className="text-[#131b2e] font-semibold">Remember me</span>
            </label>
            <button
              type="button"
              onClick={() => showToast('Contact JNV Nodal Headmaster for key recovery.', 'info')}
              className="font-bold text-[#3525cd] hover:underline"
            >
              Forgot Admin Key?
            </button>
          </div>

          {/* Sign In CTA */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full mt-2 h-13 py-3.5 px-6 rounded-xl bg-[#3525cd] text-white font-bold text-[16px] flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-transform cursor-pointer disabled:opacity-60"
          >
            {isSubmitting ? (
              <span className="material-symbols-outlined animate-spin text-[20px]">
                progress_activity
              </span>
            ) : (
              <>
                <span>Sign In as Admin</span>
                <span className="material-symbols-outlined text-[20px]">
                  arrow_forward
                </span>
              </>
            )}
          </button>
        </form>
      </div>

      {/* Student Aspirant Switch Card (Amber) */}
      <div className="w-full rounded-2xl bg-[#fea619] text-[#684000] p-4 shadow-sm flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white text-[#855300] flex items-center justify-center flex-shrink-0 shadow-xs">
            <span className="material-symbols-outlined text-[24px]">school</span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[13px] text-[#2a1700]">
              Are you a Class 6 Aspirant?
            </span>
            <span className="text-[12px] opacity-90">
              Take mental ability & math tests now
            </span>
          </div>
        </div>
        <button
          onClick={() => onNavigate('student-login')}
          className="h-10 px-3.5 rounded-xl bg-white text-[#855300] font-bold text-[12px] flex items-center gap-1 flex-shrink-0 shadow-xs active:scale-95 transition-transform"
        >
          <span>Student Login</span>
          <span className="material-symbols-outlined text-[16px]">
            arrow_forward
          </span>
        </button>
      </div>
    </div>
  );
};
