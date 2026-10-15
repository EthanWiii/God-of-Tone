// Camera / audio-interface selection and the live input stream.

/** Lists cameras and audio inputs. Labels are only available after permission is granted. */
export async function listDevices() {
  const devices = await navigator.mediaDevices.enumerateDevices();
  return {
    cameras: devices.filter((d) => d.kind === 'videoinput'),
    audioInputs: devices.filter((d) => d.kind === 'audioinput'),
  };
}

/**
 * Opens the input stream. Browser voice processing is switched off:
 * echo cancellation / noise suppression / auto gain would mangle a guitar signal.
 */
export async function openStream({ cameraId, audioId, withVideo }) {
  return navigator.mediaDevices.getUserMedia({
    video: withVideo
      ? { deviceId: cameraId ? { exact: cameraId } : undefined, width: { ideal: 1280 }, height: { ideal: 720 } }
      : false,
    audio: {
      deviceId: audioId ? { exact: audioId } : undefined,
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      channelCount: { ideal: 2 },
      sampleRate: { ideal: 48000 },
    },
  });
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}
