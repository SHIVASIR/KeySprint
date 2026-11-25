import type { DifficultyLevel } from '../engine/typingEngine';

export type ContentCategory =
  | 'general'
  | 'technology'
  | 'business'
  | 'education'
  | 'quotes'
  | 'programming';

export const WORD_BANKS: Record<ContentCategory, Record<DifficultyLevel, string[]>> = {
  general: {
    easy: [
      'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can', 'had',
      'her', 'was', 'one', 'our', 'out', 'day', 'get', 'has', 'him', 'his',
      'how', 'man', 'new', 'now', 'old', 'see', 'two', 'way', 'who', 'boy',
      'did', 'its', 'let', 'put', 'say', 'she', 'too', 'use', 'home', 'time',
      'work', 'make', 'year', 'back', 'good', 'just', 'know', 'take', 'into', 'your',
      'some', 'them', 'than', 'then', 'look', 'only', 'come', 'over', 'also', 'well',
      'even', 'want', 'give', 'most', 'find', 'here', 'many', 'line', 'turn', 'move',
      'play', 'read', 'hand', 'high', 'keep', 'last', 'name', 'same', 'show', 'part',
    ],
    medium: [
      'about', 'after', 'again', 'always', 'around', 'because', 'before', 'between',
      'bridge', 'bright', 'building', 'change', 'circle', 'clarity', 'climate', 'complete',
      'consider', 'control', 'create', 'current', 'decide', 'deliver', 'design', 'detail',
      'develop', 'direct', 'discover', 'distance', 'effort', 'element', 'energy', 'enough',
      'evening', 'example', 'explain', 'explore', 'express', 'feature', 'feeling', 'figure',
      'follow', 'forest', 'forward', 'freedom', 'friendly', 'future', 'garden', 'gather',
      'general', 'gentle', 'ground', 'growth', 'handle', 'happen', 'health', 'history',
      'honest', 'improve', 'include', 'increase', 'inspire', 'instead', 'journey', 'justice',
      'keeper', 'kitchen', 'language', 'learning', 'library', 'listen', 'machine', 'manage',
      'manner', 'market', 'measure', 'memory', 'message', 'method', 'minute', 'modern',
    ],
    hard: [
      'acceleration', 'accomplishment', 'accountability', 'acknowledgment', 'adaptability',
      'architecture', 'articulation', 'characteristic', 'chronological', 'collaboration',
      'comprehension', 'concentration', 'configuration', 'consequence', 'consistency',
      'coordination', 'craftsmanship', 'determination', 'differentiate', 'discipline',
      'effectiveness', 'equilibrium', 'extraordinary', 'fundamental', 'implementation',
      'improvisation', 'infrastructure', 'intellectual', 'interpretation', 'investigation',
      'justification', 'knowledgeable', 'manifestation', 'methodology', 'modification',
      'multiplication', 'neighborhood', 'observation', 'optimization', 'organization',
      'participation', 'perseverance', 'perspective', 'phenomenon', 'philosophical',
      'prerequisite', 'prioritization', 'productivity', 'qualification', 'recognition',
      'reconciliation', 'reliability', 'representation', 'responsibility', 'significance',
      'simplification', 'sophisticated', 'specification', 'sustainability', 'synchronization',
    ],
  },
  technology: {
    easy: [
      'code', 'data', 'disk', 'file', 'host', 'link', 'load', 'loop', 'node', 'page',
      'path', 'ping', 'port', 'save', 'scan', 'send', 'sync', 'task', 'tech', 'test',
      'tool', 'type', 'unit', 'user', 'view', 'web', 'wire', 'byte', 'chip', 'core',
      'grid', 'icon', 'keys', 'logs', 'menu', 'mode', 'pack', 'pipe', 'plug', 'rate',
    ],
    medium: [
      'access', 'backup', 'binary', 'branch', 'buffer', 'cache', 'client', 'cloud',
      'cluster', 'commit', 'compile', 'compute', 'config', 'console', 'cookie', 'crypto',
      'cursor', 'daemon', 'debug', 'deploy', 'device', 'domain', 'docker', 'driver',
      'editor', 'encode', 'engine', 'export', 'filter', 'format', 'frame', 'gateway',
      'github', 'header', 'import', 'index', 'kernel', 'latency', 'layout', 'logger',
      'memory', 'metric', 'module', 'network', 'object', 'packet', 'parser', 'patch',
      'plugin', 'portal', 'process', 'prompt', 'proxy', 'python', 'query', 'queue',
      'render', 'router', 'schema', 'script', 'search', 'secret', 'server', 'socket',
    ],
    hard: [
      'abstraction', 'algorithmic', 'asynchronous', 'authentication', 'authorization',
      'availability', 'benchmarking', 'cryptography', 'decomposition', 'deterministic',
      'distributed', 'encapsulation', 'observability', 'orchestration', 'parallelism',
      'polymorphism', 'provisioning', 'reconciliation', 'redundancy', 'refactoring',
      'replication', 'resiliency', 'serialization', 'sharding', 'telemetry',
      'throughput', 'tokenization', 'transpilation', 'virtualization', 'vulnerability',
    ],
  },
  business: {
    easy: [
      'plan', 'goal', 'team', 'lead', 'cost', 'sale', 'firm', 'deal', 'fund', 'gain',
      'grow', 'hire', 'item', 'list', 'loan', 'mark', 'meet', 'name', 'need', 'note',
      'paid', 'peer', 'risk', 'role', 'rule', 'shop', 'sign', 'size', 'step', 'term',
    ],
    medium: [
      'account', 'acquire', 'agenda', 'align', 'analyst', 'annual', 'approve', 'asset',
      'audit', 'balance', 'benefit', 'billing', 'brand', 'budget', 'capital', 'career',
      'channel', 'client', 'commerce', 'company', 'compare', 'contract', 'convert', 'credit',
      'culture', 'customer', 'deadline', 'deliver', 'demand', 'deposit', 'discuss', 'equity',
      'expense', 'finance', 'forecast', 'founder', 'funding', 'growth', 'impact', 'income',
      'invoice', 'journal', 'launch', 'leader', 'margin', 'market', 'meeting', 'mentor',
    ],
    hard: [
      'acquisition', 'amortization', 'benchmarking', 'capitalization', 'collaboration',
      'commercialization', 'competitiveness', 'consolidation', 'contingencies', 'deliverables',
      'diversification', 'entrepreneurship', 'forecasting', 'incorporation', 'infrastructure',
      'negotiation', 'operationalize', 'organizational', 'profitability', 'procurement',
      'reconciliation', 'restructuring', 'scalability', 'shareholders', 'sustainability',
    ],
  },
  education: {
    easy: [
      'book', 'desk', 'exam', 'fact', 'idea', 'note', 'page', 'pen', 'quiz', 'read',
      'room', 'rule', 'step', 'study', 'term', 'test', 'text', 'word', 'write', 'learn',
      'class', 'grade', 'guide', 'habit', 'skill', 'teach', 'topic', 'train', 'tutor', 'voice',
    ],
    medium: [
      'academic', 'achieve', 'algebra', 'analyze', 'article', 'assign', 'biology', 'chapter',
      'clarity', 'college', 'concept', 'context', 'course', 'creative', 'critical', 'debate',
      'degree', 'diagram', 'diploma', 'discuss', 'drawing', 'educate', 'element', 'essays',
      'explore', 'faculty', 'formula', 'grammar', 'history', 'inquiry', 'journal', 'lecture',
      'library', 'literacy', 'logic', 'meaning', 'measure', 'mention', 'outline', 'physics',
    ],
    hard: [
      'bibliography', 'categorization', 'comprehension', 'conceptualize', 'curriculum',
      'demonstration', 'differentiation', 'dissertation', 'encyclopedia', 'epistemology',
      'experimentation', 'generalization', 'historiography', 'hypothesis', 'interdisciplinary',
      'interpretation', 'mathematics', 'methodology', 'pedagogical', 'qualification',
      'rationalization', 'scholarship', 'specialization', 'terminology', 'vocabulary',
    ],
  },
  quotes: {
    easy: [
      'Practice makes progress every single day.',
      'Small steady steps carry you farther than sudden sprints.',
      'Clarity of thought leads to clarity of movement.',
      'Accuracy first builds speed that lasts.',
      'Focus on the next keystroke and let rhythm follow.',
    ],
    medium: [
      'Discipline is choosing between what you want now and what you want most in the long run.',
      'Quality is never an accident; it is always the result of intelligent effort and patient practice.',
      'Simplicity is about subtracting the obvious and adding the meaningful to your daily craft.',
      'The secret of getting ahead is getting started with calm consistency and measurable goals.',
      'We are what we repeatedly do. Excellence, then, is not an act, but a reliable habit.',
    ],
    hard: [
      'Measuring precision before raw velocity prevents ingrained errors from compounding across thousands of future keystrokes.',
      'Great engineering, much like fluent typing, emerges when foundational fundamentals become effortless muscle memory.',
      'Continuous deliberate practice transforms conscious hesitation into smooth, rhythmic, low-latency execution.',
      'Independent tools built on open standards empower learners everywhere to inspect, adapt, and master their craft.',
    ],
  },
  programming: {
    easy: [
      'let', 'const', 'var', 'def', 'fn', 'int', 'str', 'bool', 'list', 'dict',
      'map', 'set', 'for', 'while', 'if', 'else', 'elif', 'try', 'catch', 'return',
      'true', 'false', 'null', 'none', 'void', 'main', 'args', 'self', 'this', 'import',
    ],
    medium: [
      'async', 'await', 'class', 'struct', 'enum', 'trait', 'export', 'module', 'package',
      'interface', 'function', 'Promise', 'Record', 'filter', 'reduce', 'forEach', 'length',
      'string', 'number', 'boolean', 'object', 'array', 'vector', 'Result', 'Option',
      'static', 'public', 'private', 'extends', 'implements', 'throws', 'finally', 'switch',
    ],
    hard: [
      'constructor', 'polymorphism', 'implementation', 'serialization', 'deserialization',
      'synchronization', 'middleware', 'dependency', 'configuration', 'authentication',
      'authorization', 'observability', 'instrumentation', 'concurrency', 'deterministic',
      'immutability', 'encapsulation', 'architecture', 'abstraction', 'refactoring',
    ],
  },
};

const PUNCTUATION_MARKS = [',', '.', ';', ':', '!', '?'];
const SPECIAL_WRAPPERS: Array<[string, string]> = [
  ['(', ')'],
  ['[', ']'],
  ['"', '"'],
  ["'", "'"],
];

export interface TextGenerationOptions {
  mode: 'time' | 'words' | 'content' | 'custom';
  wordLimit: number;
  category: ContentCategory;
  difficulty: DifficultyLevel;
  punctuation: boolean;
  numbers: boolean;
  specialChars: boolean;
  customText?: string;
}

export function generatePracticeText(options: TextGenerationOptions): string {
  if (options.mode === 'custom' && options.customText && options.customText.trim().length > 0) {
    return options.customText.trim().replace(/\s+/g, ' ');
  }

  // Quotes mode uses curated full sentences
  if (options.category === 'quotes') {
    const bank = WORD_BANKS.quotes[options.difficulty];
    const targetWords = options.mode === 'words' ? options.wordLimit : 50;
    const picked: string[] = [];
    let count = 0;
    let idx = Math.floor(Math.random() * bank.length);
    while (count < targetWords && picked.length < 8) {
      const sentence = bank[idx % bank.length];
      picked.push(sentence);
      count += sentence.split(' ').length;
      idx++;
    }
    const joined = picked.join(' ');
    if (options.mode === 'words') {
      return joined.split(' ').slice(0, options.wordLimit).join(' ');
    }
    return joined;
  }

  const bank = WORD_BANKS[options.category]?.[options.difficulty] ?? WORD_BANKS.general.medium;
  const wordCount =
    options.mode === 'words'
      ? Math.max(5, options.wordLimit)
      : options.mode === 'content'
        ? 45
        : 90; // Enough words for up to 120s without running out easily

  const words: string[] = [];
  let lastWord = '';

  for (let i = 0; i < wordCount; i++) {
    let candidate = bank[Math.floor(Math.random() * bank.length)];
    if (candidate === lastWord && bank.length > 1) {
      candidate = bank[(bank.indexOf(candidate) + 1) % bank.length];
    }
    lastWord = candidate;

    // Optional numbers injection
    if (options.numbers && i > 0 && i % 7 === 0) {
      const num = String(Math.floor(10 + Math.random() * 980));
      words.push(num);
      continue;
    }

    let word = candidate;

    // Capitalize sentence starts when punctuation is enabled
    if (options.punctuation) {
      if (i === 0 || (words[i - 1] && /[.!?]$/.test(words[i - 1]))) {
        word = word.charAt(0).toUpperCase() + word.slice(1);
      } else if (i % 6 === 5 && i < wordCount - 1) {
        const mark = PUNCTUATION_MARKS[Math.floor(Math.random() * PUNCTUATION_MARKS.length)];
        word = `${word}${mark}`;
      }
    }

    if (options.specialChars && i % 9 === 4) {
      const [open, close] = SPECIAL_WRAPPERS[i % SPECIAL_WRAPPERS.length];
      word = `${open}${word}${close}`;
    }

    words.push(word);
  }

  if (options.punctuation && words.length > 0 && !/[.!?]$/.test(words[words.length - 1])) {
    words[words.length - 1] = `${words[words.length - 1]}.`;
  }

  return words.join(' ');
}
