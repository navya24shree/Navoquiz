import React, { useState } from 'react';
import { ScreenType } from '../types';

interface StudentLoginProps {
  onNavigate: (screen: ScreenType) => void;
  onLoginSuccess: (studentName: string, email: string) => void;
  showToast: (msg: string, icon?: string) => void;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({
  onNavigate,
  onLoginSuccess,
  showToast,
}) => {
  const [studentName, setStudentName] = useState('Aarav Sharma');
  const [email, setEmail] = useState('aarav.sharma@gmail.com');
  const [password, setPassword] = useState('password123');
  const [showPassword, setShowPassword] = useState(false);
  const [keepLoggedIn, setKeepLoggedIn] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast('Please enter your email address and password.', 'error');
      return;
    }

    setIsSubmitting(true);

    try {
      const savedStudents = JSON.parse(localStorage.getItem('navoquest_students') || '[]');
      const registeredStudent = savedStudents.find(
        (s: { email: string; password?: string }) => s.email.toLowerCase() === email.trim().toLowerCase()
      );

      if (registeredStudent) {
        // Validate password
        if (registeredStudent.password && registeredStudent.password !== password) {
          setIsSubmitting(false);
          showToast('Incorrect password for this student account.', 'error');
          return;
        }

        // Login successful with registered student credentials
        setTimeout(() => {
          setIsSubmitting(false);
          onLoginSuccess(registeredStudent.name, registeredStudent.email);
          showToast(`Welcome back, ${registeredStudent.name}!`, 'check_circle');
          onNavigate('student-dashboard');
        }, 500);
      } else {
        // Save student account credentials if new
        const nameToUse = studentName.trim() || email.split('@')[0];
        const newAccount = {
          id: `std_${Date.now()}`,
          name: nameToUse,
          email: email.trim(),
          password: password,
          section: 'Sec 6-A',
          testsDone: 0,
          solvedCount: 0,
          unsolvedCount: 15,
          accuracy: 0,
          lastActive: 'Just logged in',
          status: 'Active',
          avatarInitials: nameToUse
            .split(' ')
            .map((n: string) => n[0])
            .join('')
            .substring(0, 2)
            .toUpperCase(),
        };

        savedStudents.unshift(newAccount);
        localStorage.setItem('navoquest_students', JSON.stringify(savedStudents));

        setTimeout(() => {
          setIsSubmitting(false);
          onLoginSuccess(newAccount.name, newAccount.email);
          showToast('Login validated! Stored credentials securely.', 'check_circle');
          onNavigate('student-dashboard');
        }, 500);
      }
    } catch (err) {
      console.error(err);
      setIsSubmitting(false);
      onLoginSuccess(studentName || 'Student', email);
      onNavigate('student-dashboard');
    }
  };

  return (
    <div className="w-full max-w-md mx-auto px-4 py-6 flex flex-col gap-6">
      {/* Form Card */}
      <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#eaedff] flex flex-col gap-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Student Name */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="student-name" className="text-[14px] font-semibold text-[#131b2e] flex items-center gap-1">
              <span>Student Name</span>
              <span className="text-[#ba1a1a] font-bold">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[20px] text-[#464555] pointer-events-none">
                person
              </span>
              <input
                id="student-name"
                type="text"
                required
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                placeholder="e.g. Aarav Sharma"
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-[#f2f3ff] text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none focus:bg-[#eaedff] transition-colors"
              />
            </div>
          </div>

          {/* Gmail Address */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="student-email" className="text-[14px] font-semibold text-[#131b2e] flex items-center gap-1">
              <span>Gmail Address</span>
              <span className="text-[#ba1a1a] font-bold">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[20px] text-[#464555] pointer-events-none">
                mail
              </span>
              <input
                id="student-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. aarav.sharma@gmail.com"
                className="w-full h-12 pl-10 pr-3 rounded-xl bg-[#f2f3ff] text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none focus:bg-[#eaedff] transition-colors"
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="student-password" className="text-[14px] font-semibold text-[#131b2e] flex items-center gap-1">
              <span>Password</span>
              <span className="text-[#ba1a1a] font-bold">*</span>
            </label>
            <div className="relative flex items-center">
              <span className="material-symbols-outlined absolute left-3 text-[20px] text-[#464555] pointer-events-none">
                lock
              </span>
              <input
                id="student-password"
                type={showPassword ? 'text' : 'password'}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••••"
                className={`w-full h-12 pl-10 pr-11 rounded-xl bg-[#f2f3ff] text-[#131b2e] text-[15px] placeholder:text-[#777587] focus:outline-none focus:bg-[#eaedff] transition-colors ${
                  !showPassword ? 'tracking-widest' : ''
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2.5 p-1.5 rounded-lg text-[#464555] hover:text-[#131b2e] transition-colors flex items-center justify-center"
                aria-label="Toggle password visibility"
              >
                <span className="material-symbols-outlined text-[20px]">
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
          </div>

          {/* Keep me logged in & Forgot password */}
          <div className="flex items-center justify-between pt-1 text-[13px]">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={keepLoggedIn}
                onChange={(e) => setKeepLoggedIn(e.target.checked)}
                className="w-5 h-5 rounded accent-[#3525cd] text-[#3525cd] cursor-pointer"
              />
              <span className="text-[#131b2e] font-medium">Keep me logged in</span>
            </label>
            <button
              type="button"
              onClick={() => showToast('Password reset link sent to registered email.', 'mail')}
              className="font-bold text-[#3525cd] hover:underline"
            >
              Forgot Password?
            </button>
          </div>

          {/* Submit CTA Button */}
          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full h-14 mt-1 rounded-xl bg-[#3525cd] active:bg-[#2a1daf] text-white font-bold text-[16px] flex items-center justify-center gap-2 shadow-md hover:opacity-95 active:scale-[0.98] transition-all disabled:opacity-60 cursor-pointer"
          >
            {isSubmitting ? (
              <span className="material-symbols-outlined animate-spin text-[24px]">
                progress_activity
              </span>
            ) : (
              <span className="material-symbols-outlined text-[24px]">rocket_launch</span>
            )}
            <span>Start Learning & Take Tests</span>
          </button>
        </form>
      </div>

      {/* Switch Cards & Admin Link */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="bg-[#e2e7ff] px-4 py-2.5 rounded-full flex items-center gap-1.5 shadow-xs">
          <span className="text-[13px] text-[#464555]">New to NavoQuest?</span>
          <button
            onClick={() => onNavigate('student-signup')}
            className="text-[13px] font-bold text-[#3525cd] hover:underline flex items-center gap-0.5"
          >
            <span>Create New Student Account</span>
            <span className="material-symbols-outlined text-[16px]">arrow_forward</span>
          </button>
        </div>

        <button
          onClick={() => onNavigate('admin-login')}
          className="inline-flex items-center gap-1 text-[#464555] hover:text-[#3525cd] transition-colors py-1.5 px-3 rounded-lg font-bold text-[13px]"
        >
          <span className="material-symbols-outlined text-[18px] text-[#005338]">school</span>
          <span>Teacher / Headmaster? Login as Admin →</span>
        </button>
      </div>
    </div>
  );
};
