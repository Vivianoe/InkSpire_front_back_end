// RESTful route: /courses/[courseId]/class-profiles/[profileId]/view
// This page redirects to the old route structure for backward compatibility
// The old route component has been updated to support both path structures
//export { default } from '@/app/class-profile/[id]/view/page';

'use client';

import { useState, useEffect, useMemo } from 'react';
import { InformationCircleIcon, ChevronDownIcon } from '@heroicons/react/24/outline';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import Navigation from '@/components/layout/Navigation';
import uiStyles from '@/app/ui/ui.module.css';
import styles from './page.module.css';

// const DEFAULT_CLASS_BACKGROUND = '';

// const DEFAULT_CLASS_PROFILE_TEXT = '';

const DEFAULT_CLASS_BACKGROUND =
  'Cohort includes graduate students from education disciplines who are strengthening their computational research toolkit.';

const DEFAULT_CLASS_PROFILE_TEXT = `This discipline focuses on computing and software engineering, where knowledge is built through logical proof, empirical validation, and formal specification. Learners engage with diverse materials such as code examples, conceptual explanations, research papers, and documentation, using both linear and non-linear reading strategies to understand algorithms, design patterns, and system behavior. Core practices include debugging, testing, verification, code review, and version control, reflecting inquiry processes rooted in problem solving, replication, and collaboration.

Discipline level:
1. common_reading_content_types: Code examples, conceptual explanations (design patterns, algorithms), primary sources (research papers, specifications), proofs (for algorithms and data structures), documentation, empirical studies (performance analysis, usability studies).
2. common_reading_patterns: Non-linear (code tracing, documentation lookup, reference based), linear narrative (conceptual explanations, tutorials, design documents), comparative or contrast (comparing algorithms, tools, approaches).
3. epistemology: Knowledge is established through logical proof (algorithm correctness, formal verification), empirical validation (testing, experimentation, simulation), formal specification, computational modeling, and peer review or consensus (best practices, design patterns, code reviews).
4. inquiry_practices: Debugging, testing (unit, integration, system), formal verification, code review and peer critique, problem solving (algorithm design, system architecture), replication (of results and code functionality), documentation, version control (managing change and collaboration).
5. cross_cutting_concepts: Systems and system models (software systems, version control systems), patterns (design and algorithmic patterns), cause and effect (bug causes, performance issues), structure and function (code, data structures, software components), stability and change (managing evolving codebases).
6. disciplinary_core_ideas: Algorithms and data structures, abstraction, computation, complexity, software engineering principles (modularity, reusability, maintainability, version control), information representation, human computer interaction.
7. representational_forms: Code, pseudocode, diagrams (UML, flowcharts, data structures, system architecture), graphs (call graphs, dependency graphs), equations (complexity analysis), formal specifications, models (state machines), documentation, primary texts (research papers, specifications).

Course level:
1. learning_goals: Develop foundational Python programming skills; understand basic Python syntax, data structures, and algorithms; learn to use essential programming tools and practices for effective software development, including collaborative environments.
2. key_concepts: Python syntax, variables, data types (integers, floats, strings, lists, dictionaries, tuples, sets), control flow (if or else, loops), functions, basic algorithms (searching, sorting), debugging, version control systems.
3. key_terms: Python, variable, data type, integer, float, string, list, dictionary, tuple, set, if, else, for, while, function, algorithm, syntax, error, bug, debug, repository, commit, branch, merge, conflict, Git, version control.

Class level:
1. learning_goals: Understand core version control concepts and best practices; enable effective use of version control systems like Git in collaborative coding environments.
2. key_concepts: Version control systems (VCS), distributed VCS (Git), repository, working copy, staging area, commit, branch, merge, conflict resolution, remote repositories, push, pull, best practices for version control (atomic commits, clear messages, frequent updates, branching strategies).
3. key_terms: Version control, VCS, Git, repository, commit, branch, merge, conflict, working copy, staging area, remote, push, pull, clone, fork, HEAD, main, checkout, status, add, diff, log, rebase.`;

type ProfileLevel = 'all' | 'discipline' | 'course' | 'class';

type RegenerateTarget =
  | 'profile-all'
  | 'profile-discipline'
  | 'profile-course'
  | 'profile-class'
  | 'design';

type ProfileSections = {
  overall: string;
  discipline: string;
  course: string;
  class: string;
  design: string;
};

const EMPTY_PROFILE_SECTIONS: ProfileSections = {
  overall: '',
  discipline: '',
  course: '',
  class: '',
  design: '',
};

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_COURSE_ID = 'fbaf501d-af97-4286-b5b0-d7b63b500b35';

type DesignRationaleText = string | null;
type DesignConsiderationsPayload = Record<string, unknown> | null;

const buildClassInputPayload = (
  data: ClassProfile,
  designConsiderationsPayload?: DesignConsiderationsPayload | undefined
) => ({
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
  design_considerations: designConsiderationsPayload ?? null,
});

const buildRunClassProfileRequest = (
  data: ClassProfile,
  designConsiderationsPayload?: DesignConsiderationsPayload
) => ({
  instructor_id: MOCK_INSTRUCTOR_ID,
  title: data.courseInfo.courseName || 'Untitled Class',
  course_code: data.courseInfo.courseCode || 'TBD',
  description: data.courseInfo.description || 'Draft class profile generated via Inkspire',
  class_input: buildClassInputPayload(data, designConsiderationsPayload ?? null),
});

const extractProfileFromReview = (review: unknown): { profileText: string } => {
  if (!review || typeof review !== 'object') {
    return { profileText: '' };
  }

  const reviewObj = review as Record<string, unknown>;
  let profileText = '';

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
      if (typeof parsed.profile === 'string') {
        profileText = parsed.profile;
      }
    } catch {
      if (!profileText) {
        profileText = raw;
      }
    }
  }

  return { profileText };
};

const serializeProfileForExport = (
  data: ClassProfile,
  designRationaleText?: DesignRationaleText | undefined,
  designConsiderationsPayload?: DesignConsiderationsPayload | undefined
) =>
  JSON.stringify({
    profile: data.generatedProfile ?? DEFAULT_CLASS_PROFILE_TEXT,
    design_consideration:
      designRationaleText !== undefined ? designRationaleText : null,
    design_rationale:
      designRationaleText !== undefined ? designRationaleText : null,
    class_input: buildClassInputPayload(data, designConsiderationsPayload),
  });


const PROFILE_STACK_LEVELS = ['discipline', 'course', 'class'] as const;

const PROFILE_LEVEL_TABS: { value: ProfileLevel; label: string }[] = [
  { value: 'all', label: 'Class Profile' },
  { value: 'discipline', label: 'Discipline' },
  { value: 'course', label: 'Course' },
  { value: 'class', label: 'Class' },
];

const PROFILE_SECTION_LABELS: Record<(typeof PROFILE_STACK_LEVELS)[number], string> = {
  discipline: 'Discipline level',
  course: 'Course level',
  class: 'Class level',
};

const SECTION_REGEX = /(Discipline level:|Course level:|Class level:|Design Considerations:)/g;

const parseProfileSections = (rawText?: string): ProfileSections => {
  const text = rawText?.trim() ? rawText : DEFAULT_CLASS_PROFILE_TEXT;
  const sections: ProfileSections = {
    overall: '',
    discipline: '',
    course: '',
    class: '',
    design: '',
  };

  const chunks = text.split(SECTION_REGEX);
  const intro = chunks.shift()?.trim() ?? '';

  // Store intro as overall_profile
  sections.overall = intro;

  for (let i = 0; i < chunks.length; i += 2) {
    const heading = chunks[i];
    const body = (chunks[i + 1] ?? '').trim();

    switch (heading) {
      case 'Discipline level:':
        sections.discipline = body;
        break;
      case 'Course level:':
        sections.course = body;
        break;
      case 'Class level:':
        sections.class = body;
        break;
      case 'Design Considerations:':
        sections.design = body;
        break;
      default:
        break;
    }
  }

  return sections;
};

const composeProfileNarrative = (sections: ProfileSections, includeDesign = true) => {
  const blocks: string[] = [];

  // Add overall_profile first (no header)
  if (sections.overall?.trim()) {
    blocks.push(sections.overall.trim());
  }

  PROFILE_STACK_LEVELS.forEach(level => {
    const text = sections[level]?.trim();
    if (text) {
      blocks.push(`${PROFILE_SECTION_LABELS[level]}:\n${text}`);
    }
  });

  if (includeDesign && sections.design.trim()) {
    blocks.push(`Design Considerations:\n${sections.design.trim()}`);
  }

  return blocks.join('\n\n').trim();
};

const getRegenerateTargetFromLevel = (level: ProfileLevel): RegenerateTarget =>
  level === 'all' ? 'profile-all' : (`profile-${level}` as RegenerateTarget);

const PRIOR_KNOWLEDGE_LABELS: Record<string, string> = {
  foundational: 'Foundational – minimal prior exposure',
  developing: 'Developing – some previous experience',
  intermediate: 'Intermediate – working familiarity',
  advanced: 'Advanced – extensive experience',
  mixed: 'Mixed proficiency cohort',
};

const PRIOR_KNOWLEDGE_OPTIONS = [
  { value: '', label: 'Select prior knowledge level' },
  ...Object.entries(PRIOR_KNOWLEDGE_LABELS).map(([value, label]) => ({ value, label })),
];

const DELIVERY_MODE_OPTIONS = [
  { value: '', label: 'Select delivery mode' },
  { value: 'in-person', label: 'In-person' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'online', label: 'Online' },
];

const SEMESTER_OPTIONS = ['Fall', 'Spring', 'Summer', 'Winter'];

const cloneProfile = (profile: ClassProfile): ClassProfile =>
  JSON.parse(JSON.stringify(profile));

const BASIC_SECTION_KEYS = ['disciplineInfo', 'courseInfo', 'classInfo'] as const;
type BasicSectionKey = (typeof BASIC_SECTION_KEYS)[number];

type SaveOptions = {
  redirectTo?: string;
  approveAfter?: boolean;
};

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
}

export default function ViewClassProfilePage() {
  const router = useRouter();
  // Path parameters (from route: /class-profile/[id]/view or /courses/[courseId]/class-profiles/[profileId]/view)
  const pathParams = useParams();
  // Query parameters (from URL: ?instructorId=yyy - courseId and profileId are now in path)
  const searchParams = useSearchParams();
  const profileId = pathParams?.profileId || pathParams?.id as string; // Support both old and new routes
  const courseId = pathParams?.courseId as string | undefined; // New RESTful route
  const isCreateMode = !profileId || profileId === 'new';
  
  // Get course_id from path (new) or query params (old), and instructor_id from query params
  const urlCourseId = courseId || searchParams?.get('courseId'); // Path param takes priority
  const urlInstructorId = searchParams?.get('instructorId');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState<ClassProfile | null>(null);
  const [initialData, setInitialData] = useState<ClassProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [profileSections, setProfileSections] = useState<ProfileSections>(EMPTY_PROFILE_SECTIONS);
  const [activeProfileLevel, setActiveProfileLevel] = useState<ProfileLevel>('all');
  const [editingProfileLevel, setEditingProfileLevel] = useState<ProfileLevel | null>(null);
  const [profileDraft, setProfileDraft] = useState('');
  const [editingDesign, setEditingDesign] = useState(false);
  const [regeneratingTarget, setRegeneratingTarget] = useState<RegenerateTarget | null>(null);
  const [basicSectionsCollapsed, setBasicSectionsCollapsed] = useState<
    Record<BasicSectionKey, boolean>
  >({
    disciplineInfo: true,
    courseInfo: true,
    classInfo: true,
  });
  const [isBasicInfoEditing, setIsBasicInfoEditing] = useState(false);
  const [basicInfoSnapshot, setBasicInfoSnapshot] = useState<ClassProfile | null>(null);
  const [initialDesignConsiderationText, setInitialDesignConsiderationText] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<any>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [designConsiderationMetadataText, setDesignConsiderationMetadataText] = useState<string>('');
  const [designConsiderationMetadataDraft, setDesignConsiderationMetadataDraft] = useState<string>('');

  const isDirty = useMemo(() => {
    if (!formData || !initialData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialData);
  }, [formData, initialData]);

  const hasDesignConsiderationsChanged = useMemo(() => {
    // If no initial version found, allow button (edge case: profile created before versioning)
    if (initialDesignConsiderationText === null) {
      return false;
    }

    // Compare current design rationale text with initial version
    return (
      (designConsiderationMetadataText || '').trim() !==
      (initialDesignConsiderationText || '').trim()
    );
  }, [designConsiderationMetadataText, initialDesignConsiderationText]);

  const formatDesignConsiderationMetadata = (raw: unknown): string => {
    if (!raw) return '';
    if (typeof raw === 'string') return raw;
    try {
      return JSON.stringify(raw, null, 2);
    } catch {
      return String(raw);
    }
  };

  const extractDesignConsiderationMetadataFromVersion = (version: any): unknown => {
    if (!version) return null;
    const meta = version.metadata_json;
    const metaDesign =
      meta?.profile?.design_consideration ??
      meta?.design_rationale ??
      meta?.design_consideration ??
      meta?.design_considerations;
    if (metaDesign) return metaDesign;

    try {
      const contentJson = typeof version.content === 'string' ? JSON.parse(version.content) : null;
      return (
        contentJson?.design_rationale ??
        contentJson?.design_consideration ??
        contentJson?.design_considerations ??
        null
      );
    } catch {
      return null;
    }
  };

  const extractUserDesignConsiderationsFromVersion = (version: any): DesignConsiderationsPayload => {
    if (!version) return null;
    const meta = version.metadata_json;
    if (meta?.design_consideration) {
      return meta.design_consideration as DesignConsiderationsPayload;
    }
    if (meta?.class_input?.design_considerations) {
      return meta.class_input.design_considerations as DesignConsiderationsPayload;
    }
    try {
      const contentJson = typeof version.content === 'string' ? JSON.parse(version.content) : null;
      if (contentJson?.class_input?.design_considerations) {
        return contentJson.class_input.design_considerations as DesignConsiderationsPayload;
      }
    } catch {
      return null;
    }
    return null;
  };

  const getDesignConsiderationsForSave = (): DesignRationaleText | undefined => {
    const fromVersion = extractDesignConsiderationMetadataFromVersion(currentVersion);
    const formatted = formatDesignConsiderationMetadata(fromVersion);
    if (formatted) {
      return formatted;
    }

    if (designConsiderationMetadataText) {
      return designConsiderationMetadataText;
    }

    return null;
  };

  const getUserDesignConsiderationsForPayload = (): DesignConsiderationsPayload | undefined =>
    extractUserDesignConsiderationsFromVersion(currentVersion);

  // Simplified logic for upload readings button disabled state
  const isUploadReadingsDisabled = useMemo(() => {
    // Basic loading/saving states and form validation
    if (saving || generating || isDirty === true) {
      return true;
    }

    // Allow upload if design considerations haven't changed
    if (!hasDesignConsiderationsChanged) {
      return false;
    }

    // If design changed, only allow upload if profile was generated after the change
    // Both initial generation ("pipeline") and full regeneration ("llm_regenerate") count as valid
    const validCreatedByValues = ['llm_regenerate', 'pipeline'];
    return !validCreatedByValues.includes(currentVersion?.created_by);
  }, [saving, generating, isDirty, hasDesignConsiderationsChanged, currentVersion?.created_by]);

  useEffect(() => {
    if (!profileId || profileId === 'new') {
      const defaults = createDefaultProfile(profileId || 'new');
      setFormData(cloneProfile(defaults));
      setInitialData(cloneProfile(defaults));
      setInitialDesignConsiderationText(null);
      setLoading(false);
      setError(null);
      setSuccess(false);
      setProfileSections(EMPTY_PROFILE_SECTIONS);
      return;
    }
    loadProfile();
    loadInitialVersion();
    loadCurrentVersion();
  }, [profileId]);

  useEffect(() => {
    if (!success) return;
    const timeout = window.setTimeout(() => setSuccess(false), 2500);
    return () => window.clearTimeout(timeout);
  }, [success]);

  useEffect(() => {
    if (isCreateMode && !formData?.generatedProfile) {
      setProfileSections(EMPTY_PROFILE_SECTIONS);
      return;
    }
    const baseText = formData?.generatedProfile ?? DEFAULT_CLASS_PROFILE_TEXT;
    setProfileSections(parseProfileSections(baseText));
  }, [formData?.generatedProfile, isCreateMode]);

const createDefaultProfile = (id: string): ClassProfile => ({
    id,
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
    },
  generatedProfile: '',
  });

  const normalizeProfile = (data: ClassProfile): ClassProfile => {
    const defaults = createDefaultProfile(data.id);
    const loadedDisciplineInfo = data.disciplineInfo || {};
    const loadedCourseInfo = data.courseInfo || {};
    const loadedClassInfo = data.classInfo || {};

    return {
      ...defaults,
      ...data,
      disciplineInfo: {
        ...defaults.disciplineInfo,
        ...loadedDisciplineInfo,
        disciplineName:
          loadedDisciplineInfo.disciplineName ??
          // @ts-expect-error legacy field name
          loadedDisciplineInfo.field ??
          defaults.disciplineInfo.disciplineName,
      },
      courseInfo: {
        ...defaults.courseInfo,
        ...loadedCourseInfo,
      },
      classInfo: {
        ...defaults.classInfo,
        ...loadedClassInfo,
        background: loadedClassInfo.background || DEFAULT_CLASS_BACKGROUND,
      },
      generatedProfile: data.generatedProfile || DEFAULT_CLASS_PROFILE_TEXT,
    };
  };

  const validateForm = (data: ClassProfile | null = formData): data is ClassProfile => {
    if (!data) {
      setError('Please fill in the required fields.');
      return false;
    }

    if (!data.disciplineInfo.disciplineName || !data.disciplineInfo.department) {
      setError('Please fill in Discipline Name and Department.');
      return false;
    }
    if (!data.courseInfo.courseName || !data.courseInfo.courseCode) {
      setError('Please fill in Course Name and Course Code.');
      return false;
    }
    if (!data.classInfo.semester || !data.classInfo.year) {
      setError('Please fill in Semester and Year.');
      return false;
    }
    return true;
  };

  const loadProfile = async () => {
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

      const profilePayload =
        data.profile ?? data.class_profile ?? data.review ?? null;
      const loadedProfile = profilePayload ? normalizeProfile(profilePayload) : null;

      if (loadedProfile) {
        setFormData(cloneProfile(loadedProfile));
        setInitialData(cloneProfile(loadedProfile));
        
        // Update URL with course_id and instructor_id from API if not already in URL
        if ((data.course_id || data.instructor_id) && typeof window !== 'undefined') {
          const currentParams = new URLSearchParams(window.location.search);
          let needsUpdate = false;
          
          if (data.course_id && !currentParams.has('courseId')) {
            currentParams.set('courseId', data.course_id);
            needsUpdate = true;
          }
          if (data.instructor_id && !currentParams.has('instructorId')) {
            currentParams.set('instructorId', data.instructor_id);
            needsUpdate = true;
          }
          
          if (needsUpdate) {
            const newUrl = `${window.location.pathname}?${currentParams.toString()}`;
            window.history.replaceState({}, '', newUrl);
          }
        }
      } else {
        throw new Error('Failed to load profile');
      }
    } catch (err) {
      setError('Failed to load profile. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Shared helper to fetch versions array from API
  const loadVersions = async (): Promise<any[] | null> => {
    if (!profileId || profileId === 'new') {
      return null;
    }

    try {
      const response = await fetch(`/api/class-profiles/${profileId}/versions`);
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        console.error('Failed to load versions:', data?.message);
        return null;
      }

      return data.versions || [];
    } catch (err) {
      console.error('Failed to load versions:', err);
      return null;
    }
  };

  const loadInitialVersion = async () => {
    setLoadingVersions(true);
    try {
      const versions = await loadVersions();

      if (!versions || versions.length === 0) {
        console.warn('No versions found');
        setInitialDesignConsiderationText(null);
        return;
      }

      // Find version_number = 1 (the very first generated version)
      const initialVersion = versions.find((v: any) => v.version_number === 1);

      if (!initialVersion) {
        console.warn('No initial version (version_number = 1) found');
        setInitialDesignConsiderationText(null);
        return;
      }

      const extracted = extractDesignConsiderationMetadataFromVersion(initialVersion);
      setInitialDesignConsiderationText(formatDesignConsiderationMetadata(extracted));
    } finally {
      setLoadingVersions(false);
    }
  };

  const loadCurrentVersion = async () => {
    const versions = await loadVersions();

    if (!versions || versions.length === 0) {
      console.warn('No versions found');
      setCurrentVersion(null);
      setDesignConsiderationMetadataText('');
      return;
    }

    // Sort by version_number descending and take the first one
    const current = [...versions].sort((a: any, b: any) => b.version_number - a.version_number)[0];
    setCurrentVersion(current);

    const rawMeta = extractDesignConsiderationMetadataFromVersion(current);
    setDesignConsiderationMetadataText(formatDesignConsiderationMetadata(rawMeta));
  };

  // Consolidated helper to reload all profile data after mutations
  const reloadProfileData = async (options = { includeProfile: true }) => {
    if (options.includeProfile) {
      await loadProfile();
    }
    await loadCurrentVersion();
    await loadInitialVersion();
  };

  const handleFieldChange = (
    section: 'disciplineInfo' | 'courseInfo' | 'classInfo',
    field: string,
    value: string
  ) => {
    setFormData(prev => {
      if (!prev) return prev;
      return {
        ...prev,
        [section]: {
          ...prev[section],
          [field]: value,
        },
      };
    });
    setError(null);
    setSuccess(false);
  };

  const toggleBasicSection = (section: BasicSectionKey) => {
    setBasicSectionsCollapsed(prev => ({
      ...prev,
      [section]: !prev[section],
    }));
  };

  const handleStartBasicInfoEdit = () => {
    if (!formData) return;
    setBasicInfoSnapshot(cloneProfile(formData));
    setIsBasicInfoEditing(true);
    setError(null);
    setSuccess(false);
  };

  const handleCancelBasicInfoEdit = () => {
    if (basicInfoSnapshot) {
      setFormData(cloneProfile(basicInfoSnapshot));
    }
    setIsBasicInfoEditing(false);
    setBasicInfoSnapshot(null);
  };

  const updateProfileSections = (updater: (prev: ProfileSections) => ProfileSections) => {
    // Calculate next sections outside of setState to avoid nested setState anti-pattern
    const nextSections = updater(profileSections);
    setProfileSections(nextSections);
    setFormData(prev =>
      prev
        ? {
            ...prev,
            generatedProfile: composeProfileNarrative(nextSections),
          }
        : prev
    );
    setSuccess(false);
  };

  const getEditableTextForLevel = (level: ProfileLevel) =>
    level === 'all'
      ? profileSections.overall
      : profileSections[level];

  const handleStartProfileEdit = () => {
    setEditingProfileLevel(activeProfileLevel);
    setProfileDraft(getEditableTextForLevel(activeProfileLevel));
    setError(null);
    setSuccess(false);
  };

  const handleCancelProfileEdit = () => {
    setEditingProfileLevel(null);
    setProfileDraft('');
  };

  const handleSaveProfileEdit = async () => {
    if (!editingProfileLevel || !formData) return;

    // Create the updated sections first
    let updatedSections: ProfileSections;
    if (editingProfileLevel === 'all') {
      updatedSections = {
        ...profileSections,
        overall: profileDraft.trim(),
      };
    } else {
      updatedSections = {
        ...profileSections,
        [editingProfileLevel]: profileDraft.trim(),
      };
    }

    // Create the new profile text
    const newProfileText = composeProfileNarrative(updatedSections);

    // Create updated form data with the new profile text
    const updatedFormData = {
      ...formData,
      generatedProfile: newProfileText,
    };

    // Save first - handleSave will update state on success
    const success = await handleSave(updatedFormData);

    // Only clear editing state if save succeeded
    if (success) {
      setEditingProfileLevel(null);
      setProfileDraft('');
    }
    // If save failed, user remains in edit mode with their draft intact
  };

  const handleStartDesignEdit = () => {
    setEditingDesign(true);
    setDesignConsiderationMetadataDraft(designConsiderationMetadataText);
    setError(null);
    setSuccess(false);
  };

  const handleCancelDesignEdit = () => {
    setEditingDesign(false);
    setDesignConsiderationMetadataDraft('');
  };

  const handleSaveDesignEdit = async () => {
    if (!formData) return;

    const courseIdForRequest = urlCourseId;
    if (!courseIdForRequest || courseIdForRequest === 'new') {
      setError('course_id is required to save design considerations.');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(
        `/api/courses/${courseIdForRequest}/design-considerations/edit`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            course_id: courseIdForRequest,
            design_consideration: designConsiderationMetadataDraft,
          }),
        }
      );
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to save design considerations.');
      }

      setDesignConsiderationMetadataDraft('');
      setEditingDesign(false);
      setSuccess(true);

      await reloadProfileData({ includeProfile: false });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save design considerations.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRegenerate = async (target: RegenerateTarget) => {
    if (!formData) return;
    setRegeneratingTarget(target);
    setError(null);
    setSuccess(false);
    setEditingProfileLevel(null);
    setProfileDraft('');
    setEditingDesign(false);

    try {
      // Get course_id from URL params, or use "new" to create a new course
      const courseIdForRequest = urlCourseId || 'new';

      // Determine if this is an existing profile or a new one
      const isExistingProfile = profileId && profileId !== 'new';

      let response;

      if (isExistingProfile) {
        // For existing profiles, use llm-refine endpoint with class_input for full regeneration
        response = await fetch(
          `/api/courses/${courseIdForRequest}/class-profiles/${profileId}/llm-refine`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              class_input: buildClassInputPayload(
                formData,
                getUserDesignConsiderationsForPayload() ?? null
              ),
            }),
          }
        );
      } else {
        // For new profiles, use create endpoint
        const payload = buildRunClassProfileRequest(
          formData,
          getUserDesignConsiderationsForPayload() ?? null
        );
        response = await fetch(`/api/courses/${courseIdForRequest}/class-profiles`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to regenerate content.');
      }

      const review = data.review ?? null;
      const { profileText } = extractProfileFromReview(review);
      const textToUse =
        profileText || formData.generatedProfile || DEFAULT_CLASS_PROFILE_TEXT;
      const parsedSections = parseProfileSections(textToUse);

      // Update profile sections directly (no nested setState!)
      setProfileSections(prev => {
        switch (target) {
          case 'profile-all':
            return {
              ...prev,
              discipline: parsedSections.discipline,
              course: parsedSections.course,
              class: parsedSections.class,
            };
          case 'profile-discipline':
            return { ...prev, discipline: parsedSections.discipline };
          case 'profile-course':
            return { ...prev, course: parsedSections.course };
          case 'profile-class':
            return { ...prev, class: parsedSections.class };
          case 'design':
            return { ...prev, design: parsedSections.design };
          default:
            return prev;
        }
      });

      // Update formData once for all targets (no nesting!)
      setFormData(prev =>
        prev
          ? {
              ...prev,
              generatedProfile: textToUse,
            }
          : prev
      );

      // Reload profile data from backend to ensure we have the latest state
      if (isExistingProfile) {
        await reloadProfileData();
      }

      const nextId =
        data.class_profile?.id ||
        (Array.isArray(data?.class_profiles) ? data.class_profiles[0]?.id : undefined) ||
        data?.class_id;

      if (typeof nextId === 'string') {
        setFormData(prev =>
          prev
            ? {
                ...prev,
                id: nextId,
              }
            : prev
        );
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to regenerate content. Please try again.';
      setError(message);
    } finally {
      setRegeneratingTarget(null);
    }
  };

  const handleGenerateProfile = async () => {
    const currentData = formData;
    if (!validateForm(currentData)) {
      return;
    }

    setGenerating(true);
    setError(null);

    try {
      const payload = buildRunClassProfileRequest(
        currentData,
        getUserDesignConsiderationsForPayload() ?? null
      );
      
      // Get course_id from URL params, or use "new" to create a new course
      const urlParams = new URLSearchParams(window.location.search);
      const urlCourseId = urlParams.get('courseId') || 
        (typeof window !== 'undefined' && window.location.pathname.match(/\/courses\/([^\/]+)/)?.[1]);
      const courseIdForRequest = urlCourseId || 'new';

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
      const { profileText } = extractProfileFromReview(review);
      const textToUse =
        profileText || currentData.generatedProfile || DEFAULT_CLASS_PROFILE_TEXT;

      const parsedSections = parseProfileSections(textToUse);

      const nextId =
        data.class_profile?.id ||
        review?.id ||
        data.class_id ||
        currentData.id ||
        'new';

      const updatedFormData: ClassProfile = {
        ...currentData,
        id: typeof nextId === 'string' ? nextId : currentData.id,
        generatedProfile: textToUse,
      };

      setFormData(cloneProfile(updatedFormData));
      setInitialData(cloneProfile(updatedFormData));
      setProfileSections(parsedSections);
      setSuccess(true);
      setIsBasicInfoEditing(false);
      setBasicInfoSnapshot(null);

      if (updatedFormData.id && updatedFormData.id !== 'new' && profileId === 'new') {
        // Use RESTful URL structure if courseId is available, otherwise fallback to old structure
        if (urlCourseId && updatedFormData.id) {
          router.replace(`/courses/${urlCourseId}/class-profiles/${updatedFormData.id}/view`);
        } else {
          // Fallback to old structure with query params
          const navParams = new URLSearchParams();
          if (urlCourseId) navParams.set('courseId', urlCourseId);
          if (urlInstructorId) navParams.set('instructorId', urlInstructorId);
          const queryString = navParams.toString();
          router.replace(`/class-profile/${updatedFormData.id}/view${queryString ? `?${queryString}` : ''}`);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to generate profile. Please try again.';
      setError(message);
    } finally {
      setGenerating(false);
    }
  };

  const getRegenerateLabel = (target: RegenerateTarget) =>
    regeneratingTarget === target ? 'Regenerating...' : 'Regenerate with AI';

  const renderProfileBody = () => {
    const trimmedSections = {
      discipline: profileSections.discipline.trim(),
      course: profileSections.course.trim(),
      class: profileSections.class.trim(),
    };

    const hasContent =
      profileSections.overall.trim() ||
      trimmedSections.discipline ||
      trimmedSections.course ||
      trimmedSections.class;

    if (!hasContent) {
      return (
        <div className={styles.profileEmptyState}>
          Add details on the left or regenerate with AI to populate this view.
        </div>
      );
    }

    if (activeProfileLevel === 'all') {
      const overallText = profileSections.overall.trim();
      if (!overallText) {
        return (
          <div className={styles.profileEmptyState}>
            Add details on the left or regenerate with AI to populate this view.
          </div>
        );
      }
      return (
        <section className={styles.profileSectionBlock}>
          <p className={styles.profileTextBlock}>{overallText}</p>
        </section>
      );
    }

    const level = activeProfileLevel;
    const text = trimmedSections[level];
    if (!text) {
      return (
        <div className={styles.profileEmptyState}>
          Add or regenerate the {PROFILE_SECTION_LABELS[level]} content.
        </div>
      );
    }

    return (
      <section className={styles.profileSectionBlock}>
        <p className={styles.profileSectionLabel}>{PROFILE_SECTION_LABELS[level]}</p>
        <p className={styles.profileTextBlock}>{text}</p>
      </section>
    );
  };

  const handleReset = () => {
    if (initialData) {
      setFormData(cloneProfile(initialData));
      setError(null);
      setSuccess(false);
    }
  };

  const handleSave = async (
    dataToSave?: ClassProfile,
    options: SaveOptions = {}
  ): Promise<boolean> => {
    const saveData = dataToSave || formData;
    if (!saveData) return false;
    
    setSaving(true);
    setError(null);
    try {
      const hasExistingId = saveData.id && saveData.id !== 'new';

      // Get course_id from URL params
      const courseIdParam = urlCourseId;

      if (hasExistingId && !courseIdParam) {
        throw new Error('course_id is required for updating profile');
      }

      const endpoint = hasExistingId
        ? `/api/courses/${courseIdParam}/class-profiles/${saveData.id}/edit`
        : '/api/class-profiles';
      const method = 'POST'; // Backend uses POST for both create and edit

      const designRationaleForSave = hasExistingId
        ? getDesignConsiderationsForSave()
        : designConsiderationMetadataText;
      const userDesignConsiderationsForSave = hasExistingId
        ? getUserDesignConsiderationsForPayload()
        : null;

      const payload = hasExistingId
        ? {
            // For edit endpoint - matches EditProfileRequest (backend expects 'text' field)
            text: serializeProfileForExport(
              saveData,
              designRationaleForSave,
              userDesignConsiderationsForSave
            )
          }
        : {
            // For create endpoint - matches existing structure
            // Get instructor_id from URL params instead of using mock
            instructor_id: urlInstructorId || MOCK_INSTRUCTOR_ID,
            title: saveData.courseInfo.courseName || 'Untitled Class',
            course_code: saveData.courseInfo.courseCode || 'TBD',
            description: saveData.courseInfo.description || 'Draft class profile',
            class_input: buildClassInputPayload(saveData, userDesignConsiderationsForSave),
            generated_profile: saveData.generatedProfile,
          };

      const response = await fetch(endpoint, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.message || 'Failed to save profile');
      }
      const savedProfile = (data?.profile as ClassProfile | undefined) ?? saveData;
      const normalized = !hasExistingId ? normalizeProfile(savedProfile) : null;
      if (normalized) {
        setFormData(cloneProfile(normalized));
        setInitialData(cloneProfile(normalized));
      }
      setSuccess(true);

      // Reload profile + version metadata to keep design considerations from metadata_json
      if (hasExistingId) {
        await reloadProfileData({ includeProfile: true });
      }
      
      const savedId =
        normalized && normalized.id && normalized.id !== 'new'
          ? normalized.id
          : typeof data?.profile?.id === 'string'
            ? data.profile.id
            : hasExistingId
              ? saveData.id
              : undefined;

      if (!hasExistingId && savedId && savedId !== 'new' && profileId === 'new') {
        // Use RESTful URL structure if courseId is available, otherwise fallback to old structure
        if (urlCourseId && savedId) {
          router.replace(`/courses/${urlCourseId}/class-profiles/${savedId}/view`);
        } else {
          // Fallback to old structure with query params
          const navParams = new URLSearchParams();
          if (urlCourseId) navParams.set('courseId', urlCourseId);
          if (urlInstructorId) navParams.set('instructorId', urlInstructorId);
          const queryString = navParams.toString();
          router.replace(`/class-profile/${savedId}/view${queryString ? `?${queryString}` : ''}`);
        }
      }

      if (options.approveAfter && savedId && savedId !== 'new') {
        // Get course_id from URL params
        const courseIdForApprove = urlCourseId || data?.course_id;
        if (!courseIdForApprove) {
          throw new Error('course_id is required for approving profile');
        }
        const approveUrl = `/api/courses/${courseIdForApprove}/class-profiles/${savedId}/approve`;
        const approveResponse = await fetch(approveUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            updated_text: serializeProfileForExport(
              saveData,
              designRationaleForSave,
              userDesignConsiderationsForSave
            ),
          }),
        });
        const approveData = await approveResponse.json().catch(() => ({}));
        if (!approveResponse.ok) {
          throw new Error(approveData?.message || 'Failed to approve class profile');
        }
      }

      if (options.redirectTo) {
        router.push(options.redirectTo);
      }
      return true;
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to save profile. Please try again.';
      setError(message);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleBasicInfoSave = async () => {
    if (!formData) return;

    const courseIdForRequest = urlCourseId;
    if (!courseIdForRequest || courseIdForRequest === 'new') {
      setError('course_id is required to save basic info.');
      return;
    }

    if (!validateForm(formData)) {
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const response = await fetch(`/api/courses/${courseIdForRequest}/basic-info/edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          course_id: courseIdForRequest,
          discipline_info_json: {
            discipline_name: formData.disciplineInfo.disciplineName,
            department: formData.disciplineInfo.department,
            field_description: formData.disciplineInfo.fieldDescription,
          },
          course_info_json: {
            course_name: formData.courseInfo.courseName,
            course_code: formData.courseInfo.courseCode,
            description: formData.courseInfo.description,
            credits: formData.courseInfo.credits,
            prerequisites: formData.courseInfo.prerequisites,
            learning_objectives: formData.courseInfo.learningObjectives,
            assessment_methods: formData.courseInfo.assessmentMethods,
            delivery_mode: formData.courseInfo.deliveryMode,
          },
          class_info_json: {
            semester: formData.classInfo.semester,
            year: formData.classInfo.year,
            section: formData.classInfo.section,
            meeting_days: formData.classInfo.meetingDays,
            meeting_time: formData.classInfo.meetingTime,
            location: formData.classInfo.location,
            enrollment: formData.classInfo.enrollment,
            background: formData.classInfo.background || DEFAULT_CLASS_BACKGROUND,
            prior_knowledge: formData.classInfo.priorKnowledge,
          },
        }),
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.detail || data?.message || 'Failed to save basic info.');
      }

      setInitialData(cloneProfile(formData));
      setSuccess(true);
      setIsBasicInfoEditing(false);
      setBasicInfoSnapshot(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save basic info.';
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveClick = () => {
    void handleSave(undefined, { approveAfter: true });
  };

  const handleStartSession = () => {
    if (!formData?.id || formData.id === 'new') {
      setError('Save this class profile before starting a session.');
      return;
    }
    // Get course_id from URL params, profile data, or fallback to mock
    const courseId = urlCourseId || 
      (formData?.courseInfo && 'courseId' in formData.courseInfo
        ? (formData.courseInfo as typeof formData.courseInfo & { courseId?: string }).courseId
        : undefined) || 
      MOCK_COURSE_ID;
    
    // Get instructor_id from URL params or fallback to mock
    const instructorId = urlInstructorId || MOCK_INSTRUCTOR_ID;
    
    // Use RESTful URL structure if courseId is available in path, otherwise fallback to old structure
    if (urlCourseId && formData.id) {
      router.push(`/courses/${urlCourseId}/readings?profileId=${formData.id}&instructorId=${urlInstructorId}`);
    } else {
      // Fallback to old structure with query params
      const params = new URLSearchParams({
        courseId: courseId || '',
        instructorId,
      });
      router.push(`/class-profile/${formData.id}/reading?${params.toString()}`);
    }
  };

  const startSessionLabel = 'Upload Readings';

  const handleBackToDashboard = () => {
    router.push('/');
  };

  const profileHeading = formData?.courseInfo.courseName || 'Class Profile';
  const profileCourseCode = formData?.courseInfo.courseCode || '';
  const busyRegenerating = Boolean(regeneratingTarget);
  const activeLevelLabel =
    PROFILE_LEVEL_TABS.find(tab => tab.value === activeProfileLevel)?.label || 'All levels';
  const isEditingProfile = Boolean(editingProfileLevel);

  if (loading) {
    return (
      <div className={styles.container}>
        <Navigation />
        <div className={styles.loadingContainer}>
          <div className={styles.loadingSpinner}></div>
          <p>Loading profile...</p>
        </div>
      </div>
    );
  }

  if (!formData) {
    return (
      <div className={styles.container}>
        <Navigation />
        <div className={styles.content}>
          <div className={styles.errorMessage}>
            {error || 'Profile not found'}
          </div>
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
          <div className={styles.headerLeft}>
            <div>
              <h1 className={`${styles.title} ${styles.titleWithCode}`}>
                <span>{profileHeading}</span>
                {profileCourseCode && (
                  <>
                    <span className={styles.titleDivider}>|</span>
                    <span className={styles.titleCode}>{profileCourseCode}</span>
                  </>
                )}
              </h1>
            </div>
          </div>
          <div className={styles.headerActions}>
            <button
              onClick={handleBackToDashboard}
              className={`${uiStyles.btn} ${uiStyles.btnNeutral}`}
              disabled={saving || generating}
            >
              ← Back to Dashboard
            </button>

            {/*<button
              onClick={handleSaveClick}
              className={`${uiStyles.btn} ${uiStyles.btnPrimary}`}
              disabled={saving || generating || !formData}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>*/}

            {isCreateMode ? null : (
              <div className={styles.regenerateInfoWrapper}>
                <button
                  onClick={handleStartSession}
                  className={`${uiStyles.btn} ${uiStyles.btnStartSession}`}
                  disabled={isUploadReadingsDisabled}
                >
                  {startSessionLabel}
                </button>
                {hasDesignConsiderationsChanged && (
                  <span
                    tabIndex={0}
                    className={styles.regenerateInfoTrigger}
                    aria-label="You must regenerate the class profile after editing LLM Design Rationale before uploading readings."
                  >
                    <InformationCircleIcon aria-hidden="true" className={styles.regenerateInfoIcon} />
                    <span className={styles.regenerateTooltip}>
                      You must regenerate the class profile after editing Design Considerations before uploading readings.
                    </span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
      <div className={styles.content}>
        {error && formData && (
          <div className={styles.errorMessage}>
            {error}
          </div>
        )}
        {success && (
          <div className={styles.successMessage}>
            Information updated successfully.
          </div>
        )}
        <div className={styles.layoutGrid}>
          <div className={styles.leftColumn}>
            <section className={styles.contextCard}>
              <div className={styles.sectionHeader}>
                <div>
                  <h3 className={styles.cardTitle}>LLM Design Rationale</h3>
                </div>
                <div className={styles.cardActions}>
                  {editingDesign ? (
                    <>
                      <button
                        type="button"
                        className={styles.sectionButton}
                        onClick={handleCancelDesignEdit}
                        disabled={busyRegenerating}
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        className={`${styles.sectionButton} ${uiStyles.btnRegenerateAi}`}
                        onClick={handleSaveDesignEdit}
                        disabled={busyRegenerating || saving}
                      >
                        Save</button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        className={styles.sectionButton}
                        onClick={handleStartDesignEdit}
                        disabled={isEditingProfile || busyRegenerating}
                      >
                        Edit
                      </button>
                      <div className={styles.regenerateInfoWrapper}>
                        <button
                          type="button"
                          className={`${styles.sectionButton} ${uiStyles.btnRegenerateAi}`}
                          onClick={() => handleRegenerate('design')}
                          disabled={isEditingProfile || busyRegenerating || saving}
                        >
                          {getRegenerateLabel('design')}
                        </button>
                        <span
                          tabIndex={0}
                          className={styles.regenerateInfoTrigger}
                          aria-label="Regenerates the class profile with AI using your latest Design Considerations."
                        >
                          <InformationCircleIcon aria-hidden="true" className={styles.regenerateInfoIcon} />
                          <span className={styles.regenerateTooltip}>
                            Uses your updated LLM Design Rationale to regenerate the class profile with AI.
                          </span>
                        </span>
                      </div>
                    </>
                  )}
                </div>
              </div>
              <div className={styles.designBody}>
                <textarea
                  className={styles.designTextarea}
                  rows={10}
                  value={editingDesign ? designConsiderationMetadataDraft : designConsiderationMetadataText}
                  readOnly={!editingDesign}
                  onChange={(event) => {
                    if (editingDesign) {
                      setDesignConsiderationMetadataDraft(event.target.value);
                    }
                  }}
                  placeholder="No design_consideration metadata available."
                />
              </div>
            </section>

            <section className={styles.contextCard}>
            <div className={styles.sectionHeader}>
              <div>
                <h2 className={styles.sectionHeadingTitle}>Basic Information</h2>
              </div>
              <div className={styles.cardActions}>
                {isBasicInfoEditing ? (
                  <>
                    <button
                      type="button"
                      className={styles.sectionButton}
                      onClick={handleCancelBasicInfoEdit}
                      disabled={saving || generating}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${styles.sectionButton} ${uiStyles.btnRegenerateAi}`}
                      onClick={handleBasicInfoSave}
                      disabled={saving || generating}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.sectionButton}
                    onClick={handleStartBasicInfoEdit}
                    disabled={!formData || saving || generating || busyRegenerating}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>
            <div className={styles.contextSections}>
              <div className={styles.panelCard}>
                <button
                  type="button"
                  className={styles.panelHeader}
                  onClick={() => toggleBasicSection('disciplineInfo')}
                  aria-expanded={!basicSectionsCollapsed.disciplineInfo}
                  aria-controls="basic-section-discipline"
                >
                  <span className={styles.panelTitle}>Discipline Information</span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`${styles.panelToggleIcon} ${
                      basicSectionsCollapsed.disciplineInfo ? styles.panelToggleCollapsed : ''
                    }`}
                  />
                </button>
                <div
                  id="basic-section-discipline"
                  className={`${styles.panelBody} ${
                    basicSectionsCollapsed.disciplineInfo ? styles.panelBodyCollapsed : ''
                  }`}
                  aria-hidden={basicSectionsCollapsed.disciplineInfo}
                >
                  <div className={styles.infoGrid}>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Discipline Name *</label>
                      <input
                        className={styles.editInput}
                        value={formData.disciplineInfo.disciplineName}
                        onChange={(e) =>
                          handleFieldChange('disciplineInfo', 'disciplineName', e.target.value)
                        }
                        placeholder="e.g., Computer Science"
                        disabled={!isBasicInfoEditing}
                      />
                    </div>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Department *</label>
                      <input
                        className={styles.editInput}
                        value={formData.disciplineInfo.department}
                        onChange={(e) =>
                          handleFieldChange('disciplineInfo', 'department', e.target.value)
                        }
                        placeholder="e.g., School of Education"
                        disabled={!isBasicInfoEditing}
                      />
                    </div>
                    <div className={styles.editField}>
                      <label className={styles.editLabel}>Field Description</label>
                      <textarea
                        className={styles.editTextarea}
                        rows={3}
                        value={formData.disciplineInfo.fieldDescription}
                        onChange={(e) =>
                          handleFieldChange('disciplineInfo', 'fieldDescription', e.target.value)
                        }
                        placeholder="Summarize the discipline’s focus areas, core questions, and methods."
                        disabled={!isBasicInfoEditing}
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className={styles.panelCard}>
                <button
                  type="button"
                  className={styles.panelHeader}
                  onClick={() => toggleBasicSection('courseInfo')}
                  aria-expanded={!basicSectionsCollapsed.courseInfo}
                  aria-controls="basic-section-course"
                >
                  <span className={styles.panelTitle}>Course Information</span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`${styles.panelToggleIcon} ${
                      basicSectionsCollapsed.courseInfo ? styles.panelToggleCollapsed : ''
                    }`}
                  />
                </button>
                <div
                  id="basic-section-course"
                  className={`${styles.panelBody} ${
                    basicSectionsCollapsed.courseInfo ? styles.panelBodyCollapsed : ''
                  }`}
                  aria-hidden={basicSectionsCollapsed.courseInfo}
                >
                  <div className={styles.infoGrid}>
                    <div className={styles.editField}>
                    <label className={styles.editLabel}>Course Name *</label>
                    <input
                      className={styles.editInput}
                      value={formData.courseInfo.courseName}
                      onChange={(e) => handleFieldChange('courseInfo', 'courseName', e.target.value)}
                      placeholder="e.g., Introduction to Universal Design for Learning"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Course Code *</label>
                    <input
                      className={styles.editInput}
                      value={formData.courseInfo.courseCode}
                      onChange={(e) => handleFieldChange('courseInfo', 'courseCode', e.target.value)}
                      placeholder="e.g., EDU 101"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Credits</label>
                    <input
                      className={styles.editInput}
                      value={formData.courseInfo.credits}
                      onChange={(e) => handleFieldChange('courseInfo', 'credits', e.target.value)}
                      placeholder="e.g., 3"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Prerequisites</label>
                    <input
                      className={styles.editInput}
                      value={formData.courseInfo.prerequisites}
                      onChange={(e) =>
                        handleFieldChange('courseInfo', 'prerequisites', e.target.value)
                      }
                      placeholder="e.g., EDU 100 or instructor permission"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Learning Objectives</label>
                    <textarea
                      className={styles.editTextarea}
                      rows={3}
                      value={formData.courseInfo.learningObjectives}
                      onChange={(e) =>
                        handleFieldChange('courseInfo', 'learningObjectives', e.target.value)
                      }
                      placeholder="Outline the learning objectives or expected outcomes."
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Assessment Methods</label>
                    <textarea
                      className={styles.editTextarea}
                      rows={3}
                      value={formData.courseInfo.assessmentMethods}
                      onChange={(e) =>
                        handleFieldChange('courseInfo', 'assessmentMethods', e.target.value)
                      }
                      placeholder="Describe the assessment methods (exams, projects, participation, etc.)."
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Delivery Mode</label>
                    <select
                      className={`${styles.editInput} ${styles.editSelect}`}
                      value={formData.courseInfo.deliveryMode}
                      onChange={(e) =>
                        handleFieldChange('courseInfo', 'deliveryMode', e.target.value)
                      }
                      disabled={!isBasicInfoEditing}
                    >
                      {DELIVERY_MODE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Course Description</label>
                    <textarea
                      className={styles.editTextarea}
                      rows={4}
                      value={formData.courseInfo.description}
                      onChange={(e) =>
                        handleFieldChange('courseInfo', 'description', e.target.value)
                      }
                      placeholder="Enter a detailed description of the course..."
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                </div>
              </div>
              </div>
 
              <div className={styles.panelCard}>
                <button
                  type="button"
                  className={styles.panelHeader}
                  onClick={() => toggleBasicSection('classInfo')}
                  aria-expanded={!basicSectionsCollapsed.classInfo}
                  aria-controls="basic-section-class"
                >
                  <span className={styles.panelTitle}>Class Information</span>
                  <ChevronDownIcon
                    aria-hidden="true"
                    className={`${styles.panelToggleIcon} ${
                      basicSectionsCollapsed.classInfo ? styles.panelToggleCollapsed : ''
                    }`}
                  />
                </button>
                <div
                  id="basic-section-class"
                  className={`${styles.panelBody} ${
                    basicSectionsCollapsed.classInfo ? styles.panelBodyCollapsed : ''
                  }`}
                  aria-hidden={basicSectionsCollapsed.classInfo}
                >
                  <div className={styles.infoGrid}>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Semester *</label>
                    <select
                      className={`${styles.editInput} ${styles.editSelect}`}
                      value={formData.classInfo.semester}
                      onChange={(e) => handleFieldChange('classInfo', 'semester', e.target.value)}
                      disabled={!isBasicInfoEditing}
                    >
                      <option value="">Select semester</option>
                      {SEMESTER_OPTIONS.map(option => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Year *</label>
                    <input
                      className={styles.editInput}
                      value={formData.classInfo.year}
                      onChange={(e) => handleFieldChange('classInfo', 'year', e.target.value)}
                      placeholder="e.g., 2024"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Section</label>
                    <input
                      className={styles.editInput}
                      value={formData.classInfo.section}
                      onChange={(e) => handleFieldChange('classInfo', 'section', e.target.value)}
                      placeholder="e.g., A, B, 01"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Enrollment</label>
                    <input
                      className={styles.editInput}
                      value={formData.classInfo.enrollment}
                      onChange={(e) => handleFieldChange('classInfo', 'enrollment', e.target.value)}
                      placeholder="e.g., 25"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Meeting Days</label>
                    <input
                      className={styles.editInput}
                      value={formData.classInfo.meetingDays}
                      onChange={(e) =>
                        handleFieldChange('classInfo', 'meetingDays', e.target.value)
                      }
                      placeholder="e.g., MWF, TTh"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Meeting Time</label>
                    <input
                      className={styles.editInput}
                      value={formData.classInfo.meetingTime}
                      onChange={(e) =>
                        handleFieldChange('classInfo', 'meetingTime', e.target.value)
                      }
                      placeholder="e.g., 10:00 AM - 11:30 AM"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Location</label>
                    <input
                      className={styles.editInput}
                      value={formData.classInfo.location}
                      onChange={(e) => handleFieldChange('classInfo', 'location', e.target.value)}
                      placeholder="e.g., Building A, Room 201"
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Background</label>
                    <textarea
                      className={styles.editTextarea}
                      rows={3}
                      value={formData.classInfo.background}
                      onChange={(e) => handleFieldChange('classInfo', 'background', e.target.value)}
                      placeholder="Provide background information about this class and its learners."
                      disabled={!isBasicInfoEditing}
                    />
                  </div>
                  <div className={styles.editField}>
                    <label className={styles.editLabel}>Prior Knowledge</label>
                    <select
                      className={`${styles.editInput} ${styles.editSelect}`}
                      value={formData.classInfo.priorKnowledge}
                      onChange={(e) =>
                        handleFieldChange('classInfo', 'priorKnowledge', e.target.value)
                      }
                      disabled={!isBasicInfoEditing}
                    >
                      {PRIOR_KNOWLEDGE_OPTIONS.map(option => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
            </div>
            </section>
          </div>

          <section className={`${styles.profileCard} ${styles.classProfileCard}`}>
            <div className={styles.profileCardHeader}>
              <div>
                <h2 className={styles.cardTitle}>Profile overview</h2>
              </div>
            </div>

            <div className={styles.levelTabsRow}>
              <div className={styles.levelTabs}>
                {PROFILE_LEVEL_TABS.map(tab => (
                  <button
                    key={tab.value}
                    type="button"
                    className={`${styles.levelTab} ${
                      activeProfileLevel === tab.value ? styles.levelTabActive : ''
                    }`}
                    onClick={() => setActiveProfileLevel(tab.value)}
                    disabled={
                      (isEditingProfile && tab.value !== activeProfileLevel) || busyRegenerating
                    }
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
              <div className={styles.levelTabActions}>
                {isEditingProfile ? (
                  <>
                    <button
                      type="button"
                      className={styles.sectionButton}
                      onClick={handleCancelProfileEdit}
                      disabled={busyRegenerating}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className={`${styles.sectionButton} ${uiStyles.btnRegenerateAi}`}
                      onClick={handleSaveProfileEdit}
                      disabled={busyRegenerating || saving}
                    >
                      Save
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className={styles.sectionButton}
                    onClick={handleStartProfileEdit}
                    disabled={busyRegenerating || editingDesign}
                  >
                    Edit
                  </button>
                )}
              </div>
            </div>

            <div className={styles.profileBody}>
              {isEditingProfile ? (
                <textarea
                  className={styles.profileTextareaEditable}
                  value={profileDraft}
                  onChange={(event) => setProfileDraft(event.target.value)}
                  rows={16}
                  placeholder="Describe the disciplinary context, course focus, and cohort-specific needs."
                />
              ) : (
                renderProfileBody()
              )}
            </div>
          </section>

        </div>

      </div>
    </div>
  );
}
