// RESTful route: /courses/[courseId]/class-profiles/[profileId]/create
'use client';

//export { default } from '@/app/class-profile/[id]/edit/page';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import {
  DESIGN_CONSIDERATION_FIELDS,
  type DesignConsiderations,
  type DesignConsiderationKey,
  createDefaultDesignConsiderations,
  normalizeDesignConsiderations,
  parseDesignConsiderations,
} from '@/app/courses/[courseId]/class-profiles/designConsiderations';
import styles from './page.module.css';
import { supabase } from '@/lib/supabase/client';

interface ClassProfile {
  id: string;
  disciplineInfo: {
    disciplineName: string;
    department: string;
    fieldDescription: string;
  };
  courseInfo: {
    courseName: string;
    courseCode: string;
    description: string;
    credits: string;
    prerequisites: string;
    learningObjectives: string;
    assessmentMethods: string;
    deliveryMode: string;
  };
  classInfo: {
    semester: string;
    year: string;
    section: string;
    meetingDays: string;
    meetingTime: string;
    location: string;
    enrollment: string;
    background: string;
    priorKnowledge: string;
    learningChallenges: string[];
    learningChallengesOther: string;
  };
  generatedProfile?: string;
  designConsiderations: DesignConsiderations;
}

const PRIOR_KNOWLEDGE_OPTIONS = [
  { value: '', label: 'Select prior knowledge level' },
  { value: 'foundational', label: 'Foundational – minimal prior exposure' },
  { value: 'developing', label: 'Developing – some previous experience' },
  { value: 'intermediate', label: 'Intermediate – working familiarity' },
  { value: 'advanced', label: 'Advanced – extensive experience' },
  { value: 'mixed', label: 'Mixed proficiency cohort' },
];

const LEARNING_CHALLENGE_OPTIONS = [
  'Struggle with technical terminology',
  'Tendency to focus on surface details rather than core ideas',
  'Trouble connecting core ideas in readings',
  'Low confidence in explaining their thinking',
  'Difficulty getting started with open-ended tasks',
  'Other',
];

// const DEFAULT_CLASS_BACKGROUND = '';

// const DEFAULT_PREFILL_PROFILE: Omit<ClassProfile, 'id'> = {
//   disciplineInfo: {
//     disciplineName: '',
//     department: '',
//     fieldDescription: '',
//   },
//   courseInfo: {
//     courseName: '',
//     courseCode: '',
//     description: '',
//     credits: '',
//     prerequisites: '',
//     learningObjectives: '',
//     assessmentMethods: '',
//     deliveryMode: '',
//   },
//   classInfo: {
//     semester: '',
//     year: '',
//     section: '',
//     meetingDays: '',
//     meetingTime: '',
//     location: '',
//     enrollment: '',
//     background: DEFAULT_CLASS_BACKGROUND,
//     priorKnowledge: '',
//   },
//   generatedProfile: undefined,
//   designConsiderations: createDefaultDesignConsiderations(),
// };

const DEFAULT_CLASS_BACKGROUND = '';

const DEFAULT_PREFILL_PROFILE: Omit<ClassProfile, 'id'> = {
  disciplineInfo: {
    disciplineName: '',
    department: '',
    fieldDescription: '',
  },
  courseInfo: {
    courseName: '',
    courseCode: '',
    description: '',
    credits: '',
    prerequisites: '',
    learningObjectives: '',
    assessmentMethods: '',
    deliveryMode: '',
  },
  classInfo: {
    semester: '',
    year: '',
    section: '',
    meetingDays: '',
    meetingTime: '',
    location: '',
    enrollment: '',
    background: DEFAULT_CLASS_BACKGROUND,
    priorKnowledge: '',
    learningChallenges: [],
    learningChallengesOther: '',
  },
  generatedProfile: undefined,
  designConsiderations: createDefaultDesignConsiderations(),
};

const buildClassInputPayload = (data: ClassProfile) => ({
  discipline_info: {
    discipline_name: data.disciplineInfo.disciplineName,
    department: data.disciplineInfo.department,
    field_description: data.disciplineInfo.fieldDescription,
  },
  course_info: {
    course_name: data.courseInfo.courseName,
    course_code: data.courseInfo.courseCode,
    description: data.courseInfo.description,
    credits: data.courseInfo.credits,
    prerequisites: data.courseInfo.prerequisites,
    learning_objectives: data.courseInfo.learningObjectives,
    assessment_methods: data.courseInfo.assessmentMethods,
    delivery_mode: data.courseInfo.deliveryMode,
  },
  class_info: {
    semester: data.classInfo.semester,
    year: data.classInfo.year,
    section: data.classInfo.section,
    meeting_days: data.classInfo.meetingDays,
    meeting_time: data.classInfo.meetingTime,
    location: data.classInfo.location,
    enrollment: data.classInfo.enrollment,
    background: data.classInfo.background || DEFAULT_CLASS_BACKGROUND,
    prior_knowledge: data.classInfo.priorKnowledge,
    learning_challenges: data.classInfo.learningChallenges,
    learning_challenges_other: data.classInfo.learningChallengesOther,
  },
  design_considerations: data.designConsiderations,
});

const extractProfileFromReview = (review: unknown): {
  profileText: string;
  design?: Record<string, unknown>;
} => {
  if (!review || typeof review !== 'object') {
    return { profileText: '' };
  }

  const reviewObj = review as Record<string, unknown>;
  let profileText = '';
  let design: Record<string, unknown> | undefined;

  const possibleDesign =
    reviewObj.design_consideration ||
    reviewObj.design_considerations ||
    (reviewObj.metadata as Record<string, unknown> | undefined)?.design_consideration;
  if (possibleDesign && typeof possibleDesign === 'object') {
    design = possibleDesign as Record<string, unknown>;
  }

  const candidateTexts = [
    reviewObj.profile,
    reviewObj.profile_text,
    reviewObj.description,
  ].filter((val): val is string => typeof val === 'string' && val.trim().length > 0);

  if (candidateTexts.length > 0) {
    profileText = candidateTexts[0];
  }

  if (typeof reviewObj.text === 'string') {
    const raw = reviewObj.text.trim();
    try {
      const parsed = JSON.parse(raw);

      // backend return json like this:
      // { "class_id": "...", "profile": { "overall_profile": "...", ... }, "design_consideration": {...} }
      const parsedProfile = parsed.profile;
      if (typeof parsedProfile === 'string') {
        profileText = parsedProfile;
      } else if (parsedProfile && typeof parsedProfile === 'object') {
        // use overall_profile field; if not, stringify the whole profile object
        const overall = (parsedProfile as Record<string, unknown>).overall_profile;
        if (typeof overall === 'string' && overall.trim().length > 0) {
          profileText = overall;
        } else {
          profileText = JSON.stringify(parsedProfile, null, 2);
        }
      }

      if (
        !design &&
        parsed.design_consideration &&
        typeof parsed.design_consideration === 'object'
      ) {
        design = parsed.design_consideration as Record<string, unknown>;
      }
    } catch {
      if (!profileText) {
        profileText = raw;
      }
    }
  }

  return { profileText, design };
};

const createDefaultFormData = (id: string): ClassProfile => ({
  id,
  disciplineInfo: { ...DEFAULT_PREFILL_PROFILE.disciplineInfo },
  courseInfo: { ...DEFAULT_PREFILL_PROFILE.courseInfo },
  classInfo: { ...DEFAULT_PREFILL_PROFILE.classInfo },
  generatedProfile: DEFAULT_PREFILL_PROFILE.generatedProfile,
  designConsiderations: { ...DEFAULT_PREFILL_PROFILE.designConsiderations },
});

export default function EditClassProfilePage() {
  const router = useRouter();
  // Path parameters (from route: /class-profile/[id]/edit)
  const pathParams = useParams();
  // Query parameters (legacy URL may include ?courseId=xxx)
  const searchParams = useSearchParams();
  const profileId = (pathParams?.id || pathParams?.profileId) as string;
  const isEdit = profileId !== 'new';
  
  // Extract course_id from URL path structure: /courses/{courseId}/class-profiles/{profileId}/edit
  const urlCourseId =
    (pathParams?.courseId as string | undefined) ||
    searchParams?.get('courseId') ||
    (typeof window !== 'undefined' && window.location.pathname.match(/\/courses\/([^\/]+)/)?.[1]);
  const urlInstructorId = searchParams?.get('instructorId');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ClassProfile>(createDefaultFormData(profileId || 'new'));
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const learningChallengesOtherRef = useRef<HTMLTextAreaElement>(null);

  const normalizeLearningChallenges = (value: unknown): string[] => {
    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
    }
    if (typeof value === 'string') {
      return value
        .split(/[|,]/)
        .map((item) => item.trim())
        .filter(Boolean);
    }
    return [];
  };

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!profileId || profileId === 'new') {
        setLoading(false);
        return;
      }

      const courseIdParam = urlCourseId ? `?course_id=${urlCourseId}` : '';
      const response = await fetch(`/api/class-profiles/${profileId}${courseIdParam}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load profile');
      }

      const payload = data.profile ?? data.class_profile ?? null;
      const profileData = payload
        ? {
            ...createDefaultFormData(profileId),
            ...payload,
            classInfo: {
              ...createDefaultFormData(profileId).classInfo,
              ...(payload.classInfo ?? {}),
            },
            designConsiderations: normalizeDesignConsiderations(
              payload.designConsiderations ?? parseDesignConsiderations(payload.generatedProfile)
            ),
          }
        : null;

      if (profileData) {
        setFormData(profileData);
      } else {
        throw new Error('Failed to load profile');
      }
    } catch (err) {
      setError('Failed to load profile. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [profileId]);

  useEffect(() => {
    if (isEdit && profileId) {
      loadProfile();
    } else if (!isEdit) {
      setFormData(createDefaultFormData('new'));
    }
  }, [profileId, isEdit, loadProfile]);

  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        // TODO: replace with httponly cookies for security
        // Get auth token from Supabase session
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) {
          throw new Error('Not authenticated. Please sign in again.');
        }

        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        };

        const response = await fetch('/api/users/me', { headers });
        if (response.ok) {
          const userData = await response.json();
          setCurrentUserId(userData.id);
        } else {
          console.error('Failed to fetch current user');
        }
      } catch (err) {
        console.error('Error fetching current user:', err);
      }
    }
    
    fetchCurrentUser();
  }, []);

  const handleInputChange = (section: keyof ClassProfile, field: string, value: string) => {
    setFormData(prev => {
      const sectionData = prev[section] as Record<string, string>;
      return {
        ...prev,
        [section]: {
          ...sectionData,
          [field]: value,
        },
      };
    });
    setError(null);
  };

  const handleDesignConsiderationChange = (key: DesignConsiderationKey, value: string) => {
    setFormData(prev => ({
      ...prev,
      designConsiderations: {
        ...prev.designConsiderations,
        [key]: value,
      },
    }));
    setError(null);
  };

  const validateForm = (): boolean => {
    if (
      !formData.disciplineInfo.disciplineName ||
      !formData.disciplineInfo.department
    ) {
      setError('Please fill in Discipline Name and Department.');
      return false;
    }
    if (!formData.courseInfo.courseName) {
      setError('Please fill in Course Name.');
      return false;
    }
    if (!formData.classInfo.semester || !formData.classInfo.year) {
      setError('Please fill in Semester and Year.');
      return false;
    }
    return true;
  };

  const handleGenerateProfile = async () => {
    if (!validateForm()) {
      return;
    }

    if (!currentUserId && !urlInstructorId) {
      setError('Unable to identify instructor. Please try refreshing the page.');
      return;
    }
    const instructorId = urlInstructorId || currentUserId;

    setGenerating(true);
    setError(null);

    try {
      // Use course_id from URL params, or "new" to create a new course
      const courseIdForRequest = urlCourseId || 'new';

      const payload = {
        instructor_id: instructorId,
        course_id: courseIdForRequest,
        title: formData.courseInfo.courseName || 'Untitled Class',
        course_code: formData.courseInfo.courseCode || 'TBD',
        description:
          formData.courseInfo.description || 'Draft class profile generated via Inkspire',
        class_input: buildClassInputPayload(formData),
      };

      const response = await fetch(`/api/courses/${courseIdForRequest}/class-profiles`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to generate profile');
      }

      const review = data.review ?? null;
      const completeProfile = data.profile; // Backend returns reconstructed profile with all basic info

      const { profileText, design } = extractProfileFromReview(review);
      const textToUse = profileText || formData.generatedProfile || '';
      console.log('textToUse:', textToUse);

      if (!textToUse.trim()) {
        throw new Error('Generated profile was empty.');
      }

      const parsedDesign = normalizeDesignConsiderations(
        design && Object.keys(design).length > 0
          ? {
              ...formData.designConsiderations,
              ...(design as Record<string, string>),
            }
          : parseDesignConsiderations(textToUse)
      );

      const mergedDesign: DesignConsiderations = {
        ...parsedDesign,                           // LLM-generated values as base
	    ...formData.designConsiderations,          // User-entered values override LLM
      };

      const nextId =
        data.class_profile?.id ||
        review?.id ||
        data.class_id ||
        formData.id ||
        'new';

      // Update formData with complete profile including all basic info from backend
      const updatedFormData = {
        ...formData,
        id: typeof nextId === 'string' ? nextId : formData.id,
        disciplineInfo: completeProfile?.disciplineInfo || formData.disciplineInfo,
        courseInfo: completeProfile?.courseInfo || formData.courseInfo,
        classInfo: completeProfile?.classInfo || formData.classInfo,
        generatedProfile: textToUse,
        designConsiderations: mergedDesign,
      };

      setFormData(updatedFormData);

      if (typeof nextId === 'string' && nextId !== 'new') {
        // Use RESTful URL structure if courseId is available, otherwise fallback to old structure
        if (urlCourseId) {
          router.push(`/courses/${urlCourseId}/class-profiles/${nextId}/view`);
        } else {
          // Fallback to old structure with query params
          const navParams = new URLSearchParams();
          if (urlCourseId) navParams.set('courseId', urlCourseId);
          const queryString = navParams.toString();
          router.push(`/courses/${urlCourseId || 'new'}/class-profiles/${nextId}/view${queryString ? `?${queryString}` : ''}`);
        }
      } else {
        setError('Profile ID was not returned by the server.');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to generate profile. Please try again.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCancel = () => {
    router.push('/');
  };

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.topBar}>
          <div className={styles.navContainer}>
            <Navigation />
          </div>
        </div>
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading profile...</p>
        </div>
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
            <h1 className={styles.title}>
              {isEdit ? 'Edit Class Profile' : 'Create New Class Profile'}
            </h1>
            <p className={styles.subtitle}>
              Fill in the details below to generate your class profile
            </p>
          </div>
          <div className={styles.headerActions}>
            <button
              type="button"
              onClick={handleCancel}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={generating || saving}
            >
              ← Back to Dashboard
            </button>
            <button
              type="button"
              onClick={handleGenerateProfile}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={generating || saving}
            >
              {generating ? 'Generating Profile...' : 'Generate Profile'}
            </button>
          </div>
        </div>
      </div>
      <div className={styles.content}>

        {error && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}

        <form className={styles.form}>
          {/* Discipline Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Discipline Information</h2>
            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label htmlFor="disciplineName" className={styles.label}>
                  Discipline Name *
                </label>
                <input
                  id="disciplineName"
                  type="text"
                  value={formData.disciplineInfo.disciplineName}
                  onChange={(e) => handleInputChange('disciplineInfo', 'disciplineName', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Computer Science, Mechanical Engineering"
                  required
                  disabled={generating}
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="department" className={styles.label}>
                  Department *
                </label>
                <input
                  id="department"
                  type="text"
                  value={formData.disciplineInfo.department}
                  onChange={(e) => handleInputChange('disciplineInfo', 'department', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Department of Computer and Information Science"
                  required
                  disabled={generating}
                />
              </div>

            </div>
          </section>

          {/* Course Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Course Information</h2>
            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label htmlFor="courseName" className={styles.label}>
                  Course Name *
                </label>
                <input
                  id="courseName"
                  type="text"
                  value={formData.courseInfo.courseName}
                  onChange={(e) => handleInputChange('courseInfo', 'courseName', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Introduction to Universal Design for Learning"
                  required
                  disabled={generating}
                />
              </div>

               <div className={styles.inputGroupFull}>
                <label htmlFor="description" className={styles.label}>
                  Course Description
                </label>
                <textarea
                  id="description"
                  value={formData.courseInfo.description}
                  onChange={(e) => handleInputChange('courseInfo', 'description', e.target.value)}
                  className={styles.textarea}
                  placeholder="Enter a detailed description of the course..."
                  rows={4}
                  disabled={generating}
                />
              </div>


              <div className={styles.inputGroupFull}>
                <label htmlFor="learningObjectives" className={styles.label}>
                  Learning Objectives
                </label>
                <textarea
                  id="learningObjectives"
                  value={formData.courseInfo.learningObjectives}
                  onChange={(e) => handleInputChange('courseInfo', 'learningObjectives', e.target.value)}
                  className={styles.textarea}
                  placeholder="Outline the learning objectives or expected outcomes."
                  rows={3}
                  disabled={generating}
                />
              </div>

              <div className={styles.inputGroupFull}>
                <label htmlFor="assessmentMethods" className={styles.label}>
                  Assessment Methods
                </label>
                <textarea
                  id="assessmentMethods"
                  value={formData.courseInfo.assessmentMethods}
                  onChange={(e) => handleInputChange('courseInfo', 'assessmentMethods', e.target.value)}
                  className={styles.textarea}
                  placeholder="Describe the assessment methods (exams, projects, participation, etc.)."
                  rows={3}
                  disabled={generating}
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="deliveryMode" className={styles.label}>
                  Delivery Mode
                </label>
                <select
                  id="deliveryMode"
                  value={formData.courseInfo.deliveryMode}
                  onChange={(e) => handleInputChange('courseInfo', 'deliveryMode', e.target.value)}
                  className={styles.input}
                  disabled={generating}
                >
                  <option value="">Select delivery mode</option>
                  <option value="in-person">In-person</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="online">Online</option>
                </select>
              </div>

             
            </div>
          </section>

          {/* Class Information */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Class Information</h2>
            <div className={styles.formGrid}>
              <div className={styles.inputGroup}>
                <label htmlFor="semester" className={styles.label}>
                  Semester *
                </label>
                <select
                  id="semester"
                  value={formData.classInfo.semester}
                  onChange={(e) => handleInputChange('classInfo', 'semester', e.target.value)}
                  className={styles.input}
                  required
                  disabled={generating}
                >
                  <option value="">Select semester</option>
                  <option value="Fall">Fall</option>
                  <option value="Spring">Spring</option>
                  <option value="Summer">Summer</option>
                  <option value="Winter">Winter</option>
                </select>
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="year" className={styles.label}>
                  Year *
                </label>
                <input
                  id="year"
                  type="text"
                  value={formData.classInfo.year}
                  onChange={(e) => handleInputChange('classInfo', 'year', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., 2026"
                  required
                  disabled={generating}
                />
              </div>


              <div className={styles.inputGroup}>
                <label htmlFor="enrollment" className={styles.label}>
                  Enrollment (Number of Students)
                </label>
                <input
                  id="enrollment"
                  type="text"
                  value={formData.classInfo.enrollment}
                  onChange={(e) => handleInputChange('classInfo', 'enrollment', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., 25"
                  disabled={generating}
                />
              </div>



            

              <div className={styles.inputGroupFull}>
                <label htmlFor="priorKnowledge" className={styles.label}>
                  Prior Knowledge
                </label>
                <p className={styles.fieldHint}>
                  How familiar are your students with the core concepts in this course?
                </p>
                <select
                  id="priorKnowledge"
                  value={formData.classInfo.priorKnowledge}
                  onChange={(e) => handleInputChange('classInfo', 'priorKnowledge', e.target.value)}
                  className={styles.input}
                  disabled={generating}
                >
                  {PRIOR_KNOWLEDGE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {(() => {
                const selected = normalizeLearningChallenges(formData.classInfo.learningChallenges);
                return (
                  <div className={styles.inputGroupFull}>
                    <label className={styles.label}>Major Learning Challenges</label>
                    <p className={styles.fieldHint}>
                      Which challenges do students in this class commonly experience?
                    </p>
                    <div className={styles.checkboxGroup}>
                  {LEARNING_CHALLENGE_OPTIONS.map(option => {
                    const isChecked = selected.includes(option);
                    return (
                      <label key={option} className={styles.checkboxOption}>
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            const nextValues = e.target.checked
                              ? [...selected, option]
                              : selected.filter(item => item !== option);
                            setFormData(prev => ({
                              ...prev,
                              classInfo: {
                                ...prev.classInfo,
                                learningChallenges: nextValues,
                              },
                            }));
                            if (option === 'Other' && e.target.checked) {
                              window.setTimeout(() => learningChallengesOtherRef.current?.focus(), 0);
                            }
                          }}
                          disabled={generating}
                        />
                        <span>{option}</span>
                      </label>
                    );
                  })}
                    </div>
                  </div>
              );
              })()}
              {normalizeLearningChallenges(formData.classInfo.learningChallenges).includes('Other') && (
                <div className={styles.inputGroupFull}>
                  <label htmlFor="learningChallengesOther" className={styles.label}>
                    Other
                  </label>
                  <textarea
                    id="learningChallengesOther"
                    ref={learningChallengesOtherRef}
                    value={formData.classInfo.learningChallengesOther}
                    onChange={(e) =>
                      handleInputChange('classInfo', 'learningChallengesOther', e.target.value)
                    }
                    className={styles.textarea}
                    placeholder="Describe other learning challenges..."
                    rows={2}
                    disabled={generating}
                  />
                </div>
              )}
            </div>
          </section>

          {/* Design Considerations */}
          <section className={styles.section}>
            <h2 className={`${styles.sectionTitle} ${styles.sectionTitleNoDivider}`}>Design Considerations</h2>
            <p className={styles.fieldHint}>
              These considerations help Inkspire align its scaffolds with your teaching intentions. There are no right or wrong answers.
            </p>
            <div className={styles.sectionDivider} />
            <div className={styles.formGrid}>
              {DESIGN_CONSIDERATION_FIELDS.map(field => {
                const value = formData.designConsiderations[field.key] || '';
                if ('options' in field && field.options.length > 0) {
                  const normalizedValue = value.trim().replace(/_/g, ' ');
                  const parts = normalizedValue
                    ? (normalizedValue.includes('||')
                        ? normalizedValue.split('||')
                        : normalizedValue.split(',')
                      ).map(item => item.trim()).filter(Boolean)
                    : [];
                  const otherOption = field.options.find(option => option.toLowerCase().startsWith('other'));
                  const rawOtherPart = parts.find(part => /^other\s*:/i.test(part) || part.toLowerCase() === 'other');
                  const otherText = rawOtherPart && rawOtherPart.includes(':')
                    ? rawOtherPart.split(':').slice(1).join(':').trim()
                    : '';
                  const normalizedSelected = parts
                    .map(part => {
                      if (/^other\s*:/i.test(part) && otherOption) return otherOption;
                      return part;
                    })
                    .filter(part => field.options.some(option => option === part));
                  const selectedValues = normalizedSelected.length
                    ? normalizedSelected
                    : (normalizedValue && field.options.some(option => option === normalizedValue)
                        ? [normalizedValue]
                        : []);

                  const buildDesignValue = (nextValues: string[], nextOtherText: string) => {
                    const hasOther = otherOption ? nextValues.includes(otherOption) : false;
                    const valuesWithoutOther = otherOption
                      ? nextValues.filter(item => item !== otherOption)
                      : nextValues;
                    if (!hasOther || !otherOption) {
                      return valuesWithoutOther.join(' || ');
                    }
                    const otherSegment = nextOtherText.trim() ? `Other: ${nextOtherText.trim()}` : 'Other';
                    return [...valuesWithoutOther, otherSegment].join(' || ');
                  };

                  return (
                    <div className={styles.inputGroup} key={field.key}>
                      <label className={styles.label}>{field.label}</label>
                      <p className={styles.fieldHint}>{field.placeholder}</p>
                      <div className={styles.checkboxGroup}>
                        {field.options.map(option => {
                          const isChecked = selectedValues.includes(option);
                          return (
                            <label
                              key={option}
                              className={`${styles.checkboxOption} ${styles.checkboxOptionWrap}`}
                            >
                              <input
                                type="checkbox"
                                checked={isChecked}
                                onChange={(e) => {
                                  const nextValues = e.target.checked
                                    ? [...selectedValues, option]
                                    : selectedValues.filter(item => item !== option);
                                  handleDesignConsiderationChange(
                                    field.key,
                                    buildDesignValue(nextValues, otherText)
                                  );
                                }}
                                disabled={generating}
                              />
                              <span>{option}</span>
                            </label>
                          );
                        })}
                      </div>
                      {otherOption && selectedValues.includes(otherOption) && (
                        <textarea
                          className={styles.textarea}
                          rows={2}
                          value={otherText}
                          onChange={(e) =>
                            handleDesignConsiderationChange(
                              field.key,
                              buildDesignValue(selectedValues, e.target.value)
                            )
                          }
                          placeholder="Please specify..."
                          disabled={generating}
                        />
                      )}
                    </div>
                  );
                }
                return (
                  <div className={styles.inputGroupFull} key={field.key}>
                    <label className={styles.label}>{field.label}</label>
                    <textarea
                      className={styles.textarea}
                      rows={3}
                      value={value}
                      onChange={(e) => handleDesignConsiderationChange(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      disabled={generating}
                    />
                  </div>
                );
              })}
            </div>
          </section>
        </form>
      </div>
      {generating && (
        <div className={uiStyles.publishOverlay}>
          <div className={uiStyles.publishModal}>
            <div className={uiStyles.publishModalHeader}>
              <h3>Generating class profile</h3>
            </div>
            <div className={uiStyles.publishModalBody}>
              <p>Generating the class profile. This may take a few minutes. Please wait.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
