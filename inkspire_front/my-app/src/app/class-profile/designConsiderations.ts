const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const DEFAULT_PROFILE_INTRO_SNIPPET =
  'This discipline focuses on computing and software engineering';

export const DESIGN_CONSIDERATION_FIELDS = [
  {
    key: 'theoryFocus',
    label: 'Theory focus',
    placeholder: 'Describe the primary learning theory or pedagogical stance guiding this course.',
    options: [
      'Epistemology',
      'Overarching concepts, themes, and frameworks',
      'Inquiry practices and strategies',
      'Representational forms',
      'Discourse and language structures',
      'Other',
    ],
    aliases: ['Theory Focus', 'Theoretical focus'],
  },
  {
    key: 'disciplinaryWaysOfKnowing',
    label: 'Disciplinary ways of knowing',
    placeholder: 'Summarize how this field gathers evidence, validates knowledge, and reasons about problems.',
    aliases: ['Disciplinary ways of knowing', 'Ways of knowing'],
  },
  {
    key: 'coursePriorities',
    label: 'Course priorities',
    placeholder: 'List the instructional moves, scaffolds, or rituals that should stay front and center.',
    aliases: ['Course priorities'],
  },
  {
    key: 'classSpecificGoals',
    label: 'Class-specific learning goals',
    placeholder: 'Capture the signature outcomes or mindsets this teaching team wants to emphasize.',
    aliases: ['Class-specific learning goals', 'Class learning goals'],
  },
  {
    key: 'userDefined',
    label: 'User-defined considerations',
    placeholder: 'Add any additional constraints, rituals, accessibility needs, or collaboration norms.',
    aliases: ['User-defined considerations', 'User defined considerations'],
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

