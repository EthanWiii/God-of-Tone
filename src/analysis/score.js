// Turns an alignment into per-note results, per-bar tempo and a take score.

import { pitchCost, fitLine } from './align.js';

export const TIMING_TOLERANCE_MS = 50;

/**
 * @param {object[]} events expected events (times relative to range start, already scaled by speed)
 * @param {object[]} detected detected notes
 * @param {{ pairs: (number|null)[], fit: object }} alignment
 * @param {{ offset: number|null }} options with a count-in, timing is judged against the strict click grid
 */
export function scoreTake(events, detected, alignment, { offset = null } = {}) {
  const { pairs, fit } = alignment;
  // With a count-in we know where every beat *should* be; otherwise judge against the take's own average tempo.
  const reference = offset != null ? (t) => t + offset : (t) => (fit ? fit.slope * t + fit.offset : t);

  const eventResults = events.map((event, i) => {
    const j = pairs[i];
    if (j === null) return { event, detected: null, status: 'missed', deviationMs: null };
    const d = detected[j];
    if (pitchCost(event, d) > 0.4) return { event, detected: d, status: 'wrong', deviationMs: null };
    const deviationMs = (d.time - reference(event.time)) * 1000;
    let status = 'correct';
    if (deviationMs > TIMING_TOLERANCE_MS) status = 'late';
    else if (deviationMs < -TIMING_TOLERANCE_MS) status = 'early';
    return { event, detected: d, status, deviationMs };
  });

  const matched = new Set(pairs.filter((j) => j !== null));
  const extras = detected.filter((_, j) => !matched.has(j));

  const count = (s) => eventResults.filter((r) => r.status === s).length;
  const total = events.length || 1;
  const rightPitch = count('correct') + count('late') + count('early');
  const pitchAccuracy = rightPitch / (total + extras.length * 0.5);
  const timingAccuracy = rightPitch ? count('correct') / rightPitch : 0;
  const deviations = eventResults.filter((r) => r.deviationMs != null).map((r) => Math.abs(r.deviationMs));

  return {
    eventResults,
    extras,
    barTempos: barTempos(eventResults),
    score: {
      overall: 100 * (0.6 * pitchAccuracy + 0.4 * timingAccuracy),
      pitchAccuracy: 100 * pitchAccuracy,
      timingAccuracy: 100 * timingAccuracy,
      meanDeviationMs: deviations.length ? deviations.reduce((a, b) => a + b, 0) / deviations.length : null,
      counts: { correct: count('correct'), late: count('late'), early: count('early'), wrong: count('wrong'), missed: count('missed'), extra: extras.length },
      playedTempoRatio: fit ? 1 / fit.slope : null,
    },
  };
}

/** Local tempo per bar from the matched notes in it (plus the first note of the next bar). */
function barTempos(eventResults) {
  const byBar = new Map();
  eventResults.forEach((r, i) => {
    if (!r.detected || r.status === 'wrong') return;
    const list = byBar.get(r.event.barIndex) ?? [];
    list.push(r);
    byBar.set(r.event.barIndex, list);
  });

  const result = [];
  const bars = [...byBar.keys()].sort((a, b) => a - b);
  for (const bar of bars) {
    const points = byBar.get(bar).map((r) => ({ x: r.event.time, y: r.detected.time }));
    const next = byBar.get(bar + 1)?.[0];
    if (next) points.push({ x: next.event.time, y: next.detected.time });
    const fit = fitLine(points);
    if (!fit || fit.slope <= 0) continue;
    const tabBpm = byBar.get(bar)[0].event.targetBpm;
    result.push({ barIndex: bar, tabBpm, playedBpm: tabBpm / fit.slope });
  }
  return result;
}
