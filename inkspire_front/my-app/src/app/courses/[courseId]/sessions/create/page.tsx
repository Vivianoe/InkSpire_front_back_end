'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from '@/app/class-profile/[id]/session/create/page.module.css';

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';

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

type SessionListItem = {
  id: string;
  title?: string;
  weekNumber: number;
  status: string;
  createdAt?: string;
  readingIds?: string[];
  currentVersionId?: string;
};

type PersistedReadingSelection = {
  id: string;
  title: string;
  name: string;
  filePath?: string;
  sourceType?: string;
  instructorId?: string;
  courseId?: string;
  sizeLabel?: string;
  mimeType?: string;
  order: number;
};

const SELECTED_READING_STORAGE_KEY = 'inkspire:selectedReadings';

export default function SessionCreationPage() {
  const pathParams = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const courseId = pathParams.courseId as string;
  const profileId = searchParams.get('profileId') as string | undefined;
  const urlSessionId = searchParams.get('sessionId') as string | undefined;
  
  const [mode, setMode] = useState<'create' | 'edit' | 'select'>('select');
  const [weekNumber, setWeekNumber] = useState(1);
  const [sessionTitle, setSessionTitle] = useState('');
  const [sessionDescription, setSessionDescription] = useState('');
  const [assignmentDescription, setAssignmentDescription] = useState('');
  const [assignmentGoal, setAssignmentGoal] = useState('');
  const [selectedReadingIds, setSelectedReadingIds] = useState<string[]>([]);
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoadingExistingSession, setIsLoadingExistingSession] = useState(false);
  const [originalDraft, setOriginalDraft] = useState<any>(null);
  const [currentVersion, setCurrentVersion] = useState<number>(1);

  const resolvedInstructorId = searchParams?.get('instructorId') || MOCK_INSTRUCTOR_ID;

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

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      try {
        // Load readings
        const readingsQuery = new URLSearchParams({
          course_id: courseId,
          instructor_id: resolvedInstructorId,
        });
        const readingsResponse = await fetch(`/api/readings?${readingsQuery.toString()}`);
        const readingsData = await readingsResponse.json().catch(() => ({}));
        if (readingsResponse.ok && Array.isArray(readingsData?.readings)) {
          setReadings(readingsData.readings.map((item: any) => ({
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
          })));
        }

        // Load sessions
        const sessionsResponse = await fetch(`/api/courses/${courseId}/sessions`);
        const sessionsData = await sessionsResponse.json().catch(() => ({}));
        if (sessionsResponse.ok && Array.isArray(sessionsData?.sessions)) {
          setSessions(sessionsData.sessions.map((item: any) => ({
            id: item.id,
            title: item.title,
            weekNumber: item.week_number,
            status: item.status,
            createdAt: item.created_at,
            readingIds: item.reading_ids || [],
            currentVersionId: item.current_version_id,
          })));
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data.');
      }
    };

    if (courseId) {
      loadData();
    }
  }, [courseId, resolvedInstructorId]);

  // Load existing session if sessionId is in URL
  useEffect(() => {
    if (urlSessionId) {
      loadExistingSession(urlSessionId);
    }
  }, [urlSessionId, loadExistingSession]);

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

  const handleCreateNew = () => {
    setSelectedSessionId('');
    setSessionTitle('');
    setWeekNumber(1);
    setSessionDescription('');
    setAssignmentDescription('');
    setAssignmentGoal('');
    setSelectedReadingIds([]);
    setOriginalDraft(null);
    setCurrentVersion(1);
    setMode('create');
  };

  const handleCreateSession = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      let sessionId: string;
      let shouldCreateNewVersion = false;

      // If continuing existing session, check if dirty and create new version if needed
      if (urlSessionId || selectedSessionId) {
        sessionId = urlSessionId || selectedSessionId;
        
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

          const response = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/versions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });

          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data?.detail || data?.message || 'Failed to create new version.');
          }

          setError(null);
          setSuccess('New version created successfully! Click "Generate Scaffolds" to proceed.');
        } else {
          // No changes, just confirm session is ready
          setError(null);
          setSuccess('Session ready. Click "Generate Scaffolds" to proceed.');
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

        const response = await fetch(`/api/courses/${courseId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create session.');
        }

        sessionId = data.session_id;
        shouldCreateNewVersion = true; // New session always creates version 1
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
            courseId: courseId,
            profileId,
            instructorId: resolvedInstructorId,
          })
        );
      }
      
      // Check if scaffolds already exist for this session and reading
      const existingScaffoldsResponse = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds`);
      
      if (existingScaffoldsResponse.ok) {
        const existingScaffolds = await existingScaffoldsResponse.json();
        if (existingScaffolds.scaffolds && existingScaffolds.scaffolds.length > 0) {
          // Scaffolds already exist, navigate to display them with navigation context
          router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
          return;
        }
      }
      
      // No existing scaffolds, generate new ones
      const payload = {
        instructor_id: resolvedInstructorId,
      };
      
      const generateResponse = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!generateResponse.ok) {
        const errorData = await generateResponse.json().catch(() => ({}));
        throw new Error(errorData?.detail || errorData?.message || 'Failed to generate scaffolds.');
      }
      
      // Navigate to scaffold display page with navigation context
      router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate scaffolds. Please try again.');
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
    const params = new URLSearchParams();
    params.set('sessionId', selectedSessionId);
    if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
    if (profileId) params.set('profileId', profileId);
    
    // Use RESTful URL structure
    router.push(`/courses/${courseId}/sessions/create?${params.toString()}`);
  };

  const handleGenerateScaffolds = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      let sessionId: string;
      let shouldCreateNewVersion = false;

      // If continuing existing session, check if we need to create new version
      if (urlSessionId || selectedSessionId) {
        sessionId = urlSessionId || selectedSessionId!;
        
        // If draft is dirty, we'll create a new version when generating scaffolds
        if (isDraftDirty) {
          shouldCreateNewVersion = true;
        }
      } else {
        // Create new session first
        const payload = {
          week_number: weekNumber,
          title: sessionTitle || undefined,
          reading_ids: selectedReadingIds,
          session_description: sessionDescription || undefined,
          assignment_description: assignmentDescription || undefined,
          assignment_goal: assignmentGoal || undefined,
        };

        const response = await fetch(`/api/courses/${courseId}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data?.detail || data?.message || 'Failed to create session.');
        }

        sessionId = data.session_id;
        shouldCreateNewVersion = true; // New session always creates version 1
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
            courseId: courseId,
            profileId,
            instructorId: resolvedInstructorId,
          })
        );
      }
      
      // Check if scaffolds already exist for this session and reading
      const existingScaffoldsResponse = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds`);
      
      if (existingScaffoldsResponse.ok) {
        const existingScaffolds = await existingScaffoldsResponse.json();
        if (existingScaffolds.scaffolds && existingScaffolds.scaffolds.length > 0) {
          // Scaffolds already exist, navigate to display them with navigation context
          router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
          return;
        }
      }
      
      // No existing scaffolds, generate new ones
      const payload = {
        instructor_id: resolvedInstructorId,
      };
      
      const generateResponse = await fetch(`/api/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      
      if (!generateResponse.ok) {
        const errorData = await generateResponse.json().catch(() => ({}));
        throw new Error(errorData?.detail || errorData?.message || 'Failed to generate scaffolds.');
      }
      
      // Navigate to scaffold display page with navigation context
      router.push(`/courses/${courseId}/sessions/${sessionId}/readings/${firstReadingId}/scaffolds?navigation=true`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate scaffolds. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleReadingSelect = (readingId: string, isSelected: boolean) => {
    if (isSelected) {
      setSelectedReadingIds(prev => [...prev, readingId]);
    } else {
      setSelectedReadingIds(prev => prev.filter(id => id !== readingId));
    }
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

  const displaySessions = useMemo(
    () =>
      sessions.map(session => ({
        ...session,
        displayDate: session.createdAt
          ? new Date(session.createdAt).toLocaleDateString(undefined, {
              year: 'numeric',
              month: 'short',
              day: 'numeric',
            })
          : undefined,
        readingCount: session.readingIds?.length || 0,
      })),
    [sessions]
  );

  if (isLoadingExistingSession) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading session...</div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.navContainer}>
          <Navigation />
        </div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Save Session</h1>
            <p className={styles.subtitle}>
              Select readings for scaffold generation and create a session.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => {
                if (profileId) {
                  router.push(`/courses/${courseId}/readings?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
                } else {
                  router.push(`/courses/${courseId}/readings`);
                }
              }}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating}
            >
              ← Back to Readings
            </button>
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Creating...' : `Save Session (${selectedReadingIds.length} selected)`}
            </button>
            <button
              onClick={handleGenerateScaffolds}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Generating...' : `Generate Scaffolds (${selectedReadingIds.length} selected)`}
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
              {sessions.length === 0 ? (
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
                            {session.title || `Week ${session.weekNumber} Session`}
                          </p>
                          <p className={styles.readingDetails}>
                            Week {session.weekNumber} · {session.readingIds?.length || 0} reading{(session.readingIds?.length || 0) !== 1 ? 's' : ''}
                            {session.createdAt && (
                              <> · {new Date(session.createdAt).toLocaleDateString()}</>
                            )}
                          </p>
                        </div>
                      </div>
                      <div className={styles.readingActions}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContinueWithSession();
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
            {sessions.length > 0 && (
              <div style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button
                  onClick={() => setMode('select')}
                  className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
                  disabled={creating}
                >
                  ← Back to Session Selection
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
                onClick={handleGenerateScaffolds}
                className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
                disabled={creating || !selectedReadingIds.length}
                style={{ whiteSpace: 'nowrap' }}
              >
                {creating ? 'Generating...' : `Generate Scaffolds${selectedReadingIds.length > 0 ? ` (${selectedReadingIds.length})` : ''}`}
              </button>
            </div>
          </div>

          <div className={styles.readingList}>
            {readings.length === 0 ? (
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
                        onClick={() => handleReadingSelect(reading.id, !isSelected)}
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
