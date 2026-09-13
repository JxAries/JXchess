/**
 * 复盘页入口：装配棋盘、走棋交互、棋谱面板与底部播放控制。
 * 支持 ?fen= 指定局面开局；含将军提醒、走子动画与木质音效、棋盘翻转、
 * 变例记录与支线管理、PGN 导入导出；终局时在主线最后一步下方显示标准结果。
 * 页面不使用浮动提示框，所有反馈都显示在棋谱面板内的一行小字上。
 */
import { BoardView } from '../board/boardView';
import { BoardInput, type MovePlayed } from '../board/input';
import { ReviewState } from '../game/gameState';
import { renderMoveList } from '../panels/moveList';
import { openTextDialog } from '../panels/dialog';
import { SoundFX } from '../effects/sound';
import { pieceImage, type PieceKind } from '../game/types';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少页面元素 #${id}`);
  return el as T;
}

const state = new ReviewState();

const boardWrap = must('board-wrap');
const moveListEl = must('move-list');
const capWhiteEl = must('cap-white');
const capBlackEl = must('cap-black');
const panelNote = must('panel-note');
const filePicker = must<HTMLInputElement>('file-picker');
const btnNewBranch = must<HTMLButtonElement>('btn-new-branch');
const btnDeleteBranch = must<HTMLButtonElement>('btn-delete-branch');

const board = new BoardView(boardWrap);
const sfx = new SoundFX();
let flipped = false;
let noteTimer = 0;

/** 在棋谱面板内短暂显示一行提示，替代浮动弹窗 */
function showNote(message: string): void {
  panelNote.textContent = message;
  window.clearTimeout(noteTimer);
  noteTimer = window.setTimeout(() => {
    panelNote.textContent = '';
  }, 2800);
}

// 支持从摆棋页带着局面跳转过来
const fenParam = new URLSearchParams(location.search).get('fen');
if (fenParam) {
  const error = state.setStartFen(fenParam);
  if (error) showNote(error);
}

function renderCaptured(): void {
  const { byWhite, byBlack } = state.captured();
  renderCapRow(capWhiteEl, '白方得子', byWhite, 'b');
  renderCapRow(capBlackEl, '黑方得子', byBlack, 'w');
}

function renderCapRow(el: HTMLElement, label: string, kinds: PieceKind[], color: 'w' | 'b'): void {
  el.textContent = '';
  const span = document.createElement('span');
  span.className = 'cap-label';
  span.textContent = label;
  el.appendChild(span);
  for (const kind of kinds) {
    const img = document.createElement('img');
    img.src = pieceImage(color, kind);
    img.alt = kind;
    img.draggable = false;
    el.appendChild(img);
  }
}

/** 终局时在主线的最后一步正下方写出标准结果行 */
function renderResult(): void {
  document.querySelector('#move-list .mv-result')?.remove();
  const status = state.statusText();
  let text = '';
  if (status === '白方胜') text = '1-0 · 白棋获胜';
  else if (status === '黑方胜') text = '0-1 · 黑棋获胜';
  else if (status.includes('和')) text = '½-½ · 平局';
  if (!text) return;
  const div = document.createElement('div');
  div.className = 'mv-result';
  div.textContent = text;
  moveListEl.appendChild(div);
}

/** 支线按钮状态：新建分支可切换待命，删除分支仅在支线内可用 */
function updateBranchButtons(): void {
  btnNewBranch.classList.toggle('selected', state.isBranchArmed());
  btnDeleteBranch.disabled = !state.inVariation();
}

/** 整体刷新；play 非空时播放音效与滑动动画 */
function refresh(play: MovePlayed | null): void {
  const chess = state.chessNow();

  board.render(chess);
  board.clearChecks();
  board.clearMarks();

  const last = state.lastMoveInfo();
  board.markLastMove(last ? last.from : null, last ? last.to : null);
  if (chess.inCheck()) board.markCheck(state.kingSquare(chess.turn()));

  if (play) {
    // 吃子与将军同时发生时，用吃子音效覆盖将军音效
    if (play.capture) sfx.capture();
    else if (chess.inCheck()) sfx.check();
    else sfx.move();
    board.animateMove(play.from, play.to);
  }

  renderMoveList(moveListEl, state, {
    goToDepth: (depth) => {
      state.goMainDepth(depth);
      refresh(null);
    },
    goVariation: (row, index) => {
      state.goVariation(row, index);
      refresh(null);
    },
  });
  renderCaptured();
  renderResult();
  updateBranchButtons();
}

function loadPgnText(text: string): void {
  const error = state.loadPgn(text);
  if (error) showNote(error);
  else refresh(null);
}

function downloadPgn(): void {
  const text = state.toPgn();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([text], { type: 'application/x-chess-pgn' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `JXchess-${stamp}.pgn`;
  a.click();
  URL.revokeObjectURL(url);
}

// 棋盘交互：点击与拖拽均在此触发刷新
new BoardInput(board, state, { onChanged: (move) => refresh(move), onMessage: showNote });

// 底部播放控制
must('btn-start').addEventListener('click', () => {
  state.toStart();
  refresh(null);
});
must('btn-prev').addEventListener('click', () => {
  state.stepBack();
  refresh(null);
});
must('btn-next').addEventListener('click', () => {
  if (!state.canNext()) return;
  state.stepNext();
  refresh(state.lastMoveInfo());
});
must('btn-end').addEventListener('click', () => {
  state.toEnd();
  refresh(null);
});

// 棋谱面板：导入导出
must('btn-open-file').addEventListener('click', () => filePicker.click());
filePicker.addEventListener('change', () => {
  const file = filePicker.files?.[0];
  if (!file) return;
  void file.text().then((text) => {
    filePicker.value = '';
    loadPgnText(text);
  });
});
must('btn-import').addEventListener('click', async () => {
  const text = await openTextDialog({
    title: '粘贴 PGN 棋谱',
    placeholder: '将 PGN 文本粘贴到这里，例如：\n1. e4 e5 2. Nf3 Nc6 ...',
    confirmText: '导入',
    rows: 12,
  });
  if (text) loadPgnText(text);
});
must('btn-export').addEventListener('click', downloadPgn);

// 翻转棋盘
must('btn-flip').addEventListener('click', () => {
  flipped = !flipped;
  board.setFlipped(flipped);
  refresh(null);
});

// 支线管理：新建支线是“待命”开关，删除支线仅在支线内生效
btnNewBranch.addEventListener('click', () => {
  state.toggleBranchArmed();
  updateBranchButtons();
});
btnDeleteBranch.addEventListener('click', () => {
  if (!state.inVariation()) return;
  state.deleteCurrentVariation();
  refresh(null);
});

refresh(null);
