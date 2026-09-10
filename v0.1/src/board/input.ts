/**
 * 复盘页棋盘交互控制器：把点击与拖拽翻译成走棋动作。
 * 点击己方棋子选中并亮出合法落点，点击落点走棋；拖拽棋子到目标格同样走棋；
 * 兵升变时弹出选择框。点其它地方切换或取消选择。
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
    board.setDragHandlers({
      canStart: (sq) => {
        const piece = this.state.chessNow().get(sq as Square);
        return Boolean(piece && piece.color === this.state.chessNow().turn());
      },
      onDrop: (from, to) => void this.tryMove(from, to),
    });
  }

  /** 清空选中与落点高亮（将军红底保留） */
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
      await this.runMove(this.selected, sq, hit);
      return;
    }

    // 点到另一枚己方棋子则换选，否则取消
    const piece = chess.get(sq as Square);
    if (piece && piece.color === chess.turn()) this.select(sq);
    else this.clearSelection();
  }

  /** 拖拽落点：按合法目标处理 */
  private async tryMove(from: SquareName, to: SquareName): Promise<void> {
    const targets = this.state.legalMovesFrom(from as Square);
    const hit = targets.find((t) => t.to === to);
    this.board.clearMarks();
    if (hit) await this.runMove(from, to, hit);
  }

  /** 统一执行一步：升变时先询问兵种 */
  private async runMove(from: SquareName, to: SquareName, hit: TargetMove): Promise<void> {
    let promotion: PieceSymbol | undefined;
    if (hit.promotion) {
      promotion = (await askPromotion(this.state.chessNow().turn())) ?? undefined;
      if (!promotion) return;
    }
    const result = this.state.playMove(from as Square, to, promotion);
    this.clearSelection();
    if (result.ok) this.hooks.onChanged({ from, to, capture: hit.capture });
    else this.hooks.onMessage(result.error);
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
}
