// Opens the camera with graceful degradation, and turns the many ways
// getUserMedia can fail into something a person can act on.

const SIZE = { width: { ideal: 1280 }, height: { ideal: 720 } };

const isDenied = (err) =>
  ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'].includes(err?.name);

// Which failure to report when every attempt failed. Permission problems win
// (they're the ones the person can fix), then "busy", then "not found".
const PRIORITY = [
  ['NotAllowedError', 'PermissionDeniedError', 'SecurityError'],
  ['NotReadableError', 'TrackStartError', 'AbortError'],
  ['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'],
  ['NotSupportedError', 'TypeError'],
];

function mostUseful(errors) {
  for (const names of PRIORITY) {
    const hit = errors.find((e) => names.includes(e?.name));
    if (hit) return hit;
  }
  return errors[errors.length - 1] || new Error('Camera unavailable');
}

// Tries, in order:
//   1. the exact device the person (or the built-in-camera detection) chose
//   2. any camera facing `facingMode` at 1280x720, with mic
//   3. the same without the mic — so a blocked or missing microphone never
//      costs the person their camera
//   4. whatever camera the browser will give us
// Resolves { stream, audio } where `audio` says whether a mic track made it.
export async function openCameraStream({ deviceId = '', facingMode = 'user' } = {}) {
  const md = typeof navigator !== 'undefined' ? navigator.mediaDevices : null;
  if (!md?.getUserMedia) {
    const err = new Error('Camera API unavailable');
    err.name = 'NotSupportedError';
    throw err;
  }

  const attempts = [];
  if (deviceId) {
    attempts.push({ audio: true, constraints: { video: { deviceId: { exact: deviceId }, ...SIZE }, audio: true } });
  }
  attempts.push({ audio: true, constraints: { video: { ...SIZE, facingMode }, audio: true } });
  attempts.push({ audio: false, constraints: { video: { ...SIZE, facingMode }, audio: false } });
  attempts.push({ audio: false, constraints: { video: true, audio: false } });

  const errors = [];
  for (const attempt of attempts) {
    try {
      const stream = await md.getUserMedia(attempt.constraints);
      return { stream, audio: attempt.audio && stream.getAudioTracks().length > 0 };
    } catch (err) {
      errors.push(err);
      // Denied even with no mic requested = the camera itself is blocked.
      // Stop here rather than re-prompting on every remaining attempt.
      if (!attempt.audio && isDenied(err)) break;
    }
  }
  throw mostUseful(errors);
}

export function describeCameraError(err) {
  const name = err?.name || '';
  if (isDenied(err)) {
    return {
      kind: 'denied',
      message: 'Camera access is blocked.',
      hint: 'Tap the button and choose Allow. If nothing appears, open the lock icon in your browser’s address bar and allow Camera.',
    };
  }
  if (['NotReadableError', 'TrackStartError', 'AbortError'].includes(name)) {
    return {
      kind: 'busy',
      message: 'Your camera is in use.',
      hint: 'Another app or browser tab may be using it. Close it, then try again.',
    };
  }
  if (['NotFoundError', 'DevicesNotFoundError', 'OverconstrainedError'].includes(name)) {
    return { kind: 'notfound', message: 'No camera was found on this device.', hint: 'You can still upload a video from your gallery.' };
  }
  if (name === 'NotSupportedError' || name === 'TypeError') {
    return {
      kind: 'unsupported',
      message: 'This browser can’t open the camera here.',
      hint: 'Camera access needs a secure (https) connection and an up-to-date browser.',
    };
  }
  return { kind: 'unknown', message: 'The camera couldn’t be started.', hint: 'Try again, or upload a video from your gallery.' };
}
