/**
 * 摆棋页入口：装配棋盘与全部编辑交互。
 * 支持选择移动、擦除、放置三种模式与拖拽移动；可设置先手方与双方易位权利，
 * 导出准确的 FEN 或带着局面跳去复盘；去复盘按钮在缺少王时置灰。
 */
import '../style.css';
import { BoardEditor } from '../editor/editorView';
import { openTextDialog } from '../panels/dialog';
import { PIECE_CN, PIECE_KINDS, pieceImage, type Color, type PieceKind, type SquareName } from '../game/types';
import { Chess } from 'chess.js';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少页面元素 #${id}`);
  return el as T;
}

/** 当前交互模式 */
type Mode =
  | { kind: 'select' }
  | { kind: 'erase' }
  | { kind: 'place'; color: Color; piece: PieceKind };

const boardWrap = must('board-wrap');
const kingNote = must('king-note');
const reviewBtn = must<HTMLButtonElement>('btn-review');

const editor = new BoardEditor(boardWrap, refreshKingState);

// ---- 模式与选项状态 ----
let mode: Mode = { kind: 'select' };
let selectedSq: SquareName | null = null;
let flipped = false;
let turn: 'w' | 'b' = 'w';
let castle = { wk: true, wq: true, bk: true, bq: true };

// ---- 棋盘点击与拖拽 ----
editor.bindPick((sq) => onBoardPick(sq));
editor.bindDrag(
  (from, to) => {
    clearSelect();
    editor.movePiece(from, to);
  },
  () => mode.kind === 'select',
);

function onBoardPick(sq: SquareName): void {
  if (mode.kind === 'erase') {
    editor.apply(sq, { mode: 'erase' });
    clearSelect();
    return;
  }
  if (mode.kind === 'place') {
    editor.apply(sq, { mode: 'place', color: mode.color, kind: mode.piece });
    clearSelect();
    return;
  }
  // 选择模式：拿起一枚棋子再放到目标格
  if (selectedSq === null) {
    if (editor.getAt(sq)) {
      selectedSq = sq;
      editor.highlight(sq);
    }
    return;
  }
  if (sq === selectedSq) {
    clearSelect();
    return;
  }
  editor.movePiece(selectedSq, sq);
  clearSelect();
}

function clearSelect(): void {
  if (selectedSq !== null) editor.highlight(null);
  selectedSq = null;
}

// ---- 模式按钮 ----
must('btn-select').addEventListener('click', () => setMode({ kind: 'select' }));
must('tool-erase').addEventListener('click', () => setMode({ kind: 'erase' }));

function setMode(next: Mode): void {
  mode = next;
  clearSelect();
  syncModeUI();
}

function syncModeUI(): void {
  must('btn-select').classList.toggle('selected', mode.kind === 'select');
  must('tool-erase').classList.toggle('selected', mode.kind === 'erase');
  for (const chip of document.querySelectorAll<HTMLElement>('.tool-chip')) {
    const code = chip.dataset.code;
    chip.classList.toggle('selected', mode.kind === 'place' && code === `${mode.color}${mode.piece.toUpperCase()}`);
  }
}

// ---- 棋子面板 ----
function buildPalette(container: HTMLElement, color: Color): void {
  for (const kind of PIECE_KINDS) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'tool-chip';
    chip.dataset.code = `${color}${kind.toUpperCase()}`;
    chip.title = `${color === 'w' ? '白' : '黑'}${PIECE_CN[kind]}`;
    const img = document.createElement('img');
    img.src = pieceImage(color, kind);
    img.alt = PIECE_CN[kind];
    chip.appendChild(img);
    chip.addEventListener('click', () => setMode({ kind: 'place', color, piece: kind }));
    container.appendChild(chip);
  }
}
buildPalette(must('palette-white'), 'w');
buildPalette(must('palette-black'), 'b');

// ---- 先手方与易位权利 ----
must('btn-turn-w').addEventListener('click', () => {
  turn = 'w';
  syncOptionsUI();
});
must('btn-turn-b').addEventListener('click', () => {
  turn = 'b';
  syncOptionsUI();
});
must('ck-wk').addEventListener('click', () => toggleCastle('wk'));
must('ck-wq').addEventListener('click', () => toggleCastle('wq'));
must('ck-bk').addEventListener('click', () => toggleCastle('bk'));
must('ck-bq').addEventListener('click', () => toggleCastle('bq'));

function toggleCastle(key: keyof typeof castle): void {
  castle[key] = !castle[key];
  syncOptionsUI();
}

function syncOptionsUI(): void {
  must('btn-turn-w').classList.toggle('selected', turn === 'w');
  must('btn-turn-b').classList.toggle('selected', turn === 'b');
  const map: Array<[keyof typeof castle, string]> = [
    ['wk', 'ck-wk'],
    ['wq', 'ck-wq'],
    ['bk', 'ck-bk'],
    ['bq', 'ck-bq'],
  ];
  for (const [key, id] of map) must(id).classList.toggle('selected', castle[key]);
}

// ---- FEN 组装 ----
function castlingText(): string {
  const parts: string[] = [];
  if (castle.wk) parts.push('K');
  if (castle.wq) parts.push('Q');
  if (castle.bk) parts.push('k');
  if (castle.bq) parts.push('q');
  return parts.length ? parts.join('') : '-';
}

function rawFen(): string {
  return `${editor.boardPlacement()} ${turn} ${castlingText()} - 0 1`;
}

/** 生成可用于复盘开局的 FEN；失败时返回错误信息 */
function reviewFen(): string | null {
  const missing = editor.missingKings();
  if (missing.length > 0) return '请确保双方都有王';
  const placement = editor.boardPlacement();
  const tryParse = (castleText: string): boolean => {
    try {
      new Chess(`${placement} ${turn} ${castleText} - 0 1`);
      return true;
    } catch {
      return false;
    }
  };
  const rights = castlingText();
  if (!tryParse(rights) && !tryParse('-')) {
    return '该局面不符合对局规则，请检查';
  }
  return `${placement} ${turn} ${tryParse(rights) ? rights : '-'} - 0 1`;
}

// ---- 王提醒与去复盘按钮状态 ----
function refreshKingState(): void {
  const missing = editor.missingKings();
  reviewBtn.disabled = missing.length > 0;
  kingNote.textContent = missing.length > 0 ? '缺少' + missing.map((c) => (c === 'w' ? '白王' : '黑王')).join('和') + '，请先摆上' : '去复盘需双方各有一个王';
  kingNote.style.color = missing.length > 0 ? '#8a4b2f' : '';
}

/** 短暂在提醒行显示一条错误信息（替代弹窗） */
function flashNote(message: string): void {
  kingNote.textContent = message;
  kingNote.style.color = '#a03030';
  window.setTimeout(() => refreshKingState(), 2600);
}

// ---- 工具按钮 ----
must('btn-classic').addEventListener('click', () => {
  editor.setClassic();
  turn = 'w';
  castle = { wk: true, wq: true, bk: true, bq: true };
  syncOptionsUI();
});
must('btn-clear').addEventListener('click', () => {
  editor.clearBoard();
});
must('btn-load').addEventListener('click', async () => {
  const text = await openTextDialog({
    title: '载入 FEN 局面',
    placeholder: '粘贴 FEN 字符串，例如 rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    confirmText: '载入',
    rows: 3,
  });
  if (!text) return;
  const error = editor.loadFen(text);
  if (error) {
    flashNote(error);
    return;
  }
  const parts = text.trim().split(/\s+/);
  turn = parts[1] === 'b' ? 'b' : 'w';
  const rights = parts[2] ?? '-';
  castle = {
    wk: rights.includes('K'),
    wq: rights.includes('Q'),
    bk: rights.includes('k'),
    bq: rights.includes('q'),
  };
  syncOptionsUI();
});
must('btn-copy').addEventListener('click', () => {
  const fen = rawFen();
  void navigator.clipboard.writeText(fen).then(
    () => undefined,
    () => flashNote('复制失败，请手动记录：' + fen.slice(0, 40) + '…'),
  );
});
must('btn-flip').addEventListener('click', () => {
  flipped = !flipped;
  editor.setFlipped(flipped);
});
must('btn-review').addEventListener('click', () => {
  const fen = reviewFen();
  if (!fen || fen.includes('王') || fen.includes('不符合')) {
    if (fen) flashNote(fen);
    return;
  }
  window.location.href = `./review.html?fen=${encodeURIComponent(fen)}`;
});

// 初始：摆好标准局面并刷新状态
editor.setClassic();
syncModeUI();
syncOptionsUI();
refreshKingState();
