'use client';

import { useState, useEffect, useCallback } from 'react';
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
} from '@/app/class-profile/designConsiderations';
import styles from './page.module.css';

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

const DEFAULT_CLASS_BACKGROUND =
  'Cohort includes graduate students from education disciplines who are strengthening their computational research toolkit.';

const DEFAULT_PREFILL_PROFILE: Omit<ClassProfile, 'id'> = {
  disciplineInfo: {
    disciplineName: 'Computer Science',
    department: 'Department of Computer and Information Science',
    fieldDescription:
      'Explores computational theory, software engineering practices, and data-driven inquiry within education research contexts.',
  },
  courseInfo: {
    courseName: 'Introduction to Python',
    courseCode: 'CS101',
    description:
      'This is a beginner-level course focusing on Python programming basics for college students. The course covers the fundamentals of Python programming, including syntax, data structures, and basic algorithms.',
    credits: '3',
    prerequisites: 'None required',
    learningObjectives:
      'Equip graduate researchers with the ability to design, implement, and evaluate Python-based workflows for education data analysis.',
    assessmentMethods: 'Project-based assessments, annotated code portfolios, collaborative labs, and reflective participation.',
    deliveryMode: 'in-person',
  },
  classInfo: {
    semester: 'Fall',
    year: '2024',
    section: 'A',
    meetingDays: 'MW',
    meetingTime: '10:00 AM - 11:30 AM',
    location: 'Engineering Building, Room 210',
    enrollment: '30',
    background: 'Cohort includes graduate students from education disciplines who are strengthening their computational research toolkit.',
    priorKnowledge: 'mixed',
  },
  generatedProfile: undefined,
  designConsiderations: createDefaultDesignConsiderations(),
};

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';

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
  const params = useParams();
  const searchParams = useSearchParams();
  const profileId = params?.id as string;
  const isEdit = profileId !== 'new';
  
  // Get course_id and instructor_id from URL params
  const urlCourseId = searchParams?.get('courseId');
  const urlInstructorId = searchParams?.get('instructorId');
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ClassProfile>(createDefaultFormData(profileId || 'new'));

  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (!profileId || profileId === 'new') {
        setLoading(false);
        return;
      }

      const response = await fetch(`/api/class-profiles/${profileId}`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to load profile');
      }

      const payload = data.profile ?? data.class_profile ?? null;
      const profileData = payload
        ? {
            ...createDefaultFormData(profileId),
            ...payload,
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
    if (!formData.courseInfo.courseName || !formData.courseInfo.courseCode) {
      setError('Please fill in Course Name and Course Code.');
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

    setGenerating(true);
    setError(null);

    try {
      const payload = {
        instructor_id: urlInstructorId || MOCK_INSTRUCTOR_ID,
        title: formData.courseInfo.courseName || 'Untitled Class',
        course_code: formData.courseInfo.courseCode || 'TBD',
        description:
          formData.courseInfo.description || 'Draft class profile generated via Inkspire',
        class_input: buildClassInputPayload(formData),
      };
      
      // Add course_id if provided in URL params
      if (urlCourseId) {
        (payload as any).course_id = urlCourseId;
      }

      const response = await fetch('/api/class-profiles', {
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
        ...parsedDesign,
        userDefined:
          formData.designConsiderations.userDefined?.trim() || parsedDesign.userDefined || '',
      };

      const nextId =
        data.class_profile?.id ||
        review?.id ||
        data.class_id ||
        formData.id ||
        'new';

      setFormData(prev => ({
        ...prev,
        id: typeof nextId === 'string' ? nextId : prev.id,
        generatedProfile: textToUse,
        designConsiderations: mergedDesign,
      }));

      if (typeof nextId === 'string' && nextId !== 'new') {
        // Preserve course_id and instructor_id when navigating
        const navParams = new URLSearchParams();
        if (urlCourseId) navParams.set('courseId', urlCourseId);
        if (urlInstructorId) navParams.set('instructorId', urlInstructorId);
        const queryString = navParams.toString();
        router.push(`/class-profile/${nextId}/view${queryString ? `?${queryString}` : ''}`);
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
                  placeholder="e.g., Computer Science (pre-filled), Educational Psychology, Mechanical Engineering"
                  required
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
                  placeholder="e.g., Department of Computer and Information Science (pre-filled), School of Education"
                  required
                />
              </div>

              <div className={styles.inputGroupFull}>
                <label htmlFor="fieldDescription" className={styles.label}>
                  Field Description
                </label>
                <textarea
                  id="fieldDescription"
                  value={formData.disciplineInfo.fieldDescription}
                  onChange={(e) => handleInputChange('disciplineInfo', 'fieldDescription', e.target.value)}
                  className={styles.textarea}
                  placeholder="Summarize the discipline’s focus areas, core questions, and primary methods."
                  rows={3}
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
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="courseCode" className={styles.label}>
                  Course Code *
                </label>
                <input
                  id="courseCode"
                  type="text"
                  value={formData.courseInfo.courseCode}
                  onChange={(e) => handleInputChange('courseInfo', 'courseCode', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., EDU 101"
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="credits" className={styles.label}>
                  Credits
                </label>
                <input
                  id="credits"
                  type="text"
                  value={formData.courseInfo.credits}
                  onChange={(e) => handleInputChange('courseInfo', 'credits', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., 3"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="prerequisites" className={styles.label}>
                  Prerequisites
                </label>
                <input
                  id="prerequisites"
                  type="text"
                  value={formData.courseInfo.prerequisites}
                  onChange={(e) => handleInputChange('courseInfo', 'prerequisites', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., EDU 100 or instructor permission"
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
                >
                  <option value="">Select delivery mode</option>
                  <option value="in-person">In-person</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="online">Online</option>
                </select>
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
                />
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
                  placeholder="e.g., 2024"
                  required
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="section" className={styles.label}>
                  Section
                </label>
                <input
                  id="section"
                  type="text"
                  value={formData.classInfo.section}
                  onChange={(e) => handleInputChange('classInfo', 'section', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., A, B, 01"
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
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="meetingDays" className={styles.label}>
                  Meeting Days
                </label>
                <input
                  id="meetingDays"
                  type="text"
                  value={formData.classInfo.meetingDays}
                  onChange={(e) => handleInputChange('classInfo', 'meetingDays', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., MWF, TTh"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="meetingTime" className={styles.label}>
                  Meeting Time
                </label>
                <input
                  id="meetingTime"
                  type="text"
                  value={formData.classInfo.meetingTime}
                  onChange={(e) => handleInputChange('classInfo', 'meetingTime', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., 10:00 AM - 11:30 AM"
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="location" className={styles.label}>
                  Location
                </label>
                <input
                  id="location"
                  type="text"
                  value={formData.classInfo.location}
                  onChange={(e) => handleInputChange('classInfo', 'location', e.target.value)}
                  className={styles.input}
                  placeholder="e.g., Building A, Room 201"
                />
              </div>

              <div className={styles.inputGroupFull}>
                <label htmlFor="background" className={styles.label}>
                  Background
                </label>
                <textarea
                  id="background"
                  value={formData.classInfo.background}
                  onChange={(e) => handleInputChange('classInfo', 'background', e.target.value)}
                  className={styles.textarea}
                  placeholder="Provide background information about this class and its learners."
                  rows={3}
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="priorKnowledge" className={styles.label}>
                  Prior Knowledge
                </label>
                <select
                  id="priorKnowledge"
                  value={formData.classInfo.priorKnowledge}
                  onChange={(e) => handleInputChange('classInfo', 'priorKnowledge', e.target.value)}
                  className={styles.input}
                >
                  {PRIOR_KNOWLEDGE_OPTIONS.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </section>

          {/* Design Considerations */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Design Considerations</h2>
            <div className={styles.formGrid}>
              {DESIGN_CONSIDERATION_FIELDS.map(field => {
                const selectOptions =
                  'options' in field && Array.isArray(field.options) ? field.options : null;
                return (
                  <div key={field.key} className={styles.inputGroupFull}>
                    <label htmlFor={`design-${field.key}`} className={styles.label}>
                      {field.label}
                    </label>
                    {selectOptions ? (
                      <select
                        id={`design-${field.key}`}
                        className={styles.input}
                        value={formData.designConsiderations[field.key]}
                        onChange={(e) => handleDesignConsiderationChange(field.key, e.target.value)}
                      >
                        <option value="">Select {field.label.toLowerCase()}</option>
                        {selectOptions.map(option => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <textarea
                        id={`design-${field.key}`}
                        className={styles.textarea}
                        rows={field.key === 'userDefined' ? 4 : 3}
                        value={formData.designConsiderations[field.key]}
                        onChange={(e) => handleDesignConsiderationChange(field.key, e.target.value)}
                        placeholder={field.placeholder}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </section>

        </form>
      </div>

    </div>
  );
}

