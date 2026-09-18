import * as pdfjsLib from 'pdfjs-dist';
import { Question, QuestionOption } from '../types';
import { MOCK_QUESTIONS } from '../data/mockData';

// Configure pdfjs worker with fallback
if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
  } catch {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }
}

export interface ExtractedPDFResult {
  fileName: string;
  rawText: string;
  questions: Question[];
  questionsFound: number;
}

/**
 * Helper to determine if a text item in PDF.js was rendered in a bold font, bold weight, or black/heavy variant
 */
export function isFontBold(item: any, styles: Record<string, any>): boolean {
  if (!item) return false;

  const fontName = (item.fontName || '').toString();
  const fontNameLower = fontName.toLowerCase();

  // Comprehensive font name regex for bold, black, heavy, semibold, and bold weights (W6-W9, 700-900)
  const boldPattern = /(?:bold|black|heavy|demi|semibold|semi-bold|w[6-9]|700|800|900|\-b$|\-bd$|\+b$|\,b$|\_b$)/i;

  if (boldPattern.test(fontNameLower)) {
    return true;
  }

  // Check textContent.styles dictionary (where PDF.js maps font families and loaded names)
  const style = styles?.[item.fontName];
  if (style) {
    const fontFamily = (style.fontFamily || '').toString().toLowerCase();
    if (boldPattern.test(fontFamily)) {
      return true;
    }
    if (style.fontSubstitutionLoadedName && boldPattern.test(style.fontSubstitutionLoadedName.toLowerCase())) {
      return true;
    }
    if (style.fontSubstitution && boldPattern.test(style.fontSubstitution.toLowerCase())) {
      return true;
    }
    if (style.fontName && boldPattern.test(style.fontName.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Extract text from uploaded PDF file using pdfjs-dist with vertical coordinate,
 * column-aware layout reconstruction, and accurate bold font weight tagging.
 * Optimized for large exam papers containing 500+ questions across 50+ pages.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdfDoc = await loadingTask.promise;

    let fullText = '';
    const totalPages = pdfDoc.numPages;

    for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: 1.0 });
        const pageWidth = viewport.width;

        const textContent = await page.getTextContent();
        const styles = textContent.styles || {};

        // Extract raw text items with spatial coordinates and bold styling
        interface TextItemData {
          str: string;
          x: number;
          y: number;
          width: number;
          height: number;
          isBold: boolean;
          fontName: string;
        }

        const items: TextItemData[] = [];
        for (const item of textContent.items as any[]) {
          const str = (item.str || '').trim();
          if (!str) continue;
          const x = item.transform ? item.transform[4] : 0;
          const y = item.transform ? item.transform[5] : 0;
          const width = item.width || 0;
          const height = item.height || 0;
          const isBold = isFontBold(item, styles);

          items.push({
            str: item.str,
            x,
            y,
            width,
            height,
            isBold,
            fontName: item.fontName || '',
          });
        }

        if (items.length === 0) continue;

        // Two-column layout detection based on item centers
        const midX = pageWidth / 2;
        let leftCount = 0;
        let rightCount = 0;

        for (const it of items) {
          const centerX = it.x + it.width / 2;
          if (centerX < midX - 20) {
            leftCount++;
          } else if (centerX > midX + 20) {
            rightCount++;
          }
        }

        const isTwoColumn = leftCount > 8 && rightCount > 8;

        const processItemList = (list: TextItemData[]): string => {
          // Sort items top-to-bottom (Y descending), then left-to-right (X ascending)
          list.sort((a, b) => {
            const yDiff = b.y - a.y;
            if (Math.abs(yDiff) > 6) {
              return yDiff;
            }
            return a.x - b.x;
          });

          // Group into lines by Y coordinate (using 6px tolerance to prevent splitting bold text)
          const lines: TextItemData[][] = [];
          let currentLine: TextItemData[] = [];
          let currentY: number | null = null;

          for (const it of list) {
            if (currentY === null || Math.abs(currentY - it.y) <= 6) {
              currentLine.push(it);
              if (currentY === null) currentY = it.y;
            } else {
              if (currentLine.length > 0) {
                currentLine.sort((a, b) => a.x - b.x);
                lines.push(currentLine);
              }
              currentLine = [it];
              currentY = it.y;
            }
          }
          if (currentLine.length > 0) {
            currentLine.sort((a, b) => a.x - b.x);
            lines.push(currentLine);
          }

          // Convert lines of items to strings, accurately preserving bold segments with markdown **
          return lines
            .map((lineItems) => {
              let lineStr = '';
              let inBold = false;

              for (let i = 0; i < lineItems.length; i++) {
                const cur = lineItems[i];
                const hasGap = i > 0 && cur.x - (lineItems[i - 1].x + lineItems[i - 1].width) > 2;
                const curBold = cur.isBold && cur.str.trim().length > 0;

                if (curBold) {
                  if (!inBold) {
                    if (hasGap) lineStr += ' ';
                    lineStr += '**' + cur.str;
                    inBold = true;
                  } else {
                    if (hasGap) lineStr += ' ';
                    lineStr += cur.str;
                  }
                } else {
                  if (inBold) {
                    lineStr += '**';
                    inBold = false;
                  }
                  if (hasGap) lineStr += ' ';
                  lineStr += cur.str;
                }
              }

              if (inBold) {
                lineStr += '**';
              }

              return lineStr.trim();
            })
            .filter(Boolean)
            .join('\n');
        };

        let pageText = '';
        if (isTwoColumn) {
          // Identify headers spanning across both columns (e.g. section title)
          const headerItems = items.filter(
            (it) => it.width > pageWidth * 0.55 || (it.x < midX - 30 && it.x + it.width > midX + 30)
          );
          const headerSet = new Set(headerItems);
          const columnItems = items.filter((it) => !headerSet.has(it));

          // Split remaining items by center point so NO items are dropped
          const leftItems = columnItems.filter((it) => it.x + it.width / 2 < midX);
          const rightItems = columnItems.filter((it) => it.x + it.width / 2 >= midX);

          const headerText = headerItems.length > 0 ? processItemList(headerItems) + '\n' : '';
          const leftText = processItemList(leftItems);
          const rightText = processItemList(rightItems);
          pageText = `${headerText}${leftText}\n${rightText}`;
        } else {
          pageText = processItemList(items);
        }

        fullText += `\n--- Page ${pageNum} ---\n${pageText}\n`;
      } catch (pageErr) {
        console.warn(`Warning: failed to parse page ${pageNum}:`, pageErr);
      }
    }

    return fullText;
  } catch (err) {
    console.error('PDF text extraction error:', err);
    return '';
  }
}

/**
 * Score the amount of bold characters or bold emphasis in a string
 */
export function extractBoldScore(str: string): number {
  if (!str) return 0;
  let score = 0;

  // Markdown **bold** matches
  const boldMatches = str.match(/\*\*([^*]+)\*\*/g);
  if (boldMatches) {
    for (const m of boldMatches) {
      score += m.replace(/\*/g, '').trim().length;
    }
  }

  // HTML <b> or <strong> tags
  const htmlBold = str.match(/<(?:b|strong)>([\s\S]*?)<\/(?:b|strong)>/gi);
  if (htmlBold) {
    for (const m of htmlBold) {
      score += m.replace(/<[^>]+>/g, '').trim().length;
    }
  }

  // Underlined answer markers __answer__
  const underlineBold = str.match(/__([^_]+)__/g);
  if (underlineBold) {
    for (const m of underlineBold) {
      score += m.replace(/_/g, '').trim().length;
    }
  }

  // Explicit bold option prefix bonus like **(B)**, **B.**, or (B)*
  if (/^\s*(?:\*{1,2}|<b[^>]*>)\s*[\(\[]?[A-Da-d1-4][\)\.\]\:]/i.test(str)) {
    score += 15;
  }
  if (/[\(\[][A-Da-d1-4][\)\]]\s*(?:\*|\[CORRECT\]|\(CORRECT\))/i.test(str)) {
    score += 20;
  }

  return score;
}

/**
 * Strip bold/formatting markup so student-facing text displays clean
 */
export function cleanBoldMarkup(str: string): string {
  if (!str) return '';
  return str
    .replace(/\*\*([^*]*)\*\*/g, '$1')
    .replace(/\*\*/g, '')
    .replace(/<(?:\/)?(?:b|strong)[^>]*>/gi, '')
    .replace(/__([^_]*)__/g, '$1')
    .replace(/__/g, '')
    .trim();
}

/**
 * Helper to parse multiple inline options on a single line (e.g., (A) 12 (B) 24 (C) 36 (D) 48)
 */
interface ParsedOptionData {
  id: 'A' | 'B' | 'C' | 'D';
  text: string;
  isBold: boolean;
  boldScore: number;
}

export function extractInlineOptions(line: string): ParsedOptionData[] {
  const tokenRegex = /(?:^|\s+)(?:\*{1,2})?(?:[\(\[]([A-Da-d1-4]|(?:[ivxIVX]+))[\)\]]|([A-Da-d1-4])[\.\)])(?:\*{1,2})?\s*/g;
  const matches: Array<{ id: 'A' | 'B' | 'C' | 'D'; index: number; length: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = tokenRegex.exec(line)) !== null) {
    const rawId = m[1] || m[2];
    matches.push({
      id: normalizeOptionId(rawId),
      index: m.index,
      length: m[0].length,
    });
  }

  if (matches.length < 2) return [];

  const options: ParsedOptionData[] = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const start = cur.index + cur.length;
    const end = i + 1 < matches.length ? matches[i + 1].index : line.length;
    const rawSegment = line.substring(cur.index, end).trim();
    const rawText = line.substring(start, end).trim();

    const boldScore = extractBoldScore(rawSegment);
    const isBold = boldScore > 0 || rawSegment.includes('**') || rawSegment.includes('<b>');
    const cleanText = cleanBoldMarkup(rawText);

    if (cleanText) {
      options.push({
        id: cur.id,
        text: cleanText,
        isBold,
        boldScore,
      });
    }
  }

  return options;
}

/**
 * Convert option identifier to standard 'A' | 'B' | 'C' | 'D'
 */
export function normalizeOptionId(raw: string | number): 'A' | 'B' | 'C' | 'D' {
  const clean = String(raw).trim().toUpperCase();
  if (clean === '1' || clean === 'A' || clean === 'I') return 'A';
  if (clean === '2' || clean === 'B' || clean === 'II') return 'B';
  if (clean === '3' || clean === 'C' || clean === 'III') return 'C';
  if (clean === '4' || clean === 'D' || clean === 'IV') return 'D';
  if (['A', 'B', 'C', 'D'].includes(clean)) return clean as 'A' | 'B' | 'C' | 'D';
  return 'A';
}

/**
 * Validate whether a question object represents a genuine MCQ question
 */
export function isRealQuestion(q: Question): boolean {
  if (!q || !q.prompt || q.prompt.trim().length < 6) return false;

  const promptLower = q.prompt.toLowerCase().trim();

  // Junk header keywords that indicate non-question text
  const junkHeaderKeywords = [
    'table of contents',
    'time allowed:',
    'maximum marks:',
    'general instructions',
    'candidate must write',
    'roll number here',
    'do not open the booklet',
    'invigilator signature',
    'this paper contains',
    'page 1 of',
    'all rights reserved',
  ];

  if (junkHeaderKeywords.some((kw) => promptLower.startsWith(kw))) {
    return false;
  }

  // Must have at least 2 non-empty options
  const validOptions = (q.options || []).filter((opt) => opt && opt.text && opt.text.trim().length > 0);
  return validOptions.length >= 2;
}

/**
 * Parse extracted text into structured Question objects supporting 100+ questions,
 * automatically identifying the correct option by detecting bold formatting in the PDF.
 */
export function parseQuestionsFromText(
  text: string,
  subjectCategory: string = 'Arithmetic Section',
  topic: string = 'Extracted Practice',
  subtopic: string = 'PDF Questions',
  quizId?: string,
  quizTitle?: string,
  sourceFile?: string
): Question[] {
  if (!text || text.trim().length === 0) return [];

  let startId = 1;
  try {
    const existingQuestions = getLiveQuestions();
    if (existingQuestions.length > 0) {
      startId = Math.max(...existingQuestions.map((q) => q.id)) + 1;
    }
  } catch {
    startId = 16;
  }

  const parsedQuestions: Question[] = [];

  // Pass 1: Parse Answer Key table if present (only near the end of text; DO NOT truncate mainText!)
  const answerKeyMap: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
  const akMatch = text.match(/(?:ANSWER\s*KEY|ANSWERS\s*KEY|ANSWER\s*SHEET)([\s\S]*)$/i);
  if (akMatch && akMatch.index !== undefined && akMatch.index > text.length * 0.7) {
    const akText = akMatch[1];
    const pairRegex = /(?:Q\.?\s*)?(\d{1,4})\s*[:\-\.\)]\s*[\(\[]?([A-Da-d1-4ivxIVX]+)[\)\]]?/g;
    let pm: RegExpExecArray | null;
    while ((pm = pairRegex.exec(akText)) !== null) {
      const qNum = parseInt(pm[1], 10);
      answerKeyMap[qNum] = normalizeOptionId(pm[2]);
    }
  }

  // Pass 2: Clean lines
  const lines = text
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(
      (l) =>
        l.length > 0 &&
        !l.match(/^--- Page \d+ ---$/i) &&
        !l.match(/^(?:page\s*\d+\s*of\s*\d+|time\s*allowed|max\s*marks|maximum\s*marks|total\s*questions)/i)
    );

  // Helper patterns for options and answers
  const singleOptRegex = /^\s*(?:\*{1,2})?\s*[\(\[]?([A-Da-d1-4]|[ivxIVX]+)[\)\.\]\:]\s*(?:\*{1,2})?\s*(.*)/i;
  const ansRegex = /^(?:Ans(?:wer)?|Correct(?:\s*Option)?|Key|Solution)\s*[:\=\-]?\s*[\(\[]?([A-Da-d1-4]|[ivxIVX]+)[\)\.\]]?/i;

  interface CurrentQuestionState {
    qNum: number;
    prompt: string;
    options: ParsedOptionData[];
    correctAnswer: 'A' | 'B' | 'C' | 'D';
    explanation: string;
  }

  let curQ: CurrentQuestionState | null = null;

  const isQuestionStartLine = (line: string, current: CurrentQuestionState | null): { qNum: number; prompt: string } | null => {
    const trimmed = line.trim();
    if (!trimmed) return null;

    // Explicit question prefix: Q1, Q.1, Question 1, Que 1, Q.No. 1
    const qPref = trimmed.match(/^(?:Q(?:uestion|ue)?\.?(?:\s*No\.?)?|\bQ\b)\s*(\\d{1,4})[\:\.\)\-\s]\s*(.*)/i);
    if (qPref) {
      return { qNum: parseInt(qPref[1], 10), prompt: qPref[2].trim() };
    }

    // Bracketed number: (1) or [1]
    const brk = trimmed.match(/^[\(\[]\s*(\d{1,4})\s*[\)\]][\:\.\-\s]?\s*(.*)/);
    if (brk) {
      const num = parseInt(brk[1], 10);
      // If we already have a question open, and num is 1..4 and not next in sequence, it's an option like (1)
      if (current && num <= 4 && num !== current.qNum + 1) {
        return null;
      }
      if (!current || (current && num === current.qNum + 1) || num >= 5 || brk[2].includes('?') || brk[2].length > 35) {
        return { qNum: num, prompt: brk[2].trim() };
      }
    }

    // Numbered start: 1., 1), 1:, 1 -
    const numMatch = trimmed.match(/^(\d{1,4})[\.\)\:\-]\s+(.*)/);
    if (numMatch) {
      const num = parseInt(numMatch[1], 10);
      const rest = numMatch[2].trim();
      // If current question open, and num <= 4 and not next in sequence, it's an option like 1., 2.
      if (current && num <= 4 && num !== current.qNum + 1) {
        return null;
      }
      if (!current || (current && num === current.qNum + 1) || num >= 5 || rest.includes('?') || rest.length > 35) {
        return { qNum: num, prompt: rest };
      }
    }

    return null;
  };

  const finalizeCurrentQuestion = () => {
    if (!curQ) return;
    if (curQ.prompt.trim().length > 0) {
      // Check if options are embedded inside prompt (e.g., inline options on the prompt line)
      if (curQ.options.length < 2) {
        const inlineInPrompt = extractInlineOptions(curQ.prompt);
        if (inlineInPrompt.length >= 2) {
          const firstOptIndex = curQ.prompt.search(/(?:^|\s+)(?:\*{1,2})?[\(\[][A-Da-d1-4][\)\]]/);
          if (firstOptIndex > 0) {
            curQ.prompt = curQ.prompt.substring(0, firstOptIndex).trim();
          }
          curQ.options = inlineInPrompt;
        }
      }

      // Ensure 4 complete options exist (fill in Option A..D if missing)
      const optionMap = new Map<'A' | 'B' | 'C' | 'D', ParsedOptionData>();
      curQ.options.forEach((opt) => {
        optionMap.set(opt.id, opt);
      });

      const completeOptions: QuestionOption[] = (['A', 'B', 'C', 'D'] as const).map((id) => {
        const found = optionMap.get(id);
        return {
          id,
          text: found && found.text ? found.text : `Option ${id}`,
          isBold: found ? found.isBold : false,
        };
      });

      // Analyze bold across options for answer evaluation
      const boldOptions = curQ.options.filter((opt) => opt.isBold || opt.boldScore > 0);
      let boldDetectedAnswer: ('A' | 'B' | 'C' | 'D') | null = null;

      if (boldOptions.length === 1) {
        boldDetectedAnswer = boldOptions[0].id;
      } else if (boldOptions.length > 1 && boldOptions.length <= curQ.options.length) {
        const sorted = [...boldOptions].sort((a, b) => b.boldScore - a.boldScore);
        if (sorted[0].boldScore > sorted[1].boldScore) {
          boldDetectedAnswer = sorted[0].id;
        }
      }

      let finalAns: 'A' | 'B' | 'C' | 'D' = curQ.correctAnswer;
      let isBoldDetected = false;

      if (boldDetectedAnswer) {
        finalAns = boldDetectedAnswer;
        isBoldDetected = true;
      } else if (answerKeyMap[curQ.qNum]) {
        finalAns = answerKeyMap[curQ.qNum];
      }

      const cleanPrompt = cleanBoldMarkup(curQ.prompt).trim();

      const q: Question = {
        id: startId++,
        section: subjectCategory || 'Arithmetic Section',
        topic: topic || 'Exam Questions',
        subtopic: subtopic || 'Practice Drill',
        quizId: quizId,
        quizTitle: quizTitle,
        sourceFile: sourceFile,
        marks: 1.25,
        prompt: cleanPrompt,
        options: completeOptions,
        correctAnswer: finalAns,
        boldAnswerDetected: isBoldDetected,
        explanation: isBoldDetected
          ? `Option (${finalAns}) is the correct answer (indicated in bold in the PDF question paper).`
          : curQ.explanation ||
            (curQ.correctAnswer && curQ.correctAnswer !== (['A', 'B', 'C', 'D'] as const)[parsedQuestions.length % 4]
              ? `Option (${finalAns}) is the correct answer specified in the question paper.`
              : `Question ${curQ.qNum} extracted from PDF (${topic} - ${subtopic}).`),
      };

      if (isRealQuestion(q)) {
        parsedQuestions.push(q);
      }
    }
    curQ = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Check Answer line (e.g. Ans: B, Correct Option: C, Key: A)
    const ansMatch = line.match(ansRegex);
    if (ansMatch && curQ) {
      curQ.correctAnswer = normalizeOptionId(ansMatch[1]);
      continue;
    }

    // Check Question Start
    const qStart = isQuestionStartLine(line, curQ);
    if (qStart) {
      finalizeCurrentQuestion();

      curQ = {
        qNum: qStart.qNum,
        prompt: qStart.prompt,
        options: [],
        correctAnswer: (['A', 'B', 'C', 'D'] as const)[parsedQuestions.length % 4],
        explanation: '',
      };

      // Check for inline options within qStart.prompt
      const inlineOpts = extractInlineOptions(qStart.prompt);
      if (inlineOpts.length >= 2) {
        const firstOptIndex = qStart.prompt.search(/(?:^|\s+)(?:\*{1,2})?[\(\[][A-Da-d1-4][\)\]]/);
        if (firstOptIndex > 0) {
          curQ.prompt = qStart.prompt.substring(0, firstOptIndex).trim();
        }
        for (const inOpt of inlineOpts) {
          curQ.options.push(inOpt);
        }
      }
      continue;
    }

    if (!curQ) continue;

    // Check if line contains multiple inline options (e.g. (A) 12 (B) 24 (C) 36 (D) 48)
    const inlineOnLine = extractInlineOptions(line);
    if (inlineOnLine.length >= 2) {
      for (const inOpt of inlineOnLine) {
        if (curQ.options.length < 4 && !curQ.options.some((o) => o.id === inOpt.id)) {
          curQ.options.push(inOpt);
        }
      }
      continue;
    }

    // Check single Option line (A), **(B)**, A., **B.**, (1), **(2)**, 1., etc.
    const optMatch = line.match(singleOptRegex);
    if (optMatch && curQ.options.length < 4) {
      const optLetter = normalizeOptionId(optMatch[1]);
      const rawText = optMatch[2] ? optMatch[2].trim() : '';
      const boldScore = extractBoldScore(line);
      const isBold = boldScore > 0 || line.includes('**') || line.includes('<b>');
      const cleanText = cleanBoldMarkup(rawText);

      curQ.options.push({
        id: optLetter,
        text: cleanText || `Option ${optLetter}`,
        isBold,
        boldScore,
      });
      continue;
    }

    // Accumulate into prompt or multi-line option or explanation
    if (curQ.options.length === 0) {
      curQ.prompt += ' ' + line;
    } else if (curQ.options.length > 0 && curQ.options.length <= 4 && !line.match(/^(?:ans|key|solution|explanation)/i)) {
      const lastOpt = curQ.options[curQ.options.length - 1];
      const additionalBoldScore = extractBoldScore(line);
      if (additionalBoldScore > 0) {
        lastOpt.isBold = true;
        lastOpt.boldScore += additionalBoldScore;
      }
      lastOpt.text += ' ' + cleanBoldMarkup(line);
    } else {
      curQ.explanation += (curQ.explanation ? ' ' : '') + cleanBoldMarkup(line);
    }
  }

  finalizeCurrentQuestion();

  // Robust secondary chunk recovery if fewer questions were extracted
  if (parsedQuestions.length < 5) {
    const rawChunks = text
      .replace(/--- Page \d+ ---/g, '\n')
      .split(/(?=(?:^|\n)\s*(?:Q(?:uestion|ue)?\.?\s*\d{1,4}|\d{1,4}[\.\)\:\-]\s+))/gi)
      .map((c) => c.trim())
      .filter((c) => c.length > 25);

    if (rawChunks.length > parsedQuestions.length) {
      const recoveredQuestions: Question[] = [];
      rawChunks.forEach((chunk, idx) => {
        const linesInChunk = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
        if (linesInChunk.length === 0) return;

        const firstLine = linesInChunk[0].replace(/^(?:Q(?:uestion|ue)?\.?\s*\d{1,4}|\d{1,4}[\.\)\:\-]\s*)/i, '').trim();
        let promptText = firstLine;
        const optionsInChunk: ParsedOptionData[] = [];

        for (let li = 1; li < linesInChunk.length; li++) {
          const l = linesInChunk[li];
          const inline = extractInlineOptions(l);
          if (inline.length >= 2) {
            optionsInChunk.push(...inline);
            continue;
          }
          const optM = l.match(singleOptRegex);
          if (optM && optionsInChunk.length < 4) {
            optionsInChunk.push({
              id: normalizeOptionId(optM[1]),
              text: cleanBoldMarkup(optM[2]) || `Option ${optM[1]}`,
              isBold: l.includes('**') || extractBoldScore(l) > 0,
              boldScore: extractBoldScore(l),
            });
            continue;
          }
          if (optionsInChunk.length === 0) {
            promptText += ' ' + l;
          }
        }

        const boldOpts = optionsInChunk.filter((o) => o.isBold);
        const finalAns = boldOpts.length >= 1 ? boldOpts[0].id : (['A', 'B', 'C', 'D'] as const)[idx % 4];

        const completeOpts: QuestionOption[] = (['A', 'B', 'C', 'D'] as const).map((id) => {
          const found = optionsInChunk.find((o) => o.id === id);
          return {
            id,
            text: found && found.text ? found.text : `Option ${id}`,
            isBold: found ? found.isBold : false,
          };
        });

        const cleanPrompt = cleanBoldMarkup(promptText).trim();
        if (cleanPrompt.length >= 5) {
          recoveredQuestions.push({
            id: startId++,
            section: subjectCategory || 'Arithmetic Section',
            topic: topic || 'Exam Questions',
            subtopic: subtopic || 'Practice Drill',
            quizId: quizId,
            quizTitle: quizTitle,
            sourceFile: sourceFile,
            marks: 1.25,
            prompt: cleanPrompt,
            options: completeOpts,
            correctAnswer: finalAns,
            boldAnswerDetected: boldOpts.length >= 1,
            explanation: `Question ${idx + 1} extracted from PDF.`,
          });
        }
      });

      if (recoveredQuestions.length > parsedQuestions.length) {
        return recoveredQuestions;
      }
    }
  }

  return parsedQuestions;
}

/**
 * Retrieve all live questions.
 */
export function getLiveQuestions(): Question[] {
  try {
    const stored = localStorage.getItem('navoquest_questions');
    if (stored) {
      const parsed: Question[] = JSON.parse(stored);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const validParsed = parsed.filter(isRealQuestion);

        // Check if genuine uploaded questions exist
        const mockIds = new Set(MOCK_QUESTIONS.map((m) => m.id));
        const mockPrompts = new Set(MOCK_QUESTIONS.map((m) => m.prompt.trim().toLowerCase()));

        const realUploadedQuestions = validParsed.filter(
          (q) => !mockIds.has(q.id) && !mockPrompts.has(q.prompt.trim().toLowerCase())
        );

        if (realUploadedQuestions.length > 0) {
          if (realUploadedQuestions.length !== parsed.length) {
            localStorage.setItem('navoquest_questions', JSON.stringify(realUploadedQuestions));
            window.dispatchEvent(new Event('navoquest_questions_updated'));
          }
          return realUploadedQuestions;
        }

        if (validParsed.length !== parsed.length) {
          localStorage.setItem('navoquest_questions', JSON.stringify(validParsed));
          window.dispatchEvent(new Event('navoquest_questions_updated'));
        }
        return validParsed;
      }
    }
  } catch (e) {
    console.error('Error reading navoquest_questions:', e);
  }
  return MOCK_QUESTIONS.filter(isRealQuestion);
}

/**
 * Commit newly extracted questions from PDF to local storage live question bank.
 * When uploading several PDFs under the same subtopic, each PDF is added as another quiz
 * without increasing or inflating the question count of existing quizzes.
 */
export function saveExtractedQuestionsToBank(newQuestions: Question[]): Question[] {
  const current = getLiveQuestions();
  const mockIds = new Set(MOCK_QUESTIONS.map((m) => m.id));
  const cleanCurrent = current.filter((q) => !mockIds.has(q.id));

  // Key by quizId + prompt so questions across different quizzes under the same subtopic are never collapsed
  const questionMap = new Map<string, Question>();
  cleanCurrent.forEach((q) => {
    const key = `${q.quizId || 'default'}_${q.prompt.trim().toLowerCase()}`;
    questionMap.set(key, q);
  });

  // Merge new questions: update within same quiz if re-uploaded, or add as new quiz
  newQuestions.filter(isRealQuestion).forEach((newQ) => {
    const key = `${newQ.quizId || 'default'}_${newQ.prompt.trim().toLowerCase()}`;
    questionMap.set(key, newQ);
  });

  // Re-index all questions sequentially
  const updatedList: Question[] = Array.from(questionMap.values()).map((q, idx) => ({
    ...q,
    id: idx + 1,
  }));

  try {
    localStorage.setItem('navoquest_questions', JSON.stringify(updatedList));
    window.dispatchEvent(new Event('navoquest_questions_updated'));
  } catch (e) {
    console.error('Error saving navoquest_questions:', e);
  }
  return updatedList;
}

/**
 * Overwrite question bank completely with newly extracted questions from a PDF
 */
export function resetLiveBankWithQuestions(newQuestions: Question[]): Question[] {
  const updatedList: Question[] = newQuestions.filter(isRealQuestion).map((q, idx) => ({
    ...q,
    id: idx + 1,
  }));

  try {
    localStorage.setItem('navoquest_questions', JSON.stringify(updatedList));
    window.dispatchEvent(new Event('navoquest_questions_updated'));
  } catch (e) {
    console.error('Error resetting navoquest_questions:', e);
  }
  return updatedList;
}
