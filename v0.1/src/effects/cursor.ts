/**
 * 首页棋子光标：黑王作为指针，黑马在后方按固定间距跟随。
 *
 * 设计取舍（不要再加回跳跃/游走）：早先版本让马在指针停下后随机小范围蹦跳，
 * 即使把跳跃幅度绑到马的实际位移上，指针微动与帧率波动仍会让 hop 值忽大忽小，
 * 看起来就是抽搐。现在只保留「跟随 + 间距」：
 *   - 指针移动时，马的目标点落在指针反方向的固定距离处，因此始终跟在王后面；
 *   - 按速度上限逐步逼近目标，形成延迟跟随的柔软感；
 *   - 任何情况下马都不会贴到王身上，距离不足时直接推到最小间距之外。
 * 仅首页启用，触屏设备或系统开启"减少动态效果"时自动回退为普通指针。
 */
export function initChessCursor(): void {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) return;

  const style = document.createElement('style');
  style.textContent = 'body.home, body.home * { cursor: none; }';
  document.head.appendChild(style);

  const king = document.createElement('img');
  king.src = 'pieces/bK.svg';
  king.alt = '';
  king.draggable = false;
  king.className = 'fx-cursor fx-king';

  const knight = document.createElement('img');
  knight.src = 'pieces/bN.svg';
  knight.alt = '';
  knight.draggable = false;
  knight.className = 'fx-cursor fx-knight';

  document.body.append(king, knight);

  /** 马与王的目标间距。马与王同尺寸，这个值决定视觉上的"落在后面多远" */
  const MIN_DIST = 96;
  /** 马每帧最大位移。取值偏大，保证指针急停后马能迅速补位 */
  const MAX_STEP = 13;

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  /** 马的当前位置；初值取指针左后方，避免开场第一帧从屏幕中心冲进来 */
  const knightPos = { x: pointer.x - MIN_DIST, y: pointer.y };
  /** 上一帧的指针位置，用来判断移动方向与速度 */
  let lastPointer = { ...pointer };
  /**
   * 最近一次有效移动方向（单位向量），初值指向左方。
   * 关键：目标点始终由「指针当前位置 + 这个方向」算出，而不是在指针停下时
   * 把目标改写成马当前位置 —— 后者会让马停在半路，与王隔开一大段距离。
   */
  let dirX = -1;
  let dirY = 0;

  const show = (visible: boolean): void => {
    const opacity = visible ? '1' : '0';
    king.style.opacity = opacity;
    knight.style.opacity = visible ? '0.95' : '0';
  };

  window.addEventListener('pointermove', (e) => {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    show(true);
  });
  document.addEventListener('mouseleave', () => show(false));
  window.addEventListener('blur', () => show(false));

  const loop = (): void => {
    const dx = pointer.x - lastPointer.x;
    const dy = pointer.y - lastPointer.y;
    const pointerSpeed = Math.hypot(dx, dy);
    lastPointer = { ...pointer };

    // 仅在指针确实移动时更新方向；指针静止时沿用上一方向，
    // 因此目标点仍然挂在指针身上，马会一路补位到正确的间距。
    if (pointerSpeed > 0.5) {
      const len = pointerSpeed;
      dirX = dx / len;
      dirY = dy / len;
    }

    const targetX = pointer.x - dirX * MIN_DIST;
    const targetY = pointer.y - dirY * MIN_DIST;

    // 按速度上限逐步逼近目标，形成延迟跟随
    const toX = targetX - knightPos.x;
    const toY = targetY - knightPos.y;
    const dist = Math.hypot(toX, toY);
    if (dist > 0.5) {
      const moved = Math.min(dist, MAX_STEP);
      knightPos.x += (toX / dist) * moved;
      knightPos.y += (toY / dist) * moved;
    }

    // 兜底：任何情况下马都不会贴到王身上
    const sepX = knightPos.x - pointer.x;
    const sepY = knightPos.y - pointer.y;
    const sep = Math.hypot(sepX, sepY);
    if (sep < MIN_DIST) {
      const nx = sep < 0.001 ? -1 : sepX / sep;
      const ny = sep < 0.001 ? 0 : sepY / sep;
      knightPos.x = pointer.x + nx * MIN_DIST;
      knightPos.y = pointer.y + ny * MIN_DIST;
    }

    king.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;
    knight.style.transform = `translate(${knightPos.x}px, ${knightPos.y}px) translate(-50%, -50%)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
