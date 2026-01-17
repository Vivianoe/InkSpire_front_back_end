'use client';

import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from './page.module.css';

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_COURSE_ID = '00000000-0000-4000-8000-000000000111';

type ReadingListItem = {
  id: string;
  title: string;
  instructorId?: string;
  courseId?: string;
  filePath?: string;
  sourceType?: string;
  createdAt?: string;
  sizeLabel?: string;
  usageCount?: number;
  lastUsedAt?: string;
  mimeType?: string;
  readingChunks?: any[];
  hasChunks?: boolean;
};

type SessionVersionData = {
  id: string;
  session_id: string;
  version_number: number;
  session_info_json?: { description?: string };
  assignment_info_json?: { description?: string };
  assignment_goals_json?: { goal?: string };
  reading_ids: string[];
  created_at?: string;
};

type SessionListItem = {
  id: string;
  course_id: string;
  week_number: number;
  title?: string;
  current_version_id?: string;
  status: string;
  created_at?: string;
  updated_at?: string;
  current_version?: SessionVersionData;
  reading_ids: string[];
};

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size)) return '0 KB';
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
};

export default function SessionCreationPage() {
  // Path parameters (from route: /class-profile/[id]/session/create or /courses/[courseId]/sessions/create)
  const pathParams = useParams();
  const router = useRouter();
  // Query parameters (from URL: ?instructorId=yyy - courseId and profileId are now in path)
  const searchParams = useSearchParams();
  const profileId = pathParams?.profileId || pathParams?.id as string; // Support both old and new routes
  const courseId = pathParams?.courseId as string | undefined; // New RESTful route
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [selectedReadingIds, setSelectedReadingIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [mode, setMode] = useState<'select' | 'create'>('select'); // 'select' or 'create'
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [weekNumber, setWeekNumber] = useState<number>(1);
  const [sessionDescription, setSessionDescription] = useState<string>('');
  const [assignmentDescription, setAssignmentDescription] = useState<string>('');
  const [assignmentGoal, setAssignmentGoal] = useState<string>('');

  // Draft state management - store original values for dirty check
  const [originalDraft, setOriginalDraft] = useState<{
    sessionTitle: string;
    weekNumber: number;
    sessionDescription: string;
    assignmentDescription: string;
    assignmentGoal: string;
    selectedReadingIds: string[];
  } | null>(null);
  const [currentVersion, setCurrentVersion] = useState<number | null>(null);
  const [isLoadingExistingSession, setIsLoadingExistingSession] = useState(false);

  // Get course_id from path (new) or query params (old), and instructor_id from query params
  const resolvedCourseId = courseId || searchParams?.get('courseId') || MOCK_COURSE_ID; // Path param takes priority
  const resolvedInstructorId = searchParams?.get('instructorId') || MOCK_INSTRUCTOR_ID;
  // Get session_id from URL if continuing existing session
  const urlSessionId = searchParams?.get('sessionId') || null;

  const toggleSelection = (id: string) => {
    setSelectedReadingIds(prev =>
      prev.includes(id) ? prev.filter(readingId => readingId !== id) : [...prev, id]
    );
  };

  const displayReadings = useMemo(
    () =>
      readings.map(reading => ({
        ...reading,
        displaySize: reading.sizeLabel,
        displayDate: reading.createdAt
          ? new Date(reading.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : undefined,
        usageCount: reading.usageCount ?? 0,
        lastUsedLabel: reading.lastUsedAt
          ? new Date(reading.lastUsedAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : null,
      })),
    [readings]
  );

  const fetchReadings = useCallback(async () => {
    setLoadingList(true);
    setError(null);
    try {
      const query = new URLSearchParams({
        course_id: resolvedCourseId,
        instructor_id: resolvedInstructorId,
      });
      const response = await fetch(`/api/readings?${query.toString()}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to load readings.');
      }
      const remoteReadings = Array.isArray(data?.readings)
        ? data.readings.map((item: any) => ({
            id: item.id,
            title: item.title ?? 'Untitled reading',
            instructorId: item.instructor_id,
            courseId: item.course_id,
            filePath: item.file_path,
            sourceType: item.source_type,
            createdAt: item.created_at,
            readingChunks: item.reading_chunks,
            hasChunks: Array.isArray(item.reading_chunks) && item.reading_chunks.length > 0,
            sizeLabel: item.size_label,
            usageCount: typeof item.usage_count === 'number' ? item.usage_count : 0,
            lastUsedAt: item.last_used_at,
            mimeType: item.mime_type,
          }))
        : [];
      remoteReadings.sort((a: ReadingListItem, b: ReadingListItem) => {
        const aDate = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bDate = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return bDate - aDate;
      });
      setReadings(remoteReadings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load readings.');
    } finally {
      setLoadingList(false);
    }
  }, [resolvedCourseId, resolvedInstructorId]);

  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    setError(null);
    try {
      const response = await fetch(`/api/courses/${resolvedCourseId}/sessions`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to load sessions.');
      }
      const sessionsList = Array.isArray(data?.sessions)
        ? data.sessions.map((item: any) => ({
            id: item.id,
            course_id: item.course_id,
            week_number: item.week_number,
            title: item.title,
            current_version_id: item.current_version_id,
            status: item.status || 'draft',
            created_at: item.created_at,
            updated_at: item.updated_at,
            current_version: item.current_version,
            reading_ids: Array.isArray(item.reading_ids) ? item.reading_ids : [],
          }))
        : [];
      setSessions(sessionsList);
      // If no sessions exist, switch to create mode
      if (sessionsList.length === 0) {
        setMode('create');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load sessions.');
      // If error loading sessions, allow creating new session
      setMode('create');
    } finally {
      setLoadingSessions(false);
    }
  }, [resolvedCourseId]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setError(null);
    try {
      const response = await fetch(`/api/sessions/${sessionId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to load session.');
      }
      // Load session data into form
      setSessionTitle(data.title || '');
      setWeekNumber(data.week_number || 1);
      setSessionDescription(data.session_info_json?.description || '');
      setAssignmentDescription(data.assignment_info_json?.description || '');
      setAssignmentGoal(data.assignment_goals_json?.goal || '');
      // Select readings that are in this session
      setSelectedReadingIds(data.reading_ids || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load session.');
    }
  }, []);

  const handleUseSession = async () => {
    if (!selectedSessionId) {
      setError('Please select a session.');
      return;
    }
    // Navigate to same page with session_id in URL to trigger loading
    const courseIdStr = Array.isArray(resolvedCourseId) ? resolvedCourseId[0] : resolvedCourseId;
    const profileIdStr = Array.isArray(profileId) ? profileId[0] : profileId;
    
    const params = new URLSearchParams();
    params.set('sessionId', selectedSessionId);
    if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
    if (courseIdStr) params.set('courseId', courseIdStr);
    
    // Use RESTful URL structure if courseId is available in path
    if (courseIdStr && profileIdStr) {
      router.push(`/courses/${courseIdStr}/sessions/create?${params.toString()}`);
    } else {
      router.push(`/class-profile/${profileIdStr}/session/create?${params.toString()}`);
    }
  };

  const handleCreateNew = () => {
    setSelectedSessionId(null);
    setSessionTitle('');
    setWeekNumber(1);
    setSessionDescription('');
    setAssignmentDescription('');
    setAssignmentGoal('');
    setSelectedReadingIds([]);
    setOriginalDraft(null);
    setCurrentVersion(null);
    setMode('create');
  };

  // Check if draft is dirty (has changes)
  const isDraftDirty = useMemo(() => {
    if (!originalDraft) return false;
    return (
      sessionTitle !== originalDraft.sessionTitle ||
      weekNumber !== originalDraft.weekNumber ||
      sessionDescription !== originalDraft.sessionDescription ||
      assignmentDescription !== originalDraft.assignmentDescription ||
      assignmentGoal !== originalDraft.assignmentGoal ||
      JSON.stringify(selectedReadingIds.sort()) !== JSON.stringify(originalDraft.selectedReadingIds.sort())
    );
  }, [originalDraft, sessionTitle, weekNumber, sessionDescription, assignmentDescription, assignmentGoal, selectedReadingIds]);

  // Load existing session from URL session_id
  const loadExistingSession = useCallback(async (sessionId: string) => {
    setIsLoadingExistingSession(true);
    setError(null);
    try {
      // Get session details
      const sessionResponse = await fetch(`/api/sessions/${sessionId}`);
      const sessionData = await sessionResponse.json().catch(() => ({}));
      if (!sessionResponse.ok) {
        throw new Error(sessionData?.detail || sessionData?.message || 'Failed to load session.');
      }

      // Load session identity data
      setSessionTitle(sessionData.title || '');
      setWeekNumber(sessionData.week_number || 1);
      setSelectedSessionId(sessionId);

      // Get current version data
      let currentVersionData = sessionData.current_version;
      if (!currentVersionData && sessionData.current_version_id) {
        const versionResponse = await fetch(`/api/sessions/${sessionId}/versions/current`);
        const versionData = await versionResponse.json().catch(() => ({}));
        if (versionResponse.ok) {
          currentVersionData = versionData;
        }
      }

      // Load version data into form
      if (currentVersionData) {
        setSessionDescription(currentVersionData.session_info_json?.description || '');
        setAssignmentDescription(currentVersionData.assignment_info_json?.description || '');
        setAssignmentGoal(currentVersionData.assignment_goals_json?.goal || '');
        setSelectedReadingIds(currentVersionData.reading_ids || []);
        setCurrentVersion(currentVersionData.version_number || 1);
      } else {
        // Fallback to reading_ids from session if no version
        setSelectedReadingIds(sessionData.reading_ids || []);
        setCurrentVersion(1);
      }

      // Store original draft state for dirty check
      setOriginalDraft({
        sessionTitle: sessionData.title || '',
        weekNumber: sessionData.week_number || 1,
        sessionDescription: currentVersionData?.session_info_json?.description || '',
        assignmentDescription: currentVersionData?.assignment_info_json?.description || '',
        assignmentGoal: currentVersionData?.assignment_goals_json?.goal || '',
        selectedReadingIds: currentVersionData?.reading_ids || sessionData.reading_ids || [],
      });

      // Switch to create mode for editing
      setMode('create');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load existing session.');
    } finally {
      setIsLoadingExistingSession(false);
    }
  }, []);

  // Load existing session if session_id is in URL
  useEffect(() => {
    if (urlSessionId) {
      loadExistingSession(urlSessionId);
    }
  }, [urlSessionId, loadExistingSession]);

  useEffect(() => {
    fetchReadings();
    if (!urlSessionId) {
      // Only fetch sessions list if not loading existing session
      fetchSessions();
    }
  }, [fetchReadings, fetchSessions, urlSessionId]);

  const handleCreateSession = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      // If continuing existing session, check if dirty and create new version if needed
      if (urlSessionId || selectedSessionId) {
        const sessionId = urlSessionId || selectedSessionId;
        
        if (isDraftDirty) {
          // Create new version with updated data
          const payload = {
            session_info_json: {
              description: sessionDescription || undefined,
            },
            assignment_info_json: {
              description: assignmentDescription || undefined,
            },
            assignment_goals_json: {
              goal: assignmentGoal || undefined,
            },
            reading_ids: selectedReadingIds,
          };

          const response = await fetch(`/api/courses/${resolvedCourseId}/sessions/${sessionId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.detail || data?.message || 'Failed to create new version.');
          }

          setError(null);
          setSuccess('New version created successfully! Click "Start scaffolds generation" to proceed.');
        } else {
          // No changes, just confirm session is ready
          setError(null);
          setSuccess('Session ready. Click "Start scaffolds generation" to proceed.');
        }
      } else {
        // Create new session
        const payload = {
          week_number: weekNumber,
          title: sessionTitle || undefined,
          reading_ids: selectedReadingIds,
          session_description: sessionDescription || undefined,
          assignment_description: assignmentDescription || undefined,
          assignment_goal: assignmentGoal || undefined,
        };

        const response = await fetch(`/api/courses/${resolvedCourseId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create session.');
        }

        // Store the created session ID
        setSelectedSessionId(data.session_id);
        setError(null);
        setSuccess('Session created successfully! Click "Start scaffolds generation" to proceed.');
        // Refresh sessions list
        fetchSessions();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleStartScaffoldsGeneration = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      let sessionId: string;

      // If continuing existing session, check if we need to create new version
      if (urlSessionId || selectedSessionId) {
        sessionId = urlSessionId || selectedSessionId!;
        
        // If draft is dirty, we'll create a new version when navigating
        if (isDraftDirty) {
          const payload = {
            session_info_json: {
              description: sessionDescription || undefined,
            },
            assignment_info_json: {
              description: assignmentDescription || undefined,
            },
            assignment_goals_json: {
              goal: assignmentGoal || undefined,
            },
            reading_ids: selectedReadingIds,
          };

          const response = await fetch(`/api/courses/${resolvedCourseId}/sessions/${sessionId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.detail || data?.message || 'Failed to create new version.');
          }

          setError(null);
          setSuccess('New version created successfully! Navigating to first reading...');
        } else {
          // No changes, just confirm session is ready
          setError(null);
          setSuccess('Session ready. Navigating to first reading...');
        }
      } else {
        // Create new session
        const payload = {
          week_number: weekNumber,
          title: sessionTitle || undefined,
          reading_ids: selectedReadingIds,
          session_description: sessionDescription || undefined,
          assignment_description: assignmentDescription || undefined,
          assignment_goal: assignmentGoal || undefined,
        };

        const response = await fetch(`/api/courses/${resolvedCourseId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create session.');
        }

        sessionId = data.session_id;
        setError(null);
        setSuccess('Session created successfully! Navigating to first reading...');
        // Refresh sessions list
        fetchSessions();
      }

      // Navigate to first reading's scaffold page with full reading list for navigation
      const firstReadingId = selectedReadingIds[0];
      
      // Store reading navigation data in sessionStorage
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'inkspire:sessionReadingNavigation',
          JSON.stringify({
            sessionId,
            readingIds: selectedReadingIds,
            currentIndex: 0,
            courseId: resolvedCourseId,
            profileId,
            instructorId: resolvedInstructorId,
          })
        );
      }
      
      // Navigate to scaffold display page with navigation context (but don't generate scaffolds yet)
      setTimeout(() => {
        router.push(`/courses/${resolvedCourseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
      }, 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start scaffolds generation. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleContinueWithSession = async () => {
    if (!selectedSessionId) {
      setError('Please select a session.');
      return;
    }
    // Navigate to same page with session_id in URL to load and edit
    const courseIdStr = Array.isArray(resolvedCourseId) ? resolvedCourseId[0] : resolvedCourseId;
    const profileIdStr = Array.isArray(profileId) ? profileId[0] : profileId;
    
    const params = new URLSearchParams();
    params.set('sessionId', selectedSessionId);
    if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
    if (courseIdStr) params.set('courseId', courseIdStr);
    
    // Use RESTful URL structure if courseId is available in path
    if (courseIdStr && profileIdStr) {
      router.push(`/courses/${courseIdStr}/sessions/create?${params.toString()}`);
    } else {
      router.push(`/class-profile/${profileIdStr}/session/create?${params.toString()}`);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.navContainer}>
          <Navigation />
        </div>
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <button
              type="button"
              onClick={() => {
                // Use RESTful URL structure if courseId is available in path, otherwise fallback to old structure
                if (resolvedCourseId && profileId) {
                  router.push(`/courses/${resolvedCourseId}/readings?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
                } else {
                  // Fallback to old structure with query params
                  const params = new URLSearchParams();
                  if (resolvedCourseId) params.set('courseId', resolvedCourseId);
                  if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
                  const queryString = params.toString();
                  router.push(`/class-profile/${profileId}/reading${queryString ? `?${queryString}` : ''}`);
                }
              }}
              className={styles.backIconButton}
              aria-label="Back to Readings"
              disabled={creating}
            >
              <i className="fa-solid fa-arrow-left-long" aria-hidden="true"></i>
            </button>
            <div>
              <h1 className={styles.title}>Save Session</h1>
              <p className={styles.subtitle}>
                Select readings for scaffold generation and create a session.
              </p>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Creating...' : `Save Session (${selectedReadingIds.length} selected)`}
            </button>
            <button
              onClick={handleStartScaffoldsGeneration}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Starting...' : `Start scaffolds generation)`}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.errorMessage}>{error}</div>}
        {success && <div style={{ 
          backgroundColor: '#d1fae5', 
          color: '#065f46', 
          padding: '1rem', 
          borderRadius: '0.5rem', 
          marginBottom: '1.5rem' 
        }}>{success}</div>}

        {isLoadingExistingSession && (
          <div className={styles.emptyState}>Loading existing session...</div>
        )}

        {!isLoadingExistingSession && mode === 'select' && (
          <section className={styles.selectionSection}>
            <div className={styles.selectionHeader}>
              <div>
                <h2 className={styles.sectionTitle}>Select Existing Session</h2>
                <p className={styles.sectionHelper}>
                  Choose an existing session to continue, or create a new one.
                </p>
              </div>
              <button
                onClick={handleCreateNew}
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              >
                Create New Session
              </button>
            </div>

            <div className={styles.readingList}>
              {loadingSessions ? (
                <div className={styles.emptyState}>Loading sessions…</div>
              ) : sessions.length === 0 ? (
                <div className={styles.emptyState}>
                  No sessions found. Click "Create New Session" to get started.
                </div>
              ) : (
                sessions.map(session => {
                  const isSelected = selectedSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      className={`${styles.readingCard} ${isSelected ? styles.readingCardSelected : ''}`}
                      onClick={() => setSelectedSessionId(session.id)}
                      style={{ cursor: 'pointer' }}
                    >
                      <div className={styles.readingMeta}>
                        <div>
                          <p className={styles.readingName}>
                            {session.title || `Week ${session.week_number} Session`}
                          </p>
                          <p className={styles.readingDetails}>
                            Week {session.week_number} · {session.reading_ids.length} reading{session.reading_ids.length !== 1 ? 's' : ''}
                            {session.created_at && (
                              <> · {new Date(session.created_at).toLocaleDateString()}</>
                            )}
                          </p>
                          {session.current_version?.session_info_json?.description && (
                            <p className={styles.readingSecondaryDetail} style={{ marginTop: '0.5rem' }}>
                              {session.current_version.session_info_json.description.substring(0, 100)}
                              {session.current_version.session_info_json.description.length > 100 ? '...' : ''}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className={styles.readingActions}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleUseSession();
                          }}
                          className={`${styles.selectionButton} ${styles.selectionButtonActive}`}
                          disabled={!isSelected}
                        >
                          Use This Session
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        )}

        {!isLoadingExistingSession && mode === 'create' && (
          <>
            {(sessions.length > 0 || urlSessionId) && (
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => {
                    if (urlSessionId) {
                      // If loading from URL, go back to readings page
                      if (resolvedCourseId && profileId) {
                        router.push(`/courses/${resolvedCourseId}/readings?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
                      } else {
                        const params = new URLSearchParams();
                        if (resolvedCourseId) params.set('courseId', resolvedCourseId);
                        if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
                        const queryString = params.toString();
                        router.push(`/class-profile/${profileId}/reading${queryString ? `?${queryString}` : ''}`);
                      }
                    } else {
                      setMode('select');
                    }
                  }}
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  disabled={creating}
                >
                  ← Back {urlSessionId ? 'to Readings' : 'to Session Selection'}
                </button>
                {urlSessionId && isDraftDirty && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#fef3c7', 
                    border: '1px solid #fbbf24',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#92400e'
                  }}>
                    ⚠️ You have unsaved changes
                  </div>
                )}
                {urlSessionId && currentVersion && !isDraftDirty && (
                  <div style={{ 
                    padding: '0.5rem 1rem', 
                    backgroundColor: '#d1fae5', 
                    border: '1px solid #10b981',
                    borderRadius: '0.375rem',
                    fontSize: '0.875rem',
                    color: '#065f46'
                  }}>
                    ✓ Using version {currentVersion}
                  </div>
                )}
              </div>
            )}

        <section className={styles.sessionInfoSection}>
          <div className={styles.sessionInfoCard}>
            <h2 className={styles.sectionTitle}>Session Information</h2>
            <div className={styles.formRow}>
              <div className={styles.formGroup}>
                <label htmlFor="sessionTitle" className={styles.label}>
                  Session Title (Optional)
                </label>
                <input
                  id="sessionTitle"
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Week 1 Reading Session"
                  disabled={creating}
                />
              </div>
              <div className={styles.formGroup}>
                <label htmlFor="weekNumber" className={styles.label}>
                  Week Number
                </label>
                <input
                  id="weekNumber"
                  type="number"
                  min="1"
                  value={weekNumber}
                  onChange={(e) => setWeekNumber(parseInt(e.target.value) || 1)}
                  className={styles.input}
                  disabled={creating}
                />
              </div>
            </div>
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label htmlFor="sessionDescription" className={styles.label}>
                Session Description (Optional)
              </label>
              <textarea
                id="sessionDescription"
                value={sessionDescription}
                onChange={(e) => setSessionDescription(e.target.value)}
                className={styles.input}
                placeholder="Enter session description..."
                rows={3}
                disabled={creating}
              />
            </div>
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label htmlFor="assignmentDescription" className={styles.label}>
                Assignment Description (Optional)
              </label>
              <textarea
                id="assignmentDescription"
                value={assignmentDescription}
                onChange={(e) => setAssignmentDescription(e.target.value)}
                className={styles.input}
                placeholder="Enter assignment description..."
                rows={3}
                disabled={creating}
              />
            </div>
            <div className={styles.formGroup} style={{ marginTop: '1rem' }}>
              <label htmlFor="assignmentGoal" className={styles.label}>
                Assignment Goal (Optional)
              </label>
              <textarea
                id="assignmentGoal"
                value={assignmentGoal}
                onChange={(e) => setAssignmentGoal(e.target.value)}
                className={styles.input}
                placeholder="Enter assignment goal..."
                rows={3}
                disabled={creating}
              />
            </div>
          </div>
        </section>

        <section className={styles.selectionSection}>
          <div className={styles.selectionHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Select Readings</h2>
              <p className={styles.sectionHelper}>
                Choose which readings to include in this session for scaffold generation.
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div className={styles.selectionCount}>
                {selectedReadingIds.length} of {readings.length} selected
              </div>
              <button
                onClick={handleCreateSession}
                className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                disabled={creating || !selectedReadingIds.length}
                style={{ whiteSpace: 'nowrap' }}
              >
                {creating ? 'Creating...' : 'Save Session'}
              </button>
              <button
                onClick={handleStartScaffoldsGeneration}
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                disabled={creating || !selectedReadingIds.length}
                style={{ whiteSpace: 'nowrap' }}
              >
                {creating ? 'Starting...' : `Start scaffolds generation${selectedReadingIds.length > 0 ? ` (${selectedReadingIds.length})` : ''}`}
              </button>
            </div>
          </div>

          <div className={styles.readingList}>
            {loadingList ? (
              <div className={styles.emptyState}>Loading readings…</div>
            ) : displayReadings.length === 0 ? (
              <div className={styles.emptyState}>
                No readings available. Please upload readings first.
              </div>
            ) : (
              displayReadings.map(reading => {
                const isSelected = selectedReadingIds.includes(reading.id);
                return (
                  <div
                    key={reading.id}
                    className={`${styles.readingCard} ${isSelected ? styles.readingCardSelected : ''}`}
                  >
                    <div className={styles.readingMeta}>
                      <div>
                        <p className={styles.readingName}>{reading.title}</p>
                        <p className={styles.readingDetails}>
                          {(reading.displaySize || reading.sourceType || 'PDF').trim()}{' '}
                          {reading.displayDate ? `· ${reading.displayDate}` : ''}
                          {reading.hasChunks && (
                            <span style={{ 
                              marginLeft: '8px', 
                              padding: '2px 6px', 
                              backgroundColor: '#10b981', 
                              color: 'white', 
                              borderRadius: '4px', 
                              fontSize: '11px',
                              fontWeight: '500'
                            }}>
                              Processed
                            </span>
                          )}
                        </p>
                        {reading.filePath && (
                          <p className={styles.readingSecondaryDetail}>{reading.filePath}</p>
                        )}
                        {reading.hasChunks && reading.readingChunks && (
                          <p className={styles.readingSecondaryDetail} style={{ color: '#10b981', fontSize: '12px' }}>
                            {reading.readingChunks.length} chunks available
                          </p>
                        )}
                      </div>
                    </div>
                    <div className={styles.readingActions}>
                      <button
                        type="button"
                        onClick={() => toggleSelection(reading.id)}
                        className={`${styles.selectionButton} ${
                          isSelected ? styles.selectionButtonActive : ''
                        }`}
                        disabled={creating}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
        </>
        )}
      </div>
    </div>
  );
}

