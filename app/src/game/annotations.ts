/**
 * 逐手优劣标注：根据“这一步让白方视角的评分损失了多少”分类。
 * 阈值集中在 classifyCpLoss 里，不进 README，方便之后整体调松紧。
 * 妙手（!!）先按“最佳着 + 明显弃子”的启发式判定，属于近似结果。
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

export function classifyCpLoss(cpLoss: number): AnnotationKind {
  if (cpLoss <= 5) return 'best';
  if (cpLoss <= 20) return 'good';
  if (cpLoss <= 50) return 'normal';
  if (cpLoss <= 100) return 'inaccuracy';
  if (cpLoss <= 250) return 'mistake';
  return 'blunder';
}

/** 准确度：由平均厘兵损失映射到 0–100（内部口径，不进 README） */
export function accuracyFromAcpl(acpl: number): number {
  const value = 100 * Math.exp(-Math.max(0, acpl) / 350);
  return Math.max(0, Math.min(100, Math.round(value)));
}
