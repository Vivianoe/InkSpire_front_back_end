'use client';

import { useState, useRef, useMemo, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from './page.module.css';
import { generateScaffoldPDF } from '@/utils/generateScaffoldPDF';

const PdfPreviewComponent = dynamic(
  () => import('@/components/ui/PdfPreview'),
  { 
    ssr: false,
    loading: () => <div>Loading PDF...</div>
  }
);

const normalizeScaffoldText = (input: unknown): string[] => {
  if (Array.isArray(input)) {
    return input
      .map((item) => (typeof item === 'string' ? item : item != null ? String(item) : ''))
      .filter((item) => item && item.length > 0);
  }
  if (typeof input === 'string') {
    return input.length > 0 ? [input] : [];
  }
  if (input != null) {
    const str = String(input);
    return str.length > 0 ? [str] : [];
  }
  return [];
};

const toTextBuffer = (items: string[]): string => items.join('\n\n');

const getScaffoldTextValue = (scaffold: any): string => {
  if (!scaffold) return '';
  return toTextBuffer(normalizeScaffoldText(scaffold.text));
};

const extractTitleFromTexts = (texts: string[]): { title: string | null; texts: string[] } => {
  if (!texts.length) return { title: null, texts };
  const match = texts[0]?.match(/^([^:：]+)\s*[:：]\s*(.*)$/);
  if (!match) return { title: null, texts };
  const title = match[1]?.trim() || null;
  const body = match[2]?.trim() || '';
  const newTexts = [...texts];
  if (body) {
    newTexts[0] = body;
  } else {
    newTexts.shift();
  }
  return { title, texts: newTexts };
};

const createInitialFormState = () => ({
  sessionInformation: '',
  assignmentDescription: '',
  assignmentGoals: '',
  uploadedFile: null as File | null
});

type SelectedReading = {
  id: string;
  title?: string;
  name?: string;
  sizeLabel?: string;
  order?: number;
  filePath?: string;
  sourceType?: string;
  courseId?: string;
  instructorId?: string;
  mimeType?: string;
};

const SELECTED_READING_STORAGE_KEY = 'inkspire:selectedReadings';
const DEFAULT_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const DEFAULT_COURSE_ID = '00000000-0000-4000-8000-000000000111';

export default function CreateNewReadingTaskPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const profileFromQuery = searchParams?.get('from') || null;
  const [formData, setFormData] = useState(createInitialFormState());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [dragActive, setDragActive] = useState(false);
  const [scaffoldsGenerated, setScaffoldsGenerated] = useState(false);
  const [pdfContent, setPdfContent] = useState<string>('');
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);  // PDF URL from backend
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [scaffolds, setScaffolds] = useState<any[]>([]);
  const [modificationRequest, setModificationRequest] = useState<string>('');
  const modificationTextareaRef = useRef<HTMLTextAreaElement>(null);
  // history view state
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyMap, setHistoryMap] = useState<Record<string, any[]>>({});
  const [activeFragment, setActiveFragment] = useState<string | null>(null);
  // Thread management
  const [threadId, setThreadId] = useState<string | null>(null);
  const [currentReviewIndex, setCurrentReviewIndex] = useState<number>(-1);
  const [reviewProgress, setReviewProgress] = useState<{
    review_cursor: number;
    scaffold_final: any[];
    scaffold_rejected: any[];
  } | null>(null);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [showPostPublishModal, setShowPostPublishModal] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [mdContent, setMdContent] = useState('');
  const [manualEditOpenId, setManualEditOpenId] = useState<string | null>(null);
  const [manualEditMap, setManualEditMap] = useState<Record<string, string>>({});
  const [manualEditSubmittingId, setManualEditSubmittingId] = useState<string | null>(null);
  const [selectedReadings, setSelectedReadings] = useState<SelectedReading[]>([]);
  const [currentReadingIndex, setCurrentReadingIndex] = useState(0);
  const [readingProfileId, setReadingProfileId] = useState<string | null>(null);
  // Get courseId and instructorId from URL params first
  const urlCourseId = searchParams?.get('courseId');
  const urlInstructorId = searchParams?.get('instructorId');
  
  const [selectedCourseId, setSelectedCourseId] = useState<string | null>(urlCourseId || null);
  const [selectedInstructorId, setSelectedInstructorId] = useState<string | null>(urlInstructorId || null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const currentReading = selectedReadings[currentReadingIndex] ?? null;
  const persistReadingSelection = useCallback(
    (readings: SelectedReading[], readingIndex: number, nextSessionId?: string | null) => {
      if (typeof window === 'undefined') {
        return;
      }
      if (!readings.length) {
        window.sessionStorage.removeItem(SELECTED_READING_STORAGE_KEY);
        return;
      }
      const sessionIdentifier =
        typeof nextSessionId !== 'undefined' ? nextSessionId : sessionId;
      const normalizedIndex = Math.max(0, Math.min(readingIndex, readings.length - 1));
      window.sessionStorage.setItem(
        SELECTED_READING_STORAGE_KEY,
        JSON.stringify({
          profileId: readingProfileId ?? profileFromQuery,
          courseId: selectedCourseId,
          instructorId: selectedInstructorId,
          readingIndex: normalizedIndex,
          sessionId: sessionIdentifier,
          readings,
        })
      );
    },
    [profileFromQuery, readingProfileId, selectedCourseId, selectedInstructorId, sessionId]
  );
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    try {
      const cached = window.sessionStorage.getItem(SELECTED_READING_STORAGE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        const readings = Array.isArray(parsed?.readings) ? parsed.readings : [];
        setSelectedReadings(readings);
        const parsedIndex =
          typeof parsed?.readingIndex === 'number' && readings.length
            ? Math.min(Math.max(parsed.readingIndex, 0), readings.length - 1)
            : 0;
        setCurrentReadingIndex(parsedIndex);
        setReadingProfileId(parsed?.profileId ?? profileFromQuery);
        // Use URL params if available, otherwise use session storage
        setSelectedCourseId(urlCourseId || (parsed?.courseId ?? null));
        setSelectedInstructorId(urlInstructorId || (parsed?.instructorId ?? null));
        setSessionId(parsed?.sessionId ?? null);
      } else {
        setSelectedReadings([]);
        setReadingProfileId(profileFromQuery);
        setSelectedCourseId(null);
        setSelectedInstructorId(null);
        setSessionId(null);
      }
    } catch (err) {
      console.error('Failed to load selected readings', err);
      setSelectedReadings([]);
      setReadingProfileId(profileFromQuery);
      setSelectedCourseId(null);
      setSelectedInstructorId(null);
      setSessionId(null);
    }
  }, [profileFromQuery]);
  const acceptedScaffolds = useMemo(
    () => scaffolds.filter((s) => s.status === 'ACCEPTED'),
    [scaffolds]
  );
  const reviewedCount = useMemo(
    () =>
      scaffolds.filter(
        (s) => s.status === 'ACCEPTED' || s.status === 'REJECTED'
      ).length,
    [scaffolds]
  );
  const allReviewed = scaffolds.length > 0 && reviewedCount === scaffolds.length;
  const advanceReadingPointer = useCallback(() => {
    if (selectedReadings.length === 0) {
      persistReadingSelection([], 0, null);
      setSessionId(null);
      setCurrentReadingIndex(0);
      return;
    }
    const nextIndex = currentReadingIndex + 1;
    if (nextIndex >= selectedReadings.length) {
      setSelectedReadings([]);
      setCurrentReadingIndex(0);
      setSessionId(null);
      persistReadingSelection([], 0, null);
    } else {
      setCurrentReadingIndex(nextIndex);
      persistReadingSelection(selectedReadings, nextIndex);
    }
  }, [currentReadingIndex, persistReadingSelection, selectedReadings]);
  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  useEffect(() => {
    let aborted = false;
    const loadReadingContent = async () => {
      if (!currentReading?.id || formData.uploadedFile) {
        return;
      }
      try {
        const response = await fetch(`/api/readings/${currentReading.id}/content`);
        if (!response.ok) {
          return;
        }
        const data = await response.json().catch(() => ({}));
        if (!data?.content_base64 || aborted) {
          return;
        }
        const base64 = data.content_base64 as string;
        const byteCharacters = atob(base64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i += 1) {
          byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const mimeType = data?.mime_type || currentReading.mimeType || 'application/pdf';
        const blob = new Blob([byteArray], { type: mimeType });
        const fileName = currentReading.title || currentReading.name || 'Reading.pdf';
        const reconstructedFile = new File([blob], fileName, { type: mimeType });
        if (!aborted) {
          setFormData(prev => ({ ...prev, uploadedFile: reconstructedFile }));
        }
      } catch (error) {
        console.error('Failed to load reading content', error);
      }
    };
    loadReadingContent();
    return () => {
      aborted = true;
    };
  }, [currentReading?.id, currentReading?.mimeType, currentReading?.name, currentReading?.title, formData.uploadedFile]);

  // Handle PDF text extraction (placeholder for future use)
  const handleTextExtracted = (text: string) => {
    console.log('Extracted PDF text:', text.substring(0, 200) + '...');
  };

  const handleDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        // TODO: Upload PDF to backend via /api/upload/pdf
        setFormData(prev => ({ ...prev, uploadedFile: file }));
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (isPdf) {
        // TODO: Upload PDF to backend via /api/upload/pdf
        setFormData(prev => ({ ...prev, uploadedFile: file }));
      }
    }
  };

  const handleAdjustReadingSelection = () => {
    const targetProfileId = readingProfileId || profileFromQuery || 'new';
    if (!targetProfileId) {
      router.push('/');
      return;
    }
    const params = new URLSearchParams();
    if (selectedCourseId) {
      params.set('courseId', selectedCourseId);
    }
    if (selectedInstructorId) {
      params.set('instructorId', selectedInstructorId);
    }
    const query = params.toString();
    router.push(
      `/class-profile/${targetProfileId}/reading${query ? `?${query}` : ''}`
    );
  };

  const renderSelectedReadingPreview = () => (
    <div className={`${styles.readingSummaryCard}`}>
      <div className={styles.readingSummaryHeader}>
        <div>
          <p className={styles.readingSummaryTitle}>Selected readings</p>
          <p className={styles.readingSummarySubtitle}>
            These readings were chosen earlier and will be scaffolded in order.
          </p>
        </div>
        <button
          type="button"
          className={`${uiStyles.btn} ${uiStyles.btnNeutral} ${styles.adjustSelectionButton}`}
          onClick={handleAdjustReadingSelection}
        >
          Adjust selection
        </button>
      </div>
      {selectedReadings.length === 0 ? (
        <div className={styles.readingEmptyState}>
          <p>No readings from the session setup were found.</p>
          <p>Upload a PDF below or go back to the reading selector.</p>
        </div>
      ) : (
        <>
          <ol className={styles.readingList}>
            {selectedReadings.map((reading, index) => {
              const isCurrent = index === currentReadingIndex;
              const isDone = index < currentReadingIndex;
              const status = isCurrent ? 'In progress' : isDone ? 'Completed' : 'Queued';
              return (
                <li
                  key={reading.id}
                  className={`${styles.readingListItem} ${
                    isCurrent ? styles.readingListItemActive : ''
                  }`}
                >
                  <div className={styles.readingListRow}>
                    <span className={styles.readingOrderBadge}>
                      {reading.order ?? index + 1}
                    </span>
                    <div className={styles.readingListText}>
                      <p className={styles.readingListName}>
                        {reading.title || reading.name || `Reading ${index + 1}`}
                      </p>
                      <p className={styles.readingListMeta}>
                        {status} · {reading.sizeLabel || reading.sourceType || 'PDF'}
                      </p>
                    </div>
                    <span
                      className={`${styles.readingStatusChip} ${
                        isDone
                          ? styles.readingStatusCompleted
                          : isCurrent
                          ? styles.readingStatusActive
                          : styles.readingStatusQueued
                      }`}
                    >
                      {status}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
          <p className={styles.readingSummaryFootnote}>
            The system will auto-apply each reading above, one after the other, to scaffold
            this session.
          </p>
        </>
      )}
    </div>
  );

  const renderInputStack = (mode: 'initial' | 'regenerate') => {
    const buttonLabel = mode === 'initial' ? 'Generate Scaffolds' : 'Regenerate';
    return (
      <>
        <div className={`${uiStyles.field} ${styles.fieldNarrow}`}>
          <div className={styles.labelWithIcon}>
            <label className={uiStyles.fieldLabel}>Session information</label>
          </div>
          <textarea
            value={formData.sessionInformation}
            onChange={(e) => handleInputChange('sessionInformation', e.target.value)}
            className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
            placeholder="Include the session name, learning objectives, and any constraints in a single summary."
          />
        </div>

        <div className={`${uiStyles.field} ${styles.fieldNarrow}`}>
          <div className={styles.labelWithIcon}>
            <label className={uiStyles.fieldLabel}>Assignment description</label>
          </div>
          <textarea
            value={formData.assignmentDescription}
            onChange={(e) => handleInputChange('assignmentDescription', e.target.value)}
            className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
            placeholder="Describe the assignment deliverable or activity focus."
            rows={3}
          />
        </div>

        <div className={`${uiStyles.field} ${styles.fieldNarrow}`}>
          <div className={styles.labelWithIcon}>
            <label className={uiStyles.fieldLabel}>Assignment goals</label>
          </div>
          <textarea
            value={formData.assignmentGoals}
            onChange={(e) => handleInputChange('assignmentGoals', e.target.value)}
            className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
            placeholder="List the goals or competencies this assignment reinforces."
            rows={3}
          />
        </div>

        {renderSelectedReadingPreview()}

        <div className={`${uiStyles.field} ${styles.fieldNarrow}`}>
          <label className={uiStyles.fieldLabel}>
            Upload a PDF (optional)
          </label>
          <p className={`${uiStyles.fieldHint} ${styles.fieldHint}`}>
            We already pulled in the readings you selected. Upload here only if you need to override
            the current PDF.
          </p>
          <div
            className={`${styles.dropzone} ${dragActive ? styles.dropzoneActive : styles.dropzoneInactive}`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
            role="button"
            tabIndex={0}
          >
            <div className={styles.dropzoneContent}>
              <p className={styles.dropzoneText}>
                {formData.uploadedFile ? (
                  <span className={styles.dropzoneFileName}>Selected: {formData.uploadedFile.name}</span>
                ) : (
                  'Drag and drop file here or click to upload'
                )}
              </p>
              <p className={styles.dropzoneSubText}>Max 20MB • PDF</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
              onChange={handleFileSelect}
              className={styles.hiddenInput}
            />
          </div>
        </div>

        <div className={`${uiStyles.fieldActions} ${styles.fieldActions}`}>
          <button
            type="button"
            onClick={handleGenerateScaffolds}
            className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
          >
            {buttonLabel}
          </button>
          <button
            type="button"
            onClick={handleTestResponse}
            className={`${uiStyles.btn} ${uiStyles.btnSecondary}`}
          >
            Test Response
          </button>
        </div>
      </>
    );
  };



  // Testing endpoint that mirrors /api/generate-scaffolds handling,
  // but hits /api/test-scaffold-response instead.
  const handleTestResponse = async () => {
    if (!currentReading) {
      alert('Select a reading from the library before testing scaffolds.');
      return;
    }

    try {
      setScaffoldsGenerated(true);
      const newThreadId = `ui-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setThreadId(newThreadId);

      const readingLabel = currentReading.title || currentReading.name;
      const readingDescriptor = readingLabel
        ? `Reading ${currentReading.order ?? currentReadingIndex + 1}: ${readingLabel}`
        : `Reading ${currentReadingIndex + 1}`;

      const courseIdForRequest =
        currentReading.courseId ?? selectedCourseId ?? DEFAULT_COURSE_ID;
      const instructorIdForRequest =
        currentReading.instructorId ?? selectedInstructorId ?? DEFAULT_INSTRUCTOR_ID;

      const body = {
        instructor_id: instructorIdForRequest,
        course_id: courseIdForRequest,
        session_id: sessionId || null,
        reading_id: currentReading.id,
      };

      console.log('[Frontend] Calling /api/test-scaffold-response with body:', body);
      const res = await fetch('/api/test-scaffold-response', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      console.log('res:', res);

      if (!res.ok) {
        let errorDetail = 'Failed to get test response';
        // Clone the response to read it multiple times if needed
        const clonedRes = res.clone();
        try {
          const errorData = await res.json();
          errorDetail = errorData.detail || errorData.message || errorData.error || JSON.stringify(errorData);
          console.error('[Frontend] Error response JSON:', errorData);
        } catch (e) {
          // If JSON parsing fails, try text
          try {
            const errorText = await clonedRes.text();
            errorDetail = errorText || 'Failed to get test response';
            console.error('[Frontend] Error response text:', errorText);
          } catch (textError) {
            console.error('[Frontend] Failed to read error response:', textError);
            errorDetail = `HTTP ${res.status}: ${res.statusText}`;
          }
        }
        console.error('[Frontend] Error status:', res.status, res.statusText);
        throw new Error(errorDetail);
      }

      const data = await res.json();
      console.log('[Frontend] Test Response data:', data);
      console.log('[Frontend] annotation_scaffolds_review (test):', data.annotation_scaffolds_review);
      console.log(
        '[Frontend] annotation_scaffolds_review isArray (test):',
        Array.isArray(data.annotation_scaffolds_review),
      );
      console.log('[Frontend] pdf_url (test):', data.pdf_url);
      
      // Extract and save PDF URL from backend
      if (data.pdf_url) {
        setPdfUrl(data.pdf_url);
        console.log('[Frontend] Set PDF URL (test):', data.pdf_url);
      }

      const nextSessionId =
        typeof data.session_id === 'string' ? data.session_id : sessionId;
      if (nextSessionId && nextSessionId !== sessionId) {
        setSessionId(nextSessionId);
        persistReadingSelection(selectedReadings, currentReadingIndex, nextSessionId);
      }
      
      // Use data.pdf_url directly (not pdfUrl state) since state update is async
      const hasPdfUrl = !!data.pdf_url;

      const serverScaffolds = Array.isArray(data.annotation_scaffolds_review)
        ? data.annotation_scaffolds_review
        : Array.isArray(data.annotation_scaffolds)
        ? data.annotation_scaffolds
        : [];

      console.log('[Frontend] serverScaffolds count (test):', serverScaffolds.length);
      if (serverScaffolds.length > 0) {
        console.log('[Frontend] First scaffold (test):', serverScaffolds[0]);
        console.log(
          '[Frontend] First scaffold keys (test):',
          Object.keys(serverScaffolds[0]),
        );
      }

      const cards = serverScaffolds.map((s: any, idx: number) => {
        try {
          console.log(`[Frontend] Processing test scaffold ${idx + 1}:`, s);
          const normalizedText = normalizeScaffoldText(s.text);
          const { title, texts } = extractTitleFromTexts(normalizedText);
          const scaffoldId = s.id || s.scaffold_id || `scaffold_${idx}`;

          const card = {
            id: scaffoldId,
            scaffold_id: scaffoldId,
            number: idx + 1,
            type: 'Scaffold',
            title,
            status:
              s.status === 'pending'
                ? 'NOT REVIEWED'
                : s.status === 'approved'
                ? 'ACCEPTED'
                : s.status === 'rejected'
                ? 'REJECTED'
                : 'NOT REVIEWED',
            content: texts[0] || s.fragment || '',
            fragment: s.fragment || '',
            text: texts,
            history: Array.isArray(s.history) ? s.history : [],
            backgroundColor: ['#f0fdf4', '#eff6ff', '#f9fafb', '#fef3c7', '#fce7f3'][idx % 5],
            borderColor: ['#22c55e', '#3b82f6', '#6b7280', '#f59e0b', '#ec4899'][idx % 5],
          };
          console.log(`[Frontend] Created test card ${idx + 1}:`, card);
          return card;
        } catch (e) {
          console.error(
            `[Frontend] Error processing test scaffold ${idx + 1}:`,
            e,
            s,
          );
          throw e;
        }
      });

      console.log('[Frontend] Total test cards created:', cards.length);
      setScaffolds(cards);
      setManualEditOpenId(null);
      setManualEditMap({});
      setCurrentReviewIndex(0);
      setReviewProgress({
        review_cursor: 0,
        scaffold_final: [],
        scaffold_rejected: [],
      });

      const responseThreadId = data.thread_id || newThreadId;
      setThreadId(responseThreadId);

      // Set PDF content for rendering - prioritize URL from backend, fallback to uploaded file
      // Use hasPdfUrl (from data.pdf_url) instead of pdfUrl state since state update is async
      if (hasPdfUrl || formData.uploadedFile) {
        setPdfContent('PDF_LOADED');
      } else {
        setPdfContent(
          `<h3>Scaffolds generated for ${readingDescriptor}</h3><p>The remaining readings stay in the queue.</p>`
        );
      }
    } catch (e) {
      console.error('[Frontend] Test Response Error:', e);
      setScaffoldsGenerated(false);
      alert(`Failed to get test response: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

/*
  const handleTestResponse = async () => {
    try {
      console.log('[Frontend] Testing /api/test-scaffold-response...');
      const res = await fetch('/api/test-scaffold-response', {
        method: 'GET',
      });
      
      console.log('[Frontend] Test response status:', res.status, res.statusText);
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[Frontend] Test response error:', errorText);
        alert(`Test failed: ${res.status} ${res.statusText}\n${errorText}`);
        return;
      }
      
      const data = await res.json();
      console.log('[Frontend] Test response data:', data);
      console.log('[Frontend] Test response annotation_scaffolds_review:', data.annotation_scaffolds_review);
      alert(`Test successful! Received ${data.annotation_scaffolds_review?.length || 0} scaffolds`);
    } catch (e) {
      console.error('[Frontend] Test error:', e);
      alert(`Test error: ${e}`);
    }
  };
*/

  const handleGenerateScaffolds = async () => {
    if (!currentReading) {
      alert('Select a reading from the library before generating scaffolds.');
      return;
    }
    
    try {
      setScaffoldsGenerated(true);
      const newThreadId = `ui-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      setThreadId(newThreadId);

      const readingLabel = currentReading.title || currentReading.name;
      const readingDescriptor = readingLabel
        ? `Reading ${currentReading.order ?? currentReadingIndex + 1}: ${readingLabel}`
        : `Reading ${currentReadingIndex + 1}`;

      const courseIdForRequest = currentReading.courseId ?? selectedCourseId ?? DEFAULT_COURSE_ID;
      const instructorIdForRequest =
        currentReading.instructorId ?? selectedInstructorId ?? DEFAULT_INSTRUCTOR_ID;

      // Simplified payload - session_id is optional (will be created by backend if not provided)
      const payload = {
        instructor_id: instructorIdForRequest,
        course_id: courseIdForRequest,
        session_id: sessionId || null,  // null if not set, backend will create new session
        reading_id: currentReading.id,
      };

      console.log('[Frontend] Calling /api/generate-scaffolds with:', payload);

      const res = await fetch('/api/generate-scaffolds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      console.log('res:', res);
      
      if (!res.ok) {
        let errorDetail = 'Failed to generate scaffolds';
        // Clone the response to read it multiple times if needed
        const clonedRes = res.clone();
        try {
          const errorData = await res.json();
          errorDetail = errorData.detail || errorData.message || errorData.error || JSON.stringify(errorData);
          console.error('[Frontend] Error response JSON:', errorData);
        } catch (e) {
          // If JSON parsing fails, try text
          try {
            const errorText = await clonedRes.text();
            errorDetail = errorText || 'Failed to generate scaffolds';
            console.error('[Frontend] Error response text:', errorText);
          } catch (textError) {
            console.error('[Frontend] Failed to read error response:', textError);
            errorDetail = `HTTP ${res.status}: ${res.statusText}`;
          }
        }
        console.error('[Frontend] Error status:', res.status, res.statusText);
        throw new Error(errorDetail);
      }

      const data = await res.json();
      console.log('[Frontend] Response data:', data);
      console.log('[Frontend] annotation_scaffolds_review:', data.annotation_scaffolds_review);
      console.log('[Frontend] annotation_scaffolds_review type:', typeof data.annotation_scaffolds_review);
      console.log('[Frontend] annotation_scaffolds_review isArray:', Array.isArray(data.annotation_scaffolds_review));
      console.log('[Frontend] pdf_url:', data.pdf_url);
      
      // Extract and save PDF URL from backend
      if (data.pdf_url) {
        setPdfUrl(data.pdf_url);
        console.log('[Frontend] Set PDF URL:', data.pdf_url);
      }
      
      const nextSessionId = typeof data.session_id === 'string' ? data.session_id : sessionId;
      if (nextSessionId && nextSessionId !== sessionId) {
        setSessionId(nextSessionId);
        persistReadingSelection(selectedReadings, currentReadingIndex, nextSessionId);
      }
      
      // Use data.pdf_url directly (not pdfUrl state) since state update is async
      const hasPdfUrl = !!data.pdf_url;

      const serverScaffolds = Array.isArray(data.annotation_scaffolds_review)
        ? data.annotation_scaffolds_review
        : Array.isArray(data.annotation_scaffolds)
        ? data.annotation_scaffolds
        : [];
      
      console.log('[Frontend] serverScaffolds count:', serverScaffolds.length);
      if (serverScaffolds.length > 0) {
        console.log('[Frontend] First scaffold:', serverScaffolds[0]);
        console.log('[Frontend] First scaffold keys:', Object.keys(serverScaffolds[0]));
      }

      const cards = serverScaffolds.map((s: any, idx: number) => {
        try {
          console.log(`[Frontend] Processing scaffold ${idx + 1}:`, s);
          const normalizedText = normalizeScaffoldText(s.text);
          const { title, texts } = extractTitleFromTexts(normalizedText);
          // Backend returns 'id' field, not 'scaffold_id'
          const scaffoldId = s.id || s.scaffold_id || `scaffold_${idx}`;
          const card = {
            id: scaffoldId,
            scaffold_id: scaffoldId, // Use same value for compatibility
            number: idx + 1,
            type: 'Scaffold',
            title,
            status: s.status === 'pending' ? 'NOT REVIEWED' : s.status === 'approved' ? 'ACCEPTED' : s.status === 'rejected' ? 'REJECTED' : 'NOT REVIEWED',
            content: texts[0] || s.fragment || '',
            fragment: s.fragment || '',
            text: texts,
            history: Array.isArray(s.history) ? s.history : [],
            backgroundColor: ['#f0fdf4', '#eff6ff', '#f9fafb', '#fef3c7', '#fce7f3'][idx % 5],
            borderColor: ['#22c55e', '#3b82f6', '#6b7280', '#f59e0b', '#ec4899'][idx % 5],
          };
          console.log(`[Frontend] Created card ${idx + 1}:`, card);
          return card;
        } catch (e) {
          console.error(`[Frontend] Error processing scaffold ${idx + 1}:`, e, s);
          throw e;
        }
      });
      
      console.log('[Frontend] Total cards created:', cards.length);
      setScaffolds(cards);
      setManualEditOpenId(null);
      setManualEditMap({});
      setCurrentReviewIndex(0);
      setReviewProgress({
        review_cursor: 0,
        scaffold_final: [],
        scaffold_rejected: [],
      });

      const responseThreadId = data.thread_id || newThreadId;
      setThreadId(responseThreadId);

      // Set PDF content - prioritize URL from backend, fallback to uploaded file
      // Use hasPdfUrl (from data.pdf_url) instead of pdfUrl state since state update is async
      if (hasPdfUrl || formData.uploadedFile) {
        setPdfContent('PDF_LOADED');
      } else {
        setPdfContent(
          `<h3>Scaffolds generated for ${readingDescriptor}</h3><p>The remaining readings stay in the queue.</p>`
        );
      }
    } catch (e) {
      console.error(e);
      setScaffoldsGenerated(false);
      alert('Failed to generate scaffolds. Please try again.');
    }
  };

  // Check if each step is completed
  const isStepCompleted = (step: number) => {
    switch (step) {
      case 1:
        return formData.sessionInformation.trim().length > 0;
      case 2:
        return formData.assignmentDescription.trim().length > 0;
      case 3:
        return formData.assignmentGoals.trim().length > 0;
      default:
        return false;
    }
  };

  // Get step CSS classes
  const getStepClasses = (step: number) => {
    return isStepCompleted(step) ? styles.step : `${styles.step} ${styles.stepInactive}`;
  };

  const getStepNumberClasses = (step: number) => {
    return isStepCompleted(step) ? styles.stepNumberActive : styles.stepNumberInactive;
  };

  const getStepLabelClasses = (step: number) => {
    return isStepCompleted(step) ? styles.stepLabelActive : styles.stepLabelInactive;
  };

  const keyForId = (value: number | string) => String(value);

  const processReviewResponse = (
    targetCardId: number | string | null,
    data: any,
    fallbackStatus?: 'ACCEPTED' | 'REJECTED'
  ) => {
    if (data?.progress) {
      setReviewProgress(data.progress);
    }
    if (data?.__interrupt__ === null) {
      setCurrentReviewIndex(-1);
    } else if (typeof data?.__interrupt__?.index === 'number') {
      setCurrentReviewIndex(data.__interrupt__.index);
    }

    const actionResult = data?.action_result;
    const resolveTargetKey = (): string | null => {
      if (targetCardId !== null && targetCardId !== undefined) {
        return keyForId(targetCardId);
      }
      if (actionResult?.id) {
        const match = scaffolds.find(
          (s) =>
            keyForId(s.id) === keyForId(actionResult.id) ||
            (s.scaffold_id && keyForId(s.scaffold_id) === keyForId(actionResult.id))
        );
        if (match) {
          return keyForId(match.id);
        }
      }
      return null;
    };

    const targetKey = resolveTargetKey();
    if (!targetKey) {
      return;
    }

    if (actionResult) {
      console.log('[processReviewResponse] actionResult:', actionResult);
      console.log('[processReviewResponse] actionResult.status:', actionResult.status);
      console.log('[processReviewResponse] targetKey:', targetKey);
      
      const normalizedResultText = normalizeScaffoldText(actionResult.text);
      const { title: nextTitle, texts: strippedText } = extractTitleFromTexts(normalizedResultText);
      const normalizedStatus = typeof actionResult.status === 'string' ? actionResult.status.toLowerCase() : '';
      console.log('[processReviewResponse] normalizedStatus:', normalizedStatus);
      const bufferValue = toTextBuffer(strippedText);

      setScaffolds((prev) =>
        prev.map((s) => {
          if (keyForId(s.id) === targetKey) {
            let nextStatus = s.status;
            if (normalizedStatus === 'approved') nextStatus = 'ACCEPTED';
            else if (normalizedStatus === 'rejected') nextStatus = 'REJECTED';
            else if (normalizedStatus === 'edit_pending' || normalizedStatus === 'draft') nextStatus = 'IN PROGRESS';
            
            console.log('[processReviewResponse] Updating scaffold:', {
              id: s.id,
              oldStatus: s.status,
              newStatus: nextStatus,
              normalizedStatus,
            });

            return {
              ...s,
              title: nextTitle ?? s.title,
              status: nextStatus,
              fragment: actionResult.fragment ?? s.fragment,
              text: strippedText.length > 0 ? strippedText : s.text,
              content: strippedText[0] || actionResult.fragment || s.content,
              history: Array.isArray(actionResult.history) ? actionResult.history : s.history ?? [],
            };
          }
          return s;
        })
      );

      setManualEditMap((prev) => {
        if (targetKey) {
          const next = { ...prev };
          next[targetKey] = bufferValue;
          return next;
        }
        return prev;
      });

      if (
        manualEditOpenId === targetKey &&
        (normalizedStatus === 'approved' || normalizedStatus === 'rejected')
      ) {
        setManualEditOpenId(null);
      }

      setHistoryMap((prev) => {
        if (prev && Object.prototype.hasOwnProperty.call(prev, targetKey)) {
          const next = { ...prev };
          delete next[targetKey];
          return next;
        }
        return prev;
      });
    } else if (fallbackStatus) {
      setScaffolds((prev) =>
        prev.map((s) => {
          if (keyForId(s.id) === targetKey) {
            return { ...s, status: fallbackStatus };
          }
          return s;
        })
      );

      if (manualEditOpenId === targetKey) {
        setManualEditOpenId(null);
      }
    }
  };

  const openManualEditForScaffold = (scaffold: any) => {
    const key = keyForId(scaffold.id);
    setManualEditOpenId(key);
    setManualEditMap((prevMap) => ({
    ...prevMap,
    [key]: prevMap[key] ?? getScaffoldTextValue(scaffold),
    }));

    setScaffolds((prev) =>
      prev.map((s) => {
        if (keyForId(s.id) === key) {
          if (s.status === 'ACCEPTED' || s.status === 'REJECTED') {
            return { ...s, status: 'IN PROGRESS' };
          }
        }
        return s;
      })
    );
  };

  const handleManualEditInputChange = (key: string, value: string) => {
    setManualEditMap((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const submitManualEdit = async (scaffold: any, valueOverride?: string) => {
    const key = keyForId(scaffold.id);
    const editedValueRaw = valueOverride ?? manualEditMap[key] ?? '';
    const editedValue = editedValueRaw.trim();
    if (!editedValue) {
      alert('Please enter the updated text before saving.');
      return null;
    }

    try {
      const scaffoldId = scaffold.scaffold_id || scaffold.id;
      console.log('[Frontend] Manual edit - calling API:', { scaffoldId, new_text: editedValue });
      
      const res = await fetch(`/api/annotation-scaffolds/${scaffoldId}/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          new_text: editedValue,
        }),
      });

      if (!res.ok) {
        throw new Error(`Manual edit failed: ${res.status}`);
      }

      const data = await res.json();
      // Backend returns { scaffold: {...} }, adapt to processReviewResponse format
      const responseData = {
        action_result: data.scaffold,
        __interrupt__: null,
      };
      processReviewResponse(scaffold.id, responseData);
      setManualEditMap((prev) => ({
        ...prev,
        [key]: valueOverride ?? editedValueRaw,
      }));
      return responseData;
    } catch (error) {
      console.error('Manual edit failed:', error);
      return null;
    }
  };
  // Handle scaffold review actions using new API
  const handleScaffoldAction = async (scaffoldId: number | string, action: string) => {
    const scaffoldIndex = scaffolds.findIndex(s => s.id === scaffoldId);
    if (scaffoldIndex === -1) return;

    const scaffold = scaffolds[scaffoldIndex];

    if (scaffold?.fragment) {
      setActiveFragment(scaffold.fragment);
    }

    try {
      if (action === 'modify') {
        setModificationRequest('');
        
        // If scaffold is already accepted, change status to IN PROGRESS
        if (scaffold.status === 'ACCEPTED') {
          setScaffolds(prev => prev.map((s) => {
            if (s.id === scaffoldId) {
              return { ...s, status: 'IN PROGRESS' };
            }
            return s;
          }));
        }

        setCurrentReviewIndex(scaffoldIndex);
        openManualEditForScaffold(scaffold);
        
        // Scroll to modification request input box
        setTimeout(() => {
          modificationTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          modificationTextareaRef.current?.focus();
        }, 100);
        return;
      }

      const scaffoldKey = keyForId(scaffold.id);
      if (action === 'accept') {
        setManualEditSubmittingId(scaffoldKey);
      }
      const originalBuffer = getScaffoldTextValue(scaffold).trim();
      const editedRawValue = manualEditMap[scaffoldKey] ?? getScaffoldTextValue(scaffold);
      const editedBuffer = editedRawValue.trim();

      if (action === 'accept' && editedBuffer && editedBuffer !== originalBuffer) {
        const manualEditResponse = await submitManualEdit(scaffold, editedRawValue);
        if (!manualEditResponse) {
          return;
        }
      }

      // Call corresponding backend API directly
      const scaffoldId = scaffold.scaffold_id || scaffold.id;
      let res: Response;
      let data: any;

      if (action === 'accept') {
        console.log('[Frontend] Approving scaffold:', scaffoldId);
        res = await fetch(`/api/annotation-scaffolds/${scaffoldId}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`Approve API failed: ${res.status}`);
        const responseData = await res.json();
        console.log('[Frontend] Backend response (approve):', responseData);
        console.log('[Frontend] Backend response.scaffold:', responseData.scaffold);
        console.log('[Frontend] Backend response.scaffold.status:', responseData.scaffold?.status);
        // Adapt response format
        data = {
          action_result: responseData.scaffold,
          __interrupt__: null,
        };
        console.log('[Frontend] Formatted data for processReviewResponse:', data);
      } else if (action === 'reject') {
        console.log('[Frontend] Rejecting scaffold:', scaffoldId);
        res = await fetch(`/api/annotation-scaffolds/${scaffoldId}/reject`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
        if (!res.ok) throw new Error(`Reject API failed: ${res.status}`);
        const responseData = await res.json();
        console.log('[Frontend] Backend response (reject):', responseData);
        console.log('[Frontend] Backend response.scaffold:', responseData.scaffold);
        console.log('[Frontend] Backend response.scaffold.status:', responseData.scaffold?.status);
        // Adapt response format
        data = {
          action_result: responseData.scaffold,
          __interrupt__: null,
        };
        console.log('[Frontend] Formatted data for processReviewResponse:', data);
      } else {
        // edit action should be handled by handleSendModificationRequest
        return;
      }

      processReviewResponse(
        scaffold.id,
        data,
        action === 'accept' ? 'ACCEPTED' : action === 'reject' ? 'REJECTED' : undefined
      );
    } catch (e) {
      console.error('Review action failed:', e);
      alert('Failed to process review action. Please try again.');
    } finally {
      if (action === 'accept') {
        setManualEditSubmittingId(null);
      }
    }
  };

  const handleSendModificationRequest = async () => {
    const message = modificationRequest.trim();
    if (!message) {
      return;
    }

    const currentCard = scaffolds[currentReviewIndex] ?? null;
    if (!currentCard) {
      return;
    }

    try {
      const scaffoldId = currentCard.scaffold_id || currentCard.id;
      console.log('[Frontend] LLM refine scaffold:', { scaffoldId, prompt: message });
      
      const res = await fetch(`/api/annotation-scaffolds/${scaffoldId}/llm-refine`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
        })
      });

      if (!res.ok) throw new Error(`LLM refine API failed: ${res.status}`);
      const data = await res.json();
      
      // Adapt response format
      const responseData = {
        action_result: data.scaffold,
        __interrupt__: null,
      };
      
      processReviewResponse(currentCard.id, responseData);

      // Update scaffold with edited version
      if (data.scaffold) {
        const editedItem = data.scaffold;
        const scaffoldToUpdate = scaffolds.find(s => s.id === currentCard.id);
        if (scaffoldToUpdate) {
          const normalizedText = normalizeScaffoldText(editedItem.text);
          const { title, texts } = extractTitleFromTexts(normalizedText);
          setScaffolds(prev => prev.map((s) => {
            if (s.id === scaffoldToUpdate.id) {
              return {
                ...s,
                title: title ?? s.title,
                fragment: editedItem.fragment,
                text: texts,
                content: texts[0] || editedItem.fragment,
                history: s.history ?? []
              };
            }
            return s;
          }));
          // Clear history cache for this scaffold to force reload
          setHistoryMap(prev => {
            const newMap = { ...prev };
            delete newMap[scaffoldToUpdate.id];
            return newMap;
          });
        }
      }

      setModificationRequest('');
    } catch (e) {
      console.error('Modification request failed:', e);
      alert('Failed to send modification request. Please try again.');
    }
  };

  const handleOpenPublishModal = () => {
    setPublishError(null);
    setShowPublishModal(true);
  };

  const resetWorkflow = useCallback(
    (options: { preserveSessionFields?: boolean } = {}) => {
      const { preserveSessionFields = false } = options;
      setScaffolds([]);
      setScaffoldsGenerated(false);
      setPdfContent('');
      setPdfUrl(null);
      setThreadId(null);
      setActiveFragment(null);
      setManualEditMap({});
      setManualEditOpenId(null);
      setManualEditSubmittingId(null);
      setReviewProgress(null);
      setCurrentReviewIndex(-1);
      setHistoryMap({});
      setOpenHistoryId(null);
      setModificationRequest('');
      setPublishError(null);
      setShowPublishModal(false);
      setShowDownloadModal(false);
      setMdContent('');
      setDragActive(false);
      setShowPostPublishModal(false);
      if (preserveSessionFields) {
        setFormData(prev => ({
          ...createInitialFormState(),
          sessionInformation: prev.sessionInformation,
          assignmentDescription: prev.assignmentDescription,
          assignmentGoals: prev.assignmentGoals,
        }));
      } else {
        setFormData(createInitialFormState());
      }
    },
    []
  );

  const handleStartNextSession = () => {
    resetWorkflow({ preserveSessionFields: true });
    advanceReadingPointer();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleGoHome = () => {
    setShowPostPublishModal(false);
    router.push('/');
  };

  const generateMarkdown = () => {
    const sessionName = formData.sessionInformation
      ? formData.sessionInformation.split('\n')[0].substring(0, 50)
      : 'Reading Scaffolds';
    const date = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    let md = `# ${sessionName}\nDate: ${date}\n\n`;

    acceptedScaffolds.forEach((scaffold) => {
       const title = scaffold.title || `Scaffold ${scaffold.number}`;
       md += `## ${scaffold.number}. ${title}\n\n`;
       if (scaffold.fragment) {
         md += `**Original Text:**\n> ${scaffold.fragment.replace(/\n/g, '\n> ')}\n\n`;
       }
       const text = Array.isArray(scaffold.text) ? scaffold.text.join('\n\n') : scaffold.text;
       md += `**Scaffold Question:**\n${text}\n\n`;
       md += `---\n\n`;
    });
    return md;
  };

  const handleOpenDownloadModal = () => {
    if (acceptedScaffolds.length === 0) {
      alert('No accepted scaffolds to download.');
      return;
    }
    const md = generateMarkdown();
    setMdContent(md);
    setShowDownloadModal(true);
  };

  const handleDownloadMD = () => {
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sessionName = formData.sessionInformation
        ? formData.sessionInformation.split('\n')[0].substring(0, 50).replace(/[^a-z0-9]/gi, '-').toLowerCase()
        : 'scaffolds';
    a.download = `${sessionName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(mdContent);
      alert('Copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy:', err);
      alert('Failed to copy to clipboard');
    }
  };

  const handleDownloadPDF = async () => {
    if (acceptedScaffolds.length === 0) {
      alert('No accepted scaffolds to download.');
      return;
    }

    try {
      const sessionName = formData.sessionInformation 
        ? formData.sessionInformation.split('\n')[0].substring(0, 50)
        : undefined;
      
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      await generateScaffoldPDF(acceptedScaffolds, {
        sessionName,
        date,
      });
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const handleConfirmPublish = async () => {
    if (acceptedScaffolds.length === 0) {
      setPublishError('No scaffolds available to publish.');
      return;
    }

    // Extract annotation IDs from accepted scaffolds
    const annotationIds = acceptedScaffolds
      .map((scaffold) => scaffold.id)
      .filter((id) => id); // Filter out any undefined/null IDs

    if (annotationIds.length === 0) {
      setPublishError('No valid annotation IDs found in accepted scaffolds.');
      return;
    }

    try {
      setPublishLoading(true);
      setPublishError(null);
      console.log('[Frontend] Publishing annotations with IDs:', annotationIds);
      const response = await fetch(`/api/perusall/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_ids: annotationIds }),
      });

      const data = await response.json().catch((e) => {
        console.error('[Frontend] Failed to parse response JSON:', e);
        return {};
      });

      console.log('[Frontend] Perusall API response:', {
        status: response.status,
        ok: response.ok,
        data: data
      });

      if (!response.ok) {
        const errorMessage =
          data?.detail ||
          (Array.isArray(data?.errors) && data.errors.length > 0 && data.errors[0]?.error) ||
          data?.message ||
          (data?.errors && JSON.stringify(data.errors)) ||
          `Publish failed with status ${response.status}: ${response.statusText}`;
        console.error('[Frontend] Perusall API error:', errorMessage);
        throw new Error(errorMessage);
      }

      if (data?.success === false) {
        const errorMessage =
          (Array.isArray(data?.errors) && data.errors.length > 0 && data.errors[0]?.error) ||
          data?.message ||
          (data?.errors && JSON.stringify(data.errors)) ||
          'Publish failed: Unknown error';
        console.error('[Frontend] Perusall API returned success=false:', data);
        throw new Error(errorMessage);
      }

      setShowPublishModal(false);
      setShowPostPublishModal(true);
    } catch (error) {
      console.error('[Frontend] Publish failed:', error);
      console.error('[Frontend] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to publish scaffolds. Please try again.';
      
      setPublishError(errorMessage);
      console.error('[Frontend] Error message displayed to user:', errorMessage);
    } finally {
      setPublishLoading(false);
    }
  };

  return (
    <div className={`${styles.page} ${scaffoldsGenerated ? styles.hasThreeColumnLayout : ''}`}>
      <Navigation />
      
      {!scaffoldsGenerated ? (
        // Initial layout: complete form
      <main className={styles.formContent}>
        <div className={styles.formHeader}>
          {/* Page Title */}
          <h1 className={styles.formTitle}>Create New Reading Task</h1>

          {/* Progress Indicator */}
          <div className={styles.stepper}>
            {/* Step 1 */}
              <div className={getStepClasses(1)}>
                <div className={getStepNumberClasses(1)}>1</div>
                <span className={getStepLabelClasses(1)}>Session information</span>
            </div>
            <div className={styles.stepSeparator} />
            {/* Step 2 */}
              <div className={getStepClasses(2)}>
                <div className={getStepNumberClasses(2)}>2</div>
                <span className={getStepLabelClasses(2)}>Assignment description</span>
            </div>
            <div className={styles.stepSeparator} />
            {/* Step 3 */}
              <div className={getStepClasses(3)}>
                <div className={getStepNumberClasses(3)}>3</div>
                <span className={getStepLabelClasses(3)}>Assignment goals</span>
            </div>
          </div>
        </div>

        {/* Form */}
        <div className={styles.formCard}>
          {renderInputStack('initial')}
        </div>
        </main>
      ) : (
        // Three-column layout
        <div className={styles.layoutAfterGeneration}>
          {/* Left: Form */}
          <div className={styles.leftPanel}>
            <div className={styles.formCard}>
              {renderInputStack('regenerate')}
            </div>
          </div>

          {/* Middle: PDF content */}
          <div className={styles.middlePanel}>
            {pdfContent === 'PDF_LOADED' ? (
              <div className={styles.pdfContent}>
                <PdfPreviewComponent 
                  url={pdfUrl || undefined}
                  file={pdfUrl ? null : formData.uploadedFile}
                  onTextExtracted={handleTextExtracted} 
                  scrollToFragment={activeFragment || undefined}
                  scaffoldIndex={activeFragment ? scaffolds.findIndex(s => s.fragment === activeFragment) : undefined}
                  searchQueries={scaffolds.map(s => s.fragment).filter(f => f && f.trim())}
                  scaffolds={scaffolds.map(s => ({
                    id: s.id,
                    fragment: s.fragment,
                    history: s.history || [],
                  }))}
                  sessionId={sessionId || undefined}
                />
              </div>
            ) : (
              <div className={styles.pdfContent}>
                <div dangerouslySetInnerHTML={{ __html: pdfContent }} />
              </div>
            )}
          </div>

          {/* Right: Scaffolds */}
          <div className={styles.rightPanel}>
            <div className={styles.container}>
              <div className={styles.scaffoldsContainer}>
              <div className={styles.scaffoldsHeader}>
                <h3>Scaffolds Progress</h3>
                <div className={styles.progressBadge}>
                  {reviewedCount}/{scaffolds.length} reviewed
                </div>
              </div>
              
              <div className={styles.scaffoldsList}>
              {scaffolds.map((scaffold) => {
                const scaffoldKey = keyForId(scaffold.id);
                const hasDecisionButtons = scaffold.status !== 'ACCEPTED' && scaffold.status !== 'REJECTED';
                const actionClassName = `${styles.scaffoldActions} ${!hasDecisionButtons ? styles.scaffoldActionsCompact : ''}`;
                return (
                  <div
                    key={scaffold.id}
                    className={`${styles.scaffoldCard} ${
                      scaffold.status === 'ACCEPTED'
                        ? styles.accepted
                        : scaffold.status === 'REJECTED'
                        ? styles.rejected
                        : styles.inProgress
                    }`}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest('button, textarea, li')) return;
                      if (scaffold.fragment) {
                        const scaffoldIdx = scaffold.number - 1;
                        setActiveFragment(scaffold.fragment);
                      } else {
                        console.warn('No fragment available for scaffold:', scaffold.number);
                      }
                    }}
                  >
                    <div className={styles.scaffoldHeader}>
                      <div className={styles.scaffoldHeaderLeft}>
                        <div className={styles.scaffoldNumber}>
                          {scaffold.number}
                        </div>
                        <div className={styles.scaffoldType}>
                      {scaffold.title || scaffold.type || 'Scaffold'}
                        </div>
                      </div>
                      <div className={styles.scaffoldStatus}>
                        {scaffold.status === 'ACCEPTED'
                          ? 'ACCEPTED'
                          : scaffold.status === 'REJECTED'
                          ? 'REJECTED'
                          : 'IN PROGRESS'}
                      </div>
                    </div>
                    
                    <div className={styles.scaffoldContent}>
                      {manualEditOpenId === scaffoldKey ? (
                        <textarea
                          className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
                          style={{ width: '100%', minHeight: '140px' }}
                          value={manualEditMap[scaffoldKey] ?? ''}
                          onChange={(e) => handleManualEditInputChange(scaffoldKey, e.target.value)}
                          onClick={(e) => e.stopPropagation()}
                          autoFocus
                        />
                      ) : (() => {
                        const textItems = Array.isArray(scaffold.text)
                          ? scaffold.text
                          : normalizeScaffoldText(scaffold.text);
                        if (textItems.length > 0) {
                          return (
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                              {textItems.map((textItem: string, textIdx: number) => (
                                <li
                                  key={textIdx}
                                  className={styles.scaffoldText}
                                  style={{ marginBottom: '8px', lineHeight: '1.5' }}
                                  role="button"
                                  tabIndex={0}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openManualEditForScaffold(scaffold);
                                    if (scaffold.fragment) {
                                      setActiveFragment(scaffold.fragment);
                                    }
                                  }}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      openManualEditForScaffold(scaffold);
                                      if (scaffold.fragment) {
                                        setActiveFragment(scaffold.fragment);
                                      }
                                    }
                                  }}
                                >
                                  {textItem}
                                </li>
                              ))}
                            </ul>
                          );
                        }
                        return (
                          <p className={styles.scaffoldText}>
                            {scaffold.content || 'No scaffold text available'}
                          </p>
                        );
                      })()}
                    </div>
                    
                    <div className={actionClassName}>
                      {hasDecisionButtons && (
                        <>
                          <button
                            className={`${uiStyles.btn} ${uiStyles.btnAccept}`}
                            disabled={manualEditSubmittingId === scaffoldKey}
                            onClick={(e) => {
                              e.stopPropagation(); // Prevent card click
                              handleScaffoldAction(scaffold.id, 'accept');
                            }}
                          >
                            Accept
                          </button>
                          <button
                            className={`${uiStyles.btn} ${uiStyles.btnReject}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleScaffoldAction(scaffold.id, 'reject');
                            }}
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <button 
                        className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                        onClick={(e) => {
                          e.stopPropagation(); // Prevent card click
                          handleScaffoldAction(scaffold.id, 'modify');
                        }}
                      >
                        Modify
                      </button>
                      <button 
                        className={`${uiStyles.btn} ${uiStyles.btnOutline}`}
                        onClick={async (e) => {
                          e.stopPropagation(); // Prevent card click
                          if (scaffold.fragment) {
                            setActiveFragment(scaffold.fragment);
                          }
                          try {
                            if (!historyMap[scaffold.id] && sessionId && scaffold.scaffold_id) {
                              // Use new history API: GET /threads/{session_id}/scaffolds/{scaffold_id}/history
                              const res = await fetch(`/threads/${sessionId}/scaffolds/${scaffold.scaffold_id}/history`);
                              if (res.ok) {
                                const data = await res.json();
                                const events = Array.isArray(data.history) ? data.history : [];
                                const approvedEvents = events.filter(
                                  (event: any) => event.action === 'approve'
                                );

                                const sortedEvents = [...events].sort(
                                  (a, b) => (a?.version ?? 0) - (b?.version ?? 0)
                                );

                                const extractPayloadText = (payload: any): string => {
                                  if (!payload) return '';
                                  const possibleTexts = [
                                    payload.text,
                                    payload.new_text,
                                    payload.old_text
                                  ];
                                  for (const value of possibleTexts) {
                                    if (Array.isArray(value)) {
                                      const joined = value.join('\n\n').trim();
                                      if (joined) return joined;
                                    } else if (typeof value === 'string') {
                                      const trimmed = value.trim();
                                      if (trimmed) return trimmed;
                                    }
                                  }
                                  return '';
                                };

                                const versionTextMap = new Map<number, string>();
                                let lastKnownText = '';

                                sortedEvents.forEach((event: any) => {
                                  const payloadText = extractPayloadText(event?.payload);
                                  if (payloadText) {
                                    lastKnownText = payloadText;
                                  }
                                  if (event?.action === 'approve') {
                                    versionTextMap.set(event.version, lastKnownText);
                                  }
                                });

                                const historyList = approvedEvents
                                  .sort(
                                    (a: { version: number }, b: { version: number }) =>
                                      a.version - b.version
                                  )
                                  .map((event: any, index: number) => ({
                                    version: event.version,
                                    text: versionTextMap.get(event.version) || lastKnownText || '',
                                    displayVersion: index + 1
                                  }));
                                setHistoryMap(prev => ({ ...prev, [scaffold.id]: historyList }));
                              }
                            }
                            setOpenHistoryId(prev => prev === scaffold.id ? null : scaffold.id);
                          } catch (err) {
                            console.error('Failed to load history:', err);
                          }
                        }}
                      >
                        History
                      </button>
                    </div>

                    {openHistoryId === scaffold.id && (historyMap[scaffold.id]?.length ? (
                      <div className={styles.scaffoldHistory}>
                        <div className={styles.scaffoldHistoryHeader}>Approved versions</div>
                        <div className={styles.scaffoldHistoryList}>
                          {historyMap[scaffold.id].slice().reverse().map((h: any, historyIdx: number) => (
                            <div key={`${h.version ?? historyIdx}-${scaffold.id}`} className={styles.scaffoldHistoryItem}>
                              <span className={styles.scaffoldHistoryBadge}>
                                Version {h.displayVersion ?? historyIdx + 1}
                              </span>
                              <p className={styles.scaffoldHistoryText}>
                                {h.text || 'No scaffold text'}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className={styles.scaffoldHistoryMeta}>No approved versions yet.</div>
                    ))}
                  </div>
                );
              })}
              </div>
              
              <div className={styles.scaffoldsFooter}>
                <div className={styles.inlineRow}>
                  <div className={`${uiStyles.field} ${styles.inlineField}`}>
                    <label className={uiStyles.fieldLabel}>Request modifications</label>
                    <div className={styles.inlineControls}>
                      <textarea
                        ref={modificationTextareaRef}
                        className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea} ${styles.inlineTextarea}`}
                        placeholder="Describe what modifications you'd like to make to the scaffolds..."
                        value={modificationRequest}
                        onChange={(e) => setModificationRequest(e.target.value)}
                        rows={2}
                      />
                      <button 
                        className={`${uiStyles.btn} ${uiStyles.btnOutline}`}
                        type="button"
                        onClick={handleSendModificationRequest}
                      >
                        Send
                      </button>
                    </div>
                  </div>
                </div>
                <div className={styles.footerPrimary}>
                  <button
                    className={`${uiStyles.btn} ${uiStyles.btnNeutral} ${styles.publishButton}`}
                    type="button"
                    onClick={handleOpenDownloadModal}
                    disabled={acceptedScaffolds.length === 0}
                    style={{ marginRight: '0.75rem' }}
                  >
                    Download / Export
                  </button>
                  <button
                    className={`${uiStyles.btn} ${uiStyles.btnPrimary} ${styles.publishButton}`}
                    type="button"
                    onClick={handleOpenPublishModal}
                    disabled={!allReviewed || acceptedScaffolds.length === 0}
                  >
                    Publish Accepted Scaffolds
                  </button>
                </div>
              </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {showPublishModal && (
        <div className={uiStyles.publishOverlay}>
          <div className={uiStyles.publishModal}>
            <div className={uiStyles.publishModalHeader}>
              <h3>Publish Accepted Scaffolds</h3>
            </div>
            <div className={uiStyles.publishModalBody}>
              <p className={uiStyles.fieldHint} style={{ marginBottom: '1rem' }}>
                Perusall credentials are managed via backend configuration. Each accepted scaffold will be
                posted as an annotation for the configured course and assignment.
              </p>
              {publishError && (
                <p style={{ color: 'var(--red-600)', marginTop: 0, fontSize: '0.875rem' }}>{publishError}</p>
              )}
              {acceptedScaffolds.length === 0 ? (
                <p>No scaffolds have been accepted yet.</p>
              ) : (
                <ul className={uiStyles.publishList}>
                  {acceptedScaffolds.map((scaffold) => (
                    <li key={scaffold.id} className={uiStyles.publishListItem}>
                      <span className={uiStyles.publishListNumber}>#{scaffold.number}</span>
                      <span className={uiStyles.publishListContent}>
                        {scaffold.content || 'No scaffold text available'}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={uiStyles.publishModalActions}>
              <button
                type="button"
                className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                onClick={() => {
                  setShowPublishModal(false);
                  setPublishError(null);
                }}
              >
                Back
              </button>
              <button
                type="button"
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                onClick={handleConfirmPublish}
                disabled={acceptedScaffolds.length === 0 || publishLoading}
              >
                {publishLoading ? 'Publishing…' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDownloadModal && (
        <div className={uiStyles.publishOverlay}>
          <div className={uiStyles.publishModal} style={{ width: 'min(40rem, 100%)' }}>
            <div className={uiStyles.publishModalHeader}>
              <h3>Download / Export Scaffolds</h3>
            </div>
            <div className={uiStyles.publishModalBody} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <label className={uiStyles.fieldLabel} style={{ marginBottom: '0.5rem', display: 'block' }}>
                  Markdown Preview
                </label>
                <textarea
                  readOnly
                  value={mdContent}
                  className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
                  style={{ minHeight: '300px', fontFamily: 'monospace', fontSize: '0.85rem', whiteSpace: 'pre' }}
                />
              </div>
            </div>
            <div className={uiStyles.publishModalActions} style={{ justifyContent: 'space-between' }}>
              <button
                type="button"
                className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                onClick={() => setShowDownloadModal(false)}
              >
                Cancel
              </button>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button
                  type="button"
                  className={`${uiStyles.btn} ${uiStyles.btnOutline}`}
                  onClick={handleCopyToClipboard}
                >
                  Copy MD
                </button>
                <button
                  type="button"
                  className={`${uiStyles.btn} ${uiStyles.btnOutline}`}
                  onClick={handleDownloadMD}
                >
                  Download MD
                </button>
                <button
                  type="button"
                  className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                  onClick={handleDownloadPDF}
                >
                  Download PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPostPublishModal && (
        <div className={uiStyles.publishOverlay}>
          <div className={uiStyles.publishModal} style={{ width: 'min(34rem, 100%)' }}>
            <div className={uiStyles.publishModalHeader}>
              <h3>Scaffolds published!</h3>
            </div>
            <div className={uiStyles.publishModalBody}>
              <p style={{ marginBottom: '1rem' }}>
                Your scaffolds are live. Would you like to kick off the next session or wrap up for now?
              </p>
            </div>
            <div className={uiStyles.publishModalActions} style={{ flexWrap: 'wrap' }}>
              <button
                type="button"
                className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                onClick={handleGoHome}
              >
                Go to Home
              </button>
              <button
                type="button"
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                onClick={handleStartNextSession}
              >
                Start Next Session Setup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

