// The exact failure, for display next to the friendly message: "NotAllowedError: Permission denied".
// Without this, "blocked" looks the same whether the cause is a denied prompt, an https-only restriction, a
// Permissions-Policy header, a WebView that never shows prompts, or a missing device.
export function mediaErrorDetail(err) {
  if (!err) return '';
  const name = err.name || 'Error';
  const msg = err.message && err.message !== name ? `: ${err.message}` : '';
  return `${name}${msg}`;
}

export const UNSUPPORTED_TEXT = 'Unsupported in this browser/WebView';
