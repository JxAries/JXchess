/**
 * 棋盘渲染组件：把局面画成 8x8 的 DOM 网格，负责格子、坐标、棋子图片与各类高亮，
 * 并把点击的格子回调出去。只做表现，不走棋规则判断。
 * 重要函数：render、setFlipped、animateMove、markSelected、markTargets、markCheck。
 */
import type { Chess, Square } from 'chess.js';
import { pieceImage, splitSquare, type SquareName } from '../game/types';

const FILES = 'abcdefgh';

export class BoardView {
  readonly root: HTMLElement;
  /** 是否上下翻转，翻转后黑方在下 */
  flip = false;
  /** 点击某个格子时触发 */
  onPick: ((sq: SquareName) => void) | null = null;

  private cells = new Map<SquareName, HTMLDivElement>();
  private imgs = new Map<SquareName, HTMLImageElement>();

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'board';
    container.appendChild(this.root);
    this.buildCells();
  }

  /** 按当前 flip 重建全部格子，需在翻转后由调用方重新绘制棋子 */
  setFlipped(flipped: boolean): void {
    if (flipped === this.flip) return;
    this.flip = flipped;
    this.cells.clear();
    this.imgs.clear();
    this.root.textContent = '';
    this.buildCells();
  }

  private buildCells(): void {
    for (let rank = 8; rank >= 1; rank--) {
      for (let f = 0; f < 8; f++) {
        const file = FILES[f];
        const sq = `${file}${rank}`;
        const cell = document.createElement('div');
        cell.className = 'sq';
        cell.dataset.square = sq;
        cell.classList.add((f + rank) % 2 === 0 ? 'dark' : 'light');

        // 坐标：白方在下时列标在 a 列、行标在第 1 行；翻转后相反
        const label = this.flip ? { file: 'h', rank: 8 } : { file: 'a', rank: 1 };
        if (file === label.file) {
          const span = document.createElement('span');
          span.className = 'coord rank';
          span.textContent = String(rank);
          cell.appendChild(span);
        }
        if (rank === label.rank) {
          const span = document.createElement('span');
          span.className = 'coord file';
          span.textContent = file;
          cell.appendChild(span);
        }

        const img = document.createElement('img');
        img.className = 'piece';
        img.alt = '';
        img.style.visibility = 'hidden';
        cell.appendChild(img);

        cell.style.gridRowStart = String(this.flip ? rank : 9 - rank);
        cell.style.gridColumnStart = String(this.flip ? 9 - f : f + 1);
        cell.addEventListener('click', () => this.onPick?.(sq));

        this.root.appendChild(cell);
        this.cells.set(sq, cell);
        this.imgs.set(sq, img);
      }
    }
  }

  /** 按 Chess 局面整体重画 */
  render(chess: Chess): void {
    for (const [sq] of this.cells) {
      const piece = chess.get(sq as Square);
      this.setSquareImg(sq, piece ? pieceImage(piece.color, piece.type) : null);
    }
  }

  /** 直接给某格设置图片，供摆盘页使用；传 null 表示空格 */
  setSquareImg(sq: SquareName, src: string | null): void {
    const img = this.imgs.get(sq);
    if (!img) return;
    if (src) {
      img.src = src;
      img.style.visibility = 'visible';
    } else {
      img.removeAttribute('src');
      img.style.visibility = 'hidden';
    }
  }

  clearAllPieces(): void {
    for (const sq of this.cells.keys()) this.setSquareImg(sq, null);
  }

  /** 清除选中、目标、末步、将军四类高亮 */
  clearMarks(): void {
    for (const cell of this.cells.values()) {
      cell.classList.remove('sel', 'target', 'target-capture', 'last', 'check');
    }
  }

  markSelected(sq: SquareName | null): void {
    for (const cell of this.cells.values()) cell.classList.remove('sel');
    if (!sq) return;
    this.cells.get(sq)?.classList.add('sel');
  }

  /** 高亮合法落点；captures 里的格子用吃子样式 */
  markTargets(targets: readonly SquareName[], captures: readonly SquareName[] = []): void {
    for (const cell of this.cells.values()) cell.classList.remove('target', 'target-capture');
    const captureSet = new Set(captures);
    for (const sq of targets) {
      const cell = this.cells.get(sq);
      if (cell) cell.classList.add(captureSet.has(sq) ? 'target-capture' : 'target');
    }
  }

  /** 高亮最近一步的起止两格 */
  markLastMove(from: SquareName | null, to: SquareName | null): void {
    for (const cell of this.cells.values()) cell.classList.remove('last');
    if (from) this.cells.get(from)?.classList.add('last');
    if (to) this.cells.get(to)?.classList.add('last');
  }

  /** 将军提醒：给被将军的王所在格加红色底 */
  markCheck(sq: SquareName | null): void {
    for (const cell of this.cells.values()) cell.classList.remove('check');
    if (sq) this.cells.get(sq)?.classList.add('check');
  }

  /**
   * 棋子平滑移动动画：局面已更新后调用，复制一枚“残影”棋子从起点滑到终点，
   * 用来盖住瞬间刷新的跳变，动画结束后自动移除。
   */
  animateMove(from: SquareName, to: SquareName, durationMs = 190): void {
    if (!from || !to || from === to) return;
    const fromCell = this.cells.get(from);
    const toCell = this.cells.get(to);
    const src = toCell?.querySelector<HTMLImageElement>('img.piece');
    if (!fromCell || !toCell || !src || src.style.visibility === 'hidden') return;

    const boardRect = this.root.getBoundingClientRect();
    const r1 = fromCell.getBoundingClientRect();
    const r2 = toCell.getBoundingClientRect();

    const ghost = document.createElement('img');
    ghost.className = 'piece ghost';
    ghost.alt = '';
    ghost.src = src.src;
    const size = r1.width;
    ghost.style.width = `${size}px`;
    ghost.style.height = `${size}px`;
    ghost.style.transform = `translate(${r1.left - boardRect.left}px, ${r1.top - boardRect.top}px)`;
    this.root.appendChild(ghost);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        ghost.style.transform = `translate(${r2.left - boardRect.left}px, ${r2.top - boardRect.top}px)`;
      });
    });
    window.setTimeout(() => ghost.remove(), durationMs + 120);
  }

  /** 某格是否摆着棋子 */
  hasPiece(sq: SquareName): boolean {
    return this.imgs.get(sq)?.style.visibility === 'visible';
  }

  /** 校验格子名是否合法 */
  static validSquare(sq: string): boolean {
    const { file, rank } = splitSquare(sq);
    return FILES.includes(file) && rank >= 1 && rank <= 8;
  }
}
