/**
 * 设置弹层：引擎设置 / 显示设置共用一套表单样式。
 * P1 只负责保存到本地（settings.ts）；引擎参数在 P2 接到 Rust 侧后才会真正生效。
 */
import {
  DEFAULT_DISPLAY,
  DEFAULT_ENGINE,
  loadDisplay,
  loadEngine,
  saveDisplay,
  saveEngine,
  type DisplaySettings,
  type EngineSettings,
} from '../settings';

interface CheckRow {
  kind: 'check';
  key: string;
  label: string;
  hint?: string;
  value: boolean;
}

interface NumberRow {
  kind: 'number';
  key: string;
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}

type Row = CheckRow | NumberRow;

function openForm(title: string, rows: Row[], onSave: (values: Record<string, string | boolean>) => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'mask';
  const dialog = document.createElement('div');
  dialog.className = 'dialog settings-dialog';

  const heading = document.createElement('h3');
  heading.textContent = title;
  dialog.appendChild(heading);

  const form = document.createElement('div');
  form.className = 'form-list';
  /** 保存时逐项取值，避免依赖行序 */
  const getters: Array<() => [string, string | boolean]> = [];

  for (const r of rows) {
    const row = document.createElement('label');
    row.className = 'form-row';

    const label = document.createElement('span');
    label.className = 'form-label';
    label.textContent = r.label;
    if (r.hint) {
      const hint = document.createElement('span');
      hint.className = 'form-hint';
      hint.textContent = r.hint;
      label.appendChild(hint);
    }
    row.appendChild(label);

    if (r.kind === 'check') {
      const box = document.createElement('input');
      box.type = 'checkbox';
      box.checked = r.value;
      box.className = 'form-check';
      row.appendChild(box);
      getters.push(() => [r.key, box.checked]);
    } else {
      const wrap = document.createElement('span');
      wrap.className = 'form-value';
      const input = document.createElement('input');
      input.type = 'number';
      input.className = 'form-input';
      input.min = String(r.min);
      input.max = String(r.max);
      if (r.step) input.step = String(r.step);
      input.value = String(r.value);
      wrap.appendChild(input);
      if (r.unit) {
        const unit = document.createElement('span');
        unit.className = 'form-unit';
        unit.textContent = r.unit;
        wrap.appendChild(unit);
      }
      row.appendChild(wrap);
      getters.push(() => [r.key, input.value]);
    }
    form.appendChild(row);
  }
  dialog.appendChild(form);

  const actions = document.createElement('div');
  actions.className = 'row';
  const cancel = document.createElement('button');
  cancel.type = 'button';
  cancel.className = 'btn';
  cancel.textContent = '取消';
  const ok = document.createElement('button');
  ok.type = 'button';
  ok.className = 'btn primary';
  ok.textContent = '保存';
  actions.append(cancel, ok);
  dialog.appendChild(actions);

  const close = (): void => overlay.remove();
  cancel.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  ok.addEventListener('click', () => {
    const values: Record<string, string | boolean> = {};
    for (const get of getters) {
      const [key, value] = get();
      values[key] = value;
    }
    onSave(values);
    close();
  });

  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}

const DISPLAY_LABELS: Array<{ key: keyof DisplaySettings; label: string; hint?: string }> = [
  { key: 'evalBar', label: '显示评估条' },
  { key: 'bestArrow', label: '显示最佳着法箭头' },
  { key: 'extraArrows', label: '显示二选/三选箭头' },
  { key: 'annotations', label: '显示逐手优劣标记', hint: '画在棋子右上角' },
  { key: 'moveScores', label: '棋谱显示每步评分' },
  { key: 'autoAnalyze', label: '自动分析', hint: '走一步算一步，较耗电' },
  { key: 'evalFollowFlip', label: '评估条跟随棋盘翻转' },
];

/** 显示设置：开关本地保存后立即回调，供页面即时应用 */
export function openDisplaySettings(onApply: (value: DisplaySettings) => void): void {
  const current = loadDisplay();
  const rows: Row[] = DISPLAY_LABELS.map((item) => ({
    kind: 'check',
    key: item.key,
    label: item.label,
    hint: item.hint,
    value: current[item.key],
  }));
  openForm('显示设置', rows, (values) => {
    const next: DisplaySettings = { ...DEFAULT_DISPLAY };
    for (const key of Object.keys(DEFAULT_DISPLAY) as Array<keyof DisplaySettings>) {
      next[key] = Boolean(values[key]);
    }
    saveDisplay(next);
    onApply(next);
  });
}

const ENGINE_FIELDS: Array<{
  key: keyof EngineSettings;
  label: string;
  hint?: string;
  min: number;
  max: number;
  unit?: string;
}> = [
  { key: 'threads', label: '线程数', hint: '越大越快，也越吃 CPU', min: 1, max: 64 },
  { key: 'hash', label: '置换表', min: 16, max: 2048, unit: 'MB' },
  { key: 'multipv', label: '多主变数量', hint: '左侧分析面板展示的推荐条数', min: 1, max: 5 },
  { key: 'depth', label: '分析深度', hint: '0 表示不按深度限制', min: 0, max: 40 },
  { key: 'movetimeMs', label: '每步时限', hint: '0 表示不限', min: 0, max: 60000, unit: 'ms' },
  { key: 'nodes', label: '节点上限', hint: '0 表示不限', min: 0, max: 100000000 },
];

/** 引擎设置：P1 仅保存到本地，P2 接到 Rust 侧后才生效 */
export function openEngineSettings(onApply?: (value: EngineSettings) => void): void {
  const current = loadEngine();
  const rows: Row[] = ENGINE_FIELDS.map((item) => ({
    kind: 'number',
    key: item.key,
    label: item.label,
    hint: item.hint,
    value: current[item.key],
    min: item.min,
    max: item.max,
    unit: item.unit,
  }));
  openForm('引擎设置', rows, (values) => {
    const next: EngineSettings = { ...DEFAULT_ENGINE };
    for (const field of ENGINE_FIELDS) {
      const raw = Number(values[field.key]);
      const n = Number.isFinite(raw) ? raw : DEFAULT_ENGINE[field.key];
      next[field.key] = Math.min(field.max, Math.max(field.min, Math.round(n)));
    }
    saveEngine(next);
    onApply?.(next);
  });
}
