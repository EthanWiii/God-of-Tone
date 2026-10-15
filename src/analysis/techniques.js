// Technique checks for notes the tab marks with a technique.
//
// The tab tells us what *should* happen, so these are verifications, not
// open-ended detection. Each checker gets the note's pitch contour and returns
// { technique, status: 'ok'|'issue'|'not-checked', message }.
//
// Plan (see README):
//   - bend, vibrato, slide: rules on the pitch contour (bend implemented as the example)
//   - palm mute, harmonics, picked vs legato: small trained audio classifier (TODO)

import { pitchContour } from './pitch.js';

const checkers = {
  bend(note, contour, startMidi) {
    const target = note.bend?.semitones ?? 0;
    const pitches = contour.map((p) => p.midi).filter((m) => m != null);
    if (!target || pitches.length < 3) return { status: 'not-checked', message: 'Not enough pitch data' };
    const reached = Math.max(...pitches) - startMidi;
    const centsOff = Math.round((reached - target) * 100);
    if (Math.abs(centsOff) <= 25) return { status: 'ok', message: `Bend reached target (${centsOff >= 0 ? '+' : ''}${centsOff} cents)` };
    return { status: 'issue', message: `Bend ${Math.abs(centsOff)} cents ${centsOff < 0 ? 'flat' : 'sharp'}` };
  },
  vibrato: () => ({ status: 'not-checked', message: 'TODO: measure rate (Hz) and width (cents) of the pitch wobble' }),
  slide: () => ({ status: 'not-checked', message: 'TODO: check for a continuous pitch glide without a new attack' }),
  legato: () => ({ status: 'not-checked', message: 'TODO: check for a missing pick transient (classifier)' }),
  'palm-mute': () => ({ status: 'not-checked', message: 'TODO: classifier (short decay, fewer highs)' }),
  harmonic: () => ({ status: 'not-checked', message: 'TODO: classifier (spectral shape)' }),
};

/**
 * @param {object[]} eventResults from scoreTake
 * @param {Float32Array} samples
 * @param {number} sampleRate
 */
export function checkTechniques(eventResults, samples, sampleRate) {
  const results = [];
  eventResults.forEach((r, i) => {
    if (!r.detected) return;
    const next = eventResults.slice(i + 1).find((x) => x.detected)?.detected.time ?? r.detected.time + 1;
    let contour = null;

    for (const note of r.event.notes) {
      for (const technique of note.techniques) {
        const checker = checkers[technique];
        if (!checker) continue;
        contour ??= pitchContour(samples, sampleRate, r.detected.time + 0.03, next);
        const startMidi = note.midi; // the fretted (unbent) pitch from the tab
        results.push({ barIndex: r.event.barIndex, note, technique, ...checker(note, contour, startMidi) });
      }
    }
  });
  return results;
}
