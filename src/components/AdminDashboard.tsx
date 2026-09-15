import React, { useState } from 'react';
import { ScreenType, Student, PDFUpload, TaxonomyItem } from '../types';
import {
  MOCK_STUDENTS,
  INITIAL_PDF_STAGED,
  INITIAL_TAXONOMY,
} from '../data/mockData';
import {
  extractTextFromPDF,
  parseQuestionsFromText,
  saveExtractedQuestionsToBank,
} from '../lib/pdfExtractor';
import {
  SYLLABUS_DATA,
  getTopicsForSubject,
  getSubtopicsForTopic,
} from '../data/syllabusData';

interface AdminDashboardProps {
  onNavigate: (screen: ScreenType) => void;
  showToast: (msg: string, icon?: string) => void;
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

  // Auto sync students whenever tab is switched to 'students'
  React.useEffect(() => {
    if (activeTab === 'students') {
      setStudentsList(loadSignedUpStudents());
    }
  }, [activeTab]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sectionFilter, setSectionFilter] = useState('All');
  const [stagedPDF, setStagedPDF] = useState<PDFUpload | null>(INITIAL_PDF_STAGED);
  const [taxonomyList, setTaxonomyList] = useState<TaxonomyItem[]>(INITIAL_TAXONOMY);

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
      s.email.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSection =
      sectionFilter === 'All'
        ? true
        : sectionFilter === 'High'
        ? s.accuracy >= 80
        : s.section === sectionFilter;
    return matchesSearch && matchesSection;
  });

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      showToast(`Extracting questions from ${file.name}...`, 'hourglass_top');
      const text = await extractTextFromPDF(file);
      const extractedQs = parseQuestionsFromText(
        text,
        selectedSubject,
        selectedTopic,
        selectedSubtopic
      );

      setStagedPDF({
        id: `pdf_${Date.now()}`,
        fileName: file.name,
        size: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
        uploadedTime: 'Uploaded just now',
        questionsFound: extractedQs.length,
        subjectCategory: selectedSubject,
        targetTopic: selectedTopic,
        subtopic: selectedSubtopic,
        tags: [`${extractedQs.length} MCQs Extracted`, 'Auto-Mapped Options', 'Ready for Live Bank'],
        status: 'Staged',
        extractedQuestions: extractedQs,
      });
      showToast(`Extracted ${extractedQs.length} questions & options from ${file.name}!`, 'cloud_done');
    }
  };

  const handleCommitPDF = () => {
    if (!stagedPDF) return;
    if (stagedPDF.extractedQuestions && stagedPDF.extractedQuestions.length > 0) {
      saveExtractedQuestionsToBank(stagedPDF.extractedQuestions);
    }
    showToast(
      `Committed ${stagedPDF.questionsFound} questions & options to Live Question Bank! All students can now practice these.`,
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
            Question Bank (1,840 Qs)
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
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      onClick={handleCommitPDF}
                      className="flex-1 py-2.5 px-3 bg-[#3525cd] text-white rounded-xl text-[12px] font-bold hover:bg-[#2a1daf] active:scale-95 transition-all flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        publish
                      </span>{' '}
                      Commit to Live Bank ({stagedPDF.questionsFound} Qs)
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
                </div>
              )}
            </div>
          </section>
        )}

        {/* TAB 2: STUDENT ROSTER DIRECTORY */}
        {activeTab === 'students' && (
          <section className="space-y-3">
            <div className="bg-white p-4 rounded-2xl shadow-xs border border-[#eaedff] space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h2 className="text-[16px] text-[#131b2e] font-bold">
                    Student Directory
                  </h2>
                  <p className="text-[12px] text-[#464555]">
                    Class 6 Aspirants • {studentsList.length} Total
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[#006e4b] bg-[#e2f3ec] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-2xs">
                    <span className="material-symbols-outlined text-[14px]">sync</span>
                    <span>Auto-Enrolled via Signup</span>
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
                  placeholder="Search by name, roll, or Gmail..."
                  className="w-full h-10 bg-[#f2f3ff] text-[#131b2e] rounded-xl pl-9 pr-3 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#3525cd] border-0"
                />
              </div>

              {/* Student Cards List */}
              <div className="space-y-2.5 pt-1">
                {filteredStudents.map((s) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-xl bg-[#f2f3ff] border border-[#c7c4d8] space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-start gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-[#e2dfff] text-[#3525cd] font-bold flex items-center justify-center text-[12px] flex-shrink-0 mt-0.5">
                          {s.avatarInitials}
                        </div>
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-[13px] font-bold text-[#131b2e]">
                              {s.name}
                            </p>
                            <span className="text-[10px] bg-[#ffddb8] text-[#855300] px-2 py-0.5 rounded-full font-extrabold flex items-center gap-1">
                              <span className="material-symbols-outlined text-[12px]">pending_actions</span>
                              {s.unsolvedCount ?? 15} Unsolved Questions
                            </span>
                          </div>
                          <p className="text-[11px] text-[#464555] font-medium">{s.email}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
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
    </div>
  );
};
