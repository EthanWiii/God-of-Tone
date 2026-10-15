// Single-pitch estimation with the YIN algorithm.
// Monophonic only: for chords this returns (roughly) the strongest pitch.
// TODO: swap in a polyphonic model (e.g. Spotify basic-pitch) for chord passages.

const MIN_HZ = 60;   // below drop-C low string
const MAX_HZ = 1400; // ~ fret 22 on the high e

export function hzToMidi(hz) {
  return 69 + 12 * Math.log2(hz / 440);
}

/**
 * @param {Float32Array} frame
 * @param {number} sampleRate
 * @returns {{ hz: number, midi: number, confidence: number } | null}
 */
export function yin(frame, sampleRate, threshold = 0.15) {
  const maxTau = Math.min(Math.floor(sampleRate / MIN_HZ), Math.floor(frame.length / 2));
  const minTau = Math.floor(sampleRate / MAX_HZ);
  const diff = new Float32Array(maxTau);

  for (let tau = 1; tau < maxTau; tau++) {
    let sum = 0;
    for (let i = 0; i < maxTau; i++) {
      const d = frame[i] - frame[i + tau];
      sum += d * d;
    }
    diff[tau] = sum;
  }

  // Cumulative mean normalised difference
  const cmnd = new Float32Array(maxTau);
  cmnd[0] = 1;
  let running = 0;
  for (let tau = 1; tau < maxTau; tau++) {
    running += diff[tau];
    cmnd[tau] = running ? (diff[tau] * tau) / running : 1;
  }

  let tau = -1;
  for (let t = minTau; t < maxTau; t++) {
    if (cmnd[t] < threshold) {
      while (t + 1 < maxTau && cmnd[t + 1] < cmnd[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // Parabolic interpolation for sub-sample accuracy
  const a = cmnd[tau - 1] ?? cmnd[tau];
  const b = cmnd[tau];
  const c = cmnd[tau + 1] ?? cmnd[tau];
  const shift = (a - c) / (2 * (a - 2 * b + c) || 1);
  const hz = sampleRate / (tau + shift);
  return { hz, midi: hzToMidi(hz), confidence: 1 - b };
}

/** Pitch of the note starting at `onset`, skipping the pick attack. */
export function pitchAt(samples, sampleRate, onset) {
  const frameSize = 4096;
  const start = Math.floor((onset + 0.03) * sampleRate);
  const frame = samples.subarray(start, start + frameSize);
  if (frame.length < frameSize) return null;
  return yin(frame, sampleRate);
}

/**
 * Pitch over time between two points (for bends, vibrato, slides).
 * Fairly expensive, so it is only computed for notes that need a technique check.
 * @returns {{ time: number, midi: number|null }[]}
 */
export function pitchContour(samples, sampleRate, from, to, hopSec = 0.02) {
  const frameSize = 2048;
  const contour = [];
  const end = Math.min(to, from + 3) * sampleRate;
  for (let s = Math.floor(from * sampleRate); s + frameSize <= Math.min(end, samples.length); s += Math.floor(hopSec * sampleRate)) {
    const p = yin(samples.subarray(s, s + frameSize), sampleRate);
    contour.push({ time: s / sampleRate, midi: p ? p.midi : null });
  }
  return contour;
}
