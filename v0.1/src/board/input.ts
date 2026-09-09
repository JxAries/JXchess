/**
 * 复盘页棋盘交互控制器：把棋盘点击翻译成走棋动作。
 * 点击己方棋子选中并亮出合法落点，点击落点走棋，兵升变时弹出选择；点击他处切换或取消选择。
 */
import type { PieceSymbol, Square } from 'chess.js';
import type { SquareName } from '../game/types';
import type { ReviewState, TargetMove } from '../game/gameState';
import type { BoardView } from './boardView';
import { askPromotion } from '../panels/promotion';

export interface MovePlayed {
  from: string;
  to: string;
  capture: boolean;
}

export interface ReviewHooks {
  /** 成功走子后触发，move 带刚走的一步供动画与音效使用 */
  onChanged(move: MovePlayed): void;
  /** 提示一条给用户看的信息 */
  onMessage(message: string): void;
}

export class BoardInput {
  private selected: SquareName | null = null;
  private targets: TargetMove[] = [];

  constructor(
    private board: BoardView,
    private state: ReviewState,
    private hooks: ReviewHooks,
  ) {
    board.onPick = (sq) => void this.handlePick(sq);
  }

  /** 清空选中与落点高亮 */
  clearSelection(): void {
    this.selected = null;
    this.targets = [];
    this.board.clearMarks();
  }

  private async handlePick(sq: SquareName): Promise<void> {
    const chess = this.state.chessNow();

    if (this.selected === null) {
      const piece = chess.get(sq as Square);
      if (piece && piece.color === chess.turn()) {
        this.select(sq);
      } else {
        this.board.clearMarks();
      }
      return;
    }

    if (sq === this.selected) {
      this.clearSelection();
      return;
    }

    const hit = this.targets.find((t) => t.to === sq);
    if (hit) {
      if (hit.promotion) {
        const kind = await askPromotion(chess.turn());
        if (!kind) {
          this.clearSelection();
          return;
        }
        this.commit(this.selected, sq, kind);
      } else {
        this.commit(this.selected, sq);
      }
      return;
    }

    // 点到另一枚己方棋子则换选，否则取消选中
    const piece = chess.get(sq as Square);
    if (piece && piece.color === chess.turn()) this.select(sq);
    else this.clearSelection();
  }

  private select(sq: SquareName): void {
    this.selected = sq;
    this.targets = this.state.legalMovesFrom(sq as Square);
    this.board.clearMarks();
    this.board.markSelected(sq);
    this.board.markTargets(
      this.targets.map((t) => t.to),
      this.targets.filter((t) => t.capture).map((t) => t.to),
    );
  }

  private commit(from: SquareName, to: string, promotion?: PieceSymbol): void {
    const hit = this.targets.find((t) => t.to === to);
    const result = this.state.playMove(from as Square, to, promotion);
    const capture = Boolean(hit?.capture);
    this.clearSelection();
    if (result.ok) this.hooks.onChanged({ from, to, capture });
    else this.hooks.onMessage(result.error);
  }
}
