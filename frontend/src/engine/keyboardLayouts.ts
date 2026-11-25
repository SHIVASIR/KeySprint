export type FingerId =
  | 'L-Pinky'
  | 'L-Ring'
  | 'L-Middle'
  | 'L-Index'
  | 'Thumb'
  | 'R-Index'
  | 'R-Middle'
  | 'R-Ring'
  | 'R-Pinky';

export type HandSide = 'left' | 'right' | 'both';

export interface KeyDefinition {
  code: string;
  label: string;
  shiftLabel?: string;
  finger: FingerId;
  hand: HandSide;
  width?: number; // relative units, standard key = 1
}

export interface KeyboardLayoutConfig {
  id: string;
  name: string;
  description: string;
  rows: KeyDefinition[][];
}

export const QWERTY_LAYOUT: KeyboardLayoutConfig = {
  id: 'qwerty-ansi',
  name: 'QWERTY (ANSI)',
  description: 'Standard US ANSI 60% / 104-key finger-mapped layout',
  rows: [
    [
      { code: '`', label: '`', shiftLabel: '~', finger: 'L-Pinky', hand: 'left' },
      { code: '1', label: '1', shiftLabel: '!', finger: 'L-Pinky', hand: 'left' },
      { code: '2', label: '2', shiftLabel: '@', finger: 'L-Ring', hand: 'left' },
      { code: '3', label: '3', shiftLabel: '#', finger: 'L-Middle', hand: 'left' },
      { code: '4', label: '4', shiftLabel: '$', finger: 'L-Index', hand: 'left' },
      { code: '5', label: '5', shiftLabel: '%', finger: 'L-Index', hand: 'left' },
      { code: '6', label: '6', shiftLabel: '^', finger: 'R-Index', hand: 'right' },
      { code: '7', label: '7', shiftLabel: '&', finger: 'R-Index', hand: 'right' },
      { code: '8', label: '8', shiftLabel: '*', finger: 'R-Middle', hand: 'right' },
      { code: '9', label: '9', shiftLabel: '(', finger: 'R-Ring', hand: 'right' },
      { code: '0', label: '0', shiftLabel: ')', finger: 'R-Pinky', hand: 'right' },
      { code: '-', label: '-', shiftLabel: '_', finger: 'R-Pinky', hand: 'right' },
      { code: '=', label: '=', shiftLabel: '+', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: 'q', label: 'Q', finger: 'L-Pinky', hand: 'left' },
      { code: 'w', label: 'W', finger: 'L-Ring', hand: 'left' },
      { code: 'e', label: 'E', finger: 'L-Middle', hand: 'left' },
      { code: 'r', label: 'R', finger: 'L-Index', hand: 'left' },
      { code: 't', label: 'T', finger: 'L-Index', hand: 'left' },
      { code: 'y', label: 'Y', finger: 'R-Index', hand: 'right' },
      { code: 'u', label: 'U', finger: 'R-Index', hand: 'right' },
      { code: 'i', label: 'I', finger: 'R-Middle', hand: 'right' },
      { code: 'o', label: 'O', finger: 'R-Ring', hand: 'right' },
      { code: 'p', label: 'P', finger: 'R-Pinky', hand: 'right' },
      { code: '[', label: '[', shiftLabel: '{', finger: 'R-Pinky', hand: 'right' },
      { code: ']', label: ']', shiftLabel: '}', finger: 'R-Pinky', hand: 'right' },
      { code: '\\', label: '\\', shiftLabel: '|', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: 'a', label: 'A', finger: 'L-Pinky', hand: 'left' },
      { code: 's', label: 'S', finger: 'L-Ring', hand: 'left' },
      { code: 'd', label: 'D', finger: 'L-Middle', hand: 'left' },
      { code: 'f', label: 'F', finger: 'L-Index', hand: 'left' },
      { code: 'g', label: 'G', finger: 'L-Index', hand: 'left' },
      { code: 'h', label: 'H', finger: 'R-Index', hand: 'right' },
      { code: 'j', label: 'J', finger: 'R-Index', hand: 'right' },
      { code: 'k', label: 'K', finger: 'R-Middle', hand: 'right' },
      { code: 'l', label: 'L', finger: 'R-Ring', hand: 'right' },
      { code: ';', label: ';', shiftLabel: ':', finger: 'R-Pinky', hand: 'right' },
      { code: "'", label: "'", shiftLabel: '"', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: 'z', label: 'Z', finger: 'L-Pinky', hand: 'left' },
      { code: 'x', label: 'X', finger: 'L-Ring', hand: 'left' },
      { code: 'c', label: 'C', finger: 'L-Middle', hand: 'left' },
      { code: 'v', label: 'V', finger: 'L-Index', hand: 'left' },
      { code: 'b', label: 'B', finger: 'L-Index', hand: 'left' },
      { code: 'n', label: 'N', finger: 'R-Index', hand: 'right' },
      { code: 'm', label: 'M', finger: 'R-Index', hand: 'right' },
      { code: ',', label: ',', shiftLabel: '<', finger: 'R-Middle', hand: 'right' },
      { code: '.', label: '.', shiftLabel: '>', finger: 'R-Ring', hand: 'right' },
      { code: '/', label: '/', shiftLabel: '?', finger: 'R-Pinky', hand: 'right' },
    ],
    [{ code: ' ', label: 'Space', finger: 'Thumb', hand: 'both', width: 6 }],
  ],
};

export const COLEMAK_LAYOUT: KeyboardLayoutConfig = {
  id: 'colemak',
  name: 'Colemak',
  description: 'Ergonomic Colemak layout optimizing home-row frequency',
  rows: [
    QWERTY_LAYOUT.rows[0],
    [
      { code: 'q', label: 'Q', finger: 'L-Pinky', hand: 'left' },
      { code: 'w', label: 'W', finger: 'L-Ring', hand: 'left' },
      { code: 'f', label: 'F', finger: 'L-Middle', hand: 'left' },
      { code: 'p', label: 'P', finger: 'L-Index', hand: 'left' },
      { code: 'g', label: 'G', finger: 'L-Index', hand: 'left' },
      { code: 'j', label: 'J', finger: 'R-Index', hand: 'right' },
      { code: 'l', label: 'L', finger: 'R-Index', hand: 'right' },
      { code: 'u', label: 'U', finger: 'R-Middle', hand: 'right' },
      { code: 'y', label: 'Y', finger: 'R-Ring', hand: 'right' },
      { code: ';', label: ';', shiftLabel: ':', finger: 'R-Pinky', hand: 'right' },
      { code: '[', label: '[', shiftLabel: '{', finger: 'R-Pinky', hand: 'right' },
      { code: ']', label: ']', shiftLabel: '}', finger: 'R-Pinky', hand: 'right' },
      { code: '\\', label: '\\', shiftLabel: '|', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: 'a', label: 'A', finger: 'L-Pinky', hand: 'left' },
      { code: 'r', label: 'R', finger: 'L-Ring', hand: 'left' },
      { code: 's', label: 'S', finger: 'L-Middle', hand: 'left' },
      { code: 't', label: 'T', finger: 'L-Index', hand: 'left' },
      { code: 'd', label: 'D', finger: 'L-Index', hand: 'left' },
      { code: 'h', label: 'H', finger: 'R-Index', hand: 'right' },
      { code: 'n', label: 'N', finger: 'R-Index', hand: 'right' },
      { code: 'e', label: 'E', finger: 'R-Middle', hand: 'right' },
      { code: 'i', label: 'I', finger: 'R-Ring', hand: 'right' },
      { code: 'o', label: 'O', finger: 'R-Pinky', hand: 'right' },
      { code: "'", label: "'", shiftLabel: '"', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: 'z', label: 'Z', finger: 'L-Pinky', hand: 'left' },
      { code: 'x', label: 'X', finger: 'L-Ring', hand: 'left' },
      { code: 'c', label: 'C', finger: 'L-Middle', hand: 'left' },
      { code: 'v', label: 'V', finger: 'L-Index', hand: 'left' },
      { code: 'b', label: 'B', finger: 'L-Index', hand: 'left' },
      { code: 'k', label: 'K', finger: 'R-Index', hand: 'right' },
      { code: 'm', label: 'M', finger: 'R-Index', hand: 'right' },
      { code: ',', label: ',', shiftLabel: '<', finger: 'R-Middle', hand: 'right' },
      { code: '.', label: '.', shiftLabel: '>', finger: 'R-Ring', hand: 'right' },
      { code: '/', label: '/', shiftLabel: '?', finger: 'R-Pinky', hand: 'right' },
    ],
    QWERTY_LAYOUT.rows[4],
  ],
};

export const DVORAK_LAYOUT: KeyboardLayoutConfig = {
  id: 'dvorak',
  name: 'Dvorak',
  description: 'Dvorak Simplified Keyboard layout',
  rows: [
    QWERTY_LAYOUT.rows[0],
    [
      { code: "'", label: "'", shiftLabel: '"', finger: 'L-Pinky', hand: 'left' },
      { code: ',', label: ',', shiftLabel: '<', finger: 'L-Ring', hand: 'left' },
      { code: '.', label: '.', shiftLabel: '>', finger: 'L-Middle', hand: 'left' },
      { code: 'p', label: 'P', finger: 'L-Index', hand: 'left' },
      { code: 'y', label: 'Y', finger: 'L-Index', hand: 'left' },
      { code: 'f', label: 'F', finger: 'R-Index', hand: 'right' },
      { code: 'g', label: 'G', finger: 'R-Index', hand: 'right' },
      { code: 'c', label: 'C', finger: 'R-Middle', hand: 'right' },
      { code: 'r', label: 'R', finger: 'R-Ring', hand: 'right' },
      { code: 'l', label: 'L', finger: 'R-Pinky', hand: 'right' },
      { code: '/', label: '/', shiftLabel: '?', finger: 'R-Pinky', hand: 'right' },
      { code: '=', label: '=', shiftLabel: '+', finger: 'R-Pinky', hand: 'right' },
      { code: '\\', label: '\\', shiftLabel: '|', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: 'a', label: 'A', finger: 'L-Pinky', hand: 'left' },
      { code: 'o', label: 'O', finger: 'L-Ring', hand: 'left' },
      { code: 'e', label: 'E', finger: 'L-Middle', hand: 'left' },
      { code: 'u', label: 'U', finger: 'L-Index', hand: 'left' },
      { code: 'i', label: 'I', finger: 'L-Index', hand: 'left' },
      { code: 'd', label: 'D', finger: 'R-Index', hand: 'right' },
      { code: 'h', label: 'H', finger: 'R-Index', hand: 'right' },
      { code: 't', label: 'T', finger: 'R-Middle', hand: 'right' },
      { code: 'n', label: 'N', finger: 'R-Ring', hand: 'right' },
      { code: 's', label: 'S', finger: 'R-Pinky', hand: 'right' },
      { code: '-', label: '-', shiftLabel: '_', finger: 'R-Pinky', hand: 'right' },
    ],
    [
      { code: ';', label: ';', shiftLabel: ':', finger: 'L-Pinky', hand: 'left' },
      { code: 'q', label: 'Q', finger: 'L-Ring', hand: 'left' },
      { code: 'j', label: 'J', finger: 'L-Middle', hand: 'left' },
      { code: 'k', label: 'K', finger: 'L-Index', hand: 'left' },
      { code: 'x', label: 'X', finger: 'L-Index', hand: 'left' },
      { code: 'b', label: 'B', finger: 'R-Index', hand: 'right' },
      { code: 'm', label: 'M', finger: 'R-Index', hand: 'right' },
      { code: 'w', label: 'W', finger: 'R-Middle', hand: 'right' },
      { code: 'v', label: 'V', finger: 'R-Ring', hand: 'right' },
      { code: 'z', label: 'Z', finger: 'R-Pinky', hand: 'right' },
    ],
    QWERTY_LAYOUT.rows[4],
  ],
};

export const KEYBOARD_LAYOUTS: Record<string, KeyboardLayoutConfig> = {
  'qwerty-ansi': QWERTY_LAYOUT,
  colemak: COLEMAK_LAYOUT,
  dvorak: DVORAK_LAYOUT,
};

export function findKeyDefinition(
  char: string,
  layoutId = 'qwerty-ansi'
): KeyDefinition | null {
  const layout = KEYBOARD_LAYOUTS[layoutId] ?? QWERTY_LAYOUT;
  const lower = char.toLowerCase();
  for (const row of layout.rows) {
    for (const def of row) {
      if (def.code === lower || def.shiftLabel === char) {
        return def;
      }
    }
  }
  return null;
}
