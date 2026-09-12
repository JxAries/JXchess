/**
 * 首页棋子光标：黑王作为指针，黑马在后跟随并且一蹦一跳，右侧仅作装饰。
 * 只在支持悬停的精确指针设备上启用，并尊重系统的“减少动态效果”设置。
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
  king.className = 'fx-cursor fx-king';
  const knight = document.createElement('img');
  knight.src = 'pieces/bN.svg';
  knight.alt = '';
  knight.className = 'fx-cursor fx-knight';
  document.body.append(king, knight);

  let mx = window.innerWidth / 2;
  let my = window.innerHeight / 2;
  let kx = mx;
  let ky = my;
  let nx = mx - 70;
  let ny = my - 30;

  const show = (visible: boolean): void => {
    king.style.opacity = visible ? '1' : '0';
    knight.style.opacity = visible ? '0.92' : '0';
  };

  window.addEventListener('pointermove', (e) => {
    mx = e.clientX;
    my = e.clientY;
    show(true);
  });
  document.addEventListener('mouseleave', () => show(false));
  window.addEventListener('blur', () => show(false));

  let t = 0;
  const loop = (): void => {
    t += 1 / 60;
    kx += (mx - kx) * 0.45;
    ky += (my - ky) * 0.45;
    nx += (mx - nx) * 0.14;
    ny += (my - ny) * 0.14;
    const hop = Math.hypot(mx - nx, my - ny) > 6 ? Math.abs(Math.sin(t * 10)) * 8 : 0;
    king.style.transform = `translate(${kx}px, ${ky}px) translate(-50%, -50%)`;
    knight.style.transform = `translate(${nx}px, ${ny}px) translate(-50%, -50%) translateY(${-hop}px)`;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}
