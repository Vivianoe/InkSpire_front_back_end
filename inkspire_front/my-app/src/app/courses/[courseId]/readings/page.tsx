'use client';

import { useState, useMemo, ChangeEvent, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from '@/app/class-profile/[id]/reading/page.module.css';

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
  readingChunks?: any[]; // PDF chunks if available
  hasChunks?: boolean; // Whether chunks have been processed
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

const fileToBase64 = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') {
        const base64 = result.includes(',') ? result.split(',')[1] : result;
        resolve(base64 || '');
      } else {
        reject(new Error('Unable to read file'));
      }
    };
    reader.onerror = () => reject(reader.error || new Error('Unable to read file'));
    reader.readAsDataURL(file);
  });

const formatFileSize = (size: number) => {
  if (!Number.isFinite(size)) return '0 KB';
  if (size >= 1024 * 1024) {
    return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${(size / 1024).toFixed(1)} KB`;
};

export default function ReadingUploadPage() {
  // Path parameters (from route: /courses/[courseId]/readings)
  const pathParams = useParams();
  const router = useRouter();
  // Query parameters (from URL: ?instructorId=yyy&profileId=zzz)
  const searchParams = useSearchParams();
  const courseId = pathParams.courseId as string;
  const profileId = searchParams.get('profileId') as string | undefined;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  // Get instructor_id from query params
  const resolvedInstructorId = searchParams?.get('instructorId') || MOCK_INSTRUCTOR_ID;

  const uploadNewReadings = async (files: FileList) => {
    const fileArray = Array.from(files);
    if (!fileArray.length) return;
    setUploading(true);
    setError(null);
    try {
      const readingsPayload = await Promise.all(
        fileArray.map(async file => {
          const base64 = await fileToBase64(file);
          return {
            title: file.name.replace(/\.pdf$/i, ''), // Remove .pdf extension from title
            source_type: 'uploaded' as const,
            content_base64: base64,
            original_filename: file.name, // Keep original filename with extension
          };
        })
      );

      // Use RESTful URL structure: /api/courses/{course_id}/readings/batch-upload
      const payload = {
        instructor_id: resolvedInstructorId,
        readings: readingsPayload,
      };

      const response = await fetch(`/api/courses/${courseId}/readings/batch-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to save readings.');
      }
      await fetchReadings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload readings.');
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;
    await uploadNewReadings(files);
    event.target.value = '';
  };

  const handleRemoveReading = async (id: string) => {
    setUploading(true);
    setError(null);
    try {
      // Use RESTful URL structure: /api/courses/{course_id}/readings/{reading_id}
      const response = await fetch(`/api/courses/${courseId}/readings/${id}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to remove reading.');
      }
      await fetchReadings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove reading.');
    } finally {
      setUploading(false);
    }
  };

  const handleCreateSession = () => {
    // Navigate to session creation page
    if (profileId) {
      router.push(`/courses/${courseId}/sessions/create?profileId=${profileId}&instructorId=${resolvedInstructorId}`);
    } else {
      // If no profileId, go to a generic session creation or course management
      router.push(`/courses/${courseId}/class-profiles`);
    }
  };

  const handleUploadClick = () => {
    if (!inputRef.current) return;
    inputRef.current.click();
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
        course_id: courseId,
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
            // Legacy fields (may not be in response)
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
  }, [courseId, resolvedInstructorId]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);


  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <div className={styles.navContainer}>
          <Navigation />
        </div>
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Reading Uploads</h1>
            <p className={styles.subtitle}>
              Upload and process readings for this course.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => {
                // Navigate back to course or profile
                if (profileId) {
                  router.push(`/courses/${courseId}/class-profiles/${profileId}/view`);
                } else {
                  router.push(`/courses/${courseId}`);
                }
              }}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={uploading}
            >
              ← Back
            </button>
            <button
              onClick={handleCreateSession}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={uploading || readings.length === 0}
            >
              Create Session →
            </button>
          </div>
        </div>
      </div>

      <div className={styles.content}>
        {error && <div className={styles.errorMessage}>{error}</div>}

        <section className={styles.uploadSection}>
          <div className={styles.uploadHeader}>
            <div>
              <h2 className={styles.sectionTitle}>Upload readings</h2>
              <p className={styles.sectionHelper}>
                Add all readings for this course. After uploading, create a session to select readings for scaffold generation.
              </p>
            </div>
            <button
              onClick={handleUploadClick}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral} ${styles.addFilesButton}`}
              disabled={uploading}
            >
              + Add Files
            </button>
            <input
              type="file"
              multiple
              ref={inputRef}
              onChange={handleFileSelect}
              className={styles.hiddenInput}
            />
          </div>

          <div className={styles.uploadList}>
            {loadingList ? (
              <div className={styles.emptyState}>Loading reading library…</div>
            ) : displayReadings.length === 0 ? (
              <div className={styles.emptyState}>
                Add readings for this course to start building your library.
              </div>
            ) : (
              displayReadings.map(reading => (
                <div
                  key={reading.id}
                  className={styles.readingCard}
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
                      <p className={styles.readingUsage}>
                        Used {reading.usageCount ?? 0}{' '}
                        {(reading.usageCount ?? 0) === 1 ? 'time' : 'times'}
                        {reading.lastUsedLabel ? ` · Last used ${reading.lastUsedLabel}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className={styles.readingActions}>
                    <button
                      type="button"
                      onClick={() => handleRemoveReading(reading.id)}
                      className={styles.removeButton}
                      disabled={uploading}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
