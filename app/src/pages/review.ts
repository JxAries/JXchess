/**
 * 复盘页入口：装配三栏界面（左分析面板 / 中棋盘+评估条 / 右棋谱面板）。
 * 含 PGN 导入导出、逐步回放、点击与拖拽走子、翻转棋盘、上下得子、棋盘翻转、
 * 变例记录与支线管理、显示/引擎设置入口。
 * P1 阶段分析面板与评估条为静态骨架，引擎接入在 P2。
 */
import { BoardView, type BoardArrow } from '../board/boardView';
import { BoardInput, type MovePlayed } from '../board/input';
import { ReviewState } from '../game/gameState';
import { renderMoveList } from '../panels/moveList';
import { openAlert, openTextDialog } from '../panels/dialog';
import { openDisplaySettings, openEngineSettings } from '../panels/settingsDialog';
import { EvalBar } from '../panels/evalBar';
import { renderEvalChart, renderTimingChart } from '../panels/evalChart';
import { AnalysisController, formatScore, pvToSan, type EngineLine } from '../engine/analysis';
import { shutdownEngine } from '../engine/client';
import { ANNOTATION_SYMBOL, accuracyFromAcpl, classifyMove, computeCpLoss, isSacrificeFen, type AnnotationKind } from '../game/annotations';
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
const engineScore1 = must('engine-score-1');
const enginePv1 = must('engine-pv-1');
const engineScore2 = must('engine-score-2');
const enginePv2 = must('engine-pv-2');
const analysisMask = must('analysis-mask');
const analysisProgress = must('analysis-progress');
const analysisProgressFill = must('analysis-progress-fill');
const analysisProgressLabel = must('analysis-progress-label');
const chartEmpty = document.querySelector<HTMLElement>('.chart-empty');

const board = new BoardView(boardWrap);
const evalBar = new EvalBar(must('evalbar'));
const sfx = new SoundFX();
let flipped = false;
let display: DisplaySettings = loadDisplay();
let timingView = false;
// 深度分析是否已完成（完成后左侧栏才显示，后续新着法允许自动分析补充）
let panelRevealed = false;

/** 引擎分析结果：自动分析只更新评估条；深度分析完成后才统一写左侧栏、棋谱评分与标注 */
const analysis = new AnalysisController((result, mode) => {
  // 深度分析过程中不要逐手刷新，等整局完成再统一更新
  if (mode === 'deep') return;
  // 结果只对当前选中的局面生效，避免切步后旧结果覆盖
  if (result.fen !== state.chessNow().fen()) return;
  const deep = analysis.analysisFor(result.fen, false);
  if (!deep) evalBar.setScore({ cp: result.cp, mate: result.mate });
  // 导入的棋局：未点“分析本局”前，自动分析不参与左侧栏
  if (state.imported && !panelRevealed) return;
  if (deep) {
    // 已经有深度结果时，自动分析不能覆盖左侧栏
    paintStoredAnalysis();
    paintMoveScores();
    paintAnnotations();
    renderStatsAndChart();
    paintArrows();
    return;
  }
  paintEngineLine(result.lines[0], engineScore1, enginePv1, result.fen);
  paintEngineLine(result.lines[1], engineScore2, enginePv2, result.fen);
  paintMoveScores();
  paintAnnotations();
  renderStatsAndChart();
  paintArrows();
});

/** 填充左侧一条引擎推荐 */
function paintEngineLine(line: EngineLine | undefined, scoreEl: HTMLElement, pvEl: HTMLElement, fen: string): void {
  if (!line) {
    scoreEl.textContent = '—';
    pvEl.textContent = '未分析';
    return;
  }
  scoreEl.textContent = formatScore(line.cp, line.mate) || '—';
  pvEl.textContent = pvToSan(fen, line.pv) || line.pv.join(' ');
}

/** 用已算过的局面分填棋谱每步右侧的评分 */
function paintMoveScores(): void {
  moveListEl.querySelectorAll<HTMLElement>('.ply-score').forEach((el) => {
    const fen = el.dataset.fen;
    if (!fen) return;
    el.textContent = analysis.scoreFor(fen);
  });
}

/** 在刚走动的棋子右上角显示优劣标记；被将死的王上方显示 # */
function paintAnnotations(): void {
  if (!display.annotations) {
    board.clearAnnotations();
    return;
  }
  const current = state.currentFens();
  const last = state.lastMoveInfo();
  if (current && last) {
    const before = analysis.evalCp(current.before);
    const after = analysis.evalCp(current.after);
    if (before !== undefined && after !== undefined) {
      const side = current.before.split(' ')[1] === 'b' ? 'b' : 'w';
      const tag = classifyMove(before, after, side, { sacrifice: isSacrificeFen(current.before, current.after, side) });
      board.markAnnotation(last.to, ANNOTATION_SYMBOL[tag], tag);
    } else {
      board.clearAnnotations();
    }
  } else {
    board.clearAnnotations();
  }

  const chess = state.chessNow();
  if (chess.isCheckmate()) {
    const king = state.kingSquare(chess.turn());
    if (king) board.markAnnotation(king, '#', 'mate');
    // 终局结论不依赖引擎在无着可走局面上的输出
    evalBar.setScore({ mate: chess.turn() === 'w' ? -1 : 1 });
  } else if (chess.isGameOver()) {
    // 和棋：双方王右上角显示 =
    const marks: Array<{ sq: string; text: string; kind: string }> = [];
    const whiteKing = state.kingSquare('w');
    const blackKing = state.kingSquare('b');
    if (whiteKing) marks.push({ sq: whiteKing, text: '=', kind: 'draw' });
    if (blackKing) marks.push({ sq: blackKing, text: '=', kind: 'draw' });
    board.markAnnotations(marks);
    evalBar.setScore({ cp: 0 });
  }
}

/** 用主线局面分刷新左侧统计、走势图或用时图 */
function renderStatsAndChart(): void {
  const fens = state.mainFens();
  const values = fens.map((fen) => analysis.evalCp(fen));
  const tags: Array<AnnotationKind | undefined> = new Array(values.length).fill(undefined);

  type Counts = Record<AnnotationKind, number>;
  const emptyCounts = (): Counts => ({
    brilliant: 0,
    best: 0,
    good: 0,
    normal: 0,
    inaccuracy: 0,
    mistake: 0,
    blunder: 0,
  });
  const stats = {
    w: { counts: emptyCounts(), sum: 0, moves: 0 },
    b: { counts: emptyCounts(), sum: 0, moves: 0 },
  };

  for (let i = 0; i < fens.length - 1; i++) {
    const before = values[i];
    const after = values[i + 1];
    if (before === undefined || after === undefined) continue;
    const side = fens[i].split(' ')[1] === 'b' ? 'b' : 'w';
    const loss = computeCpLoss(before, after, side);
    const tag = classifyMove(before, after, side, { sacrifice: isSacrificeFen(fens[i], fens[i + 1], side) });
    tags[i + 1] = tag;
    stats[side].counts[tag] += 1;
    stats[side].sum += loss;
    stats[side].moves += 1;
  }

  const chart = document.querySelector<SVGSVGElement>('.chart-line');
  if (chart) {
    if (timingView) {
      renderTimingChart(chart, playTimes);
      chartEmpty?.classList.toggle('show', playTimes.length === 0);
    } else {
      renderEvalChart(chart, values, state.mainDepth(), tags);
      chartEmpty?.classList.remove('show');
    }
  }

  if (fens.length < 2) return;

  for (const side of ['w', 'b'] as const) {
    const root = document.querySelector<HTMLElement>(`.stats-side[data-side="${side === 'w' ? 'white' : 'black'}"]`);
    if (!root) continue;
    for (const [kind, count] of Object.entries(stats[side].counts)) {
      const el = root.querySelector<HTMLElement>(`[data-kind="${kind}"]`);
      if (el) el.textContent = String(count);
    }
    const acpl = stats[side].moves ? Math.round(stats[side].sum / stats[side].moves) : 0;
    const accuracy = stats[side].moves ? accuracyFromAcpl(acpl) : 0;
    const accEl = root.querySelector<HTMLElement>('[data-kind="accuracy"]');
    const acplEl = root.querySelector<HTMLElement>('[data-kind="acpl"]');
    if (accEl) accEl.textContent = stats[side].moves ? `${accuracy}%` : '–';
    if (acplEl) acplEl.textContent = stats[side].moves ? String(acpl) : '–';
  }
}

/** 深度分析进度：按钮位置换成进度条 */
function setAnalysisProgress(done: number, total: number): void {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  analysisProgressFill.style.width = `${pct}%`;
  analysisProgressLabel.textContent = `${pct}%`;
}

/** 导入新棋局时：左侧栏回到“未分析”状态；没导入棋谱时不显示蒙版 */
function resetAnalysisPanel(): void {
  panelRevealed = false;
  analysis.clearDeep();
  board.clearAnnotations();
  board.clearArrows();
  moveListEl.querySelectorAll<HTMLElement>('.ply-score').forEach((el) => {
    el.textContent = '';
  });
  analysisProgress.hidden = true;
  btnAnalyze.hidden = false;
  btnAnalyze.disabled = false;
  btnAnalyze.textContent = '分析本局';
  syncAnalysisMask();
  renderStatsAndChart();
}

/** 有导入棋谱且未深度分析时才显示蒙版；空棋盘直接露出左侧栏 */
function syncAnalysisMask(): void {
  analysisMask.classList.toggle('hidden', !state.imported || panelRevealed);
}

/** 按当前局面取已存的分析，更新一选/二选与评估条（跟随切步） */
function paintStoredAnalysis(): void {
  const fen = state.chessNow().fen();
  const stored = analysis.analysisFor(fen, !state.imported || panelRevealed);
  if (!stored) {
    paintEngineLine(undefined, engineScore1, enginePv1, fen);
    paintEngineLine(undefined, engineScore2, enginePv2, fen);
    return;
  }
  evalBar.setScore({ cp: stored.cp, mate: stored.mate });
  paintEngineLine(stored.lines[0], engineScore1, enginePv1, fen);
  paintEngineLine(stored.lines[1], engineScore2, enginePv2, fen);
}

/** 显示设置：最佳着法 / 二选三选箭头 */
function paintArrows(): void {
  if (!display.bestArrow && !display.extraArrows) {
    board.clearArrows();
    return;
  }
  const fen = state.chessNow().fen();
  const stored = analysis.analysisFor(fen, !state.imported || panelRevealed);
  if (!stored) {
    board.clearArrows();
    return;
  }
  const arrows: BoardArrow[] = [];
  const add = (line: (typeof stored.lines)[number] | undefined, color: string): void => {
    const uci = line?.pv[0];
    if (uci && uci.length >= 4) arrows.push({ from: uci.slice(0, 2), to: uci.slice(2, 4), color });
  };
  if (display.bestArrow) add(stored.lines[0], '#9a3b3b');
  if (display.extraArrows) {
    add(stored.lines[1], '#2f6fdf');
    add(stored.lines[2], '#2f6fdf');
  }
  board.setArrows(arrows);
}

/**
 * 错误与提示统一用弹窗输出：之前塞在棋谱面板里的一行小字位置太隐蔽，
 * 用户很难第一时间注意到；弹窗更直接（点“知道了”、遮罩或 Esc 关闭）。
 */
function showNote(message: string): void {
  openAlert('提示', message);
}

/** 把显示设置应用到页面（只切 class，具体样式交给 CSS） */
function applyDisplaySettings(): void {
  reviewMain.classList.toggle('hide-evalbar', !display.evalBar);
  reviewMain.classList.toggle('hide-scores', !display.moveScores);
  reviewMain.classList.toggle('hide-annotations', !display.annotations);
  reviewMain.classList.toggle('hide-best-arrow', !display.bestArrow);
  reviewMain.classList.toggle('hide-extra-arrows', !display.extraArrows);
  evalBar.setFlipped(display.evalFollowFlip && flipped);
  paintArrows();
}

// 支持从摆棋页带着局面跳转过来
const fenParam = new URLSearchParams(location.search).get('fen');
if (fenParam) {
  const error = state.setStartFen(fenParam);
  if (error) showNote(error);
}

// 从对弈页跳转过来：读取刚才那盘棋的 PGN 与每步用时
const fromPlay = Boolean(new URLSearchParams(location.search).get('fromPlay'));
const playTimes: number[] = [];
if (fromPlay) {
  const rawTimes = sessionStorage.getItem('jxchess.play.times');
  if (rawTimes) {
    try {
      const parsed = JSON.parse(rawTimes) as number[];
      if (Array.isArray(parsed)) playTimes.push(...parsed);
    } catch {
      // 用时数据损坏时忽略，图表按无数据展示
    }
  }
  const pgn = sessionStorage.getItem('jxchess.play.pgn');
  if (pgn) {
    const error = state.loadPgn(pgn);
    if (error) showNote(error);
    else resetAnalysisPanel();
  }
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

  // 终局直接给确定结论，不依赖引擎在“无着可走”局面上的输出
  if (chess.isCheckmate()) {
    evalBar.setScore({ mate: chess.turn() === 'w' ? -1 : 1 });
  } else if (chess.isGameOver()) {
    evalBar.setScore({ cp: 0 });
  }

  if (play) {
    // 吃子与将军同时发生时，用吃子音效覆盖将军音效
    if (play.capture) sfx.capture();
    else if (chess.inCheck()) sfx.check();
    else sfx.move();
    board.animateMove(play.from, play.to);
  }

  renderMoveList(moveListEl, state, {
    goToNode: (id) => {
      state.goToNodeId(id);
      refresh(null);
    },
  });
  renderPlayers();
  renderCaptured();
  renderResult();
  updateBranchButtons();
  // 深度分析进行中不逐手刷新评分/标注，等整局完成统一更新
  if (!analysis.isScanning()) {
    paintMoveScores();
    paintAnnotations();
    paintStoredAnalysis();
    renderStatsAndChart();
    paintArrows();
  }

  // 逐手分析默认开启：每换一个局面就从浅到深重新算
  if (display.autoAnalyze && window.__TAURI__) {
    void analysis.analyze(chess.fen(), !state.imported || panelRevealed).catch(() => {
      // 引擎启动失败时保持界面可用，错误在用户点“分析本局”时提示
    });
  }
}

function loadPgnText(text: string): void {
  const error = state.loadPgn(text);
  if (error) showNote(error);
  else {
    resetAnalysisPanel();
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
  onChanged: (move) => refresh(move),
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

// 设置入口：显示项即时生效；引擎参数在引擎已启动时直接下发
must('btn-display-settings').addEventListener('click', () => {
  openDisplaySettings((next) => {
    display = next;
    applyDisplaySettings();
    paintAnnotations();
    if (!display.autoAnalyze) {
      void analysis.stop();
    } else if (window.__TAURI__) {
      void analysis.analyze(state.chessNow().fen()).catch(() => undefined);
    }
  });
});
must('btn-engine-settings').addEventListener('click', () => {
  openEngineSettings(() => {
    void analysis.applySettings();
    showNote('引擎设置已保存。');
  });
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

// 分析本局：逐手深度分析，按钮换成进度条，蒙版保持到完成
btnAnalyze.addEventListener('click', async () => {
  const fens = state.mainFens();
  if (fens.length < 2) {
    showNote('当前还没有棋谱，先导入棋谱或走几步。');
    return;
  }
  btnAnalyze.hidden = true;
  analysisProgress.hidden = false;
  setAnalysisProgress(0, fens.length);
  try {
    await analysis.scanGame(fens, (done, total) => setAnalysisProgress(done, total));
    panelRevealed = true;
    paintMoveScores();
    paintAnnotations();
    paintStoredAnalysis();
    renderStatsAndChart();
    paintArrows();
    // 完成后直接露出分析栏，不弹窗
    analysisMask.classList.add('hidden');
    analysisProgress.hidden = true;
  } catch (error) {
    showNote(`整局分析失败：${error instanceof Error ? error.message : String(error)}`);
    analysisProgress.hidden = true;
    btnAnalyze.hidden = false;
  }
});

// 退出前关闭引擎，避免残留 stockfish 进程
window.addEventListener('beforeunload', () => {
  void shutdownEngine();
});


// 图表切换：局面走势 ⇄ 用时分析
btnChartToggle.addEventListener('click', () => {
  timingView = !timingView;
  chartBody.classList.toggle('timing', timingView);
  chartTitle.textContent = timingView ? '用时分析' : '局面走势';
  btnChartToggle.title = timingView ? '切换为局面走势' : '切换为用时分析';
  renderStatsAndChart();
});

// 窄屏抽屉：点顶栏「分析」展开/收起，Esc 关闭
btnDrawer.addEventListener('click', () => {
  reviewMain.classList.toggle('analysis-open');
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') reviewMain.classList.remove('analysis-open');
});

applyDisplaySettings();
syncAnalysisMask();
refresh(null);
