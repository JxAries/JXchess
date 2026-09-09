/**
 * 记谱面板：把主线走法按回合两两成行渲染成可点击列表。
 * renderMoveList 每次整体重建列表，点击任一步回调 onJump；当前步用高亮标出。
 */
import { ReviewState } from '../game/gameState';

export function renderMoveList(el: HTMLElement, state: ReviewState, onJump: (index: number) => void): void {
  el.textContent = '';
  const list = document.createElement('ol');
  list.className = 'moves';

  const total = state.moves.length;
  const rounds = Math.ceil(total / 2);
  for (let round = 0; round < rounds; round++) {
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
        btn.textContent = state.moves[index];
        if (index === state.pointer) btn.classList.add('cur');
        btn.addEventListener('click', () => onJump(index));
        li.appendChild(btn);
      } else {
        const empty = document.createElement('span');
        empty.className = 'san empty';
        li.appendChild(empty);
      }
    }
    list.appendChild(li);
  }
  el.appendChild(list);
  // 当前步尽量滚入视野；停在末尾时滚到底部
  const active = el.querySelector<HTMLElement>('button.san.cur');
  if (active) active.scrollIntoView({ block: 'nearest' });
  else el.scrollTop = el.scrollHeight;
}
