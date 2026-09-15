import React, { useState, useEffect } from 'react';
import { ScreenType, QuizFilter } from '../types';
import { getLiveQuestions } from '../lib/pdfExtractor';
import { SYLLABUS_DATA } from '../data/syllabusData';

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
            return;
          }
        }
      } catch (e) {
        console.error(e);
      }
      setUserSubmissions([]);
      setSolvedCount(0);
    };

    updateDashboard();

    window.addEventListener('navoquest_submission_updated', updateDashboard);
    window.addEventListener('storage', updateDashboard);
    window.addEventListener('focus', updateDashboard);

    return () => {
      window.removeEventListener('navoquest_submission_updated', updateDashboard);
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
        .filter((q) => (q.subtopic || q.topic) === subtopicName)
        .map((q) => q.id)
    );

    const solvedForSubtopic = new Set(
      userSubmissions
        .filter((s) => subtopicQIds.has(s.questionId))
        .map((s) => s.questionId)
    );

    return solvedForSubtopic.size;
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
            showToast('Logged out of student account.', 'logout');
            onNavigate('student-login');
          }}
          className="p-2 text-[#777587] hover:text-[#ba1a1a] hover:bg-[#f2f3ff] rounded-xl transition-colors cursor-pointer flex items-center gap-1 text-[11px] font-bold"
          title="Sign Out"
        >
          <span className="material-symbols-outlined text-[18px]">logout</span>
        </button>
      </div>

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

                                <div className="grid grid-cols-1 gap-1.5">
                                  {topic.subtopics.map((subtopic, sIdx) => {
                                    const solvedForSub = getSubtopicSolvedCount(subtopic);

                                    return (
                                      <div
                                        key={subtopic}
                                        onClick={() => {
                                          showToast(`Loading practice for: ${subtopic}`, 'rocket_launch');
                                          onNavigate('practice-quiz', {
                                            subject: subject.name,
                                            topic: topic.name,
                                            subtopic: subtopic,
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
                                          {solvedForSub > 0 && (
                                            <span className="text-[10px] text-[#006e4b] font-extrabold bg-[#e2f3ec] px-1.5 py-0.5 rounded flex items-center gap-0.5">
                                              <span className="material-symbols-outlined text-[11px]">check_circle</span>
                                              {solvedForSub} Solved
                                            </span>
                                          )}
                                          <span className="text-[10px] text-[#3525cd] font-bold flex items-center gap-0.5 bg-white px-2 py-0.5 rounded border border-[#c7c4d8]">
                                            <span className="material-symbols-outlined text-[12px]">
                                              play_circle
                                            </span>{' '}
                                            Practice
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
