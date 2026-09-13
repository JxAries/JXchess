/**
 * 首页棋子光标：黑王作为指针（带墙角式锁定标记），黑马在后跟随。
 * 马与王保持较大间距；快速移动时受速度上限限制形成延迟跟随；
 * 指针停下后，马会以停下的位置为中心向随机方向小幅蹦跳；
 * 跳跃幅度由马自身的实际移动量驱动，因此慢速移动也不会抽搐。
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

  const lock = document.createElement('div');
  lock.className = 'fx-lock';
  lock.setAttribute('aria-hidden', 'true');

  document.body.append(king, knight, lock);

  const MIN_DIST = 78; // 马与王的最小间距
  const MAX_STEP = 7; // 马每帧最大位移，形成延迟跟随
  const WANDER_MIN = 20;
  const WANDER_MAX = 40;

  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let knightPos = { x: pointer.x - MIN_DIST, y: pointer.y };
  let lastPointer = { ...pointer };
  let stillTime = 0;
  let wanderTarget = { ...knightPos };
  let wanderAge = 0;
  let hopPhase = 0;
  let hopAmp = 0;

  const show = (visible: boolean): void => {
    const opacity = visible ? '1' : '0';
    king.style.opacity = opacity;
    lock.style.opacity = visible ? '0.85' : '0';
    knight.style.opacity = visible ? '0.95' : '0';
  };

  window.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    show(true);
  });
  document.addEventListener('mouseleave', () => show(false));
  window.addEventListener('blur', () => show(false));

  const pickWanderTarget = (): void => {
    const angle = Math.random() * Math.PI * 2;
    const radius = WANDER_MIN + Math.random() * (WANDER_MAX - WANDER_MIN);
    wanderTarget = { x: pointer.x + Math.cos(angle) * radius, y: pointer.y + Math.sin(angle) * radius };
    wanderAge = 0;
  };

  const loop = (): void => {
    const dx = pointer.x - lastPointer.x;
    const dy = pointer.y - lastPointer.y;
    const pointerSpeed = Math.hypot(dx, dy);
    lastPointer = { ...pointer };

    let target: { x: number; y: number };
    let maxStep = MAX_STEP;

    if (pointerSpeed > 1.2) {
      // 运动中：目标落在指针反方向固定距离处，保证马始终落在王后面
      stillTime = 0;
      const len = Math.max(pointerSpeed, 0.001);
      target = { x: pointer.x - (dx / len) * MIN_DIST, y: pointer.y - (dy / len) * MIN_DIST };
    } else {
      // 静止：以停下的位置为中心，随机方向小步蹦跳（不再平滑环绕）
      stillTime += 1 / 60;
      if (stillTime > 0.3) {
        wanderAge += 1 / 60;
        const nearTarget = Math.hypot(knightPos.x - wanderTarget.x, knightPos.y - wanderTarget.y) < 8;
        if (wanderAge > 0.55 || nearTarget) pickWanderTarget();
        target = wanderTarget;
        maxStep = 4.2;
      } else {
        target = { x: knightPos.x, y: knightPos.y };
      }
    }

    const toX = target.x - knightPos.x;
    const toY = target.y - knightPos.y;
    const dist = Math.hypot(toX, toY);
    let moved = 0;
    if (dist > 0.5) {
      moved = Math.min(dist, maxStep);
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
      knightPos = { x: pointer.x + nx * MIN_DIST, y: pointer.y + ny * MIN_DIST };
    }

    // 跳跃幅度由马的移动量驱动：静止时自然收敛，不会抖动
    hopPhase += moved * 0.34;
    hopAmp += (Math.min(moved, 6) / 6 * 9 - hopAmp) * 0.2;
    const hop = Math.abs(Math.sin(hopPhase)) * hopAmp;

    king.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;
    knight.style.transform = `translate(${knightPos.x}px, ${knightPos.y}px) translate(-50%, -50%) translateY(${-hop}px)`;
    lock.style.transform = `translate(${pointer.x}px, ${pointer.y}px)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
