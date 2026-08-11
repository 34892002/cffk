import { WorkerMailer } from "worker-mailer";

type Env = { DB: D1Database };
type SmtpConfig = {
  kind: "smtp";
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string;
  authType?: "plain" | "login" | "cram-md5";
  from: string;
  fromName?: string;
  replyTo?: string;
};

export default {
  async fetch(_request: Request, env: Env) {
    const record = await env.DB.prepare("SELECT configJson FROM pushChannelConfig WHERE id = ? AND channel = 'EMAIL' AND provider = 'SMTP'").bind(2).first<{ configJson: string }>();
    if (!record) return Response.json({ success: false, error: "SMTP_CONFIG_NOT_FOUND" }, { status: 404 });

    const config = JSON.parse(record.configJson) as SmtpConfig;
    const diagnostics = {
      host: JSON.stringify(config.host),
      hostLength: config.host?.length ?? 0,
      hostBytes: new TextEncoder().encode(config.host ?? "").length,
      port: config.port,
      secure: config.secure,
      fromPresent: Boolean(config.from),
      toPresent: Boolean(config.from),
      passwordLength: config.password?.length ?? 0,
    };

    try {
      await WorkerMailer.send(
        {
          host: config.host,
          port: config.port,
          secure: config.secure,
          credentials: config.username ? { username: config.username, password: config.password ?? "" } : undefined,
          authType: config.authType ?? "plain",
        },
        {
          from: { email: config.from, ...(config.fromName ? { name: config.fromName } : {}) },
          to: config.from,
          reply: config.replyTo || undefined,
          subject: "vike-cf SMTP Workerd probe",
          text: "SMTP transport probe completed.",
          html: undefined,
        },
      );
      return Response.json({ success: true, ...diagnostics });
    } catch (cause) {
      const error = cause instanceof Error ? cause.message : String(cause);
      return Response.json({ success: false, error, ...diagnostics }, { status: 500 });
    }
  },
} satisfies ExportedHandler<Env>;
