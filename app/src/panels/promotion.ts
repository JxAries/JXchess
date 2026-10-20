/**
 * 升变选择弹层：兵到达底线时弹出后、车、象、马四个选项。
 * askPromotion 返回所选兵种，点取消或遮罩返回 null，由调用方决定放弃该步。
 */
import { PIECE_CN, pieceImage, type Color, type PieceKind } from '../game/types';

export function askPromotion(color: Color): Promise<PieceKind | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'promo-mask';

    const box = document.createElement('div');
    box.className = 'promo-box';

    const hint = document.createElement('span');
    hint.className = 'promo-hint';
    hint.textContent = '升变为';
    box.appendChild(hint);

    const kinds: PieceKind[] = ['q', 'r', 'b', 'n'];
    for (const kind of kinds) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'promo-btn';
      btn.title = PIECE_CN[kind];
      const img = document.createElement('img');
      img.src = pieceImage(color, kind);
      img.alt = PIECE_CN[kind];
      btn.appendChild(img);
      btn.addEventListener('click', () => close(kind));
      box.appendChild(btn);
    }

    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => close(null));
    box.appendChild(cancel);

    overlay.appendChild(box);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close(null);
    });

    function close(kind: PieceKind | null): void {
      overlay.remove();
      resolve(kind);
    }
  });
}
