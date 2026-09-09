/**
 * PGN 棋谱的解析与导出。
 * parsePgn 校验文本并把对局拆成开局 FEN、头部信息与 SAN 走法列表；
 * exportPgn 由起点 FEN 与走法列表重建 PGN 文本；replay 用于只读回放得到某一步的局面。
 */
import { Chess } from 'chess.js';

export type GameMeta = Record<string, string>;

export type ParseResult =
  | { ok: true; meta: GameMeta; startFen: string; moves: string[] }
  | { ok: false; error: string };

/** PGN 头里用来描述起点局面的键，导出时不再重复写进 PGN */
const SETUP_KEYS = new Set(['SetUp', 'FEN']);

/** 解析一份 PGN 文本，返回头部信息、起点 FEN 与走法列表 */
export function parsePgn(text: string): ParseResult {
  const chess = new Chess();
  try {
    chess.loadPgn(text);
  } catch {
    return { ok: false, error: '无法解析这份棋谱，请确认粘贴的是有效的 PGN 文本。' };
  }
  const headers = chess.header();
  const meta: GameMeta = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!SETUP_KEYS.has(key) && value) meta[key] = value;
  }
  return { ok: true, meta, startFen: headers.FEN || new Chess().fen(), moves: chess.history() };
}

/** 由起点 FEN 与走法列表重建完整 PGN 文本 */
export function exportPgn(startFen: string, moves: readonly string[], meta: GameMeta): string {
  const chess = new Chess(startFen);
  for (const san of moves) chess.move(san);
  for (const [key, value] of Object.entries(meta)) chess.header(key, value);
  return chess.pgn();
}

/** 从起点回放前 upTo 步，返回对应局面；缺省回放全部 */
export function replay(startFen: string, moves: readonly string[], upTo = moves.length): Chess {
  const chess = new Chess(startFen);
  for (let i = 0; i < upTo; i++) chess.move(moves[i]);
  return chess;
}
