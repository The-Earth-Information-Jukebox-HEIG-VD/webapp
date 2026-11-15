/**
 * iOS audio-session helpers.
 *
 * WebKit on iOS (Safari and every other iOS browser) puts Web Audio in the
 * "ambient" audio-session category, which the silent/ringer switch mutes: the
 * AudioContext runs, the timeline moves, but nothing is heard. Media elements
 * use the "playback" category instead and ignore the switch.
 *
 * - Safari 16.4+ exposes `navigator.audioSession`: setting its type to
 *   'playback' is enough.
 * - Older iOS: playing a (silent) <audio> element from a user gesture moves the
 *   whole page to the "playback" category, which also un-mutes Web Audio.
 */

interface AudioSessionLike {
  type: string;
}

function audioSession(): AudioSessionLike | null {
  if (typeof navigator === 'undefined') return null;
  const session = (navigator as Navigator & { audioSession?: AudioSessionLike }).audioSession;
  return session ?? null;
}

/** True on iPhone/iPad/iPod, including iPadOS which reports itself as a Mac. */
function isIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent ?? '';
  return /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Ask for the "playback" audio session (not muted by the silent switch).
 * @returns true if the Audio Session API was available and accepted the type
 */
export function requestPlaybackSession(): boolean {
  const session = audioSession();
  if (!session) return false;
  try {
    session.type = 'playback';
    return true;
  } catch {
    return false;
  }
}

/** 0.5 s of 8-bit mono silence at 8 kHz, as a WAV Blob (no asset file needed). */
function silentWav(): Blob {
  const sampleRate = 8000;
  const samples = sampleRate / 2;
  const view = new DataView(new ArrayBuffer(44 + samples));
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true); // fmt chunk size
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true); // byte rate
  view.setUint16(32, 1, true); // block align
  view.setUint16(34, 8, true); // bits per sample
  text(36, 'data');
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i++) view.setUint8(44 + i, 128); // 8-bit silence
  return new Blob([view.buffer], { type: 'audio/wav' });
}

/**
 * Looping silent <audio> element for iOS versions without the Audio Session
 * API. Inactive (no-op) everywhere else. `play()` must be called synchronously
 * inside the user gesture.
 */
export class SilentKeepAlive {
  private el: HTMLAudioElement | null = null;
  private url: string | null = null;
  private readonly enabled: boolean;

  constructor() {
    this.enabled = isIOS() && !audioSession() && typeof Audio !== 'undefined';
  }

  play(): void {
    if (!this.enabled) return;
    try {
      if (!this.el) {
        this.url = URL.createObjectURL(silentWav());
        this.el = new Audio(this.url);
        this.el.loop = true;
        this.el.setAttribute('playsinline', '');
        this.el.setAttribute('aria-hidden', 'true');
      }
      const result = this.el.play();
      if (result && typeof result.catch === 'function') result.catch(() => undefined);
    } catch {
      /* best effort only */
    }
  }

  pause(): void {
    try {
      this.el?.pause();
    } catch {
      /* ignore */
    }
  }

  dispose(): void {
    this.pause();
    if (this.el) this.el.removeAttribute('src');
    this.el = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
