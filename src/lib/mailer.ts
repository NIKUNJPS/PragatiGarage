import { emailConfig, isProd } from '@/lib/env';

interface MailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/**
 * Sends transactional mail through Resend when configured.
 *
 * With no provider configured the message is logged to the server console
 * instead, so the password-reset flow remains fully testable on a fresh clone
 * without signing up for anything.
 */
export async function sendMail(mail: MailInput): Promise<{ sent: boolean }> {
  const cfg = emailConfig();

  if (!cfg) {
    console.info(
      [
        '',
        '─────────────────────────────────────────────────────────────',
        ' EMAIL NOT CONFIGURED - message printed instead of sent',
        ` To:      ${mail.to}`,
        ` Subject: ${mail.subject}`,
        '',
        mail.text,
        '─────────────────────────────────────────────────────────────',
        '',
      ].join('\n'),
    );
    return { sent: false };
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: cfg.from,
        to: [mail.to],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    });
    if (!res.ok) {
      console.error('[mailer] send failed:', await res.text());
      return { sent: false };
    }
    return { sent: true };
  } catch (error) {
    console.error('[mailer] send error:', error);
    return { sent: false };
  }
}

export function passwordResetEmail(name: string, resetUrl: string, garageName: string): MailInput {
  const text = [
    `Hi ${name},`,
    '',
    `We received a request to reset your ${garageName} Garage Management password.`,
    '',
    'Open this link to choose a new password (valid for 1 hour):',
    resetUrl,
    '',
    'If you did not request this, you can safely ignore this email.',
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
    <h2 style="margin:0 0 8px;font-size:20px">Reset your password</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6">
      Hi ${escapeHtml(name)}, we received a request to reset your
      <strong>${escapeHtml(garageName)}</strong> Garage Management password.
    </p>
    <p style="margin:24px 0">
      <a href="${resetUrl}"
         style="background:#0f4fb8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">
        Choose a new password
      </a>
    </p>
    <p style="color:#6b7280;font-size:12px;line-height:1.6">
      This link is valid for 1 hour. If you did not request a reset you can ignore this email -
      your password will not change.
    </p>
    <p style="color:#9ca3af;font-size:12px;word-break:break-all">${resetUrl}</p>
  </div>`;

  return { to: '', subject: `Reset your ${garageName} password`, html, text };
}

export function staffWelcomeEmail(
  name: string,
  email: string,
  password: string,
  garageName: string,
  loginUrl: string,
): MailInput {
  const text = [
    `Hi ${name},`,
    '',
    `An account has been created for you on ${garageName}'s Garage Management System.`,
    '',
    `Sign in at: ${loginUrl}`,
    `Email:    ${email}`,
    `Password: ${password}`,
    '',
    'Please change your password after your first sign-in.',
  ].join('\n');

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:520px;margin:0 auto;padding:24px;color:#111827">
    <h2 style="margin:0 0 8px;font-size:20px">Your ${escapeHtml(garageName)} account</h2>
    <p style="color:#4b5563;font-size:14px;line-height:1.6">Hi ${escapeHtml(name)}, here are your sign-in details.</p>
    <table style="font-size:14px;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Email</td><td><strong>${escapeHtml(email)}</strong></td></tr>
      <tr><td style="padding:4px 12px 4px 0;color:#6b7280">Password</td><td><strong>${escapeHtml(password)}</strong></td></tr>
    </table>
    <p><a href="${loginUrl}" style="background:#0f4fb8;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600;display:inline-block">Sign in</a></p>
    <p style="color:#6b7280;font-size:12px">Please change your password after your first sign-in.</p>
  </div>`;

  return { to: email, subject: `Your ${garageName} Garage Management account`, html, text };
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export const emailIsConfigured = () => emailConfig() !== null;
export const shouldRevealResetLink = () => !isProd() && !emailConfig();
