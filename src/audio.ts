type Sound = 'hop' | 'coin' | 'hit' | 'over' | 'start';

/** Small, soft synthesized notes. No audio files or autoplay. */
export class PondAudio {
  enabled = false;
  private context: AudioContext | null = null;

  async toggle(): Promise<boolean> {
    if (this.enabled) {
      this.enabled = false;
      return false;
    }
    try {
      this.context ??= new AudioContext();
      await this.context.resume();
      this.enabled = this.context.state === 'running';
      if (this.enabled) this.play('coin');
    } catch {
      this.enabled = false;
    }
    return this.enabled;
  }

  play(sound: Sound): void {
    const ctx = this.context;
    if (!this.enabled || !ctx || ctx.state !== 'running') return;
    const notes: Record<Sound, number[]> = {
      hop: [330], coin: [659, 880], hit: [196, 147], over: [523, 440, 330], start: [392, 523, 659],
    };
    try {
      notes[sound].forEach((frequency, index) => {
        const start = ctx.currentTime + index * 0.075;
        const oscillator = ctx.createOscillator();
        const volume = ctx.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, start);
        if (sound === 'hop') oscillator.frequency.exponentialRampToValueAtTime(440, start + 0.07);
        volume.gain.setValueAtTime(0, start);
        volume.gain.linearRampToValueAtTime(0.055, start + 0.008);
        volume.gain.exponentialRampToValueAtTime(0.001, start + 0.13);
        oscillator.connect(volume);
        volume.connect(ctx.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.15);
        oscillator.onended = () => { oscillator.disconnect(); volume.disconnect(); };
      });
    } catch {
      // Audio is an optional enhancement if the device loses its audio context.
    }
  }
}
