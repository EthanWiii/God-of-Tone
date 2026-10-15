// Turns an alphaTab Score into a flat, time-stamped list of what should be played.
//
// One "event" per beat that starts new sound (a single note or a chord).
// TODO: repeats / alternate endings are not unrolled yet - the tab is read
//       straight through once. alphaTab's MidiFileGenerator could provide the
//       real playback order.

const TICKS_PER_QUARTER = 960; // alphaTab's MIDI resolution

/**
 * @typedef {Object} ExpectedNote
 * @property {object} note       alphaTab Note (kept so the tab can be coloured later)
 * @property {number} midi       pitch as a MIDI number
 * @property {number} string     1 = high e (alphaTab counts from the lowest string, converted here)
 * @property {number} fret
 * @property {string[]} techniques e.g. ['bend', 'vibrato']
 * @property {object|null} bend  { semitones } when the note is bent
 *
 * @typedef {Object} ExpectedEvent
 * @property {number} time       seconds from the start of the tab
 * @property {number} duration   seconds
 * @property {number} barIndex
 * @property {number} bpm        tab tempo at this beat
 * @property {ExpectedNote[]} notes
 */

/** Builds a tick -> seconds converter from the master bars' tempo changes. */
export function buildTempoMap(score) {
  const changes = []; // { tick, bpm }
  let bpm = score.tempo;
  changes.push({ tick: 0, bpm });
  for (const masterBar of score.masterBars) {
    const length = masterBar.calculateDuration();
    for (const automation of masterBar.tempoAutomations ?? []) {
      changes.push({
        tick: masterBar.start + automation.ratioPosition * length,
        bpm: automation.value,
      });
    }
  }
  changes.sort((a, b) => a.tick - b.tick);

  // Pre-compute the time (seconds) at which each tempo segment begins.
  let seconds = 0;
  for (let i = 0; i < changes.length; i++) {
    if (i > 0) {
      const prev = changes[i - 1];
      seconds += ((changes[i].tick - prev.tick) / TICKS_PER_QUARTER) * (60 / prev.bpm);
    }
    changes[i].seconds = seconds;
  }

  const tickToSeconds = (tick) => {
    let seg = changes[0];
    for (const c of changes) {
      if (c.tick <= tick) seg = c;
      else break;
    }
    return seg.seconds + ((tick - seg.tick) / TICKS_PER_QUARTER) * (60 / seg.bpm);
  };

  const bpmAt = (tick) => {
    let current = changes[0].bpm;
    for (const c of changes) {
      if (c.tick <= tick) current = c.bpm;
      else break;
    }
    return current;
  };

  return { tickToSeconds, bpmAt };
}

function techniquesOf(note) {
  const list = [];
  if (note.hasBend) list.push('bend');
  if (note.vibrato) list.push('vibrato');
  if (note.slideOutType) list.push('slide');
  if (note.isHammerPullOrigin || note.isHammerPullDestination) list.push('legato');
  if (note.isPalmMute) list.push('palm-mute');
  if (note.harmonicType) list.push('harmonic');
  if (note.isLetRing) list.push('let-ring');
  return list;
}

/**
 * @param {object} score alphaTab Score
 * @param {number} trackIndex
 * @returns {{ events: ExpectedEvent[], tempo: number, timeSignature: [number, number], barCount: number }}
 */
export function extractExpectedEvents(score, trackIndex) {
  const track = score.tracks[trackIndex];
  const staff = track.staves[0];
  const { tickToSeconds, bpmAt } = buildTempoMap(score);
  const stringCount = staff.tuning?.length ?? 6;

  const events = [];
  staff.bars.forEach((bar, barIndex) => {
    for (const voice of bar.voices) {
      for (const beat of voice.beats) {
        if (beat.isRest || beat.notes.length === 0) continue;

        // Tied notes continue an earlier note, dead notes have no pitch: neither is a new pitched attack.
        const notes = beat.notes
          .filter((n) => !n.isTieDestination && !n.isDead)
          .map((n) => ({
            note: n,
            midi: n.realValue,
            string: stringCount - n.string + 1,
            fret: n.fret,
            techniques: techniquesOf(n),
            bend: n.hasBend && n.maxBendPoint
              ? { semitones: n.maxBendPoint.value / 2 } // bend values are in quarter tones
              : null,
          }));
        if (notes.length === 0) continue;

        const startTick = beat.absolutePlaybackStart;
        const time = tickToSeconds(startTick);
        events.push({
          time,
          duration: tickToSeconds(startTick + beat.playbackDuration) - time,
          barIndex,
          bpm: bpmAt(startTick),
          notes,
        });
      }
    }
  });

  events.sort((a, b) => a.time - b.time);
  const first = score.masterBars[0];
  return {
    events,
    tempo: score.tempo,
    timeSignature: [first.timeSignatureNumerator, first.timeSignatureDenominator],
    barCount: score.masterBars.length,
  };
}
