export type ScreenType = 'student-login' | 'student-signup' | 'admin-login' | 'student-dashboard' | 'practice-quiz' | 'admin-dashboard';

export interface QuestionOption {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  subtext?: string;
}

export interface Question {
  id: number;
  section: string;
  topic: string;
  subtopic: string;
  marks: number;
  prompt: string; // supports HTML or formatted strings
  fractionChips?: string[];
  options: QuestionOption[];
  correctAnswer: 'A' | 'B' | 'C' | 'D';
  explanation?: string;
}

export interface Student {
  id: string;
  name: string;
  email: string;
  password?: string;
  section?: string;
  rollNo?: number;
  rank?: number;
  testsDone: number;
  solvedCount?: number;
  unsolvedCount?: number;
  accuracy: number;
  lastActive: string;
  status: 'Active' | 'Needs Help' | 'Language Ace' | 'Top Performer';
  avatarInitials: string;
}

export interface PDFUpload {
  id: string;
  fileName: string;
  size: string;
  uploadedTime: string;
  questionsFound: number;
  subjectCategory: string;
  targetTopic: string;
  subtopic: string;
  tags: string[];
  status: 'Staged' | 'Committed';
  extractedQuestions?: Question[];
}

export interface TaxonomyItem {
  id: string;
  type: 'Subject' | 'Topic' | 'Subtopic';
  name: string;
  parentName?: string;
  questionCount?: number;
}

export interface QuizFilter {
  subject?: string;
  topic?: string;
  subtopic?: string;
}

export interface QuizSubmission {
  id?: string;
  studentEmail: string;
  questionId: number;
  selectedOption: 'A' | 'B' | 'C' | 'D' | null;
  isCorrect: boolean;
  scoreDelta: number;
  submittedAt: string;
}
