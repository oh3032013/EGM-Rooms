// Procedural Web Audio API synthesizer for cozy farming ambience & crisp SFX

export type NocturnalCueKind = 'hoot' | 'rustle';

export function pickNocturnalCueKind(
  wildlifeCount: number,
  step: number,
  rng: () => number = Math.random
): NocturnalCueKind {
  // When nocturnal wildlife are prowling nearby, weight slightly toward grass/leaf rustling;
  // alternate periodically so distant woodland hoots and close rustles both breathe at night.
  const rustleBias = wildlifeCount > 0 ? 0.65 : 0.48;
  const roll = rng();
  if (step % 3 === 0 && roll < 0.72) return 'hoot';
  return roll < rustleBias ? 'rustle' : 'hoot';
}

class CozyAudioEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private sfxGain: GainNode | null = null;
  private ambientGain: GainNode | null = null;
  private muted = false;
  private musicTimer: number | null = null;
  private nocturnalTimer: number | null = null;
  private nightPhaseActive = false;
  private nocturnalWildlifeCount = 0;
  private nocturnalStep = 0;
  private stepIndex = 0;
  private isPlayingState = false;
  private visibilityListenerAttached = false;
  private readonly handleVisibilityChange = () => {
    if (!this.ctx) return;
    if (document.visibilityState === 'hidden') {
      this.clearNocturnalTimer();
      if (this.ctx.state === 'running') {
        void this.ctx.suspend().catch(() => {});
      }
    } else if (this.isPlayingState) {
      if (!this.muted && this.ctx.state === 'suspended') {
        void this.ctx.resume().catch(() => {});
      }
      if (this.nightPhaseActive) {
        this.scheduleNextNocturnalCue(1500);
      }
    }
  };

  // Cozy C major pentatonic notes (Hz)
  private readonly melodyNotes = [
    523.25, // C5
    659.25, // E5
    587.33, // D5
    783.99, // G5
    659.25, // E5
    440.0,  // A4
    523.25, // C5
    392.0,  // G4
    523.25, // C5
    587.33, // D5
    659.25, // E5
    523.25, // C5
  ];

  private readonly bassNotes = [130.81, 130.81, 174.61, 196.0]; // C3, C3, F3, G3

  public init(): void {
    if (typeof window === 'undefined') return;
    if (this.ctx) {
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.7;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.22;
    this.musicGain.connect(this.masterGain);

    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.5;
    this.sfxGain.connect(this.masterGain);

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.value = 0.34;
    this.ambientGain.connect(this.masterGain);

    if (!this.visibilityListenerAttached && typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = true;
    }
  }

  public setMuted(mute: boolean): void {
    this.muted = mute;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(mute ? 0 : 0.7, this.ctx.currentTime, 0.04);
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public startAmbientMusic(): void {
    this.isPlayingState = true;
    this.init();
    if (this.nightPhaseActive && this.nocturnalTimer === null) {
      this.scheduleNextNocturnalCue(1400);
    }
    if (this.musicTimer !== null || typeof window === 'undefined') return;

    this.musicTimer = window.setInterval(() => {
      if (!this.isPlayingState || this.muted || !this.ctx || !this.musicGain) return;
      if (this.ctx.state !== 'running') return;

      const now = this.ctx.currentTime;
      const noteFreq = this.melodyNotes[this.stepIndex % this.melodyNotes.length];

      // Gentle kalimba/music-box pluck on melody
      if (this.stepIndex % 2 === 0 || this.stepIndex % 5 === 0) {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(noteFreq, now);
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.75);
        osc.connect(gain);
        gain.connect(this.musicGain);
        osc.start(now);
        osc.stop(now + 0.8);
      }

      // Warm bass pad every 4 steps
      if (this.stepIndex % 4 === 0) {
        const bassFreq = this.bassNotes[Math.floor(this.stepIndex / 4) % this.bassNotes.length];
        const bOsc = this.ctx.createOscillator();
        const bGain = this.ctx.createGain();
        bOsc.type = 'sine';
        bOsc.frequency.setValueAtTime(bassFreq, now);
        bGain.gain.setValueAtTime(0.001, now);
        bGain.gain.linearRampToValueAtTime(0.18, now + 0.08);
        bGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
        bOsc.connect(bGain);
        bGain.connect(this.musicGain);
        bOsc.start(now);
        bOsc.stop(now + 1.55);
      }

      this.stepIndex += 1;
    }, 540);
  }

  public pauseAmbientMusic(): void {
    this.isPlayingState = false;
    this.clearNocturnalTimer();
  }

  public stopAmbientMusic(): void {
    this.isPlayingState = false;
    this.nightPhaseActive = false;
    this.nocturnalWildlifeCount = 0;
    this.clearNocturnalTimer();
    if (this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  public setNightAmbience(active: boolean, wildlifeCount = 0): void {
    const cleanCount = Number.isFinite(wildlifeCount) ? Math.max(0, Math.floor(wildlifeCount)) : 0;
    if (this.nightPhaseActive === active && this.nocturnalWildlifeCount === cleanCount) {
      if (active && this.isPlayingState && this.nocturnalTimer === null) {
        this.scheduleNextNocturnalCue(1400);
      }
      return;
    }
    this.nightPhaseActive = active;
    this.nocturnalWildlifeCount = cleanCount;
    if (!active) {
      this.clearNocturnalTimer();
      return;
    }
    if (this.isPlayingState && this.nocturnalTimer === null) {
      this.scheduleNextNocturnalCue(1200 + Math.random() * 1400);
    }
  }

  public getNightAmbienceState(): {
    active: boolean;
    wildlifeCount: number;
    scheduled: boolean;
  } {
    return {
      active: this.nightPhaseActive,
      wildlifeCount: this.nocturnalWildlifeCount,
      scheduled: this.nocturnalTimer !== null,
    };
  }

  public playNocturnalAmbientCue(kind?: NocturnalCueKind, intensity = 1): void {
    this.init();
    if (this.muted || !this.ctx || !this.ambientGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    if (this.ctx.state !== 'running') return;

    const cue = kind ?? pickNocturnalCueKind(this.nocturnalWildlifeCount, this.nocturnalStep);
    const scale = Math.max(0.5, Math.min(1.3, Number.isFinite(intensity) ? intensity : 1));
    const now = this.ctx.currentTime;

    if (cue === 'hoot') {
      const vol = 0.055 * scale;
      const baseFreq = 370 + Math.random() * 48;
      // Soft two-syllable woodland owl hoot
      this.tone(baseFreq, baseFreq * 0.9, 0.14, 'sine', vol * 0.78, now, this.ambientGain);
      this.tone(baseFreq * 1.03, baseFreq * 0.83, 0.42, 'sine', vol, now + 0.24, this.ambientGain);
      this.tone(
        baseFreq * 2.06,
        baseFreq * 1.66,
        0.26,
        'triangle',
        vol * 0.14,
        now + 0.24,
        this.ambientGain
      );
      return;
    }

    // 'rustle': delicate nocturnal foliage / grass brush bursts
    const vol = 0.052 * scale;
    this.noiseBurst(0.065, 900 + Math.random() * 350, vol * 0.85, now, this.ambientGain, 1.8);
    this.noiseBurst(0.08, 1150 + Math.random() * 450, vol, now + 0.09, this.ambientGain, 1.7);
    this.noiseBurst(0.055, 780 + Math.random() * 300, vol * 0.65, now + 0.19, this.ambientGain, 1.9);
  }

  private clearNocturnalTimer(): void {
    if (this.nocturnalTimer !== null) {
      if (typeof window !== 'undefined') {
        window.clearTimeout(this.nocturnalTimer);
      } else {
        clearTimeout(this.nocturnalTimer);
      }
      this.nocturnalTimer = null;
    }
  }

  private scheduleNextNocturnalCue(delayOverrideMs?: number): void {
    if (!this.nightPhaseActive || !this.isPlayingState || typeof window === 'undefined') return;
    if (this.nocturnalTimer !== null) return;

    const baseDelayMs =
      this.nocturnalWildlifeCount > 0
        ? 3600 + Math.random() * 3400
        : 5200 + Math.random() * 4300;
    const delayMs = Math.max(400, Math.round(delayOverrideMs ?? baseDelayMs));

    this.nocturnalTimer = window.setTimeout(() => {
      this.nocturnalTimer = null;
      if (!this.nightPhaseActive || !this.isPlayingState) return;
      if (!this.muted && this.ctx && this.ctx.state === 'running') {
        const cue = pickNocturnalCueKind(this.nocturnalWildlifeCount, this.nocturnalStep);
        const intensity =
          this.nocturnalWildlifeCount > 0
            ? Math.min(1.25, 0.92 + this.nocturnalWildlifeCount * 0.08)
            : 0.85;
        this.playNocturnalAmbientCue(cue, intensity);
        this.nocturnalStep += 1;
      }
      this.scheduleNextNocturnalCue();
    }, delayMs);
  }

  public dispose(): void {
    this.stopAmbientMusic();
    if (this.visibilityListenerAttached && typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this.handleVisibilityChange);
      this.visibilityListenerAttached = false;
    }
    if (this.ctx) {
      void this.ctx.close().catch(() => {});
      this.ctx = null;
      this.masterGain = null;
      this.musicGain = null;
      this.sfxGain = null;
      this.ambientGain = null;
    }
  }

  public playSfx(
    kind:
      | 'till'
      | 'plant'
      | 'water'
      | 'refill'
      | 'harvest'
      | 'clear'
      | 'place'
      | 'coin'
      | 'click'
      | 'hurt'
      | 'defend'
      | 'morning'
      | 'error'
      | 'combo'
      | 'treasure'
      | 'dash'
      | 'fish'
      | 'levelup'
      | 'wish'
      | 'bark'
      | 'pet',
    comboLevel = 2
  ): void {
    this.init();
    if (this.muted || !this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    const pitchJitter = 0.94 + Math.random() * 0.12;

    if (kind === 'click') {
      this.tone(440 * pitchJitter, 560, 0.055, 'triangle', 0.12, now);
      return;
    }
    if (kind === 'error') {
      this.tone(210, 165, 0.11, 'sine', 0.14, now);
      return;
    }
    if (kind === 'dash') {
      this.noiseBurst(0.08, 1200, 0.08, now);
      this.tone(320, 520, 0.07, 'sine', 0.09, now);
      return;
    }
    if (kind === 'fish') {
      this.noiseBurst(0.14, 1800, 0.18, now);
      this.tone(440, 660, 0.12, 'sine', 0.18, now + 0.05);
      this.tone(660, 990, 0.15, 'triangle', 0.2, now + 0.14);
      return;
    }
    if (kind === 'levelup') {
      this.tone(523.25, 523.25, 0.09, 'triangle', 0.22, now);
      this.tone(659.25, 659.25, 0.09, 'triangle', 0.22, now + 0.08);
      this.tone(783.99, 783.99, 0.09, 'triangle', 0.22, now + 0.16);
      this.tone(1046.5, 1318.5, 0.28, 'sine', 0.26, now + 0.24);
      return;
    }
    if (kind === 'wish') {
      this.tone(659.25, 880, 0.14, 'sine', 0.18, now);
      this.tone(987.77, 1318.5, 0.22, 'sine', 0.2, now + 0.1);
      return;
    }
    if (kind === 'bark') {
      this.tone(280, 180, 0.08, 'sawtooth', 0.15, now);
      this.tone(320, 210, 0.09, 'sawtooth', 0.16, now + 0.11);
      return;
    }
    if (kind === 'pet') {
      this.tone(587.33 * pitchJitter, 783.99, 0.09, 'sine', 0.17, now);
      this.tone(783.99 * pitchJitter, 1046.5, 0.14, 'triangle', 0.16, now + 0.08);
      return;
    }
    if (kind === 'combo') {
      const mult = Math.min(1.8, 1 + (comboLevel - 1) * 0.12);
      this.tone(523.25 * mult, 659.25 * mult, 0.1, 'triangle', 0.22, now);
      this.tone(783.99 * mult, 1046.5 * mult, 0.16, 'sine', 0.22, now + 0.06);
      return;
    }
    if (kind === 'treasure') {
      this.tone(659.25, 659.25, 0.08, 'triangle', 0.2, now);
      this.tone(880.0, 880.0, 0.08, 'triangle', 0.2, now + 0.07);
      this.tone(1174.66, 1318.51, 0.24, 'sine', 0.24, now + 0.14);
      return;
    }
    if (kind === 'till') {
      this.tone(160 * pitchJitter, 85, 0.11, 'triangle', 0.28, now);
      this.noiseBurst(0.08, 700, 0.14, now);
      return;
    }
    if (kind === 'plant') {
      this.tone(320 * pitchJitter, 480, 0.08, 'sine', 0.18, now);
      return;
    }
    if (kind === 'water' || kind === 'refill') {
      this.noiseBurst(0.16, 1500, 0.16, now);
      this.tone(520 * pitchJitter, 760, 0.11, 'sine', 0.14, now + 0.03);
      return;
    }
    if (kind === 'harvest') {
      this.tone(523.25, 659.25, 0.12, 'triangle', 0.22, now);
      this.tone(783.99, 1046.5, 0.18, 'sine', 0.2, now + 0.07);
      return;
    }
    if (kind === 'clear') {
      this.tone(220 * pitchJitter, 110, 0.1, 'square', 0.12, now);
      this.noiseBurst(0.06, 900, 0.12, now);
      return;
    }
    if (kind === 'place') {
      this.tone(240 * pitchJitter, 140, 0.1, 'triangle', 0.24, now);
      return;
    }
    if (kind === 'coin') {
      this.tone(987.77, 987.77, 0.07, 'sine', 0.18, now);
      this.tone(1318.51, 1318.51, 0.18, 'sine', 0.2, now + 0.06);
      return;
    }
    if (kind === 'defend') {
      this.tone(290 * pitchJitter, 160, 0.12, 'sawtooth', 0.14, now);
      return;
    }
    if (kind === 'hurt') {
      this.tone(160, 75, 0.22, 'sawtooth', 0.22, now);
      return;
    }
    if (kind === 'morning') {
      this.tone(392.0, 392.0, 0.15, 'triangle', 0.18, now);
      this.tone(493.88, 493.88, 0.15, 'triangle', 0.18, now + 0.11);
      this.tone(587.33, 587.33, 0.15, 'triangle', 0.18, now + 0.22);
      this.tone(783.99, 783.99, 0.32, 'sine', 0.22, now + 0.33);
    }
  }

  public playBlindCue(
    cue: 'bump' | 'beacon' | 'ripe' | 'dry' | 'danger' | 'scan' | 'toggle_on' | 'toggle_off'
  ): void {
    this.init();
    if (this.muted || !this.ctx || !this.sfxGain) return;
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    const now = this.ctx.currentTime;
    if (cue === 'toggle_on') {
      this.tone(440, 587.33, 0.1, 'sine', 0.18, now);
      this.tone(659.25, 880, 0.14, 'sine', 0.2, now + 0.08);
      return;
    }
    if (cue === 'toggle_off') {
      this.tone(659.25, 440, 0.1, 'sine', 0.16, now);
      this.tone(440, 329.63, 0.12, 'sine', 0.14, now + 0.08);
      return;
    }
    if (cue === 'bump') {
      this.tone(130, 85, 0.09, 'triangle', 0.2, now);
      return;
    }
    if (cue === 'ripe') {
      this.tone(783.99, 1046.5, 0.12, 'sine', 0.16, now);
      return;
    }
    if (cue === 'dry') {
      this.tone(349.23, 293.66, 0.11, 'triangle', 0.13, now);
      return;
    }
    if (cue === 'danger') {
      this.tone(240, 180, 0.12, 'sawtooth', 0.14, now);
      this.tone(240, 180, 0.12, 'sawtooth', 0.14, now + 0.15);
      return;
    }
    if (cue === 'beacon') {
      this.tone(587.33, 587.33, 0.08, 'sine', 0.14, now);
      this.tone(880, 880, 0.12, 'sine', 0.16, now + 0.09);
      return;
    }
    // 'scan'
    this.tone(523.25, 659.25, 0.08, 'sine', 0.12, now);
  }

  private tone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    startTime: number,
    targetGain: GainNode | null = this.sfxGain
  ): void {
    if (!this.ctx || !targetGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freqStart, startTime);
    if (freqEnd !== freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);
    }
    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
    osc.connect(gain);
    gain.connect(targetGain);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.02);
  }

  private noiseBurst(
    duration: number,
    cutoffHz: number,
    volume: number,
    startTime: number,
    targetGain: GainNode | null = this.sfxGain,
    q = 1.2
  ): void {
    if (!this.ctx || !targetGain) return;
    const sampleRate = this.ctx.sampleRate;
    const length = Math.floor(sampleRate * duration);
    const buffer = this.ctx.createBuffer(1, length, sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = cutoffHz;
    filter.Q.value = q;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(targetGain);
    src.start(startTime);
    src.stop(startTime + duration + 0.02);
  }
}

export const audioEngine = new CozyAudioEngine();
