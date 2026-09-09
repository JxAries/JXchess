/**
 * 通用基础类型与棋子编码工具，供各模块共用，不属于具体业务逻辑。
 * 提供颜色/兵种类型、棋子图片文件名与路径、格子解析等辅助函数。
 */

export type Color = 'w' | 'b';
export type PieceKind = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
/** 棋盘格子名，如 e4；作为字符串使用，调用 chess.js 时按需断言 */
export type SquareName = string;

export const PIECE_KINDS: PieceKind[] = ['p', 'n', 'b', 'r', 'q', 'k'];
export const PIECE_CN: Record<PieceKind, string> = { p: '兵', n: '马', b: '象', r: '车', q: '后', k: '王' };
export const FILE_NAMES = 'abcdefgh';

/** 颜色+兵种 -> 棋子图片文件名，如 wK */
export function pieceFileName(color: Color, kind: PieceKind): string {
  return color + kind.toUpperCase();
}

/** 棋子图片的相对路径，如 pieces/wK.svg */
export function pieceImage(color: Color, kind: PieceKind): string {
  return `pieces/${pieceFileName(color, kind)}.svg`;
}

/** 格子名 -> 行列，如 e4 -> file e、rank 4 */
export function splitSquare(sq: SquareName): { file: string; rank: number } {
  return { file: sq[0], rank: Number(sq[1]) };
}
