/**
 * 合成音效：用 Web Audio 实时生成轻柔的落子、吃子与将军提示音，不需要任何音频文件。
 * 提供 move、capture、check 三个提示音，并可通过 toggle 静音。
 */
export class SoundFX {
  enabled = true;

  private ctx: AudioContext | null = null;

  /** 开关音效，返回当前状态 */
  toggle(): boolean {
    this.enabled = !this.enabled;
    return this.enabled;
  }

  private ensureCtx(): AudioContext | null {
    if (!this.enabled) return null;
    try {
      if (!this.ctx) this.ctx = new AudioContext();
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return this.ctx;
    } catch {
      return null;
    }
  }

  /** 弹一声短音 */
  private tone(freq: number, seconds: number, type: OscillatorType, gain: number, when = 0): void {
    const ctx = this.ensureCtx();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    amp.gain.setValueAtTime(gain, ctx.currentTime + when);
    amp.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + when + seconds);
    osc.connect(amp);
    amp.connect(ctx.destination);
    osc.start(ctx.currentTime + when);
    osc.stop(ctx.currentTime + when + seconds + 0.02);
  }

  /** 普通落子：轻而短的低音 */
  move(): void {
    this.tone(210, 0.09, 'triangle', 0.12);
  }

  /** 吃子：稍低沉的双音 */
  capture(): void {
    this.tone(160, 0.09, 'triangle', 0.12);
    this.tone(90, 0.11, 'sine', 0.1, 0.02);
  }

  /** 将军提醒：上行两短音 */
  check(): void {
    this.tone(440, 0.09, 'sine', 0.08);
    this.tone(660, 0.12, 'sine', 0.08, 0.1);
  }
}
