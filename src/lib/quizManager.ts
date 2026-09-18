import { Question, Quiz } from '../types';
import { getLiveQuestions } from './pdfExtractor';

const QUIZZES_STORAGE_KEY = 'navoquest_quizzes';

/**
 * Clean a string into an ID-safe slug
 */
export function slugify(text: string): string {
  return (text || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Generate a derived fallback Quiz ID for questions that don't have one
 */
export function getDerivedQuizId(q: Question): string {
  if (q.quizId) return q.quizId;
  const subSlug = slugify(q.subtopic || q.topic || 'default');
  return `quiz_${subSlug}_1`;
}

/**
 * Generate a derived fallback Quiz Title for questions that don't have one
 */
export function getDerivedQuizTitle(q: Question, quizNumber: number = 1): string {
  if (q.quizTitle) return q.quizTitle;
  return `Quiz ${quizNumber}`;
}

/**
 * Load stored quizzes metadata from localStorage
 */
export function getStoredQuizzes(): Quiz[] {
  try {
    const raw = localStorage.getItem(QUIZZES_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed;
      }
    }
  } catch (e) {
    console.error('Error reading navoquest_quizzes:', e);
  }
  return [];
}

/**
 * Save quizzes metadata to localStorage and notify listeners
 */
export function saveStoredQuizzes(quizzes: Quiz[]): void {
  try {
    localStorage.setItem(QUIZZES_STORAGE_KEY, JSON.stringify(quizzes));
    window.dispatchEvent(new Event('navoquest_quizzes_updated'));
  } catch (e) {
    console.error('Error saving navoquest_quizzes:', e);
  }
}

/**
 * Get all quizzes across the whole application, synthesized from live questions
 * and stored quiz registry.
 */
export function getAllQuizzes(): Quiz[] {
  const allQuestions = getLiveQuestions();
  const storedQuizzes = getStoredQuizzes();
  const storedMap = new Map<string, Quiz>();
  storedQuizzes.forEach((sq) => storedMap.set(sq.id, sq));

  // Group questions by quiz ID
  const grouped = new Map<string, Question[]>();
  allQuestions.forEach((q) => {
    const qzId = q.quizId || getDerivedQuizId(q);
    if (!grouped.has(qzId)) {
      grouped.set(qzId, []);
    }
    grouped.get(qzId)!.push(q);
  });

  const result: Quiz[] = [];

  grouped.forEach((qs, qzId) => {
    const sample = qs[0];
    const stored = storedMap.get(qzId);

    // Calculate subtopic quiz number
    const subtopic = sample.subtopic || sample.topic || 'General Concepts';
    const topic = sample.topic || 'General Topic';
    const section = sample.section || 'General Studies';

    const quiz: Quiz = {
      id: qzId,
      title: stored?.title || sample.quizTitle || `Quiz: ${subtopic}`,
      quizNumber: stored?.quizNumber || 1,
      section: stored?.section || section,
      topic: stored?.topic || topic,
      subtopic: stored?.subtopic || subtopic,
      sourceFile: stored?.sourceFile || sample.sourceFile,
      createdAt: stored?.createdAt || 'Active',
      questionCount: qs.length,
    };

    result.push(quiz);
  });

  return result;
}

/**
 * Get all quizzes belonging to a specific subtopic
 * Each uploaded PDF under this subtopic creates another Quiz item here!
 */
export function getQuizzesForSubtopic(
  subtopic: string,
  topic?: string,
  subject?: string
): Quiz[] {
  const allQuizzes = getAllQuizzes();
  const cleanSub = subtopic.trim().toLowerCase();

  const filtered = allQuizzes.filter((q) => {
    const matchSub = (q.subtopic || '').trim().toLowerCase() === cleanSub;
    if (!matchSub) return false;
    if (topic && q.topic && q.topic.trim().toLowerCase() !== topic.trim().toLowerCase()) {
      return false;
    }
    if (subject && q.section && q.section.trim().toLowerCase() !== subject.trim().toLowerCase()) {
      return false;
    }
    return true;
  });

  // Sort by quizNumber ascending
  filtered.sort((a, b) => a.quizNumber - b.quizNumber);

  // If no quizzes found in registry but questions exist for this subtopic,
  // ensure at least 1 default Quiz is returned
  if (filtered.length === 0) {
    const allQuestions = getLiveQuestions();
    const matchingQs = allQuestions.filter(
      (q) => (q.subtopic || q.topic)?.trim().toLowerCase() === cleanSub
    );

    if (matchingQs.length > 0) {
      return [
        {
          id: `quiz_${slugify(subtopic)}_1`,
          title: `Quiz 1: ${subtopic}`,
          quizNumber: 1,
          section: subject || matchingQs[0].section || 'General',
          topic: topic || matchingQs[0].topic || 'General',
          subtopic: subtopic,
          questionCount: matchingQs.length,
          createdAt: 'Initial Question Bank',
        },
      ];
    }
  }

  // Ensure sequential quiz numbers if needed
  return filtered.map((q, idx) => ({
    ...q,
    quizNumber: q.quizNumber || idx + 1,
  }));
}

/**
 * Calculate the next quiz details for an upcoming PDF upload under a subtopic
 */
export function getNextQuizSlot(
  subtopic: string,
  topic: string,
  subject: string,
  fileName?: string
): {
  quizId: string;
  quizNumber: number;
  defaultTitle: string;
} {
  const existingQuizzes = getQuizzesForSubtopic(subtopic, topic, subject);
  const quizNumber = existingQuizzes.length + 1;

  const cleanName = fileName
    ? fileName.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim()
    : '';

  const defaultTitle = cleanName
    ? `Quiz ${quizNumber}: ${cleanName}`
    : `Quiz ${quizNumber}`;

  const timestamp = Date.now();
  const subSlug = slugify(subtopic);
  const quizId = `quiz_${subSlug}_${timestamp}`;

  return {
    quizId,
    quizNumber,
    defaultTitle,
  };
}

/**
 * Save new questions as an independent quiz.
 * Keeps existing questions and appends the new quiz's questions,
 * ensuring each PDF is added as another quiz instead of inflating question counts!
 */
export function saveExtractedQuestionsAsQuiz(
  newQuestions: Question[],
  quizMeta: {
    quizId: string;
    quizTitle: string;
    quizNumber: number;
    subjectCategory: string;
    targetTopic: string;
    subtopic: string;
    fileName: string;
  }
): { questions: Question[]; quiz: Quiz } {
  const currentQuestions = getLiveQuestions();

  // Determine starting ID for new questions
  let maxId = 0;
  currentQuestions.forEach((q) => {
    if (q.id > maxId) maxId = q.id;
  });

  // Prepare stamped questions for this specific quiz
  const stampedQuestions: Question[] = newQuestions.map((q, idx) => ({
    ...q,
    id: maxId + idx + 1,
    quizId: quizMeta.quizId,
    quizTitle: quizMeta.quizTitle,
    sourceFile: quizMeta.fileName,
    section: quizMeta.subjectCategory,
    topic: quizMeta.targetTopic,
    subtopic: quizMeta.subtopic,
  }));

  // Combine: existing questions + new quiz questions
  // (If this exact quizId was previously saved, replace its questions)
  const otherQuestions = currentQuestions.filter((q) => q.quizId !== quizMeta.quizId);
  const updatedQuestions = [...otherQuestions, ...stampedQuestions];

  // Save updated questions
  try {
    localStorage.setItem('navoquest_questions', JSON.stringify(updatedQuestions));
    window.dispatchEvent(new Event('navoquest_questions_updated'));
  } catch (e) {
    console.error('Error saving navoquest_questions:', e);
  }

  // Create and save Quiz metadata in registry
  const newQuiz: Quiz = {
    id: quizMeta.quizId,
    title: quizMeta.quizTitle,
    quizNumber: quizMeta.quizNumber,
    section: quizMeta.subjectCategory,
    topic: quizMeta.targetTopic,
    subtopic: quizMeta.subtopic,
    sourceFile: quizMeta.fileName,
    createdAt: new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }),
    questionCount: stampedQuestions.length,
  };

  const storedQuizzes = getStoredQuizzes();
  const otherQuizzes = storedQuizzes.filter((qz) => qz.id !== quizMeta.quizId);
  const updatedQuizzes = [...otherQuizzes, newQuiz];
  saveStoredQuizzes(updatedQuizzes);

  return { questions: updatedQuestions, quiz: newQuiz };
}

/**
 * Get solved count for a specific Quiz by a student
 */
export function getQuizSolvedCount(
  quizId: string,
  userSubmissions: { questionId: number }[]
): { solved: number; total: number } {
  const allQuestions = getLiveQuestions();
  const quizQuestions = allQuestions.filter(
    (q) => (q.quizId || getDerivedQuizId(q)) === quizId
  );

  const total = quizQuestions.length;
  if (total === 0 || !userSubmissions.length) {
    return { solved: 0, total };
  }

  const qIds = new Set(quizQuestions.map((q) => q.id));
  const solvedSet = new Set<number>();
  userSubmissions.forEach((s) => {
    if (qIds.has(s.questionId)) {
      solvedSet.add(s.questionId);
    }
  });

  return { solved: solvedSet.size, total };
}
