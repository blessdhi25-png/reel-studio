// Reusable WebRTC helpers for 1:1 calls. Signaling (SDP + ICE exchange) is NOT done here:
// callers pass an `onIceCandidate` callback and ship SDP/ICE over their own channel
// (the app uses the existing authenticated Socket.IO connection; see context/CallContext.jsx).

// Public STUN. STUN alone can't connect peers behind symmetric NATs / strict mobile carriers —
// for those, provide a TURN server via NEXT_PUBLIC_TURN_URL / _USERNAME / _CREDENTIAL.
export function getIceServers() {
  const servers = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
  const url = process.env.NEXT_PUBLIC_TURN_URL;
  if (url) {
    servers.push({
      urls: url.split(',').map((u) => u.trim()),
      username: process.env.NEXT_PUBLIC_TURN_USERNAME,
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL,
    });
  }
  return servers;
}

export function isWebRtcSupported() {
  return typeof window !== 'undefined' && !!window.RTCPeerConnection && !!navigator.mediaDevices?.getUserMedia;
}

// Maps getUserMedia failures to a short, user-facing message.
export function describeMediaError(err, wantsVideo) {
  switch (err?.name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return `Allow ${wantsVideo ? 'camera and ' : ''}microphone access to make calls.`;
    case 'NotReadableError':
    case 'TrackStartError':
      return `Your ${wantsVideo ? 'camera or ' : ''}microphone is in use by another app.`;
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return `No ${wantsVideo ? 'camera or ' : ''}microphone found.`;
    default:
      return 'Could not access your microphone or camera.';
  }
}

// Which failures mean "the camera specifically", as far as the browser tells us.
export function classifyCameraIssue(err) {
  switch (err?.name) {
    case 'NotReadableError':
    case 'TrackStartError':
      return 'busy';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
    case 'OverconstrainedError':
      return 'missing';
    default:
      return 'denied'; // NotAllowedError / PermissionDeniedError / SecurityError / unknown
  }
}

export const CAMERA_ISSUE_MESSAGES = {
  denied: 'Camera permission denied on this device. Tap to retry or check browser settings.',
  busy: 'Your camera is in use by another app. Close it, then tap to retry.',
  missing: 'No camera found on this device. Connect one, then tap to retry.',
};

function videoConstraints() {
  const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
  // Prefer the camera the person picked elsewhere in the app (e.g. their laptop webcam rather than
  // a phone's Continuity Camera). `ideal`, so a since-unplugged device never fails the call.
  try {
    const stored = window.localStorage.getItem('preferredCameraDeviceId');
    if (stored) return { ...base, deviceId: { ideal: stored } };
  } catch {}
  return { ...base, facingMode: 'user' };
}

// Opens the mic (and camera for video calls) with ONE permission request:
//   getUserMedia({ audio, video })
// If a video call's camera can't be opened, falls back to mic-only so the call can still proceed,
// and reports why in `cameraIssue` so the UI can offer a retry. If the mic itself can't be opened
// the original error is thrown (a call without audio isn't useful).
// Resolves { stream, cameraIssue: null | 'denied' | 'busy' | 'missing' }.
export async function getLocalMedia(callType) {
  if (!isWebRtcSupported()) {
    const e = new Error('unsupported');
    e.name = 'UnsupportedError';
    throw e;
  }
  const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
  const wantsVideo = callType === 'video';
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio, video: wantsVideo ? videoConstraints() : false });
    return { stream, cameraIssue: null };
  } catch (err) {
    if (!wantsVideo) throw err;
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
    } catch {
      throw err; // mic is the problem too: report the original error
    }
    return { stream, cameraIssue: classifyCameraIssue(err) };
  }
}

// Re-ask for just the camera (after the person fixes permissions). Resolves a video track.
export async function getCameraTrack() {
  const s = await navigator.mediaDevices.getUserMedia({ video: videoConstraints(), audio: false });
  return s.getVideoTracks()[0];
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// One RTCPeerConnection + the glue around it.
//   onRemoteStream(stream)      remote media arrived
//   onIceCandidate(candidate)   send this to the other side
//   onConnectionState(state)    'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
export class CallPeer {
  constructor({ localStream, callType, onRemoteStream, onIceCandidate, onConnectionState }) {
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.pendingIce = []; // candidates that arrive before the remote description is set
    this.closed = false;
    this.remoteStream = new MediaStream();

    this.localStream = localStream;
    this.callType = callType;

    // Local tracks go on the connection BEFORE any SDP is generated.
    localStream?.getTracks().forEach((track) => this.pc.addTrack(track, localStream));

    // A video call with no camera yet (permission denied / still pending) still negotiates a video
    // line, so the camera can be attached later with replaceTrack and no renegotiation.
    if (callType === 'video' && !localStream?.getVideoTracks().length) {
      this.pc.addTransceiver('video', { direction: 'sendrecv' });
    }

    this.pc.ontrack = (e) => {
      // Build our own stream so audio-only and late-arriving tracks all land in one place.
      (e.streams[0]?.getTracks() || [e.track]).forEach((t) => {
        if (!this.remoteStream.getTracks().includes(t)) this.remoteStream.addTrack(t);
      });
      onRemoteStream?.(this.remoteStream);
    };
    this.pc.onicecandidate = (e) => {
      if (e.candidate) onIceCandidate?.(e.candidate.toJSON ? e.candidate.toJSON() : e.candidate);
    };
    this.pc.onconnectionstatechange = () => onConnectionState?.(this.pc.connectionState);
  }

  async createOffer() {
    const offer = await this.pc.createOffer();
    await this.pc.setLocalDescription(offer);
    return { type: offer.type, sdp: offer.sdp };
  }

  async acceptOffer(offer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    this._ensureLocalTracks();
    await this._flushIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
  }

  // After the remote offer is applied, make sure every local track is actually attached to a
  // sending transceiver (some browsers leave tracks added earlier on a separate, unmatched
  // transceiver) and that a video line we may fill later is send-capable.
  _ensureLocalTracks() {
    for (const track of this.localStream?.getTracks() || []) {
      const alreadySending = this.pc.getSenders().some((s) => s.track === track);
      if (alreadySending) continue;
      const tx = this.pc
        .getTransceivers()
        .find((t) => t.receiver.track?.kind === track.kind && !t.sender.track);
      if (tx) {
        tx.sender.replaceTrack(track).catch(() => {});
        tx.direction = 'sendrecv';
      } else {
        this.pc.addTrack(track, this.localStream);
      }
    }
    if (this.callType === 'video') {
      const videoTx = this.pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video');
      if (videoTx && videoTx.direction !== 'sendrecv') videoTx.direction = 'sendrecv';
    }
  }

  // Attach (or replace) our camera mid-call without renegotiating. Resolves false if there is no
  // video line to put it on (e.g. a voice call).
  async attachVideoTrack(track) {
    const tx = this.pc.getTransceivers().find((t) => t.receiver.track?.kind === 'video' || t.sender.track?.kind === 'video');
    if (!tx) return false;
    await tx.sender.replaceTrack(track);
    if (tx.direction !== 'sendrecv') tx.direction = 'sendrecv';
    return true;
  }

  async setAnswer(answer) {
    await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
    await this._flushIce();
  }

  async addIceCandidate(candidate) {
    if (this.closed) return;
    if (!this.pc.remoteDescription) {
      this.pendingIce.push(candidate);
      return;
    }
    try {
      await this.pc.addIceCandidate(candidate);
    } catch {
      // stale/duplicate candidates are harmless
    }
  }

  async _flushIce() {
    const queued = this.pendingIce.splice(0);
    for (const c of queued) {
      try {
        await this.pc.addIceCandidate(c);
      } catch {}
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.pc.ontrack = null;
    this.pc.onicecandidate = null;
    this.pc.onconnectionstatechange = null;
    this.pc.close();
  }
}
