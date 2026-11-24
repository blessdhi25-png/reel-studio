import { API_BASE } from './api';

// Multipart POST with upload progress (fetch has no upload-progress events).
// Resolves with the parsed JSON body; rejects with an Error whose message is
// the server's `error` field when there is one. `xhrRef.current` is set so
// the caller can abort(), which rejects with an AbortError.
export function xhrUpload(path, formData, { onProgress, xhrRef } = {}) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    if (xhrRef) xhrRef.current = xhr;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    xhr.open('POST', `${API_BASE}${path}`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      if (xhrRef) xhrRef.current = null;
      let body = {};
      try { body = JSON.parse(xhr.responseText); } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) return resolve(body);
      const err = new Error(body.error || 'Upload failed. Please try again.');
      err.status = xhr.status; // lets friendlyError map 413/429/5xx to a human sentence
      reject(err);
    };
    xhr.onerror = () => {
      if (xhrRef) xhrRef.current = null;
      reject(new Error('Connection lost. Please try again.'));
    };
    xhr.onabort = () => {
      if (xhrRef) xhrRef.current = null;
      const err = new Error('Upload cancelled');
      err.name = 'AbortError';
      reject(err);
    };
    xhr.send(formData);
  });
}
