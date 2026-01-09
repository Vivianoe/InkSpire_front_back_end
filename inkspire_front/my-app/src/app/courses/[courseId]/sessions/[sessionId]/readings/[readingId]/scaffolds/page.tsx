'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import dynamic from 'next/dynamic';
import Navigation from './Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from './page.module.css';

// Dynamically import PdfPreview from components to avoid SSR issues
const PdfPreview = dynamic(
  () => import('@/components/ui/PdfPreview'),
  { 
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center" style={{ height: '400px' }}>
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
          <p className="mt-2 text-gray-600">Loading PDF viewer...</p>
        </div>
      </div>
    )
  }
);

interface ScaffoldData {
  id: string;
  fragment: string;
  text: string;
  status: string;
  history: Array<{
    ts: number;
    action: string;
    prompt?: string;
    old_text?: string;
    new_text?: string;
  }>;
}

interface SessionReadingNavigation {
  sessionId: string;
  readingIds: string[];
  currentIndex: number;
  courseId: string;
  profileId: string;
  instructorId: string;
}

export default function ScaffoldPage() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  
  const [scaffolds, setScaffolds] = useState<ScaffoldData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [navigationData, setNavigationData] = useState<SessionReadingNavigation | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [activeFragment, setActiveFragment] = useState<string | null>(null);
  const [manualEditSubmittingId, setManualEditSubmittingId] = useState<string | null>(null);
  const [manualEditOpenId, setManualEditOpenId] = useState<string | null>(null);
  const [manualEditMap, setManualEditMap] = useState<Record<string, string>>({});
  const [modificationRequest, setModificationRequest] = useState('');
  const modificationTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentReviewIndex, setCurrentReviewIndex] = useState<number>(-1);
  
  // Form data for session info
  const [sessionInfo, setSessionInfo] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentGoals, setAssignmentGoals] = useState('');
  
  // Generate scaffolds state
  const [generating, setGenerating] = useState(false);
  
  // Publish states
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [publishLoading, setPublishLoading] = useState(false);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [mdContent, setMdContent] = useState('');

  const courseId = params.courseId as string;
  const sessionId = params.sessionId as string;
  const readingId = params.readingId as string;
  const enableNavigation = searchParams.get('navigation') === 'true';

  // Load navigation data from sessionStorage
  useEffect(() => {
    if (typeof window !== 'undefined' && enableNavigation) {
      try {
        const stored = window.sessionStorage.getItem('inkspire:sessionReadingNavigation');
        if (stored) {
          const navData = JSON.parse(stored) as SessionReadingNavigation;
          setNavigationData(navData);
        }
      } catch (err) {
        console.error('Failed to load navigation data:', err);
      }
    }
  }, [enableNavigation]);

  // Load scaffolds for current reading
  useEffect(() => {
    const loadScaffolds = async () => {
      if (!courseId) return; // Wait for courseId to be available
      
      try {
        setLoading(true);
        
        const response = await fetch(
          `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds`
        );
        
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData?.detail || errorData?.message || 'Failed to load scaffolds');
        }
        
        const data = await response.json();
        setScaffolds(data.scaffolds || []);
        setPdfUrl(data.pdfUrl || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load scaffolds');
      } finally {
        setLoading(false);
      }
    };

    if (courseId && sessionId && readingId) {
      loadScaffolds();
    }
  }, [courseId, sessionId, readingId]);

  // Navigation functions
  const navigateToReading = (direction: 'prev' | 'next') => {
    if (!navigationData) return;

    const newIndex = direction === 'prev' 
      ? navigationData.currentIndex - 1 
      : navigationData.currentIndex + 1;

    // Check bounds
    if (newIndex < 0 || newIndex >= navigationData.readingIds.length) {
      return;
    }

    // Update navigation data
    const updatedNavData = {
      ...navigationData,
      currentIndex: newIndex,
    };

    // Save updated navigation data
    if (typeof window !== 'undefined') {
      window.sessionStorage.setItem(
        'inkspire:sessionReadingNavigation',
        JSON.stringify(updatedNavData)
      );
    }

    // Navigate to next/previous reading
    const nextReadingId = navigationData.readingIds[newIndex];
    router.push(
      `/courses/${courseId}/sessions/${sessionId}/readings/${nextReadingId}/scaffolds?navigation=true`
    );
  };

  const canGoPrev = navigationData && navigationData.currentIndex > 0;
  const canGoNext = navigationData && navigationData.currentIndex < navigationData.readingIds.length - 1;

  // Helper functions for processing review response
  const keyForId = (value: number | string) => String(value);

  const getScaffoldTextValue = (scaffold: ScaffoldData) => {
    if (typeof scaffold.text === 'string') {
      return scaffold.text;
    }
    return '';
  };

  const processReviewResponse = (
    targetCardId: number | string | null,
    data: any,
    fallbackStatus?: 'ACCEPTED' | 'REJECTED'
  ) => {
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
            keyForId(s.id) === keyForId(actionResult.id)
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
      const normalizedResultText = typeof actionResult.text === 'string' ? actionResult.text : '';
      const normalizedStatus = typeof actionResult.status === 'string' ? actionResult.status.toLowerCase() : '';

      setScaffolds((prev) =>
        prev.map((s) => {
          if (keyForId(s.id) === targetKey) {
            let nextStatus = s.status;
            // Backend historically used both "approved" and "accepted"
            if (normalizedStatus === 'approved' || normalizedStatus === 'accepted') nextStatus = 'ACCEPTED';
            else if (normalizedStatus === 'rejected') nextStatus = 'REJECTED';
            else if (normalizedStatus === 'pending' || normalizedStatus === 'draft' || normalizedStatus === 'edit_pending') nextStatus = 'IN PROGRESS';

            return {
              ...s,
              status: nextStatus,
              fragment: actionResult.fragment ?? s.fragment,
              text: normalizedResultText || s.text,
              history: Array.isArray(actionResult.history) ? actionResult.history : s.history ?? [],
            };
          }
          return s;
        })
      );

      setManualEditMap((prev) => {
        const next = { ...prev };
        next[targetKey] = normalizedResultText || next[targetKey] || '';
        return next;
      });

      if (
        manualEditOpenId === targetKey &&
        (normalizedStatus === 'approved' || normalizedStatus === 'accepted' || normalizedStatus === 'rejected')
      ) {
        setManualEditOpenId(null);
      }

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

  const openManualEditForScaffold = (scaffold: ScaffoldData) => {
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

  const submitManualEdit = async (scaffold: ScaffoldData, valueOverride?: string) => {
    const key = keyForId(scaffold.id);
    const editedValueRaw = valueOverride ?? manualEditMap[key] ?? '';
    const editedValue = editedValueRaw.trim();
    if (!editedValue) {
      alert('Please enter the updated text before saving.');
      return null;
    }

    const scaffoldIdForRequest = scaffold.id;

    const editUrl = `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/${scaffoldIdForRequest}/edit`;
    const res = await fetch(editUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_text: editedValue }),
    });

    if (!res.ok) {
      throw new Error(`Manual edit failed: ${res.status}`);
    }

    const data = await res.json();
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
  };

  // Scaffold action handlers
  const handleScaffoldAction = async (scaffoldId: string, action: 'accept' | 'reject' | 'llm-edit' | 'edit') => {
    const scaffoldIndex = scaffolds.findIndex((s) => keyForId(s.id) === keyForId(scaffoldId));
    if (scaffoldIndex === -1) return;
    const scaffold = scaffolds[scaffoldIndex];

    if (scaffold?.fragment) {
      setActiveFragment(scaffold.fragment);
    }

    try {
      if (action === 'edit') {
        setCurrentReviewIndex(scaffoldIndex);
        openManualEditForScaffold(scaffold);
        return;
      }

      if (action === 'llm-edit') {
        const message = modificationRequest.trim();
        setCurrentReviewIndex(scaffoldIndex);
        if (!message) {
          setTimeout(() => {
            modificationTextareaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            modificationTextareaRef.current?.focus();
          }, 100);
          return;
        }

        const scaffoldKey = keyForId(scaffold.id);
        setManualEditSubmittingId(scaffoldKey);

        const llmRefineUrl = `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/${scaffold.id}/llm-refine`;
        const res = await fetch(llmRefineUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: message,
          }),
        });

        if (!res.ok) {
          throw new Error(`LLM refine API failed: ${res.status}`);
        }

        const json = await res.json();
        const responseData = {
          action_result: json.scaffold,
          __interrupt__: null,
        };
        processReviewResponse(scaffold.id, responseData);
        setModificationRequest('');
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

      const endpoint =
        action === 'accept'
          ? `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/${scaffold.id}/approve`
          : `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/${scaffold.id}/reject`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        throw new Error(`${action} API failed: ${res.status}`);
      }

      const responseJson = await res.json();
      const data = {
        action_result: responseJson.scaffold,
        __interrupt__: null,
      };

      processReviewResponse(scaffold.id, data, action === 'accept' ? 'ACCEPTED' : 'REJECTED');
    } catch (err) {
      console.error('Review action failed:', err);
      alert('Failed to process review action. Please try again.');
    } finally {
      setManualEditSubmittingId(null);
    }
  };

  // Handle modification request
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
      const llmRefineUrl = `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/${currentCard.id}/llm-refine`;
      const res = await fetch(llmRefineUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: message,
        }),
      });

      if (!res.ok) {
        throw new Error(`LLM refine API failed: ${res.status}`);
      }

      const json = await res.json();
      const responseData = {
        action_result: json.scaffold,
        __interrupt__: null,
      };

      processReviewResponse(currentCard.id, responseData);
      setModificationRequest('');
    } catch (err) {
      console.error('Modification request failed:', err);
      alert('Failed to send modification request. Please try again.');
    }
  };

  // Handle generate scaffolds
  const handleGenerateScaffolds = async () => {
    try {
      setGenerating(true);
      setError(null);
      
      console.log('[ScaffoldPage] Generating scaffolds for session:', sessionId, 'reading:', readingId);
      
      const payload = {
        instructor_id: '550e8400-e29b-41d4-a716-446655440000', // Default instructor ID
      };
      
      const response = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData?.detail || errorData?.message || 'Failed to generate scaffolds.');
      }
      
      console.log('[ScaffoldPage] Scaffolds generated successfully');
      
      // Refresh scaffolds
      const refreshResponse = await fetch(
        `/api/courses/${courseId}/sessions/${sessionId}/readings/${readingId}/scaffolds`
      );
      if (refreshResponse.ok) {
        const data = await refreshResponse.json();
        console.log('[ScaffoldPage] Refreshed scaffolds:', data.scaffolds);
        setScaffolds(data.scaffolds || []);
      } else {
        console.error('[ScaffoldPage] Failed to refresh scaffolds');
      }
      
      alert('Scaffolds generated successfully!');
    } catch (err) {
      console.error('Failed to generate scaffolds:', err);
      setError(err instanceof Error ? err.message : 'Failed to generate scaffolds. Please try again.');
      alert(err instanceof Error ? err.message : 'Failed to generate scaffolds. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  // Process scaffolds for display
  const processedScaffolds = scaffolds.map((scaffold, index) => {
    const normalizedStatus = (typeof scaffold.status === 'string' ? scaffold.status : '').toLowerCase();
    const displayStatus =
      normalizedStatus === 'approved' || normalizedStatus === 'accepted'
        ? 'ACCEPTED'
        : normalizedStatus === 'rejected'
          ? 'REJECTED'
          : normalizedStatus === 'pending' ||
            normalizedStatus === 'draft' ||
            normalizedStatus === 'edit_pending' ||
            normalizedStatus === 'in progress' ||
            normalizedStatus === 'in_progress'
            ? 'IN PROGRESS'
            : 'IN PROGRESS';
    const processed = {
      ...scaffold,
      number: index + 1,
      title: 'Scaffold',
      type: 'Scaffold',
      backgroundColor: ['#f0fdf4', '#eff6ff', '#f9fafb', '#fef3c7', '#fce7f3'][index % 5],
      borderColor: ['#22c55e', '#3b82f6', '#6b7280', '#f59e0b', '#ec4899'][index % 5],
      status: displayStatus,
    };
    console.log(`[ScaffoldPage] Scaffold ${scaffold.id}: ${scaffold.status} -> ${processed.status}`);
    return processed;
  });

  const reviewedCount = processedScaffolds.filter(s => s.status === 'ACCEPTED' || s.status === 'REJECTED').length;

  // Helper functions for publish and download
  const generateMarkdown = (acceptedScaffolds: any[]) => {
    return acceptedScaffolds.map((scaffold, index) => {
      return `## Scaffold #${scaffold.number}

**Source Fragment:**
${scaffold.fragment}

**Scaffold Question:**
${scaffold.text || 'No scaffold text available'}

---
`;
    }).join('\n\n');
  };

  const handleCopyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(mdContent);
      alert('Markdown copied to clipboard!');
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
      alert('Failed to copy to clipboard. Please copy manually.');
    }
  };

  const handleDownloadMD = () => {
    const blob = new Blob([mdContent], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const sessionName = `scaffolds-${sessionId}`;
    a.download = `${sessionName}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    const acceptedScaffolds = processedScaffolds.filter(s => s.status === 'ACCEPTED');
    if (acceptedScaffolds.length === 0) {
      alert('No accepted scaffolds to download.');
      return;
    }

    try {
      const sessionName = sessionInfo || `scaffolds-${sessionId}`;
      
      const date = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });

      // For now, just show an alert. In a full implementation, this would generate a PDF
      alert(`PDF Download Feature\n\nSession: ${sessionName}\nDate: ${date}\nAccepted Scaffolds: ${acceptedScaffolds.length}\n\nIn a full implementation, this would generate a PDF file with all accepted scaffolds.`);
    } catch (error) {
      console.error('Failed to generate PDF:', error);
      alert('Failed to generate PDF. Please try again.');
    }
  };

  const handleConfirmPublish = async () => {
    const acceptedScaffolds = processedScaffolds.filter(s => s.status === 'ACCEPTED');
    if (acceptedScaffolds.length === 0) {
      setPublishError('No scaffolds available to publish.');
      return;
    }

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
      console.log('[ScaffoldPage] Publishing annotations with IDs:', annotationIds);
      const response = await fetch(`/api/perusall/annotations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ annotation_ids: annotationIds }),
      });

      const data = await response.json().catch((e) => {
        console.error('[ScaffoldPage] Failed to parse response JSON:', e);
        return {};
      });

      console.log('[ScaffoldPage] Perusall API response:', {
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
        console.error('[ScaffoldPage] Perusall API error:', errorMessage);
        throw new Error(errorMessage);
      }

      if (data?.success === false) {
        const errorMessage =
          (Array.isArray(data?.errors) && data.errors.length > 0 && data.errors[0]?.error) ||
          data?.message ||
          (data?.errors && JSON.stringify(data.errors)) ||
          'Publish failed: Unknown error';
        console.error('[ScaffoldPage] Perusall API returned success=false:', data);
        throw new Error(errorMessage);
      }

      setShowPublishModal(false);
      alert('Scaffolds published successfully!');
    } catch (error) {
      console.error('[ScaffoldPage] Publish failed:', error);
      console.error('[ScaffoldPage] Error details:', {
        message: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : 'Failed to publish scaffolds. Please try again.';
      
      setPublishError(errorMessage);
      console.error('[ScaffoldPage] Error message displayed to user:', errorMessage);
    } finally {
      setPublishLoading(false);
    }
  };

  if (loading) {
    return (
      <div className={styles.page}>
        <Navigation />
        <div className={styles.formContent}>
          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>Reading Scaffolds</h1>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <div className={styles.loadingSpinner}>Loading scaffolds...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <Navigation />
        <div className={styles.formContent}>
          <div className={styles.formHeader}>
            <h1 className={styles.formTitle}>Reading Scaffolds</h1>
          </div>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '400px' }}>
            <div style={{ color: '#dc2626', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: '500' }}>Error</p>
              <p>{error}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${styles.page} ${styles.hasThreeColumnLayout}`}>
      <Navigation />
      
      {/* Three-column layout */}
      <div className={styles.layoutAfterGeneration}>
        {/* Left: Info Panel */}
        <div className={styles.leftPanel}>
          <div className={styles.formCard}>
            <div className={styles.formHeader}>
              <h1 className={styles.formTitle}>Reading Scaffolds</h1>
            </div>
            
            {/* Session Information Form */}
            <div className={`${uiStyles.field} ${styles.fieldNarrow}`}>
              <div className={styles.labelWithIcon}>
                <label className={uiStyles.fieldLabel}>Session information</label>
              </div>
              <textarea
                value={sessionInfo}
                onChange={(e) => setSessionInfo(e.target.value)}
                className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
                placeholder="Include the session name, learning objectives, and any constraints in a single summary."
              />
            </div>

            <div className={`${uiStyles.field} ${styles.fieldNarrow}`}>
              <div className={styles.labelWithIcon}>
                <label className={uiStyles.fieldLabel}>Assignment description</label>
              </div>
              <textarea
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.target.value)}
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
                value={assignmentGoals}
                onChange={(e) => setAssignmentGoals(e.target.value)}
                className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
                placeholder="List the goals or competencies this assignment reinforces."
                rows={3}
              />
            </div>
            
            {/* Session Info Display */}
            {/*

            <div style={{ marginBottom: '1.5rem', padding: '1rem', backgroundColor: '#f8fafc', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1rem', color: '#374151' }}>Session Details</h3>
              <p style={{ color: '#6b7280', margin: '0.5rem 0' }}>
                <strong>Session ID:</strong> {sessionId}
              </p>
              <p style={{ color: '#6b7280', margin: '0.5rem 0' }}>
                <strong>Reading ID:</strong> {readingId}
              </p>
              <p style={{ color: '#6b7280', margin: '0.5rem 0' }}>
                <strong>Course ID:</strong> {courseId}
              </p>
              {navigationData && (
                <p style={{ color: '#6b7280', margin: '0.5rem 0' }}>
                  <strong>Progress:</strong> {navigationData.currentIndex + 1} of {navigationData.readingIds.length}
                </p>
              )}
            </div>
            */}

            {/* Navigation buttons */}
            {enableNavigation && navigationData && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
                <button
                  onClick={() => navigateToReading('prev')}
                  disabled={!canGoPrev}
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  style={{ opacity: canGoPrev ? 1 : 0.5, cursor: canGoPrev ? 'pointer' : 'not-allowed' }}
                >
                  ← Previous Reading
                </button>
                <button
                  onClick={() => navigateToReading('next')}
                  disabled={!canGoNext}
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  style={{ opacity: canGoNext ? 1 : 0.5, cursor: canGoNext ? 'pointer' : 'not-allowed' }}
                >
                  Next Reading →
                </button>
              </div>
            )}

            {/* Generate Scaffolds Button */}
            <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
              <button
                onClick={handleGenerateScaffolds}
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                disabled={generating}
                style={{ width: '100%', maxWidth: '300px' }}
              >
                {generating ? 'Generating...' : 'Generate Scaffolds'}
              </button>
            </div>

            {/* Back button */}
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <button
                onClick={() => router.back()}
                className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              >
                ← Back to Session
              </button>
            </div>

            {/* Publish and Download buttons */}
            {/*
            <div style={{ marginTop: '2rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', alignItems: 'center' }}>
                <button
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  onClick={() => {
                    const acceptedScaffolds = processedScaffolds.filter(s => s.status === 'ACCEPTED');
                    if (acceptedScaffolds.length === 0) {
                      alert('No accepted scaffolds to download.');
                      return;
                    }
                    const md = generateMarkdown(acceptedScaffolds);
                    setMdContent(md);
                    setShowDownloadModal(true);
                  }}
                  disabled={processedScaffolds.filter(s => s.status === 'ACCEPTED').length === 0}
                >
                  Download / Export
                </button>
                <button
                  className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                  onClick={() => {
                    const acceptedScaffolds = processedScaffolds.filter(s => s.status === 'ACCEPTED');
                    if (acceptedScaffolds.length === 0) {
                      alert('No accepted scaffolds to publish.');
                      return;
                    }
                    setShowPublishModal(true);
                  }}
                  disabled={processedScaffolds.filter(s => s.status === 'ACCEPTED').length === 0}
                >
                  Publish Accepted Scaffolds
                </button>
              </div> 
            </div> 
            */}
          </div> 
        </div>

        {/* Middle: PDF content */}
        <div className={styles.middlePanel}>
          <div className={styles.pdfContent}>
            <PdfPreview 
              url={pdfUrl || undefined}
              file={null}
              searchQueries={processedScaffolds.map(s => s.fragment).filter(f => f && f.trim())}
              scaffolds={processedScaffolds.map(s => ({
                id: s.id,
                fragment: s.fragment,
                history: s.history || [],
              }))}
              sessionId={sessionId}
              courseId={courseId}
              readingId={readingId}
              scrollToFragment={activeFragment || undefined}
              scaffoldIndex={activeFragment ? processedScaffolds.findIndex(s => s.fragment === activeFragment) : undefined}
            />
          </div>
        </div>

        {/* Right: Scaffolds */}
        <div className={styles.rightPanel}>
          <div className={styles.container}>
            <div className={styles.scaffoldsContainer}>
              <div className={styles.scaffoldsHeader}>
                <h3>Scaffolds Progress</h3>
                <div className={styles.progressBadge}>
                  {reviewedCount}/{processedScaffolds.length} reviewed
                </div>
              </div>
              
              <div className={styles.scaffoldsList}>
              {processedScaffolds.length === 0 ? (
                <div style={{ 
                  textAlign: 'center', 
                  padding: '3rem', 
                  color: '#6b7280',
                  backgroundColor: '#f9fafb',
                  borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb'
                }}>
                  <p style={{ fontSize: '1.1rem', marginBottom: '1rem' }}>No scaffolds found</p>
                  <p style={{ fontSize: '0.9rem' }}>No scaffolds have been generated for this reading yet.</p>
                </div>
              ) : (
                processedScaffolds.map((scaffold) => {
                  const scaffoldKey = scaffold.id;
                  const hasDecisionButtons = scaffold.status !== 'ACCEPTED' && scaffold.status !== 'REJECTED';
                  const actionClassName = `${styles.scaffoldActions} ${!hasDecisionButtons ? styles.scaffoldActionsCompact : ''}`;
                  const isEditing = manualEditOpenId === scaffoldKey;
                  
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
                            {scaffold.title || scaffold.type}
                          </div>
                        </div>
                        <div className={styles.scaffoldStatus}>
                          {scaffold.status}
                        </div>
                      </div>
                      
                      <div className={styles.scaffoldContent}>
                        <div style={{ padding: '1.25rem' }}>
                          {/* Source Fragment */}
                          <div style={{ 
                            marginBottom: '1rem', 
                            padding: '0.75rem', 
                            backgroundColor: '#f8fafc', 
                            borderRadius: '0.375rem',
                            border: '1px solid #e2e8f0'
                          }}>
                            <p style={{ 
                              margin: '0', 
                              fontSize: '0.85rem', 
                              color: '#64748b',
                              fontWeight: '500',
                              marginBottom: '0.5rem'
                            }}>
                              Source Fragment:
                            </p>
                            <p style={{ 
                              margin: '0', 
                              fontSize: '0.9rem', 
                              color: '#475569',
                              lineHeight: '1.5'
                            }}>
                              {scaffold.fragment}
                            </p>
                          </div>
                          
                          {/* Scaffold Question */}
                          <div style={{ 
                            padding: '0.75rem', 
                            backgroundColor: '#eff6ff', 
                            borderRadius: '0.375rem',
                            border: '1px solid #dbeafe'
                          }}>
                            <p style={{ 
                              margin: '0', 
                              fontSize: '0.85rem', 
                              color: '#1e40af',
                              fontWeight: '500',
                              marginBottom: '0.5rem'
                            }}>
                              Scaffold Question:
                            </p>
                            {isEditing ? (
                              <div>
                                <textarea
                                  className={`${uiStyles.fieldControl} ${uiStyles.fieldTextarea}`}
                                  style={{ width: '100%', minHeight: '140px' }}
                                  value={manualEditMap[scaffoldKey] ?? ''}
                                  onChange={(e) => handleManualEditInputChange(scaffoldKey, e.target.value)}
                                  onClick={(e) => e.stopPropagation()}
                                  autoFocus
                                />
                                <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem', justifyContent: 'flex-end' }}>
                                  <button
                                    type="button"
                                    className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setManualEditOpenId(null);
                                    }}
                                    disabled={manualEditSubmittingId === scaffoldKey}
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      try {
                                        setManualEditSubmittingId(scaffoldKey);
                                        const rawScaffold = scaffolds.find((s) => keyForId(s.id) === scaffoldKey);
                                        if (!rawScaffold) {
                                          throw new Error('Scaffold not found');
                                        }
                                        await submitManualEdit(rawScaffold, manualEditMap[scaffoldKey] ?? '');
                                      } catch (err) {
                                        console.error('Manual edit failed:', err);
                                        alert('Manual edit failed. Please try again.');
                                      } finally {
                                        setManualEditSubmittingId(null);
                                      }
                                    }}
                                    disabled={manualEditSubmittingId === scaffoldKey}
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <p style={{ 
                                margin: '0', 
                                fontSize: '0.9rem', 
                                color: '#1e3a8a',
                                lineHeight: '1.5'
                              }}>
                                {scaffold.text}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      
                      <div className={actionClassName}>
                        {hasDecisionButtons && (
                          <>
                            <button
                              className={`${uiStyles.btn} ${uiStyles.btnAccept}`}
                              disabled={manualEditSubmittingId === scaffoldKey}
                              onClick={(e) => {
                                e.stopPropagation();
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
                            e.stopPropagation();
                            handleScaffoldAction(scaffold.id, 'llm-edit');
                          }}
                          disabled={manualEditSubmittingId === scaffoldKey}
                        >
                          Refine with LLM
                        </button>
                        <button
                          className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleScaffoldAction(scaffold.id, 'edit');
                          }}
                          disabled={manualEditSubmittingId === scaffoldKey}
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
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
                    onClick={() => {
                      const acceptedScaffolds = processedScaffolds.filter(s => s.status === 'ACCEPTED');
                      if (acceptedScaffolds.length === 0) {
                        alert('No accepted scaffolds to download.');
                        return;
                      }
                      const md = generateMarkdown(acceptedScaffolds);
                      setMdContent(md);
                      setShowDownloadModal(true);
                    }}
                    disabled={processedScaffolds.filter(s => s.status === 'ACCEPTED').length === 0}
                    style={{ marginRight: '0.75rem' }}
                  >
                    Download / Export
                  </button>
                  <button
                    className={`${uiStyles.btn} ${uiStyles.btnPrimary} ${styles.publishButton}`}
                    type="button"
                    onClick={() => {
                      const acceptedScaffolds = processedScaffolds.filter(s => s.status === 'ACCEPTED');
                      if (acceptedScaffolds.length === 0) {
                        alert('No accepted scaffolds to publish.');
                        return;
                      }
                      setShowPublishModal(true);
                    }}
                    disabled={processedScaffolds.filter(s => s.status === 'ACCEPTED').length === 0}
                  >
                    Publish Accepted Scaffolds
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Publish Modal */}
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
              {processedScaffolds.filter(s => s.status === 'ACCEPTED').length === 0 ? (
                <p>No scaffolds have been accepted yet.</p>
              ) : (
                <ul className={uiStyles.publishList}>
                  {processedScaffolds.filter(s => s.status === 'ACCEPTED').map((scaffold) => (
                    <li key={scaffold.id} className={uiStyles.publishListItem}>
                      <span className={uiStyles.publishListNumber}>#{scaffold.number}</span>
                      <span className={uiStyles.publishListContent}>
                        {scaffold.text || 'No scaffold text available'}
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
                disabled={processedScaffolds.filter(s => s.status === 'ACCEPTED').length === 0 || publishLoading}
              >
                {publishLoading ? 'Publishing…' : 'Confirm & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Download Modal */}
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
    </div>
  );
}
