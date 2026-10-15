// Turns a take's analysis into short practice advice.
//
// Right now this is rule-based. The plan is to send the *measured* results
// (not the audio) to a language model for richer coaching and for spotting
// patterns across sessions.
// TODO: add a tiny local server (e.g. server/coach.js) that holds the API key
//       and forwards buildCoachPrompt(analysis) to the model - never put the
//       key in browser code.

export function coachNotes(analysis) {
  const notes = [];
  const { score, eventResults, barTempos, techniques } = analysis;
  const c = score.counts;

  if (c.missed + c.wrong > 0) {
    const bars = barsWith(eventResults, ['missed', 'wrong']);
    notes.push(`${c.wrong} wrong and ${c.missed} missed notes, mostly in bar${bars.length > 1 ? 's' : ''} ${bars.slice(0, 5).join(', ')}.`);
  }
  if (c.late > c.early * 2 && c.late > 2) notes.push(`You tend to play behind the beat (${c.late} late notes).`);
  if (c.early > c.late * 2 && c.early > 2) notes.push(`You tend to rush (${c.early} early notes).`);
  if (c.extra > 3) notes.push(`${c.extra} extra sounds detected - check for string noise or unmuted strings.`);

  const slow = barTempos.filter((b) => b.playedBpm < b.tabBpm * 0.93);
  if (slow.length) {
    notes.push(`Slowed down in bar${slow.length > 1 ? 's' : ''} ${slow.map((b) => b.barIndex + 1).slice(0, 5).join(', ')} - try looping those at a lower speed.`);
  }
  for (const t of techniques.filter((t) => t.status === 'issue').slice(0, 5)) {
    notes.push(`Bar ${t.barIndex + 1}: ${t.message}.`);
  }
  if (notes.length === 0) notes.push('Clean take - consider raising the speed.');
  return notes;
}

function barsWith(eventResults, statuses) {
  const bars = new Set(eventResults.filter((r) => statuses.includes(r.status)).map((r) => r.event.barIndex + 1));
  return [...bars].sort((a, b) => a - b);
}

/** Compact, model-friendly summary of a take (for the future language-model coach). */
export function buildCoachPrompt(analysis, { songTitle, speed }) {
  return JSON.stringify({
    song: songTitle,
    practiceSpeed: speed,
    score: analysis.score,
    barTempos: analysis.barTempos,
    problemNotes: analysis.eventResults
      .filter((r) => r.status !== 'correct')
      .map((r) => ({ bar: r.event.barIndex + 1, status: r.status, deviationMs: r.deviationMs && Math.round(r.deviationMs) })),
    techniques: analysis.techniques.map(({ barIndex, technique, status, message }) => ({ bar: barIndex + 1, technique, status, message })),
  });
}
