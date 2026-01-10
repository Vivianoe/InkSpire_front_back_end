'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useSearchParams } from 'next/navigation';

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
  const [courseId, setCourseId] = useState<string | null>(null);

  const profileId = params.id as string;
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
          setCourseId(navData.courseId);
        }
      } catch (err) {
        console.error('Failed to load navigation data:', err);
      }
    }
  }, [enableNavigation]);

  // If not using navigation, fetch session to get courseId
  // TODO: remove this
  useEffect(() => {
    if (!enableNavigation && sessionId) {
      const fetchSession = async () => {
        try {
          const response = await fetch(`/api/sessions/${sessionId}`);
          if (response.ok) {
            const sessionData = await response.json();
            setCourseId(sessionData.course_id);
          }
        } catch (err) {
          console.error('Failed to fetch session:', err);
        }
      };
      fetchSession();
    }
  }, [enableNavigation, sessionId]);

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
      `/class-profile/${profileId}/session/${sessionId}/reading/${nextReadingId}/scaffolds?navigation=true`
    );
  };

  const canGoPrev = navigationData && navigationData.currentIndex > 0;
  const canGoNext = navigationData && navigationData.currentIndex < navigationData.readingIds.length - 1;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-lg">Loading scaffolds...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-red-600">Error: {error}</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header with navigation */}
        <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Reading Scaffolds</h1>
              <p className="text-gray-600">
                Session: {sessionId} | Reading: {readingId}
                {navigationData && (
                  <span className="ml-2">
                    ({navigationData.currentIndex + 1} of {navigationData.readingIds.length})
                  </span>
                )}
              </p>
            </div>

            {/* Navigation buttons */}
            {enableNavigation && navigationData && (
              <div className="flex gap-2">
                <button
                  onClick={() => navigateToReading('prev')}
                  disabled={!canGoPrev}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                >
                  ← Previous Reading
                </button>
                <button
                  onClick={() => navigateToReading('next')}
                  disabled={!canGoNext}
                  className="px-4 py-2 bg-blue-500 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-600 transition-colors"
                >
                  Next Reading →
                </button>
              </div>
            )}
          </div>
        </div>

        {/* PDF viewer */}
        {pdfUrl && (
          <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Reading Material</h2>
            <div className="border rounded-lg overflow-hidden" style={{ height: '600px' }}>
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="Reading PDF"
              />
            </div>
          </div>
        )}

        {/* Scaffolds */}
        <div className="bg-white rounded-lg shadow-sm p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Scaffolds ({scaffolds.length})
          </h2>
          
          {scaffolds.length === 0 ? (
            <div className="text-center py-12 bg-gray-50 rounded-lg">
              <p className="text-gray-600 mb-4">No scaffolds found for this reading.</p>
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Go Back
              </button>
            </div>
          ) : (
            <div className="space-y-6">
              {scaffolds.map((scaffold, index) => (
                <div key={scaffold.id} className="border border-gray-200 rounded-lg p-6 bg-gray-50">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-3">Scaffold {index + 1}</h3>
                    <div className="bg-white p-4 rounded-lg mb-4 border border-gray-200">
                      <p className="text-sm text-gray-600 mb-2 font-medium">Source Fragment:</p>
                      <p className="text-gray-800 leading-relaxed">{scaffold.fragment}</p>
                    </div>
                    <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                      <p className="text-sm text-blue-600 mb-2 font-medium">Scaffold Question:</p>
                      <p className="text-blue-800 leading-relaxed">{scaffold.text}</p>
                    </div>
                  </div>
                  
                  <div className="flex items-center justify-between text-sm text-gray-500 pt-4 border-t border-gray-200">
                    <span className="px-2 py-1 bg-gray-100 rounded text-xs font-medium">
                      Status: {scaffold.status}
                    </span>
                    <span className="text-xs">ID: {scaffold.id}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Back button */}
        <div className="mt-6">
          <button
            onClick={() => router.back()}
            className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600 transition-colors"
          >
            ← Back to Session
          </button>
        </div>
      </div>
    </div>
  );
}
