// Full analysis of one take: audio -> detected notes -> alignment -> score -> technique checks.

import { decodeToMono } from './audio.js';
import { detectOnsets } from './onsets.js';
import { pitchAt } from './pitch.js';
import { alignTake } from './align.js';
import { scoreTake } from './score.js';
import { checkTechniques } from './techniques.js';

/**
 * Restricts the tab to the practised bars and converts to practice speed.
 * Times become relative to the first practised bar.
 */
export function prepareEvents(allEvents, { fromBar, toBar, speed }) {
  const inRange = allEvents.filter((e) => e.barIndex >= fromBar && e.barIndex <= toBar);
  if (inRange.length === 0) return [];
  const start = inRange[0].time;
  return inRange.map((e) => ({
    ...e,
    time: (e.time - start) / speed,
    duration: e.duration / speed,
    targetBpm: e.bpm * speed,
  }));
}

/**
 * @param {import('../recording/takeStore.js').Take} take
 * @param {object[]} events from prepareEvents
 * @param {{ channel: string }} options
 */
export async function analyzeTake(take, events, { channel = 'mix' } = {}) {
  const { samples, sampleRate } = await decodeToMono(take.blob, channel);

  const onsets = detectOnsets(samples, sampleRate);
  const detected = onsets.map((time) => {
    const p = pitchAt(samples, sampleRate, time);
    return { time, midi: p?.midi ?? null, confidence: p?.confidence ?? 0 };
  });

  const offset = take.tabStartOffset; // known when a count-in was used
  const alignment = alignTake(events, detected, { offset });
  const result = scoreTake(events, detected, alignment, { offset });
  const techniques = checkTechniques(result.eventResults, samples, sampleRate);

  return { ...result, detected, techniques };
}
