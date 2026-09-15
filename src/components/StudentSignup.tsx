import React, { useState } from 'react';
import { ScreenType } from '../types';
import { registerStudentToDB } from '../lib/supabase';

interface StudentSignupProps {
  onNavigate: (screen: ScreenType) => void;
  onSignupSuccess: (studentName: string, email: string) => void;
  showToast: (msg: string, icon?: string) => void;
}

export const StudentSignup: React.FC<StudentSignupProps> = ({
  onNavigate,
  onSignupSuccess,
  showToast,
}) => {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Live password match check
  const passwordsMatch = confirmPassword.length > 0 && password === confirmPassword && password.length >= 6;
  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !email.trim()) {
      showToast('Please enter your full name and Gmail address.', 'error');
      return;
    }
    if (password.length < 6) {
      showToast('Password must be at least 6 characters.', 'error');
      return;
    }
    if (password !== confirmPassword) {
      showToast('Passwords do not match.', 'error');
      return;
    }

    setIsSubmitting(true);
    showToast('Registering student profile...', 'person_add');

    try {
      await registerStudentToDB({
        name: fullName.trim(),
        email: email.trim(),
        password: password,
        section: 'Sec 6-A',
      });
      setIsSubmitting(false);
      onSignupSuccess(fullName.trim(), email.trim());
      showToast('Account created! 15 Unsolved Questions ready.', 'verified');
      onNavigate('student-dashboard');
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
      onSignupSuccess(fullName.trim(), email.trim());
      onNavigate('student-dashboard');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 flex flex-col gap-5">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {/* Full Name */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="fullName" className="text-[14px] font-semibold text-[#131b2e]">
            Full Name <span className="text-[#3525cd] font-bold">*</span>
          </label>
          <div className="relative flex items-center rounded-xl bg-white shadow-xs focus-within:bg-[#f2f3ff] transition-colors border border-[#eaedff]">
            <span className="material-symbols-outlined absolute left-3.5 text-[#3525cd] text-[20px]">
              person
            </span>
            <input
              id="fullName"
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Aarav Sharma"
              className="w-full min-h-[48px] pl-11 pr-4 py-3 bg-transparent text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none"
            />
          </div>
          <p className="text-[12px] text-[#464555] flex items-center gap-1 pl-1">
            <span className="material-symbols-outlined text-[14px]">info</span>
            <span>As printed on your school ID / Navodaya admit card</span>
          </p>
        </div>

        {/* Gmail Address */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="email" className="text-[14px] font-semibold text-[#131b2e]">
            Gmail Address <span className="text-[#3525cd] font-bold">*</span>
          </label>
          <div className="relative flex items-center rounded-xl bg-white shadow-xs focus-within:bg-[#f2f3ff] transition-colors border border-[#eaedff]">
            <span className="material-symbols-outlined absolute left-3.5 text-[#3525cd] text-[20px]">
              mail
            </span>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. aarav.sharma@gmail.com"
              className="w-full min-h-[48px] pl-11 pr-4 py-3 bg-transparent text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none"
            />
          </div>
          <p className="text-[12px] text-[#464555] flex items-center gap-1 pl-1">
            <span className="material-symbols-outlined text-[14px]">mark_email_read</span>
            <span>Your test results & saved progress will be sent here</span>
          </p>
        </div>

        {/* Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="password" className="text-[14px] font-semibold text-[#131b2e]">
            Password <span className="text-[#3525cd] font-bold">*</span>
          </label>
          <div className="relative flex items-center rounded-xl bg-white shadow-xs focus-within:bg-[#f2f3ff] transition-colors border border-[#eaedff]">
            <span className="material-symbols-outlined absolute left-3.5 text-[#3525cd] text-[20px]">
              lock
            </span>
            <input
              id="password"
              type={showPassword ? 'text' : 'password'}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Create a secure password (min 6 ch"
              className="w-full min-h-[48px] pl-11 pr-12 py-3 bg-transparent text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-2.5 min-w-[36px] min-h-[36px] flex items-center justify-center text-[#464555] hover:text-[#131b2e] transition-colors"
            >
              <span className="material-symbols-outlined text-[20px]">
                {showPassword ? 'visibility_off' : 'visibility'}
              </span>
            </button>
          </div>
        </div>

        {/* Confirm Password */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="confirmPassword" className="text-[14px] font-semibold text-[#131b2e]">
            Confirm Password <span className="text-[#3525cd] font-bold">*</span>
          </label>
          <div className="relative flex items-center rounded-xl bg-white shadow-xs focus-within:bg-[#f2f3ff] transition-colors border border-[#eaedff]">
            <span className="material-symbols-outlined absolute left-3.5 text-[#3525cd] text-[20px]">
              lock_clock
            </span>
            <input
              id="confirmPassword"
              type="password"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter your password"
              className="w-full min-h-[48px] pl-11 pr-12 py-3 bg-transparent text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none"
            />
            <div className="absolute right-3.5 flex items-center justify-center">
              {passwordsMatch && (
                <span className="material-symbols-outlined text-[20px] text-[#005338]">
                  check_circle
                </span>
              )}
              {passwordsMismatch && (
                <span className="material-symbols-outlined text-[20px] text-[#ba1a1a]">
                  error
                </span>
              )}
              {!confirmPassword && (
                <span className="material-symbols-outlined text-[20px] text-[#777587]">
                  check_circle
                </span>
              )}
            </div>
          </div>

          {/* Live password match status pill */}
          {confirmPassword.length > 0 && (
            <div
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all ${
                passwordsMatch
                  ? 'bg-[#006e4b] text-white shadow-xs'
                  : 'bg-[#ffdad6] text-[#93000a]'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {passwordsMatch ? 'verified' : 'cancel'}
              </span>
              <span>
                {passwordsMatch ? 'Passwords match ✓' : 'Passwords do not match yet'}
              </span>
            </div>
          )}
        </div>

        {/* Primary CTA Button */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full min-h-[52px] py-3.5 px-6 rounded-xl bg-[#3525cd] text-white font-bold text-[16px] flex items-center justify-center gap-2 shadow-lg shadow-[#3525cd]/20 active:scale-[0.98] transition-all cursor-pointer mt-2 disabled:opacity-60"
        >
          {isSubmitting ? (
            <span className="material-symbols-outlined animate-spin text-[22px]">
              progress_activity
            </span>
          ) : (
            <span
              className="material-symbols-outlined text-[22px]"
              style={{ fontVariationSettings: "'FILL' 1" }}
            >
              star
            </span>
          )}
          <span>Create Account & Start Quest</span>
        </button>
      </form>

      {/* Already registered link */}
      <div className="text-center pt-2">
        <p className="text-[14px] text-[#464555]">
          Already have an account?{' '}
          <button
            onClick={() => onNavigate('student-login')}
            className="font-bold text-[#3525cd] hover:underline ml-1"
          >
            Log in here
          </button>
        </p>
      </div>
    </div>
  );
};
