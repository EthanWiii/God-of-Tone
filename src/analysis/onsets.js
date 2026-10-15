// Note-start detection using spectral flux with an adaptive threshold.
// Works well on a clean DI signal; heavy distortion produces more false onsets.

import { fft, hannWindow } from './fft.js';

const FRAME = 2048;
const HOP = 512;

/**
 * SuperFlux-style onset detection: the previous spectrum is max-filtered across
 * frequency, so pitch glides (bends, vibrato, slides) don't count as new notes.
 * @param {Float32Array} samples
 * @param {number} sampleRate
 * @returns {number[]} onset times in seconds
 */
export function detectOnsets(samples, sampleRate, { delta = 0.08, minGapSec = 0.05 } = {}) {
  const window = hannWindow(FRAME);
  const bins = FRAME / 2;
  const LAG = 2; // compare with the spectrum 2 hops back
  const re = new Float32Array(FRAME);
  const im = new Float32Array(FRAME);
  const history = [];
  const flux = [];
  const energy = [];

  for (let start = 0; start + FRAME <= samples.length; start += HOP) {
    let e = 0;
    for (let i = 0; i < FRAME; i++) {
      const s = samples[start + i];
      re[i] = s * window[i];
      im[i] = 0;
      e += s * s;
    }
    fft(re, im);
    const mag = new Float32Array(bins);
    for (let k = 0; k < bins; k++) mag[k] = Math.log1p(100 * Math.hypot(re[k], im[k]));

    let f = 0;
    const prev = history.length >= LAG ? history[history.length - LAG] : null;
    if (prev) {
      for (let k = 0; k < bins; k++) {
        const ref = Math.max(prev[k - 1] ?? 0, prev[k], prev[k + 1] ?? 0, prev[k - 2] ?? 0, prev[k + 2] ?? 0);
        const d = mag[k] - ref;
        if (d > 0) f += d; // only rising energy counts
      }
    }
    history.push(mag);
    if (history.length > LAG) history.shift();
    flux.push(f);
    energy.push(Math.sqrt(e / FRAME));
  }

  const maxFlux = Math.max(...flux, 1e-9);
  const norm = flux.map((f) => f / maxFlux);
  const gate = Math.max(...energy, 0) * 0.02; // ignore near-silence
  const onsets = [];
  let lastOnset = -Infinity;

  for (let i = 1; i < norm.length; i++) {
    const lo = Math.max(0, i - 3);
    const hi = Math.min(norm.length, i + 4);
    let isPeak = true;
    for (let k = lo; k < hi; k++) if (norm[k] > norm[i]) isPeak = false;
    if (!isPeak) continue;

    const meanLo = Math.max(0, i - 10);
    let mean = 0;
    for (let k = meanLo; k < hi; k++) mean += norm[k];
    mean /= hi - meanLo;

    // Frame i spans [i*HOP, i*HOP + FRAME); the attack sits roughly in its second half.
    const t = (i * HOP + FRAME * 0.6) / sampleRate;
    if (norm[i] >= mean + delta && energy[Math.min(i + 2, energy.length - 1)] > gate && t - lastOnset >= minGapSec) {
      onsets.push(t);
      lastOnset = t;
    }
  }
  return onsets;
}
