/**
 * 复盘页入口：装配棋盘、走棋交互、记谱面板、吃子栏与底部播放控制。
 * 支持 ?fen= 以指定局面开局；负责将军高亮、走子动画、音效、棋盘翻转与 PGN 导入导出。
 */
import '../style.css';
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

// 支持从摆盘页带着局面跳转过来
const fenParam = new URLSearchParams(location.search).get('fen');
if (fenParam) {
  const error = state.setStartFen(fenParam);
  if (error) toast(error);
}

const boardWrap = must('board-wrap');
const moveListEl = must('move-list');
const capWhiteEl = must('cap-white');
const capBlackEl = must('cap-black');
const resultLine = must('result-line');
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
  renderCapRow(capWhiteEl, '白得子', byWhite, 'b');
  renderCapRow(capBlackEl, '黑得子', byBlack, 'w');
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

/** 终局时在记谱面板底部显示结果，其余时间留空 */
function renderResult(): void {
  const text = state.statusText();
  const show = text.includes('胜') || text.includes('和') || text === '逼和';
  resultLine.textContent = show ? text : '';
}

/** 整体刷新；move 非空时播放音效并播放该步的滑动动画 */
function refresh(move: MovePlayed | null): void {
  const chess = state.chessNow();

  board.render(chess);
  board.clearMarks();

  const last = state.lastMoveInfo();
  board.markLastMove(last ? last.from : null, last ? last.to : null);

  if (chess.inCheck()) {
    board.markCheck(state.kingSquare(chess.turn()));
  }
  if (move) {
    if (sfx.enabled) {
      if (move.capture) sfx.capture();
      else sfx.move();
      if (chess.inCheck()) sfx.check();
    }
    board.animateMove(move.from, move.to);
  }

  renderMoveList(moveListEl, state, (index) => {
    state.goTo(index);
    refresh(null);
  });
  renderCaptured();
  renderResult();
  syncSoundButton();
}

function syncSoundButton(): void {
  must('btn-sound').textContent = `音效:${sfx.enabled ? '开' : '关'}`;
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

// 棋盘交互：成功走子后带该步信息刷新
new BoardInput(board, state, { onChanged: (move) => refresh(move), onMessage: toast });

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
  if (state.atEnd) return;
  state.stepNext();
  refresh(state.lastMoveInfo());
});
must('btn-end').addEventListener('click', () => {
  state.toEnd();
  refresh(null);
});

// 记谱面板：导入导出
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

// 翻转棋盘与音效开关
must('btn-flip').addEventListener('click', () => {
  flipped = !flipped;
  board.setFlipped(flipped);
  refresh(null);
});
must('btn-sound').addEventListener('click', () => {
  sfx.toggle();
  syncSoundButton();
});

// 首次显示
refresh(null);
