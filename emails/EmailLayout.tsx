import * as React from "react";
import { Body, Container, Head, Hr, Html, Img, Link, Preview, Section, Text } from "@react-email/components";

export const brand = {
  accent: "#0284c7",
  ink: "#0f0f1a",
  text: "#3d3d4d",
  muted: "#6b6b80",
  line: "#e8e6e0",
  bg: "#f4f4f1",
  card: "#ffffff",
  green: "#16a34a",
};

const main = { backgroundColor: brand.bg, fontFamily: "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif", margin: 0, padding: "32px 0" };
const container = { maxWidth: "480px", margin: "0 auto", padding: "0 16px" };
const card = { backgroundColor: brand.card, border: `1px solid ${brand.line}`, borderRadius: "16px", overflow: "hidden" as const };
const header = { backgroundColor: brand.ink, padding: "20px 28px" };
const logo = { color: brand.accent, fontSize: "20px", fontWeight: 700, margin: 0, letterSpacing: "-0.2px" };
const footer = { textAlign: "center" as const, color: brand.muted, fontSize: "12px", lineHeight: "18px", marginTop: "20px" };

/** The business a tenant-facing email is sent for: its logo (absolute URL) or initials on its theme colour. */
export interface TenantBrand { name: string; logoUrl?: string | null; color?: string; fg?: string; address?: string | null; phone?: string | null }

function TenantHeader({ t }: { t: TenantBrand }) {
  const initials = t.name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase() || "?";
  return (
    <table role="presentation"><tbody><tr>
      <td style={{ paddingRight: "12px" }}>
        {t.logoUrl ? (
          <Img src={t.logoUrl} alt={t.name} width="40" height="40" style={{ display: "block", borderRadius: "8px", objectFit: "contain", backgroundColor: "#ffffff" }} />
        ) : (
          <div style={{ width: "40px", height: "40px", lineHeight: "40px", textAlign: "center", borderRadius: "8px", fontWeight: 700, fontSize: "16px", backgroundColor: t.fg ?? "#ffffff", color: t.color ?? brand.accent }}>{initials}</div>
        )}
      </td>
      <td><Text style={{ ...logo, color: t.fg ?? "#ffffff" }}>{t.name}</Text></td>
    </tr></tbody></table>
  );
}

/** Set around optional mail so every layout shows the "stop these emails" link without each template passing it down. */
export const UnsubscribeContext = React.createContext<string | undefined>(undefined);

export function EmailLayout({ preview, children, tenant, calvyFooter }: { preview: string; children: React.ReactNode; tenant?: TenantBrand; calvyFooter?: boolean }) {
  const unsubscribeUrl = React.useContext(UnsubscribeContext);
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={card}>
            <Section style={tenant ? { ...header, backgroundColor: tenant.color ?? brand.ink } : header}>
              {tenant ? <TenantHeader t={tenant} /> : <Text style={logo}>● Calvy</Text>}
            </Section>
            <Section style={{ padding: "32px 28px" }}>{children}</Section>
          </Section>
          {tenant && !calvyFooter ? (
            <Text style={footer}>
              {[tenant.name, tenant.address, tenant.phone].filter(Boolean).join("  ·  ")}
              <br />
              Want a site like this?{" "}
              <Link href="https://calvy.io" style={{ color: brand.muted, textDecoration: "underline" }}>Grab it on Calvy</Link>
            </Text>
          ) : (
            <Text style={footer}>
              Calvy · Smart appointment booking
              <br />
              <Link href="https://calvy.io" style={{ color: brand.muted, textDecoration: "underline" }}>calvy.io</Link>
              {"  ·  "}
              <Link href="https://calvy.io/help" style={{ color: brand.muted, textDecoration: "underline" }}>Help Center</Link>
            </Text>
          )}
          {unsubscribeUrl ? (
            <Text style={footer}>
              <Link href={unsubscribeUrl} style={{ color: brand.muted, textDecoration: "underline" }}>Stop these emails</Link>
            </Text>
          ) : null}
        </Container>
      </Body>
    </Html>
  );
}

/* Shared building blocks */
export const H = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: "22px", fontWeight: 700, color: brand.ink, margin: "0 0 8px" }}>{children}</Text>
);
export const P = ({ children }: { children: React.ReactNode }) => (
  <Text style={{ fontSize: "15px", lineHeight: "24px", color: brand.muted, margin: "0 0 16px" }}>{children}</Text>
);
export const Hairline = () => <Hr style={{ borderColor: brand.line, margin: "24px 0" }} />;

export function DetailRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <table width="100%" style={{ margin: "0 0 8px" }}>
      <tbody>
        <tr>
          <td style={{ color: brand.muted, fontSize: "14px" }}>{label}</td>
          <td style={{ textAlign: "right", color: brand.ink, fontSize: "14px", fontWeight: strong ? 700 : 600 }}>{value}</td>
        </tr>
      </tbody>
    </table>
  );
}

export function Card({ children }: { children: React.ReactNode }) {
  return <Section style={{ backgroundColor: brand.bg, borderRadius: "12px", padding: "18px 20px", margin: "4px 0 8px" }}>{children}</Section>;
}

export function CTA({ href, label, color, fg }: { href: string; label: string; color?: string; fg?: string }) {
  return (
    <table width="100%" style={{ margin: "8px 0 4px" }}>
      <tbody><tr><td>
        <a href={href} style={{ display: "inline-block", backgroundColor: color ?? brand.accent, color: fg ?? "#fff", textDecoration: "none", fontWeight: 600, fontSize: "14px", padding: "12px 24px", borderRadius: "12px" }}>{label}</a>
      </td></tr></tbody>
    </table>
  );
}
