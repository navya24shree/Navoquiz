import * as pdfjsLib from 'pdfjs-dist';
import { Question, QuestionOption } from '../types';
import { MOCK_QUESTIONS } from '../data/mockData';

// Configure pdfjs worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

export interface ExtractedPDFResult {
  fileName: string;
  rawText: string;
  questions: Question[];
  questionsFound: number;
}

/**
 * Extract text from uploaded PDF file using pdfjs-dist with vertical coordinate line-break detection
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    let fullText = '';

    for (let i = 1; i <= pdfDoc.numPages; i++) {
      const page = await pdfDoc.getPage(i);
      const textContent = await page.getTextContent();

      let lastY: number | null = null;
      let pageText = '';

      for (const item of textContent.items as any[]) {
        const currentY = item.transform ? item.transform[5] : null;

        // Detect new lines based on y-position shift
        if (lastY !== null && currentY !== null && Math.abs(currentY - lastY) > 3) {
          pageText += '\n';
        } else if (item.hasEOL) {
          pageText += '\n';
        } else if (pageText.length > 0 && !pageText.endsWith('\n') && !pageText.endsWith(' ')) {
          pageText += ' ';
        }

        pageText += item.str;

        if (currentY !== null) {
          lastY = currentY;
        }
      }

      fullText += `\n--- Page ${i} ---\n` + pageText + '\n';
    }

    return fullText;
  } catch (err) {
    console.error('PDF text extraction error:', err);
    return '';
  }
}

/**
 * Convert option identifier (e.g., '1', '2', '3', '4' or 'a', 'b', 'c', 'd') to standard 'A' | 'B' | 'C' | 'D'
 */
function normalizeOptionId(raw: string): 'A' | 'B' | 'C' | 'D' {
  const clean = raw.trim().toUpperCase();
  if (clean === '1' || clean === 'A') return 'A';
  if (clean === '2' || clean === 'B') return 'B';
  if (clean === '3' || clean === 'C') return 'C';
  if (clean === '4' || clean === 'D') return 'D';
  return 'A';
}

/**
 * Validate whether a question object represents a genuine MCQ question
 * and not document headers, cover page text, or test instructions.
 */
export function isRealQuestion(q: Question): boolean {
  if (!q || !q.prompt || q.prompt.trim().length < 8) return false;

  const promptLower = q.prompt.toLowerCase();

  // Junk header / instruction keywords to ignore
  const junkHeaderKeywords = [
    'level progression',
    'mega test',
    'instructions:',
    'choose the one best answer',
    'no answers are given',
    'part 1 —',
    'part 2 —',
    'part 3 —',
    'hardest →',
    'olympiad challenge',
    'extreme challenge',
    'full practice test',
    'table of contents',
    'page 1 of',
  ];

  if (junkHeaderKeywords.some((kw) => promptLower.includes(kw))) {
    return false;
  }

  // Reject questions containing placeholder choices
  const hasFakeOption = q.options.some((opt) =>
    opt.text.toLowerCase().includes('choice derived from pdf text')
  );

  if (hasFakeOption) {
    return false;
  }

  return true;
}

/**
 * Parse extracted text into structured Question objects supporting 500+ questions
 */
export function parseQuestionsFromText(
  text: string,
  subjectCategory: string = 'Arithmetic Section',
  topic: string = 'Extracted Practice',
  subtopic: string = 'PDF Questions'
): Question[] {
  const existingQuestions = getLiveQuestions();
  let startId = existingQuestions.length > 0
    ? Math.max(...existingQuestions.map((q) => q.id)) + 1
    : 16;

  const parsedQuestions: Question[] = [];

  // Step 1: Preprocess text to format inline options & answer keys onto distinct lines
  let processedText = text
    .replace(/\r\n/g, '\n')
    .replace(/--- Page \d+ ---/g, '\n');

  // Insert newlines before inline options like (A), (B), (C), (D) or (1), (2), (3), (4) or A), B), C), D)
  processedText = processedText.replace(
    /(\s+)([\(\[]?([A-Da-d1-4])[\)\.\:\]])(?=\s+[^\n]+)/g,
    '\n$2 '
  );

  // Insert newlines before Question markers (e.g. Q.1, Q1, Question 1, 1., 100.) avoiding ranges like "1 - 100"
  processedText = processedText.replace(
    /(\s+)(?:Q(?:uestion)?[\.\s]*(\d{1,4})|(\d{1,4})[\.\)])(?!\s*[\-\–\—])(?=\s+[^\n]+)/gi,
    '\nQ.$2$3 '
  );

  // Insert newlines before Answer markers (Ans:, Answer:, Correct Option:)
  processedText = processedText.replace(
    /(\s+)(?:Ans(?:wer)?|Key|Correct\s*Option)[\:\=]?\s*([A-Da-d1-4])/gi,
    '\nAns: $2'
  );

  // Step 2: Split text into lines
  const lines = processedText
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);

  let currentPrompt = '';
  let currentOptions: QuestionOption[] = [];
  let currentCorrect: 'A' | 'B' | 'C' | 'D' = 'A';
  let currentExplanation = '';

  const pushCurrentQuestion = () => {
    // Only push if we have a valid prompt AND at least 2 extracted options
    if (currentPrompt.length > 5 && currentOptions.length >= 2) {
      // Deduplicate options by ID
      const optionMap = new Map<'A' | 'B' | 'C' | 'D', string>();
      currentOptions.forEach((opt) => {
        optionMap.set(opt.id, opt.text);
      });

      const finalOptions: QuestionOption[] = (['A', 'B', 'C', 'D'] as const).map((id) => ({
        id,
        text: optionMap.get(id) || `${id}) Option text not specified`,
      }));

      const candidateQ: Question = {
        id: startId++,
        section: subjectCategory || 'Environmental Studies (EVS)',
        topic: topic || 'The Natural World',
        subtopic: subtopic || 'Extracted Questions',
        marks: 1.25,
        prompt: currentPrompt,
        options: finalOptions,
        correctAnswer: currentCorrect,
        explanation:
          currentExplanation ||
          `Extracted question from uploaded PDF document (${topic} - ${subtopic}).`,
      };

      if (isRealQuestion(candidateQ)) {
        parsedQuestions.push(candidateQ);
      }
    }

    currentPrompt = '';
    currentOptions = [];
    currentCorrect = 'A';
    currentExplanation = '';
  };

  // RegEx matchers for 1-4 digit Question numbers, Options & Answer keys
  const questionRegex = /^(?:Q(?:uestion)?[\.\s]*\d{1,4}|\d{1,4}[\.\)]|\(\d{1,4}\))\s*(.+)/i;
  const optionRegex = /^[\(\[]?([A-Da-d1-4])[\)\.\]\:]\s*(.+)/i;
  const answerRegex = /^(?:Ans(?:wer)?|Correct\s*Option|Key)\s*[:\=]?\s*[\(\[]?([A-Da-d1-4])[\)\.]?/i;

  for (const line of lines) {
    const qMatch = line.match(questionRegex);
    const optMatch = line.match(optionRegex);
    const ansMatch = line.match(answerRegex);

    if (ansMatch) {
      currentCorrect = normalizeOptionId(ansMatch[1]);
      continue;
    }

    if (optMatch) {
      const optId = normalizeOptionId(optMatch[1]);
      const optText = optMatch[2].trim();
      if (optText.length > 0) {
        currentOptions.push({
          id: optId,
          text: optText,
        });
      }
      continue;
    }

    if (qMatch) {
      pushCurrentQuestion();
      currentPrompt = qMatch[1].trim();
      continue;
    }

    // Accumulate into prompt or explanation
    if (currentOptions.length === 0) {
      currentPrompt += (currentPrompt ? ' ' : '') + line;
    } else {
      currentExplanation += (currentExplanation ? ' ' : '') + line;
    }

    // Auto-push if 4 options collected
    if (currentOptions.length === 4) {
      pushCurrentQuestion();
    }
  }

  // Push last question buffer
  pushCurrentQuestion();

  // Fallback if structured question pattern was not recognized (e.g., scanned / continuous paragraph PDF)
  if (parsedQuestions.length === 0) {
    const questionsChunks = text
      .replace(/--- Page \d+ ---/g, '\n')
      .split(/(?=\b\d{1,4}[\.\)]\s+)/g)
      .map((c) => c.trim())
      .filter((c) => c.length > 15);

    if (questionsChunks.length > 0) {
      questionsChunks.forEach((chunk, idx) => {
        const cleanPrompt = chunk.replace(/^\d{1,4}[\.\)]\s*/, '').substring(0, 180);
        parsedQuestions.push({
          id: startId++,
          section: subjectCategory || 'Arithmetic Section',
          topic: topic || 'Extracted Topic',
          subtopic: subtopic || 'PDF Practice',
          marks: 1.25,
          prompt: cleanPrompt.endsWith('?') ? cleanPrompt : cleanPrompt + '?',
          options: [
            { id: 'A', text: `Option A (Extracted Q${idx + 1})` },
            { id: 'B', text: `Option B (Extracted Q${idx + 1})` },
            { id: 'C', text: `Option C (Extracted Q${idx + 1})` },
            { id: 'D', text: `Option D (Extracted Q${idx + 1})` },
          ],
          correctAnswer: (['A', 'B', 'C', 'D'] as const)[idx % 4],
          explanation: `Question ${idx + 1} extracted from PDF document.`,
        });
      });
    }
  }

  return parsedQuestions;
}

/**
 * Retrieve all live questions combining initial mock questions and questions extracted from uploaded PDFs
 */
export function getLiveQuestions(): Question[] {
  try {
    const stored = localStorage.getItem('navoquest_questions');
    if (stored) {
      const parsed: Question[] = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        // Filter out any non-question headers / instructions
        const validParsed = parsed.filter(isRealQuestion);

        // Update local storage if bogus questions were removed
        if (validParsed.length !== parsed.length) {
          localStorage.setItem('navoquest_questions', JSON.stringify(validParsed));
        }

        const storedIds = new Set(validParsed.map((q) => q.id));
        const missingMocks = MOCK_QUESTIONS.filter((q) => !storedIds.has(q.id) && isRealQuestion(q));
        return [...validParsed, ...missingMocks];
      }
    }
  } catch (e) {
    console.error('Error reading navoquest_questions:', e);
  }
  return MOCK_QUESTIONS.filter(isRealQuestion);
}

/**
 * Commit newly extracted questions from PDF to local storage live question bank
 */
export function saveExtractedQuestionsToBank(newQuestions: Question[]): Question[] {
  const current = getLiveQuestions();
  const currentPrompts = new Set(current.map((q) => q.prompt.trim().toLowerCase()));
  const filteredNew = newQuestions.filter(
    (q) => !currentPrompts.has(q.prompt.trim().toLowerCase())
  );

  const updatedList = [...filteredNew, ...current];
  try {
    localStorage.setItem('navoquest_questions', JSON.stringify(updatedList));
  } catch (e) {
    console.error('Error saving navoquest_questions:', e);
  }
  return updatedList;
}
