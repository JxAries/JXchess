/**
 * 摆盘页入口：装配棋盘与全部编辑交互。
 * 支持选择移动、擦除、放置三种模式；可设置走子方与双方易位权利，
 * 并据此导出准确的 FEN 或带着局面跳去复盘。
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

function toast(message: string): void {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  document.body.appendChild(div);
  window.setTimeout(() => div.remove(), 2600);
}

/** 当前交互模式 */
type Mode =
  | { kind: 'select' }
  | { kind: 'erase' }
  | { kind: 'place'; color: Color; piece: PieceKind };

const boardWrap = must('board-wrap');
const hintEl = must('tool-hint');

const editor = new BoardEditor(boardWrap, refreshHint);

// ---- 模式与选项状态 ----
let mode: Mode = { kind: 'select' };
let selectedSq: SquareName | null = null;
let flipped = false;
let turn: 'w' | 'b' = 'w';
let castle = { wk: true, wq: true, bk: true, bq: true };

// ---- 棋盘点击 ----
editor.bindPick((sq) => onBoardPick(sq));

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
  // 选择模式：拿起一枚棋子再放到目标格，即移动
  if (selectedSq === null) {
    if (editor.getAt(sq)) {
      selectedSq = sq;
      editor.highlight(sq);
      refreshHint();
    }
    return;
  }
  if (sq === selectedSq) {
    clearSelect();
    return;
  }
  editor.movePiece(selectedSq, sq);
  clearSelect();
  refreshHint();
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
  refreshHint();
}

function syncModeUI(): void {
  const selectBtn = must('btn-select');
  const eraseBtn = must('tool-erase');
  selectBtn.classList.toggle('selected', mode.kind === 'select');
  eraseBtn.classList.toggle('selected', mode.kind === 'erase');
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
    chip.addEventListener('click', () => {
      setMode({ kind: 'place', color, piece: kind });
      toast(`已选择放置${color === 'w' ? '白' : '黑'}${PIECE_CN[kind]}，点击棋盘格子摆放`);
    });
    container.appendChild(chip);
  }
}
buildPalette(must('palette-white'), 'w');
buildPalette(must('palette-black'), 'b');

// ---- 走子方与易位权利 ----
function setTurn(value: 'w' | 'b'): void {
  turn = value;
  syncOptionsUI();
}

function setCastle(key: keyof typeof castle, value: boolean): void {
  castle[key] = value;
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

must('btn-turn-w').addEventListener('click', () => setTurn('w'));
must('btn-turn-b').addEventListener('click', () => setTurn('b'));
must('ck-wk').addEventListener('click', () => setCastle('wk', !castle.wk));
must('ck-wq').addEventListener('click', () => setCastle('wq', !castle.wq));
must('ck-bk').addEventListener('click', () => setCastle('bk', !castle.bk));
must('ck-bq').addEventListener('click', () => setCastle('bq', !castle.bq));

// ---- FEN 组装 ----
function castlingText(): string {
  const parts: string[] = [];
  if (castle.wk) parts.push('K');
  if (castle.wq) parts.push('Q');
  if (castle.bk) parts.push('k');
  if (castle.bq) parts.push('q');
  return parts.length ? parts.join('') : '-';
}

/** 完整 FEN 字符串（不经规则校验，供复制） */
function rawFen(): string {
  return `${editor.boardPlacement()} ${turn} ${castlingText()} - 0 1`;
}

/**
 * 生成可用于复盘开局的 FEN：先要求双方有王，再交给 chess.js 校验。
 * 若易位权利与实际子力不符导致解析失败，自动去掉权利重试；仍失败则返回错误信息。
 */
function reviewFen(): string | null {
  const missing = editor.missingKings();
  if (missing.length > 0) {
    return missing.map((c) => (c === 'w' ? '白王' : '黑王')).join('和') + '缺失';
  }
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
    return '该局面不符合对局规则，请检查（如行棋方正被将军等）';
  }
  return `${placement} ${turn} ${tryParse(rights) ? rights : '-'} - 0 1`;
}

// ---- 提示刷新 ----
function refreshHint(): void {
  const missing = editor.missingKings();
  let text =
    mode.kind === 'select'
      ? selectedSq
        ? '已选中棋子，点击目标格移动它'
        : '选择模式：点击棋盘上的棋子可拿起移动'
      : mode.kind === 'erase'
        ? '擦除：点击棋盘上的棋子将其移除'
        : `放置${mode.color === 'w' ? '白' : '黑'}${PIECE_CN[mode.piece]}：点击格子摆放`;
  if (missing.length > 0) {
    text += `；注意还缺少${missing.map((c) => (c === 'w' ? '白王' : '黑王')).join('和')}`;
  }
  hintEl.textContent = text;
}

// ---- 工具按钮 ----
must('btn-classic').addEventListener('click', () => {
  editor.setClassic();
  turn = 'w';
  castle = { wk: true, wq: true, bk: true, bq: true };
  syncOptionsUI();
  toast('已摆回初始局面');
});
must('btn-clear').addEventListener('click', () => {
  editor.clearBoard();
  toast('棋盘已清空');
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
    toast(error);
    return;
  }
  // 同步走子方与易位权利
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
  toast('局面已载入');
});
must('btn-copy').addEventListener('click', () => {
  const fen = rawFen();
  void navigator.clipboard.writeText(fen).then(
    () => toast('FEN 已复制到剪贴板'),
    () => toast('复制失败，请手动记录：' + fen.slice(0, 40) + '…'),
  );
});
must('btn-flip').addEventListener('click', () => {
  flipped = !flipped;
  editor.setFlipped(flipped);
  refreshHint();
});
must('btn-review').addEventListener('click', () => {
  const fen = reviewFen();
  if (fen === null) {
    toast('请先补齐双方的王再开始复盘');
    return;
  }
  if (fen.includes('缺失') || fen.includes('不符合')) {
    toast(fen);
    return;
  }
  window.location.href = `./review.html?fen=${encodeURIComponent(fen)}`;
});

// 初始：进入后为选择模式并摆好初始局面
editor.setClassic();
syncModeUI();
syncOptionsUI();
refreshHint();
