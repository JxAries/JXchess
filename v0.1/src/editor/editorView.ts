/**
 * 摆盘编辑器：维护自由摆放的局面数据并负责棋盘渲染与基本编辑操作。
 * 只处理“哪个格子放哪个棋子”，页面负责选择/擦除/放置等交互策略。
 * 重要函数：apply、movePiece、getAt、loadFen、boardPlacement、missingKings、setFlipped。
 */
import { Chess } from 'chess.js';
import { pieceImage, type Color, type PieceKind, type SquareName } from '../game/types';
import { BoardView } from '../board/boardView';

export type Tool = { mode: 'place'; color: Color; kind: PieceKind } | { mode: 'erase' };

interface Placed {
  color: Color;
  kind: PieceKind;
}

const FILES = 'abcdefgh';

export class BoardEditor {
  /** 每次局面内容变化后回调，供页面刷新提示 */
  onChange: () => void;

  private board: BoardView;
  private pieces = new Map<SquareName, Placed>();

  constructor(container: HTMLElement, onChange: () => void) {
    this.onChange = onChange;
    this.board = new BoardView(container);
  }

  /** 绑定棋盘点击；页面把当前工具与选择逻辑在此接入 */
  bindPick(handler: (sq: SquareName) => void): void {
    this.board.onPick = handler;
  }

  /** 执行放置或擦除 */
  apply(sq: SquareName, tool: Tool): void {
    if (tool.mode === 'erase') {
      this.pieces.delete(sq);
      this.board.setSquareImg(sq, null);
    } else {
      this.setPiece(sq, { color: tool.color, kind: tool.kind });
    }
    this.onChange();
  }

  /** 把 from 格的棋子移动到 to 格，覆盖目标原有棋子；from 无子返回 false */
  movePiece(from: SquareName, to: SquareName): boolean {
    const piece = this.pieces.get(from);
    if (!piece || from === to) return false;
    this.pieces.delete(from);
    this.board.setSquareImg(from, null);
    this.setPiece(to, piece);
    this.onChange();
    return true;
  }

  /** 查询某格棋子 */
  getAt(sq: SquareName): { color: Color; kind: PieceKind } | null {
    return this.pieces.get(sq) ?? null;
  }

  /** 高亮某格，供“选择”模式提示当前拿起的棋子 */
  highlight(sq: SquareName | null): void {
    this.board.markSelected(sq);
  }

  /** 翻转棋盘并重画 */
  setFlipped(flipped: boolean): void {
    this.board.setFlipped(flipped);
    this.redraw();
  }

  /** 摆成标准初始局面 */
  setClassic(): void {
    this.pieces.clear();
    const back: PieceKind[] = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
    for (let f = 0; f < 8; f++) {
      this.setPiece(`${FILES[f]}2`, { color: 'w', kind: 'p' });
      this.setPiece(`${FILES[f]}7`, { color: 'b', kind: 'p' });
      this.setPiece(`${FILES[f]}1`, { color: 'w', kind: back[f] });
      this.setPiece(`${FILES[f]}8`, { color: 'b', kind: back[f] });
    }
    this.redraw();
  }

  /** 清空棋盘 */
  clearBoard(): void {
    this.pieces.clear();
    this.redraw();
  }

  /** 用 FEN 载入局面；成功返回 null，失败返回错误信息 */
  loadFen(fen: string): string | null {
    let chess: Chess;
    try {
      chess = new Chess(fen);
    } catch {
      return 'FEN 无效，请检查后重试。';
    }
    this.pieces.clear();
    const rows = chess.board(); // 第一行对应第 8 横排
    for (let r = 0; r < 8; r++) {
      for (let f = 0; f < 8; f++) {
        const piece = rows[r][f];
        if (piece) this.setPiece(`${FILES[f]}${8 - r}`, { color: piece.color, kind: piece.type });
      }
    }
    this.redraw();
    return null;
  }

  /** 只导出棋子的摆放部分，例如 rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR */
  boardPlacement(): string {
    let out = '';
    for (let rank = 8; rank >= 1; rank--) {
      let empty = 0;
      for (let f = 0; f < 8; f++) {
        const piece = this.pieces.get(`${FILES[f]}${rank}`);
        if (!piece) {
          empty++;
          continue;
        }
        if (empty > 0) {
          out += String(empty);
          empty = 0;
        }
        out += piece.color === 'w' ? piece.kind.toUpperCase() : piece.kind;
      }
      if (empty > 0) out += String(empty);
      if (rank > 1) out += '/';
    }
    return out;
  }

  /** 检查双方是否各有一个王，返回缺王的颜色列表 */
  missingKings(): Color[] {
    const missing: Color[] = [];
    for (const color of ['w', 'b'] as Color[]) {
      let has = false;
      for (const piece of this.pieces.values()) {
        if (piece.color === color && piece.kind === 'k') has = true;
      }
      if (!has) missing.push(color);
    }
    return missing;
  }

  private setPiece(sq: SquareName, piece: Placed): void {
    this.pieces.set(sq, piece);
    this.board.setSquareImg(sq, pieceImage(piece.color, piece.kind));
  }

  private redraw(): void {
    this.board.clearAllPieces();
    for (const [sq, piece] of this.pieces) {
      this.board.setSquareImg(sq, pieceImage(piece.color, piece.kind));
    }
    this.onChange();
  }
}
