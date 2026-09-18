import React, { useState, useEffect } from 'react';
import { ScreenType, Student, PDFUpload, TaxonomyItem, Quiz, Question } from '../types';
import {
  MOCK_STUDENTS,
  INITIAL_PDF_STAGED,
  INITIAL_TAXONOMY,
} from '../data/mockData';
import {
  extractTextFromPDF,
  parseQuestionsFromText,
  saveExtractedQuestionsToBank,
  resetLiveBankWithQuestions,
  getLiveQuestions,
} from '../lib/pdfExtractor';
import {
  SYLLABUS_DATA,
  getTopicsForSubject,
  getSubtopicsForTopic,
} from '../data/syllabusData';
import {
  getNextQuizSlot,
  saveExtractedQuestionsAsQuiz,
  getAllQuizzes,
  getDerivedQuizId,
} from '../lib/quizManager';

interface AdminDashboardProps {
  onNavigate: (screen: ScreenType) => void;
  showToast: (msg: string, icon?: string) => void;
}

export interface StudentExactMetrics {
  totalQuestions: number;
  solvedCount: number;
  unsolvedCount: number;
  correctCount: number;
  accuracy: number;
  completionPercent: number;
  lastActiveFormatted: string;
  recentTopic?: string;
  submissions: any[];
}

export function computeStudentMetrics(
  student: Student,
  totalQuestions: number,
  allSubmissions: any[]
): StudentExactMetrics {
  const studentEmail = (student.email || '').trim().toLowerCase();

  // 1. All real recorded submissions for this student
  const studentSubs = allSubmissions.filter(
    (sub: any) =>
      sub &&
      sub.studentEmail &&
      sub.studentEmail.trim().toLowerCase() === studentEmail
  );

  // 2. Check last active practice session
  let lastActiveSession: any = null;
  try {
    const savedActive = localStorage.getItem(`navoquest_last_active_${student.email}`);
    if (savedActive) {
      lastActiveSession = JSON.parse(savedActive);
    }
  } catch (e) {
    console.error(e);
  }

  // 3. Format last active human readable time
  let lastActiveFormatted = student.lastActive || 'Just enrolled';
  if (studentSubs.length > 0) {
    const lastSub = studentSubs[studentSubs.length - 1];
    if (lastSub?.submittedAt) {
      try {
        const diffMs = Date.now() - new Date(lastSub.submittedAt).getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 1) lastActiveFormatted = 'Active just now';
        else if (diffMins < 60) lastActiveFormatted = `Active ${diffMins}m ago`;
        else {
          const diffHours = Math.floor(diffMins / 60);
          if (diffHours < 24) lastActiveFormatted = `Active ${diffHours}h ago`;
          else lastActiveFormatted = `Active ${Math.floor(diffHours / 24)}d ago`;
        }
      } catch {
        lastActiveFormatted = 'Active recently';
      }
    }
  } else if (lastActiveSession?.timestamp) {
    try {
      const diffMs = Date.now() - new Date(lastActiveSession.timestamp).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 1) lastActiveFormatted = 'Practiced just now';
      else if (diffMins < 60) lastActiveFormatted = `Practiced ${diffMins}m ago`;
      else lastActiveFormatted = 'Practiced recently';
    } catch {
      // fallback
    }
  }

  // 4. If student has submissions in localStorage:
  if (studentSubs.length > 0) {
    const uniqueSolvedIds = new Set<number>();
    let correctCount = 0;
    studentSubs.forEach((s: any) => {
      if (s.questionId) uniqueSolvedIds.add(s.questionId);
      if (s.isCorrect) correctCount += 1;
    });

    const solvedCount = uniqueSolvedIds.size;
    const unsolvedCount = Math.max(0, totalQuestions - solvedCount);
    const accuracy = Math.round((correctCount / studentSubs.length) * 100);
    const completionPercent = totalQuestions > 0 ? Math.round((solvedCount / totalQuestions) * 100) : 0;

    return {
      totalQuestions,
      solvedCount,
      unsolvedCount,
      correctCount,
      accuracy,
      completionPercent,
      lastActiveFormatted,
      recentTopic: lastActiveSession?.subtopic || lastActiveSession?.topic || 'Practice Drill',
      submissions: studentSubs,
    };
  }

  // 5. If this is a mock student without localStorage submissions yet:
  const isMock = MOCK_STUDENTS.some((m) => m.email.toLowerCase() === studentEmail);
  if (isMock && student.accuracy > 0 && totalQuestions > 0) {
    const mockSolved = Math.min(
      totalQuestions,
      Math.max(1, Math.round(totalQuestions * (student.accuracy / 100)))
    );
    const mockUnsolved = Math.max(0, totalQuestions - mockSolved);
    const completionPercent = Math.round((mockSolved / totalQuestions) * 100);

    return {
      totalQuestions,
      solvedCount: mockSolved,
      unsolvedCount: mockUnsolved,
      correctCount: Math.round(mockSolved * (student.accuracy / 100)),
      accuracy: student.accuracy,
      completionPercent,
      lastActiveFormatted: student.lastActive || 'Active recently',
      recentTopic: 'All Sections',
      submissions: [],
    };
  }

  // 6. Registered student with 0 submissions:
  return {
    totalQuestions,
    solvedCount: 0,
    unsolvedCount: totalQuestions,
    correctCount: 0,
    accuracy: 0,
    completionPercent: 0,
    lastActiveFormatted,
    recentTopic: lastActiveSession?.subtopic || lastActiveSession?.topic || undefined,
    submissions: [],
  };
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  onNavigate,
  showToast,
}) => {
  const [activeTab, setActiveTab] = useState<'uploader' | 'students'>('uploader');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const loadSignedUpStudents = () => {
    try {
      const saved = JSON.parse(localStorage.getItem('navoquest_students') || '[]');
      if (Array.isArray(saved) && saved.length > 0) {
        const savedEmails = new Set(saved.map((s: Student) => s.email.toLowerCase()));
        const filteredMock = MOCK_STUDENTS.filter((s) => !savedEmails.has(s.email.toLowerCase()));
        return [...saved, ...filteredMock];
      }
    } catch (e) {
      console.error(e);
    }
    return MOCK_STUDENTS;
  };

  const [studentsList, setStudentsList] = useState<Student[]>(loadSignedUpStudents);
  const [submissionsList, setSubmissionsList] = useState<any[]>(() => {
    try {
      const stored = localStorage.getItem('navoquest_submissions');
      return stored ? JSON.parse(stored) : [];
    } catch (e) {
      return [];
    }
  });

  const [selectedStudentForInspect, setSelectedStudentForInspect] = useState<{
    student: Student;
    metrics: StudentExactMetrics;
  } | null>(null);

  // Auto sync students whenever tab is switched to 'students'
  React.useEffect(() => {
    if (activeTab === 'students') {
      setStudentsList(loadSignedUpStudents());
      try {
        const stored = localStorage.getItem('navoquest_submissions');
        setSubmissionsList(stored ? JSON.parse(stored) : []);
      } catch (e) {
        setSubmissionsList([]);
      }
    }
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [stagedPDF, setStagedPDF] = useState<PDFUpload | null>(INITIAL_PDF_STAGED);
  const [taxonomyList, setTaxonomyList] = useState<TaxonomyItem[]>(INITIAL_TAXONOMY);
  const [liveBankCount, setLiveBankCount] = useState<number>(() => getLiveQuestions().length);
  const [quizzesList, setQuizzesList] = useState<Quiz[]>(() => getAllQuizzes());
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [inspectingQuiz, setInspectingQuiz] = useState<{ quiz: Quiz; questions: Question[] } | null>(null);
  const [previewSearch, setPreviewSearch] = useState('');
  const [previewFilter, setPreviewFilter] = useState<'all' | 'bold' | 'non-bold'>('all');
  const [previewPage, setPreviewPage] = useState(1);
  const [jumpToQNum, setJumpToQNum] = useState('');
  const PREVIEW_PAGE_SIZE = 25;

  useEffect(() => {
    const syncData = () => {
      setLiveBankCount(getLiveQuestions().length);
      setQuizzesList(getAllQuizzes());
      try {
        const stored = localStorage.getItem('navoquest_submissions');
        setSubmissionsList(stored ? JSON.parse(stored) : []);
      } catch (e) {
        setSubmissionsList([]);
      }
      setStudentsList(loadSignedUpStudents());
    };

    syncData();

    window.addEventListener('navoquest_questions_updated', syncData);
    window.addEventListener('navoquest_quizzes_updated', syncData);
    window.addEventListener('navoquest_submission_updated', syncData);
    window.addEventListener('storage', syncData);
    window.addEventListener('focus', syncData);

    return () => {
      window.removeEventListener('navoquest_questions_updated', syncData);
      window.removeEventListener('navoquest_quizzes_updated', syncData);
      window.removeEventListener('navoquest_submission_updated', syncData);
      window.removeEventListener('storage', syncData);
      window.removeEventListener('focus', syncData);
    };
  }, []);

  // Taxonomy Modal state
  const [modalType, setModalType] = useState<'Subject' | 'Topic' | 'Subtopic' | null>(null);
  const [modalInput, setModalInput] = useState('');
  const [selectedParent, setSelectedParent] = useState('The Natural World');

  // Hierarchy dropdown selections
  const [selectedSubject, setSelectedSubject] = useState('Environmental Studies (EVS)');
  const [selectedTopic, setSelectedTopic] = useState('The Natural World');
  const [selectedSubtopic, setSelectedSubtopic] = useState('Water Cycle');

  const availableTopics = getTopicsForSubject(selectedSubject);
  const availableSubtopics = getSubtopicsForTopic(selectedSubject, selectedTopic);

  const handleSubjectChange = (newSubj: string) => {
    setSelectedSubject(newSubj);
    const topics = getTopicsForSubject(newSubj);
    if (topics.length > 0) {
      setSelectedTopic(topics[0]);
      const subtopics = getSubtopicsForTopic(newSubj, topics[0]);
      setSelectedSubtopic(subtopics[0] || 'General Concepts');
    }
  };

  const handleTopicChange = (newTopic: string) => {
    setSelectedTopic(newTopic);
    const subtopics = getSubtopicsForTopic(selectedSubject, newTopic);
    setSelectedSubtopic(subtopics[0] || 'General Concepts');
  };

  // Filter students
  const filteredStudents = studentsList.filter((s) => {
    const matchesSearch =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      s.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.section && s.section.toLowerCase().includes(searchQuery.toLowerCase()));
    if (!matchesSearch) return false;

    const metrics = computeStudentMetrics(s, liveBankCount, submissionsList);
    if (sectionFilter === 'All') return true;
    if (sectionFilter === 'Active') return metrics.solvedCount > 0;
    if (sectionFilter === 'High') return metrics.accuracy >= 80;
    if (sectionFilter === 'NeedsHelp') return metrics.unsolvedCount > 0;
    return s.section === sectionFilter;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      showToast(`Extracting questions from ${file.name}...`, 'hourglass_top');
      const text = await extractTextFromPDF(file);
      const nextSlot = getNextQuizSlot(selectedSubtopic, selectedTopic, selectedSubject, file.name);

      const extractedQs = parseQuestionsFromText(
        text,
        selectedSubject,
        selectedTopic,
        selectedSubtopic,
        nextSlot.quizId,
        nextSlot.defaultTitle,
        file.name
      );

      const boldDetectedCount = extractedQs.filter((q) => q.boldAnswerDetected).length;
      const boldTag = boldDetectedCount > 0 ? `${boldDetectedCount} Bold Answers Detected` : 'Key Evaluated';

      setStagedPDF({
        id: `pdf_${Date.now()}`,
        fileName: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadedTime: 'Uploaded just now',
        questionsFound: extractedQs.length,
        subjectCategory: selectedSubject,
        targetTopic: selectedTopic,
        subtopic: selectedSubtopic,
        quizId: nextSlot.quizId,
        quizTitle: nextSlot.defaultTitle,
        quizNumber: nextSlot.quizNumber,
        tags: [
          `Creating as Quiz ${nextSlot.quizNumber}`,
          `${extractedQs.length} MCQs`,
          boldTag,
          'Independent Subtopic Quiz',
        ],
        status: 'Staged',
        extractedQuestions: extractedQs,
      });
      showToast(
        `Extracted ${extractedQs.length} questions from ${file.name} as Quiz ${nextSlot.quizNumber}${boldDetectedCount > 0 ? ` (${boldDetectedCount} bold answers detected)` : ''}!`,
        'cloud_done'
      );
    }
  };

  const handleToggleStagedCorrectAnswer = (qIdx: number, newAnswer: 'A' | 'B' | 'C' | 'D') => {
    if (!stagedPDF || !stagedPDF.extractedQuestions) return;
    const updated = stagedPDF.extractedQuestions.map((q, idx) => {
      if (idx === qIdx) {
        return {
          ...q,
          correctAnswer: newAnswer,
          boldAnswerDetected: true,
          explanation: `Option (${newAnswer}) designated as correct answer for evaluation.`,
        };
      }
      return q;
    });
    setStagedPDF({
      ...stagedPDF,
      extractedQuestions: updated,
    });
    showToast(`Question ${qIdx + 1} answer set to Option ${newAnswer}`, 'check_circle');
  };

  const handleCommitPDF = () => {
    if (!stagedPDF) return;
    if (stagedPDF.extractedQuestions && stagedPDF.extractedQuestions.length > 0) {
      const qzNumber = stagedPDF.quizNumber || 1;
      const qzTitle = stagedPDF.quizTitle || `Quiz ${qzNumber}`;
      saveExtractedQuestionsAsQuiz(stagedPDF.extractedQuestions, {
        quizId: stagedPDF.quizId || `quiz_${Date.now()}`,
        quizTitle: qzTitle,
        quizNumber: qzNumber,
        subjectCategory: stagedPDF.subjectCategory,
        targetTopic: stagedPDF.targetTopic,
        subtopic: stagedPDF.subtopic,
        fileName: stagedPDF.fileName,
      });
      showToast(
        `Added as ${qzTitle} under "${stagedPDF.subtopic}" (${stagedPDF.questionsFound} Qs)! Existing quizzes preserved.`,
        'verified'
      );
    } else {
      showToast('No questions found to commit.', 'error');
    }
    setStagedPDF(null);
  };

  const handleResetBankWithPDF = () => {
    if (!stagedPDF || !stagedPDF.extractedQuestions || stagedPDF.extractedQuestions.length === 0) return;
    resetLiveBankWithQuestions(stagedPDF.extractedQuestions);
    showToast(
      `Question Bank reset! It now contains all ${stagedPDF.extractedQuestions.length} questions from ${stagedPDF.fileName}.`,
      'verified'
    );
    setStagedPDF(null);
  };

  const handleSaveTaxonomy = () => {
    if (!modalInput.trim() || !modalType) return;
    const newItem: TaxonomyItem = {
      id: `tax_${Date.now()}`,
      type: modalType,
      name: modalInput.trim(),
      parentName: modalType !== 'Subject' ? selectedParent : undefined,
    };
    setTaxonomyList((prev) => [...prev, newItem]);
    showToast(`Added new ${modalType}: "${modalInput.trim()}"`, 'check');
    setModalInput('');
    setModalType(null);
  };

  return (
    <div className="w-full min-h-screen bg-[#faf8ff] text-[#131b2e] pb-20">
      {/* Drawer Overlay */}
      {isDrawerOpen && (
        <div
          onClick={() => setIsDrawerOpen(false)}
          className="fixed inset-0 bg-[#283044]/50 backdrop-blur-xs z-50 transition-opacity"
        />
      )}

      {/* Navigation Drawer */}
      <aside
        className={`fixed top-0 left-0 bottom-0 w-4/5 max-w-[300px] bg-white z-50 transform transition-transform duration-300 ease-in-out flex flex-col pt-5 pb-6 px-4 shadow-2xl ${
          isDrawerOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between pb-4 border-b border-[#eaedff] mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-[#3525cd] flex items-center justify-center text-white">
              <span className="material-symbols-outlined text-[20px]">
                star
              </span>
            </div>
            <span className="font-bold text-[18px] text-[#3525cd]">Admin Hub</span>
          </div>
          <button
            onClick={() => setIsDrawerOpen(false)}
            className="p-1 rounded-lg text-[#777587] hover:text-[#131b2e]"
          >
            <span className="material-symbols-outlined text-[22px]">close</span>
          </button>
        </div>

        <div className="mb-3 px-1">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#777587]">
            Teacher & Cohort Admin
          </p>
        </div>

        <nav className="space-y-1 flex-1">
          <button
            onClick={() => {
              setActiveTab('uploader');
              setIsDrawerOpen(false);
            }}
            className="w-full flex items-center px-3 py-2.5 rounded-xl bg-[#4f46e5] text-white font-bold text-[13px] shadow-xs cursor-pointer"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">
              analytics
            </span>
            Batch Diagnostics
          </button>
          <button
            onClick={() => {
              setActiveTab('uploader');
              setIsDrawerOpen(false);
            }}
            className="w-full flex items-center px-3 py-2.5 rounded-xl text-[#464555] font-semibold text-[13px] hover:bg-[#eaedff] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">
              quiz
            </span>
            Question Bank ({liveBankCount} Qs)
          </button>
          <button
            onClick={() => {
              setActiveTab('students');
              setIsDrawerOpen(false);
            }}
            className="w-full flex items-center px-3 py-2.5 rounded-xl text-[#464555] font-semibold text-[13px] hover:bg-[#eaedff] transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined mr-3 text-[20px]">
              groups
            </span>
            Student Roster
          </button>
        </nav>

        <div className="pt-4 border-t border-[#eaedff]">
          <button
            onClick={() => onNavigate('practice-quiz')}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-[#eaedff] text-[#3525cd] font-bold text-[13px] cursor-pointer"
          >
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">
                arrow_back
              </span>
              Back to Student View
            </span>
            <span className="material-symbols-outlined text-[16px]">school</span>
          </button>
        </div>
      </aside>

      {/* Main Container */}
      <main className="px-4 py-4 space-y-4 max-w-md mx-auto">
        {/* Top Header Card */}
        <div className="bg-white p-3.5 rounded-2xl shadow-xs border border-[#eaedff]">
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="text-[16px] text-[#131b2e] font-bold leading-snug">
                  Curriculum Engine
                </h1>
                <span className="text-[10px] bg-[#006e4b] text-[#67f4b7] px-1.5 py-0.5 rounded-full font-bold">
                  JNVST '25
                </span>
              </div>
              <p className="text-[12px] text-[#464555] leading-tight mt-0.5">
                Navodaya Selection Test Session 2025–26 • Batch 6-North
              </p>
            </div>
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="bg-[#f2f3ff] p-1 rounded-xl flex items-center shadow-inner text-[13px] font-bold">
          <button
            onClick={() => setActiveTab('uploader')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'uploader'
                ? 'bg-white text-[#3525cd] shadow-xs'
                : 'text-[#464555] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              cloud_upload
            </span>
            PDF Ingestion
          </button>
          <button
            onClick={() => setActiveTab('students')}
            className={`flex-1 py-2 rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'students'
                ? 'bg-white text-[#3525cd] shadow-xs'
                : 'text-[#464555] hover:text-[#131b2e]'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">groups</span>
            Student Roster
          </button>
        </div>

        {/* TAB 1: PDF QUESTION IMPORTER */}
        {activeTab === 'uploader' && (
          <section className="space-y-4">
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-[16px] text-[#131b2e] font-bold">
                    PDF Question Importer
                  </h2>
                  <p className="text-[12px] text-[#464555]">
                    Auto-detect items & bind to JNVST hierarchy
                  </p>
                </div>
                <div className="w-8 h-8 rounded-lg bg-[#3525cd]/10 flex items-center justify-center text-[#3525cd]">
                  <span className="material-symbols-outlined text-[20px]">
                    cloud_upload
                  </span>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div className="relative group cursor-pointer bg-[#f2f3ff] rounded-xl p-5 text-center border-2 border-dashed border-[#c7c4d8] hover:border-[#3525cd] transition-all">
                <input
                  type="file"
                  accept=".pdf"
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <div className="flex flex-col items-center justify-center space-y-2">
                  <div className="w-12 h-12 rounded-2xl bg-white shadow-xs flex items-center justify-center text-[#3525cd]">
                    <span className="material-symbols-outlined text-[28px]">
                      upload_file
                    </span>
                  </div>
                  <div>
                    <p className="text-[14px] text-[#131b2e] font-bold">
                      Tap to Upload Question PDF
                    </p>
                    <span className="text-[11px] text-[#777587] block">
                      Bilingual scanned tests (Up to 50MB)
                    </span>
                  </div>
                  <span className="text-[11px] bg-[#e2dfff] text-[#0f0069] px-3 py-1 rounded-full font-bold flex items-center gap-1 shadow-2xs">
                    <span className="material-symbols-outlined text-[13px]">
                      smart_toy
                    </span>{' '}
                    AI Question Extractor
                  </span>
                </div>
              </div>

              {/* Hierarchy Dropdowns */}
              <div className="space-y-3 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] uppercase font-bold tracking-wider text-[#777587]">
                    1. JNVST Hierarchy Binding
                  </span>
                  <span className="text-[11px] text-[#3525cd] font-bold">
                    2025 Pattern
                  </span>
                </div>

                {/* Subject Category */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[#131b2e]">
                    <label className="text-[12px] font-bold">Subject Category</label>
                    <button
                      type="button"
                      onClick={() => setModalType('Subject')}
                      className="text-[11px] text-[#3525cd] font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        add_circle
                      </span>{' '}
                      + Add
                    </button>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedSubject}
                      onChange={(e) => handleSubjectChange(e.target.value)}
                      className="w-full h-11 bg-[#f2f3ff] text-[#131b2e] rounded-xl px-3 pr-8 appearance-none text-[12px] font-semibold focus:outline-none focus:ring-1 focus:ring-[#3525cd] border-0"
                    >
                      {SYLLABUS_DATA.map((s) => (
                        <option key={s.name} value={s.name}>
                          {s.name} ({s.code} - {s.questionCount} Qs)
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-[#777587] text-[18px]">
                      unfold_more
                    </span>
                  </div>
                </div>

                {/* Target Topic */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[#131b2e]">
                    <label className="text-[12px] font-bold">Target Topic</label>
                    <button
                      type="button"
                      onClick={() => setModalType('Topic')}
                      className="text-[11px] text-[#3525cd] font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        add_circle
                      </span>{' '}
                      + Add
                    </button>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedTopic}
                      onChange={(e) => handleTopicChange(e.target.value)}
                      className="w-full h-11 bg-[#f2f3ff] text-[#131b2e] rounded-xl px-3 pr-8 appearance-none text-[12px] font-semibold focus:outline-none focus:ring-1 focus:ring-[#3525cd] border-0"
                    >
                      {availableTopics.map((top) => (
                        <option key={top} value={top}>
                          {top}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-[#777587] text-[18px]">
                      unfold_more
                    </span>
                  </div>
                </div>

                {/* Subtopic */}
                <div className="space-y-1">
                  <div className="flex justify-between items-center text-[#131b2e]">
                    <label className="text-[12px] font-bold">Subtopic / Micro-Skill</label>
                    <button
                      type="button"
                      onClick={() => setModalType('Subtopic')}
                      className="text-[11px] text-[#3525cd] font-bold flex items-center gap-0.5 cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[14px]">
                        add_circle
                      </span>{' '}
                      + Add
                    </button>
                  </div>
                  <div className="relative">
                    <select
                      value={selectedSubtopic}
                      onChange={(e) => setSelectedSubtopic(e.target.value)}
                      className="w-full h-11 bg-[#f2f3ff] text-[#131b2e] rounded-xl px-3 pr-8 appearance-none text-[12px] font-semibold focus:outline-none focus:ring-1 focus:ring-[#3525cd] border-0"
                    >
                      {availableSubtopics.map((sub) => (
                        <option key={sub} value={sub}>
                          {sub}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined absolute right-2.5 top-2.5 pointer-events-none text-[#777587] text-[18px]">
                      unfold_more
                    </span>
                  </div>
                </div>
              </div>

              {/* Ingested PDF Staged Card */}
              {stagedPDF && (
                <div className="p-3.5 bg-[#e2e7ff] rounded-xl space-y-2.5 border border-[#c7c4d8]">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-lg bg-white flex items-center justify-center text-[#ba1a1a] flex-shrink-0">
                        <span className="material-symbols-outlined text-[22px]">
                          description
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] text-[#131b2e] font-bold truncate max-w-[170px]">
                          {stagedPDF.fileName}
                        </p>
                        <span className="text-[11px] text-[#464555]">
                          {stagedPDF.size} • {stagedPDF.uploadedTime}
                        </span>
                      </div>
                    </div>
                    <span className="text-[10px] bg-[#006e4b] text-[#67f4b7] px-2 py-0.5 rounded-full font-bold flex-shrink-0">
                      {stagedPDF.questionsFound} Qs Found
                    </span>
                  </div>

                  {/* Distinct Quiz Settings */}
                  <div className="bg-white/90 p-2.5 rounded-lg border border-[#c7c4d8]/80 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between text-[#3525cd] font-bold">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-[15px]">quiz</span>
                        <span>Saving As Subtopic Quiz:</span>
                      </span>
                      <span className="bg-[#3525cd] text-white px-2 py-0.5 rounded-full text-[10px] font-extrabold">
                        Quiz #{stagedPDF.quizNumber || 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 pt-0.5">
                      <span className="text-[#464555] font-semibold text-[11px] flex-shrink-0">Quiz Title:</span>
                      <input
                        type="text"
                        value={stagedPDF.quizTitle || ''}
                        onChange={(e) => setStagedPDF({ ...stagedPDF, quizTitle: e.target.value })}
                        placeholder={`Quiz ${stagedPDF.quizNumber || 1}: Title`}
                        className="flex-1 px-2.5 py-1 bg-white border border-[#c7c4d8] rounded-md text-[11px] font-bold text-[#131b2e] focus:outline-hidden focus:border-[#3525cd]"
                      />
                    </div>

                    <p className="text-[10px] text-[#464555] leading-snug">
                      🎯 Target Subtopic: <strong className="text-[#131b2e]">{stagedPDF.subtopic}</strong> • Adds as another independent quiz so question counts are not inflated together.
                    </p>
                  </div>

                  {/* Tags */}
                  <div className="flex flex-wrap gap-1 pt-1">
                    {stagedPDF.tags.map((tag, idx) => (
                      <span
                        key={idx}
                        className="text-[10px] bg-white px-2 py-0.5 rounded text-[#131b2e] font-medium flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-[12px] text-[#005338]">
                          check_circle
                        </span>{' '}
                        {tag}
                      </span>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-col gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      {stagedPDF.extractedQuestions && stagedPDF.extractedQuestions.length > 0 && (
                        <button
                          onClick={() => {
                            setInspectingQuiz(null);
                            setShowPreviewModal(true);
                          }}
                          className="py-2.5 px-3 bg-white text-[#3525cd] border border-[#c7c4d8] rounded-xl text-[12px] font-bold hover:bg-[#f2f3ff] transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                        >
                          <span className="material-symbols-outlined text-[16px]">visibility</span>
                          Preview All ({stagedPDF.questionsFound} Qs)
                        </button>
                      )}
                      <button
                        onClick={handleCommitPDF}
                        className="flex-1 py-2.5 px-3 bg-[#3525cd] text-white rounded-xl text-[12px] font-bold hover:bg-[#2a1daf] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">
                          publish
                        </span>{' '}
                        Add as Quiz #{stagedPDF.quizNumber || 1} ({stagedPDF.questionsFound} Qs)
                      </button>
                      <button
                        onClick={() => setStagedPDF(null)}
                        className="p-2.5 bg-white text-[#777587] hover:text-[#ba1a1a] rounded-xl transition-colors cursor-pointer"
                        title="Discard upload"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          delete
                        </span>
                      </button>
                    </div>

                    {stagedPDF.extractedQuestions && stagedPDF.extractedQuestions.length > 0 && (
                      <button
                        onClick={handleResetBankWithPDF}
                        className="w-full py-2 px-3 bg-white text-[#ba1a1a] border border-[#ba1a1a]/30 rounded-xl text-[11px] font-semibold hover:bg-[#fff5f5] transition-all flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[14px]">sync_saved_locally</span>
                        Replace entire Question Bank with this PDF ({stagedPDF.questionsFound} questions)
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* SECTION: SUBTOPIC QUIZZES & QUESTION BANKS */}
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] space-y-3.5 mt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-[#3525cd] text-[20px]">library_books</span>
                    <h3 className="text-[15px] font-bold text-[#131b2e]">
                      Subtopic Quizzes & Question Banks
                    </h3>
                  </div>
                  <p className="text-[11px] text-[#464555] mt-0.5">
                    Each uploaded PDF is registered as an independent quiz under its subtopic, keeping question counts cleanly segmented for students.
                  </p>
                </div>
                <span className="text-[11px] font-extrabold bg-[#e2dfff] text-[#3525cd] px-2.5 py-1 rounded-full">
                  {quizzesList.length} Total Quizzes Active
                </span>
              </div>

              {/* Quizzes grouped by Subtopic */}
              {(() => {
                const subtopicMap = new Map<string, { subject: string; topic: string; subtopic: string; quizzes: Quiz[] }>();
                quizzesList.forEach((qz) => {
                  const key = `${qz.section}_${qz.topic}_${qz.subtopic}`;
                  if (!subtopicMap.has(key)) {
                    subtopicMap.set(key, {
                      subject: qz.section,
                      topic: qz.topic,
                      subtopic: qz.subtopic,
                      quizzes: [],
                    });
                  }
                  subtopicMap.get(key)!.quizzes.push(qz);
                });

                const entries = Array.from(subtopicMap.values());
                if (entries.length === 0) {
                  return (
                    <div className="p-4 bg-[#f8f9ff] rounded-xl text-center text-[12px] text-[#777587]">
                      No quizzes recorded yet. Upload a PDF above to create the first quiz!
                    </div>
                  );
                }

                return (
                  <div className="space-y-3">
                    {entries.map((entry, eIdx) => (
                      <div key={eIdx} className="bg-[#f8f9ff] border border-[#eaedff] rounded-xl p-3 space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[#e2dfff] text-[#3525cd]">
                                {entry.subject}
                              </span>
                              <span className="text-[11px] text-[#777587] font-semibold">
                                › {entry.topic}
                              </span>
                            </div>
                            <h4 className="font-bold text-[13px] text-[#131b2e] mt-1 truncate">
                              {entry.subtopic}
                            </h4>
                          </div>
                          <span className="text-[10px] font-bold text-[#006e4b] bg-[#e2f3ec] px-2 py-0.5 rounded-full flex-shrink-0">
                            {entry.quizzes.length} {entry.quizzes.length === 1 ? 'Quiz' : 'Quizzes'}
                          </span>
                        </div>

                        {/* List of quizzes under this subtopic */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                          {entry.quizzes.map((qz) => (
                            <div
                              key={qz.id}
                              className="bg-white p-2.5 rounded-lg border border-[#eaedff] shadow-2xs flex flex-col justify-between gap-2 hover:border-[#3525cd]/40 transition-all"
                            >
                              <div className="space-y-1">
                                <div className="flex items-center justify-between gap-1.5">
                                  <span className="text-[10px] font-extrabold bg-[#f2f3ff] text-[#3525cd] px-2 py-0.5 rounded-md border border-[#3525cd]/20">
                                    Quiz #{qz.quizNumber}
                                  </span>
                                  <span className="text-[10px] font-bold text-[#131b2e] bg-[#f8f9ff] px-1.5 py-0.5 rounded">
                                    {qz.questionCount} MCQs
                                  </span>
                                </div>
                                <p className="font-bold text-[12px] text-[#131b2e] line-clamp-1">
                                  {qz.title}
                                </p>
                                {qz.sourceFile && (
                                  <p className="text-[10px] text-[#777587] truncate flex items-center gap-1">
                                    <span className="material-symbols-outlined text-[12px]">picture_as_pdf</span>
                                    {qz.sourceFile}
                                  </p>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 pt-1 border-t border-[#f2f3ff]">
                                <button
                                  onClick={() => {
                                    const allQs = getLiveQuestions();
                                    const qzQs = allQs.filter(
                                      (q) => (q.quizId || getDerivedQuizId(q)) === qz.id
                                    );
                                    setInspectingQuiz({ quiz: qz, questions: qzQs });
                                    setShowPreviewModal(true);
                                  }}
                                  className="flex-1 py-1 px-2 bg-[#f2f3ff] hover:bg-[#e2dfff] text-[#3525cd] rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                                >
                                  <span className="material-symbols-outlined text-[13px]">visibility</span>
                                  Preview ({qz.questionCount} Qs)
                                </button>
                                <button
                                  onClick={() => {
                                    onNavigate('practice-quiz', {
                                      subject: qz.section,
                                      topic: qz.topic,
                                      subtopic: qz.subtopic,
                                      quizId: qz.id,
                                      quizTitle: qz.title,
                                    });
                                  }}
                                  className="py-1 px-2 bg-[#3525cd] text-white hover:bg-[#2a1daf] rounded-md text-[10px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                                  title="Test Quiz in Student Mode"
                                >
                                  <span className="material-symbols-outlined text-[13px]">play_arrow</span>
                                  Test
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          </section>
        )}

        {/* TAB 2: STUDENT ROSTER DIRECTORY */}
        {activeTab === 'students' && (
          <section className="space-y-3">
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] space-y-3.5">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div>
                  <h2 className="text-[16px] text-[#131b2e] font-bold">
                    Student Directory
                  </h2>
                  <p className="text-[12px] text-[#464555]">
                    Class 6 Aspirants • {studentsList.length} Total Enrolled
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#006e4b] bg-[#e2f3ec] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    <span>Live Auto-Sync Active</span>
                  </span>
                </div>
              </div>

              {/* Search Bar */}
              <div className="relative w-full">
                <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#777587] text-[18px]">
                  search
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by student name, roll number, or email..."
                  className="w-full h-10 bg-[#f2f3ff] text-[#131b2e] rounded-xl pl-9 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#3525cd] border-0"
                />
              </div>

              {/* Filter Pills */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-[11px] font-bold">
                {[
                  { id: 'All', label: `All Students (${studentsList.length})` },
                  { id: 'Active', label: 'Active Learners' },
                  { id: 'High', label: 'High Accuracy (≥80%)' },
                  { id: 'NeedsHelp', label: 'Needs Practice' },
                  { id: 'Sec 6-A', label: 'Sec 6-A' },
                  { id: 'Sec 6-B', label: 'Sec 6-B' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setSectionFilter(f.id)}
                    className={`px-3 py-1.5 rounded-xl transition-all cursor-pointer whitespace-nowrap ${
                      sectionFilter === f.id
                        ? 'bg-[#3525cd] text-white shadow-xs'
                        : 'bg-[#f2f3ff] text-[#464555] hover:bg-[#e2e7ff] hover:text-[#3525cd]'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Student Cards List */}
              <div className="space-y-3 pt-1">
                {filteredStudents.length === 0 ? (
                  <div className="text-center py-10 text-[#777587] text-[13px]">
                    No students match the selected filter or search query.
                  </div>
                ) : (
                  filteredStudents.map((s) => {
                    const metrics = computeStudentMetrics(s, liveBankCount, submissionsList);
                    const isAllSolved = metrics.unsolvedCount === 0 && metrics.totalQuestions > 0;

                    return (
                      <div
                        key={s.id}
                        className="p-4 rounded-2xl bg-white border border-[#eaedff] shadow-xs space-y-3 transition-all hover:border-[#c7c4d8]"
                      >
                        {/* Top row: Avatar, Name, Email, Exact Unsolved Badge */}
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <div className="w-10 h-10 rounded-xl bg-[#e2dfff] text-[#3525cd] font-black flex items-center justify-center text-[13px] flex-shrink-0 shadow-2xs">
                              {s.avatarInitials}
                            </div>
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2 flex-wrap">
                                <p className="text-[14px] font-extrabold text-[#131b2e]">
                                  {s.name}
                                </p>
                                <span className="text-[10px] font-bold text-[#464555] bg-[#f2f3ff] px-2 py-0.5 rounded-md border border-[#eaedff]">
                                  {s.section || 'Class 6'}{s.rollNo ? ` • Roll ${s.rollNo}` : ''}
                                </span>
                                {s.status && (
                                  <span
                                    className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                      s.status === 'Top Performer'
                                        ? 'bg-[#e2f3ec] text-[#006e4b]'
                                        : s.status === 'Needs Help'
                                        ? 'bg-[#fff0f0] text-[#ba1a1a]'
                                        : 'bg-[#e2e7ff] text-[#3525cd]'
                                    }`}
                                  >
                                    {s.status}
                                  </span>
                                )}
                              </div>
                              <p className="text-[11px] text-[#777587] font-medium">{s.email}</p>
                            </div>
                          </div>

                          {/* Exact Unsolved count from student data */}
                          <div className="flex flex-col items-end gap-1 flex-shrink-0">
                            {isAllSolved ? (
                              <span className="text-[11px] bg-[#e8f5e9] text-[#006e4b] px-3 py-1 rounded-full font-black flex items-center gap-1.5 border border-[#006e4b]/20 shadow-2xs">
                                <span className="material-symbols-outlined text-[14px]">check_circle</span>
                                0 Unsolved (All Done!)
                              </span>
                            ) : (
                              <span className="text-[11px] bg-[#fff3e0] text-[#b25e00] px-3 py-1 rounded-full font-black flex items-center gap-1.5 border border-[#b25e00]/25 shadow-2xs">
                                <span className="material-symbols-outlined text-[14px]">pending_actions</span>
                                {metrics.unsolvedCount} Unsolved Questions
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Middle row: Solved progress, Accuracy, Last Active */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-1 border-t border-[#f2f3ff] text-[11px]">
                          {/* Solved Progress */}
                          <div className="bg-[#f8f9ff] p-2.5 rounded-xl border border-[#eaedff]">
                            <span className="text-[10px] font-bold text-[#777587] uppercase tracking-wider block">
                              Questions Solved
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span className="text-[14px] font-extrabold text-[#131b2e]">
                                {metrics.solvedCount}
                              </span>
                              <span className="text-[11px] text-[#777587] font-medium">
                                / {metrics.totalQuestions} ({metrics.completionPercent}%)
                              </span>
                            </div>
                          </div>

                          {/* Accuracy */}
                          <div className="bg-[#f8f9ff] p-2.5 rounded-xl border border-[#eaedff]">
                            <span className="text-[10px] font-bold text-[#777587] uppercase tracking-wider block">
                              Test Accuracy
                            </span>
                            <div className="flex items-baseline gap-1 mt-0.5">
                              <span
                                className={`text-[14px] font-extrabold ${
                                  metrics.accuracy >= 80
                                    ? 'text-[#006e4b]'
                                    : metrics.accuracy >= 50
                                    ? 'text-[#3525cd]'
                                    : metrics.solvedCount === 0
                                    ? 'text-[#777587]'
                                    : 'text-[#ba1a1a]'
                                }`}
                              >
                                {metrics.accuracy}%
                              </span>
                              <span className="text-[10px] text-[#777587]">
                                ({metrics.correctCount} correct)
                              </span>
                            </div>
                          </div>

                          {/* Last Active */}
                          <div className="bg-[#f8f9ff] p-2.5 rounded-xl border border-[#eaedff] col-span-2 sm:col-span-1 flex flex-col justify-center">
                            <span className="text-[10px] font-bold text-[#777587] uppercase tracking-wider block">
                              Last Active
                            </span>
                            <span className="text-[12px] font-bold text-[#131b2e] truncate mt-0.5">
                              {metrics.lastActiveFormatted}
                            </span>
                            {metrics.recentTopic && (
                              <span className="text-[10px] text-[#3525cd] font-semibold truncate">
                                {metrics.recentTopic}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="space-y-1">
                          <div className="w-full bg-[#f2f3ff] h-1.5 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all duration-300 ${
                                isAllSolved ? 'bg-[#006e4b]' : 'bg-[#3525cd]'
                              }`}
                              style={{ width: `${Math.min(100, metrics.completionPercent)}%` }}
                            />
                          </div>
                        </div>

                        {/* Action Footer */}
                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[#f2f3ff]">
                          <span className="text-[11px] text-[#777587]">
                            {metrics.submissions.length > 0
                              ? `${metrics.submissions.length} practice submission${metrics.submissions.length > 1 ? 's' : ''} logged`
                              : metrics.solvedCount > 0
                              ? `${metrics.solvedCount} questions completed`
                              : 'Ready to practice'}
                          </span>

                          <button
                            onClick={() => setSelectedStudentForInspect({ student: s, metrics })}
                            className="px-3 py-1.5 rounded-xl bg-[#f2f3ff] hover:bg-[#e2e7ff] text-[#3525cd] text-[11px] font-extrabold transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <span className="material-symbols-outlined text-[15px]">visibility</span>
                            Inspect Answers & Activity
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </section>
        )}
      </main>

      {/* Taxonomy Creation Modal */}
      {modalType && (
        <div className="fixed inset-0 z-50 bg-[#283044]/50 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-2xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#eaedff] pb-3">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-[#e2dfff] text-[#3525cd] flex items-center justify-center">
                  <span className="material-symbols-outlined text-[20px]">
                    account_tree
                  </span>
                </div>
                <div>
                  <h3 className="text-[14px] font-bold text-[#131b2e]">
                    Create New {modalType}
                  </h3>
                  <p className="text-[11px] text-[#464555]">
                    JNVST 2025 Taxonomy Editor
                  </p>
                </div>
              </div>
              <button
                onClick={() => setModalType(null)}
                className="text-[#777587] hover:text-[#131b2e] p-1 rounded-lg cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">
                  close
                </span>
              </button>
            </div>

            <div className="space-y-3 text-[12px]">
              <div className="space-y-1">
                <label className="font-semibold text-[#131b2e]">
                  {modalType} Name / Designation
                </label>
                <input
                  type="text"
                  value={modalInput}
                  onChange={(e) => setModalInput(e.target.value)}
                  placeholder={`e.g. ${
                    modalType === 'Subject'
                      ? 'Higher Reasoning'
                      : modalType === 'Topic'
                      ? 'Speed & Distance'
                      : 'Quadrilateral Shifts'
                  }`}
                  className="w-full h-11 bg-[#f2f3ff] text-[#131b2e] rounded-xl px-3 focus:outline-none focus:ring-1 focus:ring-[#3525cd] border-0"
                />
              </div>

              {modalType !== 'Subject' && (
                <div className="space-y-1">
                  <label className="font-semibold text-[#131b2e]">
                    Under Parent Topic
                  </label>
                  <select
                    value={selectedParent}
                    onChange={(e) => setSelectedParent(e.target.value)}
                    className="w-full h-11 bg-[#f2f3ff] text-[#131b2e] rounded-xl px-3 font-semibold border-0 focus:outline-none"
                  >
                    <option>The Natural World</option>
                    <option>Number and Numeric System</option>
                    <option>Reading Comprehension – Passage 1</option>
                  </select>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[#eaedff]">
              <button
                onClick={() => setModalType(null)}
                className="px-4 py-2.5 rounded-xl bg-[#eaedff] text-[#131b2e] text-[12px] font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveTaxonomy}
                className="flex-1 py-2.5 rounded-xl bg-[#3525cd] text-white font-bold text-[12px] hover:bg-[#2a1daf] shadow-xs flex items-center justify-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">
                  check
                </span>{' '}
                Save & Add
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extracted Questions Preview Modal */}
      {showPreviewModal && (stagedPDF?.extractedQuestions?.length || inspectingQuiz?.questions?.length) && (
        (() => {
          const activeQuestions = stagedPDF?.extractedQuestions || inspectingQuiz?.questions || [];
          const modalTitle = stagedPDF
            ? (stagedPDF.quizTitle || `Quiz ${stagedPDF.quizNumber || 1}`)
            : inspectingQuiz?.quiz.title || 'Quiz Preview';
          const modalSubtitle = stagedPDF
            ? `${stagedPDF.fileName} • ${stagedPDF.subtopic}`
            : `${inspectingQuiz?.quiz.subtopic} • ${inspectingQuiz?.quiz.sourceFile || 'Live Bank'}`;
          const isStaged = Boolean(stagedPDF && stagedPDF.extractedQuestions);

          return (
            <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
              <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl border border-[#eaedff] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                {/* Modal Header */}
                <div className="p-4 border-b border-[#eaedff] flex items-center justify-between bg-[#f8f9ff]">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[#3525cd] text-[22px]">visibility</span>
                      <h3 className="font-extrabold text-[16px] text-[#131b2e]">
                        {modalTitle}
                      </h3>
                    </div>
                    <p className="text-[12px] text-[#464555] mt-0.5">
                      {modalSubtitle} • {activeQuestions.length} questions
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setShowPreviewModal(false);
                      setInspectingQuiz(null);
                    }}
                    className="w-8 h-8 rounded-full bg-white hover:bg-[#eaedff] flex items-center justify-center text-[#777587] transition-colors cursor-pointer border border-[#eaedff]"
                  >
                    <span className="material-symbols-outlined text-[18px]">close</span>
                  </button>
                </div>

                {/* Bold Evaluation Info Bar */}
                <div className="bg-[#f0fdf4] border-b border-[#bbf7d0] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-[#166534]">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-[#15803d]">format_bold</span>
                    <span>
                      <strong>Bold-Based Answer Evaluation:</strong> Correct options are detected from bold formatting in the PDF and evaluate student tests accordingly.
                    </span>
                  </div>
                  <span className="font-bold bg-[#dcfce7] px-2 py-0.5 rounded text-[11px] text-[#166534] flex-shrink-0">
                    {activeQuestions.filter((q) => q.boldAnswerDetected).length} / {activeQuestions.length} Bold Answers
                  </span>
                </div>

                {/* Search, Filter & Quick-Jump Controls */}
                <div className="bg-white border-b border-[#eaedff] px-4 py-2.5 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="relative flex-1 min-w-[200px]">
                    <span className="material-symbols-outlined absolute left-2.5 top-1/2 -translate-y-1/2 text-[#777587] text-[17px]">
                      search
                    </span>
                    <input
                      type="text"
                      value={previewSearch}
                      onChange={(e) => {
                        setPreviewSearch(e.target.value);
                        setPreviewPage(1);
                      }}
                      placeholder="Search questions or options..."
                      className="w-full pl-8 pr-3 py-1.5 bg-[#f8f9ff] border border-[#eaedff] rounded-xl text-[12px] text-[#131b2e] focus:outline-hidden focus:border-[#3525cd]"
                    />
                    {previewSearch && (
                      <button
                        onClick={() => {
                          setPreviewSearch('');
                          setPreviewPage(1);
                        }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#777587] hover:text-[#131b2e] text-[14px]"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  {/* Filter Tabs */}
                  <div className="flex items-center gap-1 bg-[#f8f9ff] p-1 rounded-xl border border-[#eaedff]">
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewFilter('all');
                        setPreviewPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        previewFilter === 'all' ? 'bg-[#3525cd] text-white shadow-xs' : 'text-[#777587] hover:text-[#131b2e]'
                      }`}
                    >
                      All ({activeQuestions.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewFilter('bold');
                        setPreviewPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        previewFilter === 'bold' ? 'bg-[#006e4b] text-white shadow-xs' : 'text-[#777587] hover:text-[#006e4b]'
                      }`}
                    >
                      Bold ({activeQuestions.filter((q) => q.boldAnswerDetected).length})
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPreviewFilter('non-bold');
                        setPreviewPage(1);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                        previewFilter === 'non-bold' ? 'bg-[#565f71] text-white shadow-xs' : 'text-[#777587] hover:text-[#131b2e]'
                      }`}
                    >
                      Other ({activeQuestions.filter((q) => !q.boldAnswerDetected).length})
                    </button>
                  </div>

                  {/* Jump to Question Number */}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const targetNum = parseInt(jumpToQNum, 10);
                      if (!isNaN(targetNum) && targetNum >= 1 && targetNum <= activeQuestions.length) {
                        const targetIdx = targetNum - 1;
                        const newPage = Math.floor(targetIdx / PREVIEW_PAGE_SIZE) + 1;
                        setPreviewPage(newPage);
                        setPreviewSearch('');
                        setPreviewFilter('all');
                        setJumpToQNum('');
                      }
                    }}
                    className="flex items-center gap-1"
                  >
                    <span className="text-[11px] font-semibold text-[#777587]">Go to Q#</span>
                    <input
                      type="number"
                      min="1"
                      max={activeQuestions.length}
                      value={jumpToQNum}
                      onChange={(e) => setJumpToQNum(e.target.value)}
                      placeholder={`1-${activeQuestions.length}`}
                      className="w-16 px-2 py-1 bg-[#f8f9ff] border border-[#eaedff] rounded-lg text-[11px] font-bold text-center text-[#131b2e] focus:outline-hidden focus:border-[#3525cd]"
                    />
                    <button
                      type="submit"
                      className="px-2 py-1 bg-white border border-[#c7c4d8] hover:bg-[#eaedff] rounded-lg text-[11px] font-bold text-[#3525cd] cursor-pointer"
                    >
                      Go
                    </button>
                  </form>
                </div>

                {/* Questions List with Pagination */}
                {(() => {
                  const filteredQuestions = activeQuestions
                    .map((q, originalIdx) => ({ q, originalIdx }))
                    .filter(({ q, originalIdx }) => {
                      if (previewFilter === 'bold' && !q.boldAnswerDetected) return false;
                      if (previewFilter === 'non-bold' && q.boldAnswerDetected) return false;
                      if (previewSearch.trim()) {
                        const query = previewSearch.toLowerCase();
                        const matchQNum = `q${originalIdx + 1}`.includes(query) || `${originalIdx + 1}` === query;
                        const matchPrompt = q.prompt.toLowerCase().includes(query);
                        const matchOpts = q.options.some((o) => o.text.toLowerCase().includes(query));
                        return matchQNum || matchPrompt || matchOpts;
                      }
                      return true;
                    });

                  const totalFiltered = filteredQuestions.length;
                  const totalPages = Math.ceil(totalFiltered / PREVIEW_PAGE_SIZE) || 1;
                  const currentPage = Math.min(Math.max(1, previewPage), totalPages);
                  const startIndex = (currentPage - 1) * PREVIEW_PAGE_SIZE;
                  const paginatedQuestions = filteredQuestions.slice(startIndex, startIndex + PREVIEW_PAGE_SIZE);

                  return (
                    <>
                      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 divide-y divide-[#f2f3ff]">
                        {paginatedQuestions.length === 0 ? (
                          <div className="py-12 text-center text-[#777587] text-[13px]">
                            No questions matched your search or filter.
                          </div>
                        ) : (
                          paginatedQuestions.map(({ q, originalIdx }) => (
                            <div key={q.id || originalIdx} className="pt-3.5 first:pt-0 space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-start gap-2.5 flex-1">
                                  <span className="w-6 h-6 rounded-lg bg-[#3525cd] text-white text-[11px] font-extrabold flex items-center justify-center flex-shrink-0 mt-0.5">
                                    {originalIdx + 1}
                                  </span>
                                  <p className="text-[13px] font-bold text-[#131b2e] leading-snug flex-1">
                                    {q.prompt}
                                  </p>
                                </div>
                                {q.boldAnswerDetected ? (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#e8f5e9] text-[#006e4b] border border-[#006e4b]/30 flex items-center gap-1 flex-shrink-0 shadow-xs">
                                    <span className="material-symbols-outlined text-[13px]">format_bold</span>
                                    Bold Option ({q.correctAnswer})
                                  </span>
                                ) : (
                                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#f2f3ff] text-[#3525cd] border border-[#3525cd]/20 flex items-center gap-1 flex-shrink-0">
                                    Key: ({q.correctAnswer})
                                  </span>
                                )}
                              </div>

                              {/* Options */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pl-8">
                                {q.options.map((opt) => {
                                  const isCorrect = opt.id === q.correctAnswer;
                                  return (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      disabled={!isStaged}
                                      onClick={() => isStaged && handleToggleStagedCorrectAnswer(originalIdx, opt.id)}
                                      title={isStaged ? `Click to set Option ${opt.id} as the correct answer for evaluation` : undefined}
                                      className={`p-2 rounded-xl text-[12px] flex items-center justify-between gap-2 border text-left transition-all ${
                                        isStaged ? 'cursor-pointer' : 'cursor-default'
                                      } ${
                                        isCorrect
                                          ? 'bg-[#e8f5e9] border-[#006e4b]/50 text-[#005338] font-bold shadow-xs'
                                          : 'bg-[#faf8ff] border-[#eaedff] text-[#464555] hover:border-[#3525cd]/40'
                                      }`}
                                    >
                                      <div className="flex items-center gap-1.5 min-w-0 flex-1">
                                        <span
                                          className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center flex-shrink-0 ${
                                            isCorrect
                                              ? 'bg-[#006e4b] text-white'
                                              : 'bg-[#e2e7ff] text-[#3525cd]'
                                          }`}
                                        >
                                          {opt.id}
                                        </span>
                                        <span className={`truncate ${opt.isBold ? 'font-black text-[#005338]' : ''}`}>
                                          {opt.text}
                                        </span>
                                      </div>
                                      {isCorrect ? (
                                        <span className="flex items-center gap-1 flex-shrink-0">
                                          <span className="text-[10px] font-bold text-[#006e4b] bg-white/90 px-1.5 py-0.5 rounded border border-[#006e4b]/30">
                                            {opt.isBold ? 'Bold Answer' : 'Correct'}
                                          </span>
                                          <span className="material-symbols-outlined text-[15px] text-[#006e4b]">
                                            check_circle
                                          </span>
                                        </span>
                                      ) : opt.isBold ? (
                                        <span className="text-[10px] font-semibold text-[#006e4b] bg-[#e8f5e9] px-1.5 py-0.5 rounded flex-shrink-0">
                                          Bolded
                                        </span>
                                      ) : null}
                                    </button>
                                  );
                                })}
                              </div>

                              {q.explanation && (
                                <div className="ml-8 text-[11px] text-[#464555] bg-[#f8f9ff] p-2 rounded-lg border border-[#eaedff]/60">
                                  <span className="font-bold text-[#3525cd]">Key Note:</span> {q.explanation}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Pagination Bar */}
                      {totalFiltered > PREVIEW_PAGE_SIZE && (
                        <div className="px-4 py-2 border-t border-[#eaedff] bg-white flex flex-wrap items-center justify-between gap-2 text-[12px]">
                          <span className="text-[#777587]">
                            Showing <strong>{startIndex + 1}</strong> - <strong>{Math.min(startIndex + PREVIEW_PAGE_SIZE, totalFiltered)}</strong> of <strong>{totalFiltered}</strong> questions
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={currentPage <= 1}
                              onClick={() => setPreviewPage((p) => Math.max(1, p - 1))}
                              className="px-2.5 py-1 bg-[#f8f9ff] border border-[#eaedff] rounded-lg font-bold text-[#131b2e] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#eaedff] cursor-pointer text-[11px]"
                            >
                              Previous
                            </button>
                            <span className="px-2 font-bold text-[#3525cd] text-[11px]">
                              Page {currentPage} of {totalPages}
                            </span>
                            <button
                              type="button"
                              disabled={currentPage >= totalPages}
                              onClick={() => setPreviewPage((p) => Math.min(totalPages, p + 1))}
                              className="px-2.5 py-1 bg-[#f8f9ff] border border-[#eaedff] rounded-lg font-bold text-[#131b2e] disabled:opacity-40 disabled:cursor-not-allowed hover:bg-[#eaedff] cursor-pointer text-[11px]"
                            >
                              Next
                            </button>
                          </div>
                        </div>
                      )}
                    </>
                  );
                })()}

                {/* Modal Footer Actions */}
                <div className="p-3.5 border-t border-[#eaedff] bg-[#f8f9ff] flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] text-[#777587]">
                    {isStaged ? 'Ready to publish to live students as distinct quiz' : 'Viewing active live quiz questions'}
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setShowPreviewModal(false);
                        setInspectingQuiz(null);
                      }}
                      className="px-3.5 py-2 rounded-xl bg-white border border-[#eaedff] text-[#464555] text-[12px] font-bold hover:bg-[#eaedff] transition-all cursor-pointer"
                    >
                      Close Preview
                    </button>
                    {isStaged ? (
                      <button
                        onClick={() => {
                          handleCommitPDF();
                          setShowPreviewModal(false);
                        }}
                        className="px-4 py-2 rounded-xl bg-[#3525cd] text-white text-[12px] font-bold hover:bg-[#2a1daf] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">publish</span>
                        Commit as Quiz #{stagedPDF?.quizNumber || 1} ({activeQuestions.length} Qs)
                      </button>
                    ) : inspectingQuiz ? (
                      <button
                        onClick={() => {
                          setShowPreviewModal(false);
                          onNavigate('practice-quiz', {
                            subject: inspectingQuiz.quiz.section,
                            topic: inspectingQuiz.quiz.topic,
                            subtopic: inspectingQuiz.quiz.subtopic,
                            quizId: inspectingQuiz.quiz.id,
                            quizTitle: inspectingQuiz.quiz.title,
                          });
                        }}
                        className="px-4 py-2 rounded-xl bg-[#3525cd] text-white text-[12px] font-bold hover:bg-[#2a1daf] transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                      >
                        <span className="material-symbols-outlined text-[16px]">play_arrow</span>
                        Practice Quiz
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          );
        })()
      )}

      {/* Student Details & Submissions Inspector Modal */}
      {selectedStudentForInspect && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[88vh] flex flex-col shadow-2xl border border-[#eaedff] animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-[#eaedff] flex items-center justify-between bg-[#f8f9ff]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#3525cd] text-white font-black flex items-center justify-center text-[13px] shadow-xs">
                  {selectedStudentForInspect.student.avatarInitials}
                </div>
                <div>
                  <h3 className="font-black text-[15px] text-[#131b2e] flex items-center gap-2">
                    {selectedStudentForInspect.student.name}
                    <span className="text-[11px] font-bold text-[#464555] bg-white px-2 py-0.5 rounded-md border border-[#eaedff]">
                      {selectedStudentForInspect.student.section || 'Class 6'}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#777587]">
                    {selectedStudentForInspect.student.email} • Exact Progress Record
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedStudentForInspect(null)}
                className="w-8 h-8 rounded-full bg-white hover:bg-[#eaedff] flex items-center justify-center text-[#777587] transition-colors cursor-pointer border border-[#eaedff]"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            {/* Quick Metrics Bar */}
            <div className="p-3.5 bg-[#f2f3ff] border-b border-[#eaedff] grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
              <div className="bg-white p-2 rounded-xl text-center shadow-2xs">
                <span className="text-[10px] text-[#777587] font-bold block">UNSOLVED</span>
                <span className="text-[14px] font-black text-[#b25e00]">
                  {selectedStudentForInspect.metrics.unsolvedCount}
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl text-center shadow-2xs">
                <span className="text-[10px] text-[#777587] font-bold block">SOLVED</span>
                <span className="text-[14px] font-black text-[#006e4b]">
                  {selectedStudentForInspect.metrics.solvedCount} / {selectedStudentForInspect.metrics.totalQuestions}
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl text-center shadow-2xs">
                <span className="text-[10px] text-[#777587] font-bold block">ACCURACY</span>
                <span className="text-[14px] font-black text-[#3525cd]">
                  {selectedStudentForInspect.metrics.accuracy}%
                </span>
              </div>
              <div className="bg-white p-2 rounded-xl text-center shadow-2xs">
                <span className="text-[10px] text-[#777587] font-bold block">TOTAL LOGS</span>
                <span className="text-[14px] font-black text-[#131b2e]">
                  {selectedStudentForInspect.metrics.submissions.length}
                </span>
              </div>
            </div>

            {/* Submissions List Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {selectedStudentForInspect.metrics.submissions.length === 0 ? (
                <div className="py-10 text-center space-y-2">
                  <span className="material-symbols-outlined text-[36px] text-[#777587]">
                    history_edu
                  </span>
                  <p className="text-[13px] font-bold text-[#131b2e]">
                    No Live Practice Submissions Yet
                  </p>
                  <p className="text-[12px] text-[#777587] max-w-sm mx-auto">
                    This student is enrolled. Once they answer practice questions in the quiz drill, each submitted answer, selected option, and correctness will appear here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2.5">
                  <p className="text-[11px] font-extrabold text-[#464555] uppercase tracking-wider">
                    Question Submissions Log ({selectedStudentForInspect.metrics.submissions.length})
                  </p>
                  {selectedStudentForInspect.metrics.submissions.map((sub, idx) => {
                    const allQs = getLiveQuestions();
                    const questionObj = allQs.find((q) => q.id === sub.questionId);
                    const formattedTime = sub.submittedAt
                      ? new Date(sub.submittedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : '';
                    const formattedDate = sub.submittedAt
                      ? new Date(sub.submittedAt).toLocaleDateString([], { month: 'short', day: 'numeric' })
                      : '';

                    return (
                      <div
                        key={idx}
                        className={`p-3 rounded-xl border text-[12px] space-y-1.5 ${
                          sub.isCorrect
                            ? 'bg-[#f4fbf7] border-[#006e4b]/30'
                            : 'bg-[#fff7f7] border-[#ba1a1a]/30'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-6 h-6 rounded-lg text-[11px] font-black flex items-center justify-center flex-shrink-0 text-white ${
                                sub.isCorrect ? 'bg-[#006e4b]' : 'bg-[#ba1a1a]'
                              }`}
                            >
                              Q{sub.questionId}
                            </span>
                            <span className="font-bold text-[#131b2e]">
                              {questionObj?.subtopic || questionObj?.topic || `Question ${sub.questionId}`}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span
                              className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full flex items-center gap-1 ${
                                sub.isCorrect
                                  ? 'bg-[#e2f3ec] text-[#006e4b]'
                                  : 'bg-[#ffdad6] text-[#93000a]'
                              }`}
                            >
                              <span className="material-symbols-outlined text-[12px]">
                                {sub.isCorrect ? 'check_circle' : 'cancel'}
                              </span>
                              {sub.isCorrect ? 'Correct (+1.25)' : 'Incorrect (0.00)'}
                            </span>
                            {formattedTime && (
                              <span className="text-[10px] text-[#777587]">
                                {formattedDate} {formattedTime}
                              </span>
                            )}
                          </div>
                        </div>

                        {questionObj && (
                          <p className="text-[12px] text-[#131b2e] pl-8">
                            {questionObj.prompt}
                          </p>
                        )}

                        <div className="pl-8 flex items-center gap-3 text-[11px]">
                          <div className="flex items-center gap-1">
                            <span className="text-[#777587]">Selected:</span>
                            <span className="font-extrabold text-[#131b2e] bg-white px-2 py-0.5 rounded border border-[#eaedff]">
                              Option {sub.selectedOption}
                            </span>
                          </div>
                          {questionObj && (
                            <div className="flex items-center gap-1">
                              <span className="text-[#777587]">Answer:</span>
                              <span className="font-extrabold text-[#006e4b] bg-white px-2 py-0.5 rounded border border-[#eaedff]">
                                Option {questionObj.correctAnswer}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3.5 border-t border-[#eaedff] bg-[#f8f9ff] flex items-center justify-between">
              <span className="text-[11px] text-[#777587]">
                Live sync active with student test submissions
              </span>
              <button
                onClick={() => setSelectedStudentForInspect(null)}
                className="px-4 py-2 rounded-xl bg-[#3525cd] text-white text-[12px] font-bold hover:bg-[#2a1daf] transition-all cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
