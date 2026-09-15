import React from 'react';
import { ScreenType } from '../types';

interface HeaderProps {
  currentScreen: ScreenType;
  onNavigate: (screen: ScreenType) => void;
  studentEmail?: string;
}

export const NavigationHeader: React.FC<HeaderProps> = ({
  currentScreen,
  onNavigate,
  studentEmail = 'aarav.sharma@gmail.com',
}) => {
  const getScreenTitle = () => {
    switch (currentScreen) {
      case 'student-login':
        return 'Login';
      case 'student-signup':
        return 'Student Registration';
      case 'student-dashboard':
        return 'Student Dashboard';
      case 'admin-login':
        return 'Admin Portal';
      case 'practice-quiz':
        return 'Practice Quiz';
      case 'admin-dashboard':
        return 'Admin Hub';
      default:
        return 'NavoQuest';
    }
  };

  return (
    <header className="sticky top-0 w-full z-50 pt-safe bg-[#faf8ff]/90 backdrop-blur-xl border-b border-[#eaedff] shadow-[0_1px_8px_rgba(0,0,0,0.04)]">
      {/* Primary Brand Header */}
      <div className="h-16 px-3.5 max-w-5xl mx-auto flex items-center justify-between gap-2">
        <div
          className="flex items-center gap-2 cursor-pointer select-none"
          onClick={() => onNavigate('student-login')}
        >
          {/* NavoQuest Logo Emblem SVG */}
          <div className="w-8 h-8 rounded-xl bg-[#3525cd] flex items-center justify-center text-white shadow-sm flex-shrink-0">
            <span className="material-symbols-outlined text-[20px]" style={{ fontVariationSettings: "'FILL' 1" }}>
              star
            </span>
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-[17px] tracking-tight text-[#3525cd] leading-none">
              NavoQuest
            </span>
            <span className="text-[11px] font-semibold text-[#464555] leading-tight">
              {getScreenTitle()}
            </span>
          </div>
        </div>

        {/* User Profile / Status pill */}
        <div className="flex items-center gap-2">
          {currentScreen === 'admin-dashboard' && (
            <div className="flex items-center gap-1.5 bg-[#f2f3ff] px-2.5 py-1 rounded-full">
              <span className="text-[10px] bg-[#006e4b] text-[#67f4b7] px-1.5 py-0.5 rounded-full font-bold uppercase">
                LIVE
              </span>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
