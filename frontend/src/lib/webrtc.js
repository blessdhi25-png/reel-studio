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

export async function getLocalMedia(callType) {
  if (!isWebRtcSupported()) {
    const e = new Error('unsupported');
    e.name = 'UnsupportedError';
    throw e;
  }
  return navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    video: callType === 'video' ? { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } : false,
  });
}

export function stopStream(stream) {
  stream?.getTracks().forEach((t) => t.stop());
}

// One RTCPeerConnection + the glue around it.
//   onRemoteStream(stream)      remote media arrived
//   onIceCandidate(candidate)   send this to the other side
//   onConnectionState(state)    'connecting' | 'connected' | 'disconnected' | 'failed' | 'closed'
export class CallPeer {
  constructor({ localStream, onRemoteStream, onIceCandidate, onConnectionState }) {
    this.pc = new RTCPeerConnection({ iceServers: getIceServers() });
    this.pendingIce = []; // candidates that arrive before the remote description is set
    this.closed = false;
    this.remoteStream = new MediaStream();

    localStream?.getTracks().forEach((track) => this.pc.addTrack(track, localStream));

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
    await this._flushIce();
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);
    return { type: answer.type, sdp: answer.sdp };
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
