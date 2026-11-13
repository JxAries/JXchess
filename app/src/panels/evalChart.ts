/**
 * 局面走势折线图：输入白方视角的厘兵分序列（undefined 表示该步还没算），
 * 画到给定的 SVG 里。零线以上白、以下黑，越接近两端越饱和。
 * 自绘 SVG，不引入图表库。
 */
const W = 100;
const H = 60;
const MID = 30;
const MAX_CP = 800;

export function renderEvalChart(svg: SVGSVGElement, values: readonly (number | undefined)[]): void {
  while (svg.firstChild) svg.removeChild(svg.firstChild);
  const ns = 'http://www.w3.org/2000/svg';
  const make = (tag: string, attrs: Record<string, string | number>): SVGElement => {
    const el = document.createElementNS(ns, tag);
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
    return el;
  };

  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  // 上下两块底色：白方（上）/ 黑方（下）
  svg.appendChild(make('rect', { x: 0, y: 0, width: W, height: MID, fill: '#f3f1ec' }));
  svg.appendChild(make('rect', { x: 0, y: MID, width: W, height: H - MID, fill: '#3a3936' }));
  svg.appendChild(make('line', { x1: 0, y1: MID, x2: W, y2: MID, stroke: '#d9d4ca', 'stroke-width': 0.4 }));

  if (values.length < 2) return;

  const step = W / (values.length - 1);
  const point = (value: number, index: number): [number, number] => {
    const clamped = Math.max(-MAX_CP, Math.min(MAX_CP, value));
    return [index * step, MID - (clamped / MAX_CP) * MID];
  };

  // 分段绘制，缺数据的区间断开
  let path = '';
  let pen = false;
  values.forEach((value, index) => {
    if (value === undefined) {
      pen = false;
      return;
    }
    const [x, y] = point(value, index);
    path += `${pen ? 'L' : 'M'}${x.toFixed(2)},${y.toFixed(2)} `;
    pen = true;
  });

  svg.appendChild(
    make('path', {
      d: path.trim(),
      fill: 'none',
      stroke: '#8a3b3b',
      'stroke-width': 0.9,
      'stroke-linejoin': 'round',
      'stroke-linecap': 'round',
    }),
  );
}
