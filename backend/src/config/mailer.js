import nodemailer from 'nodemailer';

// If real SMTP credentials are set, use them. In development with nothing
// configured, fall back to a transport that just logs the email to the
// console so registration/verification still works end-to-end on a fresh
// machine. In PRODUCTION that fallback would be a silent failure (the API
// would report "code sent" while nothing was delivered), so there a missing
// SMTP config is a loud, explicit error instead — see sendMail below.
const hasSmtpConfig = Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
const isProduction = process.env.NODE_ENV === 'production';

if (!hasSmtpConfig) {
  console.error(
    isProduction
      ? '[mailer] SMTP_HOST / SMTP_USER / SMTP_PASS are not set — emails CANNOT be sent in production.'
      : '[mailer] SMTP not configured — emails will be printed to the console instead of sent.'
  );
}

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      // Without these a dead/blackholed SMTP host can hang a request for
      // minutes. Fail fast so the API can answer with a real error.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    })
  : {
      sendMail: async (opts) => {
        console.log('\n[mailer] SMTP not configured — printing email instead of sending it:');
        console.log(`  To:      ${opts.to}`);
        console.log(`  Subject: ${opts.subject}`);
        console.log(`  Body:\n${opts.text}\n`);
        return { messageId: 'console-fallback' };
      },
    };

// Turns a nodemailer/network error into something a client (and whoever is
// debugging on Render) can act on without reading server logs. `reason` is a
// stable machine-readable code; `message` says which kind of problem it is.
export function describeMailError(err) {
  const code = err?.code;
  const response = err?.responseCode;
  if (code === 'SMTP_NOT_CONFIGURED') {
    return { reason: 'smtp_not_configured', message: 'Email is not configured on the server (SMTP_HOST / SMTP_USER / SMTP_PASS missing).' };
  }
  if (code === 'EAUTH' || response === 535 || response === 534) {
    return { reason: 'smtp_auth_failed', message: 'The email provider rejected the SMTP username or password / API key.' };
  }
  if (['ETIMEDOUT', 'ESOCKET', 'ECONNECTION', 'ECONNREFUSED', 'ECONNRESET', 'EDNS', 'ENOTFOUND', 'EHOSTUNREACH'].includes(code)) {
    return { reason: 'smtp_connection_failed', message: 'Could not connect to the email server (check SMTP_HOST / SMTP_PORT and that the host allows outbound SMTP).' };
  }
  if (code === 'EENVELOPE' || (response >= 550 && response < 560)) {
    return { reason: 'smtp_recipient_rejected', message: 'The email server rejected the recipient address or sender.' };
  }
  return { reason: 'smtp_error', message: 'The email server returned an error.' };
}

export async function sendMail({ to, subject, text, html }) {
  if (!hasSmtpConfig && isProduction) {
    const err = new Error('SMTP is not configured');
    err.code = 'SMTP_NOT_CONFIGURED';
    console.error('Email send error:', err);
    throw err;
  }
  const from = process.env.SMTP_FROM || 'ClipPulse <no-reply@clippulse.app>';
  try {
    await transporter.sendMail({ from, to, subject, text, html });
  } catch (err) {
    // Full error object (code, command, response) so Render's log shows
    // exactly why — never swallowed here; callers decide what to tell the user.
    console.error('Email send error:', err);
    throw err;
  }
}
