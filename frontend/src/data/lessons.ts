export type LessonLevel = 'Beginner' | 'Elementary' | 'Intermediate' | 'Advanced' | 'Expert';

export type LessonFocusType =
  | 'posture'
  | 'finger-placement'
  | 'home-row'
  | 'letters'
  | 'words'
  | 'combinations'
  | 'sentences'
  | 'capitalization'
  | 'punctuation'
  | 'numbers'
  | 'speed'
  | 'accuracy'
  | 'endurance';

export interface LessonDefinition {
  id: string;
  order: number;
  level: LessonLevel;
  focusType: LessonFocusType;
  title: string;
  description: string;
  targetWpm: number;
  targetAccuracy: number;
  fingerHint: string;
  postureTip?: string;
  content: string;
}

export const LEARNING_CURRICULUM: LessonDefinition[] = [
  {
    id: 'beg-0-posture-setup',
    order: 1,
    level: 'Beginner',
    focusType: 'posture',
    title: 'Posture & Keyboard Positioning',
    description: 'Establish neutral wrists, relaxed shoulders, and tactile home-row orientation.',
    targetWpm: 15,
    targetAccuracy: 94,
    fingerHint: 'Keep forearms parallel to the floor, wrists floating slightly above the desk, and feel the bumps on F and J.',
    postureTip: 'Sit upright with feet flat on the floor, screen at eye level, and elbows bent around 90 degrees.',
    content: 'ff jj ff jj fj jf ff jj asdf jkl; fjdk slaj ghfj fdsa ;lkj',
  },
  {
    id: 'beg-1-home-row-anchors',
    order: 2,
    level: 'Beginner',
    focusType: 'finger-placement',
    title: 'Home Row Anchors (F & J)',
    description: 'Build tactile awareness of index finger anchors on F and J with steady spacing.',
    targetWpm: 18,
    targetAccuracy: 94,
    fingerHint: 'Rest left index on F, right index on J, and thumbs lightly over Space.',
    content: 'fff jjj fjf jfj ff jj fj jf fff jjj fff jjj fjfj jfjf ffjj jjff',
  },
  {
    id: 'beg-2-home-row-left-right',
    order: 3,
    level: 'Beginner',
    focusType: 'home-row',
    title: 'Full Home Row Mastery',
    description: 'Coordinate ASDF and JKL; without looking down at the keyboard.',
    targetWpm: 22,
    targetAccuracy: 94,
    fingerHint: 'Left fingers: A(pinky) S(ring) D(middle) F(index). Right: J(index) K(middle) L(ring) ;(pinky).',
    content: 'asdf jkl; asdf jkl; dad sad lad fall ask flask salad glass hall; ask dad; all fall;',
  },
  {
    id: 'beg-3-home-row-reach',
    order: 4,
    level: 'Beginner',
    focusType: 'letters',
    title: 'Center Reach & Basic Words (G, H)',
    description: 'Extend index fingers inward to G and H and return immediately to form basic words.',
    targetWpm: 25,
    targetAccuracy: 94,
    fingerHint: 'Move left index to G and snap back to F; move right index to H and snap back to J.',
    content: 'fgf jhj glad half hash gash dash flash flag hall shall gag hag glad lad had a half glass',
  },
  {
    id: 'elem-1-top-row-vowels',
    order: 5,
    level: 'Elementary',
    focusType: 'letters',
    title: 'Top Row Vowels (E, I, O, U)',
    description: 'Introduce high-frequency top row reaches while keeping wrists neutral.',
    targetWpm: 30,
    targetAccuracy: 95,
    fingerHint: 'E with left middle, U with right index, I with right middle, O with right ring.',
    content: 'deed kiik loo juuj side ride file life idea oil soil fold gold guide loud solid issue',
  },
  {
    id: 'elem-2-common-words',
    order: 6,
    level: 'Elementary',
    focusType: 'words',
    title: 'Top-Row & Home-Row Words',
    description: 'Practice natural English word rhythms combining home and upper rows.',
    targetWpm: 35,
    targetAccuracy: 95,
    fingerHint: 'Keep unused fingers hovering gently over home keys.',
    content: 'our work just took real effort today; quiet focus helps you write clear thoughts faster',
  },
  {
    id: 'elem-3-bottom-row',
    order: 7,
    level: 'Elementary',
    focusType: 'letters',
    title: 'Bottom Row Coordination',
    description: 'Master downward finger curls for Z, X, C, V, B, N, and M.',
    targetWpm: 36,
    targetAccuracy: 94,
    fingerHint: 'Curl fingers downward without shifting your whole palm down.',
    content: 'calm cave move next van box mix zero cabin branch balance combine examine dynamic',
  },
  {
    id: 'int-0-common-combinations',
    order: 8,
    level: 'Intermediate',
    focusType: 'combinations',
    title: 'Common Letter Combinations',
    description: 'Drill high-frequency English bigrams and trigrams (th, ch, sh, ing, tion) smoothly.',
    targetWpm: 42,
    targetAccuracy: 95,
    fingerHint: 'Anticipate the second letter in each pair so transitions flow without hesitation.',
    content: 'think through each action; crafting strong habits brings lasting growth and smooth motion',
  },
  {
    id: 'int-1-sentences',
    order: 9,
    level: 'Intermediate',
    focusType: 'sentences',
    title: 'Fluid Sentences & Capitalization',
    description: 'Develop steady rhythm across complete sentences with opposite-hand Shift capitalization.',
    targetWpm: 45,
    targetAccuracy: 96,
    fingerHint: 'Use the opposite-hand pinky for Shift keys to maintain hand balance.',
    content: 'Steady typing rhythm grows from calm focus. Every clean word reinforces reliable muscle memory across daily sessions.',
  },
  {
    id: 'int-2-punctuation',
    order: 10,
    level: 'Intermediate',
    focusType: 'punctuation',
    title: 'Punctuation & Dialogue Flow',
    description: 'Type commas, periods, colons, semicolons, and quotes without breaking pace.',
    targetWpm: 46,
    targetAccuracy: 95,
    fingerHint: 'Right pinky handles semicolon, colon, and quotes; ring and middle handle period and comma.',
    content: 'Plan clearly: test early, measure results, and refine; "Small gains compound," she noted.',
  },
  {
    id: 'int-3-numbers',
    order: 11,
    level: 'Intermediate',
    focusType: 'numbers',
    title: 'Numbers & Technical Symbols',
    description: 'Build confidence reaching the top number row and shifted symbols for ports, dates, and ratios.',
    targetWpm: 42,
    targetAccuracy: 95,
    fingerHint: 'Anchor a nearby finger on the home row so you always find your way back after reaching up.',
    content: 'Server #404 responded in 18 ms on port 8080 (99.5% uptime); release v2.6.9 shipped 25-Nov-2026!',
  },
  {
    id: 'adv-1-speed-bursts',
    order: 12,
    level: 'Advanced',
    focusType: 'speed',
    title: 'High-Frequency Burst Speed',
    description: 'Read ahead 2 words at a time to eliminate pauses between common words.',
    targetWpm: 62,
    targetAccuracy: 96,
    fingerHint: 'Look one word ahead of the active caret to keep keystrokes flowing smoothly.',
    content: 'there will always be more work when systems grow faster and teams ship reliable software every week across modern cloud platforms',
  },
  {
    id: 'adv-2-accuracy-lock',
    order: 13,
    level: 'Advanced',
    focusType: 'accuracy',
    title: 'Difficult Words & Precision Drill',
    description: 'Handle tricky consonant clusters, double letters, and complex vocabulary without typos.',
    targetWpm: 58,
    targetAccuracy: 98,
    fingerHint: 'Keep your cadence even on double letters and avoid rushing transitions.',
    content: 'parallel commitment addresses subtle concurrency bottlenecks while maintaining deterministic accountability across distributed infrastructure',
  },
  {
    id: 'adv-3-long-paragraphs',
    order: 14,
    level: 'Advanced',
    focusType: 'endurance',
    title: 'Long-Form Paragraph Endurance',
    description: 'Sustain consistent pace and posture through an extended multi-sentence technical paragraph.',
    targetWpm: 64,
    targetAccuracy: 96,
    fingerHint: 'Keep shoulders loose and breathe steadily across sentence boundaries to prevent late-passage fatigue.',
    content: 'Consistent performance comes from deliberate repetition rather than reckless bursts. When you prioritize clean finger placement first, your fingers learn predictable paths across the keyboard. Over weeks of calm practice, hesitation fades and high typing velocity emerges naturally without extra strain.',
  },
  {
    id: 'exp-1-endurance',
    order: 15,
    level: 'Expert',
    focusType: 'endurance',
    title: 'Mixed-Content & Advanced Punctuation',
    description: 'Sustain high speed across mixed prose, numbers, symbols, and dense punctuation.',
    targetWpm: 75,
    targetAccuracy: 97,
    fingerHint: 'Keep wrists neutral during rapid Shift transitions between symbols and alphanumeric characters.',
    content: 'Engineering resilient software requires disciplined measurement: monitor 99th-percentile latency (< 45 ms), validate schema migrations [0001..0009], and keep every critical module independently testable from commit #104 onward.',
  },
  {
    id: 'exp-2-pro-challenge',
    order: 16,
    level: 'Expert',
    focusType: 'speed',
    title: 'Professional Typing Challenge',
    description: 'Master-level endurance test combining speed, complex vocabulary, numbers, and symbols.',
    targetWpm: 82,
    targetAccuracy: 97,
    fingerHint: 'Maintain uniform cadence on punctuation boundaries and read two words ahead.',
    content: 'Production telemetry reported 14,820 requests/sec at 99.98% availability; post-incident verification confirmed zero regressions across auth, WebSocket race synchronization, and PostgreSQL connection pooling (max_size=32).',
  },
];

export const LESSON_LEVELS: LessonLevel[] = [
  'Beginner',
  'Elementary',
  'Intermediate',
  'Advanced',
  'Expert',
];
