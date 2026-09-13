/**
 * 首页棋子光标：黑王作为指针，黑马在其后方跟随。
 * 马与王保持最小距离，指针静止时马在附近小范围游走，指针快速移动时马的移动速度有上限，
 * 因此始终能看到"王在前、马在后"的追随效果；仅首页启用，触屏或减少动效时自动回退。
 */
export function initChessCursor(): void {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!fine || reduce) return;

  // 隐藏系统指针，仅作用于首页
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

  const MIN_DIST = 62; // 马与王的最小间距
  const MAX_STEP = 4.2; // 马每帧最大位移，形成延迟跟随
  const WANDER_RADIUS = 26;

  let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  let knightPos = { x: pointer.x - MIN_DIST, y: pointer.y };
  let wanderAngle = 0;
  let stillTime = 0;
  let lastPointer = { ...pointer };

  const show = (visible: boolean): void => {
    king.style.opacity = visible ? '1' : '0';
    knight.style.opacity = visible ? '0.92' : '0';
  };

  window.addEventListener('pointermove', (e) => {
    pointer = { x: e.clientX, y: e.clientY };
    show(true);
  });
  document.addEventListener('mouseleave', () => show(false));
  window.addEventListener('blur', () => show(false));

  const loop = (): void => {
    const dx = pointer.x - lastPointer.x;
    const dy = pointer.y - lastPointer.y;
    const speed = Math.hypot(dx, dy);
    lastPointer = { ...pointer };

    let target: { x: number; y: number };
    if (speed > 1.2) {
      stillTime = 0;
      // 目标点落在指针的反方向固定距离处，保证马始终落后于王
      const len = Math.max(speed, 0.001);
      target = { x: pointer.x - (dx / len) * MIN_DIST, y: pointer.y - (dy / len) * MIN_DIST };
    } else {
      stillTime += 1 / 60;
      if (stillTime > 0.45) {
        wanderAngle += 0.018;
        target = {
          x: pointer.x + Math.cos(wanderAngle) * WANDER_RADIUS,
          y: pointer.y + Math.sin(wanderAngle * 0.8) * WANDER_RADIUS * 0.6,
        };
      } else {
        target = { ...knightPos };
      }
    }

    // 限速靠近目标，形成延迟跟随
    const toX = target.x - knightPos.x;
    const toY = target.y - knightPos.y;
    const dist = Math.hypot(toX, toY);
    if (dist > 0.5) {
      const move = Math.min(dist, MAX_STEP);
      knightPos.x += (toX / dist) * move;
      knightPos.y += (toY / dist) * move;
    }

    // 兜底：无论如何都不允许马贴到王身上
    const sepX = knightPos.x - pointer.x;
    const sepY = knightPos.y - pointer.y;
    const sep = Math.hypot(sepX, sepY);
    if (sep < MIN_DIST) {
      const nx = sep < 0.001 ? -1 : sepX / sep;
      const ny = sep < 0.001 ? 0 : sepY / sep;
      knightPos = { x: pointer.x + nx * MIN_DIST, y: pointer.y + ny * MIN_DIST };
    }

    const hop = speed > 1.5 ? Math.abs(Math.sin(performance.now() / 90)) * 7 : 0;
    king.style.transform = `translate(${pointer.x}px, ${pointer.y}px) translate(-50%, -50%)`;
    knight.style.transform = `translate(${knightPos.x}px, ${knightPos.y}px) translate(-50%, -50%) translateY(${-hop}px)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
