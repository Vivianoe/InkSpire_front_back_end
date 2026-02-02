const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_PROFILE_INTRO_SNIPPET =
  'This discipline focuses on computing and software engineering';

export const DESIGN_CONSIDERATION_FIELDS = [
  {
    key: 'theoryFocus',
    label: 'Theory focus',
    placeholder: 'Describe the aspects of the disciplinary literacy theory you\'d like to emphasize in this course.',
    options: [
      'Epistemology of science (emphasize the tentative and iterative nature of efforts to explain phenomena that occur in the natural world)',
      'Overarching concepts, themes, and frameworks (frameworks, key concepts, and themes that reflect unifying or general concepts and themes in science)',
      'Inquiry practices and strategies (build scientific knowledge by developing coherent, logical explanations, models or arguments from evidence)',
      'Representational forms (a variety of prototypical ways of structuring and presenting scientific information)',
      'Discourse and language structures (Prototypical language structures in science)',
    ],
    aliases: ['Theory Focus', 'Theoretical focus'],
  },
  {
    key: 'disciplinaryWaysOfKnowing',
    label: 'Teaching priorities',
    placeholder: 'What do you want to prioritize most when designing learning activities or scaffolds for this course?',
    options: [
      'Conceptual understanding over coverage',
      'Process and reasoning over final answers',
      'Multiple perspectives rather than a single "correct" view',
      'Student explanation over instructor explanation',
      'Depth over speed',
      'Other',
    ],
    aliases: ['Teaching priorities', 'Disciplinary ways of knowing', 'Ways of knowing'],
  },
  {
    key: 'coursePriorities',
    label: 'What to avoid?',
    placeholder: 'Are there things you actively want to avoid in this course?',
    options: [
      'Over-scaffolding',
      'Giving away answers too early',
      'Overly technical language',
      'Overemphasis on correctness',
      'Excessive cognitive load',
      'Other',
    ],
    aliases: ['What to avoid?', 'Course priorities'],
  },
  {
    key: 'userDefined',
    label: 'Any other considerations for the design',
    placeholder: 'Add any additional constraints, rituals, accessibility needs, or collaboration norms.',
    aliases: [
      'Any other considerations for the design',
      'User-defined considerations',
      'User defined considerations',
    ],
  },
] as const;

export type DesignConsiderationField = (typeof DESIGN_CONSIDERATION_FIELDS)[number];
export type DesignConsiderationKey = DesignConsiderationField['key'];
export type DesignConsiderations = Record<DesignConsiderationKey, string>;

export const createEmptyDesignConsiderations = (): DesignConsiderations =>
  DESIGN_CONSIDERATION_FIELDS.reduce((acc, field) => {
    acc[field.key] = '';
    return acc;
  }, {} as DesignConsiderations);

const labelKeyPairs = DESIGN_CONSIDERATION_FIELDS.flatMap(field => {
  const entries = [field.label, ...(field.aliases ?? [])];
  return entries.map(entry => [entry.toLowerCase(), field.key] as const);
});

export const DEFAULT_USER_DEFINED_CONSIDERATION = '';

export const createDefaultDesignConsiderations = (): DesignConsiderations => ({
  ...createEmptyDesignConsiderations(),
});

const headingPattern = new RegExp(
  `(?:^|\\n)\\s*(?:\\d+\\.\\s*)?(?:${labelKeyPairs
    .map(([label]) => escapeRegExp(label))
    .join('|')})\\s*:`,
  'gi'
);

const lookupKeyByLabel = (label: string): DesignConsiderationKey | null => {
  const normalized = label.trim().toLowerCase();
  const match = labelKeyPairs.find(([entry]) => entry === normalized);
  return match ? match[1] : null;
};

export const normalizeDesignConsiderations = (
  draft?: Partial<DesignConsiderations> | null
): DesignConsiderations => {
  const base = createEmptyDesignConsiderations();
  if (!draft) {
    return base;
  }
  DESIGN_CONSIDERATION_FIELDS.forEach(field => {
    const value = draft[field.key];
    base[field.key] = value ? value.trim() : '';
  });
  return base;
};

export const parseDesignConsiderations = (text?: string | null): DesignConsiderations => {
  const result = createEmptyDesignConsiderations();
  if (!text) {
    return result;
  }

  const normalized = text.replace(/\r\n/g, '\n');
  const matches = Array.from(normalized.matchAll(headingPattern));

  if (!matches.length) {
    result.userDefined = normalized.trim();
    return result;
  }

  matches.forEach((match, index) => {
    const fullMatch = match[0];
    const labelFragment = fullMatch.replace(/\n/g, '').replace(/\d+\.\s*/, '');
    const colonIndex = labelFragment.indexOf(':');
    const rawLabel = colonIndex >= 0 ? labelFragment.slice(0, colonIndex).trim() : labelFragment.trim();
    const key = lookupKeyByLabel(rawLabel);
    if (!key) {
      return;
    }
    const startIndex = (match.index ?? 0) + fullMatch.length;
    const endIndex = index + 1 < matches.length ? matches[index + 1].index ?? normalized.length : normalized.length;
    result[key] = normalized.slice(startIndex, endIndex).trim();
  });

  const intro = normalized.slice(0, matches[0].index ?? 0).trim();
  if (intro) {
    result.userDefined = [result.userDefined, intro].filter(Boolean).join('\n\n').trim();
  }

  if (
    result.userDefined &&
    result.userDefined.trim().startsWith(DEFAULT_PROFILE_INTRO_SNIPPET)
  ) {
    result.userDefined = '';
  }

  if (!result.userDefined) {
    result.userDefined = '';
  }

  return result;
};

export const formatDesignConsiderations = (data: DesignConsiderations): string =>
  DESIGN_CONSIDERATION_FIELDS.map(field => {
    const value = data[field.key]?.trim();
    if (!value) {
      return '';
    }
    return `${field.label}:\n${value}`;
  })
    .filter(Boolean)
    .join('\n\n');

/**
 * Compare two design considerations objects for exact equality across all fields.
 * Normalizes values before comparison (trims whitespace, treats empty string/null/undefined as equivalent).
 */
export const areDesignConsiderationsEqual = (
  a: DesignConsiderations | null | undefined,
  b: DesignConsiderations | null | undefined
): boolean => {
  // Handle null/undefined cases
  if (!a && !b) return true;
  if (!a || !b) return false;

  // Normalize both objects
  const normalizedA = normalizeDesignConsiderations(a);
  const normalizedB = normalizeDesignConsiderations(b);

  // Compare all configured fields
  return DESIGN_CONSIDERATION_FIELDS.every(field => {
    const valueA = (normalizedA[field.key] || '').trim();
    const valueB = (normalizedB[field.key] || '').trim();
    return valueA === valueB;
  });
};
