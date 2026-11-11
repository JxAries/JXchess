/**
 * 棋谱面板：一行显示一个回合（白方一着 + 黑方一着），如 “1. e4 e5”。
 * 变例按同样方式分行，整体缩进、字号更小；分支的分支继续缩进、字号不再缩小。
 * 同层不同分支用左侧色条区分，分支第一步加粗。
 * 每步右侧预留评分位（引擎接入后填分值）。
 */
import type { BranchGroup, PlyInfo, ReviewState } from '../game/gameState';

export interface MoveCallbacks {
  /** 跳到 moveLayout 分配的临时 id 对应的节点 */
  goToNode(id: number): void;
}

export function renderMoveList(el: HTMLElement, state: ReviewState, cb: MoveCallbacks): void {
  el.textContent = '';
  const layout = state.moveLayout();

  /** 按锚点归类所有变例：锚点 0 表示开局前 */
  const byAnchor = new Map<number, BranchGroup[]>();
  for (const group of layout.groups) {
    const list = byAnchor.get(group.anchorId);
    if (list) list.push(group);
    else byAnchor.set(group.anchorId, [group]);
  }

  const list = document.createElement('div');
  list.className = 'ply-list';

  /** 一个着法格：着法按钮 + 评分占位；空着的半回合留空 */
  const cell = (ply: PlyInfo | null): HTMLElement => {
    const wrap = document.createElement('span');
    wrap.className = 'ply-cell';
    if (!ply) return wrap;
    if (ply.current) wrap.classList.add('cur');
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ply-san';
    btn.textContent = ply.san;
    btn.addEventListener('click', () => cb.goToNode(ply.id));
    const score = document.createElement('span');
    score.className = 'ply-score';
    score.dataset.fen = ply.fen;
    wrap.append(btn, score);
    return wrap;
  };

  /** 渲染一串着法；每行白黑各一格，行后递归挂上该位置产生的变例 */
  const appendRows = (plies: PlyInfo[], level: number, hue: number): void => {
    let i = 0;
    let firstRow = true;
    while (i < plies.length) {
      const first = plies[i];
      let white: PlyInfo | null = null;
      let black: PlyInfo | null = null;
      if (first.side === 'w') {
        white = first;
        const second = plies[i + 1];
        if (second && second.side === 'b' && second.moveNumber === first.moveNumber) {
          black = second;
          i += 2;
        } else {
          i += 1;
        }
      } else {
        black = first;
        i += 1;
      }

      const row = document.createElement('div');
      row.className = 'ply-row';
      if (level === 0) {
        row.classList.add('ply-main');
      } else {
        row.classList.add('var', `var-hue-${hue}`, `lvl-${level}`);
        row.style.paddingLeft = `${8 + level * 16}px`;
        if (firstRow) row.classList.add('var-first');
      }

      const num = document.createElement('span');
      num.className = 'ply-num';
      num.textContent = `${(white ?? black)!.moveNumber}.`;
      row.append(num, cell(white), cell(black));
      list.appendChild(row);
      firstRow = false;

      // 走完这一行后出现的其它走法，就是下一层变例，紧跟在行后
      if (white) for (const group of byAnchor.get(white.id) ?? []) appendGroup(group);
      if (black) for (const group of byAnchor.get(black.id) ?? []) appendGroup(group);
    }
  };

  const appendGroup = (group: BranchGroup): void => {
    appendRows(group.plies, group.level, group.hue);
  };

  // 开局前的变例先渲染
  for (const group of byAnchor.get(0) ?? []) appendGroup(group);

  // 主线
  appendRows(layout.main, 0, 0);

  if (layout.main.length === 0 && layout.groups.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'ply-empty';
    empty.textContent = '还没有棋谱，直接在棋盘上走子，或点上方「导入棋谱」。';
    list.appendChild(empty);
  }

  el.appendChild(list);

  const active = el.querySelector<HTMLElement>('.ply-cell.cur');
  if (active) active.scrollIntoView({ block: 'nearest' });
}
