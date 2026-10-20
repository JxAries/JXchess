/**
 * 首页棋子光标：黑王作为指针，黑马在后方按固定间距跟随。
 *
 * 设计取舍（不要再加回跳跃/游走）：
 * 早先版本让马在指针停下后随机小范围蹦跳，即使把跳跃幅度绑到马的实际位移上，
 * 指针微动与帧率波动仍会让 hop 值忽大忽小，看起来就是抽搐。
 * 上一版改成「按相邻两帧位移求方向，目标点 = 指针 − 方向×96」，又出现新问题：
 * 指针极慢速移动时每帧位移只有半个到一个像素，鼠标本身的像素量化与抖动会让
 * 方向在上下之间反复翻转，目标点于是在指针正上方与正下方之间来回跳，马表现为上下快速抽动。
 *
 * 现在的做法：不再从瞬时方向推目标点，而是记录指针走过的轨迹，
 * 目标点取「轨迹上距指针约 96px 的那一点」（滞后跟随，等同于指针拖动一根 96px 的绳子）。
 *   - 轨迹由真实移动累积而成，慢速移动时方向是长期趋势，不会被单帧噪声带偏；
 *   - 指针停下时轨迹不再增长，目标点是轨迹上的定点，马收敛后就完全静止；
 *   - 指针走弧线时马沿原路跟进，视觉上就是被拖在身后，不会抄近道横穿。
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
  /** 马每帧最大位移。偏大以保证指针急停后能迅速补位，又不会一步跳到位 */
  const MAX_STEP = 16;
  /** 轨迹缓存上限（按累计长度算），略大于 MIN_DIST 留出插值余量 */
  const TRAIL_MAX = 260;
  /** 小于这个位移不记入轨迹：过滤静止噪声，也避免几乎共线的点堆满缓存 */
  const MIN_SEGMENT = 1.5;

  const pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  /** 马的当前位置；初值取指针左后方，避免开场第一帧从屏幕中心冲进来 */
  const knightPos = { x: pointer.x - MIN_DIST, y: pointer.y };
  /** 指针轨迹：trail[0] 最新，末位最旧。只记录指针真实移动过的位置 */
  const trail: Array<{ x: number; y: number }> = [{ ...pointer }];

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

  /** 把当前指针位置追加进轨迹并裁剪长度 */
  const pushTrail = (): void => {
    const head = trail[0];
    if (Math.hypot(pointer.x - head.x, pointer.y - head.y) < MIN_SEGMENT) return;
    trail.unshift({ x: pointer.x, y: pointer.y });
    let total = 0;
    for (let i = 1; i < trail.length; i++) {
      total += Math.hypot(trail[i].x - trail[i - 1].x, trail[i].y - trail[i - 1].y);
      if (total > TRAIL_MAX) {
        trail.length = i + 1;
        return;
      }
    }
  };

  /**
   * 在轨迹上取距指针约 MIN_DIST 的那一点作为马的目标。
   * 轨迹不足 MIN_DIST 时取最旧的点，于是指针停下后目标恒定，马不会再被噪声推着抖。
   */
  const targetOnTrail = (): { x: number; y: number } => {
    let acc = Math.hypot(pointer.x - trail[0].x, pointer.y - trail[0].y);
    for (let i = 1; i < trail.length; i++) {
      const ax = trail[i - 1].x;
      const ay = trail[i - 1].y;
      const bx = trail[i].x;
      const by = trail[i].y;
      const seg = Math.hypot(bx - ax, by - ay);
      if (seg < 0.001) continue;
      if (acc + seg >= MIN_DIST) {
        const t = (MIN_DIST - acc) / seg;
        return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t };
      }
      acc += seg;
    }
    const tail = trail[trail.length - 1];
    return { x: tail.x, y: tail.y };
  };

  const loop = (): void => {
    pushTrail();

    const target = targetOnTrail();
    const toX = target.x - knightPos.x;
    const toY = target.y - knightPos.y;
    const dist = Math.hypot(toX, toY);
    if (dist > 0.5) {
      const moved = Math.min(dist, MAX_STEP);
      knightPos.x += (toX / dist) * moved;
      knightPos.y += (toY / dist) * moved;
    }

    // 兜底：任何情况下马都不会贴到王身上（例如指针贴边时轨迹被裁剪）
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
