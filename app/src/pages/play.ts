/**
 * 对弈页入口：先选人机/人人，再选时间限制。
 * 人机：玩家执白对本地 Stockfish（每步隔 3 秒应招）；人人：同一台电脑轮流走。
 * 双方各有时钟、走棋加秒，并记录每一步用时（毫秒）供复盘页画用时柱状图。
 */
import { Chess, type Square } from 'chess.js';
import { BoardView } from '../board/boardView';
import { askPromotion } from '../panels/promotion';
import { openAlert } from '../panels/dialog';
import { bestMove, startEngine, stopSearch } from '../engine/client';
import { pieceImage, type PieceKind } from '../game/types';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少页面元素 #${id}`);
  return el as T;
}

const setupEl = must('setup');
const gameEl = must('game');
const boardEl = must('play-board');
const clockWhiteEl = must('clock-white');
const clockBlackEl = must('clock-black');
const clockWhiteRow = must('clock-white-row');
const clockBlackRow = must('clock-black-row');
const nameWhiteEl = must('name-white');
const nameBlackEl = must('name-black');
const capWhiteEl = must('cap-white');
const capBlackEl = must('cap-black');
const resultEl = must('result');
const resultTitle = must('result-title');
const resultText = must('result-text');

type Mode = 'engine' | 'human';
/** 引擎每步思考时间（毫秒）；另外在应招前固定等待 3 秒，避免瞬间回子 */
const ENGINE_MOVETIME = 700;
const ENGINE_DELAY = 3000;

let mode: Mode = 'engine';
let board: BoardView | null = null;
let chess = new Chess();
let baseMs = 300000;
let incMs = 0;
let clocks = { w: baseMs, b: baseMs };
let active: 'w' | 'b' = 'w';
let over = false;
let busy = false;
let timer = 0;
let lastTick = 0;
let turnStart = 0;
let moveTimes: number[] = [];
let lastMove: { from: string; to: string } | null = null;
let selected: Square | null = null;
let targets: Array<{ to: string; promotion?: PieceKind; capture: boolean }> = [];

function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function updateClocks(): void {
  clockWhiteEl.textContent = formatClock(clocks.w);
  clockBlackEl.textContent = formatClock(clocks.b);
  clockWhiteRow.classList.toggle('active', !over && active === 'w');
  clockBlackRow.classList.toggle('active', !over && active === 'b');
}

function kingSquare(color: 'w' | 'b'): string | null {
  for (const file of 'abcdefgh') {
    for (let rank = 1; rank <= 8; rank++) {
      const sq = `${file}${rank}`;
      const piece = chess.get(sq as Square);
      if (piece && piece.color === color && piece.type === 'k') return sq;
    }
  }
  return null;
}

/** 双方得子：白方吃到的黑子放白方条，黑方吃到的白子放黑方条 */
function renderCaptured(): void {
  const byWhite: PieceKind[] = [];
  const byBlack: PieceKind[] = [];
  for (const move of chess.history({ verbose: true })) {
    if (!move.captured) continue;
    if (move.color === 'w') byWhite.push(move.captured as PieceKind);
    else byBlack.push(move.captured as PieceKind);
  }
  const draw = (el: HTMLElement, kinds: PieceKind[], color: 'w' | 'b'): void => {
    el.textContent = '';
    for (const kind of kinds) {
      const img = document.createElement('img');
      img.src = pieceImage(color, kind);
      img.alt = '';
      img.draggable = false;
      el.appendChild(img);
    }
  };
  draw(capWhiteEl, byWhite, 'b');
  draw(capBlackEl, byBlack, 'w');
}

function renderBoard(): void {
  if (!board) return;
  board.render(chess);
  board.clearChecks();
  board.clearMarks();
  board.clearAnnotations();
  if (lastMove) board.markLastMove(lastMove.from, lastMove.to);
  if (chess.inCheck()) board.markCheck(kingSquare(chess.turn()));
  renderCaptured();
}

function selectSquare(sq: Square): void {
  selected = sq;
  targets = chess.moves({ square: sq, verbose: true }).map((m) => ({
    to: m.to,
    promotion: m.promotion as PieceKind | undefined,
    capture: Boolean(m.captured),
  }));
  if (!board) return;
  board.clearMarks();
  board.markSelected(sq);
  board.markTargets(
    targets.map((t) => t.to),
    targets.filter((t) => t.capture).map((t) => t.to),
  );
}

function clearSelection(): void {
  selected = null;
  targets = [];
  board?.clearMarks();
}

/** 当前这一方是否由人来走：人机模式只有白方，人人模式双方都可 */
function humanCanMove(side: 'w' | 'b'): boolean {
  return mode === 'human' || side === 'w';
}

function isMovablePiece(sq: string): boolean {
  const piece = chess.get(sq as Square);
  return Boolean(piece && piece.color === active && humanCanMove(active));
}

/** 记录一步用时，并切换到对方计时 */
function recordMove(side: 'w' | 'b'): void {
  const now = performance.now();
  moveTimes.push(Math.round(now - turnStart));
  clocks[side] += incMs;
  turnStart = now;
  active = side === 'w' ? 'b' : 'w';
  updateClocks();
}

function finish(reason: 'checkmate' | 'draw' | 'timeout'): void {
  if (over) return;
  over = true;
  busy = true;
  window.clearInterval(timer);
  updateClocks();

  let title = '对局结束';
  let text = '';
  if (reason === 'timeout') {
    title = `${active === 'w' ? '黑方' : '白方'}获胜`;
    text = '对方超时。';
  } else if (chess.isCheckmate()) {
    title = `${chess.turn() === 'w' ? '黑方' : '白方'}获胜`;
    text = '将死。';
  } else {
    title = '平局';
    text = '双方均无法取胜。';
  }
  resultTitle.textContent = title;
  resultText.textContent = text;
  resultEl.hidden = false;
}

function checkGameOver(): boolean {
  if (!chess.isGameOver()) return false;
  finish(chess.isCheckmate() ? 'checkmate' : 'draw');
  return true;
}

async function playMove(from: string, to: string): Promise<void> {
  if (over || busy || !humanCanMove(active)) return;
  const mover = active;
  const hit = targets.find((t) => t.to === to && t.promotion);
  let promotion: PieceKind | undefined;
  if (hit) {
    const choice = await askPromotion(mover);
    if (!choice) {
      clearSelection();
      return;
    }
    promotion = choice;
  }
  let move;
  try {
    move = chess.move({ from, to, promotion });
  } catch {
    clearSelection();
    return;
  }
  if (!move) {
    clearSelection();
    return;
  }
  recordMove(mover);
  lastMove = { from: move.from, to: move.to };
  clearSelection();
  renderBoard();
  if (checkGameOver()) return;
  if (mode === 'engine' && active === 'b') void engineTurn();
}

async function engineTurn(): Promise<void> {
  if (over || mode !== 'engine') return;
  busy = true;
  try {
    // 至少隔 3 秒再应招，避免对局看起来像“瞬间回子”
    await new Promise((resolve) => window.setTimeout(resolve, ENGINE_DELAY));
    if (over) return;
    const uci = await bestMove(chess.fen(), ENGINE_MOVETIME);
    if (over) return;
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as PieceKind | undefined });
    } catch {
      throw new Error('引擎返回了不合法的着法');
    }
    if (!move) throw new Error('引擎返回了不合法的着法');
    recordMove('b');
    lastMove = { from: move.from, to: move.to };
    renderBoard();
    if (checkGameOver()) return;
  } catch (error) {
    over = true;
    window.clearInterval(timer);
    openAlert('引擎错误', error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

function onPick(sq: Square): void {
  if (over || busy) return;
  if (!humanCanMove(active)) return;
  if (!selected) {
    if (isMovablePiece(sq)) selectSquare(sq);
    return;
  }
  if (sq === selected) {
    clearSelection();
    return;
  }
  const hit = targets.find((t) => t.to === sq);
  if (hit) {
    void playMove(selected, sq);
    return;
  }
  if (isMovablePiece(sq)) selectSquare(sq);
  else clearSelection();
}

function ensureBoard(): void {
  if (board) return;
  board = new BoardView(boardEl);
  board.onPick = (sq) => onPick(sq as Square);
  board.setDragHandlers({
    canStart: (sq) => !over && !busy && isMovablePiece(sq),
    canDrop: (from, to) => chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to),
    onDrop: (from, to) => {
      if (isMovablePiece(from)) selectSquare(from as Square);
      void playMove(from, to);
    },
    onDragStart: (from) => {
      if (isMovablePiece(from)) selectSquare(from as Square);
    },
    onDragEnd: () => clearSelection(),
  });
}

function startGame(nextBase: number, nextInc: number): void {
  baseMs = nextBase;
  incMs = nextInc;
  chess = new Chess();
  clocks = { w: baseMs, b: baseMs };
  active = 'w';
  over = false;
  busy = false;
  moveTimes = [];
  lastMove = null;
  selected = null;
  targets = [];

  nameWhiteEl.textContent = mode === 'engine' ? '白方 · 你' : '白方';
  nameBlackEl.textContent = mode === 'engine' ? '黑方 · Stockfish' : '黑方';

  setupEl.hidden = true;
  gameEl.hidden = false;
  resultEl.hidden = true;

  ensureBoard();
  board?.setFlipped(false);
  renderBoard();
  updateClocks();

  const now = performance.now();
  turnStart = now;
  lastTick = now;
  window.clearInterval(timer);
  timer = window.setInterval(() => {
    if (over) return;
    const nowTick = performance.now();
    const dt = nowTick - lastTick;
    lastTick = nowTick;
    clocks[active] = Math.max(0, clocks[active] - dt);
    if (clocks[active] <= 0) {
      updateClocks();
      finish('timeout');
    } else {
      updateClocks();
    }
  }, 100);

  if (mode === 'engine') {
    // 预热引擎，避免第一步额外等待
    void startEngine().catch(() => undefined);
  }
}

// 人机 / 人人选择
document.querySelectorAll<HTMLButtonElement>('.mode-option').forEach((button) => {
  button.addEventListener('click', () => {
    mode = button.dataset.mode === 'human' ? 'human' : 'engine';
    document.querySelectorAll('.mode-option').forEach((el) => el.classList.toggle('selected', el === button));
  });
});

// 时间限制按钮
document.querySelectorAll<HTMLButtonElement>('.time-option').forEach((button) => {
  button.addEventListener('click', () => {
    startGame(Number(button.dataset.base ?? 300000), Number(button.dataset.inc ?? 0));
  });
});

must('btn-again').addEventListener('click', () => startGame(baseMs, incMs));
must('btn-review').addEventListener('click', () => {
  window.clearInterval(timer);
  if (mode === 'engine') chess.header('White', '你', 'Black', 'Stockfish');
  else chess.header('White', '白方', 'Black', '黑方');
  sessionStorage.setItem('jxchess.play.pgn', chess.pgn());
  sessionStorage.setItem('jxchess.play.times', JSON.stringify(moveTimes));
  sessionStorage.setItem('jxchess.play.mode', mode);
  location.href = './review.html?fromPlay=1';
});

// 离开页面前停掉引擎搜索
window.addEventListener('beforeunload', () => {
  void stopSearch();
});
