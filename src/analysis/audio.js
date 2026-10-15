// Decodes a recorded / imported file into a mono Float32Array.

/**
 * @param {Blob} blob
 * @param {'mix'|'left'|'right'} channel which input carries the guitar
 * @returns {Promise<{ samples: Float32Array, sampleRate: number }>}
 */
export async function decodeToMono(blob, channel = 'mix') {
  const ctx = new OfflineAudioContext(1, 1, 48000);
  const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());

  let samples;
  if (buffer.numberOfChannels === 1 || channel === 'left') {
    samples = buffer.getChannelData(0).slice();
  } else if (channel === 'right') {
    samples = buffer.getChannelData(1).slice();
  } else {
    const l = buffer.getChannelData(0);
    const r = buffer.getChannelData(1);
    samples = new Float32Array(l.length);
    for (let i = 0; i < l.length; i++) samples[i] = (l[i] + r[i]) / 2;
  }
  return { samples, sampleRate: buffer.sampleRate };
}
