// Records one take (video + audio) from a live stream, with an optional count-in.

const MIME_CANDIDATES = [
  'video/mp4;codecs=avc1,mp4a.40.2',
  'video/mp4',
  'video/webm;codecs=vp9,opus',
  'video/webm',
];
const AUDIO_ONLY_MIME = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];

function pickMime(withVideo) {
  const list = withVideo ? MIME_CANDIDATES : AUDIO_ONLY_MIME;
  return list.find((m) => MediaRecorder.isTypeSupported(m)) ?? '';
}

export class TakeRecorder {
  constructor() {
    this.mediaRecorder = null;
    this.chunks = [];
    this.audioCtx = null;
    this.startedAt = 0;
    this.tabStartOffset = 0;
  }

  get isRecording() {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Starts recording. If countIn is given, clicks one bar at the tab tempo
   * and remembers where the tab's beat 1 falls inside the recording.
   * @param {MediaStream} stream
   * @param {{ countIn?: { bpm: number, beats: number }, onCount?: (n: number|null) => void }} options
   */
  async start(stream, { countIn, onCount } = {}) {
    const withVideo = stream.getVideoTracks().length > 0;
    const mimeType = pickMime(withVideo);
    this.chunks = [];
    this.mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    this.mediaRecorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);

    await new Promise((resolve) => {
      this.mediaRecorder.onstart = resolve;
      this.mediaRecorder.start(1000);
    });
    this.startedAt = performance.now();
    this.tabStartOffset = 0;

    if (countIn) {
      this.tabStartOffset = await this.#playCountIn(countIn, onCount);
    }
  }

  /** @returns {Promise<{ blob: Blob, mimeType: string, durationSec: number, tabStartOffset: number|null }>} */
  stop() {
    return new Promise((resolve) => {
      const mimeType = this.mediaRecorder.mimeType;
      this.mediaRecorder.onstop = () => {
        resolve({
          blob: new Blob(this.chunks, { type: mimeType }),
          mimeType,
          durationSec: (performance.now() - this.startedAt) / 1000,
          tabStartOffset: this.tabStartOffset || null,
        });
      };
      this.mediaRecorder.stop();
    });
  }

  /** Plays click sounds; resolves with the offset (seconds into the recording) of the tab's first beat. */
  async #playCountIn({ bpm, beats }, onCount) {
    this.audioCtx ??= new AudioContext();
    const ctx = this.audioCtx;
    await ctx.resume();
    const beatSec = 60 / bpm;
    const t0 = ctx.currentTime + 0.1;

    for (let i = 0; i < beats; i++) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = i === 0 ? 1500 : 1000;
      gain.gain.setValueAtTime(0.6, t0 + i * beatSec);
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + i * beatSec + 0.05);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + i * beatSec);
      osc.stop(t0 + i * beatSec + 0.06);
      setTimeout(() => onCount?.(i + 1), (t0 - ctx.currentTime + i * beatSec) * 1000);
    }

    const firstBeatDelaySec = t0 - ctx.currentTime + beats * beatSec;
    setTimeout(() => onCount?.(null), firstBeatDelaySec * 1000);
    // TODO: subtract measured input/output latency of the audio interface (calibration step).
    return (performance.now() - this.startedAt) / 1000 + firstBeatDelaySec;
  }
}
