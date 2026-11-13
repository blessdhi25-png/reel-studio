// Biometric lock — server-verified WebAuthn (see backend/src/routes/webauthn.js).
//
// The server stores each credential's public key and issues every challenge;
// the browser only ever signs what the server sent, and the server verifies the
// signature. Sensitive routes then demand a short-lived step-up token that only
// a verified assertion can mint (profile saves, disabling the lock, adding a
// device), and accounts that have the lock on are kept on this device under a
// restricted token that can only be exchanged for a session by passing the
// fingerprint prompt. Honest limit: the *active* session's token sits in
// localStorage like any web session, so the lock protects the gated actions and
// switching INTO a locked account, not general API use of an already-open session.
import { api } from './api';

export function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64ToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export async function isBiometricSupported() {
  if (typeof window === 'undefined' || !window.isSecureContext) return false;
  if (!window.PublicKeyCredential || !navigator.credentials) return false;
  try {
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

function describe(err) {
  if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') {
    return { cancelled: true, error: 'Fingerprint verification was cancelled.' };
  }
  return { cancelled: false, error: err?.message || 'Fingerprint verification failed.' };
}

// --- JSON <-> WebAuthn browser types -----------------------------------
const toDescriptor = (c) => ({ ...c, id: base64ToBuffer(c.id) });

function creationOptionsFromJSON(o) {
  return {
    ...o,
    challenge: base64ToBuffer(o.challenge),
    user: { ...o.user, id: base64ToBuffer(o.user.id) },
    excludeCredentials: (o.excludeCredentials || []).map(toDescriptor),
  };
}

function requestOptionsFromJSON(o) {
  return {
    ...o,
    challenge: base64ToBuffer(o.challenge),
    allowCredentials: (o.allowCredentials || []).map(toDescriptor),
  };
}

function registrationToJSON(cred) {
  return {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
      attestationObject: bufferToBase64Url(cred.response.attestationObject),
      transports: cred.response.getTransports?.() || [],
    },
  };
}

function assertionToJSON(cred) {
  return {
    id: cred.id,
    rawId: bufferToBase64Url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment || undefined,
    clientExtensionResults: cred.getClientExtensionResults?.() || {},
    response: {
      clientDataJSON: bufferToBase64Url(cred.response.clientDataJSON),
      authenticatorData: bufferToBase64Url(cred.response.authenticatorData),
      signature: bufferToBase64Url(cred.response.signature),
      userHandle: cred.response.userHandle ? bufferToBase64Url(cred.response.userHandle) : undefined,
    },
  };
}

async function getAssertion(optionsJSON) {
  const cred = await navigator.credentials.get({ publicKey: requestOptionsFromJSON(optionsJSON) });
  if (!cred) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
  return assertionToJSON(cred);
}

// --- Public API ---------------------------------------------------------

/** { enabled, credentials: [{ id, deviceName, createdAt, lastUsedAt }] } from the server. */
export function getBiometricStatus() {
  return api.webauthnStatus();
}

/**
 * Step-up: prompts the OS fingerprint dialog against a server-issued challenge.
 * Resolves { verified: true, stepUpToken } (send it as X-Biometric-Token), or
 * { verified: true, bypassed: true } when the account has no lock, or
 * { verified: false, error, cancelled }.
 */
export async function verifyBiometric(_userId, scope = 'profile') {
  try {
    const res = await api.webauthnAuthOptions(scope);
    if (!res.required) return { verified: true, bypassed: true };
    if (!(await isBiometricSupported())) {
      return { verified: false, error: 'This account is protected by a fingerprint, which this device can’t provide.' };
    }
    const assertion = await getAssertion(res.options);
    const out = await api.webauthnAuthVerify(scope, assertion);
    return { verified: true, stepUpToken: out.stepUpToken };
  } catch (err) {
    return { verified: false, ...describe(err) };
  }
}

/** Enrols this device's fingerprint with the server; the lock is on once it succeeds. Throws a readable Error. */
export async function registerBiometricCredential(user) {
  if (!(await isBiometricSupported())) throw new Error('This device has no fingerprint or face unlock available.');
  let stepUpToken;
  const status = await api.webauthnStatus();
  if (status.enabled) {
    // Adding another device to an account that's already locked needs a fingerprint first.
    const res = await verifyBiometric(user.id, 'register');
    if (!res.verified) throw new Error(res.error);
    stepUpToken = res.stepUpToken;
  }
  try {
    const options = await api.webauthnRegisterOptions(stepUpToken);
    const cred = await navigator.credentials.create({ publicKey: creationOptionsFromJSON(options) });
    if (!cred) throw Object.assign(new Error('cancelled'), { name: 'NotAllowedError' });
    await api.webauthnRegisterVerify({ response: registrationToJSON(cred), deviceName: deviceLabel() }, stepUpToken);
  } catch (err) {
    throw new Error(err?.status ? err.message : describe(err).error);
  }
  return { ok: true };
}

/** Turns the lock off (requires a verified fingerprint). Throws a readable Error. */
export async function disableBiometric(user) {
  const res = await verifyBiometric(user.id, 'disable');
  if (!res.verified) throw new Error(res.error || 'Fingerprint verification required to turn this off');
  await api.webauthnDisable(res.stepUpToken);
}

function deviceLabel() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  if (/iPhone|iPad/.test(ua)) return 'iPhone / iPad';
  if (/Android/.test(ua)) return 'Android device';
  if (/Windows/.test(ua)) return 'Windows PC';
  if (/Mac/.test(ua)) return 'Mac';
  return 'This device';
}

// --- Account switcher ---------------------------------------------------

/** Leaving the active account: { locked, lockedToken? }. If locked, store lockedToken in place of its full token. */
export function lockActiveSession() {
  return api.webauthnLockSession();
}

/** Entering a locked account: fingerprint prompt, then a fresh full session token. { ok, token } | { ok:false, error }. */
export async function unlockAccount(lockedToken) {
  try {
    if (!(await isBiometricSupported())) {
      return { ok: false, error: 'This account is protected by a fingerprint, which this device can’t provide.' };
    }
    const { options } = await api.webauthnUnlockOptions(lockedToken);
    const assertion = await getAssertion(options);
    const { token } = await api.webauthnUnlockVerify(lockedToken, assertion);
    return { ok: true, token };
  } catch (err) {
    return { ok: false, ...describe(err) };
  }
}
