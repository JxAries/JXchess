/**
 * 左侧图表：局面走势折线图 + 用时柱状图。
 * 用 SVG 的实际像素尺寸作为 viewBox，避免 preserveAspectRatio 拉伸导致圆点变椭圆；
 * 颜色与尺寸集中在这里，方便之后整体换风格。
 */
export type ChartMark =
  | 'brilliant'
  | 'best'
  | 'good'
  | 'normal'
  | 'inaccuracy'
  | 'mistake'
  | 'blunder'
  | undefined;

const MAX_CP = 800;
const BASELINE = '#8b857c';
const LINE_COLOR = '#000000';
const BAR_COLOR = '#8b857c';

const MARK_COLOR: Record<Exclude<ChartMark, undefined>, string> = {
  brilliant: '#1f4fd8',
  best: '#c9a227',
  good: '#2f6fdf',
  normal: '#8b857c',
  inaccuracy: '#e08a1e',
  mistake: '#e05a1e',
  blunder: '#d62828',
};

interface Box {
  w: number;
  h: number;
  top: number;
  mid: number;
  bottom: number;
}

function clear(svg: SVGSVGElement): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
}

function el(svg: SVGSVGElement, tag: string, attrs: Record<string, string | number>): SVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, String(value));
  svg.appendChild(node);
  return node;
}

/** 按实际显示尺寸建立坐标，保证圆点是圆的、填充能到边 */
function measure(svg: SVGSVGElement): Box {
  const rect = svg.getBoundingClientRect();
  const w = Math.max(120, Math.round(rect.width || 300));
  const h = Math.max(80, Math.round(rect.height || 126));
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  const top = 8;
  const bottom = h - 8;
  return { w, h, top, mid: h / 2, bottom };
}

/**
 * 局面走势：整块米白底，折线以下填黑灰，中心保留均势基准线；
 * 当前着法位置画竖直虚线 + 交点；好棋/坏棋在折线上用彩色小圆点标出。
 */
export function renderEvalChart(
  svg: SVGSVGElement,
  values: readonly (number | undefined)[],
  currentIndex: number,
  marks: readonly ChartMark[],
): void {
  clear(svg);
  const box = measure(svg);
  const { w, h, top, mid } = box;

  // 上一版配色：折线以上白、以下灰，横竖线黑
  el(svg, 'rect', { x: 0, y: 0, width: w, height: h, fill: '#ffffff' });

  // 去掉首尾没有评分的局面（例如将死后的终点），避免右侧留出一列空白
  let start = 0;
  let end = values.length;
  while (start < end && values[start] === undefined) start++;
  while (end > start && values[end - 1] === undefined) end--;
  const data = values.slice(start, end);
  const n = data.length;
  if (n < 2) return;
  const offset = start;
  const xOf = (index: number): number => (index / (n - 1)) * w;
  const yOf = (cp: number): number => {
    const clamped = Math.max(-MAX_CP, Math.min(MAX_CP, cp));
    return mid - (clamped / MAX_CP) * (mid - top);
  };

  const points = data
    .map((value, index) => (value === undefined ? null : { index: index + offset, x: xOf(index), y: yOf(value) }))
    .filter((p): p is { index: number; x: number; y: number } => p !== null);

  if (points.length > 1) {
    const first = points[0];
    const last = points[points.length - 1];
    const above =
      `M${first.x},0 ` + points.map((p) => `L${p.x},${p.y}`).join(' ') + ` L${last.x},0 Z`;
    const below =
      `M${first.x},${h} ` + points.map((p) => `L${p.x},${p.y}`).join(' ') + ` L${last.x},${h} Z`;
    el(svg, 'path', { d: above, fill: '#8b857c' });
    el(svg, 'path', { d: below, fill: '#ffffff' });
  }

  // 均势基准线（灰色）
  el(svg, 'line', {
    x1: 0,
    y1: mid,
    x2: w,
    y2: mid,
    stroke: LINE_COLOR,
    'stroke-width': 1,
    'stroke-dasharray': '3 3',
  });

  // 折线（细、灰色）
  let d = '';
  let pen = false;
  values.forEach((value, index) => {
    if (value === undefined) {
      pen = false;
      return;
    }
    const local = index - offset;
    if (local < 0 || local >= n) return;
    d += `${pen ? 'L' : 'M'}${xOf(local).toFixed(2)},${yOf(value).toFixed(2)} `;
    pen = true;
  });
  el(svg, 'path', {
    d: d.trim(),
    fill: 'none',
    stroke: LINE_COLOR,
    'stroke-width': 1,
    'stroke-linejoin': 'round',
    'stroke-linecap': 'round',
  });

  // 好棋/坏棋小圆点
  points.forEach((p) => {
    const mark = marks[p.index];
    if (!mark || mark === 'normal') return;
    el(svg, 'circle', { cx: p.x, cy: p.y, r: 2.6, fill: MARK_COLOR[mark] });
  });

  // 当前着法：灰色竖虚线 + 小交点
  if (currentIndex >= 0 && currentIndex < values.length && values[currentIndex] !== undefined) {
    const local = currentIndex - offset;
    const x = xOf(local);
    const y = yOf(values[currentIndex]!);
    el(svg, 'line', {
      x1: x,
      y1: 0,
      x2: x,
      y2: h,
      stroke: LINE_COLOR,
      'stroke-width': 1,
      'stroke-dasharray': '3 3',
    });
    el(svg, 'circle', { cx: x, cy: y, r: 3, fill: LINE_COLOR, stroke: '#ffffff', 'stroke-width': 1 });
  }
}

/**
 * 用时柱状图（参考 lichess）：中心横轴为 0s，上方白方、下方黑方，
 * 每根柱子顶端用小字标出用时秒数。
 */
export function renderTimingChart(svg: SVGSVGElement, times: readonly number[]): void {
  clear(svg);
  const box = measure(svg);
  const { w, h, top, mid } = box;

  el(svg, 'rect', { x: 0, y: 0, width: w, height: h, fill: '#f7f4ee' });
  el(svg, 'line', { x1: 0, y1: mid, x2: w, y2: mid, stroke: BASELINE, 'stroke-width': 1 });
  if (times.length === 0) return;

  const max = Math.max(1000, ...times);
  const scale = (mid - top - 12) / max;
  const slot = w / times.length;
  const barW = Math.max(3, slot * 0.55);
  const label = (ms: number): string => `${Math.max(1, Math.round(ms / 1000))}s`;

  times.forEach((ms, index) => {
    const x = slot * index + (slot - barW) / 2;
    const barH = Math.max(1, ms * scale);
    const white = index % 2 === 0;
    const y = white ? mid - barH : mid;
    el(svg, 'rect', {
      x,
      y,
      width: barW,
      height: barH,
      fill: white ? '#f4f2ec' : '#3a3936',
      stroke: BAR_COLOR,
      'stroke-width': 0.6,
    });
    // 白方柱标在上端，黑方柱标在下端
    const textY = white ? Math.max(9, y - 3) : Math.min(h - 2, y + barH + 9);
    el(svg, 'text', {
      x: x + barW / 2,
      y: textY,
      'font-size': 7.5,
      fill: '#6b665e',
      'text-anchor': 'middle',
    }).textContent = label(ms);
  });
}
