import nextVitals from "eslint-config-next/core-web-vitals";

// Flat config (ESLint 9). `next lint` was removed in Next 16, so `npm run lint` runs ESLint directly.
const config = [
  ...nextVitals,
  { ignores: [".next/**", "node_modules/**", "test-results/**", "next-env.d.ts", "prisma/migrations-archive/**"] },
  {
    // The React Compiler rules added with eslint-plugin-react-hooks 7 flag existing, working patterns
    // (setState in effects, components defined in render). Kept visible as warnings; fixing them is
    // tracked as a follow-up (S1-47), not part of the framework upgrade.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/immutability": "warn",
    },
  },
  {
    // Deliberate full-page links to the root domain: global-error renders without the app shell,
    // and the tenant-subdomain booking page must leave the subdomain rewrite.
    files: ["app/global-error.tsx", "app/b/[[]slug]/BookingClient.tsx"],
    rules: { "@next/next/no-html-link-for-pages": "off" },
  },
];

export default config;
