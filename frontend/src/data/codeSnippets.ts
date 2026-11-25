export type CodeLanguage =
  | 'Python'
  | 'JavaScript'
  | 'C'
  | 'C++'
  | 'Java'
  | 'HTML'
  | 'CSS'
  | 'SQL';

export interface CodeSnippet {
  id: string;
  language: CodeLanguage;
  title: string;
  difficulty: 'easy' | 'medium' | 'hard';
  description: string;
  code: string;
}

export const CODE_LANGUAGES: CodeLanguage[] = [
  'Python',
  'JavaScript',
  'C',
  'C++',
  'Java',
  'HTML',
  'CSS',
  'SQL',
];

export const CODE_SNIPPETS: CodeSnippet[] = [
  {
    id: 'py-wpm',
    language: 'Python',
    title: 'Net WPM Calculator',
    difficulty: 'easy',
    description: 'Clean Python function with indentation and type hints.',
    code: `def calc_net_wpm(chars: int, errors: int, seconds: float) -> float:
    if seconds <= 0 or chars <= 0:
        return 0.0
    minutes = seconds / 60.0
    gross = (chars / 5.0) / minutes
    penalty = (errors / 5.0) / minutes
    return max(0.0, round(gross - penalty, 1))`,
  },
  {
    id: 'py-binary-search',
    language: 'Python',
    title: 'Binary Search',
    difficulty: 'medium',
    description: 'Classic iterative binary search preserving 4-space indentation.',
    code: `def binary_search(nums: list[int], target: int) -> int:
    left, right = 0, len(nums) - 1
    while left <= right:
        mid = (left + right) // 2
        if nums[mid] == target:
            return mid
        if nums[mid] < target:
            left = mid + 1
        else:
            right = mid - 1
    return -1`,
  },
  {
    id: 'js-debounce',
    language: 'JavaScript',
    title: 'Debounce Utility',
    difficulty: 'easy',
    description: 'Closures, arrow functions, and timer cleanup.',
    code: `export function debounce(fn, delayMs = 200) {
  let timerId = null;
  return (...args) => {
    if (timerId !== null) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => fn(...args), delayMs);
  };
}`,
  },
  {
    id: 'js-fetch-json',
    language: 'JavaScript',
    title: 'Async API Wrapper',
    difficulty: 'medium',
    description: 'Async/await, object destructuring, and template literals.',
    code: `async function fetchProfile(username) {
  const res = await fetch(\`/api/v1/profiles/\${username}\`, {
    credentials: 'include',
  });
  if (!res.ok) {
    throw new Error(\`HTTP \${res.status}\`);
  }
  return await res.json();
}`,
  },
  {
    id: 'c-ring-buffer',
    language: 'C',
    title: 'Swap & Array Sum',
    difficulty: 'easy',
    description: 'Pointers, loops, and C standard syntax.',
    code: `#include <stdio.h>

int sum_array(const int *arr, size_t len) {
    int total = 0;
    for (size_t i = 0; i < len; i++) {
        total += arr[i];
    }
    return total;
}`,
  },
  {
    id: 'cpp-stats',
    language: 'C++',
    title: 'Vector Mean & Filter',
    difficulty: 'medium',
    description: 'Modern C++ standard library containers and range loops.',
    code: `#include <vector>
#include <numeric>

double average_positive(const std::vector<int>& values) {
    long long sum = 0;
    size_t count = 0;
    for (int v : values) {
        if (v > 0) {
            sum += v;
            ++count;
        }
    }
    return count == 0 ? 0.0 : static_cast<double>(sum) / count;
}`,
  },
  {
    id: 'java-record',
    language: 'Java',
    title: 'Result Summary Service',
    difficulty: 'medium',
    description: 'Java class methods, generics, and stream reduction.',
    code: `import java.util.List;

public class ScoreSummary {
    public static double averageWpm(List<Double> scores) {
        if (scores.isEmpty()) {
            return 0.0;
        }
        double sum = 0.0;
        for (double score : scores) {
            sum += score;
        }
        return sum / scores.size();
    }
}`,
  },
  {
    id: 'html-card',
    language: 'HTML',
    title: 'Accessible Metrics Card',
    difficulty: 'easy',
    description: 'Semantic HTML5 markup with attributes and nesting.',
    code: `<section class="metrics-card" aria-label="Session summary">
  <header class="card-header">
    <h2>Typing Summary</h2>
    <span class="badge">60s Mode</span>
  </header>
  <dl class="stats-grid">
    <div><dt>Net WPM</dt><dd>84.5</dd></div>
    <div><dt>Accuracy</dt><dd>98.2%</dd></div>
  </dl>
</section>`,
  },
  {
    id: 'css-theme',
    language: 'CSS',
    title: 'Design System Tokens',
    difficulty: 'easy',
    description: 'CSS custom properties, selectors, and layout rules.',
    code: `:root {
  --ks-bg: #090b0a;
  --ks-accent: #39d98a;
  --ks-text: #e8f0ea;
}

.typing-card {
  display: grid;
  gap: 1rem;
  padding: 1.5rem;
  border: 1px solid #232c26;
  background-color: var(--ks-bg);
}`,
  },
  {
    id: 'sql-leaderboard',
    language: 'SQL',
    title: 'Weekly Leaderboard Query',
    difficulty: 'medium',
    description: 'SQL joins, filtering, aggregation, and ordering.',
    code: `SELECT
    u.username,
    MAX(r.net_wpm) AS best_wpm,
    ROUND(AVG(r.accuracy), 1) AS avg_accuracy,
    COUNT(r.id) AS total_runs
FROM test_results r
JOIN users u ON u.id = r.user_id
WHERE r.created_at >= NOW() - INTERVAL '7 days'
GROUP BY u.id, u.username
ORDER BY best_wpm DESC
LIMIT 25;`,
  },
];
