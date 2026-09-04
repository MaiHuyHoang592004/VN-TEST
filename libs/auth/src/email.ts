/**
 * One place that sends a 6-digit verification code. Used by the Auth.js Resend
 * provider (signup / passwordless) and by the profile email-change flow, so
 * there is a single sender to point at a verified domain later.
 */
const FROM = "GWPrintz <onboarding@resend.dev>";

/** A cryptographically-uniform 6-digit code as a string. */
export function generateOtp(randomInt: (min: number, max: number) => number): string {
  return String(randomInt(100_000, 1_000_000));
}

/** Send an admin invitation link. Same sender/transport as the OTP so there
 * is one place to point at a verified domain. */
export async function sendInviteEmail(to: string, acceptUrl: string): Promise<void> {
  if (process.env.AUTH_OTP_CONSOLE === "1") {
    console.log(`\n[auth] Invite for ${to}: ${acceptUrl}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: "You've been invited to GWPrintz",
      text: `You've been invited to GWPrintz. Accept your invitation: ${acceptUrl} (expires in 7 days).`,
      html: [
        `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px">`,
        `<p style="font-size:14px;color:#666;margin:0 0 8px">GWPrintz</p>`,
        `<h1 style="font-size:20px;margin:0 0 16px">You've been invited</h1>`,
        `<p style="font-size:14px;margin:0 0 20px">Set up your account to get started.</p>`,
        `<a href="${acceptUrl}" style="display:inline-block;background:#000;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;font-size:14px">Accept invitation</a>`,
        `<p style="font-size:13px;color:#666;margin:20px 0 0">This link expires in 7 days.</p>`,
        `</div>`,
      ].join(""),
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}

export async function sendVerificationCode(to: string, code: string): Promise<void> {
  // Local testing: print instead of emailing — Resend's test sender only
  // delivers to the account owner until a domain is verified.
  if (process.env.AUTH_OTP_CONSOLE === "1") {
    console.log(`\n[auth] OTP for ${to}: ${code}\n`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: FROM,
      to,
      subject: `${code} is your GWPrintz verification code`,
      text: `Your GWPrintz verification code is ${code}. It expires in 10 minutes. If you didn't request this, you can ignore this email.`,
      html: [
        `<div style="font-family:ui-sans-serif,system-ui,sans-serif;max-width:420px;margin:0 auto;padding:32px 24px">`,
        `<p style="font-size:14px;color:#666;margin:0 0 8px">GWPrintz</p>`,
        `<h1 style="font-size:20px;margin:0 0 16px">Your verification code</h1>`,
        `<p style="font-size:32px;font-weight:700;letter-spacing:8px;margin:0 0 16px">${code}</p>`,
        `<p style="font-size:13px;color:#666;margin:0">This code expires in 10 minutes. If you didn't request it, ignore this email.</p>`,
        `</div>`,
      ].join(""),
    }),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
}
