import { createClient } from '@supabase/supabase-js';
import { getLiveQuestions } from './pdfExtractor';

const metaEnv = (import.meta as unknown as { env: Record<string, string | undefined> }).env || {};
const supabaseUrl = metaEnv.VITE_SUPABASE_URL || '';
const supabaseAnonKey = metaEnv.VITE_SUPABASE_ANON_KEY || '';

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

// Helper function to save quiz submission to Supabase or localStorage fallback
export async function recordQuizSubmissionToDB(submission: {
  studentEmail: string;
  questionId: number;
  selectedOption: string;
  isCorrect: boolean;
  scoreDelta: number;
}) {
  const timestamp = new Date().toISOString();
  
  if (supabase) {
    try {
      const { error } = await supabase.from('quiz_submissions').insert([
        {
          student_email: submission.studentEmail,
          question_id: submission.questionId,
          selected_option: submission.selectedOption,
          is_correct: submission.isCorrect,
          score_delta: submission.scoreDelta,
          submitted_at: timestamp,
        },
      ]);
      if (error) {
        console.warn('Supabase submission warning:', error.message);
      }
    } catch (e) {
      console.warn('Supabase DB call caught error:', e);
    }
  }

  // Always sync to local storage for local offline resilience
  try {
    const existing = JSON.parse(localStorage.getItem('navoquest_submissions') || '[]');
    existing.push({ ...submission, submittedAt: timestamp });
    localStorage.setItem('navoquest_submissions', JSON.stringify(existing));
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('navoquest_submission_updated'));
    }
  } catch (e) {
    console.error('Failed to update local storage submission', e);
  }
}

// Helper function to record a newly registered student
export async function registerStudentToDB(student: {
  name: string;
  email: string;
  password?: string;
  section?: string;
}) {
  const newStudent = {
    id: `std_${Date.now()}`,
    name: student.name,
    email: student.email,
    password: student.password || 'password123',
    section: student.section || 'Sec 6-A',
    rollNo: Math.floor(Math.random() * 50) + 1,
    testsDone: 0,
    solvedCount: 0,
    unsolvedCount: getLiveQuestions().length,
    accuracy: 0,
    lastActive: 'Just registered',
    status: 'Active' as const,
    avatarInitials: student.name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase(),
  };

  if (supabase) {
    try {
      await supabase.from('students').insert([
        {
          id: newStudent.id,
          name: newStudent.name,
          email: newStudent.email,
          section: newStudent.section,
          roll_no: newStudent.rollNo,
          tests_done: 0,
          accuracy: 0,
        },
      ]);
    } catch (e) {
      console.warn('Supabase student insertion error:', e);
    }
  }

  // Local storage backup
  try {
    const existing = JSON.parse(localStorage.getItem('navoquest_students') || '[]');
    // Filter out duplicate email if exists
    const filtered = existing.filter((s: { email: string }) => s.email.toLowerCase() !== student.email.toLowerCase());
    filtered.unshift(newStudent);
    localStorage.setItem('navoquest_students', JSON.stringify(filtered));
  } catch (e) {
    console.error('Local storage write error:', e);
  }

  return newStudent;
}
