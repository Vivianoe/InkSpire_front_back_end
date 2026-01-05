'use client';

import { useState, useMemo, ChangeEvent, useRef, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from './page.module.css';

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_COURSE_ID = 'fbaf501d-af97-4286-b5b0-d7b63b500b35';

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

export default function CourseReadingPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const courseId = params?.courseId as string;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [readings, setReadings] = useState<ReadingListItem[]>([]);
  const [selectedReadingIds, setSelectedReadingIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);

  const resolvedCourseId = courseId || searchParams?.get('courseId') || MOCK_COURSE_ID;
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

      const payload = {
        instructor_id: resolvedInstructorId,
        course_id: resolvedCourseId,
        readings: readingsPayload,
      };

      const response = await fetch('/api/readings/batch-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to save readings.');
      }
      const created = Array.isArray(data?.readings) ? data.readings : [];
      if (created.length > 0) {
        setSelectedReadingIds(prev => {
          const next = new Set(prev);
          created.forEach((reading: { id?: string }) => {
            if (reading?.id) {
              next.add(reading.id);
            }
          });
          return Array.from(next);
        });
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
      const query = new URLSearchParams({
        course_id: resolvedCourseId,
        instructor_id: resolvedInstructorId,
      });
      const response = await fetch(`/api/readings/${id}?${query.toString()}`, {
        method: 'DELETE',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to remove reading.');
      }
      setSelectedReadingIds(prev => prev.filter(readingId => readingId !== id));
      await fetchReadings();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove reading.');
    } finally {
      setUploading(false);
    }
  };

  const toggleSelection = (id: string) => {
    setSelectedReadingIds(prev =>
      prev.includes(id) ? prev.filter(readingId => readingId !== id) : [...prev, id]
    );
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
      setSelectedReadingIds(prev =>
        prev.filter(id => remoteReadings.some((reading: ReadingListItem) => reading.id === id))
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load readings.');
    } finally {
      setLoadingList(false);
    }
  }, [resolvedCourseId, resolvedInstructorId]);

  useEffect(() => {
    fetchReadings();
  }, [fetchReadings]);

  const handleStartScaffoldSelection = async () => {
    if (!selectedReadingIds.length) {
      setError('Please select at least one reading.');
      return;
    }

    try {
      setUploading(true);
      setError(null);

      const selectedPayload = selectedReadingIds.reduce<PersistedReadingSelection[]>(
        (acc, id, index) => {
          const reading = readings.find(item => item.id === id);
          if (!reading) {
            return acc;
          }
          acc.push({
            id,
            title: reading.title,
            name: reading.title,
            filePath: reading.filePath,
            sourceType: reading.sourceType,
            instructorId: reading.instructorId ?? resolvedInstructorId,
            courseId: reading.courseId ?? resolvedCourseId,
            sizeLabel: reading.sizeLabel,
            mimeType: reading.mimeType,
            order: index + 1,
          });
          return acc;
        },
        []
      );

      if (typeof window !== 'undefined') {
        window.sessionStorage.setItem(
          SELECTED_READING_STORAGE_KEY,
          JSON.stringify({
            courseId: resolvedCourseId,
            instructorId: resolvedInstructorId,
            readingIndex: 0,
            readings: selectedPayload,
          })
        );
      }

      await new Promise(resolve => setTimeout(resolve, 800));

      // Preserve course_id and instructor_id when navigating
      const navParams = new URLSearchParams();
      navParams.set('from', courseId || 'new');
      if (resolvedCourseId) navParams.set('courseId', resolvedCourseId);
      if (resolvedInstructorId) navParams.set('instructorId', resolvedInstructorId);
      router.push(`/create-task?${navParams.toString()}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to proceed. Please try again.');
    } finally {
      setUploading(false);
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
            <h1 className={styles.title}>Reading Selection</h1>
            <p className={styles.subtitle}>
              Upload readings for this course and choose which ones to scaffold.
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={() => {
                const params = new URLSearchParams();
                if (resolvedCourseId) params.set('courseId', resolvedCourseId);
                if (resolvedInstructorId) params.set('instructorId', resolvedInstructorId);
                const queryString = params.toString();
                router.push(`/courses/${courseId}/view${queryString ? `?${queryString}` : ''}`);
              }}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={uploading}
            >
              ← Back to Course
            </button>
            <button
              onClick={handleStartScaffoldSelection}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={uploading || !selectedReadingIds.length}
            >
              {uploading ? 'Preparing...' : 'Start Scaffold Generation'}
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
                Add all readings for this course, then pick which ones to scaffold.
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
                        onClick={() => toggleSelection(reading.id)}
                        className={`${styles.selectionButton} ${
                          isSelected ? styles.selectionButtonActive : ''
                        }`}
                      >
                        {isSelected ? 'Selected' : 'Select'}
                      </button>
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
                );
              })
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

