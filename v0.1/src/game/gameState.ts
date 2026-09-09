/**
 * 复盘状态机：保存起点局面、主线走法列表与当前回放指针。
 * 任何展示局面都由“起点 FEN + 已走 SAN”重放得到，避免状态漂移。
 * 重要函数：loadPgn、playMove、legalMovesFrom、goTo、captured。
 */
import { Chess } from 'chess.js';
import type { PieceSymbol, Square } from 'chess.js';
import { exportPgn, parsePgn, replay } from './pgn';
import type { GameMeta } from './pgn';

const START_FEN = new Chess().fen();

export type PlayResult = { ok: true; san: string } | { ok: false; error: string };

/** 某一格子的一个合法目标点；promotion 仅对兵的升变走法存在 */
export interface TargetMove {
  to: string;
  promotion?: PieceSymbol;
  capture: boolean;
}

export class ReviewState {
  startFen = START_FEN;
  meta: GameMeta = {};
  moves: string[] = [];
  /** 当前显示到第几步，-1 表示停在开局 */
  pointer = -1;

  get atStart(): boolean {
    return this.pointer < 0;
  }

  get atEnd(): boolean {
    return this.pointer >= this.moves.length - 1;
  }

  /** 清空并开始一盘新对局 */
  newGame(): void {
    this.startFen = START_FEN;
    this.meta = {};
    this.moves = [];
    this.pointer = -1;
  }

  /** 载入一份 PGN；成功返回 null，失败返回错误提示 */
  loadPgn(text: string): string | null {
    const result = parsePgn(text);
    if (!result.ok) return result.error;
    this.startFen = result.startFen;
    this.meta = result.meta;
    this.moves = result.moves;
    this.pointer = this.moves.length - 1;
    return null;
  }

  /** 从指定 FEN 开局；成功返回 null */
  setStartFen(fen: string): string | null {
    try {
      new Chess(fen);
    } catch {
      return '局面字符串无效。';
    }
    this.startFen = fen;
    this.meta = {};
    this.moves = [];
    this.pointer = -1;
    return null;
  }

  /** 当前指针处的局面 */
  chessNow(): Chess {
    return replay(this.startFen, this.moves, this.pointer + 1);
  }

  /** 第 index 步的起止格与是否吃子，用于标亮与动画；不存在返回 null */
  moveInfoAt(index: number): { from: string; to: string; capture: boolean } | null {
    if (index < 0 || index >= this.moves.length) return null;
    const history = replay(this.startFen, this.moves, index + 1).history({ verbose: true });
    const last = history[index];
    if (!last) return null;
    return { from: last.from, to: last.to, capture: Boolean(last.captured) };
  }

  /** 最近一步的起止格与是否吃子；停在开局时为 null */
  lastMoveInfo(): { from: string; to: string; capture: boolean } | null {
    return this.moveInfoAt(this.pointer);
  }

  /** 指定颜色的王所在格；局面中无王返回 null */
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

  /** 某格棋子的全部合法目标；无子或不是行棋方时返回空数组 */
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

  /** 在当前位置续走一步，会截断指针之后原有的走法，只保留主线 */
  playMove(from: Square, to: string, promotion?: PieceSymbol): PlayResult {
    const chess = this.chessNow();
    try {
      const move = chess.move({ from, to, promotion });
      this.moves.length = this.pointer + 1;
      this.moves.push(move.san);
      this.pointer += 1;
      return { ok: true, san: move.san };
    } catch {
      return { ok: false, error: '这不是一步合法的走法。' };
    }
  }

  goTo(index: number): void {
    this.pointer = Math.max(-1, Math.min(index, this.moves.length - 1));
  }

  stepNext(): void {
    if (!this.atEnd) this.pointer += 1;
  }

  stepBack(): void {
    if (!this.atStart) this.pointer -= 1;
  }

  toStart(): void {
    this.pointer = -1;
  }

  toEnd(): void {
    this.pointer = this.moves.length - 1;
  }

  /** 双方吃到对方的子，按“被谁吃掉”分组，元素是棋子类型字母 */
  captured(): { byWhite: PieceSymbol[]; byBlack: PieceSymbol[] } {
    const byWhite: PieceSymbol[] = [];
    const byBlack: PieceSymbol[] = [];
    const history = replay(this.startFen, this.moves, this.pointer + 1).history({ verbose: true });
    for (const move of history) {
      if (!move.captured) continue;
      if (move.color === 'w') byWhite.push(move.captured);
      else byBlack.push(move.captured);
    }
    return { byWhite, byBlack };
  }

  /** 当前局面的状态文字，如将军、胜负、和棋；无特殊状态返回空串 */
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

  /** 当前对局导出为 PGN 文本 */
  toPgn(): string {
    return exportPgn(this.startFen, this.moves, this.meta);
  }
}
