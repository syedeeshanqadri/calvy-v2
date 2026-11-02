import * as React from "react";
import { render } from "@react-email/render";

export interface FormNotificationPayload {
  title: string;
  /** Label -> value. Never put passwords or tokens in here. */
  fields: Record<string, string | number | boolean | null | undefined>;
  /** Fixed at enqueue: a retry must render the same message, or Resend rejects the repeated idempotency key. */
  at: string;
}

export interface Rendered { subject: string; html: string; text: string }

const display = (v: string | number | boolean) => (typeof v === "boolean" ? (v ? "yes" : "no") : String(v));
const filled = (fields: FormNotificationPayload["fields"]) =>
  Object.entries(fields).filter((e): e is [string, string | number | boolean] => e[1] !== undefined && e[1] !== null && e[1] !== "");

function FormNotificationEmail({ title, fields, at }: FormNotificationPayload) {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", fontSize: 14, color: "#111" }}>
      <h2 style={{ margin: "0 0 12px" }}>{title}</h2>
      <table cellPadding={6} style={{ borderCollapse: "collapse", border: "1px solid #ddd" }}>
        <tbody>
          {filled(fields).map(([k, v]) => (
            <tr key={k}>
              <td style={{ border: "1px solid #ddd", fontWeight: 600, background: "#f6f6f6" }}>{k}</td>
              <td style={{ border: "1px solid #ddd" }}>{display(v)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ color: "#777", fontSize: 12 }}>Received {at}</p>
    </div>
  );
}

/** One entry per template: the same payload renders the email and its text variant. */
const TEMPLATES: Record<string, { subject(p: never): string; Email(p: never): React.ReactElement; text(p: never): string }> = {
  form_notification: {
    subject: (p: FormNotificationPayload) => p.title,
    Email: (p: FormNotificationPayload) => <FormNotificationEmail {...p} />,
    text: (p: FormNotificationPayload) => [p.title, ...filled(p.fields).map(([k, v]) => `${k}: ${display(v)}`), `Received ${p.at}`].join("\n"),
  },
};

export async function renderTemplate(template: string, payload: unknown): Promise<Rendered> {
  const entry = TEMPLATES[template];
  if (!entry) throw new Error(`Unknown notification template: ${template}`);
  const p = payload as never;
  return { subject: entry.subject(p), html: await render(entry.Email(p)), text: entry.text(p) };
}
