/**
 * 评估条：位于棋盘右侧，白方在上、黑方在下，零点居中；条内两行文字：
 * 第一行是局面描述（白方胜势 / 白方大优 / 白方略优 / 均势 …），第二行是分值（+1.2 / M5）。
 * 翻转棋盘时白黑两段与文字整体跟随翻转。
 * P1 阶段先提供静态“均势”，P3 接入引擎后由 setScore 驱动。
 */
export interface EvalScore {
  /** 厘兵分，白方视角 */
  cp?: number;
  /** 将杀步数，白方视角 */
  mate?: number;
}

export class EvalBar {
  readonly root: HTMLElement;
  private readonly whiteEl: HTMLElement;
  private readonly blackEl: HTMLElement;
  private readonly stateEl: HTMLElement;
  private readonly scoreEl: HTMLElement;
  private score: EvalScore = { cp: 0 };

  constructor(container: HTMLElement) {
    this.root = container;
    this.root.classList.add('evalbar');

    this.whiteEl = document.createElement('div');
    this.whiteEl.className = 'evalbar-white';
    this.blackEl = document.createElement('div');
    this.blackEl.className = 'evalbar-black';

    const text = document.createElement('div');
    text.className = 'evalbar-text';
    this.stateEl = document.createElement('span');
    this.stateEl.className = 'evalbar-state';
    this.scoreEl = document.createElement('span');
    this.scoreEl.className = 'evalbar-score';
    text.append(this.stateEl, this.scoreEl);

    this.root.append(this.whiteEl, this.blackEl, text);
    this.render();
  }

  /** 更新评估；传空对象表示“尚未分析”，按均势显示 */
  setScore(score: EvalScore): void {
    this.score = score;
    this.render();
  }

  /** 棋盘翻转时同步翻转评估条方向 */
  setFlipped(flipped: boolean): void {
    this.root.classList.toggle('flipped', flipped);
    this.render();
  }

  private render(): void {
    const pct = this.whitePercent();
    // 避免某一段完全消失，留出 1% 的可见边
    this.whiteEl.style.height = `${Math.min(99, Math.max(1, pct))}%`;
    this.stateEl.textContent = this.stateText();
    this.scoreEl.textContent = this.scoreText();
  }

  /** 白方胜率百分比（0–100） */
  private whitePercent(): number {
    if (this.score.mate !== undefined) {
      return this.score.mate > 0 ? 100 : 0;
    }
    const cp = this.score.cp ?? 0;
    const p = 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
    return Math.min(100, Math.max(0, p));
  }

  private stateText(): string {
    if (this.score.mate !== undefined) {
      return this.score.mate > 0 ? '白方胜势' : '黑方胜势';
    }
    const cp = this.score.cp ?? 0;
    const abs = Math.abs(cp);
    const lead = cp > 0 ? '白方' : '黑方';
    if (abs < 50) return '均势';
    if (abs < 150) return `${lead}略优`;
    if (abs < 400) return `${lead}大优`;
    return `${lead}胜势`;
  }

  private scoreText(): string {
    if (this.score.mate !== undefined) {
      const n = Math.abs(this.score.mate);
      return this.score.mate > 0 ? `M${n}` : `-M${n}`;
    }
    const cp = this.score.cp ?? 0;
    const pawns = cp / 100;
    if (pawns === 0) return '0.0';
    return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
  }
}
