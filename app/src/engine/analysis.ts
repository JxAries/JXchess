/**
 * 引擎分析控制器：把当前局面发给 Stockfish，解析 `info` 行，
 * 产出评估分与两条主变，并按 UCI 着法转成 SAN。
 *
 * 逐手分析策略（对应“停留越久分析越久”）：
 *   先 go depth 10 拿一个快速结果，`bestmove` 回来后若局面没变就继续加深 14 → 18 → 22；
 *   用户一换局面立刻 stop 并重新从 10 开始，保证拖动棋谱时不卡。
 */
import { Chess } from 'chess.js';
import { onEngineLine, sendCommand, startEngine, stopSearch } from './client';
import { loadEngine } from '../settings';

export interface EngineLine {
  multipv: number;
  depth: number;
  /** 白方视角厘兵分 */
  cp?: number;
  /** 白方视角将杀步数 */
  mate?: number;
  pv: string[];
}

export interface PositionAnalysis {
  fen: string;
  depth: number;
  cp?: number;
  mate?: number;
  lines: EngineLine[];
}

/** auto：当前局面快速分析，只喂评估条；deep：点“分析本局”后的逐手分析，喂左侧栏与棋谱评分 */
export type AnalysisMode = 'auto' | 'deep';

const START_DEPTH = 10;
// 逐手分析默认开启：上限压到 18，避免长时间占满 CPU；停留越久越接近 18
const MAX_DEPTH = 18;
const STEP = 4;

/** 把 UCI 着法序列转成 SAN，最多显示 max 步 */
export function pvToSan(fen: string, pv: readonly string[], max = 8): string {
  try {
    const chess = new Chess(fen);
    const out: string[] = [];
    for (const uci of pv.slice(0, max)) {
      const move = chess.move({
        from: uci.slice(0, 2),
        to: uci.slice(2, 4),
        promotion: uci[4] as 'q' | 'r' | 'b' | 'n' | undefined,
      });
      if (!move) break;
      out.push(move.san);
    }
    return out.join(' ');
  } catch {
    return pv.slice(0, max).join(' ');
  }
}

/** 白方视角的分数文本：+1.2 / -0.4 / M5 / -M3 */
export function formatScore(cp?: number, mate?: number): string {
  if (mate !== undefined) return `${mate > 0 ? '' : '-'}M${Math.abs(mate)}`;
  if (cp === undefined) return '';
  const pawns = cp / 100;
  if (pawns === 0) return '0.0';
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}

export class AnalysisController {
  private started = false;
  private fen = '';
  private turn: 'w' | 'b' = 'w';
  private lines = new Map<number, EngineLine>();
  private currentDepth = 0;
  private timer = 0;
  private lastEmit = 0;
  /** 每个局面的开始时间：0.2s 内的 info 不采用，避免走子瞬间评估条乱跳 */
  private positionStart = 0;
  private scanning = false;
  private mode: AnalysisMode = 'auto';
  private recordAuto = false;
  private onUpdate: (analysis: PositionAnalysis, mode: AnalysisMode) => void;
  /** 深度分析（点击“分析本局”）的结果；自动分析绝不写入这里 */
  private deepScores = new Map<string, { cp?: number; mate?: number }>();
  private deepAnalyses = new Map<string, PositionAnalysis>();
  /** 自动分析结果：只有“无导入棋谱”或深度分析完成后的新着法才允许参与左侧栏 */
  private autoScores = new Map<string, { cp?: number; mate?: number }>();
  private autoAnalyses = new Map<string, PositionAnalysis>();

  constructor(onUpdate: (analysis: PositionAnalysis, mode: AnalysisMode) => void) {
    this.onUpdate = onUpdate;
    onEngineLine((line) => this.handleLine(line));
  }

  /** 自动分析；recordForPanel 为真时，结果也可以用于左侧栏（无导入棋谱 / 深度分析完成后的新着法） */
  async analyze(fen: string, recordForPanel = false): Promise<void> {
    if (this.scanning) return;
    this.recordAuto = recordForPanel;
    await this.startPosition(fen, 'auto');
  }

  /** 整局逐手分析：按顺序把每一手之后的局面各算一次，结果只进 deepScores / deepAnalyses */
  async scanGame(fens: readonly string[], onProgress?: (done: number, total: number) => void): Promise<void> {
    if (this.scanning) return;
    this.scanning = true;
    const started = performance.now();
    try {
      await this.init();
      for (let i = 0; i < fens.length; i++) {
        const fen = fens[i];
        if (!this.deepAnalyses.has(fen)) {
          await this.startPosition(fen, 'deep');
          // 等这一手出分（最多 3s，避免个别局面卡住整局）
          for (let t = 0; t < 30; t++) {
            if (this.deepAnalyses.has(fen)) break;
            await new Promise((resolve) => window.setTimeout(resolve, 100));
          }
        }
        onProgress?.(i + 1, fens.length);
      }
      // 整局深度分析至少 3 秒，避免短局点一下就结束、用户觉得没分析
      const elapsed = performance.now() - started;
      if (elapsed < 3000) {
        await new Promise((resolve) => window.setTimeout(resolve, 3000 - elapsed));
      }
    } finally {
      this.scanning = false;
    }
  }

  /** 是否正在逐手深度分析 */
  isScanning(): boolean {
    return this.scanning;
  }

  /** 清空分析结果（导入新棋局时调用） */
  clearDeep(): void {
    this.deepScores.clear();
    this.deepAnalyses.clear();
    this.autoScores.clear();
    this.autoAnalyses.clear();
  }

  /** 某个局面的白方视角厘兵分；优先深度结果，其次允许的自动结果 */
  evalCp(fen: string): number | undefined {
    const score = this.deepScores.get(fen) ?? this.autoScores.get(fen);
    if (!score) return undefined;
    if (score.mate !== undefined) return score.mate > 0 ? 1000 : -1000;
    return score.cp;
  }

  /** 取某个局面的完整分析（左栏推荐 / 评估条） */
  analysisFor(fen: string, includeAuto: boolean): PositionAnalysis | undefined {
    return this.deepAnalyses.get(fen) ?? (includeAuto ? this.autoAnalyses.get(fen) : undefined);
  }

  private async startPosition(fen: string, mode: AnalysisMode): Promise<void> {
    if (this.fen === fen && this.mode === mode) return;
    await this.init();
    this.fen = fen;
    this.mode = mode;
    this.turn = fen.split(' ')[1] === 'b' ? 'b' : 'w';
    this.lines.clear();
    this.currentDepth = 0;
    this.positionStart = performance.now();
    window.clearTimeout(this.timer);
    try {
      await stopSearch();
    } catch {
      // 引擎还没开始搜索时 stop 可能无响应，忽略
    }
    await sendCommand(`position fen ${fen}`);
    await this.go(START_DEPTH);
  }

  /** 引擎设置变更后调用（线程/内存即时生效） */
  async applySettings(): Promise<void> {
    if (!this.started) return;
    const settings = loadEngine();
    await sendCommand(`setoption name Threads value ${settings.threads}`);
    await sendCommand(`setoption name Hash value ${settings.hash}`);
  }

  /** 用户关掉自动分析时调用 */
  async stop(): Promise<void> {
    window.clearTimeout(this.timer);
    try {
      await stopSearch();
    } catch {
      // 忽略
    }
  }

  /** 某个局面（走完一步之后）的评分文本；没算过返回空串 */
  scoreFor(fen: string): string {
    const score = this.deepScores.get(fen) ?? this.autoScores.get(fen);
    if (!score) return '';
    return formatScore(score.cp, score.mate);
  }

  private async init(): Promise<void> {
    if (this.started) return;
    this.started = true;
    await startEngine();
    const settings = loadEngine();
    await sendCommand(`setoption name Threads value ${settings.threads}`);
    await sendCommand(`setoption name Hash value ${settings.hash}`);
    await sendCommand('setoption name MultiPV value 2');
  }

  private async go(depth: number): Promise<void> {
    this.currentDepth = depth;
    await sendCommand(`go depth ${depth}`);
  }

  private handleLine(line: string): void {
    if (line.startsWith('info ') && line.includes(' pv ')) {
      this.handleInfo(line);
      return;
    }
    if (line.startsWith('bestmove')) {
      // 局面没变且还没到最大深度：过一会儿继续加深
      if (this.currentDepth > 0 && this.currentDepth < MAX_DEPTH) {
        window.clearTimeout(this.timer);
        this.timer = window.setTimeout(() => {
          void this.go(Math.min(MAX_DEPTH, this.currentDepth + STEP));
        }, 250);
      }
    }
  }

  private handleInfo(line: string): void {
    // 最低分析时长：自动 0.2s、深度 0.5s，避免走子瞬间按旧先后手打分
    const minMs = this.mode === 'deep' ? 500 : 200;
    if (performance.now() - this.positionStart < minMs) return;
    if (line.includes('lowerbound') || line.includes('upperbound')) return;
    const parts = line.split(' ');
    const at = (key: string): string | undefined => {
      const index = parts.indexOf(key);
      return index >= 0 ? parts[index + 1] : undefined;
    };
    const depth = Number(at('depth') ?? 0);
    const multipv = Number(at('multipv') ?? 1);
    const pvIndex = parts.indexOf('pv');
    if (pvIndex < 0) return;
    const pv = parts.slice(pvIndex + 1);

    let cp: number | undefined;
    let mate: number | undefined;
    const scoreIndex = parts.indexOf('score');
    if (scoreIndex >= 0) {
      const kind = parts[scoreIndex + 1];
      const value = Number(parts[scoreIndex + 2]);
      if (kind === 'cp') cp = this.turn === 'w' ? value : -value;
      else if (kind === 'mate') mate = this.turn === 'w' ? value : -value;
    }

    this.lines.set(multipv, { multipv, depth, cp, mate, pv });

    const best = this.lines.get(1);
    if (best && this.mode === 'deep') this.deepScores.set(this.fen, { cp: best.cp, mate: best.mate });

    const now = performance.now();
    if (now - this.lastEmit < 100) return;
    this.lastEmit = now;
    this.emit();
  }

  private emit(): void {
    const sorted = [...this.lines.values()].sort((a, b) => a.multipv - b.multipv);
    const best = sorted[0];
    const snapshot: PositionAnalysis = {
      fen: this.fen,
      depth: best?.depth ?? 0,
      cp: best?.cp,
      mate: best?.mate,
      lines: sorted,
    };
    if (this.mode === 'deep') {
      this.deepAnalyses.set(this.fen, snapshot);
    } else if (this.recordAuto) {
      this.autoAnalyses.set(this.fen, snapshot);
      this.autoScores.set(this.fen, { cp: best?.cp, mate: best?.mate });
    }
    this.onUpdate(snapshot, this.mode);
  }
}
