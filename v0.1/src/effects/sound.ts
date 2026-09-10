/**
 * 合成敲击音效：用 Web Audio 合成接近“木块棋子敲击棋盘”的声音，无需音频文件。
 * 由高频噪声点击 + 低频木质共鸣叠加而成；落子、吃子、将军三种提示音常驻。
 */
export class SoundFX {
  private ctx: AudioContext | null = null;

  private ensureCtx(): AudioContext | null {
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** 短噪声点击：模拟棋子与木盘接触的清脆敲击 */
  private click(gain: number, when = 0, freq = 2400): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const length = Math.floor(ctx.sampleRate * 0.05);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 0.8;
    const amp = ctx.createGain();
    const t = ctx.currentTime + when;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    source.start(t);
  }

  /** 木质共鸣低音 */
  private thump(freq: number, when = 0, gain = 0.14): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const t = ctx.currentTime + when;
    osc.frequency.setValueAtTime(freq * 1.2, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + 0.06);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + 0.1);
  }

  /** 落子：单次木击 */
  move(): void {
    this.click(0.2);
    this.thump(150);
  }

  /** 吃子：更深更沉的双击 */
  capture(): void {
    this.click(0.22, 0, 1500);
    this.thump(105, 0, 0.16);
    this.click(0.14, 0.08, 1200);
    this.thump(95, 0.09, 0.12);
  }

  /** 将军提醒：连续两记木击 */
  check(): void {
    this.click(0.2, 0, 2200);
    this.thump(170, 0, 0.13);
    this.click(0.2, 0.16, 2400);
    this.thump(180, 0.17, 0.13);
  }
}
