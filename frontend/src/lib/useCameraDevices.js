'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'preferredCameraDeviceId';

// Labels that indicate a device is the host machine's own webcam.
const BUILT_IN_PATTERN = /built-?in|integrated|facetime hd|internal|webcam/i;

// Labels that indicate a device is a phone/tablet passthrough, virtual
// camera app, or capture card riding in alongside the real webcam — these
// should never be auto-selected even though some (e.g. "HD Webcam" from a
// capture card) can otherwise slip past a loose built-in match.
const EXTERNAL_OR_VIRTUAL_PATTERN =
  /continuity|iphone|ipad|android|droidcam|epoccam|ivcam|obs virtual camera|virtual cam|capture card|elgato|cam ?link|snap camera|manycam/i;

function readStoredDeviceId() {
  if (typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(STORAGE_KEY) || '';
  } catch {
    return ''; // localStorage can throw in private-browsing/blocked-storage contexts
  }
}

// Picks the best default camera out of a list of `videoinput` devices:
//   1. A device that reads as built-in AND doesn't also match a known
//      external/virtual-camera name (guards against something like an
//      Elgato "HD60 Webcam Emulation" device tripping the loose /webcam/i
//      built-in check).
//   2. The first device that isn't flagged as external/virtual at all,
//      for hardware whose built-in cam has an unlabeled/generic name.
//   3. The first enumerated device, full stop — only reached when every
//      option is an external/virtual camera (e.g. a phone is the only
//      camera currently attached), since offering nothing would be worse.
// Exported standalone so it can be unit tested and reused outside the hook.
export function pickBuiltInCamera(videoInputs) {
  if (!videoInputs?.length) return undefined;

  const builtIn = videoInputs.find(
    (d) => BUILT_IN_PATTERN.test(d.label) && !EXTERNAL_OR_VIRTUAL_PATTERN.test(d.label)
  );
  if (builtIn) return builtIn;

  const nonExternal = videoInputs.find((d) => !EXTERNAL_OR_VIRTUAL_PATTERN.test(d.label));
  if (nonExternal) return nonExternal;

  return videoInputs[0];
}

// Device labels are blank until getUserMedia has been granted once, so this
// requests a throwaway stream first (immediately stopped), then enumerates
// devices with real labels, then lets the caller open the actual preview
// stream against whichever deviceId is selected.
//
// Left to its own devices, getUserMedia({ video: { facingMode: 'user' } })
// can end up handing you a connected phone (Continuity Camera), a virtual-
// camera app (OBS, DroidCam, EpocCam), or a capture card instead of the
// laptop's own webcam — facingMode is a preference, not a guarantee, and
// browsers vary in which device they treat as satisfying it. Explicit
// device enumeration + an exact deviceId constraint, with the host's
// built-in camera actively prioritized over anything that looks external
// or virtual, is the only reliable fix. This hook is the single source of
// truth for that logic — every camera surface in the app (Go Live preview,
// live-room join, and the upload recorder) shares it rather than
// reimplementing device selection locally.
export function useCameraDevices() {
  const [devices, setDevices] = useState([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState('');
  const [builtInDeviceId, setBuiltInDeviceId] = useState('');
  const [permissionError, setPermissionError] = useState(null);
  const [ready, setReady] = useState(false);

  // Wraps setSelectedDeviceId so every call site (dropdown onChange, flip-
  // camera resets, etc.) automatically remembers the choice for next time —
  // no need to touch localStorage at each of the three usage sites.
  const setSelectedDeviceId = useCallback((deviceId) => {
    setSelectedDeviceIdState(deviceId);
    if (typeof window === 'undefined') return;
    try {
      if (deviceId) window.localStorage.setItem(STORAGE_KEY, deviceId);
    } catch {
      // ignore — persistence is a nice-to-have, not a requirement
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const temp = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        temp.getTracks().forEach((t) => t.stop());

        const all = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const videoInputs = all.filter((d) => d.kind === 'videoinput');
        setDevices(videoInputs);

        const recommended = pickBuiltInCamera(videoInputs);
        setBuiltInDeviceId(recommended?.deviceId || '');

        // Preference order: 1) last device the user explicitly picked (if
        // it's still plugged in), 2) the detected built-in/host camera,
        // steering clear of phones, virtual-camera apps, and capture
        // cards. A stale stored pick from a since-unplugged device is
        // ignored rather than trusted.
        const storedId = readStoredDeviceId();
        const storedStillPresent = storedId && videoInputs.some((d) => d.deviceId === storedId);
        setSelectedDeviceIdState(
          (prev) => prev || (storedStillPresent ? storedId : '') || recommended?.deviceId || ''
        );
        setReady(true);
      } catch {
        if (!cancelled) {
          setPermissionError('Camera access was denied or is unavailable.');
          setReady(true);
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // Matches the exact constraint shape requested — deviceId when we have an
  // explicit selection, falling back to facingMode only when we don't (e.g.
  // permission was granted but enumeration returned nothing usable).
  function buildConstraints({ audio = true, facingMode = 'user' } = {}) {
    return {
      video: selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : { facingMode },
      audio,
    };
  }

  return {
    devices,
    selectedDeviceId,
    setSelectedDeviceId,
    builtInDeviceId,
    permissionError,
    ready,
    buildConstraints,
  };
}
