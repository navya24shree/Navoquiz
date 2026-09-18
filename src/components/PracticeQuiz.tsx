import React, { useState, useEffect } from 'react';
import { Question, ScreenType, QuizFilter } from '../types';
import { getLiveQuestions } from '../lib/pdfExtractor';
import { recordQuizSubmissionToDB } from '../lib/supabase';
import { getDerivedQuizId } from '../lib/quizManager';

interface PracticeQuizProps {
  onNavigate: (screen: ScreenType) => void;
  showToast: (msg: string, icon?: string) => void;
  studentEmail?: string;
  quizFilter?: QuizFilter | null;
}

// Helper to compute initial questions list based on filter
function getInitialQuestions(filter?: QuizFilter | null): Question[] {
  const allQuestions = getLiveQuestions();
  if (!filter || (!filter.quizId && !filter.subtopic && !filter.topic && !filter.subject)) {
    return allQuestions;
  }

  // If a specific quizId is provided, isolate questions strictly to that quiz
  if (filter.quizId) {
    const matching = allQuestions.filter((q) => (q.quizId || getDerivedQuizId(q)) === filter.quizId);
    if (matching.length > 0) return matching;
  }

  // If subtopic is provided, check if questions belong to multiple quizzes
  if (filter.subtopic) {
    const subQuestions = allQuestions.filter(
      (q) => q.subtopic?.trim().toLowerCase() === filter.subtopic!.trim().toLowerCase()
    );
    // If the subtopic has multiple quizzes and no quizId was provided, pick the first quiz
    // to prevent combining separate tests into one giant inflated drill
    const uniqueQuizzes = Array.from(new Set(subQuestions.map((q) => q.quizId || getDerivedQuizId(q))));
    if (uniqueQuizzes.length > 1) {
      return subQuestions.filter((q) => (q.quizId || getDerivedQuizId(q)) === uniqueQuizzes[0]);
    }
    return subQuestions;
  }

  if (filter.topic) {
    return allQuestions.filter(
      (q) => q.topic?.trim().toLowerCase() === filter.topic!.trim().toLowerCase()
    );
  }

  if (filter.subject) {
    return allQuestions.filter(
      (q) => q.section?.trim().toLowerCase() === filter.subject!.trim().toLowerCase()
    );
  }

  return allQuestions;
}

// Helper to load previous submissions
function getInitialSubmissions(studentEmail: string) {
  const prevAnswers: Record<number, 'A' | 'B' | 'C' | 'D'> = {};
  const prevSubmitted: Record<number, boolean> = {};
  try {
    const stored = localStorage.getItem('navoquest_submissions');
    if (stored) {
      const subs = JSON.parse(stored);
      if (Array.isArray(subs)) {
        subs
          .filter((s: any) => !studentEmail || s.studentEmail === studentEmail)
          .forEach((s: any) => {
            if (s.questionId && s.selectedOption) {
              prevAnswers[s.questionId] = s.selectedOption;
              prevSubmitted[s.questionId] = true;
            }
          });
      }
    }
  } catch (e) {
    console.error('Error reading submissions:', e);
  }
  return { prevAnswers, prevSubmitted };
}

// Helper to determine accurate resume index
function calculateResumeIndex(
  questions: Question[],
  prevSubmitted: Record<number, boolean>,
  studentEmail: string
): { index: number; reason: string } {
  if (!questions.length) return { index: 0, reason: '' };

  try {
    const lastActiveKey = `navoquest_last_active_${studentEmail}`;
    const savedActiveStr = localStorage.getItem(lastActiveKey);

    if (savedActiveStr) {
      const savedActive = JSON.parse(savedActiveStr);
      if (savedActive && savedActive.questionId) {
        const matchIdx = questions.findIndex((q) => q.id === savedActive.questionId);
        if (matchIdx !== -1) {
          if (prevSubmitted[savedActive.questionId]) {
            const nextUnsolved = questions.findIndex((q, i) => i > matchIdx && !prevSubmitted[q.id]);
            if (nextUnsolved !== -1) {
              return { index: nextUnsolved, reason: `Resuming at Question ${nextUnsolved + 1}` };
            }
            const anyUnsolved = questions.findIndex((q) => !prevSubmitted[q.id]);
            if (anyUnsolved !== -1) {
              return { index: anyUnsolved, reason: `Resuming at Question ${anyUnsolved + 1}` };
            }
            return { index: matchIdx, reason: `Reviewing Question ${matchIdx + 1}` };
          }
          return { index: matchIdx, reason: `Resuming at Question ${matchIdx + 1}` };
        }
      }
    }
  } catch (e) {
    console.error('Error calculating resume position:', e);
  }

  // If no saved active session or question not found in current drill,
  // check if any questions in this drill were already submitted
  let lastAnsweredIdx = -1;
  for (let i = questions.length - 1; i >= 0; i--) {
    if (prevSubmitted[questions[i]?.id]) {
      lastAnsweredIdx = i;
      break;
    }
  }

  if (lastAnsweredIdx !== -1) {
    const nextUnsolved = questions.findIndex((q, i) => i > lastAnsweredIdx && !prevSubmitted[q.id]);
    if (nextUnsolved !== -1) {
      return { index: nextUnsolved, reason: `Resuming at Question ${nextUnsolved + 1}` };
    }
    const anyUnsolved = questions.findIndex((q) => !prevSubmitted[q.id]);
    if (anyUnsolved !== -1) {
      return { index: anyUnsolved, reason: `Resuming at Question ${anyUnsolved + 1}` };
    }
    return { index: lastAnsweredIdx, reason: `All questions completed` };
  }

  return { index: 0, reason: '' };
}

export const PracticeQuiz: React.FC<PracticeQuizProps> = ({
  onNavigate,
  showToast,
  studentEmail = 'aarav.sharma@gmail.com',
  quizFilter,
}) => {
  const [questionsList, setQuestionsList] = useState<Question[]>(() => getInitialQuestions(quizFilter));
  const [userAnswers, setUserAnswers] = useState<Record<number, 'A' | 'B' | 'C' | 'D'>>(() => getInitialSubmissions(studentEmail).prevAnswers);
  const [submittedQuestions, setSubmittedQuestions] = useState<Record<number, boolean>>(() => getInitialSubmissions(studentEmail).prevSubmitted);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(() => {
    const qs = getInitialQuestions(quizFilter);
    const subs = getInitialSubmissions(studentEmail).prevSubmitted;
    return calculateResumeIndex(qs, subs, studentEmail).index;
  });
  const [showSaveExitModal, setShowSaveExitModal] = useState<boolean>(false);
  const [showGridAccordion, setShowGridAccordion] = useState<boolean>(false);

  // Sync questions and resume index if quizFilter or studentEmail changes after mount
  useEffect(() => {
    const filtered = getInitialQuestions(quizFilter);
    const { prevAnswers, prevSubmitted } = getInitialSubmissions(studentEmail);

    setQuestionsList(filtered);
    setUserAnswers(prevAnswers);
    setSubmittedQuestions(prevSubmitted);

    const { index: resumeIdx, reason: resumeReason } = calculateResumeIndex(filtered, prevSubmitted, studentEmail);
    setCurrentQuestionIndex(resumeIdx);

    if (resumeIdx > 0) {
      showToast(resumeReason || `Resumed from Question ${resumeIdx + 1} where you left off.`, 'play_arrow');
    }
  }, [quizFilter, studentEmail]);

  const currentQ: Question = questionsList[currentQuestionIndex] || questionsList[0];
  const currentAnswer = userAnswers[currentQ?.id] || null;
  const isCurrentSubmitted = Boolean(submittedQuestions[currentQ?.id]);

  // Persist student's last active position whenever current question changes
  useEffect(() => {
    if (!currentQ || !studentEmail) return;
    try {
      const lastActiveKey = `navoquest_last_active_${studentEmail}`;
      localStorage.setItem(
        lastActiveKey,
        JSON.stringify({
          studentEmail,
          questionId: currentQ.id,
          questionIndex: currentQuestionIndex,
          subtopic: currentQ.subtopic || currentQ.topic,
          topic: currentQ.topic,
          subject: currentQ.section,
          quizFilter: quizFilter || {
            subject: currentQ.section,
            topic: currentQ.topic,
            subtopic: currentQ.subtopic,
          },
          timestamp: Date.now(),
        })
      );
    } catch (e) {
      console.error('Error saving last active session:', e);
    }
  }, [currentQ?.id, currentQuestionIndex, studentEmail, quizFilter]);

  // Answer selection
  const handleSelectOption = (optionId: 'A' | 'B' | 'C' | 'D') => {
    if (!currentQ || isCurrentSubmitted) return;
    setUserAnswers((prev) => ({ ...prev, [currentQ.id]: optionId }));
  };

  const handleClearSelection = () => {
    if (!currentQ || isCurrentSubmitted) return;
    setUserAnswers((prev) => {
      const copy = { ...prev };
      delete copy[currentQ.id];
      return copy;
    });
    showToast('Selection cleared.', 'info');
  };

  // Submit answer and proceed
  const handleSubmitOrAdvance = async () => {
    if (!currentQ) return;
    if (!currentAnswer) {
      showToast('Please select an option before proceeding.', 'error');
      return;
    }

    if (!isCurrentSubmitted) {
      // Evaluate answer
      const isCorrect = currentAnswer === currentQ.correctAnswer;
      const scoreDelta = isCorrect ? currentQ.marks : 0;

      setSubmittedQuestions((prev) => ({ ...prev, [currentQ.id]: true }));

      // Record to Supabase / LocalStorage DB
      await recordQuizSubmissionToDB({
        studentEmail,
        questionId: currentQ.id,
        selectedOption: currentAnswer,
        isCorrect,
        scoreDelta,
      });

      showToast(
        isCorrect ? 'Correct! Marks awarded.' : `Answer recorded for Question ${currentQuestionIndex + 1}.`,
        isCorrect ? 'task_alt' : 'info'
      );
    } else {
      // Advance to next question
      if (currentQuestionIndex < questionsList.length - 1) {
        setCurrentQuestionIndex((prev) => prev + 1);
        showToast(`Loaded Question ${currentQuestionIndex + 2}.`, 'arrow_forward');
      } else {
        showToast(`You completed all ${questionsList.length} questions in this drill!`, 'emoji_events');
        setShowSaveExitModal(true);
      }
    }
  };

  const handlePrevQuestion = () => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex((prev) => prev - 1);
      showToast(`Navigated to Question ${currentQuestionIndex}`, 'arrow_back');
    } else {
      showToast('You are at the first question.', 'info');
    }
  };

  const handleJumpToQuestion = (qId: number) => {
    const idx = questionsList.findIndex((q) => q.id === qId);
    if (idx !== -1) {
      setCurrentQuestionIndex(idx);
      showToast(`Loaded Question ${idx + 1}...`, 'grid_view');
    }
  };

  // Palette stats
  const answeredCount = Object.keys(userAnswers).length;
  const totalQuestions = questionsList.length;
  const unansweredCount = totalQuestions - answeredCount;
  const progressPercent = totalQuestions > 0 ? Math.round((answeredCount / totalQuestions) * 100) : 0;

  if (totalQuestions === 0) {
    return (
      <div className="w-full max-w-lg mx-auto px-3.5 py-12 text-center space-y-4">
        <div className="bg-white p-6 rounded-2xl border border-[#eaedff] shadow-xs space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#f2f3ff] text-[#3525cd] flex items-center justify-center mx-auto shadow-xs">
            <span className="material-symbols-outlined text-[32px]">folder_off</span>
          </div>
          <div>
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#3525cd] bg-[#e2dfff] px-2.5 py-0.5 rounded-full inline-block mb-1.5">
              Subtopic Specific Practice
            </span>
            <h3 className="text-[16px] font-bold text-[#131b2e]">
              No Questions Uploaded Yet
            </h3>
            <p className="text-[12px] text-[#464555] max-w-sm mx-auto mt-1 leading-relaxed">
              There are currently no questions uploaded specifically for{' '}
              <strong className="text-[#3525cd]">
                "{quizFilter?.subtopic || quizFilter?.topic || quizFilter?.subject}"
              </strong>
              . Questions uploaded by the admin for this subtopic will automatically appear here.
            </p>
          </div>
          <div className="pt-2">
            <button
              onClick={() => onNavigate('student-dashboard')}
              className="w-full py-3 bg-[#3525cd] text-white rounded-xl text-[13px] font-bold shadow-xs hover:bg-[#2a1daf] active:scale-95 transition-all cursor-pointer"
            >
              Back to Subtopics
            </button>
          </div>
        </div>
      </div>
    );
  }

  const isCorrectAnswer = currentAnswer === currentQ.correctAnswer;

  const getSubjectIcon = (section: string) => {
    const sec = (section || '').toLowerCase();
    if (sec.includes('environment') || sec.includes('evs') || sec.includes('natural')) {
      return 'eco';
    }
    if (sec.includes('language') || sec.includes('english') || sec.includes('reading')) {
      return 'menu_book';
    }
    if (sec.includes('arithmetic') || sec.includes('math')) {
      return 'calculate';
    }
    return 'school';
  };

  return (
    <div className="w-full min-h-screen bg-[#faf8ff] text-[#131b2e] pb-36">
      {/* Quiz Compact Fixed Header */}
      <div className="bg-white/95 backdrop-blur-md border-b border-[#eaedff] sticky top-16 z-30 shadow-xs">
        <div className="max-w-lg mx-auto px-3.5 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setShowSaveExitModal(true)}
              aria-label="Go Back"
              className="w-9 h-9 flex items-center justify-center rounded-xl bg-[#f2f3ff] active:bg-[#eaedff] text-[#131b2e] transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="flex flex-col min-w-0">
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#3525cd] bg-[#e2dfff]/60 px-2 py-0.5 rounded-full whitespace-nowrap">
                <span className="material-symbols-outlined text-[13px]">{getSubjectIcon(currentQ.section)}</span>
                {currentQ.section}
              </span>
              <span className="text-[11px] text-[#464555] truncate font-semibold">
                {(quizFilter?.quizTitle || currentQ.quizTitle) ? `${quizFilter?.quizTitle || currentQ.quizTitle} • ` : ''}
                {currentQ.subtopic || currentQ.topic} • {totalQuestions} Questions
              </span>
            </div>
          </div>

          <button
            onClick={() => setShowSaveExitModal(true)}
            className="flex items-center gap-1 bg-[#eaedff] hover:bg-[#e2e7ff] text-[#131b2e] px-2.5 py-1.5 rounded-xl text-[12px] font-bold transition-all active:scale-95 shadow-2xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px] text-[#855300]">
              bookmark_border
            </span>
            <span>Save & Exit</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <main className="max-w-lg mx-auto pt-4 px-3.5 flex flex-col gap-3.5">
        {/* Question Card */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#eaedff]">
          {/* Question Meta Row */}
          <div className="flex items-center justify-between gap-2 pb-3 border-b border-[#eaedff] mb-3">
            <div className="flex items-center gap-2">
              <span className="bg-[#3525cd] text-white text-[13px] px-2.5 py-0.5 rounded-lg font-bold">
                Question {currentQuestionIndex + 1}
              </span>
              <span className="text-[12px] text-[#464555] font-semibold">
                of {totalQuestions} Total
              </span>
            </div>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[#f2f3ff] text-[#3525cd] flex items-center gap-1">
              <span className="material-symbols-outlined text-[13px]">military_tech</span>
              +{currentQ.marks} Marks
            </span>
          </div>

          {/* Question Text */}
          <div className="mb-3.5">
            <p className="text-[16px] text-[#131b2e] font-semibold leading-relaxed">
              {currentQ.prompt}
            </p>
          </div>

          {/* MCQ Options */}
          <div className="space-y-2.5">
            {currentQ.options.map((option) => {
              const isSelected = currentAnswer === option.id;
              const isCorrectOption = option.id === currentQ.correctAnswer;

              let cardStyle =
                'bg-white border-2 border-[#eaedff] hover:border-[#3525cd]/40';
              let badgeStyle = 'bg-[#eaedff] text-[#131b2e]';
              let statusText = '';
              let statusBadgeStyle = '';

              if (isCurrentSubmitted) {
                if (isSelected && isCorrectOption) {
                  cardStyle = 'bg-emerald-50 border-2 border-emerald-500 ring-2 ring-emerald-400/30';
                  badgeStyle = 'bg-emerald-600 text-white';
                  statusText = 'Selected & Correct';
                  statusBadgeStyle = 'bg-emerald-600 text-white';
                } else if (isSelected && !isCorrectOption) {
                  cardStyle = 'bg-rose-50 border-2 border-rose-500';
                  badgeStyle = 'bg-rose-600 text-white';
                  statusText = 'Your Selection';
                  statusBadgeStyle = 'bg-rose-600 text-white';
                } else if (!isSelected && isCorrectOption) {
                  cardStyle = 'bg-emerald-50 border-2 border-emerald-500';
                  badgeStyle = 'bg-emerald-600 text-white';
                  statusText = 'Correct Answer';
                  statusBadgeStyle = 'bg-emerald-600 text-white';
                } else {
                  cardStyle = 'bg-white border border-[#eaedff] opacity-60';
                }
              } else if (isSelected) {
                cardStyle = 'bg-[#e2dfff]/30 border-2 border-[#3525cd] shadow-xs';
                badgeStyle = 'bg-[#3525cd] text-white';
              }

              return (
                <div
                  key={option.id}
                  onClick={() => handleSelectOption(option.id)}
                  className={`group relative flex items-center justify-between p-3.5 rounded-xl cursor-pointer transition-all duration-150 active:scale-[0.99] ${cardStyle}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-[14px] flex-shrink-0 transition-colors ${badgeStyle}`}
                    >
                      {option.id}
                    </div>
                    <div className="flex items-baseline gap-1.5 flex-wrap min-w-0">
                      <span className="text-[16px] font-bold text-[#131b2e]">
                        {option.text}
                      </span>
                      {option.subtext && (
                        <span className="text-[12px] text-[#464555]">
                          {option.subtext}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Status Indicator */}
                  <div className="flex-shrink-0 ml-2">
                    {isCurrentSubmitted && statusText ? (
                      <span
                        className={`px-2 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1 ${statusBadgeStyle}`}
                      >
                        <span className="material-symbols-outlined text-[13px]">
                          {isCorrectOption ? 'check_circle' : 'cancel'}
                        </span>
                        <span>{statusText}</span>
                      </span>
                    ) : (
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-[#3525cd] border-[#3525cd] text-white'
                            : 'border-[#c7c4d8]'
                        }`}
                      >
                        {isSelected && (
                          <span className="material-symbols-outlined text-[16px]">
                            check
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Evaluated Answer Result Banner */}
          {isCurrentSubmitted && (
            <div className="mt-3.5 pt-3.5 border-t border-[#eaedff]">
              <div
                className={`rounded-xl p-3 border flex flex-col gap-2 transition-all ${
                  isCorrectAnswer
                    ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50/80 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span
                      className={`material-symbols-outlined text-[20px] ${
                        isCorrectAnswer ? 'text-emerald-600' : 'text-rose-600'
                      }`}
                    >
                      {isCorrectAnswer ? 'check_circle' : 'cancel'}
                    </span>
                    <span className="text-[14px] font-bold">
                      {isCorrectAnswer ? 'Correct Answer!' : 'Incorrect Answer'}
                    </span>
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                      isCorrectAnswer
                        ? 'bg-emerald-200/80 text-emerald-800'
                        : 'bg-rose-200/80 text-rose-800'
                    }`}
                  >
                    {isCorrectAnswer ? `+${currentQ.marks} pts` : '0 pts'}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[12px] pt-1 border-t border-black/5">
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="text-[#464555]">Selected Answer:</span>
                    <span className="font-bold">
                      Option {currentAnswer}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 font-medium">
                    <span className="text-[#464555]">Correct Answer:</span>
                    <span className="font-bold text-emerald-800">
                      Option {currentQ.correctAnswer}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Selection Status & Clear Action */}
          <div className="mt-3 pt-2.5 border-t border-[#eaedff] flex items-center justify-between text-[12px]">
            <button
              onClick={handleClearSelection}
              disabled={isCurrentSubmitted || !currentAnswer}
              className="flex items-center gap-1 text-[#464555] hover:text-[#ba1a1a] transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="material-symbols-outlined text-[15px]">backspace</span>
              <span>Clear Selection</span>
            </button>

            <span
              className={`text-[11px] flex items-center gap-1 font-semibold ${
                currentAnswer ? 'text-[#005338]' : 'text-[#777587]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">
                {currentAnswer ? 'check_circle' : 'radio_button_unchecked'}
              </span>
              <span>{currentAnswer ? 'Choice Saved' : 'No selection'}</span>
            </span>
          </div>
        </section>

        {/* Question Palette Section */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border border-[#eaedff]">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#3525cd] text-[20px]">
                grid_view
              </span>
              <h2 className="text-[15px] font-bold text-[#131b2e]">Question Palette</h2>
            </div>
            <span className="text-[11px] bg-[#eaedff] px-2 py-0.5 rounded-full text-[#464555] font-bold">
              {totalQuestions} Questions
            </span>
          </div>

          {/* Status Legend */}
          <div className="grid grid-cols-3 gap-2 p-2 bg-[#f2f3ff] rounded-xl mb-3 text-center text-[11px]">
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#006e4b]"></span>
              <span className="text-[#464555] font-medium">{answeredCount} Answered</span>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#3525cd] ring-2 ring-[#3525cd]/30 animate-pulse"></span>
              <span className="text-[#3525cd] font-bold">1 Current</span>
            </div>
            <div className="flex items-center justify-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#dae2fd]"></span>
              <span className="text-[#464555] font-medium">{unansweredCount} Unanswered</span>
            </div>
          </div>

          {/* Quick Jump Strip */}
          <div className="mb-3">
            <p className="text-[11px] text-[#464555] uppercase font-bold tracking-wider mb-2">
              Quick Jump Strip
            </p>
            <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
              {questionsList.map((q, idx) => {
                const isCurrent = q.id === currentQ.id;
                const isAnswered = Boolean(userAnswers[q.id]);

                let btnClass =
                  'bg-[#dae2fd] text-[#464555] font-semibold text-[12px] opacity-70';

                if (isCurrent) {
                  btnClass =
                    'bg-[#3525cd] text-white font-black text-[13px] ring-2 ring-[#e2dfff] shadow-sm';
                } else if (isAnswered) {
                  btnClass =
                    'bg-[#006e4b] text-white font-bold text-[12px] shadow-2xs';
                }

                return (
                  <button
                    key={q.id}
                    onClick={() => handleJumpToQuestion(q.id)}
                    className={`w-9 h-9 flex-shrink-0 rounded-xl flex items-center justify-center relative cursor-pointer transition-all ${btnClass}`}
                  >
                    <span>{idx + 1}</span>
                    {isAnswered && !isCurrent && (
                      <span className="material-symbols-outlined text-[10px] absolute top-0.5 right-0.5 text-[#67f4b7]">
                        check
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Expandable Full 5x3 Grid Trigger */}
          <div className="border-t border-[#eaedff] pt-2">
            <button
              onClick={() => setShowGridAccordion(!showGridAccordion)}
              className="w-full flex items-center justify-between text-[12px] font-bold text-[#3525cd] py-1 select-none cursor-pointer"
            >
              <span>Show all {totalQuestions} questions in grid</span>
              <span
                className={`material-symbols-outlined text-[18px] transition-transform ${
                  showGridAccordion ? 'rotate-180' : ''
                }`}
              >
                expand_more
              </span>
            </button>

            {showGridAccordion && (
              <div className="grid grid-cols-5 gap-2 pt-3">
                {questionsList.map((q, idx) => {
                  const isCurrent = q.id === currentQ.id;
                  const isAnswered = Boolean(userAnswers[q.id]);

                  let btnClass =
                    'bg-[#dae2fd] text-[#464555] font-semibold text-[12px] opacity-70';

                  if (isCurrent) {
                    btnClass =
                      'bg-[#3525cd] text-white font-black text-[13px] ring-2 ring-[#e2dfff]';
                  } else if (isAnswered) {
                    btnClass = 'bg-[#006e4b] text-white font-bold text-[12px]';
                  }

                  return (
                    <button
                      key={q.id}
                      onClick={() => handleJumpToQuestion(q.id)}
                      className={`h-10 rounded-xl flex items-center justify-center relative cursor-pointer transition-all ${btnClass}`}
                    >
                      <span>{idx + 1}</span>
                      {isAnswered && !isCurrent && (
                        <span className="material-symbols-outlined text-[10px] absolute top-0.5 right-0.5 text-[#67f4b7]">
                          check
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quiz Completion Progress Bar */}
          <div className="mt-3.5 pt-3 border-t border-[#eaedff]">
            <div className="flex items-center justify-between text-[11px] mb-1.5">
              <span className="font-bold text-[#464555] uppercase tracking-wider">
                Quiz Progress
              </span>
              <span className="font-bold text-[#3525cd]">
                {progressPercent}% Complete ({answeredCount}/{totalQuestions})
              </span>
            </div>
            <div className="w-full h-2 bg-[#dae2fd] rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#3525cd] to-[#4edea3] rounded-full transition-all duration-500"
                style={{ width: `${progressPercent}%` }}
              ></div>
            </div>
          </div>
        </section>
      </main>

      {/* Sticky Bottom Action Bar */}
      <aside className="fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur-md border-t border-[#eaedff] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] px-3.5 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        <div className="max-w-lg mx-auto flex flex-col gap-1.5">
          <div className="grid grid-cols-12 gap-2 items-center">
            {/* Previous Question */}
            <button
              onClick={handlePrevQuestion}
              className="col-span-4 h-12 flex items-center justify-center gap-1 rounded-xl bg-[#eaedff] active:bg-[#e2e7ff] text-[#131b2e] text-[13px] font-bold transition-all active:scale-[0.98] cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              <span>Previous</span>
            </button>

            {/* Strict Gated Next Button */}
            <button
              onClick={handleSubmitOrAdvance}
              disabled={!currentAnswer}
              className={`col-span-8 h-12 flex items-center justify-center gap-2 rounded-xl text-[14px] font-bold transition-all shadow-md active:scale-[0.98] cursor-pointer ${
                !currentAnswer
                  ? 'bg-[#dae2fd] text-[#777587] opacity-60 cursor-not-allowed shadow-none'
                  : isCurrentSubmitted
                  ? 'bg-[#006e4b] text-white hover:bg-[#005338]'
                  : 'bg-[#3525cd] text-white hover:bg-[#2a1daf]'
              }`}
            >
              <span>
                {!isCurrentSubmitted
                  ? 'Next Question'
                  : currentQuestionIndex < totalQuestions - 1
                  ? `Proceed to Question ${currentQuestionIndex + 2}`
                  : 'Finish Practice Quiz'}
              </span>
              <span className="material-symbols-outlined text-[19px]">
                arrow_forward
              </span>
            </button>
          </div>

          {/* Gate Feedback Label */}
          <div className="text-center">
            <p
              className={`text-[11px] font-semibold flex items-center justify-center gap-1 ${
                currentAnswer
                  ? isCurrentSubmitted
                    ? 'text-[#005338]'
                    : 'text-[#006e4b]'
                  : 'text-[#ba1a1a]'
              }`}
            >
              <span className="material-symbols-outlined text-[13px]">
                {currentAnswer ? 'check_circle' : 'lock'}
              </span>
              <span>
                {currentAnswer
                  ? isCurrentSubmitted
                    ? 'Answer recorded. Tap Proceed to advance.'
                    : 'Option selected! Tap Next Question to confirm.'
                  : 'Select an answer option to unlock Next Question'}
              </span>
            </p>
          </div>
        </div>
      </aside>

      {/* Save & Exit Modal */}
      {showSaveExitModal && (
        <div className="fixed inset-0 z-50 bg-[#283044]/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200">
          <div className="bg-white w-full max-w-sm rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="w-12 h-1 bg-[#dae2fd] rounded-full mx-auto sm:hidden"></div>
            <div className="w-12 h-12 rounded-2xl bg-[#ffddb8] text-[#2a1700] flex items-center justify-center mx-auto">
              <span className="material-symbols-outlined text-[28px]">
                pause_circle
              </span>
            </div>
            <h3 className="text-[18px] text-center font-extrabold text-[#131b2e]">
              Pause Practice Quiz?
            </h3>
            <p className="text-[13px] text-center text-[#464555] leading-relaxed">
              Your answered questions are securely saved for{' '}
              <span className="font-bold text-[#3525cd]">{studentEmail}</span>.
            </p>

            <div className="bg-[#f2f3ff] rounded-xl p-3 text-[12px] space-y-1">
              <div className="flex items-center justify-between text-[#131b2e]">
                <span className="text-[#464555] flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-[#005338]">
                    check_circle
                  </span>{' '}
                  Answered:
                </span>
                <span className="font-bold">
                  {answeredCount} of {totalQuestions} ({progressPercent}%)
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 pt-1">
              <button
                onClick={() => setShowSaveExitModal(false)}
                className="w-full py-3 rounded-xl bg-[#3525cd] text-white font-bold text-[14px] text-center shadow-xs active:scale-95 transition-all cursor-pointer"
              >
                Continue Practice
              </button>
              <button
                onClick={() => {
                  setShowSaveExitModal(false);
                  showToast('Quiz progress saved to database!', 'cloud_done');
                  onNavigate('student-dashboard');
                }}
                className="w-full py-2.5 rounded-xl bg-[#eaedff] text-[#131b2e] font-bold text-[13px] text-center active:scale-95 transition-all cursor-pointer"
              >
                Save & Exit to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
