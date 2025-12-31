'use client';

import styles from '@/app/page.module.css';

interface CourseSummary {
  id: string;
  title: string;
  perusallCourseId?: string | null;
  description?: string | null;
  classProfileId?: string | null;
  lastUpdated?: string | null;
}

interface CourseCardProps {
  course: CourseSummary;
  onClick?: (course: CourseSummary) => void;
}

export function CourseCard({ course, onClick }: CourseCardProps) {
  const handleClick = () => {
    if (onClick) {
      onClick(course);
    }
  };

  return (
    <div className={styles.classCard}>
      <div className={styles.classCardHeader}>
        <div>
          <h2 className={styles.courseName}>{course.title}</h2>
          <p className={styles.courseCode}>{course.perusallCourseId}</p>
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
          onClick={handleClick}
        >
          {course.classProfileId ? 'Open Profile' : 'Create Profile'}
        </button>
      </div>
    </div>
  );
}
