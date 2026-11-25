export type SoundProfile = 'off' | 'click' | 'thock' | 'soft';

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  if (!audioCtx) {
    audioCtx = new Ctx();
  }
  if (audioCtx.state === 'suspended') {
    void audioCtx.resume();
  }
  return audioCtx;
}

export function playKeySound(profile: SoundProfile, volume: number, isError = false): void {
  if (profile === 'off' || volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const clampedVol = Math.max(0.01, Math.min(1, volume)) * 0.16;

    if (isError) {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(95, now + 0.06);
      gain.gain.setValueAtTime(clampedVol * 0.9, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.065);
    } else if (profile === 'click') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(920, now);
      osc.frequency.exponentialRampToValueAtTime(340, now + 0.025);
      gain.gain.setValueAtTime(clampedVol, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    } else if (profile === 'thock') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.04);
      gain.gain.setValueAtTime(clampedVol * 1.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.045);
    } else {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(520, now);
      osc.frequency.exponentialRampToValueAtTime(280, now + 0.02);
      gain.gain.setValueAtTime(clampedVol * 0.6, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);
    }

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.07);
  } catch {
    // Ignore audio context autoplay errors safely
  }
}
