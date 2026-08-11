import assert from "node:assert/strict";
import { Email } from "worker-mailer";
import { buildSmtpMessage } from "../lib/push-utils.ts";

const from = process.env.SMTP_FROM?.trim() || "sender@example.com";
const to = process.env.SMTP_TO?.trim() || "recipient@example.com";
const fromName = process.env.SMTP_FROM_NAME?.trim() || undefined;
const replyTo = process.env.SMTP_REPLY_TO?.trim() || undefined;

const message = buildSmtpMessage({
  from,
  fromName,
  to,
  replyTo,
  subject: "SMTP envelope test",
  body: "SMTP envelope test",
  format: "text",
});
const email = new Email(message);

assert.equal(email.from.email, from);
assert.equal(email.to.length, 1);
assert.equal(email.to[0]?.email, to);
assert.equal(email.reply?.email, replyTo);
assert.ok(email.from.email);
assert.ok(email.to[0]?.email);

console.log(JSON.stringify({
  message,
  envelope: {
    from: email.from.email,
    to: email.to.map((recipient) => recipient.email),
    reply: email.reply?.email ?? null,
  },
}, null, 2));
