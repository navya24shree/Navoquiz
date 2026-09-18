import React, { useState, useEffect } from 'react';
import { ScreenType, QuizFilter } from '../types';
import { getLiveQuestions } from '../lib/pdfExtractor';
import { SYLLABUS_DATA } from '../data/syllabusData';
import { getQuizzesForSubtopic, getQuizSolvedCount } from '../lib/quizManager';

interface StudentDashboardProps {
  studentName: string;
  studentEmail: string;
  onNavigate: (screen: ScreenType, filter?: QuizFilter) => void;
  showToast: (msg: string, icon?: string) => void;
}

export const StudentDashboard: React.FC<StudentDashboardProps> = ({
  studentName,
  studentEmail,
  onNavigate,
  showToast,
}) => {
  const [questionsCount, setQuestionsCount] = useState<number>(() => getLiveQuestions().length);
  const [userSubmissions, setUserSubmissions] = useState<any[]>([]);
  const [lastActiveSession, setLastActiveSession] = useState<{
    questionId: number;
    questionIndex: number;
    subtopic?: string;
    topic?: string;
    subject?: string;
    quizFilter?: QuizFilter;
    timestamp?: number;
  } | null>(() => {
    try {
      const saved = localStorage.getItem(`navoquest_last_active_${studentEmail}`);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.error(e);
    }
    return null;
  });

  const calculateSolvedCount = () => {
    try {
      const stored = localStorage.getItem('navoquest_submissions');
      if (stored) {
        const subs = JSON.parse(stored);
        if (Array.isArray(subs)) {
          const filtered = subs.filter((s: any) => !studentEmail || s.studentEmail === studentEmail);
          const uniqueIds = new Set(filtered.map((s: any) => s.questionId));
          return uniqueIds.size;
        }
      }
    } catch (e) {
      console.error(e);
    }
    return 0;
  };

  const [solvedCount, setSolvedCount] = useState<number>(calculateSolvedCount);

  useEffect(() => {
    const updateDashboard = () => {
      setQuestionsCount(getLiveQuestions().length);
      try {
        const stored = localStorage.getItem('navoquest_submissions');
        if (stored) {
          const subs = JSON.parse(stored);
          if (Array.isArray(subs)) {
            const filtered = subs.filter((s: any) => !studentEmail || s.studentEmail === studentEmail);
            setUserSubmissions(filtered);
            const uniqueIds = new Set(filtered.map((s: any) => s.questionId));
            setSolvedCount(uniqueIds.size);
          } else {
            setUserSubmissions([]);
            setSolvedCount(0);
          }
        } else {
          setUserSubmissions([]);
          setSolvedCount(0);
        }
      } catch (e) {
        console.error(e);
        setUserSubmissions([]);
        setSolvedCount(0);
      }

      try {
        const saved = localStorage.getItem(`navoquest_last_active_${studentEmail}`);
        if (saved) {
          setLastActiveSession(JSON.parse(saved));
        } else {
          setLastActiveSession(null);
        }
      } catch (e) {
        console.error(e);
      }
    };

    updateDashboard();

    window.addEventListener('navoquest_submission_updated', updateDashboard);
    window.addEventListener('navoquest_questions_updated', updateDashboard);
    window.addEventListener('navoquest_quizzes_updated', updateDashboard);
    window.addEventListener('storage', updateDashboard);
    window.addEventListener('focus', updateDashboard);

    return () => {
      window.removeEventListener('navoquest_submission_updated', updateDashboard);
      window.removeEventListener('navoquest_questions_updated', updateDashboard);
      window.removeEventListener('navoquest_quizzes_updated', updateDashboard);
      window.removeEventListener('storage', updateDashboard);
      window.removeEventListener('focus', updateDashboard);
    };
  }, [studentEmail]);

  const [expandedSubject, setExpandedSubject] = useState<string | null>('Environmental Studies (EVS)');
  const [expandedTopic, setExpandedTopic] = useState<string | null>('The Natural World');

  // Helper to count solved questions for a specific subtopic
  const getSubtopicSolvedCount = (subtopicName: string) => {
    if (!userSubmissions.length) return 0;
    const allQuestions = getLiveQuestions();
    const subtopicQIds = new Set(
      allQuestions
        .filter((q) => (q.subtopic || q.topic)?.trim().toLowerCase() === subtopicName.trim().toLowerCase())
        .map((q) => q.id)
    );

    const solvedForSubtopic = new Set(
      userSubmissions
        .filter((s) => subtopicQIds.has(s.questionId))
        .map((s) => s.questionId)
    );

    return solvedForSubtopic.size;
  };

  // Helper to count total questions for a specific subtopic
  const getSubtopicTotalCount = (subtopicName: string) => {
    const allQuestions = getLiveQuestions();
    return allQuestions.filter(
      (q) => (q.subtopic || q.topic)?.trim().toLowerCase() === subtopicName.trim().toLowerCase()
    ).length;
  };

  return (
    <div className="w-full max-w-lg mx-auto px-3.5 py-4 space-y-4 pb-24">
      {/* Total Questions Solved Banner */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#006e4b] text-white font-extrabold flex items-center justify-center shadow-xs">
            <span className="material-symbols-outlined text-[26px]">task_alt</span>
          </div>
          <div>
            <span className="text-[11px] font-bold text-[#777587] uppercase tracking-wider block">
              Total Questions Solved
            </span>
            <div className="flex items-baseline gap-2">
              <span className="text-[22px] font-black text-[#131b2e]">
                {solvedCount}
              </span>
              <span className="text-[12px] font-bold text-[#464555]">
                / {questionsCount} Questions as Whole
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            try {
              localStorage.removeItem('navoquest_current_student');
            } catch (e) {
              console.error(e);
            }
            showToast('Logged out of student account.', 'logout');
            onNavigate('student-login');
          }}
          className="p-2 text-[#777587] hover:text-[#ba1a1a] hover:bg-[#f2f3ff] rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          title="Sign Out"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
      </div>

      {/* Resume Where You Left Off Banner */}
      {lastActiveSession && (
        <div className="bg-gradient-to-r from-[#20138c] via-[#3525cd] to-[#4c39e8] text-white p-4 rounded-2xl shadow-sm border border-[#3525cd]/20 flex flex-col gap-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[20px] text-white">
                  history_toggle_off
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-white/80 uppercase tracking-wider block">
                  Resume Where You Left Off
                </span>
                <h3 className="text-[14px] font-black text-white leading-tight">
                  {lastActiveSession.subtopic || lastActiveSession.topic || 'Practice Drill'}
                </h3>
              </div>
            </div>
            {(() => {
              const resumeTotal = lastActiveSession.subtopic
                ? getSubtopicTotalCount(lastActiveSession.subtopic)
                : questionsCount;
              return (
                <span className="text-[11px] font-extrabold bg-white text-[#3525cd] px-2.5 py-0.5 rounded-full shadow-xs flex-shrink-0">
                  Question {lastActiveSession.questionIndex + 1}
                  {resumeTotal > 0 ? ` of ${resumeTotal}` : ''}
                </span>
              );
            })()}
          </div>

          <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/15">
            <div className="text-[11px] text-white/85 truncate font-medium">
              {lastActiveSession.subject || 'Navodaya JNVST'}
            </div>
            <button
              onClick={() => {
                showToast(
                  `Resuming ${lastActiveSession.subtopic || lastActiveSession.topic} at Question ${lastActiveSession.questionIndex + 1}...`,
                  'play_arrow'
                );
                onNavigate(
                  'practice-quiz',
                  lastActiveSession.quizFilter || {
                    subject: lastActiveSession.subject,
                    topic: lastActiveSession.topic,
                    subtopic: lastActiveSession.subtopic,
                  }
                );
              }}
              className="h-8 px-3 bg-white text-[#3525cd] hover:bg-[#f2f3ff] active:scale-[0.98] rounded-lg font-extrabold text-[11px] flex items-center gap-1.5 transition-all shadow-xs cursor-pointer flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[15px]">play_arrow</span>
              <span>Resume Question {lastActiveSession.questionIndex + 1}</span>
            </button>
          </div>
        </div>
      )}

      {/* JNVST Syllabus Learning Modules */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-bold text-[#131b2e]">
              JNVST Subjects & Subtopics
            </h2>
            <p className="text-[11px] text-[#777587]">
              Click a subject to view topics, then click a topic to view all subtopics
            </p>
          </div>
          <span className="text-[11px] font-bold text-[#3525cd] bg-[#e2dfff] px-2 py-0.5 rounded-full flex-shrink-0">
            3 Subjects
          </span>
        </div>

        <div className="space-y-3">
          {SYLLABUS_DATA.map((subject) => {
            const isSubjectExpanded = expandedSubject === subject.name;

            return (
              <div
                key={subject.name}
                className="bg-[#f8f9ff] rounded-xl border border-[#c7c4d8] overflow-hidden transition-all shadow-xs"
              >
                {/* Level 1: Subject Header */}
                <div
                  onClick={() => {
                    if (isSubjectExpanded) {
                      setExpandedSubject(null);
                      setExpandedTopic(null);
                    } else {
                      setExpandedSubject(subject.name);
                      setExpandedTopic(subject.topics[0]?.name || null);
                    }
                  }}
                  className="p-3 flex items-center justify-between gap-2 cursor-pointer hover:bg-[#f0f2ff] transition-colors"
                >
                  <div className="flex items-center gap-2.5 flex-1">
                    <div className="w-9 h-9 rounded-lg bg-[#3525cd] text-white flex items-center justify-center text-[18px] font-bold flex-shrink-0 shadow-xs">
                      <span className="material-symbols-outlined text-[20px]">
                        {subject.icon}
                      </span>
                    </div>
                    <div>
                      <p className="text-[13.5px] font-extrabold text-[#131b2e]">
                        {subject.name}
                      </p>
                      <p className="text-[11px] text-[#464555] font-medium">
                        {subject.topics.length} Topics • Click to explore
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <div className="p-1 text-[#777587]">
                      <span className="material-symbols-outlined text-[22px]">
                        {isSubjectExpanded ? 'expand_less' : 'expand_more'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Level 2: Topics List under Selected Subject */}
                {isSubjectExpanded && (
                  <div className="px-3 pb-3 pt-1 border-t border-[#eaedff] space-y-2 bg-white">
                    <div className="flex items-center justify-between pt-1">
                      <span className="text-[10px] uppercase font-extrabold text-[#3525cd] tracking-wider block">
                        Topics ({subject.topics.length})
                      </span>
                      <span className="text-[10px] text-[#777587]">
                        Tap a topic to reveal subtopics
                      </span>
                    </div>

                    <div className="space-y-2">
                      {subject.topics.map((topic, idx) => {
                        const isTopicExpanded = expandedTopic === topic.name;

                        return (
                          <div
                            key={topic.name}
                            className="rounded-lg border border-[#c7c4d8] overflow-hidden bg-[#f8f9ff] transition-all"
                          >
                            {/* Topic Header Clickable */}
                            <div
                              onClick={() => {
                                setExpandedTopic(isTopicExpanded ? null : topic.name);
                              }}
                              className={`p-2.5 flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                                isTopicExpanded
                                  ? 'bg-[#e2dfff] text-[#131b2e]'
                                  : 'hover:bg-[#f2f3ff] text-[#131b2e]'
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                <span className="w-5 h-5 rounded-full bg-[#3525cd] text-white font-bold text-[10px] flex items-center justify-center flex-shrink-0">
                                  {idx + 1}
                                </span>
                                <h4 className="text-[12px] font-bold">
                                  {topic.name}
                                </h4>
                              </div>

                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-[#3525cd] bg-white px-2 py-0.5 rounded-full border border-[#c7c4d8]">
                                  {topic.subtopics.length} Subtopics
                                </span>
                                <span className="material-symbols-outlined text-[18px] text-[#464555]">
                                  {isTopicExpanded ? 'expand_less' : 'expand_more'}
                                </span>
                              </div>
                            </div>

                            {/* Level 3: Subtopics List under Selected Topic */}
                            {isTopicExpanded && (
                              <div className="p-2.5 bg-white border-t border-[#c7c4d8] space-y-2">
                                <span className="text-[10px] font-bold text-[#464555] uppercase block tracking-wider">
                                  All Subtopics under {topic.name}:
                                </span>

                                <div className="grid grid-cols-1 gap-2">
                                  {topic.subtopics.map((subtopic, sIdx) => {
                                    const solvedForSub = getSubtopicSolvedCount(subtopic);
                                    const totalForSub = getSubtopicTotalCount(subtopic);
                                    const subQuizzes = getQuizzesForSubtopic(subtopic, topic.name, subject.name);

                                    // If subtopic has multiple distinct quizzes from uploaded PDFs
                                    if (subQuizzes.length > 1) {
                                      return (
                                        <div
                                          key={subtopic}
                                          className="p-2.5 bg-[#f8f9ff] rounded-xl border border-[#c7c4d8]/60 space-y-2"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 min-w-0">
                                              <span className="w-5 h-5 rounded-md bg-[#006e4b] text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0">
                                                {sIdx + 1}
                                              </span>
                                              <span className="font-bold text-[12px] text-[#131b2e] truncate">
                                                {subtopic}
                                              </span>
                                            </div>
                                            <span className="text-[10px] font-extrabold bg-[#e2dfff] text-[#3525cd] px-2 py-0.5 rounded-full flex-shrink-0">
                                              {subQuizzes.length} Quizzes Available
                                            </span>
                                          </div>

                                          {/* Nested list of distinct quizzes */}
                                          <div className="space-y-1.5 pt-0.5">
                                            {subQuizzes.map((qz) => {
                                              const qzStats = getQuizSolvedCount(qz.id, userSubmissions);
                                              const isComplete = qzStats.solved >= qzStats.total && qzStats.total > 0;

                                              return (
                                                <div
                                                  key={qz.id}
                                                  onClick={() => {
                                                    showToast(`Loading ${qz.title}...`, 'quiz');
                                                    onNavigate('practice-quiz', {
                                                      subject: subject.name,
                                                      topic: topic.name,
                                                      subtopic: subtopic,
                                                      quizId: qz.id,
                                                      quizTitle: qz.title,
                                                    });
                                                  }}
                                                  className="p-2 bg-white hover:bg-[#f2f3ff] rounded-lg border border-[#eaedff] flex items-center justify-between text-[11px] font-semibold text-[#131b2e] cursor-pointer transition-all active:scale-[0.99] shadow-2xs"
                                                >
                                                  <div className="flex items-center gap-2 min-w-0 pr-2">
                                                    <span className="w-5 h-5 rounded bg-[#f2f3ff] text-[#3525cd] text-[10px] font-black flex items-center justify-center flex-shrink-0 border border-[#eaedff]">
                                                      {qz.quizNumber}
                                                    </span>
                                                    <div className="min-w-0">
                                                      <span className="truncate block font-bold text-[11px] text-[#131b2e]">
                                                        {qz.title}
                                                      </span>
                                                      <span className="text-[10px] text-[#777587]">
                                                        {qz.questionCount} MCQs {qz.sourceFile ? `• ${qz.sourceFile}` : ''}
                                                      </span>
                                                    </div>
                                                  </div>

                                                  <div className="flex items-center gap-1.5 flex-shrink-0">
                                                    {qzStats.total > 0 && (
                                                      <span
                                                        className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                                          qzStats.solved > 0
                                                            ? isComplete
                                                              ? 'text-[#006e4b] bg-[#e2f3ec]'
                                                              : 'text-[#855300] bg-[#fff4e5]'
                                                            : 'text-[#3525cd] bg-[#e2dfff]/70'
                                                        }`}
                                                      >
                                                        {qzStats.solved > 0 ? (
                                                          <>
                                                            <span className="material-symbols-outlined text-[11px]">
                                                              {isComplete ? 'check_circle' : 'pending'}
                                                            </span>
                                                            {qzStats.solved} / {qzStats.total} Solved
                                                          </>
                                                        ) : (
                                                          `${qz.questionCount} MCQs`
                                                        )}
                                                      </span>
                                                    )}
                                                    <span className="text-[10px] text-[#3525cd] font-bold flex items-center gap-0.5 bg-[#f2f3ff] px-2 py-0.5 rounded border border-[#3525cd]/30 shadow-2xs">
                                                      <span className="material-symbols-outlined text-[12px]">
                                                        play_circle
                                                      </span>{' '}
                                                      {qzStats.solved > 0 ? 'Resume' : 'Start Quiz'}
                                                    </span>
                                                  </div>
                                                </div>
                                              );
                                            })}
                                          </div>
                                        </div>
                                      );
                                    }

                                    // Default: Single Quiz under subtopic
                                    const defaultQuiz = subQuizzes[0];
                                    return (
                                      <div
                                        key={subtopic}
                                        onClick={() => {
                                          if (solvedForSub > 0) {
                                            showToast(`Resuming ${subtopic} from Question ${solvedForSub + 1}...`, 'play_arrow');
                                          } else {
                                            showToast(`Loading practice for: ${subtopic}`, 'rocket_launch');
                                          }
                                          onNavigate('practice-quiz', {
                                            subject: subject.name,
                                            topic: topic.name,
                                            subtopic: subtopic,
                                            quizId: defaultQuiz?.id,
                                            quizTitle: defaultQuiz?.title,
                                          });
                                        }}
                                        className="p-2 bg-[#f2f3ff] hover:bg-[#e2dfff] rounded-lg border border-[#eaedff] flex items-center justify-between text-[11px] font-semibold text-[#131b2e] cursor-pointer transition-all active:scale-[0.99]"
                                      >
                                        <div className="flex items-center gap-2 min-w-0 pr-2">
                                          <span className="w-4 h-4 rounded bg-[#006e4b] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                                            {sIdx + 1}
                                          </span>
                                          <span className="truncate">{subtopic}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 flex-shrink-0">
                                          {totalForSub > 0 && (
                                            <span
                                              className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded flex items-center gap-0.5 ${
                                                solvedForSub > 0
                                                  ? 'text-[#006e4b] bg-[#e2f3ec]'
                                                  : 'text-[#3525cd] bg-[#e2dfff]/70'
                                              }`}
                                            >
                                              {solvedForSub > 0 ? (
                                                <>
                                                  <span className="material-symbols-outlined text-[11px]">check_circle</span>
                                                  {solvedForSub} / {totalForSub} Solved
                                                </>
                                              ) : (
                                                `${totalForSub} MCQs`
                                              )}
                                            </span>
                                          )}
                                          <span className={`text-[10px] text-[#3525cd] font-bold flex items-center gap-0.5 bg-white px-2 py-0.5 rounded border ${
                                            solvedForSub > 0 ? 'border-[#3525cd]/40 shadow-2xs font-extrabold' : 'border-[#c7c4d8]'
                                          }`}>
                                            <span className="material-symbols-outlined text-[12px]">
                                              play_circle
                                            </span>{' '}
                                            {solvedForSub > 0 ? `Resume (Q ${solvedForSub + 1})` : 'Practice'}
                                          </span>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Class Leaderboard Snapshot */}
      <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[15px] font-bold text-[#131b2e] flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[#fea619] text-[20px]">leaderboard</span>
            Class 6-A Leaderboard
          </h2>
          <span className="text-[11px] text-[#005338] font-bold bg-[#e2f3ec] px-2 py-0.5 rounded-full">
            Top Performers
          </span>
        </div>

        <div className="space-y-2 text-[12px]">
          <div className="p-2.5 bg-[#f2f3ff] rounded-xl flex items-center justify-between border border-[#3525cd]/20">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#fea619] text-[#2a1700] font-black flex items-center justify-center text-[11px]">
                1
              </span>
              <span className="font-bold text-[#131b2e]">{studentName} (You)</span>
            </div>
            <span className="font-bold text-[#3525cd] flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px] text-[#006e4b]">task_alt</span>
              {solvedCount} Questions Solved
            </span>
          </div>

          <div className="p-2.5 bg-white rounded-xl flex items-center justify-between border border-[#eaedff]">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#eaedff] text-[#464555] font-bold flex items-center justify-center text-[11px]">
                2
              </span>
              <span className="font-semibold text-[#131b2e]">Priya Patel</span>
            </div>
            <span className="font-semibold text-[#464555]">1,180 Stars</span>
          </div>

          <div className="p-2.5 bg-white rounded-xl flex items-center justify-between border border-[#eaedff]">
            <div className="flex items-center gap-2.5">
              <span className="w-6 h-6 rounded-full bg-[#eaedff] text-[#464555] font-bold flex items-center justify-center text-[11px]">
                3
              </span>
              <span className="font-semibold text-[#131b2e]">Ananya Verma</span>
            </div>
            <span className="font-semibold text-[#464555]">1,050 Stars</span>
          </div>
        </div>
      </div>
    </div>
  );
};
