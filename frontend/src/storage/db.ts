import type { TimelineSample, TypingMetrics } from '../engine/calculations';
import type { AggregateKeyStore } from '../engine/coachEngine';
import type { TestMode, DifficultyLevel } from '../engine/typingEngine';

export interface StoredTestResult {
  id: string;
  clientRecordId: string;
  createdAt: string;
  mode: TestMode;
  category: string;
  difficulty: DifficultyLevel;
  durationConfig: number;
  wordLimitConfig: number;
  language?: string;
  metrics: TypingMetrics;
  timeline: TimelineSample[];
  syncedToCloud: boolean;
  source: 'guest' | 'account';
  verifiedCompetitive: boolean;
}

export interface StoredLessonProgress {
  lessonId: string;
  completed: boolean;
  bestWpm: number;
  bestAccuracy: number;
  attempts: number;
  lastPracticedAt: string;
  draftTypedText?: string;
  draftElapsedMs?: number;
}

const DB_NAME = 'keysprint_local_db';
const DB_VERSION = 1;
const STORE_RESULTS = 'test_results';
const STORE_LESSONS = 'lesson_progress';
const STORE_KEYSTATS = 'keyboard_intelligence';

// Fallback in-memory / localStorage mirror for environments lacking IndexedDB (e.g. unit tests)
const FALLBACK_RESULTS_KEY = 'ks_fallback_results_v1';
const FALLBACK_LESSONS_KEY = 'ks_fallback_lessons_v1';
const FALLBACK_KEYSTATS_KEY = 'ks_fallback_keystats_v1';

function hasIndexedDB(): boolean {
  return typeof window !== 'undefined' && typeof window.indexedDB !== 'undefined';
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_RESULTS)) {
        const store = db.createObjectStore(STORE_RESULTS, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_LESSONS)) {
        db.createObjectStore(STORE_LESSONS, { keyPath: 'lessonId' });
      }
      if (!db.objectStoreNames.contains(STORE_KEYSTATS)) {
        db.createObjectStore(STORE_KEYSTATS, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readFallback<T>(key: string, defaultValue: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : defaultValue;
  } catch {
    return defaultValue;
  }
}

function writeFallback<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage quota errors
  }
}

export async function saveResultLocal(result: StoredTestResult): Promise<void> {
  if (!hasIndexedDB()) {
    const list = readFallback<StoredTestResult[]>(FALLBACK_RESULTS_KEY, []);
    const filtered = list.filter((r) => r.id !== result.id && r.clientRecordId !== result.clientRecordId);
    writeFallback(FALLBACK_RESULTS_KEY, [result, ...filtered].slice(0, 500));
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    tx.objectStore(STORE_RESULTS).put(result);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listResultsLocal(): Promise<StoredTestResult[]> {
  if (!hasIndexedDB()) {
    return readFallback<StoredTestResult[]>(FALLBACK_RESULTS_KEY, []).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }
  const db = await openDB();
  return new Promise<StoredTestResult[]>((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readonly');
    const req = tx.objectStore(STORE_RESULTS).getAll();
    req.onsuccess = () => {
      const items = (req.result as StoredTestResult[]) ?? [];
      items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      resolve(items);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function getResultByIdLocal(id: string): Promise<StoredTestResult | null> {
  if (!hasIndexedDB()) {
    const list = readFallback<StoredTestResult[]>(FALLBACK_RESULTS_KEY, []);
    return list.find((r) => r.id === id) ?? null;
  }
  const db = await openDB();
  return new Promise<StoredTestResult | null>((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readonly');
    const req = tx.objectStore(STORE_RESULTS).get(id);
    req.onsuccess = () => resolve((req.result as StoredTestResult) ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function deleteResultLocal(id: string): Promise<void> {
  if (!hasIndexedDB()) {
    const list = readFallback<StoredTestResult[]>(FALLBACK_RESULTS_KEY, []);
    writeFallback(
      FALLBACK_RESULTS_KEY,
      list.filter((r) => r.id !== id)
    );
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    tx.objectStore(STORE_RESULTS).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearAllResultsLocal(): Promise<void> {
  if (!hasIndexedDB()) {
    writeFallback(FALLBACK_RESULTS_KEY, []);
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_RESULTS, 'readwrite');
    tx.objectStore(STORE_RESULTS).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getKeyStatsLocal(): Promise<AggregateKeyStore> {
  if (!hasIndexedDB()) {
    return readFallback<AggregateKeyStore>(FALLBACK_KEYSTATS_KEY, { keys: {}, bigrams: {} });
  }
  const db = await openDB();
  return new Promise<AggregateKeyStore>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYSTATS, 'readonly');
    const req = tx.objectStore(STORE_KEYSTATS).get('default');
    req.onsuccess = () => {
      const record = req.result as ({ id: string } & AggregateKeyStore) | undefined;
      resolve(record ? { keys: record.keys, bigrams: record.bigrams } : { keys: {}, bigrams: {} });
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveKeyStatsLocal(store: AggregateKeyStore): Promise<void> {
  if (!hasIndexedDB()) {
    writeFallback(FALLBACK_KEYSTATS_KEY, store);
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_KEYSTATS, 'readwrite');
    tx.objectStore(STORE_KEYSTATS).put({ id: 'default', ...store });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function listLessonProgressLocal(): Promise<Record<string, StoredLessonProgress>> {
  if (!hasIndexedDB()) {
    return readFallback<Record<string, StoredLessonProgress>>(FALLBACK_LESSONS_KEY, {});
  }
  const db = await openDB();
  return new Promise<Record<string, StoredLessonProgress>>((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, 'readonly');
    const req = tx.objectStore(STORE_LESSONS).getAll();
    req.onsuccess = () => {
      const items = (req.result as StoredLessonProgress[]) ?? [];
      const map: Record<string, StoredLessonProgress> = {};
      for (const item of items) map[item.lessonId] = item;
      resolve(map);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function saveLessonProgressLocal(progress: StoredLessonProgress): Promise<void> {
  if (!hasIndexedDB()) {
    const map = readFallback<Record<string, StoredLessonProgress>>(FALLBACK_LESSONS_KEY, {});
    map[progress.lessonId] = progress;
    writeFallback(FALLBACK_LESSONS_KEY, map);
    return;
  }
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_LESSONS, 'readwrite');
    tx.objectStore(STORE_LESSONS).put(progress);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
