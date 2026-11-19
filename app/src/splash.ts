/**
 * 首页开屏动画：纸张 + 墨迹 + logo 线条显现 + 字标 + 进度条。
 * 每次应用启动只播放一次，固定停留 3 秒（供启动探测/预热），不提供跳过；系统开启“减少动态效果”时直接跳过。
 */
export function initSplash(): void {
  const splash = document.getElementById('splash');
  if (!splash) return;

  const seen = sessionStorage.getItem('jxchess.splashSeen') === '1';
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (seen || reduced) {
    splash.remove();
    sessionStorage.setItem('jxchess.splashSeen', '1');
    return;
  }

  let finished = false;
  const finish = (): void => {
    if (finished) return;
    finished = true;
    sessionStorage.setItem('jxchess.splashSeen', '1');
    splash.classList.add('splash-out');
    window.setTimeout(() => splash.remove(), 420);
  };

  // 开屏固定停留 3 秒，给启动探测/预热留时间；不提供跳过
  window.setTimeout(finish, 3000);
}
