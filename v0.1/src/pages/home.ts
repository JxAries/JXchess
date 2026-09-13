/**
 * 首页入口：生成密度更高、位置与角度随机、且缓慢旋转的飘落棋子背景，并启用棋子光标特效。
 */
import { initChessCursor } from '../effects/cursor';

/** 背景飘落棋子：数量、横向位置、大小、时长与倾角均随机，避免出现规律与空白 */
function buildFallingPieces(): void {
  const sky = document.querySelector('.sky');
  if (!sky) return;
  const pieces = ['wK', 'wQ', 'wR', 'wB', 'wN', 'wP', 'bK', 'bQ', 'bR', 'bB', 'bN', 'bP'];
  const count = 16;
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const img = document.createElement('img');
    img.src = `pieces/${pieces[Math.floor(Math.random() * pieces.length)]}.svg`;
    img.alt = '';
    img.draggable = false;
    const size = 24 + Math.round(Math.random() * 16);
    // 起始与结束角度差得足够大，下落过程中能明显看到缓慢旋转
    const angle = Math.round(Math.random() * 70 - 35);
    const spin = (Math.random() < 0.5 ? -1 : 1) * (70 + Math.round(Math.random() * 120));
    img.width = size;
    img.height = size;
    img.style.left = `${Math.round(Math.random() * 94)}%`;
    img.style.animationDuration = `${18 + Math.round(Math.random() * 24)}s`;
    img.style.animationDelay = `-${Math.round(Math.random() * 40)}s`;
    img.style.setProperty('--ang', `${angle}deg`);
    img.style.setProperty('--ang2', `${angle + spin}deg`);
    fragment.appendChild(img);
  }
  sky.appendChild(fragment);
}

buildFallingPieces();
initChessCursor();
