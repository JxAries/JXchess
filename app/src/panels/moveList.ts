/**
 * 棋谱面板：渲染主线走法并按回合两两成行；在被替代的主线步下方，
 * 以一行浅色小字列出该位置产生的变例（含回合序号与行棋方），
 * 当前所在的变例整行高亮、当前着法单独标记，并自动横向滚动到当前着法位置。
 */
import { ReviewState } from '../game/gameState';

export interface MoveCallbacks {
  /** 跳到主线第 depth 步之后的位置，depth=0 表示开局 */
  goToDepth(depth: number): void;
  /** 进入第 row 条主线步位置下的第 index 条变例 */
  goVariation(row: number, index: number): void;
}

export function renderMoveList(el: HTMLElement, state: ReviewState, cb: MoveCallbacks): void {
  el.textContent = '';
  const total = state.mainlineLength();
  const curDepth = state.mainDepth();
  const list = document.createElement('ol');
  list.className = 'moves';
  /** 当前所在变例的行元素与其步序号，稍后用于自动滚动 */
  const activeLines: Array<{ btn: HTMLButtonElement; step: number }> = [];

  function addVarRow(row: number): void {
    const views = state.variationsOfRow(row);
    if (views.length === 0) return;
    const li = document.createElement('li');
    li.className = 'var-row';
    views.forEach((view, j) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'var-line';
      if (view.active) btn.classList.add('active');
      view.tokens.forEach((token, ti) => {
        const span = document.createElement('span');
        span.className = 'var-move';
        if (view.active && ti === view.activeStep) span.classList.add('cur');
        span.textContent = token;
        btn.appendChild(span);
      });
      btn.title = '进入这条变例';
      btn.addEventListener('click', () => cb.goVariation(row, j));
      if (view.active) activeLines.push({ btn, step: view.activeStep });
      li.appendChild(btn);
    });
    list.appendChild(li);
  }

  const rounds = Math.ceil(total / 2);
  for (let round = 0; round < rounds; round++) {
    if (round === 0) addVarRow(0); // 第一步之前的变例放在最上方

    const li = document.createElement('li');
    const num = document.createElement('span');
    num.className = 'mnum';
    num.textContent = `${round + 1}.`;
    li.appendChild(num);

    for (let side = 0; side < 2; side++) {
      const index = round * 2 + side;
      if (index < total) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'san';
        btn.textContent = state.mainMoveSan(index) ?? '';
        if (curDepth === index + 1) btn.classList.add('cur');
        btn.addEventListener('click', () => cb.goToDepth(index + 1));
        li.appendChild(btn);
      } else {
        const empty = document.createElement('span');
        empty.className = 'san empty';
        li.appendChild(empty);
      }
    }
    list.appendChild(li);

    const first = round * 2;
    const second = first + 1;
    if (first > 0) addVarRow(first);
    if (second < total) addVarRow(second);
  }
  el.appendChild(list);

  // 变例文本随当前着法自动横向滚动：当前着法尽量靠左，回到第一步时即最左端
  for (const { btn, step } of activeLines) {
    const token = btn.querySelectorAll<HTMLElement>('.var-move')[step];
    if (!token) continue;
    const offset = token.getBoundingClientRect().left - btn.getBoundingClientRect().left + btn.scrollLeft;
    btn.scrollLeft = Math.max(0, offset - 4);
  }

  const active = el.querySelector<HTMLElement>('.san.cur, .var-line.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
  else el.scrollTop = el.scrollHeight;
}
