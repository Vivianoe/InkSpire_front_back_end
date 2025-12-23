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

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size)) return '0 KB';
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
};

export default function SessionCreationPage() {
  // Path parameters (from route: /class-profile/[id]/session/create or /courses/[courseId]/class-profiles/[profileId]/session/create)
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
  const [loadingList, setLoadingList] = useState(false);
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [weekNumber, setWeekNumber] = useState<number>(1);

  // Get course_id from path (new) or query params (old), and instructor_id from query params
  const resolvedCourseId = courseId || searchParams?.get('courseId') || MOCK_COURSE_ID; // Path param takes priority
  const resolvedInstructorId = searchParams?.get('instructorId') || MOCK_INSTRUCTOR_ID;

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

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  const handleCreateSession = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setCreating(true);
      setError(null);

      const payload = {
        week_number: weekNumber,
        title: sessionTitle || undefined,
        reading_ids: selectedReadingIds,
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

      // Navigate to first reading's scaffold generation page
      const sessionId = data.session_id;
      const firstReadingId = selectedReadingIds[0];
      
      // Use RESTful URL structure if courseId is available in path
      const courseIdStr = Array.isArray(resolvedCourseId) ? resolvedCourseId[0] : resolvedCourseId;
      const profileIdStr = Array.isArray(profileId) ? profileId[0] : profileId;
      
      const navParams = new URLSearchParams();
      navParams.set('readingId', firstReadingId);
      navParams.set('sessionId', sessionId);
      navParams.set('readingIndex', '0');
      navParams.set('totalReadings', selectedReadingIds.length.toString());
      if (courseIdStr) navParams.set('courseId', courseIdStr);
      if (resolvedInstructorId) navParams.set('instructorId', resolvedInstructorId);
      if (profileIdStr) navParams.set('profileId', profileIdStr);
      
      // Store session info and reading IDs in sessionStorage for navigation
      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          'inkspire:sessionReadings',
          JSON.stringify({
            sessionId,
            readingIds: selectedReadingIds,
            currentIndex: 0,
          })
        );
      }

      router.push(`/create-task?${navParams.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create session. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.navContainer}>
          <Navigation />
        </div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Create Session</h1>
            <p className={styles.subtitle}>
              Select readings for scaffold generation and create a session.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => {
                // Use RESTful URL structure if courseId is available in path, otherwise fallback to old structure
                if (resolvedCourseId && profileId) {
                  router.push(`/courses/${resolvedCourseId}/class-profiles/${profileId}/reading`);
                } else {
                  // Fallback to old structure with query params
                  const params = new URLSearchParams();
                  if (resolvedCourseId) params.set('courseId', resolvedCourseId);
                  if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
                  const queryString = params.toString();
                  router.push(`/class-profile/${profileId}/reading${queryString ? `?${queryString}` : ''}`);
                }
              }}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={creating}
            >
              ← Back to Readings
            </button>
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={creating || !selectedReadingIds.length}
            >
              {creating ? 'Creating...' : `Create Session (${selectedReadingIds.length} selected)`}
            </button>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.errorMessage}>{error}</div>}

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
            <div className={styles.selectionCount}>
              {selectedReadingIds.length} of {readings.length} selected
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
      </div>
    </div>
  );
}

