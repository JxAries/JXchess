/**
 * 合成敲击音效：用 Web Audio 合成接近“木块棋子敲击棋盘”的声音，无需音频文件。
 * 三种提示音均为单次敲击且音色区分明显：落子温和、吃子低沉、将军清脆。
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

  /** 短噪声点击：棋子接触木盘的敲击声 */
  private click(gain: number, freq: number, when = 0): void {
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
    filter.Q.value = 0.9;
    const amp = ctx.createGain();
    const t = ctx.currentTime + when;
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(ctx.destination);
    source.start(t);
  }

  /** 木质共鸣低音 */
  private thump(freq: number, gain: number, duration: number, when = 0): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    const t = ctx.currentTime + when;
    osc.frequency.setValueAtTime(freq * 1.25, t);
    osc.frequency.exponentialRampToValueAtTime(freq, t + duration * 0.6);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  /** 落子：温和的单次木击 */
  move(): void {
    this.click(0.34, 2000);
    this.thump(135, 0.22, 0.08);
  }

  /** 吃子：更低沉、更实的单次敲击 */
  capture(): void {
    this.click(0.4, 1150);
    this.thump(85, 0.3, 0.13);
  }

  /** 将军：清脆、明亮的单次敲击 */
  check(): void {
    this.click(0.46, 3400);
    this.thump(260, 0.16, 0.05);
  }
}
