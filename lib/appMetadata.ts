import type { Metadata } from "next";

/**
 * The installable business app: its manifest and iOS home-screen meta. Spread into the layouts of the APP routes only
 * (/dashboard, /login, /accept-invite). Public and customer pages (/{slug}, /{slug}/book, /account, booking and tracking pages) never
 * link the manifest, so they cannot be installed as the business app.
 */
export const appManifestMetadata: Pick<Metadata, "manifest" | "appleWebApp"> = {
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Calvy",
    startupImage: [{ url: "/icons/apple-touch-icon.png" }],
  },
};
