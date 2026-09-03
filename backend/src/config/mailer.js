import nodemailer from 'nodemailer';

// If real SMTP credentials are set, use them. Otherwise fall back to a
// transport that just logs the email to the console — so registration/email
// verification still works end-to-end on a fresh dev machine with no mail
// provider configured yet. Swap in real SMTP env vars for production.
const hasSmtpConfig = process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS;

const transporter = hasSmtpConfig
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_PORT === '465',
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
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

export async function sendMail({ to, subject, text, html }) {
  const from = process.env.SMTP_FROM || 'ClipPulse <no-reply@clippulse.app>';
  await transporter.sendMail({ from, to, subject, text, html });
}
