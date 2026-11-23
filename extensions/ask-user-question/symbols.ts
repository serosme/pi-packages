/**
 * Every glyph the dialog draws, in one place.
 *
 * Only these decoration characters are used:
 *
 *   ← → ↑ ↓   arrows (tabs, review prefix, hints)
 *   ...       truncation
 *   |         hint separator
 *   + - *     status: done / todo / checked / failed
 *   [ ]       checkbox / list brackets
 *
 * Everything else is plain ASCII letters, digits, `>` and spaces. No check
 * marks, geometric shapes, box drawing or emoji-presentation glyphs, which
 * can occupy two cells in some fonts and shift later columns.
 *
 * All glyphs are treated as width 1 by pi-tui. Keep every prefix the same
 * visible width as its counterpart (`pointer` vs `pointerIdle`).
 */
export const S = {
  pointer: '> ',
  pointerIdle: '  ',
  checked: '[*]',
  unchecked: '[ ]',
  confirmed: ' *',
  border: '-',
  tabLeft: '←',
  tabRight: '→',
  tabDone: '*',
  tabTodo: '-',
  submitMark: '+',
  reviewDone: '*',
  reviewTodo: '-',
  arrow: '→',
  up: '↑',
  down: '↓',
  ellipsis: '...',
  separator: '|',
  ok: '+',
  fail: '-',
} as const
