/**
 * 棋谱面板：主线每步一行、分支也每步一行。
 * 主线行间用横线分隔；分支整体缩进、字号更小，同层不同分支用左侧色条区分，
 * 分支的第一步加粗显示。每行右侧预留评分位（引擎接入后填分值）。
 * 当前着法高亮，并随导航自动滚动到可见区域。
 */
import type { ReviewState } from '../game/gameState';

export interface MoveCallbacks {
  /** 跳到主线第 depth 步之后的位置，depth=0 表示开局 */
  goToDepth(depth: number): void;
  /** 跳到第 row 行变例（第 index 条）的第 step 步 */
  goVariationStep(row: number, index: number, step: number): void;
}

export function renderMoveList(el: HTMLElement, state: ReviewState, cb: MoveCallbacks): void {
  el.textContent = '';
  const total = state.mainlineLength();
  const curDepth = state.mainDepth();
  const list = document.createElement('div');
  list.className = 'ply-list';

  /** 生成一行：序号 + 着法 + 评分占位 */
  const buildRow = (
    san: string,
    moveNumber: number,
    side: 'w' | 'b',
  ): { row: HTMLElement; btn: HTMLButtonElement } => {
    const row = document.createElement('div');
    row.className = 'ply-row';
    const num = document.createElement('span');
    num.className = 'ply-num';
    num.textContent = side === 'w' ? `${moveNumber}.` : `${moveNumber}…`;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ply-san';
    btn.textContent = san;
    const score = document.createElement('span');
    score.className = 'ply-score';
    row.append(num, btn, score);
    return { row, btn };
  };

  /** 渲染第 row 行位置上的所有变例（每个变例逐行展开，整体缩进一级） */
  const addVariations = (row: number): void => {
    for (const line of state.variationLines(row)) {
      line.moves.forEach((move) => {
        const { row: rowEl, btn } = buildRow(move.san, move.moveNumber, move.side);
        rowEl.classList.add('var', `var-hue-${line.index % 4}`);
        if (move.step === 0) rowEl.classList.add('var-first');
        if (line.active && move.step === line.activeStep) rowEl.classList.add('cur');
        btn.addEventListener('click', () => cb.goVariationStep(row, line.index, move.step));
        list.appendChild(rowEl);
      });
    }
  };

  // 第一步之前的变例
  addVariations(0);

  for (let i = 0; i < total; i++) {
    const depth = i + 1;
    const { row, btn } = buildRow(state.mainMoveSan(i) ?? '', Math.floor(i / 2) + 1, i % 2 === 0 ? 'w' : 'b');
    row.classList.add('ply-main');
    if (curDepth === depth) row.classList.add('cur');
    btn.addEventListener('click', () => cb.goToDepth(depth));
    list.appendChild(row);

    // 该步之后的变例
    addVariations(depth);
  }

  if (total === 0) {
    const empty = document.createElement('p');
    empty.className = 'ply-empty';
    empty.textContent = '还没有棋谱，直接在棋盘上走子，或点上方「导入棋谱」。';
    list.appendChild(empty);
  }

  el.appendChild(list);

  const active = el.querySelector<HTMLElement>('.ply-row.cur');
  if (active) active.scrollIntoView({ block: 'nearest' });
}
