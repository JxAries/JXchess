/**
 * 复盘状态机（分支树版）：以“树”保存对局——每个节点记录一步着法与它的后续分支。
 * 导入 PGN 后主线固定，在任一节点走出不同着法即自动生成变例分支；纯手摆/新建时走新着法则覆盖其后走法。
 * 所有展示局面都由“起点 FEN + 当前路径重放”得到，避免状态漂移。
 * 重要函数：loadPgn、playMove、goMainDepth、goVariation、stepNext、variationsOfRow。
 */
import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import { exportPgn, parsePgn } from './pgn';
import type { GameMeta } from './pgn';

const START_FEN = new Chess().fen();

export interface TargetMove {
  to: string;
  promotion?: PieceSymbol;
  capture: boolean;
}

export type PlayResult =
  | { ok: true; san: string; isVariation: boolean }
  | { ok: false; error: string };

/** 棋谱面板用小字变例：tokens 为按回合排版的片段，activeStep 标示光标在链上的位置 */
export interface VariationView {
  tokens: string[];
  active: boolean;
  activeStep: number;
}

/** 一步着法及其子分支 */
interface TreeNode {
  san: string;
  from: string;
  to: string;
  capture: boolean;
  promotion?: PieceSymbol;
  parent: TreeNode | null;
  children: TreeNode[];
}

export class ReviewState {
  startFen = START_FEN;
  meta: GameMeta = {};
  /** 是否由 PGN 导入：为真时新着法作为变例，为假时覆盖其后走法 */
  imported = false;

  /** 是否已点过“新建分支”：下一步强制作为新支线 */
  private branchArmed = false;

  /** 虚拟根节点，它的 children[0] 链即主线 */
  private root: TreeNode = this.makeNode('');
  private cursor: TreeNode | null = null;

  private makeNode(san: string): TreeNode {
    return { san, from: '', to: '', capture: false, parent: null, children: [] };
  }

  /** 当前节点到根的主链（不含根），用于回放局面 */
  private pathToCursor(): TreeNode[] {
    const path: TreeNode[] = [];
    let n = this.cursor;
    while (n && n.san !== '') {
      path.unshift(n);
      n = n.parent;
    }
    return path;
  }

  /** 重放当前路径得到 Chess 实例 */
  chessNow(): Chess {
    const chess = new Chess(this.startFen);
    for (const node of this.pathToCursor()) {
      chess.move({ from: node.from, to: node.to, promotion: node.promotion });
    }
    return chess;
  }

  /** 主线节点链（沿根的第一子），不含根 */
  private mainPath(): TreeNode[] {
    const path: TreeNode[] = [];
    let n = this.root.children[0];
    while (n) {
      path.push(n);
      n = n.children[0];
    }
    return path;
  }

  mainlineLength(): number {
    return this.mainPath().length;
  }

  mainMoveSan(index: number): string | null {
    return this.mainPath()[index]?.san ?? null;
  }

  /** 当前是否在主线上；是则返回主线深度（0=开局），否则 -1 */
  mainDepth(): number {
    if (this.cursor === null) return 0;
    const main = this.mainPath();
    const idx = main.indexOf(this.cursor);
    return idx >= 0 ? idx + 1 : -1;
  }

  /** 当前所在变例的信息：所属主线格（被替代的那一步的序号）与行内序号 */
  private variationAnchor(): { row: number; index: number } | null {
    if (this.mainDepth() >= 0) return null;
    const main = this.mainPath();
    let n = this.cursor;
    while (n && n.parent) {
      const p = n.parent;
      const isMainNode = p.parent === null || main.includes(p);
      if (isMainNode) {
        const holder = p.parent === null ? this.root : p;
        const idx = holder.children.indexOf(n);
        if (idx > 0) {
          const row = p.parent === null ? 0 : main.indexOf(p) + 1;
          return { row, index: idx - 1 };
        }
        return null;
      }
      n = p;
    }
    return null;
  }

  /** 摆到第 depth 步之后的主线位置 */
  goMainDepth(depth: number): void {
    const main = this.mainPath();
    this.cursor = depth <= 0 ? null : (main[depth - 1] ?? null);
  }

  /** 进入某条变例：depth 是“被替代主线步”所在行（同 goMainDepth 口径），
   * index 是该位置第几条变例；默认跳到该变例最深处。 */
  goVariation(depth: number, index: number): void {
    const main = this.mainPath();
    const holder = depth <= 0 ? this.root : main[depth - 1];
    if (!holder) return;
    const extra = holder.children.filter((_, i) => i > 0)[index];
    if (!extra) return;
    let node = extra;
    while (node.children[0]) node = node.children[0];
    this.cursor = node;
  }

  /** 在某行位置下的第 index 条变例的分支起点节点 */
  private variationStart(row: number, index: number): TreeNode | null {
    const main = this.mainPath();
    const holder = row <= 0 ? this.root : main[row - 1];
    if (!holder) return null;
    return holder.children.filter((_, i) => i > 0)[index] ?? null;
  }

  /** 光标位于以 start 为首节点的变例链上的第几步（0 起）；不在该链上返回 -1 */
  private stepWithin(start: TreeNode, cursor: TreeNode | null): number {
    let node: TreeNode | null = start;
    let step = 0;
    while (node) {
      if (node === cursor) return step;
      node = node.children[0];
      step += 1;
    }
    return -1;
  }

  /**
   * 某主线行下已有的变例，每项包含按“回合数 + 着法”排版后的文本片段。
   * 白方开始的变例写成 1.e6 f5 这样的形式；黑方开始的写成 1.… e5 形式。
   */
  variationsOfRow(row: number): VariationView[] {
    const main = this.mainPath();
    const holder = row <= 0 ? this.root : main[row - 1];
    if (!holder) return [];
    const anchor = this.variationAnchor();

    // 该行位置的局面，用于计算回合数与行棋方
    const base = new Chess(this.startFen);
    for (let i = 0; i < row; i++) {
      const step = main[i];
      base.move({ from: step.from, to: step.to, promotion: step.promotion });
    }

    const views: VariationView[] = [];
    holder.children.forEach((child, i) => {
      if (i === 0) return;
      const lineChess = new Chess(base.fen());
      const tokens: string[] = [];
      let node: TreeNode | null = child;
      let first = true;
      while (node) {
        tokens.push(formatToken(lineChess, node.san, first));
        lineChess.move({ from: node.from, to: node.to, promotion: node.promotion });
        first = false;
        node = node.children[0];
      }
      const index = views.length;
      const isActive = Boolean(anchor && anchor.row === row && anchor.index === index);
      const start = child;
      views.push({
        tokens,
        active: isActive,
        activeStep: isActive ? this.stepWithin(start, this.cursor) : -1,
      });
    });
    return views;
  }

  /** 在当前位置预设“新建支线”：下一步着法即使与现有着法相同也会新建一条变例 */
  armNewBranch(): void {
    this.branchArmed = true;
  }

  /** 删除当前所在的支线；不在支线内返回 false */
  deleteCurrentVariation(): boolean {
    const anchor = this.variationAnchor();
    if (!anchor) return false;
    const start = this.variationStart(anchor.row, anchor.index);
    if (!start) return false;
    const parent = start.parent;
    if (!parent) return false;
    parent.children = parent.children.filter((c) => c !== start);
    this.cursor = parent === this.root ? null : parent;
    return true;
  }

  /** 最近一步的起止格与是否吃子，用于动画与标亮 */
  lastMoveInfo(): { from: string; to: string; capture: boolean } | null {
    if (!this.cursor) return null;
    return { from: this.cursor.from, to: this.cursor.to, capture: this.cursor.capture };
  }

  /** 指定颜色王的所在格 */
  kingSquare(color: 'w' | 'b'): string | null {
    const chess = this.chessNow();
    for (const file of 'abcdefgh') {
      for (let rank = 1; rank <= 8; rank++) {
        const sq = `${file}${rank}`;
        const piece = chess.get(sq as Square);
        if (piece && piece.color === color && piece.type === 'k') return sq;
      }
    }
    return null;
  }

  /** 某格棋子的合法目标点 */
  legalMovesFrom(from: Square): TargetMove[] {
    const chess = this.chessNow();
    try {
      return chess.moves({ square: from, verbose: true }).map((m) => ({
        to: m.to,
        promotion: m.promotion,
        capture: Boolean(m.captured),
      }));
    } catch {
      return [];
    }
  }

  /**
   * 走一步棋。若该着法在当前节点已存在则直接跳入；
   * 导入棋谱模式下走出新着法会作为变例记录，未导入时则截断覆盖其后走法；
   * 点过“新建分支”后，下一步无论是否与现有着法相同都会新建支线。
   */
  playMove(from: Square, to: string, promotion?: PieceSymbol): PlayResult {
    const chess = this.chessNow();
    let move;
    try {
      move = chess.move({ from, to, promotion });
    } catch {
      return { ok: false, error: '这不是一步合法的走法。' };
    }
    const armed = this.branchArmed;
    const holder = this.cursor ? this.cursor.children : this.root.children;
    const same = armed
      ? undefined
      : holder.find(
          (c) =>
            c.from === from &&
            c.to === to &&
            (c.promotion ?? '') === (promotion ?? ''),
        );
    if (same) {
      this.cursor = same;
      return { ok: true, san: same.san, isVariation: false };
    }

    const node: TreeNode = {
      san: move.san,
      from,
      to,
      capture: Boolean(move.captured),
      promotion,
      parent: this.cursor ?? this.root,
      children: [],
    };
    const branched = (this.imported || armed) && holder.length > 0;
    if (branched) {
      holder.push(node); // 保留已有走法，新增一条变例
    } else {
      holder.length = 0; // 覆盖旧分支，作为新的主线延伸
      holder.push(node);
    }
    this.branchArmed = false;
    this.cursor = node;
    return { ok: true, san: move.san, isVariation: branched };
  }

  stepNext(): void {
    if (this.cursor && this.cursor.children[0]) {
      this.cursor = this.cursor.children[0];
      return;
    }
    // 在主线或开局时：沿主线前进
    if (!this.cursor) {
      this.cursor = this.root.children[0] ?? null;
      return;
    }
  }

  stepBack(): void {
    if (this.cursor) this.cursor = this.cursor.parent;
  }

  toStart(): void {
    this.cursor = null;
  }

  toEnd(): void {
    if (this.cursor === null || this.mainDepth() >= 0) {
      this.goMainDepth(this.mainlineLength());
    } else {
      let n = this.cursor;
      while (n.children[0]) n = n.children[0];
      this.cursor = n;
    }
  }

  atStart(): boolean {
    return this.cursor === null;
  }

  /** 前进按钮是否有路可走 */
  canNext(): boolean {
    if (this.cursor) return Boolean(this.cursor.children[0]);
    return Boolean(this.root.children[0]);
  }

  /** 清空并开始新对局 */
  newGame(): void {
    this.startFen = START_FEN;
    this.meta = {};
    this.imported = false;
    this.branchArmed = false;
    this.root = this.makeNode('');
    this.cursor = null;
  }

  /** 载入 PGN 并生成主线；成功返回 null */
  loadPgn(text: string): string | null {
    const result = parsePgn(text);
    if (!result.ok) return result.error;
    this.startFen = result.startFen;
    this.meta = result.meta;
    this.imported = true;
    this.branchArmed = false;
    this.root = this.makeNode('');
    this.cursor = null;
    const chess = new Chess(this.startFen);
    for (const san of result.moves) {
      const move = chess.move(san);
      const node: TreeNode = {
        san: move.san,
        from: move.from,
        to: move.to,
        capture: Boolean(move.captured),
        promotion: move.promotion,
        parent: this.cursor ?? this.root,
        children: [],
      };
      const holder = this.cursor ? this.cursor.children : this.root.children;
      holder.push(node);
      this.cursor = node;
    }
    return null;
  }

  /** 从指定 FEN 开局（无主线） */
  setStartFen(fen: string): string | null {
    try {
      new Chess(fen);
    } catch {
      return '局面字符串无效。';
    }
    this.startFen = fen;
    this.meta = {};
    this.imported = false;
    this.branchArmed = false;
    this.root = this.makeNode('');
    this.cursor = null;
    return null;
  }

  /** 双方吃到对方的子，按“被谁吃掉”分组 */
  captured(): { byWhite: PieceSymbol[]; byBlack: PieceSymbol[] } {
    const byWhite: PieceSymbol[] = [];
    const byBlack: PieceSymbol[] = [];
    const history = this.chessNow().history({ verbose: true });
    for (const move of history) {
      if (!move.captured) continue;
      if (move.color === 'w') byWhite.push(move.captured);
      else byBlack.push(move.captured);
    }
    return { byWhite, byBlack };
  }

  /** 当前局面状态文字，如将军、胜负、和棋 */
  statusText(): string {
    const chess = this.chessNow();
    if (chess.isCheckmate()) return chess.turn() === 'w' ? '黑方胜' : '白方胜';
    if (chess.isStalemate()) return '逼和';
    if (chess.isInsufficientMaterial()) return '子力不足，判和';
    if (chess.isThreefoldRepetition()) return '三次重复，判和';
    if (chess.isDraw()) return '和棋';
    if (chess.inCheck()) return '将军';
    return '';
  }

  /** 导出 PGN：保留主线（支线因 PGN 文本结构复杂暂不导出） */
  toPgn(): string {
    const sans = this.mainPath().map((n) => n.san);
    return exportPgn(this.startFen, sans, this.meta);
  }
}

/** 把一个着法片段排版成 1.e4 / 1.… e5 / 后续着法 的文本形式 */
function formatToken(chess: Chess, san: string, first: boolean): string {
  const turn = chess.turn();
  const num = chess.moveNumber();
  if (turn === 'w') return `${num}.${san}`;
  return first ? `${num}.… ${san}` : san;
}
