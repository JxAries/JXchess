/**
 * 棋谱面板：渲染主线走法并按回合两两成行；在被替代的主线步下方，
 * 以一行浅色小字列出该位置产生的变例整条线，点击可进入该变例。
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

  /** 追加某主线位置下的变例小字行 */
  function addVarRow(row: number): void {
    const vars = state.variationsOfRow(row);
    if (vars.length === 0) return;
    const li = document.createElement('li');
    li.className = 'var-row';
    vars.forEach((v, j) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'var-line';
      if (v.active) btn.classList.add('active');
      const tag = document.createElement('span');
      tag.className = 'var-tag';
      tag.textContent = '变着';
      const text = document.createElement('span');
      text.className = 'var-text';
      text.textContent = v.text;
      btn.append(tag, text);
      btn.title = '进入这条变例';
      btn.addEventListener('click', () => cb.goVariation(row, j));
      li.appendChild(btn);
    });
    list.appendChild(li);
  }

  const rounds = Math.ceil(total / 2);
  for (let round = 0; round < rounds; round++) {
    if (round === 0) addVarRow(0); // 第一步行棋前的变例放在最上方

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

    // 本轮两步棋各自位置下产生的变例
    const first = round * 2;
    const second = first + 1;
    if (first > 0) addVarRow(first);
    if (second < total) addVarRow(second);
  }
  el.appendChild(list);

  const active = el.querySelector<HTMLElement>('.san.cur, .var-line.active');
  if (active) active.scrollIntoView({ block: 'nearest' });
  else el.scrollTop = el.scrollHeight;
}
