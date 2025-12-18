'use client';

import Navigation from "@/components/layout/Navigation";
import styles from "./page.module.css";
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';

interface CourseSummary {
  id: string;
  title: string;
  courseCode?: string | null;
  description?: string | null;
  classProfileId?: string | null;
  lastUpdated?: string | null;
}

interface ApiCourse {
  id: string;
  title: string;
  course_code?: string | null;
  description?: string | null;
  class_profile_id?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';

export default function DashboardPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [courses, setCourses] = useState<CourseSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [backendStatus, setBackendStatus] = useState<'checking' | 'connected' | 'disconnected'>('checking');

  // Test backend connection when the component mounts
  useEffect(() => {
    testBackendConnection();
    loadCourses();
  }, [pathname]); // Reload when pathname changes (e.g., when returning from edit page)

  const testBackendConnection = async () => {
    try {
      setBackendStatus('checking');
      const response = await fetch('/health');
      if (response.ok) {
        const data = await response.json();
        if (data.status === 'ok') {
          setBackendStatus('connected');
        } else {
          setBackendStatus('disconnected');
        }
      } else {
        setBackendStatus('disconnected');
      }
    } catch (error) {
      console.error('Backend connection test failed:', error);
      setBackendStatus('disconnected');
    }
  };

  const loadCourses = async () => {
    try {
      const response = await fetch(`/api/courses/instructor/${MOCK_INSTRUCTOR_ID}`);
      if (response.ok) {
        const data = await response.json();
        const items: CourseSummary[] = (data.courses || []).map((c: ApiCourse) => ({
          id: c.id,
          title: c.title,
          courseCode: c.course_code ?? undefined,
          description: c.description ?? undefined,
          classProfileId: c.class_profile_id ?? undefined,
          lastUpdated: c.updated_at ?? c.created_at ?? null,
        }));
        setCourses(items);
      }
    } catch (error) {
      console.error('Failed to load courses:', error);
    } finally {
      setLoading(false);
    }
  };

  const openCourse = (course: CourseSummary) => {
    const params = new URLSearchParams({
      courseId: course.id,
      instructorId: MOCK_INSTRUCTOR_ID,
    });
    if (course.classProfileId) {
      router.push(`/class-profile/${course.classProfileId}/view?${params.toString()}`);
    } else {
      router.push(`/class-profile/new/edit?${params.toString()}`);
    }
  };

  const handleNewClass = () => {
    const params = new URLSearchParams({
      instructorId: MOCK_INSTRUCTOR_ID,
    });
    router.push(`/class-profile/new/edit?${params.toString()}`);
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <Navigation />
        <div className={styles.dashboard}>
          <div className={styles.dashboardHeader}>
            <h1 className={styles.welcomeTitle}>Welcome Back, Dr. Chen</h1>
          </div>
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <p>Loading class profiles...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Navigation />
      <div className={styles.dashboard}>
        <div className={styles.dashboardHeader}>
          <h1 className={styles.welcomeTitle}>Welcome Back, Dr. Chen</h1>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '8px',
            marginTop: '8px',
            fontSize: '14px'
          }}>
            <span>Backend:</span>
            {backendStatus === 'checking' && (
              <span style={{ color: '#666' }}>Checking...</span>
            )}
            {backendStatus === 'connected' && (
              <span style={{ color: '#10b981', fontWeight: 'bold' }}>✓ Connected</span>
            )}
            {backendStatus === 'disconnected' && (
              <span style={{ color: '#ef4444', fontWeight: 'bold' }}>✗ Disconnected</span>
            )}
            <button 
              onClick={testBackendConnection}
              style={{
                marginLeft: '8px',
                padding: '4px 8px',
                fontSize: '12px',
                cursor: 'pointer',
                border: '1px solid #ccc',
                borderRadius: '4px',
                background: '#fff'
              }}
            >
              Test
            </button>
          </div>
        </div>

        <div className={styles.classCardsGrid}>
          {courses.length === 0 ? (
            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem' }}>
              <p>No courses yet. Create your first one!</p>
            </div>
          ) : (
            courses.map((course) => {
            return (
              <div key={course.id} className={styles.classCard}>
                <div className={styles.classCardHeader}>
                  <div>
                    <h2 className={styles.courseName}>{course.title}</h2>
                    <p className={styles.courseCode}>{course.courseCode}</p>
                  </div>
                  {course.classProfileId ? (
                    <span className={`${styles.statusBadge} ${styles.statusCreated}`}>
                      Profile Created
                    </span>
                  ) : (
                    <span className={`${styles.statusBadge} ${styles.statusInProgress}`}>
                      No Profile Yet
                    </span>
                  )}
                </div>

                <div className={styles.classCardContent}>
                  <div className={styles.statItem}>
                    <span className={styles.statLabel}>Last Updated</span>
                    <span className={styles.statValue}>
                      {course.lastUpdated
                        ? new Date(course.lastUpdated).toLocaleDateString('en-US', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : '—'}
                    </span>
                  </div>
                </div>

                <div className={styles.classCardActions}>
                  <button 
                    className={styles.viewButton}
                    onClick={() => openCourse(course)}
                  >
                    {course.classProfileId ? 'Open Profile' : 'Create Profile'}
                  </button>
                </div>
              </div>
            );
          }))}
        </div>

        <div className={styles.newClassButtonContainer}>
          <button 
            className={styles.newClassButton}
            onClick={handleNewClass}
          >
            <span className={styles.plusIcon}>+</span>
            New Class Profile
          </button>
        </div>
      </div>
    </div>
  );
}