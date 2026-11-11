/**
 * 复盘页入口：装配三栏界面（左分析面板 / 中棋盘+评估条 / 右棋谱面板）。
 * 含 PGN 导入导出、逐步回放、点击与拖拽走子、翻转棋盘、上下得子、棋盘翻转、
 * 变例记录与支线管理、显示/引擎设置入口。
 * P1 阶段分析面板与评估条为静态骨架，引擎接入在 P2。
 */
import { BoardView } from '../board/boardView';
import { BoardInput, type MovePlayed } from '../board/input';
import { ReviewState } from '../game/gameState';
import { renderMoveList } from '../panels/moveList';
import { openTextDialog } from '../panels/dialog';
import { openDisplaySettings, openEngineSettings } from '../panels/settingsDialog';
import { EvalBar } from '../panels/evalBar';
import { loadDisplay, type DisplaySettings } from '../settings';
import { SoundFX } from '../effects/sound';
import { pieceImage, type PieceKind } from '../game/types';

function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`缺少页面元素 #${id}`);
  return el as T;
}

const state = new ReviewState();

const reviewMain = must('review-main');
const boardWrap = must('board-wrap');
const moveListEl = must('move-list');
const capTop = must('cap-top');
const capBottom = must('cap-bottom');
const panelNote = must('panel-note');
const filePicker = must<HTMLInputElement>('file-picker');
const btnNewBranch = must<HTMLButtonElement>('btn-new-branch');
const btnDeleteBranch = must<HTMLButtonElement>('btn-delete-branch');
const btnDrawer = must<HTMLButtonElement>('btn-analysis-drawer');
const btnAnalyze = must<HTMLButtonElement>('btn-analyze');
const chartBody = must('chart-body');
const chartTitle = must('chart-title');
const btnChartToggle = must<HTMLButtonElement>('btn-chart-toggle');
const playerWhite = must('player-white');
const playerBlack = must('player-black');

const board = new BoardView(boardWrap);
const evalBar = new EvalBar(must('evalbar'));
const sfx = new SoundFX();
let flipped = false;
let display: DisplaySettings = loadDisplay();
let timingView = false;

/**
 * 在棋谱面板内显示一行提示，替代浮动弹窗。
 * 刻意不设定时清除：错误信息要一直留在面板上，方便用户看清原因；
 * 它会被下一条提示替换，或在用户完成一次成功的导入/走子后清掉。
 */
function showNote(message: string): void {
  panelNote.textContent = message;
}

/** 清掉面板内的提示行（该行没有内容时不会占位） */
function clearNote(): void {
  panelNote.textContent = '';
}

/** 把显示设置应用到页面（只切 class，具体样式交给 CSS） */
function applyDisplaySettings(): void {
  reviewMain.classList.toggle('hide-evalbar', !display.evalBar);
  reviewMain.classList.toggle('hide-scores', !display.moveScores);
  reviewMain.classList.toggle('hide-annotations', !display.annotations);
  reviewMain.classList.toggle('hide-best-arrow', !display.bestArrow);
  reviewMain.classList.toggle('hide-extra-arrows', !display.extraArrows);
  evalBar.setFlipped(display.evalFollowFlip && flipped);
}

// 支持从摆棋页带着局面跳转过来
const fenParam = new URLSearchParams(location.search).get('fen');
if (fenParam) {
  const error = state.setStartFen(fenParam);
  if (error) showNote(error);
}

function renderPlayers(): void {
  const { white, black } = state.players();
  playerWhite.textContent = white;
  playerBlack.textContent = black;
}

/**
 * 得子显示在棋盘上下：默认白方在下，所以白方吃到的子贴近棋盘下沿；
 * 翻转棋盘后整组跟着换位。
 */
function renderCaptured(): void {
  const { byWhite, byBlack } = state.captured();
  const whiteStrip = flipped ? capTop : capBottom;
  const blackStrip = flipped ? capBottom : capTop;
  renderCapRow(whiteStrip, byWhite, 'b');
  renderCapRow(blackStrip, byBlack, 'w');
}

/** 只摆棋子图标，不写“x 方得子”文字 */
function renderCapRow(el: HTMLElement, kinds: PieceKind[], color: 'w' | 'b'): void {
  el.textContent = '';
  for (const kind of kinds) {
    const img = document.createElement('img');
    img.src = pieceImage(color, kind);
    img.alt = '';
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
    goVariationStep: (row, index, step) => {
      state.goVariationStep(row, index, step);
      refresh(null);
    },
  });
  renderPlayers();
  renderCaptured();
  renderResult();
  updateBranchButtons();
}

function loadPgnText(text: string): void {
  const error = state.loadPgn(text);
  if (error) showNote(error);
  else {
    // 导入成功：清掉上一次残留的错误提示
    clearNote();
    refresh(null);
  }
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

/** 打开本机文件并返回文本；用户取消时保持挂起（弹窗关闭后随页面回收） */
function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    filePicker.value = '';
    const onChange = (): void => {
      filePicker.removeEventListener('change', onChange);
      const file = filePicker.files?.[0] ?? null;
      if (!file) {
        resolve(null);
        return;
      }
      void file.text().then(resolve);
    };
    filePicker.addEventListener('change', onChange);
    filePicker.click();
  });
}

// 棋盘交互：点击与拖拽均在此触发刷新
new BoardInput(board, state, {
  onChanged: (move) => {
    // 走出一步合法着法即视为已恢复正常，清掉之前残留的错误提示
    clearNote();
    refresh(move);
  },
  onMessage: showNote,
  // 拖拽中途松手（或落到非法格）时，把棋盘恢复成常规高亮
  onDragEnd: () => refresh(null),
});

// 底部控制条：回到开局 / 上一步 / 旋转 / 下一步 / 终局
must('btn-start').addEventListener('click', () => {
  state.toStart();
  refresh(null);
});
must('btn-prev').addEventListener('click', () => {
  state.stepBack();
  refresh(null);
});
must('btn-flip').addEventListener('click', () => {
  flipped = !flipped;
  board.setFlipped(flipped);
  evalBar.setFlipped(display.evalFollowFlip && flipped);
  renderCaptured();
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

// 棋谱面板：导入（打开文件 + 粘贴二合一）与导出
must('btn-import').addEventListener('click', async () => {
  const text = await openTextDialog({
    title: '导入棋谱',
    placeholder: '打开本机 PGN 文件，或把 PGN 文本粘贴到这里，例如：\n1. e4 e5 2. Nf3 Nc6 ...',
    confirmText: '导入',
    rows: 12,
    fileButton: { label: '打开文件', onPick: pickFile },
  });
  if (text) loadPgnText(text);
});
must('btn-export').addEventListener('click', downloadPgn);

// 设置入口：P1 先保存到本地，引擎参数在 P2 接到 Rust 侧
must('btn-display-settings').addEventListener('click', () => {
  openDisplaySettings((next) => {
    display = next;
    applyDisplaySettings();
  });
});
must('btn-engine-settings').addEventListener('click', () => {
  openEngineSettings(() => showNote('引擎设置已保存，接入引擎后生效。'));
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

// 分析面板：P1 只有骨架，点击给出说明
btnAnalyze.addEventListener('click', () => {
  showNote('引擎分析将在 P2 接入，当前先展示界面框架。');
});

// 图表切换：局面走势 ⇄ 用时分析
btnChartToggle.addEventListener('click', () => {
  timingView = !timingView;
  chartBody.classList.toggle('timing', timingView);
  chartTitle.textContent = timingView ? '用时分析' : '局面走势';
  btnChartToggle.title = timingView ? '切换为局面走势' : '切换为用时分析';
});

// 窄屏抽屉：点顶栏「分析」展开/收起，Esc 关闭
btnDrawer.addEventListener('click', () => {
  reviewMain.classList.toggle('analysis-open');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') reviewMain.classList.remove('analysis-open');
});

applyDisplaySettings();
refresh(null);
