// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - types provided by msw at runtime after install
import { http, HttpResponse, delay, passthrough } from 'msw';
import {
  createDefaultDesignConsiderations,
  normalizeDesignConsiderations,
} from '@/app/class-profile/designConsiderations';

/**
 * =========================================================
 * MSW Handlers — Mock Backend
 * ---------------------------------------------------------
 * Mirrors the FastAPI spec
 * Each section below includes:
 *   - SPEC REF: pointing to the original backend module/function.
 *   - TODO backend: reminder of which real service replaces the mock.
 *   - Notes on what data is currently faked so FE/BE know the contract.
 *
 * Sections
 *  1. Utility Types & In-Memory Database (shared mock state)
 *  2. Authentication (/api/users/*, spec lines ~169-270)
 *  3. PDF Highlight Helpers (frontend-only, remove when real service exists)
 *  4. Threaded Scaffold Workflow (/api/generate-scaffolds & /threads/*, spec lines ~965-1420)
 *  5. Perusall Publish (/api/perusall/annotations, spec lines ~1467-1580)
 *  6. Debug Utilities (log viewer/test hook)
 *  7. Reading APIs (/api/readings*, spec lines ~798-963 & 965-1089)
 *  8. Class Profile APIs (/api/class-profiles*, spec lines ~369-775)
 * =========================================================
 */

// ======================================
// Utility Types
// ======================================
type AnnotationScaffold = {
  fragment: string;
  text: string;
  scaffold_id?: string;
};

type InterruptReview = {
  type: 'scaffold_item_review';
  message: string;
  index: number;
  total: number;
  draft_item: AnnotationScaffold;
  expected_resume_schema?: {
    decision: 'approve' | 'reject' | 'edit';
    feedback?: string;
    edited_json?: AnnotationScaffold;
    edit_prompt?: string;
  };
};

type ReviewProgress = {
  review_cursor: number;
  scaffold_final: AnnotationScaffold[];
  scaffold_rejected: Array<{
    item: AnnotationScaffold;
    feedback?: string;
  }>;
  scaffold_draft?: AnnotationScaffold[];
};

type ThreadState = {
  thread_id: string;
  annotation_scaffolds: AnnotationScaffold[];
  review_cursor: number;
  scaffold_final: AnnotationScaffold[];
  scaffold_rejected: Array<{
    item: AnnotationScaffold;
    feedback?: string;
  }>;
  scaffold_draft: AnnotationScaffold[];
  created_at: string;
  updated_at: string;
};

// History event types
type HistoryEvent = {
  event_id: string;
  ts: number;
  actor: 'assistant' | 'user' | 'system';
  action: 'generate' | 'manual_edit' | 'llm_refine' | 'edit' | 'approve' | 'reject' | 'restore';
  state_after: 'draft' | 'edit_pending' | 'approved' | 'rejected';
  version: number;
  payload?: {
    fragment?: string;
    text?: string;
    mode?: 'json' | 'prompt' | 'manual';
    edited_json?: AnnotationScaffold;
    from_version?: number;
    mode_restore?: 'edit_pending' | 'approved' | 'rejected';
    old_text?: string;
    new_text?: string;
    manual_edit?: boolean;
    prompt?: string;
    edit_prompt?: string;
  };
  diff?: {
    [key: string]: { from: string; to: string };
  };
};

type ScaffoldHistory = {
  thread_id: string;
  scaffold_id: string;
  history: HistoryEvent[];
  current: {
    version: number;
    state: 'draft' | 'edit_pending' | 'approved' | 'rejected';
    fragment: string;
    text: string;
  };
};

type MockPerusallAnnotation = {
  rangeType: string;
  rangePage: number;
  rangeStart: number;
  rangeEnd: number;
  fragment: string;
  positionStartX: number;
  positionStartY: number;
  positionEndX: number;
  positionEndY: number;
};

// ======================================
// Mock Data Seeds
// ======================================
const defaultClassProfileText = `This discipline focuses on computing and software engineering, where knowledge is built through logical proof, empirical validation, and formal specification. Learners engage with diverse materials such as code examples, conceptual explanations, research papers, and documentation, using both linear and non-linear reading strategies to understand algorithms, design patterns, and system behavior. Core practices include debugging, testing, verification, code review, and version control, reflecting inquiry processes rooted in problem solving, replication, and collaboration.

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
3. key_terms: Version control, VCS, Git, repository, commit, branch, merge, conflict, working copy, staging area, remote, push, pull, clone, fork, HEAD, main, checkout, status, add, diff, log, rebase.

Design Considerations:
Because knowledge in computing is established via proof, empiricism, and specification, the class should operate like a small software team: use an authentic toolchain (Python 3.x, Git, hosted remotes), reduce setup friction (starter repos, containers), and make inquiry practices (debugging, testing, code review, documentation) explicit, scaffolded, and graded. Materials must support mixed reading patterns—a concise narrative primer, skim-friendly reference sheets and docs links, and executable code examples that invite tracing—while assignments require movement among representations (code, pseudocode, UML/flowcharts, complexity equations, docstrings). Early labs should sequence Git concepts (clone → branch → stage → commit → push/pull → PR/MR → review → merge → conflict resolution), including safe, intentional merge conflicts and CI that runs student-authored unit tests. Emphasize atomic commits with clear messages, branching strategies, and peer-review rubrics tied to structure/function, complexity, maintainability, and HCI concerns. Manage cognitive load with low‑stakes retrieval, Parsons problems, code tracing, pair programming, and test‑driven development. Assess with a blend of autograded correctness, human‑reviewed design/readability, and collaboration evidence (logs, PRs, commit graphs). Ensure inclusivity and reliability: accessible materials, keyboard‑only workflows, reproducible seeds, clear rollback/backup guidance, and norms for respectful collaboration. Conclude modules with reflections linking systems thinking, patterns, and change management to evolving codebases."`;

const defaultClassBackgroundText =
  'Cohort includes graduate students from education disciplines who are strengthening their computational research toolkit.';

const MOCK_INSTRUCTOR_ID = '550e8400-e29b-41d4-a716-446655440000';
const MOCK_COURSE_ID = 'fbaf501d-af97-4286-b5b0-d7b63b500b35';

type MockReadingRecord = {
  id: string;
  instructor_id: string;
  course_id: string;
  title: string;
  file_path: string;
  source_type: 'uploaded' | 'reused';
  created_at: string;
  size_label?: string;
  usage_count: number;
  last_used_at?: string;
  mime_type?: string;
  content_base64?: string;
};

type MockUserRecord = {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: 'instructor' | 'admin';
  createdAt: string;
};

/** -----------------------------
 *  In-memory DB (simple)
 * ------------------------------*/
// ======================================
// In-memory Database
// ======================================
const db = {
  threads: new Map<string, ThreadState>(),
  scaffoldHistories: new Map<string, ScaffoldHistory>(),
  users: new Map<string, MockUserRecord>(),
  classProfiles: new Map<string, {
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
    designConsiderations: ReturnType<typeof createDefaultDesignConsiderations>;
    createdAt: string;
    updatedAt: string;
  }>(),
  readings: new Map<string, MockReadingRecord[]>(),
  sessions: new Map<string, {
    id: string;
    courseId: string;
    instructorId: string;
    readingIds: string[];
    createdAt: string;
  }>(),
};

const userIdIndex = new Map<string, MockUserRecord>();

const serverErrorResponse = (message = 'Internal server error') =>
  HttpResponse.json({ message }, { status: 500 });

const persistUserRecord = (user: MockUserRecord) => {
  db.users.set(user.email, user);
  userIdIndex.set(user.id, user);
};

const getUserByEmail = (email?: string | null): MockUserRecord | null => {
  if (!email) return null;
  return db.users.get(email) ?? null;
};

const getUserById = (userId?: string | null): MockUserRecord | null => {
  if (!userId) return null;
  return userIdIndex.get(userId) ?? null;
};

const sanitizeUser = (user: MockUserRecord) => ({
  id: user.id,
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  name: `${user.firstName} ${user.lastName}`.trim(),
  role: user.role,
  created_at: user.createdAt,
});

const perusallEnv = {
  institution: process.env.PERUSALL_INSTITUTION ?? null,
  token: process.env.PERUSALL_API_TOKEN ?? null,
  courseId: process.env.PERUSALL_COURSE_ID ?? null,
  assignmentId: process.env.PERUSALL_ASSIGNMENT_ID ?? null,
  documentId: process.env.PERUSALL_DOCUMENT_ID ?? null,
  userId: process.env.PERUSALL_USER_ID ?? null,
};

const buildReadingKey = (courseId: string, instructorId: string) =>
  `${courseId}:${instructorId}`;

const listReadingsFor = (courseId: string, instructorId: string): MockReadingRecord[] =>
  db.readings.get(buildReadingKey(courseId, instructorId)) ?? [];

const saveReadingsFor = (
  courseId: string,
  instructorId: string,
  readings: MockReadingRecord[],
) => {
  const key = buildReadingKey(courseId, instructorId);
  const existing = db.readings.get(key) ?? [];
  db.readings.set(key, [...existing, ...readings]);
};

const deleteReadingFor = (courseId: string, instructorId: string, readingId: string) => {
  const key = buildReadingKey(courseId, instructorId);
  const existing = db.readings.get(key);
  if (!existing) return false;
  const next = existing.filter(reading => reading.id !== readingId);
  if (next.length === existing.length) {
    return false;
  }
  db.readings.set(key, next);
  return true;
};

const incrementReadingUsage = (
  courseId: string | null | undefined,
  instructorId: string | null | undefined,
  readingId: string | null | undefined,
) => {
  if (!courseId || !instructorId || !readingId) return;
  const key = buildReadingKey(courseId, instructorId);
  const bucket = db.readings.get(key);
  if (!bucket) return;
  const index = bucket.findIndex(item => item.id === readingId);
  if (index === -1) return;
  const usageCount = (bucket[index].usage_count ?? 0) + 1;
  const nextRecord: MockReadingRecord = {
    ...bucket[index],
    usage_count: usageCount,
    last_used_at: new Date().toISOString(),
  };
  const nextBucket = [...bucket];
  nextBucket[index] = nextRecord;
  db.readings.set(key, nextBucket);
  logEvent('readings:usage', { courseId, instructorId, readingId, usageCount });
};

const toReadingResponse = (reading: MockReadingRecord) => ({
  id: reading.id,
  instructor_id: reading.instructor_id,
  course_id: reading.course_id,
  title: reading.title,
  file_path: reading.file_path,
  source_type: reading.source_type,
  created_at: reading.created_at,
  size_label: reading.size_label,
  usage_count: reading.usage_count,
  last_used_at: reading.last_used_at,
  mime_type: reading.mime_type,
});

const findReadingById = (readingId?: string | null): MockReadingRecord | null => {
  if (!readingId) {
    return null;
  }
  for (const bucket of db.readings.values()) {
    const found = bucket.find(item => item.id === readingId);
    if (found) {
      return found;
    }
  }
  return null;
};

type GenerateMockThreadOptions = {
  courseDescription?: string;
  assignmentDescription?: string;
  readingMaterial?: string;
  incomingThreadId?: string;
};

const generateMockThreadResponse = async ({
  courseDescription = '',
  assignmentDescription = '',
  readingMaterial = '',
  incomingThreadId,
}: GenerateMockThreadOptions) => {
  const finalThreadId =
    incomingThreadId || `ui-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  await delay(200);
  logEvent('generate_scaffold:request', {
    thread_id: finalThreadId,
    course_and_class_description: courseDescription,
    assignment_description: assignmentDescription,
    raw_reading_material: readingMaterial,
  });

  const annotation_scaffolds: AnnotationScaffold[] = demoAnnotationScaffolds.map(item => ({
    fragment: item.fragment,
    text: item.text,
  }));

  const now = new Date().toISOString();
  const nowTs = Date.now() / 1000;

  const scaffoldsWithIds = annotation_scaffolds.map((scaffold, idx) => {
    const scaffoldId = generateScaffoldId();
    const historyKey = `${finalThreadId}:${scaffoldId}`;
    const fragmentLower = scaffold.fragment?.toLowerCase() ?? '';
    if (fragmentLower.includes('conflict occurs') && fragmentLower.includes('manual intervention')) {
      scaffoldRefinementOverrides.set(scaffoldId, llmRefinementMocks.conf01);
    }

    const initialEvent: HistoryEvent = {
      event_id: generateEventId(),
      ts: nowTs + idx * 0.001,
      actor: 'assistant',
      action: 'generate',
      state_after: 'draft',
      version: 1,
      payload: {
        fragment: scaffold.fragment,
        text: scaffold.text,
      },
    };

    const scaffoldHistory: ScaffoldHistory = {
      thread_id: finalThreadId,
      scaffold_id: scaffoldId,
      history: [initialEvent],
      current: {
        version: 1,
        state: 'draft',
        fragment: scaffold.fragment,
        text: scaffold.text,
      },
    };

    db.scaffoldHistories.set(historyKey, scaffoldHistory);

    return { ...scaffold, scaffold_id: scaffoldId };
  });

  const threadState: ThreadState = {
    thread_id: finalThreadId,
    annotation_scaffolds,
    review_cursor: 0,
    scaffold_final: [],
    scaffold_rejected: [],
    scaffold_draft: [...annotation_scaffolds],
    created_at: now,
    updated_at: now,
  };

  (threadState as any).scaffold_ids = scaffoldsWithIds.map(s => s.scaffold_id);
  (threadState as any).scaffold_lookup = scaffoldsWithIds.reduce<Record<string, number>>(
    (acc, scaffold, index) => {
      acc[scaffold.scaffold_id] = index;
      return acc;
    },
    {}
  );

  db.threads.set(finalThreadId, threadState);
  logEvent('generate_scaffold:response', { thread_id: finalThreadId, annotation_scaffolds });

  return {
    threadId: finalThreadId,
    annotation_scaffolds,
    scaffoldsWithIds,
  };
};

const ensureSession = (courseId: string, instructorId: string, requestedId?: string | null) => {
  const baseId =
    requestedId && requestedId.trim().length > 0
      ? requestedId.trim()
      : `session_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  if (!db.sessions.has(baseId)) {
    db.sessions.set(baseId, {
      id: baseId,
      courseId,
      instructorId,
      readingIds: [],
      createdAt: new Date().toISOString(),
    });
  }
  return baseId;
};

// Load real scaffold data from JSON file
const loadRealScaffolds = () => {
  try {
    // Import the JSON data (will be bundled at build time)
    const scaffoldsData = {
      course_id: "0ec4d82d-3484-40a7-a737-a6281d29e974",
      session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
      reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
      scaffolds: [
        {
          id: "2ba28ea9-2b20-4c75-8b1e-e391a1b9868f",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "In summary , drawing on cultural historical activity theory , democratizing forms of inquiry , and a resilience thinking frame - work ( Walker & Salt , 2006 ) , design principles of a social design experiment include the following : ( a ) deep attention to history and historicity, ( b ) a focus on re - mediating activity, ( c ) employing a dynamic model of culture, ( d ) a persistent emphasis on equity, ( e ) an emphasis on resilience and change, and ( f ) an end goal of transformation and sustainability .",
          text: "Consider these six design principles. How could you apply one or two of them as a framework or checklist when designing a Python-based data analysis project for social good in your education research?",
          status: "draft",
        },
        {
          id: "3f5ba8a3-cf65-4b59-b001-5157a1c9ed31",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "Social design methodology combines traditions of design - based research ( Design - Based Research Collective , 2003 ) , for - mative experiments ( Engeström , 2008 ) , and equity - oriented forms of inquiry to develop an approach that seeks to transform social institutions and their practices through mutual relations of exchange with constituent people as valued stakeholders and partners .",
          text: "This methodology emphasizes iterative design and 'mutual relations of exchange.' How does this compare to agile or iterative software development methodologies in computational practice, particularly when collaborating on Python projects?",
          status: "draft",
        },
        {
          id: "958c7d53-18ea-4592-9396-4b0f38113278",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "I discuss an approach to design - based research , social design experiments , that privileges a social scientific inquiry organized around a new sociocultural imagination , with an expansive understanding of how people can learn resonantly , as they live together productively and interculturally .",
          text: "What does it mean for a 'social scientific inquiry' to be 'organized around a new sociocultural imagination'? How might this concept influence how you frame a data analysis problem in education using Python?",
          status: "draft",
        },
        {
          id: "97d80b47-75cd-4008-a299-76dcbcfd8039",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "The paradox of efficiency and optimization from this perspective is that \" optimization ( in the sense of maximizing efficiency through tight control ) is a large part of the problem , not the solution \" ( Walker & Salt , 2006 , p . 141 ) . This certainly characterizes current educational reform in which schools , teach - ers , and students increasingly operate in tight - tight cultures , that is , cultures with top - down control and few degrees of freedom for teachers and students ( Gutiérrez , 2004 ) , cultures that under - mine resilience and sustainability .",
          text: "In computational work, efficiency is often a goal. How might prioritizing 'resilience' or 'adaptability' over strict 'efficiency' change how you design a Python program or data analysis workflow for education research?",
          status: "draft",
        },
        {
          id: "a4f72df2-32db-4b93-9ac3-4196c1e41cf2",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "My interest in the notion of resilience , however , lies in its potential as a design principle for creating and sustain - ing learning environments where mind in action is privileged rather than mind as simply bounded in the individual .",
          text: "Consider the distinction between 'mind in action' and 'mind as simply bounded in the individual.' How does this relate to collaborative programming or leveraging shared computational resources (like libraries) in Python?",
          status: "draft",
        },
        {
          id: "c04224d7-4051-4056-b237-2b373ff1ccff",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "I turn to the work of Marx Wartofsky ( 1979 ) to understand the impor - tance of a historical epistemology replacing traditional philosophical characterizations of epistemology ( e . g . , realist , empiricist ) as ahistorical and universal . \" The structures of per - ception are a historical variant \" — Wartofsky argues — \" they change in relation to historical changes in the modes of human action \" ( Wartofsky , 1979 , p . 189 ) .",
          text: "Wartofsky argues that 'perception has a history.' How does understanding the historical context and 'provenance' of a dataset you might analyze with Python influence your interpretation of the data and the models you build?",
          status: "draft",
        },
        {
          id: "edfcf532-b907-445f-9ec2-053cb42f39ac",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "In 1921 , Charles T upper began the reform of education in Miami to address the \" Mexican problem \" ( T upper , 1923 ) . Appointed by the first Miami School Board , T upper \" convinced the school board to establish a segregated elementary school for the Mexican children solely on the basis of intelligence tests ( Marin , 2005 , p . 41 ) .",
          text: "This historical example shows intelligence tests misused to justify segregation. As you learn Python for education data analysis, how can you critically examine datasets and algorithms to prevent perpetuating biases or inequalities?",
          status: "draft",
        },
        {
          id: "f9c07c32-1762-4256-84d8-20d37903ffce",
          session_id: "33bb55af-d090-454e-9b0a-2e985b8a0742",
          reading_id: "7800c7e2-837a-49dc-84f3-dfb8eb959a05",
          fragment: "This article is about designing for educational possibilities — designs that in their inception, social organization, and implementation squarely address issues of cultural diversity, social inequality, and robust learning. For this discussion, I draw, in part, on a human science of learning framework to discuss the development of sustainable and resilient learning ecologies for students from nondominant communities.",
          text: "The author introduces 'resilient learning ecologies.' How might you conceptualize a 'learning ecology' in the context of a computational research toolkit or a Python-based workflow? What elements would make it 'sustainable and resilient'?",
          status: "draft",
        },
      ],
    };

    const { course_id, session_id, reading_id, scaffolds } = scaffoldsData;
    const threadId = session_id; // Use session_id as threadId

    // Convert scaffolds to AnnotationScaffold format
    const annotation_scaffolds: AnnotationScaffold[] = scaffolds.map((s) => ({
      fragment: s.fragment,
      text: s.text,
    }));

    const now = new Date().toISOString();
    const nowTs = Date.now() / 1000;

    // Create scaffold histories and IDs
    const scaffoldsWithIds = scaffolds.map((scaffold, idx) => {
      const scaffoldId = scaffold.id;
      const historyKey = `${threadId}:${scaffoldId}`;

      const initialState = scaffold.status === 'accepted' ? 'approved' : 
                          scaffold.status === 'rejected' ? 'rejected' : 'draft';

      const initialEvent: HistoryEvent = {
        event_id: generateEventId(),
        ts: nowTs + idx * 0.001,
        actor: 'assistant',
        action: 'generate',
        state_after: initialState === 'approved' ? 'approved' : initialState === 'rejected' ? 'rejected' : 'draft',
        version: 1,
        payload: {
          fragment: scaffold.fragment,
          text: scaffold.text,
        },
      };

      const scaffoldHistory: ScaffoldHistory = {
        thread_id: threadId,
        scaffold_id: scaffoldId,
        history: [initialEvent],
        current: {
          version: 1,
          state: initialState === 'approved' ? 'approved' : initialState === 'rejected' ? 'rejected' : 'draft',
          fragment: scaffold.fragment,
          text: scaffold.text,
        },
      };

      db.scaffoldHistories.set(historyKey, scaffoldHistory);

      return { ...scaffold, scaffold_id: scaffoldId };
    });

    // Create thread state
    const threadState: ThreadState = {
      thread_id: threadId,
      annotation_scaffolds,
      review_cursor: 0,
      scaffold_final: scaffolds.filter(s => s.status === 'accepted').map(s => ({
        fragment: s.fragment,
        text: s.text,
        scaffold_id: s.id,
      })),
      scaffold_rejected: scaffolds.filter(s => s.status === 'rejected').map(s => ({
        item: {
          fragment: s.fragment,
          text: s.text,
          scaffold_id: s.id,
        },
        feedback: undefined,
      })),
      scaffold_draft: scaffolds.filter(s => s.status === 'draft').map(s => ({
        fragment: s.fragment,
        text: s.text,
        scaffold_id: s.id,
      })),
      created_at: now,
      updated_at: now,
    };

    const scaffoldIds = scaffoldsWithIds.map(s => s.scaffold_id);
    (threadState as any).scaffold_ids = scaffoldIds;
    (threadState as any).scaffold_lookup = scaffoldsWithIds.reduce<Record<string, number>>(
      (acc, scaffold, index) => {
        acc[scaffold.scaffold_id] = index;
        return acc;
      },
      {}
    );

    db.threads.set(threadId, threadState);

    // Ensure session exists
    ensureSession(course_id, MOCK_INSTRUCTOR_ID, session_id);
    recordSessionReading(session_id, reading_id);

    console.log('[MSW] Loaded real scaffolds:', {
      threadId,
      courseId: course_id,
      sessionId: session_id,
      readingId: reading_id,
      scaffoldCount: scaffolds.length,
      scaffoldIds: scaffoldIds,
      historyKeys: Array.from(db.scaffoldHistories.keys()),
    });
    
    // Verify data is loaded
    const verifyThread = db.threads.get(threadId);
    if (verifyThread) {
      console.log('[MSW] Verification - Thread exists:', {
        threadId,
        scaffoldIds: (verifyThread as any).scaffold_ids,
        annotationScaffoldsCount: verifyThread.annotation_scaffolds.length,
      });
    } else {
      console.error('[MSW] ERROR - Thread not found after loading!');
    }

    return true;
  } catch (error) {
    console.warn('[MSW] Failed to load real scaffolds:', error);
    return false;
  }
};

// Initialize real scaffolds on module load
if (typeof window !== 'undefined') {
  // Load in browser environment
  loadRealScaffolds();
}

const recordSessionReading = (sessionId: string, readingId: string) => {
  const session = db.sessions.get(sessionId);
  if (!session) {
    return;
  }
  if (!session.readingIds.includes(readingId)) {
    session.readingIds.push(readingId);
  }
};


const normalizeDisciplineInfo = (
  disciplineInfo: Partial<{
    disciplineName: string;
    department: string;
    fieldDescription: string;
    field?: string;
  }> = {}
) => ({
  disciplineName: disciplineInfo.disciplineName ?? disciplineInfo.field ?? '',
  department: disciplineInfo.department ?? '',
  fieldDescription: disciplineInfo.fieldDescription ?? '',
});

const normalizeCourseInfo = (
  courseInfo: Partial<{
    courseName: string;
    courseCode: string;
    description: string;
    credits: string;
    prerequisites: string;
    learningObjectives: string;
    assessmentMethods: string;
    deliveryMode: string;
  }> = {}
) => ({
  courseName: courseInfo.courseName ?? '',
  courseCode: courseInfo.courseCode ?? '',
  description: courseInfo.description ?? '',
  credits: courseInfo.credits ?? '',
  prerequisites: courseInfo.prerequisites ?? '',
  learningObjectives: courseInfo.learningObjectives ?? '',
  assessmentMethods: courseInfo.assessmentMethods ?? '',
  deliveryMode: courseInfo.deliveryMode ?? '',
});

const normalizeClassInfo = (
  classInfo: Partial<{
    semester: string;
    year: string;
    section: string;
    meetingDays: string;
    meetingTime: string;
    location: string;
    enrollment: string;
    background: string;
    priorKnowledge: string;
  }> = {}
) => ({
  semester: classInfo.semester ?? '',
  year: classInfo.year ?? '',
  section: classInfo.section ?? '',
  meetingDays: classInfo.meetingDays ?? '',
  meetingTime: classInfo.meetingTime ?? '',
  location: classInfo.location ?? '',
  enrollment: classInfo.enrollment ?? '',
  background: classInfo.background ?? defaultClassBackgroundText,
  priorKnowledge: classInfo.priorKnowledge ?? '',
});

const mapIncomingDisciplineInfo = (
  input: Record<string, unknown> | undefined
) => ({
  disciplineName:
    (typeof input?.discipline_name === 'string' ? input?.discipline_name : undefined) ??
    (typeof input?.disciplineName === 'string' ? input.disciplineName : undefined) ??
    '',
  department:
    (typeof input?.department === 'string' ? input.department : undefined) ??
    '',
  fieldDescription:
    (typeof input?.field_description === 'string' ? input.field_description : undefined) ??
    (typeof input?.fieldDescription === 'string' ? input.fieldDescription : undefined) ??
    '',
});

const mapIncomingCourseInfo = (input: Record<string, unknown> | undefined) => ({
  courseName:
    (typeof input?.course_name === 'string' ? input.course_name : undefined) ??
    (typeof input?.courseName === 'string' ? input.courseName : undefined) ??
    '',
  courseCode:
    (typeof input?.course_code === 'string' ? input.course_code : undefined) ??
    (typeof input?.courseCode === 'string' ? input.courseCode : undefined) ??
    '',
  description:
    (typeof input?.description === 'string' ? input.description : undefined) ??
    '',
  credits:
    (typeof input?.credits === 'string' ? input.credits : undefined) ?? '',
  prerequisites:
    (typeof input?.prerequisites === 'string' ? input.prerequisites : undefined) ??
    '',
  learningObjectives:
    (typeof input?.learning_objectives === 'string'
      ? input.learning_objectives
      : undefined) ??
    (typeof input?.learningObjectives === 'string'
      ? input.learningObjectives
      : undefined) ??
    '',
  assessmentMethods:
    (typeof input?.assessment_methods === 'string'
      ? input.assessment_methods
      : undefined) ??
    (typeof input?.assessmentMethods === 'string'
      ? input.assessmentMethods
      : undefined) ??
    '',
  deliveryMode:
    (typeof input?.delivery_mode === 'string' ? input.delivery_mode : undefined) ??
    (typeof input?.deliveryMode === 'string' ? input.deliveryMode : undefined) ??
    '',
});

const mapIncomingClassInfo = (input: Record<string, unknown> | undefined) => ({
  semester:
    (typeof input?.semester === 'string' ? input.semester : undefined) ?? '',
  year: (typeof input?.year === 'string' ? input.year : undefined) ?? '',
  section:
    (typeof input?.section === 'string' ? input.section : undefined) ?? '',
  meetingDays:
    (typeof input?.meeting_days === 'string' ? input.meeting_days : undefined) ??
    (typeof input?.meetingDays === 'string' ? input.meetingDays : undefined) ??
    '',
  meetingTime:
    (typeof input?.meeting_time === 'string' ? input.meeting_time : undefined) ??
    (typeof input?.meetingTime === 'string' ? input.meetingTime : undefined) ??
    '',
  location:
    (typeof input?.location === 'string' ? input.location : undefined) ?? '',
  enrollment:
    (typeof input?.enrollment === 'string' ? input.enrollment : undefined) ??
    '',
  background:
    (typeof input?.background === 'string' ? input.background : undefined) ??
    defaultClassBackgroundText,
  priorKnowledge:
    (typeof input?.prior_knowledge === 'string' ? input.prior_knowledge : undefined) ??
    (typeof input?.priorKnowledge === 'string' ? input.priorKnowledge : undefined) ??
    '',
});

const mapIncomingDesignConsiderations = (
  input: Record<string, unknown> | undefined
) =>
  normalizeDesignConsiderations(
    (input ?? {}) as Partial<ReturnType<typeof createDefaultDesignConsiderations>>
  );

// ======================================
// Debug log store to inspect payloads received by mock server
// ======================================
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const debugLogs: Array<{ time: string; event: string; payload?: any }> = [];
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function logEvent(event: string, payload?: any) {
  debugLogs.push({ time: new Date().toISOString(), event, payload });
  if (debugLogs.length > 200) debugLogs.shift();
}

type RegisterPayload = {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  role?: 'instructor' | 'admin';
};

const handleUserRegister = (payload: unknown) => {
  const safePayload = (payload ?? {}) as RegisterPayload;
  const { email, password, firstName, lastName, role } = safePayload;
  if (!email || !password || !firstName || !lastName) {
    return HttpResponse.json({ message: 'All fields are required' }, { status: 400 });
  }
  if (password.length < 6) {
    return HttpResponse.json(
      { message: 'Password must be at least 6 characters' },
      { status: 400 }
    );
  }
  if (db.users.has(email)) {
    return HttpResponse.json(
      { message: 'User with this email already exists' },
      { status: 409 }
    );
  }
  const user: MockUserRecord = {
    id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    email,
    password,
    firstName,
    lastName,
    role: role ?? 'instructor',
    createdAt: new Date().toISOString(),
  };
  persistUserRecord(user);
  logEvent('auth:signup', { email, userId: user.id });
  const token = generateToken(user.id);
  return HttpResponse.json({
    message: 'Account created successfully',
    token,
    user: sanitizeUser(user),
  });
};

type LoginPayload = { email?: string; password?: string };

const handleUserLogin = (payload: unknown) => {
  const safePayload = (payload ?? {}) as LoginPayload;
  const { email, password } = safePayload;
  if (!email || !password) {
    return HttpResponse.json({ message: 'Email and password are required' }, { status: 400 });
  }
  ensureSeedUser();
  const user = getUserByEmail(email);
  if (!user || user.password !== password) {
    return HttpResponse.json({ message: 'Invalid email or password' }, { status: 401 });
  }
  logEvent('auth:signin', { email, userId: user.id });
  const token = generateToken(user.id);
  return HttpResponse.json({
    message: 'Sign in successful',
    token,
    user: sanitizeUser(user),
  });
};

// Counters to produce predictable IDs
let eventCounter = 1;

// Helper to generate event IDs
function generateEventId(): string {
  return `evt_${String(eventCounter++).padStart(6, '0')}`;
}

// Helper to generate scaffold IDs
function generateScaffoldId(): string {
  return `scf_${Math.random().toString(36).substr(2, 8)}`;
}

// Helper to create diff between two scaffolds
function createDiff(from: AnnotationScaffold, to: AnnotationScaffold): { [key: string]: { from: string; to: string } } {
  const diff: { [key: string]: { from: string; to: string } } = {};

  if (from.fragment !== to.fragment) {
    diff.fragment = { from: from.fragment, to: to.fragment };
  }

  if (from.text !== to.text) {
    diff.text = { from: from.text, to: to.text };
  }

  return diff;
}

function summarizeHistory(
  events: HistoryEvent[]
): Array<{ ts: number; action: string; old_text?: string; new_text?: string; prompt?: string }> {
  return events
    .filter(
      (event) =>
        event.actor === 'user' &&
        (event.action === 'approve' ||
          event.action === 'reject' ||
          event.action === 'edit' ||
          event.action === 'llm_refine' ||
          event.action === 'manual_edit' ||
          event.action === 'restore')
    )
    .map((event) => {
      const summary: { ts: number; action: string; old_text?: string; new_text?: string; prompt?: string } = {
        ts: event.ts,
        action: event.action,
      };

      if (event.action === 'manual_edit') {
        summary.old_text = event.payload?.old_text;
        summary.new_text = event.payload?.new_text ?? event.payload?.text;
      }
      if (event.action === 'llm_refine') {
        summary.prompt = event.payload?.prompt ?? event.payload?.edit_prompt;
        summary.old_text = event.payload?.old_text;
        summary.new_text = event.payload?.new_text ?? event.payload?.text;
      }

      return summary;
    });
}

/** -----------------------------
 *  Helpers for responses
 * ------------------------------*/
// Safer helper: allow undefined and ensure object spread
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const ok = (data?: any) => HttpResponse.json({ status: 'success', ...(data || {}) });
const err = (code: string, message: string, httpStatus = 400) =>
  HttpResponse.json({ status: 'error', code, message }, { status: httpStatus });

/** -----------------------------
 *  Compatibility: Keep your previous mock endpoints
 * ------------------------------*/


const demoAnnotationScaffolds: AnnotationScaffold[] = [
  {
    fragment:
      'Notice that the commit and update commands only move changes between the working copy and the local repository, without affecting any other repository. By contrast, the push and fetch commands move changes between the local repository and the central repository, without affecting your working copy. The git pull command is equivalent to git fetch then git update.',
    text:
      'Clarification Question: How do `commit` and `update` differ from `push` and `fetch` in terms of *where* changes are moved? Try to explain the distinct roles of the working copy, local, and central repositories.',
  },
  {
    fragment:
      "(Mercurial's naming is more logical: Mercurial's pull operation is like git's fetch, and Mercurial's fetch operation is like git's pull; that is, hg fetch performs both hg pull and hg update.)",
    text:
      "Clarification Question: This section introduces Mercurial's commands. How might understanding these differences help you remember or distinguish the Git commands (`fetch`, `pull`, `update`)?",
  },
  {
    fragment: 
    "In a centralized version control system, you can update (for example, svn update) at any moment, even if you have locally-uncommitted changes. The version control system merges your uncompleted changes in the working copy with the ones in the repository. This may force you to resolve conﬂicts. It also loses the exact set of edits you had made, since afterward you only have the combined version. The implicit merging that a centralized version control system performs when you update is a common source of confusion and mistakes.",
    text: 
    "Clarification Question: How does the 'implicit merging' described here for centralized VCS differ from how Git handles changes and merges? Why might this implicit approach lead to confusion and mistakes?",
  },
  {
    fragment:
      'A conflict occurs when two different users make simultaneous, different changes to the same line of a file. In this case, the version control system cannot automatically decide which of the two edits to use (or a combination of them, or neither!). Manual intervention is required to resolve the conflict.',
    text:
      "Concept Linking Prompt: Why is understanding 'conflict' and 'manual intervention' a foundational concept in version control? Think about the challenges of collaborative coding without it.",
  },
];

// Example backend-provided queries (reuse scaffold fragments for highlight search)
const mockQueries = demoAnnotationScaffolds.map((item) => item.fragment);

const manualEditMocks: Record<string, string> = {
  diag01:
    'Representation Support: Sketch two labeled areas—Working Copy (red) and Repository (blue). Use purple to mark any operations that affect both. Add a small legend explaining the colors. If helpful, draw arrows to show the direction of change between the working copy and the repository.',
};

const llmRefinementMocks: Record<string, string> = {
  conf01:
    "Why are merge conflicts—and the need for manual intervention to resolve them—essential to collaborative coding, and what problems would teams face without understanding them?",
};

const scaffoldRefinementOverrides = new Map<string, string>();

const llmRefinementPromptMocks: Record<string, string> = {
  "Rewrite the text as a single, beginner-friendly question (<= 30 words) that links 'conflict' to the need for manual intervention in collaborative coding. Avoid jargon; keep it clear and direct.":
    "Why are merge conflicts—and the need for manual intervention to resolve them—essential to collaborative coding, and what problems would teams face without understanding them?",
};

function resolveManualMock(scaffoldId: string, fragment: string): string | undefined {
  if (manualEditMocks[scaffoldId]) return manualEditMocks[scaffoldId];
  const lowerFragment = fragment.toLowerCase();
  if (lowerFragment.includes('representation support') && lowerFragment.includes('working copy')) {
    return manualEditMocks.diag01;
  }
  return undefined;
}

function resolveLLMRefinementMock(scaffoldId: string, fragment: string): string | undefined {
  if (scaffoldRefinementOverrides.has(scaffoldId)) {
    return scaffoldRefinementOverrides.get(scaffoldId);
  }
  if (llmRefinementMocks[scaffoldId]) return llmRefinementMocks[scaffoldId];
  const lowerFragment = fragment.toLowerCase();
  if (lowerFragment.includes('conflict occurs') && lowerFragment.includes('manual intervention')) {
    return llmRefinementMocks.conf01;
  }
  return undefined;
}

// Helper function to generate mock JWT token
function generateToken(userId: string): string {
  return `mock_token_${userId}_${Date.now()}`;
}

const TEST_USER_ID = 'test_user_1';
const TEST_USER_EMAIL = 'test@example.com';

const buildSeedUser = (): MockUserRecord => ({
  id: TEST_USER_ID,
  email: TEST_USER_EMAIL,
  password: 'password123',
  firstName: 'John',
  lastName: 'Doe',
  role: 'instructor',
  createdAt: new Date().toISOString(),
});

const ensureSeedUser = () => {
  if (getUserByEmail(TEST_USER_EMAIL)) {
    return;
  }
  persistUserRecord(buildSeedUser());
};

ensureSeedUser();

/** -----------------------------
 *  Handlers
 * ------------------------------*/
export const handlers = [

  // ======================================
  // Authentication (spec parity with main.py /api/users/*)
  // ======================================
  /**
   * TODO backend: replace with user_service (create_user, authenticate_user, get_user_by_*).
   * Data mocked:
   *   - Stores users in-memory (`db.users` + `userIdIndex`).
   *   - Passwords remain plaintext; tokens are `mock_token_<id>`.
   *   - Legacy `/api/auth/*` endpoints remain for existing UI, but new FE should call `/api/users/*`.
   */
  // Legacy endpoints used by current UI
  http.post('/api/auth/signup', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      return handleUserRegister(body);
    } catch {
      return serverErrorResponse();
    }
  }),
  http.post('/api/auth/signin', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      return handleUserLogin(body);
    } catch {
      return serverErrorResponse();
    }
  }),
  // Spec-aligned endpoints for FastAPI backend integration
  http.post('/api/users/register', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      return handleUserRegister(body);
    } catch {
      return serverErrorResponse();
    }
  }),
  http.post('/api/users/login', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      return handleUserLogin(body);
    } catch {
      return serverErrorResponse();
    }
  }),
  http.get('/api/users/:userId', ({ params }) => {
    const { userId } = params as { userId?: string };
    const user = getUserById(userId);
    if (!user) {
      return HttpResponse.json(
        { message: `User ${userId ?? ''} not found` },
        { status: 404 }
      );
    }
    return HttpResponse.json(sanitizeUser(user));
  }),
  http.get('/api/users/email/:email', ({ params }) => {
    const { email } = params as { email?: string };
    const decodedEmail = email ? decodeURIComponent(email) : '';
    const user = getUserByEmail(decodedEmail);
    if (!user) {
      return HttpResponse.json(
        { message: `User with email ${decodedEmail} not found` },
        { status: 404 }
      );
    }
    return HttpResponse.json(sanitizeUser(user));
  }),

  // ======================================
  // PDF Highlight Utilities (frontend-only helpers, no spec equivalent)
  // TODO backend: provide real highlight service or remove once unused.
  // ======================================
  /**
   * SPEC REF: none (these endpoints exist purely to unblock PDF prototype work).
   * TODO backend: either expose real highlight-queue APIs or delete these routes.
   * Notes:
   *   - `/api/highlight-queries` echoes canned scaffolds.
   *   - `/api/highlight-report` + `/api/highlight-results` just log payloads.
   *   - `/api/upload/pdf` pretends to accept a Blob and returns a fake fileId.
   */
  // Backend provides highlight queries (sentences)
  http.get('/api/highlight-queries', () => HttpResponse.json({ queries: mockQueries })),

  // Frontend reports computed highlight coordinates
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http.post('/api/highlight-report', async ({ request }: any) => {
    try {
      const data = await request.json();
      logEvent('highlight-report', data);
      return HttpResponse.json({ status: 'ok', received: Array.isArray(data) ? data.length : 0 });
    } catch {
      return HttpResponse.json({ status: 'bad_request' }, { status: 400 });
    }
  }),
  
  // Frontend reports highlight coordinates with RESTful path
  http.post('/api/courses/*/sessions/*/readings/*/scaffolds/highlight-report', async ({ request }) => {
    try {
      const data = await request.json() as { coords?: unknown[] };
      logEvent('highlight-report', data);
      return HttpResponse.json({ status: 'ok', received: Array.isArray(data?.coords) ? data.coords.length : 0 });
    } catch {
      return HttpResponse.json({ status: 'bad_request' }, { status: 400 });
    }
  }),

  // GET: backend-provided queries to search in the PDF text layer
  http.get('/api/queries', () => {
    return HttpResponse.json({ queries: mockQueries });
  }),

  // POST: receive highlight results from frontend (echo back count)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http.post('/api/highlight-results', async ({ request }: any) => {
    const body = await request.json().catch(() => ({}));
    const records = Array.isArray(body?.records) ? body.records : [];
    return HttpResponse.json({ ok: true, received: records.length });
  }),

  // GET: mock highlights endpoint (fallback for PdfPreview)
  http.get('/api/mock-highlights', () => {
    // Return empty highlights array - frontend will handle highlighting locally
    return HttpResponse.json({ highlights: [] });
  }),

  // Example: upload PDF (mock)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  http.post('/api/upload/pdf', async ({ request }: any) => {
    return HttpResponse.json({ fileId: 'mock-file-id', size: (await request.blob()).size });
  }),

  // ======================================
  // Thread-Based Scaffold Workflow (spec parity: main.py /api/generate-scaffolds & review endpoints)
  // TODO backend: hook up to session_service + workflow pipeline instead of in-memory thread map.
  // ====================================== 
  /**
   * TODO backend:
   *   - Persist sessions via `session_service` (create_session, save_session_item, add_reading_to_session).
   *   - Use actual workflow graph (material → focus → scaffold) instead of `generateMockThreadResponse`.
   * Notes:
   *   - `ensureSession` + `recordSessionReading` simulate session IDs.
   *   - `/threads/:thread_id/*` endpoints proxy the review UX but keep everything in memory.
   *   - Once backend ships, remove `/api/generate_scaffold` legacy route.
   */

  // 1) Generate Scaffolds (Updated to match new spec)
  http.post('/api/generate_scaffold', async ({ request }) => {
    console.log('[MSW] Handler matched for POST /api/generate_scaffold');
    try {
      const body = await request.json().catch(() => ({}));
      const {
        course_and_class_description,
        assignment_description,
        raw_reading_material,
        thread_id,
      } = body as {
        course_and_class_description?: string;
        assignment_description?: string;
        raw_reading_material?: string;
        thread_id?: string;
      };

      if (
        course_and_class_description === undefined ||
        assignment_description === undefined ||
        raw_reading_material === undefined
      ) {
        console.log('[MSW] Validation failed - missing required fields');
        return err(
          'VALIDATION_ERROR',
          'course_and_class_description, assignment_description, and raw_reading_material are required'
        );
      }

      const { scaffoldsWithIds, threadId } = await generateMockThreadResponse({
        courseDescription: course_and_class_description ?? '',
        assignmentDescription: assignment_description ?? '',
        readingMaterial: raw_reading_material ?? '',
        incomingThreadId: thread_id,
      });

      return HttpResponse.json({
        annotation_scaffolds: scaffoldsWithIds.map(({ scaffold_id, ...rest }) => ({
          ...rest,
          scaffold_id,
        })),
        thread_id: threadId,
      });
    } catch (error) {
      console.error('[MSW] Error in generate_scaffold:', error);
      return err(
        'INTERNAL_ERROR',
        `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }),

  // RESTful path for generating scaffolds
  // DISABLED: Let requests pass through to real Gemini API
  // Set USE_MOCK_GENERATE_SCAFFOLDS to true to re-enable mock generation
  ...(process.env.USE_MOCK_GENERATE_SCAFFOLDS === 'true' ? [
  http.post('/api/courses/*/sessions/*/readings/*/scaffolds/generate', async ({ request }) => {
    console.log('[MSW] ===== Generate scaffolds (RESTful path) =====');
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    // Path structure: ['api', 'courses', courseId, 'sessions', sessionId, 'readings', readingId, 'scaffolds', 'generate']
    // Index:           0      1         2         3          4         5          6         7           8
    // Example: ['api', 'courses', '0ec4d82d-...', 'sessions', '17d9eba7-...', 'readings', '7800c7e2-...', 'scaffolds', 'generate']
    const courseId = pathParts[2];   // 'courses' is at index 1, courseId is at index 2
    const sessionId = pathParts[4];  // 'sessions' is at index 3, sessionId is at index 4
    const readingId = pathParts[6];   // 'readings' is at index 5, readingId is at index 6
    
    console.log('[MSW] Request URL:', request.url);
    console.log('[MSW] Path parts:', pathParts);
    console.log('[MSW] Extracted IDs from URL:', { courseId, sessionId, readingId });
    
    try {
      const body = await request.json().catch(() => ({}));
      const anyBody = body as Record<string, any>;
      const rawInstructorId = anyBody.instructor_id;
      const instructorId =
        typeof rawInstructorId === 'string' && rawInstructorId.trim().length > 0
          ? rawInstructorId.trim()
          : MOCK_INSTRUCTOR_ID;

      // Check if real scaffolds are already loaded for this session
      // First, try to find thread by sessionId
      let existingThread = db.threads.get(sessionId);
      
      // If not found, check if we have the real data loaded (it uses session_id as threadId)
      if (!existingThread) {
        console.log('[MSW] Thread not found by sessionId, checking all threads...');
        console.log('[MSW] Available thread IDs:', Array.from(db.threads.keys()));
        
        // Try to find thread that matches the readingId or has scaffolds
        for (const [threadId, thread] of db.threads.entries()) {
          if (thread.annotation_scaffolds && thread.annotation_scaffolds.length > 0) {
            console.log('[MSW] Found thread with scaffolds:', threadId);
            existingThread = thread;
            // Update sessionId to match the threadId if it's the real data
            if (threadId === '33bb55af-d090-454e-9b0a-2e985b8a0742') {
              console.log('[MSW] Using real data thread, sessionId will be:', threadId);
              // Don't change sessionId, but use the thread's data
            }
            break;
          }
        }
      }
      
      if (existingThread && existingThread.annotation_scaffolds.length > 0) {
        console.log('[MSW] Using existing scaffolds from loaded data, threadId:', (existingThread as any).thread_id);
        const scaffoldIds = (existingThread as any).scaffold_ids || [];
        const fullScaffolds = scaffoldIds.map((scaffoldId: string, index: number) => {
          const scaffoldData = existingThread.annotation_scaffolds[index];
          const threadId = (existingThread as any).thread_id || sessionId;
          const historyKey = `${threadId}:${scaffoldId}`;
          const scaffoldHistory = db.scaffoldHistories.get(historyKey);
          const historySummary = scaffoldHistory ? summarizeHistory(scaffoldHistory.history) : [];
          
          return {
            id: scaffoldId,
            fragment: scaffoldData?.fragment || '',
            text: scaffoldData?.text || '',
            status: scaffoldHistory?.current.state === 'approved' ? 'approved' : 
                   scaffoldHistory?.current.state === 'rejected' ? 'rejected' : 'pending',
            history: historySummary,
          };
        }).filter((s: any) => s.fragment && s.text);

        // Use the thread's sessionId if available, otherwise use the extracted sessionId
        const actualSessionId = (existingThread as any).thread_id || sessionId;
        console.log('[MSW] Returning scaffolds, using sessionId:', actualSessionId);

        return HttpResponse.json({
          session_id: actualSessionId,
          reading_id: readingId,
          pdf_url: `https://example.com/pdf/${readingId}.pdf`,
          annotation_scaffolds_review: fullScaffolds,
        });
      }

      // If no existing scaffolds, use the real loaded data or generate new ones
      console.log('[MSW] No existing scaffolds, loading real data or generating new ones...');
      
      // Try to load real scaffolds if not already loaded
      if (db.threads.size === 0) {
        console.log('[MSW] No threads found, loading real scaffolds...');
        loadRealScaffolds();
      }
      
      // Check again after loading - look for any thread with scaffolds
      let threadAfterLoad: ThreadState | undefined;
      for (const [threadId, thread] of db.threads.entries()) {
        if (thread.annotation_scaffolds && thread.annotation_scaffolds.length > 0) {
          threadAfterLoad = thread;
          console.log('[MSW] Found thread after loading:', threadId);
          break;
        }
      }
      
      if (threadAfterLoad && threadAfterLoad.annotation_scaffolds.length > 0) {
        console.log('[MSW] Using real scaffolds after loading');
        const scaffoldIds = (threadAfterLoad as any).scaffold_ids || [];
        const fullScaffolds = scaffoldIds.map((scaffoldId: string, index: number) => {
          const scaffoldData = threadAfterLoad.annotation_scaffolds[index];
          const threadId = (threadAfterLoad as any).thread_id;
          const historyKey = `${threadId}:${scaffoldId}`;
          const scaffoldHistory = db.scaffoldHistories.get(historyKey);
          const historySummary = scaffoldHistory ? summarizeHistory(scaffoldHistory.history) : [];
          
          return {
            id: scaffoldId,
            fragment: scaffoldData?.fragment || '',
            text: scaffoldData?.text || '',
            status: scaffoldHistory?.current.state === 'approved' ? 'approved' : 
                   scaffoldHistory?.current.state === 'rejected' ? 'rejected' : 'pending',
            history: historySummary,
          };
        }).filter((s: any) => s.fragment && s.text);

        const actualSessionId = (threadAfterLoad as any).thread_id || sessionId;
        console.log('[MSW] Returning scaffolds after load, using sessionId:', actualSessionId);

        return HttpResponse.json({
          session_id: actualSessionId,
          reading_id: readingId,
          pdf_url: `https://example.com/pdf/${readingId}.pdf`,
          annotation_scaffolds_review: fullScaffolds,
        });
      }

      // Fallback: generate new mock scaffolds
      console.log('[MSW] Generating new mock scaffolds...');
      ensureSession(courseId, instructorId, sessionId);
      recordSessionReading(sessionId, readingId);
      incrementReadingUsage(courseId, instructorId, readingId);

      const { scaffoldsWithIds, threadId } = await generateMockThreadResponse({
        courseDescription: 'Reading session',
        assignmentDescription: 'Assignment description',
        readingMaterial: `Reading payload for ${readingId}`,
        incomingThreadId: sessionId,
      });

      const fullScaffolds = scaffoldsWithIds.map(({ scaffold_id, ...rest }) => {
        const historyKey = `${threadId}:${scaffold_id}`;
        const scaffoldHistory = db.scaffoldHistories.get(historyKey);
        const historySummary = scaffoldHistory ? summarizeHistory(scaffoldHistory.history) : [];
        
        return {
          id: scaffold_id,
          fragment: rest.fragment,
          text: rest.text,
          status: scaffoldHistory?.current.state === 'approved' ? 'approved' : 
                 scaffoldHistory?.current.state === 'rejected' ? 'rejected' : 'pending',
          history: historySummary,
        };
      });

        // Return a relative API URL that frontend can use to load the PDF
        // If this fails, PdfPreview will use readingId fallback
        const pdfUrl = `/api/readings/${readingId}/content`;
        
        return HttpResponse.json({
          session_id: sessionId,
          reading_id: readingId,
          pdf_url: pdfUrl,
          annotation_scaffolds_review: fullScaffolds,
        });
    } catch (error) {
      console.error('[MSW] Error in POST /api/courses/*/sessions/*/readings/*/scaffolds/generate', error);
      return err(
        'INTERNAL_ERROR',
        `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }),
  ] : []),
  // END DISABLED: Generate scaffolds handler - requests will use real Gemini API

  // Legacy path (keeping for backward compatibility)
  http.post('/api/generate-scaffolds', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      const anyBody = body as Record<string, any>;
      const rawCourseId = anyBody.course_id;
      const rawInstructorId = anyBody.instructor_id;
      const courseId =
        typeof rawCourseId === 'string' && rawCourseId.trim().length > 0
          ? rawCourseId.trim()
          : MOCK_COURSE_ID;
      const instructorId =
        typeof rawInstructorId === 'string' && rawInstructorId.trim().length > 0
          ? rawInstructorId.trim()
          : MOCK_INSTRUCTOR_ID;

      const requestedSessionId = anyBody.session_id || null;
      const sessionId = ensureSession(courseId, instructorId, requestedSessionId);

      const rawReadingId = anyBody.reading_id;
      const readingId =
        typeof rawReadingId === 'string' && rawReadingId.trim().length > 0
          ? rawReadingId.trim()
          : `read_${Date.now()}_${Math.random().toString(36).slice(2)}`;

      recordSessionReading(sessionId, readingId);
      incrementReadingUsage(courseId, instructorId, readingId);

      const sessionInfo = (anyBody.session_info_json ?? {}) as Record<string, unknown>;
      const assignmentInfo = (anyBody.assignment_info_json ?? {}) as Record<string, unknown>;
      const courseDescription =
        typeof sessionInfo.summary === 'string' && sessionInfo.summary.trim().length > 0
          ? sessionInfo.summary.trim()
          : typeof sessionInfo.text === 'string' && sessionInfo.text.trim().length > 0
          ? sessionInfo.text.trim()
          : typeof anyBody.session_title === 'string'
          ? anyBody.session_title
          : 'Reading session';

      const assignmentDescription =
        typeof assignmentInfo.description === 'string' && assignmentInfo.description.trim().length > 0
          ? assignmentInfo.description.trim()
          : typeof anyBody.assignment_description === 'string'
          ? anyBody.assignment_description
          : 'Assignment description';

      const readingChunks = Array.isArray(anyBody?.reading_chunks?.chunks)
        ? (anyBody.reading_chunks.chunks as unknown[])
        : [];
      const readingMaterial =
        readingChunks.length > 0
          ? String(readingChunks[0])
          : `Reading payload for ${readingId}`;

      const { scaffoldsWithIds, threadId } = await generateMockThreadResponse({
        courseDescription,
        assignmentDescription,
        readingMaterial,
        incomingThreadId: anyBody.thread_id,
      });

      // Build full scaffold objects with id, status, and history
      const fullScaffolds = scaffoldsWithIds.map(({ scaffold_id, ...rest }) => {
        const historyKey = `${threadId}:${scaffold_id}`;
        const scaffoldHistory = db.scaffoldHistories.get(historyKey);
        const historySummary = scaffoldHistory ? summarizeHistory(scaffoldHistory.history) : [];
        
        return {
          id: scaffold_id,
          fragment: rest.fragment,
          text: rest.text,
          status: scaffoldHistory?.current.state === 'approved' ? 'approved' : 
                 scaffoldHistory?.current.state === 'rejected' ? 'rejected' : 'pending',
          history: historySummary,
        };
      });

        // Return a relative API URL that frontend can use to load the PDF
        // If this fails, PdfPreview will use readingId fallback
        const pdfUrl = `/api/readings/${readingId}/content`;
        
        return HttpResponse.json({
          session_id: sessionId,
          reading_id: readingId,
          pdf_url: pdfUrl,
          annotation_scaffolds_review: fullScaffolds,
        });
    } catch (error) {
      console.error('[MSW] Error in POST /api/generate-scaffolds', error);
      return err(
        'INTERNAL_ERROR',
        `Internal server error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        500
      );
    }
  }),

  // GET Scaffolds by Session and Reading
  http.get('/api/courses/:courseId/sessions/:sessionId/readings/:readingId/scaffolds', async ({ params }) => {
    const { sessionId, readingId } = params as { courseId: string; sessionId: string; readingId: string };
    
    // Find thread by sessionId (in mock, sessionId might be the threadId)
    // Try to find thread that matches sessionId or has scaffolds for this reading
    let matchingThread: ThreadState | undefined;
    let matchingThreadId: string | undefined;
    
    for (const [threadId, thread] of db.threads.entries()) {
      // Check if this thread has scaffolds
      if (thread.annotation_scaffolds && thread.annotation_scaffolds.length > 0) {
        matchingThread = thread;
        matchingThreadId = threadId;
        break;
      }
    }
    
    // If no thread found, return empty scaffolds
    if (!matchingThread || !matchingThreadId) {
      return HttpResponse.json({
        scaffolds: [],
        pdfUrl: null,
      });
    }

    // Build full scaffold objects with id, status, and history
    const scaffoldIds = (matchingThread as any).scaffold_ids || [];
    const scaffolds = scaffoldIds.map((scaffoldId: string, index: number) => {
      const scaffoldData = matchingThread.annotation_scaffolds[index];
      const historyKey = `${matchingThreadId}:${scaffoldId}`;
      const scaffoldHistory = db.scaffoldHistories.get(historyKey);
      const historySummary = scaffoldHistory ? summarizeHistory(scaffoldHistory.history) : [];
      
      return {
        id: scaffoldId,
        fragment: scaffoldData?.fragment || '',
        text: scaffoldData?.text || '',
        status: scaffoldHistory?.current.state === 'approved' ? 'approved' : 
               scaffoldHistory?.current.state === 'rejected' ? 'rejected' : 'pending',
        history: historySummary,
      };
    }).filter((s: any) => s.fragment && s.text); // Filter out invalid scaffolds

    // Return null for pdfUrl to let PdfPreview use readingId fallback
    // This ensures the PDF is loaded via /api/readings/:id/content endpoint
    // which will return the actual PDF content from the database or mock
    return HttpResponse.json({
      scaffolds,
      pdfUrl: null,
    });
  }),

  // Scaffold Accept/Reject Endpoints (matching backend API routes)
  // Using wildcard pattern to ensure matching works
  http.post('/api/courses/*/sessions/*/readings/*/scaffolds/*/approve', async ({ request }) => {
    // Ensure real scaffolds are loaded
    if (db.threads.size === 0) {
      console.log('[MSW] No threads found, loading real scaffolds...');
      loadRealScaffolds();
    }
    
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const scaffoldId = pathParts[pathParts.length - 2]; // Second to last part (before 'approve')
    const readingId = pathParts[pathParts.length - 4];
    const sessionId = pathParts[pathParts.length - 6];
    const courseId = pathParts[pathParts.length - 8];
    
    console.log('[MSW] ===== Approve scaffold request (wildcard) =====');
    console.log('[MSW] Request URL:', request.url);
    console.log('[MSW] Path parts:', pathParts);
    console.log('[MSW] Extracted IDs:', { courseId, sessionId, readingId, scaffoldId });
    console.log('[MSW] Available threads:', Array.from(db.threads.keys()));
    console.log('[MSW] Available scaffold histories:', Array.from(db.scaffoldHistories.keys()));
    
    if (!scaffoldId) {
      return err('VALIDATION_ERROR', 'scaffoldId is required', 400);
    }

    // Find scaffold in thread (try sessionId as threadId first, then search all threads)
    let scaffoldHistory: ScaffoldHistory | undefined;
    let scaffoldData: AnnotationScaffold | undefined;
    let foundThreadId: string | undefined;
    
    // First try sessionId as threadId
    let thread = db.threads.get(sessionId);
    console.log('[MSW] Thread found by sessionId:', !!thread, 'sessionId:', sessionId);
    if (thread) {
      const scaffoldIds = (thread as any).scaffold_ids || [];
      console.log('[MSW] Thread scaffold IDs:', scaffoldIds);
      console.log('[MSW] Looking for scaffoldId:', scaffoldId);
      const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
      console.log('[MSW] Scaffold index in thread:', scaffoldIndex);
      if (scaffoldIndex >= 0) {
        scaffoldData = thread.annotation_scaffolds[scaffoldIndex];
        const historyKey = `${sessionId}:${scaffoldId}`;
        scaffoldHistory = db.scaffoldHistories.get(historyKey);
        foundThreadId = sessionId;
        console.log('[MSW] Found scaffold in thread by sessionId');
        console.log('[MSW] Scaffold data:', { fragment: scaffoldData?.fragment?.substring(0, 50), text: scaffoldData?.text?.substring(0, 50) });
        console.log('[MSW] Scaffold history:', !!scaffoldHistory);
      } else {
        console.log('[MSW] Scaffold ID not found in thread scaffold_ids array');
        console.log('[MSW] scaffoldIds array:', scaffoldIds);
        console.log('[MSW] Looking for:', scaffoldId);
        console.log('[MSW] Type check - scaffoldId type:', typeof scaffoldId, 'array item type:', typeof scaffoldIds[0]);
      }
    } else {
      console.log('[MSW] No thread found with sessionId:', sessionId);
      console.log('[MSW] All thread IDs:', Array.from(db.threads.keys()));
    }
    
    // If not found, search all threads
    if (!scaffoldHistory || !scaffoldData) {
      console.log('[MSW] Searching all threads...');
      for (const [threadId, thread] of db.threads.entries()) {
        const scaffoldIds = (thread as any).scaffold_ids || [];
        const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
        
        console.log('[MSW] Checking thread:', threadId, 'scaffoldIds:', scaffoldIds, 'index:', scaffoldIndex);
        
        if (scaffoldIndex >= 0) {
          scaffoldData = thread.annotation_scaffolds[scaffoldIndex];
          const historyKey = `${threadId}:${scaffoldId}`;
          scaffoldHistory = db.scaffoldHistories.get(historyKey);
          foundThreadId = threadId;
          console.log('[MSW] Found scaffold in thread:', threadId);
          break;
        }
      }
    }

    if (!scaffoldHistory || !scaffoldData || !foundThreadId) {
      // Scaffold not found in mock DB - likely generated by real API
      // Let the request pass through to the real backend API
      console.log('[MSW] Scaffold not found in mock DB, letting request pass through to real API', {
        hasHistory: !!scaffoldHistory,
        hasData: !!scaffoldData,
        foundThreadId,
        searchedScaffoldId: scaffoldId,
      });
      // Scaffold not found in mock DB - let request pass through to real API
      // Use passthrough() to forward the request to the real backend
      return passthrough();
    }
    
    console.log('[MSW] Found scaffold:', {
      scaffoldId,
      foundThreadId,
      currentState: scaffoldHistory.current.state,
      fragment: scaffoldData.fragment?.substring(0, 50),
    });

    // Update status to approved
    const nowTs = Date.now() / 1000;
    const newVersion = scaffoldHistory.current.version + 1;
    
    const approveEvent: HistoryEvent = {
      event_id: generateEventId(),
      ts: nowTs,
      actor: 'user',
      action: 'approve',
      state_after: 'approved',
      version: newVersion,
    };

    scaffoldHistory.history.push(approveEvent);
    scaffoldHistory.current = {
      version: newVersion,
      state: 'approved',
      fragment: scaffoldData.fragment,
      text: scaffoldData.text,
    };

    // Update history in database
    const historyKey = `${foundThreadId}:${scaffoldId}`;
    db.scaffoldHistories.set(historyKey, scaffoldHistory);

    // Update thread state
    const threadToUpdate = db.threads.get(foundThreadId);
    if (threadToUpdate) {
      const scaffoldIds = (threadToUpdate as any).scaffold_ids || [];
      const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
      if (scaffoldIndex >= 0) {
        threadToUpdate.scaffold_final.push({ ...scaffoldData, scaffold_id: scaffoldId });
        db.threads.set(foundThreadId, threadToUpdate);
      }
    }

    const historySummary = summarizeHistory(scaffoldHistory.history);

    const response = {
      scaffold: {
        id: scaffoldId,
        fragment: scaffoldHistory.current.fragment,
        text: scaffoldHistory.current.text,
        status: 'approved', // Frontend expects 'approved' not 'accepted'
        history: historySummary,
      },
    };
    
    console.log('[MSW] Approve scaffold response:', JSON.stringify(response, null, 2));
    console.log('[MSW] Response structure check:', {
      hasScaffold: !!response.scaffold,
      scaffoldId: response.scaffold?.id,
      scaffoldStatus: response.scaffold?.status,
      scaffoldFragment: response.scaffold?.fragment?.substring(0, 50),
      scaffoldText: response.scaffold?.text?.substring(0, 50),
    });
    return HttpResponse.json(response);
  }),

  http.post('/api/courses/*/sessions/*/readings/*/scaffolds/*/reject', async ({ request, params }) => {
    // Ensure real scaffolds are loaded
    if (db.threads.size === 0) {
      console.log('[MSW] No threads found, loading real scaffolds...');
      loadRealScaffolds();
    }
    
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/').filter(Boolean);
    const scaffoldId = pathParts[pathParts.length - 2];
    const readingId = pathParts[pathParts.length - 4];
    const sessionId = pathParts[pathParts.length - 6];
    const courseId = pathParts[pathParts.length - 8];
    
    console.log('[MSW] ===== Reject scaffold request (wildcard) =====');
    console.log('[MSW] Extracted from URL:', { courseId, sessionId, readingId, scaffoldId });
    
    const extractedParams = { scaffoldId, sessionId, courseId, readingId };
    console.log('[MSW] Available threads:', Array.from(db.threads.keys()));
    console.log('[MSW] Available scaffold histories:', Array.from(db.scaffoldHistories.keys()));
    
    if (!scaffoldId) {
      return err('VALIDATION_ERROR', 'scaffoldId is required', 400);
    }

    // Find scaffold in thread (try sessionId as threadId first, then search all threads)
    let scaffoldHistory: ScaffoldHistory | undefined;
    let scaffoldData: AnnotationScaffold | undefined;
    let foundThreadId: string | undefined;
    
    // First try sessionId as threadId
    let thread = db.threads.get(sessionId);
    console.log('[MSW] Thread found by sessionId:', !!thread);
    if (thread) {
      const scaffoldIds = (thread as any).scaffold_ids || [];
      console.log('[MSW] Thread scaffold IDs:', scaffoldIds);
      const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
      console.log('[MSW] Scaffold index in thread:', scaffoldIndex);
      if (scaffoldIndex >= 0) {
        scaffoldData = thread.annotation_scaffolds[scaffoldIndex];
        const historyKey = `${sessionId}:${scaffoldId}`;
        scaffoldHistory = db.scaffoldHistories.get(historyKey);
        foundThreadId = sessionId;
        console.log('[MSW] Found scaffold in thread by sessionId');
      }
    }
    
    // If not found, search all threads
    if (!scaffoldHistory || !scaffoldData) {
      console.log('[MSW] Searching all threads...');
      for (const [threadId, thread] of db.threads.entries()) {
        const scaffoldIds = (thread as any).scaffold_ids || [];
        const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
        
        if (scaffoldIndex >= 0) {
          scaffoldData = thread.annotation_scaffolds[scaffoldIndex];
          const historyKey = `${threadId}:${scaffoldId}`;
          scaffoldHistory = db.scaffoldHistories.get(historyKey);
          foundThreadId = threadId;
          console.log('[MSW] Found scaffold in thread:', threadId);
          break;
        }
      }
    }

    if (!scaffoldHistory || !scaffoldData || !foundThreadId) {
      // Scaffold not found in mock DB - likely generated by real API
      // Let the request pass through to the real backend API
      console.log('[MSW] Scaffold not found in mock DB, letting request pass through to real API', {
        hasHistory: !!scaffoldHistory,
        hasData: !!scaffoldData,
        foundThreadId,
        searchedScaffoldId: scaffoldId,
      });
      // Scaffold not found in mock DB - let request pass through to real API
      // Use passthrough() to forward the request to the real backend
      return passthrough();
    }
    
    console.log('[MSW] Found scaffold:', {
      scaffoldId,
      foundThreadId,
      currentState: scaffoldHistory.current.state,
      fragment: scaffoldData.fragment?.substring(0, 50),
    });

    // Update status to rejected
    const nowTs = Date.now() / 1000;
    const newVersion = scaffoldHistory.current.version + 1;
    
    const rejectEvent: HistoryEvent = {
      event_id: generateEventId(),
      ts: nowTs,
      actor: 'user',
      action: 'reject',
      state_after: 'rejected',
      version: newVersion,
    };

    scaffoldHistory.history.push(rejectEvent);
    scaffoldHistory.current = {
      version: newVersion,
      state: 'rejected',
      fragment: scaffoldData.fragment,
      text: scaffoldData.text,
    };

    // Update history in database
    const historyKey = `${foundThreadId}:${scaffoldId}`;
    db.scaffoldHistories.set(historyKey, scaffoldHistory);

    // Update thread state
    const threadToUpdate = db.threads.get(foundThreadId);
    if (threadToUpdate) {
      const scaffoldIds = (threadToUpdate as any).scaffold_ids || [];
      const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
      if (scaffoldIndex >= 0) {
        threadToUpdate.scaffold_rejected.push({
          item: { ...scaffoldData, scaffold_id: scaffoldId },
          feedback: undefined,
        });
        db.threads.set(foundThreadId, threadToUpdate);
      }
    }

    const historySummary = summarizeHistory(scaffoldHistory.history);

    const response = {
      scaffold: {
        id: scaffoldId,
        fragment: scaffoldHistory.current.fragment,
        text: scaffoldHistory.current.text,
        status: 'rejected', // Frontend expects 'rejected'
        history: historySummary,
      },
    };
    
    console.log('[MSW] Reject scaffold response:', JSON.stringify(response, null, 2));
    console.log('[MSW] Response structure check:', {
      hasScaffold: !!response.scaffold,
      scaffoldId: response.scaffold?.id,
      scaffoldStatus: response.scaffold?.status,
      scaffoldFragment: response.scaffold?.fragment?.substring(0, 50),
      scaffoldText: response.scaffold?.text?.substring(0, 50),
    });
    return HttpResponse.json(response);
  }),

  // 2) Review Scaffolds (New thread-based review flow)
  http.post('/threads/:thread_id/review', async ({ params, request }) => {
    const { thread_id } = params as { thread_id: string };
    if (!thread_id) return err('VALIDATION_ERROR', 'thread_id is required');

    const thread = db.threads.get(thread_id);
    if (!thread) return err('THREAD_NOT_FOUND', 'thread not found', 404);

    const body = await request.json().catch(() => ({}));
    let { decision, feedback, edited_json, edit_prompt } = body as {
      decision?: 'approve' | 'reject' | 'edit';
      feedback?: string;
      edited_json?: { fragment?: string; text?: string | string[] };
      edit_prompt?: string;
    };
    const actions = Array.isArray((body as { actions?: Array<{ item_id: string; action: string; data?: Record<string, unknown> }> }).actions)
      ? (body as { actions?: Array<{ item_id: string; action: string; data?: Record<string, unknown> }> }).actions
      : undefined;
    let targetScaffoldId: string | undefined;
    let manualEditPayload: { new_text?: string; new_fragment?: string } | undefined;
    let llmRefinePrompt: string | undefined;

    if (actions && actions.length > 0) {
      const { item_id, action, data } = actions[0] ?? {};
      targetScaffoldId = typeof item_id === 'string' ? item_id : undefined;
      const actionData = (data ?? {}) as Record<string, unknown>;

      switch (action) {
        case 'manual_edit':
          decision = 'edit';
          manualEditPayload = {
            new_text: typeof actionData.new_text === 'string' ? actionData.new_text : undefined,
            new_fragment: typeof actionData.new_fragment === 'string' ? actionData.new_fragment : undefined,
          };
          break;
        case 'llm_refine':
          decision = 'edit';
          llmRefinePrompt =
            typeof actionData.prompt === 'string'
              ? actionData.prompt
              : typeof actionData.edit_prompt === 'string'
              ? actionData.edit_prompt
              : undefined;
          if (!edit_prompt && llmRefinePrompt) {
            edit_prompt = llmRefinePrompt;
          }
          break;
        case 'approve':
          decision = 'approve';
          break;
        case 'reject':
          decision = 'reject';
          if (typeof actionData.feedback === 'string') {
            feedback = actionData.feedback;
          }
          break;
        case 'request_edit':
        case 'edit_prompt':
          decision = 'edit';
          if (typeof actionData.edit_prompt === 'string') {
            edit_prompt = actionData.edit_prompt;
          }
          break;
        default:
          break;
      }
    }

    await delay(100);
    logEvent('review:request', { thread_id, decision, body });

    // If no decision provided, return first item to review
    if (!decision) {
      const currentIndex = thread.review_cursor;
      const total = thread.annotation_scaffolds.length;

      if (currentIndex >= total) {
        // All items reviewed, return null interrupt
        return HttpResponse.json({
          thread_id,
          __interrupt__: null,
          progress: {
            review_cursor: currentIndex,
            scaffold_final: thread.scaffold_final,
            scaffold_rejected: thread.scaffold_rejected
          },
          action_result: null
        });
      }

      const draftItem = thread.scaffold_draft[currentIndex] || thread.annotation_scaffolds[currentIndex];

      const interrupt: InterruptReview = {
        type: 'scaffold_item_review',
        message: 'Review this scaffold item and choose: approve, reject, or edit.',
        index: currentIndex,
        total,
        draft_item: draftItem,
        expected_resume_schema: {
          decision: 'approve',
          feedback: 'string|optional',
          edited_json: { fragment: 'string', text: 'string' },
          edit_prompt: 'string'
        }
      };

      return HttpResponse.json({
        thread_id,
        __interrupt__: interrupt,
        progress: {
          review_cursor: currentIndex,
          scaffold_final: thread.scaffold_final,
          scaffold_rejected: thread.scaffold_rejected
        },
        action_result: null
      });
    }

    // Process decision
    const scaffoldIds = (thread as any).scaffold_ids || [];
    const scaffoldLookup: Record<string, number> = (thread as any).scaffold_lookup || {};
    let targetedIndex = -1;
    if (targetScaffoldId) {
      if (scaffoldLookup[targetScaffoldId] !== undefined) {
        targetedIndex = scaffoldLookup[targetScaffoldId];
      } else {
        targetedIndex = scaffoldIds.indexOf(targetScaffoldId);
        if (targetedIndex === -1) {
          targetedIndex = thread.annotation_scaffolds.findIndex((item) => item?.scaffold_id === targetScaffoldId);
        }
      }
    }
    const currentIndex = targetedIndex >= 0 ? targetedIndex : thread.review_cursor;
    const currentItem = thread.scaffold_draft[currentIndex] || thread.annotation_scaffolds[currentIndex];

    if (!currentItem) {
      return err('SCAFFOLD_NOT_FOUND', 'scaffold not found in current review state', 404);
    }

    const scaffoldId = scaffoldIds[currentIndex] || `scf_${currentIndex}`;
    const historyKey = `${thread_id}:${scaffoldId}`;
    const scaffoldHistory = db.scaffoldHistories.get(historyKey);
    const nowTs = Date.now() / 1000;

    let actionResult: {
      id: string;
      fragment: string;
      text: string;
      status: string;
      history: Array<{ ts: number; action: string; old_text?: string; new_text?: string }>;
    } | null = null;

    if (decision === 'approve') {
      // Add to final list
      thread.scaffold_final.push({ ...currentItem, scaffold_id: scaffoldId });
      thread.review_cursor = currentIndex + 1;
      
      // Record history event
      if (scaffoldHistory) {
        const newVersion = scaffoldHistory.current.version + 1;
        const approveEvent: HistoryEvent = {
          event_id: generateEventId(),
          ts: nowTs,
          actor: 'user',
          action: 'approve',
          state_after: 'approved',
          version: newVersion
        };
        scaffoldHistory.history.push(approveEvent);
        scaffoldHistory.current = {
          version: newVersion,
          state: 'approved',
          fragment: currentItem.fragment,
          text: currentItem.text
        };
        db.scaffoldHistories.set(historyKey, scaffoldHistory);

        const historySummary = summarizeHistory(scaffoldHistory.history);

        actionResult = {
          id: scaffoldId,
          fragment: scaffoldHistory.current.fragment,
          text: scaffoldHistory.current.text,
          status: scaffoldHistory.current.state === 'approved' ? 'approved' : scaffoldHistory.current.state,
          history: historySummary
        };
      }
    } else if (decision === 'reject') {
      // Add to rejected list
      thread.scaffold_rejected.push({
        item: { ...currentItem, scaffold_id: scaffoldId },
        feedback: feedback || undefined
      });
      thread.review_cursor = currentIndex + 1;
      
      // Record history event
      if (scaffoldHistory) {
        const newVersion = scaffoldHistory.current.version + 1;
        const rejectEvent: HistoryEvent = {
          event_id: generateEventId(),
          ts: nowTs,
          actor: 'user',
          action: 'reject',
          state_after: 'rejected',
          version: newVersion
        };
        scaffoldHistory.history.push(rejectEvent);
        scaffoldHistory.current = {
          version: newVersion,
          state: 'rejected',
          fragment: currentItem.fragment,
          text: currentItem.text
        };
        db.scaffoldHistories.set(historyKey, scaffoldHistory);

        const historySummary = summarizeHistory(scaffoldHistory.history);

        actionResult = {
          id: scaffoldId,
          fragment: scaffoldHistory.current.fragment,
          text: scaffoldHistory.current.text,
          status: scaffoldHistory.current.state,
          history: historySummary
        };
      }
    } else if (decision === 'edit') {
      const previousText = currentItem.text;
      let editedItem: AnnotationScaffold | null = null;

      if (manualEditPayload?.new_text !== undefined || edited_json) {
        const manualNewTextRaw =
          manualEditPayload?.new_text ??
          (Array.isArray(edited_json?.text) ? edited_json?.text.join('\n\n') : edited_json?.text) ??
          resolveManualMock(scaffoldId, currentItem.fragment);
        const manualNewText = manualNewTextRaw?.trim();
        const manualNewFragment = manualEditPayload?.new_fragment ?? edited_json?.fragment ?? currentItem.fragment;

        if (!manualNewText || manualNewText.trim().length === 0) {
          return err('VALIDATION_ERROR', 'new_text is required for manual_edit', 400);
        }

        editedItem = {
          fragment: manualNewFragment,
          text: manualNewText,
          scaffold_id: scaffoldId,
        };
        thread.scaffold_draft[currentIndex] = editedItem;
        thread.annotation_scaffolds[currentIndex] = editedItem;
        thread.review_cursor = currentIndex;

        if (scaffoldHistory) {
          const newVersion = scaffoldHistory.current.version + 1;
          const diff = createDiff(currentItem, editedItem);
          const manualEvent: HistoryEvent = {
            event_id: generateEventId(),
            ts: nowTs,
            actor: 'user',
            action: 'manual_edit',
            state_after: 'edit_pending',
            version: newVersion,
            payload: {
              fragment: editedItem.fragment,
              text: editedItem.text,
              mode: 'manual',
              manual_edit: true,
              old_text: previousText,
              new_text: editedItem.text,
            },
            diff: Object.keys(diff).length > 0 ? diff : undefined,
          };
          scaffoldHistory.history.push(manualEvent);
          scaffoldHistory.current = {
            version: newVersion,
            state: 'edit_pending',
            fragment: editedItem.fragment,
            text: editedItem.text,
          };
          db.scaffoldHistories.set(historyKey, scaffoldHistory);

          const historySummary = summarizeHistory(scaffoldHistory.history);

          actionResult = {
            id: scaffoldId,
            fragment: scaffoldHistory.current.fragment,
            text: scaffoldHistory.current.text,
            status: scaffoldHistory.current.state,
            history: historySummary,
          };
        }
      } else if (llmRefinePrompt || edit_prompt) {
        const promptValue = llmRefinePrompt ?? edit_prompt ?? '';
        const refinementMock =
          resolveLLMRefinementMock(scaffoldId, currentItem.fragment) ??
          (promptValue ? llmRefinementPromptMocks[promptValue.trim()] : undefined);
        const refinedTextBase =
          refinementMock ??
          (promptValue.length > 0
            ? `${currentItem.text || ''} (refined via prompt)`
            : `${currentItem.text || ''} (refined)`);
        editedItem = {
          fragment: currentItem.fragment,
          text: refinedTextBase || 'Refined scaffold text',
          scaffold_id: scaffoldId,
        };
        thread.scaffold_draft[currentIndex] = editedItem;
        thread.annotation_scaffolds[currentIndex] = editedItem;
        thread.review_cursor = currentIndex;

        if (scaffoldHistory) {
          const newVersion = scaffoldHistory.current.version + 1;
          const diff = createDiff(currentItem, editedItem);
          const editEvent: HistoryEvent = {
            event_id: generateEventId(),
            ts: nowTs,
            actor: 'user',
            action: llmRefinePrompt ? 'llm_refine' : 'edit',
            state_after: 'edit_pending',
            version: newVersion,
            payload: {
              fragment: editedItem.fragment,
              text: editedItem.text,
              mode: 'prompt',
              edited_json: edited_json,
              old_text: previousText,
              new_text: editedItem.text,
              prompt: promptValue,
              edit_prompt: promptValue,
            },
            diff: Object.keys(diff).length > 0 ? diff : undefined
          };
          scaffoldHistory.history.push(editEvent);
          scaffoldHistory.current = {
            version: newVersion,
            state: 'edit_pending',
            fragment: editedItem.fragment,
            text: editedItem.text
          };
          db.scaffoldHistories.set(historyKey, scaffoldHistory);

          const historySummary = summarizeHistory(scaffoldHistory.history);

          actionResult = {
            id: scaffoldId,
            fragment: scaffoldHistory.current.fragment,
            text: scaffoldHistory.current.text,
            status: scaffoldHistory.current.state,
            history: historySummary
          };
        }
      } else {
        return err('VALIDATION_ERROR', 'edited_json, actions.data.new_text, or edit_prompt required for edit decision', 400);
      }
    } else {
      return err('VALIDATION_ERROR', 'Unsupported decision', 400);
    }

    thread.updated_at = new Date().toISOString();
    db.threads.set(thread_id, thread);

    // Return next item to review
    const nextIndex = thread.review_cursor;
    const total = thread.annotation_scaffolds.length;

    if (nextIndex >= total) {
      // All items reviewed
      return HttpResponse.json({
        thread_id,
        __interrupt__: null,
        progress: {
          review_cursor: nextIndex,
          scaffold_final: thread.scaffold_final,
          scaffold_rejected: thread.scaffold_rejected
        },
        action_result: actionResult
      });
    }

    const nextDraftItem = thread.scaffold_draft[nextIndex] || thread.annotation_scaffolds[nextIndex];

    const nextInterrupt: InterruptReview = {
      type: 'scaffold_item_review',
      message: 'Review this scaffold item and choose: approve, reject, or edit.',
      index: nextIndex,
      total,
      draft_item: nextDraftItem,
      expected_resume_schema: {
        decision: 'approve',
        feedback: 'string|optional',
        edited_json: { fragment: 'string', text: 'string' },
        edit_prompt: 'string'
      }
    };

    logEvent('review:response', { thread_id, nextIndex, decision });
    return HttpResponse.json({
      thread_id,
      __interrupt__: nextInterrupt,
      progress: {
        review_cursor: nextIndex,
        scaffold_final: thread.scaffold_final,
        scaffold_rejected: thread.scaffold_rejected
      },
      action_result: actionResult
    });
  }),

  // 3) Get Final Scaffold Bundle
  http.get('/threads/:thread_id/scaffold-bundle', async ({ params }) => {
    const { thread_id } = params as { thread_id: string };
    if (!thread_id) return err('VALIDATION_ERROR', 'thread_id is required');

    const thread = db.threads.get(thread_id);
    if (!thread) return err('THREAD_NOT_FOUND', 'thread not found', 404);

    await delay(60);
    logEvent('scaffold-bundle:request', { thread_id });

    const scaffoldIds = (thread as any).scaffold_ids || [];
    const finalOutput: Array<{
      id: string;
      fragment: string;
      text: string;
      status: string;
      history: Array<{ ts: number; action: string; old_text?: string; new_text?: string; prompt?: string }>;
    }> = (scaffoldIds as string[])
      .map((id, idx) => {
        const historyKey = `${thread_id}:${id}`;
        const scaffoldHistory = db.scaffoldHistories.get(historyKey);
        const annotation = thread.annotation_scaffolds[idx];
        const current = scaffoldHistory?.current ?? {
          version: 1,
          state: 'draft' as const,
          fragment: annotation?.fragment ?? '',
          text: annotation?.text ?? '',
        };
        return {
          id,
          fragment: current.fragment,
          text: current.text,
          status: current.state,
          history: scaffoldHistory ? summarizeHistory(scaffoldHistory.history) : [],
        };
      })
      .filter((item) => item.status === 'approved');

    const response = {
      thread_id,
      __interrupt__: thread.review_cursor < thread.annotation_scaffolds.length ? {
        type: 'scaffold_item_review' as const,
        message: 'Review pending',
        index: thread.review_cursor,
        total: thread.annotation_scaffolds.length,
        draft_item: thread.scaffold_draft[thread.review_cursor] || thread.annotation_scaffolds[thread.review_cursor]
      } : null,
      scaffold_bundle: {
        annotation_scaffolds: thread.scaffold_final
      },
      scaffold_audit: {
        rejected: thread.scaffold_rejected,
        total: thread.annotation_scaffolds.length
      },
      final_output: finalOutput
    };

    logEvent('scaffold-bundle:response', response);
    return HttpResponse.json(response);
  }),

  // 4) View Scaffold History
  http.get('/threads/:thread_id/scaffolds/:scaffold_id/history', async ({ params }) => {
    const { thread_id, scaffold_id } = params as { thread_id: string; scaffold_id: string };
    if (!thread_id || !scaffold_id) {
      return err('VALIDATION_ERROR', 'thread_id and scaffold_id are required');
    }

    const historyKey = `${thread_id}:${scaffold_id}`;
    const scaffoldHistory = db.scaffoldHistories.get(historyKey);

    if (!scaffoldHistory) {
      return err('HISTORY_NOT_FOUND', 'scaffold history not found', 404);
    }

    await delay(60);
    logEvent('scaffold-history:request', { thread_id, scaffold_id });
    return HttpResponse.json(scaffoldHistory);
  }),

  // 5) Restore History (one certain scaffold)
  http.post('/threads/:thread_id/scaffolds/:scaffold_id/restore', async ({ params, request }) => {
    const { thread_id, scaffold_id } = params as { thread_id: string; scaffold_id: string };
    if (!thread_id || !scaffold_id) {
      return err('VALIDATION_ERROR', 'thread_id and scaffold_id are required');
    }

    const body = await request.json().catch(() => ({}));
    const { target_version, mode = 'edit_pending' } = body as {
      target_version?: number;
      mode?: 'edit_pending' | 'approved' | 'rejected';
    };

    if (typeof target_version !== 'number') {
      return err('VALIDATION_ERROR', 'target_version is required');
    }

    const historyKey = `${thread_id}:${scaffold_id}`;
    const scaffoldHistory = db.scaffoldHistories.get(historyKey);

    if (!scaffoldHistory) {
      return err('HISTORY_NOT_FOUND', 'scaffold history not found', 404);
    }

    // Find target version
    const targetEvent = scaffoldHistory.history.find(e => e.version === target_version);
    if (!targetEvent) {
      return err('VERSION_NOT_FOUND', `version ${target_version} not found`, 404);
    }

    // Get the scaffold content from target event
    const restoredScaffold: AnnotationScaffold = {
      fragment: targetEvent.payload?.fragment || scaffoldHistory.current.fragment,
    text: targetEvent.payload?.text || scaffoldHistory.current.text
    };

    // Create new version
    const newVersion = scaffoldHistory.current.version + 1;
    const nowTs = Date.now() / 1000;

    const restoreEvent: HistoryEvent = {
      event_id: generateEventId(),
      ts: nowTs,
      actor: 'user',
      action: 'restore',
      state_after: mode,
      version: newVersion,
      payload: {
        fragment: restoredScaffold.fragment,
        text: restoredScaffold.text,
        from_version: target_version,
        mode_restore: mode
      }
    };

    scaffoldHistory.history.push(restoreEvent);
    scaffoldHistory.current = {
      version: newVersion,
      state: mode,
      fragment: restoredScaffold.fragment,
    text: restoredScaffold.text
    };

    db.scaffoldHistories.set(historyKey, scaffoldHistory);

    await delay(80);
    logEvent('scaffold-restore', { thread_id, scaffold_id, target_version, newVersion });

    return HttpResponse.json({
      thread_id,
      scaffold_id,
      restored_from: {
        version: target_version,
        event_id: targetEvent.event_id
      },
      current: scaffoldHistory.current,
      history_append: restoreEvent
    });
  }),

  // ======================================
  // Perusall Publish (spec parity: main.py /api/perusall/annotations, lines 1467-1580)
  // NOTE: In dev we bypass env requirements, backend must enforce real credentials.
  // ======================================
  /**
   * TODO backend: pass through to real Perusall API once credentials are configured server-side.
   * Notes:
   *   - Missing `PERUSALL_*` env → handler auto-mocks success (still logs reason).
   *   - Performs minimal validation on rangeStart/rangeEnd for quick FE feedback.
   */
  // 6) Publish Final Scaffolds to Perusall
  http.post('/api/perusall/annotations', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      const annotations = Array.isArray((body as { annotations?: MockPerusallAnnotation[] }).annotations)
        ? ((body as { annotations?: MockPerusallAnnotation[] }).annotations as MockPerusallAnnotation[])
        : [];

      const missingEnv = Object.values(perusallEnv).some(value => !value);
      if (missingEnv) {
        logEvent('perusall:mock-mode', {
          reason: 'missing_env',
          provided_env: perusallEnv,
          annotationCount: annotations.length,
        });
      }

      if (annotations.length === 0) {
        return err('VALIDATION_ERROR', 'annotations array is required');
      }

      await delay(150);
      const createdIds: string[] = [];
      const errors: Array<{ index: number; error: string }> = [];

      annotations.forEach((annotation, index) => {
        if (
          typeof annotation.rangeStart !== 'number' ||
          typeof annotation.rangeEnd !== 'number' ||
          annotation.rangeEnd <= annotation.rangeStart
        ) {
          errors.push({ index, error: 'Invalid range values' });
          return;
        }
        createdIds.push(`ann_${Math.random().toString(36).slice(2, 8)}`);
      });

      logEvent('perusall:mock-post', {
        annotations: annotations.length,
        created: createdIds.length,
        errors: errors.length,
      });

      return HttpResponse.json({
        success: errors.length === 0,
        created_ids: createdIds,
        errors,
      });
    } catch (error) {
      console.error('[MSW] Error in POST /api/perusall/annotations', error);
      return err('INTERNAL_ERROR', 'Failed to simulate Perusall upload', 500);
    }
  }),

  // ======================================
  // Debug Utilities
  // ======================================
  /**
   * TODO backend: remove or secure before production.
   * Notes: `/api/_debug/msw-log` dumps the rolling log buffer; `/api/_debug/test` is a ping endpoint.
   */
  // Endpoint to view recent logs
  http.get('/api/_debug/msw-log', () => HttpResponse.json({ logs: debugLogs })),
  
  // Test endpoint to verify MSW is working
  http.get('/api/_debug/test', () => {
    console.log('[MSW] Test endpoint called - MSW is working!');
    return HttpResponse.json({ status: 'ok', message: 'MSW is working', timestamp: new Date().toISOString() });
  }),
  
  // Test endpoint for scaffold approve (to verify path matching)
  http.post('/api/courses/*/sessions/*/readings/*/scaffolds/*/approve', async ({ request, params }) => {
    console.log('[MSW] ===== Approve scaffold request (wildcard match) =====');
    console.log('[MSW] Request URL:', request.url);
    console.log('[MSW] Params:', params);
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const scaffoldId = pathParts[pathParts.length - 2]; // Second to last part
    const readingId = pathParts[pathParts.length - 4];
    const sessionId = pathParts[pathParts.length - 6];
    const courseId = pathParts[pathParts.length - 8];
    
    console.log('[MSW] Extracted IDs:', { courseId, sessionId, readingId, scaffoldId });
    
    // Try to find the scaffold using the same logic as the specific handler
    let scaffoldHistory: ScaffoldHistory | undefined;
    let scaffoldData: AnnotationScaffold | undefined;
    let foundThreadId: string | undefined;
    
    let thread = db.threads.get(sessionId);
    if (thread) {
      const scaffoldIds = (thread as any).scaffold_ids || [];
      const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
      if (scaffoldIndex >= 0) {
        scaffoldData = thread.annotation_scaffolds[scaffoldIndex];
        const historyKey = `${sessionId}:${scaffoldId}`;
        scaffoldHistory = db.scaffoldHistories.get(historyKey);
        foundThreadId = sessionId;
      }
    }
    
    if (!scaffoldHistory || !scaffoldData) {
      for (const [threadId, thread] of db.threads.entries()) {
        const scaffoldIds = (thread as any).scaffold_ids || [];
        const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
        if (scaffoldIndex >= 0) {
          scaffoldData = thread.annotation_scaffolds[scaffoldIndex];
          const historyKey = `${threadId}:${scaffoldId}`;
          scaffoldHistory = db.scaffoldHistories.get(historyKey);
          foundThreadId = threadId;
          break;
        }
      }
    }
    
    if (!scaffoldHistory || !scaffoldData || !foundThreadId) {
      console.error('[MSW] Scaffold not found in wildcard handler');
      return err('SCAFFOLD_NOT_FOUND', 'Scaffold not found', 404);
    }
    
    const nowTs = Date.now() / 1000;
    const newVersion = scaffoldHistory.current.version + 1;
    
    const approveEvent: HistoryEvent = {
      event_id: generateEventId(),
      ts: nowTs,
      actor: 'user',
      action: 'approve',
      state_after: 'approved',
      version: newVersion,
    };
    
    scaffoldHistory.history.push(approveEvent);
    scaffoldHistory.current = {
      version: newVersion,
      state: 'approved',
      fragment: scaffoldData.fragment,
      text: scaffoldData.text,
    };
    
    const historyKey = `${foundThreadId}:${scaffoldId}`;
    db.scaffoldHistories.set(historyKey, scaffoldHistory);
    
    const threadToUpdate = db.threads.get(foundThreadId);
    if (threadToUpdate) {
      const scaffoldIds = (threadToUpdate as any).scaffold_ids || [];
      const scaffoldIndex = scaffoldIds.indexOf(scaffoldId);
      if (scaffoldIndex >= 0) {
        threadToUpdate.scaffold_final.push({ ...scaffoldData, scaffold_id: scaffoldId });
        db.threads.set(foundThreadId, threadToUpdate);
      }
    }
    
    const historySummary = summarizeHistory(scaffoldHistory.history);
    
    return HttpResponse.json({
      scaffold: {
        id: scaffoldId,
        fragment: scaffoldHistory.current.fragment,
        text: scaffoldHistory.current.text,
        status: 'approved',
        history: historySummary,
      },
    });
  }),

  // ======================================
  // Reading APIs (spec parity: main.py /api/readings, /api/readings/batch-upload)
  // TODO backend: replace in-memory store with reading_service + database.
  // ======================================
  /**
   * SPEC REF:
   *   - lines 798-909 (`BatchUploadReadings*`)
   *   - lines 910-963 (`GET /api/readings`)
   * TODO backend:
   *   - Call `reading_service` (create_reading, get_readings_by_course_and_instructor, etc.).
   *   - Store file blobs in Supabase/S3 as per production design.
   * Notes:
   *   - Files are stored base64 inside memory; course/instructor IDs default to MOCK_* when missing.
   *   - `/api/readings/:id/content` is dev-only to rebuild PDF preview.
   *   - Usage metrics (`usage_count`, `last_used_at`) are updated in-memory for UI display.
   */
  http.get('/api/readings', async ({ request }) => {
    try {
      const url = new URL(request.url);
      const courseId = url.searchParams.get('course_id');
      const instructorId = url.searchParams.get('instructor_id');

      if (!courseId || !instructorId) {
        return HttpResponse.json(
          { detail: 'Both course_id and instructor_id must be provided' },
          { status: 400 }
        );
      }

      let readings = listReadingsFor(courseId, instructorId);
      
      // If no readings exist, create some default mock readings for testing
      if (readings.length === 0) {
        const now = new Date().toISOString();
        const defaultReadings: MockReadingRecord[] = [
          {
            id: '7800c7e2-837a-49dc-84f3-dfb8eb959a05', // Use the real reading ID from loaded scaffolds
            instructor_id: instructorId,
            course_id: courseId,
            title: 'Sample Reading 1',
            file_path: '/storage/uploads/sample1.pdf',
            source_type: 'uploaded',
            created_at: now,
            size_label: '2.5 MB',
            usage_count: 0,
            mime_type: 'application/pdf',
            content_base64: undefined,
          },
          {
            id: `read_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            instructor_id: instructorId,
            course_id: courseId,
            title: 'Sample Reading 2',
            file_path: '/storage/uploads/sample2.pdf',
            source_type: 'uploaded',
            created_at: now,
            size_label: '1.8 MB',
            usage_count: 0,
            mime_type: 'application/pdf',
            content_base64: undefined,
          },
        ];
        saveReadingsFor(courseId, instructorId, defaultReadings);
        readings = defaultReadings;
        logEvent('readings:list:mock-created', { courseId, instructorId, count: readings.length });
      }

      const responseReadings = readings.map(toReadingResponse);
      logEvent('readings:list', { courseId, instructorId, total: responseReadings.length });
      return HttpResponse.json({
        readings: responseReadings,
        total: responseReadings.length,
      });
    } catch (error) {
      console.error('[MSW] Error fetching readings', error);
      return HttpResponse.json(
        { message: 'Failed to load readings' },
        { status: 500 }
      );
    }
  }),

  http.get('/api/readings/:id/content', async ({ params }) => {
    try {
      const { id } = params as { id: string };
      console.log('[MSW] GET /api/readings/:id/content, readingId:', id);
      if (!id) {
        return err('VALIDATION_ERROR', 'Reading ID is required');
      }
      const reading = findReadingById(id);
      if (!reading || !reading.content_base64) {
        console.log('[MSW] Reading not found in mock DB, returning valid minimal PDF content');
        // Return a complete, valid minimal PDF as base64
        // This is a properly formatted PDF with all required sections including endstream
        // Generated from a minimal PDF: %PDF-1.4 with proper structure
        const minimalPdfBase64 = 'JVBERi0xLjQKJdPr6eEKMSAwIG9iago8PAovVHlwZSAvQ2F0YWxvZwovUGFnZXMgMiAwIFIKPj4KZW5kb2JqCjIgMCBvYmoKPDwKL1R5cGUgL1BhZ2VzCi9LaWRzIFszIDAgUl0KL0NvdW50IDEKPD4KZW5kb2JqCjMgMCBvYmoKPDwKL1R5cGUgL1BhZ2UKL1BhcmVudCAyIDAgUgovTWVkaWFCb3ggWzAgMCA2MTIgNzkyXQovUmVzb3VyY2VzIDw8Ci9Gb250IDw8Ci9GMSA0IDAgUgo+Pgo+PgovQ29udGVudHMgNSAwIFIKPj4KZW5kb2JqCjQgMCBvYmoKPDwKL1R5cGUgL0ZvbnQKL1N1YnR5cGUgL1R5cGUxCi9CYXNlRm9udCAvSGVsdmV0aWNhCj4+CmVuZG9iagoxIDAgb2JqCjw8Ci9UeXBlIC9DYXRhbG9nCi9QYWdlcyAyIDAgUgo+PgplbmRvYmoKNSAwIG9iago8PAovTGVuZ3RoIDQ0Cj4+CnN0cmVhbQpCVAovRjEgMTIgVGYKNzAgNzIwIFRkCihNb2NrIFBERiBDb250ZW50KSBUagpFVAplbmRzdHJlYW0KZW5kb2JqCnhyZWYKMCA2CjAwMDAwMDAwMDAgNjU1MzUgZiAKMDAwMDAwMDAwOSAwMDAwMCBuIAowMDAwMDAwMDU4IDAwMDAwIG4gCjAwMDAwMDAxMTUgMDAwMDAgbiAKMDAwMDAwMDI3OCAwMDAwMCBuIAowMDAwMDAwMzQxIDAwMDAwIG4gCnRyYWlsZXIKPDwKL1NpemUgNgovUm9vdCAxIDAgUgo+PgpzdGFydHhyZWYKNDI3CiUlRU9G';
        return HttpResponse.json({
          id: id,
          mime_type: 'application/pdf',
          size_label: '0 KB',
          content_base64: minimalPdfBase64,
        });
      }
      console.log('[MSW] Reading found, returning content');
      return HttpResponse.json({
        id: reading.id,
        mime_type: reading.mime_type || 'application/pdf',
        size_label: reading.size_label,
        content_base64: reading.content_base64,
      });
    } catch (error) {
      console.error('[MSW] Error fetching reading content', error);
      return err('INTERNAL_ERROR', 'Failed to load reading content', 500);
    }
  }),

  http.post('/api/readings/batch-upload', async ({ request }) => {
    try {
      const body = await request.json().catch(() => ({}));
      const { instructor_id, course_id } = body as { instructor_id?: string; course_id?: string };
      const readingsPayload = (body as { readings?: Array<Record<string, unknown>> }).readings;
      const uploads: Array<Record<string, unknown>> = Array.isArray(readingsPayload)
        ? readingsPayload
        : [];

      if (!instructor_id || !course_id) {
        return HttpResponse.json(
          { detail: 'instructor_id and course_id are required' },
          { status: 400 }
        );
      }
      if (uploads.length === 0) {
        return HttpResponse.json(
          { detail: 'readings array must include at least one item' },
          { status: 400 }
        );
      }

      const now = new Date().toISOString();
      let missingContentIndex: number | null = null;
      const createdReadings: MockReadingRecord[] = uploads.map((reading, index) => {
        const title =
          typeof reading.title === 'string' && reading.title.trim().length > 0
            ? reading.title.trim()
            : `Reading ${index + 1}`;
        const filePath =
          typeof reading.file_path === 'string' && reading.file_path.trim().length > 0
            ? reading.file_path
            : `/storage/uploads/${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`;
        const sourceType =
          reading.source_type === 'reused' || reading.source_type === 'uploaded'
            ? reading.source_type
            : 'uploaded';
        const sizeLabel =
          typeof (reading as { size_label?: string }).size_label === 'string'
            ? (reading as { size_label?: string }).size_label
            : undefined;
        const mimeType =
          typeof (reading as { mime_type?: string }).mime_type === 'string'
            ? (reading as { mime_type?: string }).mime_type
            : 'application/pdf';
        const contentBase64 =
          typeof (reading as { content_base64?: string }).content_base64 === 'string'
            ? (reading as { content_base64?: string }).content_base64
            : null;

        if (!contentBase64 && missingContentIndex === null) {
          missingContentIndex = index;
        }

        const safeContent = contentBase64 ?? '';

        return {
          id: `read_${Date.now()}_${Math.random().toString(36).slice(2)}`,
          instructor_id,
          course_id,
          title,
          file_path: filePath,
          source_type: sourceType as 'uploaded' | 'reused',
          created_at: now,
          size_label: sizeLabel,
          usage_count: 0,
          mime_type: mimeType,
          content_base64: safeContent,
        };
      });

      if (missingContentIndex !== null) {
        return HttpResponse.json(
          { detail: `content_base64 is required for reading index ${missingContentIndex}` },
          { status: 400 }
        );
      }

      saveReadingsFor(course_id, instructor_id, createdReadings);
      logEvent('readings:upload', {
        course_id,
        instructor_id,
        created: createdReadings.length,
      });

      return HttpResponse.json({
        success: true,
        created_count: createdReadings.length,
        readings: createdReadings.map(toReadingResponse),
        errors: [],
      });
    } catch (error) {
      console.error('[MSW] Error uploading readings', error);
      return HttpResponse.json(
        { message: 'Failed to upload readings' },
        { status: 500 }
      );
    }
  }),

  http.delete('/api/readings/:id', async ({ params, request }) => {
    try {
      const { id } = params as { id: string };
      if (!id) {
        return HttpResponse.json({ detail: 'Reading ID is required' }, { status: 400 });
      }
      const url = new URL(request.url);
      const courseId = url.searchParams.get('course_id');
      const instructorId = url.searchParams.get('instructor_id');
      if (!courseId || !instructorId) {
        return HttpResponse.json(
          { detail: 'Both course_id and instructor_id must be provided' },
          { status: 400 }
        );
      }
      const removed = deleteReadingFor(courseId, instructorId, id);
      if (!removed) {
        return HttpResponse.json(
          { message: 'Reading not found' },
          { status: 404 }
        );
      }
      logEvent('readings:delete', { courseId, instructorId, id });
      return HttpResponse.json({ success: true });
    } catch (error) {
      console.error('[MSW] Error deleting reading', error);
      return HttpResponse.json(
        { message: 'Failed to remove reading' },
        { status: 500 }
      );
    }
  }),

  // ======================================
  // Class Profile APIs (spec parity: main.py /api/class-profiles*)
  // TODO backend: wire up to class_profile_service + database.
  // ======================================
  /**
   * SPEC REF:
   *   - lines 369-775 (class profile models + /api/class-profiles/* + edit endpoints)
   * TODO backend:
   *   - Use `class_profile_service` + `course_service` (create_course, create_class_profile_version, etc.).
   *   - Persist versions/history in database rather than `db.classProfiles`.
   * Notes:
   *   - Design considerations are normalized via `normalizeDesignConsiderations` helper to keep FE consistent.
   *   - Approve/Edit/LLM-refine endpoints simply mutate stored JSON; replace with workflow-backed versions later.
   */
  
  // GET /api/class-profiles (get all profiles)
  http.get('/api/class-profiles', async () => {
    const profiles = Array.from(db.classProfiles.values());
    logEvent('class-profiles:list', { count: profiles.length });
    return HttpResponse.json({ profiles });
  }),

  // GET /api/class-profiles/:id
  http.get('/api/class-profiles/:id', async ({ params }) => {
    const { id } = params as { id: string };
    if (!id || id === 'new') {
      return HttpResponse.json({ profile: null }, { status: 404 });
    }

    let profile = db.classProfiles.get(id);
    if (!profile) {
      // Return a default mock profile for testing instead of 404
      const now = new Date().toISOString();
      profile = {
        id: id,
        disciplineInfo: {
          disciplineName: 'Computer Science',
          department: 'Education',
          fieldDescription: 'Computing and software engineering',
        },
        courseInfo: {
          courseName: 'Introduction to Python',
          courseCode: 'CS101',
          description: 'An introductory course to Python programming',
          credits: '3',
          prerequisites: 'None',
          learningObjectives: 'Learn Python basics',
          assessmentMethods: 'Assignments and exams',
          deliveryMode: 'In-person',
        },
        classInfo: {
          semester: 'Fall',
          year: '2024',
          section: '001',
          meetingDays: 'Monday, Wednesday',
          meetingTime: '10:00 AM - 11:30 AM',
          location: 'TBD',
          enrollment: '30',
          background: 'Graduate students from education disciplines',
          priorKnowledge: 'Basic computer literacy',
        },
        generatedProfile: defaultClassProfileText,
        designConsiderations: createDefaultDesignConsiderations(),
        createdAt: now,
        updatedAt: now,
      };
      // Store it so subsequent requests can find it
      db.classProfiles.set(id, profile);
      logEvent('class-profile:get:mock-created', { id });
    }

    logEvent('class-profile:get', { id });
    return HttpResponse.json({ profile });
  }),


  // ======================================
  // Spec-aligned Class Profile Workflow
  // ======================================
  http.post('/api/class-profiles', async ({ request }) => {
    try {
      const body = await request.json().catch((err) => {
        console.error('[MSW] Failed to parse request body:', err);
        throw new Error('Invalid request body: ' + (err instanceof Error ? err.message : String(err)));
      });
      
      logEvent('class-profile:create:request', { 
        bodyKeys: body && typeof body === 'object' ? Object.keys(body) : []
      });
      
      const classInput = (body as { class_input?: Record<string, unknown> }).class_input ?? {};

      let normalizedDisciplineInfo;
      let normalizedCourseInfo;
      let normalizedClassInfo;
      let normalizedDesign;

      try {
        normalizedDisciplineInfo = normalizeDisciplineInfo(
          mapIncomingDisciplineInfo(classInput.discipline_info as Record<string, unknown> | undefined)
        );
      } catch (err) {
        console.error('[MSW] Error normalizing discipline info:', err);
        throw new Error('Failed to normalize discipline info: ' + (err instanceof Error ? err.message : String(err)));
      }

      try {
        normalizedCourseInfo = normalizeCourseInfo(
          mapIncomingCourseInfo(classInput.course_info as Record<string, unknown> | undefined)
        );
      } catch (err) {
        console.error('[MSW] Error normalizing course info:', err);
        throw new Error('Failed to normalize course info: ' + (err instanceof Error ? err.message : String(err)));
      }

      try {
        normalizedClassInfo = normalizeClassInfo(
          mapIncomingClassInfo(classInput.class_info as Record<string, unknown> | undefined)
        );
      } catch (err) {
        console.error('[MSW] Error normalizing class info:', err);
        throw new Error('Failed to normalize class info: ' + (err instanceof Error ? err.message : String(err)));
      }

      try {
        normalizedDesign = mapIncomingDesignConsiderations(
          classInput.design_considerations as Record<string, unknown> | undefined
        );
      } catch (err) {
        console.error('[MSW] Error normalizing design considerations:', err);
        throw new Error('Failed to normalize design considerations: ' + (err instanceof Error ? err.message : String(err)));
      }

      const profileId =
        (body as { class_id?: string }).class_id ||
        `cp_${Date.now()}`;
      const now = new Date().toISOString();
      const generatedProfile = defaultClassProfileText;

      const profile = {
        id: profileId,
        disciplineInfo: normalizedDisciplineInfo,
        courseInfo: normalizedCourseInfo,
        classInfo: normalizedClassInfo,
        generatedProfile,
        designConsiderations: normalizedDesign,
        createdAt: now,
        updatedAt: now,
      };

      db.classProfiles.set(profileId, profile);
      logEvent('class-profile:create', { id: profileId });

      const review = {
        id: profileId,
        status: 'draft',
        text: JSON.stringify({
          profile: generatedProfile,
          design_consideration: (classInput as Record<string, unknown>).design_considerations ?? {},
          design_considerations: (classInput as Record<string, unknown>).design_considerations ?? {},
        }),
        metadata: {
          title: (body as { title?: string }).title,
          course_code: (body as { course_code?: string }).course_code,
        },
      };

      return HttpResponse.json({
        review,
        class_profile: profile,
        class_id: profileId,
      });
    } catch (error) {
      console.error('[MSW] Error in POST /api/class-profiles', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : String(error);
      console.error('[MSW] Error details:', { errorMessage, errorStack });
      return HttpResponse.json(
        { 
          message: `Failed to generate profile: ${errorMessage}`,
          error: process.env.NODE_ENV === 'development' ? errorStack : undefined
        },
        { status: 500 }
      );
    }
  }),

  http.put('/api/class-profiles/:id', async ({ params, request }) => {
    try {
      const { id } = params as { id: string };
      const existingProfile = db.classProfiles.get(id);
      if (!existingProfile) {
        return HttpResponse.json(
          { message: 'Class profile not found' },
          { status: 404 }
        );
      }

      const body = await request.json().catch(() => ({}));
      const classInput = (body as { class_input?: Record<string, unknown> }).class_input;
      const normalizedDesign = classInput?.design_considerations
        ? mapIncomingDesignConsiderations(classInput.design_considerations as Record<string, unknown>)
        : existingProfile.designConsiderations;

      const updatedProfile = {
        ...existingProfile,
        disciplineInfo: classInput?.discipline_info
          ? normalizeDisciplineInfo(
              mapIncomingDisciplineInfo(classInput.discipline_info as Record<string, unknown>)
            )
          : existingProfile.disciplineInfo,
        courseInfo: classInput?.course_info
          ? normalizeCourseInfo(
              mapIncomingCourseInfo(classInput.course_info as Record<string, unknown>)
            )
          : existingProfile.courseInfo,
        classInfo: classInput?.class_info
          ? normalizeClassInfo(
              mapIncomingClassInfo(classInput.class_info as Record<string, unknown>)
            )
          : existingProfile.classInfo,
        generatedProfile:
          typeof (body as { generated_profile?: string }).generated_profile === 'string'
            ? (body as { generated_profile?: string }).generated_profile
            : existingProfile.generatedProfile,
        designConsiderations: normalizedDesign,
        updatedAt: new Date().toISOString(),
      };

      db.classProfiles.set(id, updatedProfile);
      logEvent('class-profile:update', { id, source: 'spec' });

      return HttpResponse.json({
        message: 'Class profile updated successfully',
        profile: updatedProfile,
      });
    } catch (error) {
      console.error('[MSW] Error in PUT /api/class-profiles/:id', error);
      return HttpResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }),

  http.post('/api/class-profiles/:id/approve', async ({ params, request }) => {
    try {
      const { id } = params as { id: string };
      const profile = db.classProfiles.get(id);
      if (!profile) {
        return HttpResponse.json(
          { message: 'Class profile not found' },
          { status: 404 }
        );
      }

      const body = await request.json().catch(() => ({}));
      const updatedText = (body as { updated_text?: string }).updated_text;
      let exportedProfile: Record<string, unknown> = {
        profile: profile.generatedProfile ?? defaultClassProfileText,
      };

      if (updatedText && typeof updatedText === 'string') {
        try {
          const parsed = JSON.parse(updatedText);
          exportedProfile = parsed;
          if (typeof parsed.profile === 'string') {
            profile.generatedProfile = parsed.profile;
          }
        } catch {
          profile.generatedProfile = updatedText;
        }
      }

      profile.updatedAt = new Date().toISOString();
      db.classProfiles.set(id, profile);
      logEvent('class-profile:approve', { id });

      return HttpResponse.json({
        class_profile: exportedProfile,
      });
    } catch (error) {
      console.error('[MSW] Error in POST /api/class-profiles/:id/approve', error);
      return HttpResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }),

  http.post('/api/class-profiles/:id/edit', async ({ params, request }) => {
    try {
      const { id } = params as { id: string };
      const profile = db.classProfiles.get(id);
      if (!profile) {
        return HttpResponse.json(
          { message: 'Class profile not found' },
          { status: 404 }
        );
      }

      const body = await request.json().catch(() => ({}));
      const newText = (body as { new_text?: string }).new_text;
      if (!newText || typeof newText !== 'string') {
        return HttpResponse.json(
          { message: 'new_text is required' },
          { status: 400 }
        );
      }

      profile.generatedProfile = newText;
      profile.updatedAt = new Date().toISOString();
      db.classProfiles.set(id, profile);
      logEvent('class-profile:edit', { id });

      return HttpResponse.json({
        review: {
          id,
          status: 'draft',
          text: newText,
        },
      });
    } catch (error) {
      console.error('[MSW] Error in POST /api/class-profiles/:id/edit', error);
      return HttpResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }),

  http.post('/api/class-profiles/:id/llm-refine', async ({ params, request }) => {
    try {
      const { id } = params as { id: string };
      const profile = db.classProfiles.get(id);
      if (!profile) {
        return HttpResponse.json(
          { message: 'Class profile not found' },
          { status: 404 }
        );
      }

      const body = await request.json().catch(() => ({}));
      const prompt = (body as { prompt?: string }).prompt ?? 'N/A';
      const refinedText = `${profile.generatedProfile ?? defaultClassProfileText}\n\n[Refined with AI prompt: ${prompt}]`;

      profile.generatedProfile = refinedText;
      profile.updatedAt = new Date().toISOString();
      db.classProfiles.set(id, profile);
      logEvent('class-profile:llm_refine', { id });

      return HttpResponse.json({
        review: {
          id,
          status: 'draft',
          text: refinedText,
        },
      });
    } catch (error) {
      console.error('[MSW] Error in POST /api/class-profiles/:id/llm-refine', error);
      return HttpResponse.json(
        { message: 'Internal server error' },
        { status: 500 }
      );
    }
  }),
];
