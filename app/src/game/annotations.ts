/**
 * 逐手优劣标注：用“胜率损失”而不是原始厘兵分分级，避免大优/大劣时问叹号过滥；
 * 妙手（!!）用“最佳着附近 + 明显弃子”的启发式判定，属于近似结果。
 * 阈值集中在 classifyMove，方便之后整体调松紧。
 */
export type AnnotationKind =
  | 'brilliant'
  | 'best'
  | 'good'
  | 'normal'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder';

export const ANNOTATION_SYMBOL: Record<AnnotationKind, string> = {
  brilliant: '!!',
  best: '★',
  good: '!',
  normal: '·',
  inaccuracy: '?!',
  mistake: '?',
  blunder: '??',
};

/** 白方视角厘兵分损失（同一方视角，钳制到 0–1000） */
export function computeCpLoss(beforeCp: number, afterCp: number, side: 'w' | 'b'): number {
  const raw = side === 'w' ? beforeCp - afterCp : afterCp - beforeCp;
  return Math.max(0, Math.min(1000, raw));
}

/** 把厘兵分换算成胜率（0–1），用于判断这一步对胜负的实际影响 */
function winProbability(cp: number): number {
  const clamped = Math.max(-1200, Math.min(1200, cp));
  return 1 / (1 + Math.exp(-0.00368208 * clamped));
}

export interface MoveContext {
  /** 这一步是否净损失至少约 2 分材料（弃子启发式） */
  sacrifice?: boolean;
}

/**
 * 分类口径（第一版）：
 * - !!：明显弃子，且评分损失很小（不是送子）；
 * - ★：评分损失 ≤10；
 * - !：≤30；
 * - ·：胜率损失 <3.5%；
 * - ?!：<7.5%；
 * - ?：<15%；
 * - ??：≥15%。
 * 大优时丢掉 1 分可能胜率只掉几个点，不会再轻易给“?”。
 */
export function classifyMove(
  beforeCp: number,
  afterCp: number,
  side: 'w' | 'b',
  context: MoveContext = {},
): AnnotationKind {
  const loss = computeCpLoss(beforeCp, afterCp, side);
  const before = side === 'w' ? beforeCp : -beforeCp;
  const after = side === 'w' ? afterCp : -afterCp;
  const swing = Math.max(0, (winProbability(before) - winProbability(after)) * 100);

  if (context.sacrifice && loss <= 35 && swing <= 6) return 'brilliant';
  if (loss <= 10) return 'best';
  if (loss <= 30) return 'good';
  if (swing < 3.5) return 'normal';
  if (swing < 7.5) return 'inaccuracy';
  if (swing < 15) return 'mistake';
  return 'blunder';
}

/** 兼容旧调用：只按厘兵分损失分类 */
export function classifyCpLoss(cpLoss: number): AnnotationKind {
  if (cpLoss <= 10) return 'best';
  if (cpLoss <= 30) return 'good';
  if (cpLoss <= 100) return 'normal';
  if (cpLoss <= 180) return 'inaccuracy';
  if (cpLoss <= 350) return 'mistake';
  return 'blunder';
}

const PIECE_VALUE: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

/** 从 FEN 计算某一方的材料分（不含王） */
export function materialForSide(fen: string, side: 'w' | 'b'): number {
  const board = fen.split(' ')[0] ?? '';
  let total = 0;
  for (const ch of board) {
    const lower = ch.toLowerCase();
    const value = PIECE_VALUE[lower];
    if (value === undefined) continue;
    const isWhite = ch === ch.toUpperCase();
    if ((side === 'w' && isWhite) || (side === 'b' && !isWhite)) total += value;
  }
  return total;
}

/** 走子后净材料下降 ≥1.5 分，视为弃子（可能包含交换，先做近似） */
export function isSacrificeFen(beforeFen: string, afterFen: string, side: 'w' | 'b'): boolean {
  return materialForSide(afterFen, side) <= materialForSide(beforeFen, side) - 1.5;
}

/** 准确度：由平均厘兵损失映射到 0–100（内部口径，不进 README） */
export function accuracyFromAcpl(acpl: number): number {
  const value = 100 * Math.exp(-Math.max(0, acpl) / 350);
  return Math.max(0, Math.min(100, Math.round(value)));
}
