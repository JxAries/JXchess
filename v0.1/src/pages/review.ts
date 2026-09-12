/**
 * 复盘页入口：装配棋盘、走棋交互、棋谱面板与底部播放控制。
 * 支持 ?fen= 指定局面开局；含将军红格、走子动画与木质音效、棋盘翻转、
 * 变例记录与跳转、PGN 导入导出。终局时在主线的最后一步下方显示标准结果。
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

// 支持从摆棋页带着局面跳转过来
const fenParam = new URLSearchParams(location.search).get('fen');
if (fenParam) {
  const error = state.setStartFen(fenParam);
  if (error) toast(error);
}

const boardWrap = must('board-wrap');
const moveListEl = must('move-list');
const capWhiteEl = must('cap-white');
const capBlackEl = must('cap-black');
const filePicker = must<HTMLInputElement>('file-picker');

const board = new BoardView(boardWrap);
const sfx = new SoundFX();
let flipped = false;

function toast(message: string): void {
  const div = document.createElement('div');
  div.className = 'toast';
  div.textContent = message;
  document.body.appendChild(div);
  window.setTimeout(() => div.remove(), 2600);
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
    el.appendChild(img);
  }
}

/** 终局时在主线的最后一步正下方写出标准结果行 */
function renderResult(): void {
  const existed = document.querySelector('#move-list .mv-result');
  existed?.remove();
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
}

function loadPgnText(text: string): void {
  const error = state.loadPgn(text);
  if (error) toast(error);
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
new BoardInput(board, state, { onChanged: (move) => refresh(move), onMessage: toast });

// 底部播放控制：主线外的新变例只通过点击棋谱面板进入
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

// 支线管理：新建支线 / 删除当前支线
must('btn-new-branch').addEventListener('click', () => {
  state.armNewBranch();
  toast('已在当前位置新建支线，走一步棋即记录到该支线');
});
must('btn-delete-branch').addEventListener('click', () => {
  const removed = state.deleteCurrentVariation();
  toast(removed ? '已删除当前支线' : '当前位置不在支线内');
  if (removed) refresh(null);
});

refresh(null);
