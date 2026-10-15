// Matches detected notes to expected tab events.
//
// Sequence alignment (Needleman-Wunsch style): every expected event is either
// matched to one detected note or marked missed; every unmatched detection is
// an extra note. The cost mixes pitch agreement and time distance, and the time
// mapping (offset + tempo ratio) is re-estimated after a first pass so that a
// take played slower/faster than the tab still lines up.

const MISS_COST = 1.0;
const EXTRA_COST = 0.8;

/** 0 = right pitch, 0.4 = octave error (common pitch-tracker mistake), 1 = wrong. */
export function pitchCost(event, detected) {
  if (detected.midi == null) return 0.6;
  const played = Math.round(detected.midi);
  if (event.notes.some((n) => n.midi === played)) return 0;
  if (event.notes.some((n) => Math.abs(n.midi - played) % 12 === 0)) return 0.4;
  return 1;
}

function timeCost(event, detected, map) {
  return Math.min(1, Math.abs(detected.time - map(event.time)) / 0.3);
}

function alignOnce(events, detected, map) {
  const n = events.length;
  const m = detected.length;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1));
  const move = Array.from({ length: n + 1 }, () => new Uint8Array(m + 1)); // 1 match, 2 miss, 3 extra

  for (let i = 1; i <= n; i++) { cost[i][0] = i * MISS_COST; move[i][0] = 2; }
  for (let j = 1; j <= m; j++) { cost[0][j] = j * EXTRA_COST; move[0][j] = 3; }

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const match = cost[i - 1][j - 1] + pitchCost(events[i - 1], detected[j - 1]) + timeCost(events[i - 1], detected[j - 1], map);
      const miss = cost[i - 1][j] + MISS_COST;
      const extra = cost[i][j - 1] + EXTRA_COST;
      if (match <= miss && match <= extra) { cost[i][j] = match; move[i][j] = 1; }
      else if (miss <= extra) { cost[i][j] = miss; move[i][j] = 2; }
      else { cost[i][j] = extra; move[i][j] = 3; }
    }
  }

  const pairs = new Array(n).fill(null); // pairs[eventIndex] = detectedIndex
  for (let i = n, j = m; i > 0 || j > 0;) {
    const mv = move[i][j];
    if (mv === 1) { pairs[i - 1] = j - 1; i--; j--; }
    else if (mv === 2) i--;
    else j--;
  }
  return pairs;
}

/** Least-squares fit detected = slope * expected + offset over well-matched pairs. */
function fitLine(points) {
  if (points.length < 2) return null;
  const mx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const my = points.reduce((s, p) => s + p.y, 0) / points.length;
  let num = 0;
  let den = 0;
  for (const p of points) {
    num += (p.x - mx) * (p.y - my);
    den += (p.x - mx) ** 2;
  }
  if (den === 0) return null;
  const slope = num / den;
  return { slope, offset: my - slope * mx };
}

/**
 * @param {import('../tab/expectedNotes.js').ExpectedEvent[]} events times relative to the practice range start
 * @param {{ time: number, midi: number|null }[]} detected
 * @param {{ offset: number|null }} options offset = where the tab starts in the recording, if known
 */
export function alignTake(events, detected, { offset = null } = {}) {
  if (events.length === 0 || detected.length === 0) {
    return { pairs: new Array(events.length).fill(null), fit: null };
  }

  let fit = { slope: 1, offset: offset ?? detected[0].time - events[0].time };
  let pairs = null;
  for (let pass = 0; pass < 2; pass++) {
    const map = (t) => fit.slope * t + fit.offset;
    pairs = alignOnce(events, detected, map);
    const good = [];
    pairs.forEach((j, i) => {
      if (j !== null && pitchCost(events[i], detected[j]) <= 0.4) good.push({ x: events[i].time, y: detected[j].time });
    });
    fit = fitLine(good) ?? fit;
  }
  return { pairs, fit };
}

export { fitLine };
