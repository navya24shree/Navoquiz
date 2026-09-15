import { useState } from 'react';
import { ScreenType, QuizFilter } from './types';
import { NavigationHeader } from './components/NavigationHeader';
import { StudentLogin } from './components/StudentLogin';
import { StudentSignup } from './components/StudentSignup';
import { StudentDashboard } from './components/StudentDashboard';
import { AdminLogin } from './components/AdminLogin';
import { PracticeQuiz } from './components/PracticeQuiz';
import { AdminDashboard } from './components/AdminDashboard';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('student-login');
  const [studentName, setStudentName] = useState('Aarav Sharma');
  const [studentEmail, setStudentEmail] = useState('aarav.sharma@gmail.com');
  const [quizFilter, setQuizFilter] = useState<QuizFilter | null>(null);

  const handleNavigate = (screen: ScreenType, filter?: QuizFilter) => {
    if (filter !== undefined) {
      setQuizFilter(filter);
    }
    setCurrentScreen(screen);
  };

  // Toast notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [toastIcon, setToastIcon] = useState<string>('info');

  const showToast = (msg: string, icon: string = 'info') => {
    setToastMessage(msg);
    setToastIcon(icon);
    setTimeout(() => {
      setToastMessage(null);
    }, 2800);
  };

  const handleLoginSuccess = (name: string, email: string) => {
    setStudentName(name);
    setStudentEmail(email);
  };

  return (
    <div className="min-h-screen bg-[#faf8ff] text-[#131b2e] flex flex-col font-['Plus_Jakarta_Sans'] antialiased">
      {/* Navigation Header with Screen Switcher */}
      <NavigationHeader
        currentScreen={currentScreen}
        onNavigate={handleNavigate}
        studentEmail={studentEmail}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 inset-x-4 z-50 max-w-sm mx-auto bg-[#283044] text-[#eef0ff] p-3 rounded-xl shadow-2xl flex items-center gap-2.5 transition-all animate-in slide-in-from-top-4 duration-200">
          <span className="material-symbols-outlined text-[#6ffbbe] text-[20px] flex-shrink-0">
            {toastIcon}
          </span>
          <p className="text-[12px] font-medium leading-tight">
            {toastMessage}
          </p>
        </div>
      )}

      {/* Dynamic Screen View */}
      <main className="flex-1 w-full flex flex-col">
        {currentScreen === 'student-login' && (
          <StudentLogin
            onNavigate={handleNavigate}
            onLoginSuccess={handleLoginSuccess}
            showToast={showToast}
          />
        )}

        {currentScreen === 'student-signup' && (
          <StudentSignup
            onNavigate={handleNavigate}
            onSignupSuccess={handleLoginSuccess}
            showToast={showToast}
          />
        )}

        {currentScreen === 'student-dashboard' && (
          <StudentDashboard
            studentName={studentName}
            studentEmail={studentEmail}
            onNavigate={handleNavigate}
            showToast={showToast}
          />
        )}

        {currentScreen === 'admin-login' && (
          <AdminLogin
            onNavigate={handleNavigate}
            showToast={showToast}
          />
        )}

        {currentScreen === 'practice-quiz' && (
          <PracticeQuiz
            onNavigate={handleNavigate}
            showToast={showToast}
            studentEmail={studentEmail}
            quizFilter={quizFilter}
          />
        )}

        {currentScreen === 'admin-dashboard' && (
          <AdminDashboard
            onNavigate={handleNavigate}
            showToast={showToast}
          />
        )}
      </main>
    </div>
  );
}
