/**
 * 棋盘渲染组件：把局面画成 8x8 的 DOM 网格，负责格子、坐标、棋子图片、各类高亮与拖拽事件，
 * 并把点击/拖拽的格子回调出去。只做表现，不走棋规则判断。
 * 重要函数：render、setFlipped、animateMove、setDragHandlers、markCheck。
 */
import type { Chess, Square } from 'chess.js';
import { pieceImage, type SquareName } from '../game/types';

const FILES = 'abcdefgh';

export interface DragHandlers {
  /** 是否允许从该格开始拖拽 */
  canStart(sq: SquareName): boolean;
  /** 拖到目标格时回调 */
  onDrop(from: SquareName, to: SquareName): void;
  /** 进入拖拽时回调，供页面亮出该子的全部合法落点 */
  onDragStart?(from: SquareName): void;
  /** 拖拽结束（无论是否成功落子）时回调，供页面恢复常规高亮 */
  onDragEnd?(): void;
}

export class BoardView {
  readonly root: HTMLElement;
  /** 是否上下翻转，翻转后黑方在下 */
  flip = false;
  /** 点击某个格子时触发 */
  onPick: ((sq: SquareName) => void) | null = null;

  private cells = new Map<SquareName, HTMLDivElement>();
  private imgs = new Map<SquareName, HTMLImageElement>();
  private drag: DragHandlers | null = null;
  private dragFrom: string | null = null;
  private dragGhost: HTMLImageElement | null = null;
  private pending: { sq: string; x: number; y: number; id: number } | null = null;

  constructor(container: HTMLElement) {
    this.root = document.createElement('div');
    this.root.className = 'board';
    container.appendChild(this.root);
    this.buildCells();
    this.wireDrag();
  }

  /** 按当前 flip 重建全部格子，调用方随后需重画棋子 */
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

        // 坐标标注放在视觉最外侧一行/一列：白方在下时在 a 列与第 1 行，翻转后在 h 列与第 8 行
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
        img.draggable = false;
        img.style.visibility = 'hidden';
        cell.appendChild(img);

        // 将军红光层：单独一层且层级低于棋子，避免红光盖住王。
        // 深色格的排线占了 ::before，所以这里用独立元素而不是伪元素。
        const glow = document.createElement('span');
        glow.className = 'glow';
        cell.appendChild(glow);

        // 状态高亮层：选中与落点提示。同样独立一层，层级高于排线。
        const overlay = document.createElement('span');
        overlay.className = 'hl';
        cell.appendChild(overlay);

        cell.style.gridRowStart = String(this.flip ? rank : 9 - rank);
        cell.style.gridColumnStart = String(this.flip ? 8 - f : f + 1);
        // 点击与拖拽统一由 wireDrag 的指针事件处理，这里不再挂 click：
        // 旧版同时挂 click 和指针事件，两条通路互相抑制，导致要点两次才能走子。
        this.root.appendChild(cell);
        this.cells.set(sq, cell);
        this.imgs.set(sq, img);
      }
    }
  }

  /** 登记拖拽处理器；事件委托挂在棋盘根上，翻转重建格子后依然有效 */
  setDragHandlers(handlers: DragHandlers | null): void {
    this.drag = handlers;
  }

  /**
   * 拖拽走子：使用指针事件自行实现，完全不依赖浏览器原生拖图，
   * 因此既不会触发浏览器的拖动搜索，也不会因原生拖拽导致页面卡死。
   * 按下后移动超过阈值才进入拖拽，轻点仍然是选中。
   */
  private wireDrag(): void {
    const squareAt = (x: number, y: number): string | null => {
      const el = document.elementFromPoint(x, y) as HTMLElement | null;
      return el?.closest<HTMLElement>('.sq')?.dataset.square ?? null;
    };

    /**
     * 按下：记下起点与坐标。这里不做任何判定，先捕获指针，
     * 后续是「点」还是「拖」由 pointermove 的距离阈值决定。
     */
    this.root.addEventListener('pointerdown', (e) => {
      if (e.button !== 0 || !this.drag) return;
      const cell = (e.target as HTMLElement).closest<HTMLElement>('.sq');
      const sq = cell?.dataset.square;
      if (!sq) return;
      this.pending = { sq, x: e.clientX, y: e.clientY, id: e.pointerId };
      this.root.setPointerCapture(e.pointerId);
    });

    this.root.addEventListener('pointermove', (e) => {
      const pending = this.pending;
      if (!pending) return;
      if (!this.dragFrom) {
        // 只有超过阈值且该格允许起拖时才进入拖拽；否则仍算点击
        if (Math.hypot(e.clientX - pending.x, e.clientY - pending.y) < 5) return;
        if (!this.drag?.canStart(pending.sq)) return;
        if (!this.beginDrag(pending.sq, e.clientX, e.clientY)) return;
        // 通知页面亮出这个子的全部合法落点，方便拖拽时对准
        this.drag?.onDragStart?.(pending.sq);
      }
      if (!this.dragGhost) return;
      const rect = this.dragGhost.getBoundingClientRect();
      this.dragGhost.style.left = `${e.clientX - rect.width / 2}px`;
      this.dragGhost.style.top = `${e.clientY - rect.height / 2}px`;
      this.markDropTarget(squareAt(e.clientX, e.clientY));
    });

    /**
     * 抬起：唯一的走子/选中出口。
     * 未进入拖拽 → 按点击处理，通知 onPick 所在格（选中、走子、取消都在页面侧判断）；
     * 已进入拖拽 → 落点合法则 onDrop。
     * 因为点击也走这条通路，不再需要「抑制原生 click」，也就不会吃掉下一次点击。
     */
    const finish = (e: PointerEvent): void => {
      const pending = this.pending;
      const from = this.dragFrom;
      this.pending = null;
      if (!from) {
        if (pending) this.onPick?.(pending.sq);
        return;
      }
      const to = squareAt(e.clientX, e.clientY);
      this.cleanupDrag();
      if (to && to !== from) this.drag?.onDrop(from, to);
      else this.drag?.onDragEnd?.();
    };
    this.root.addEventListener('pointerup', finish);
    this.root.addEventListener('pointercancel', () => {
      const wasDragging = this.dragFrom !== null;
      this.pending = null;
      this.cleanupDrag();
      if (wasDragging) this.drag?.onDragEnd?.();
    });
  }

  /** 开始拖拽；起点无子或不可见时返回 false */
  private beginDrag(sq: string, x: number, y: number): boolean {
    const img = this.imgs.get(sq);
    if (!img || img.style.visibility === 'hidden') return false;
    this.dragFrom = sq;
    const rect = img.getBoundingClientRect();
    const ghost = img.cloneNode(true) as HTMLImageElement;
    ghost.className = 'piece drag-ghost';
    ghost.style.width = `${rect.width}px`;
    ghost.style.height = `${rect.height}px`;
    ghost.style.left = `${x - rect.width / 2}px`;
    ghost.style.top = `${y - rect.height / 2}px`;
    document.body.appendChild(ghost);
    this.dragGhost = ghost;
    img.style.opacity = '0.35';
    return true;
  }

  private markDropTarget(sq: string | null): void {
    for (const cell of this.cells.values()) cell.classList.remove('drop');
    if (sq) this.cells.get(sq)?.classList.add('drop');
  }

  private cleanupDrag(): void {
    const from = this.dragFrom;
    if (from) {
      const img = this.imgs.get(from);
      if (img) img.style.opacity = '';
    }
    this.dragGhost?.remove();
    this.dragGhost = null;
    this.dragFrom = null;
    for (const cell of this.cells.values()) cell.classList.remove('drop');
  }

  /** 按 Chess 局面整体重画 */
  render(chess: Chess): void {
    for (const [sq] of this.cells) {
      const piece = chess.get(sq as Square);
      this.setSquareImg(sq, piece ? pieceImage(piece.color, piece.type) : null);
    }
  }

  /** 直接给某格设置图片，供摆棋页使用；传 null 表示空格 */
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

  /** 清除选中与目标类高亮（不含将军底与末步标，末步由刷新逻辑管理） */
  clearMarks(): void {
    for (const cell of this.cells.values()) {
      cell.classList.remove('sel', 'target', 'target-capture');
    }
  }

  /** 清除将军红底 */
  clearChecks(): void {
    for (const cell of this.cells.values()) cell.classList.remove('check');
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
    this.clearChecks();
    if (sq) this.cells.get(sq)?.classList.add('check');
  }

  /**
   * 平滑移动动画：局面已更新后调用，复制一枚“残影”棋子从起点滑到终点，
   * 盖住瞬间刷新的跳变，动画结束后自动移除。
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
}
