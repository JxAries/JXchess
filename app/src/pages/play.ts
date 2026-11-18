/**
 * 对弈页入口：选择时间限制后与本地 Stockfish 对弈。
 * 玩家执白；双方各有时钟，走一步加一次秒；记录每一步用时（毫秒）供之后画用时图。
 * 对局结束可把 PGN 与用时写入 sessionStorage，跳到复盘页继续分析。
 */
import { Chess, type Square } from 'chess.js';
import { BoardView } from '../board/boardView';
import { askPromotion } from '../panels/promotion';
import { openAlert } from '../panels/dialog';
import { bestMove, startEngine, stopSearch } from '../engine/client';
import type { PieceKind } from '../game/types';

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
const statusEl = must('play-status');
const resultEl = must('result');
const resultTitle = must('result-title');
const resultText = must('result-text');

/** 玩家固定执白；引擎执黑 */
const PLAYER: 'w' = 'w';
const ENGINE: 'b' = 'b';
/** 引擎每步思考时间（毫秒），对弈不追求强度 */
const ENGINE_MOVETIME = 700;

let board: BoardView | null = null;
let chess = new Chess();
let baseMs = 300000;
let incMs = 0;
let clocks = { w: baseMs, b: baseMs };
let active: 'w' | 'b' = PLAYER;
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
  clockWhiteRow.classList.toggle('active', !over && active === PLAYER);
  clockBlackRow.classList.toggle('active', !over && active === ENGINE);
}

function setStatus(text: string): void {
  statusEl.textContent = text;
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

function renderBoard(): void {
  if (!board) return;
  board.render(chess);
  board.clearChecks();
  board.clearMarks();
  board.clearAnnotations();
  if (lastMove) board.markLastMove(lastMove.from, lastMove.to);
  if (chess.inCheck()) board.markCheck(kingSquare(chess.turn()));
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

function isPlayerPiece(sq: string): boolean {
  const piece = chess.get(sq as Square);
  return Boolean(piece && piece.color === PLAYER);
}

/** 记录一步用时，并切换到对方计时 */
function recordMove(side: 'w' | 'b'): void {
  const now = performance.now();
  moveTimes.push(Math.round(now - turnStart));
  clocks[side] += incMs;
  turnStart = now;
  active = side === PLAYER ? ENGINE : PLAYER;
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
    const winner = active === PLAYER ? '黑方' : '白方';
    title = `${winner}获胜`;
    text = '对方超时。';
  } else if (chess.isCheckmate()) {
    const winner = chess.turn() === 'w' ? '黑方' : '白方';
    title = `${winner}获胜`;
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
  if (over || busy || active !== PLAYER) return;
  const hit = targets.find((t) => t.to === to && t.promotion);
  let promotion: PieceKind | undefined;
  if (hit) {
    const choice = await askPromotion(PLAYER);
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
  recordMove(PLAYER);
  lastMove = { from: move.from, to: move.to };
  clearSelection();
  renderBoard();
  if (checkGameOver()) return;
  setStatus('鳕鱼思考中…');
  void engineTurn();
}

async function engineTurn(): Promise<void> {
  if (over) return;
  busy = true;
  try {
    const uci = await bestMove(chess.fen(), ENGINE_MOVETIME);
    if (over) return;
    let move;
    try {
      move = chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] as PieceKind | undefined });
    } catch {
      throw new Error('引擎返回了不合法的着法');
    }
    if (!move) throw new Error('引擎返回了不合法的着法');
    recordMove(ENGINE);
    lastMove = { from: move.from, to: move.to };
    renderBoard();
    if (checkGameOver()) return;
    setStatus('轮到你走棋');
  } catch (error) {
    over = true;
    window.clearInterval(timer);
    openAlert('引擎错误', error instanceof Error ? error.message : String(error));
  } finally {
    busy = false;
  }
}

function onPick(sq: Square): void {
  if (over || busy || active !== PLAYER) return;
  if (!selected) {
    if (isPlayerPiece(sq)) selectSquare(sq);
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
  if (isPlayerPiece(sq)) selectSquare(sq);
  else clearSelection();
}

function ensureBoard(): void {
  if (board) return;
  board = new BoardView(boardEl);
  board.onPick = (sq) => onPick(sq as Square);
  board.setDragHandlers({
    canStart: (sq) => !over && !busy && active === PLAYER && isPlayerPiece(sq),
    canDrop: (from, to) => chess.moves({ square: from as Square, verbose: true }).some((m) => m.to === to),
    onDrop: (from, to) => {
      // 拖拽时也需要先亮出该子的合法落点，才能处理升变
      const piece = chess.get(from as Square);
      if (piece && piece.color === PLAYER) selectSquare(from as Square);
      void playMove(from, to);
    },
    onDragStart: (from) => {
      const piece = chess.get(from as Square);
      if (piece && piece.color === PLAYER) selectSquare(from as Square);
    },
    onDragEnd: () => clearSelection(),
  });
}

function startGame(nextBase: number, nextInc: number): void {
  baseMs = nextBase;
  incMs = nextInc;
  chess = new Chess();
  clocks = { w: baseMs, b: baseMs };
  active = PLAYER;
  over = false;
  busy = false;
  moveTimes = [];
  lastMove = null;
  selected = null;
  targets = [];

  setupEl.hidden = true;
  gameEl.hidden = false;
  resultEl.hidden = true;

  ensureBoard();
  board?.setFlipped(false);
  renderBoard();
  updateClocks();
  setStatus('轮到你走棋');

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
}

function stopGame(): void {
  over = true;
  window.clearInterval(timer);
  setupEl.hidden = false;
  gameEl.hidden = true;
  resultEl.hidden = true;
}

// 时间限制按钮
document.querySelectorAll<HTMLButtonElement>('.time-option').forEach((button) => {
  button.addEventListener('click', () => {
    startGame(Number(button.dataset.base ?? 300000), Number(button.dataset.inc ?? 0));
    // 预热引擎，避免第一步等待
    void startEngine().catch(() => undefined);
  });
});

must('btn-back').addEventListener('click', stopGame);
must('btn-again').addEventListener('click', () => startGame(baseMs, incMs));
must('btn-review').addEventListener('click', () => {
  window.clearInterval(timer);
  // 写进 PGN 头，复盘页就能显示双方名字
  chess.header('White', '你', 'Black', 'Stockfish');
  sessionStorage.setItem('jxchess.play.pgn', chess.pgn());
  sessionStorage.setItem('jxchess.play.times', JSON.stringify(moveTimes));
  location.href = './review.html?fromPlay=1';
});

// 离开页面前停掉引擎搜索，避免复盘页启动时拿到旧的 bestmove
window.addEventListener('beforeunload', () => {
  void stopSearch();
});
