/**
 * 前端设置：显示项与引擎参数。
 * P1 阶段只做本地存储与设置界面；引擎参数暂未接到 Rust 侧（P2 接入）。
 * 所有字段都带默认值，读取时用默认值兜底，避免旧版本存档缺字段时报错。
 */

export interface DisplaySettings {
  /** 显示棋盘右侧评估条 */
  evalBar: boolean;
  /** 显示最佳着法箭头 */
  bestArrow: boolean;
  /** 显示二/三选箭头 */
  extraArrows: boolean;
  /** 显示逐手优劣标记（棋子上） */
  annotations: boolean;
  /** 在棋谱每步右侧显示评分 */
  moveScores: boolean;
  /** 走一步自动分析一步 */
  autoAnalyze: boolean;
  /** 翻转棋盘时评估条跟随翻转 */
  evalFollowFlip: boolean;
}

export interface EngineSettings {
  /** 线程数 */
  threads: number;
  /** 置换表大小（MB） */
  hash: number;
  /** 多主变数量 */
  multipv: number;
  /** 固定深度；0 表示不按深度 */
  depth: number;
  /** 每步思考时间（毫秒）；0 表示不限 */
  movetimeMs: number;
  /** 节点上限；0 表示不限 */
  nodes: number;
}

const DISPLAY_KEY = 'jxchess.display';
const ENGINE_KEY = 'jxchess.engine';

export const DEFAULT_DISPLAY: DisplaySettings = {
  evalBar: true,
  bestArrow: true,
  extraArrows: false,
  annotations: true,
  moveScores: true,
  autoAnalyze: false,
  evalFollowFlip: true,
};

export const DEFAULT_ENGINE: EngineSettings = {
  threads: 4,
  hash: 64,
  multipv: 3,
  depth: 18,
  movetimeMs: 0,
  nodes: 0,
};

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return { ...fallback };
    const parsed = JSON.parse(raw) as Partial<T>;
    return { ...fallback, ...parsed };
  } catch {
    return { ...fallback };
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // 隐私模式或存储被禁用时忽略：设置只在本页生效
  }
}

export function loadDisplay(): DisplaySettings {
  return read(DISPLAY_KEY, DEFAULT_DISPLAY);
}

export function saveDisplay(value: DisplaySettings): void {
  write(DISPLAY_KEY, value);
}

export function loadEngine(): EngineSettings {
  return read(ENGINE_KEY, DEFAULT_ENGINE);
}

export function saveEngine(value: EngineSettings): void {
  write(ENGINE_KEY, value);
}
