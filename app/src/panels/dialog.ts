/**
 * 通用文本输入弹窗：复盘页导入 PGN、摆棋页输入 FEN 等场景共用。
 * openTextDialog 打开弹窗并返回 Promise，确认时得到文本，取消时返回 null。
 * 可选 fileButton：在弹窗左下角放一个「打开文件」按钮，把选中的文件内容填进文本框
 * （复盘页的「导入棋谱」就是用它把「打开文件」和「粘贴棋谱」二合一）。
 */
export interface DialogOptions {
  title: string;
  placeholder?: string;
  confirmText?: string;
  rows?: number;
  /** 左下角的附加按钮：返回文件文本（null 表示用户取消） */
  fileButton?: { label: string; onPick: () => Promise<string | null> };
}

export function openTextDialog(opts: DialogOptions): Promise<string | null> {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'mask';

    const dialog = document.createElement('div');
    dialog.className = 'dialog';

    const title = document.createElement('h3');
    title.textContent = opts.title;
    dialog.appendChild(title);

    const textarea = document.createElement('textarea');
    textarea.placeholder = opts.placeholder ?? '';
    if (opts.rows) textarea.rows = opts.rows;
    dialog.appendChild(textarea);

    const row = document.createElement('div');
    row.className = 'row';
    if (opts.fileButton) {
      const attach = document.createElement('button');
      attach.type = 'button';
      attach.className = 'btn attach';
      attach.textContent = opts.fileButton.label;
      attach.addEventListener('click', async () => {
        attach.disabled = true;
        try {
          const text = await opts.fileButton!.onPick();
          if (text) textarea.value = text;
        } finally {
          attach.disabled = false;
        }
      });
      row.appendChild(attach);
    }
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'btn';
    cancel.textContent = '取消';
    cancel.addEventListener('click', () => close(null));
    const ok = document.createElement('button');
    ok.type = 'button';
    ok.className = 'btn primary';
    ok.textContent = opts.confirmText ?? '确定';
    ok.addEventListener('click', () => close(textarea.value.trim() || null));
    row.append(cancel, ok);
    dialog.appendChild(row);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    textarea.focus();

    function close(value: string | null): void {
      overlay.remove();
      resolve(value);
    }
  });
}
