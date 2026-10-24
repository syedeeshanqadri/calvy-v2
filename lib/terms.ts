import { getPack } from "@/lib/packs";
import { termsOverrideSchema, type TermKey, type TermsOverride } from "@/lib/packs/types";

export interface TermsSource {
  packId?: string | null;
  termsOverride?: unknown;
}

export interface TermOpts {
  plural?: boolean;
  cap?: boolean;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function parseOverride(raw: unknown): TermsOverride {
  const parsed = termsOverrideSchema.safeParse(raw);
  return parsed.success ? parsed.data : {};
}

/** Resolve a term: termsOverride -> pack -> OTHER pack. Invalid override JSON is ignored. */
export function t(source: TermsSource, key: TermKey, opts: TermOpts = {}): string {
  const base = getPack(source.packId).terms[key];
  const o = parseOverride(source.termsOverride)[key];
  const singular = o?.singular ?? base.singular;
  // An overridden singular without a plural pluralises by "s", not with the pack's plural.
  const plural = o?.plural ?? (o?.singular ? `${o.singular}s` : base.plural);
  const word = opts.plural ? plural : singular;
  return opts.cap ? capitalize(word) : word;
}

/** Bind a source once: const term = terms(business); term("client", { plural: true }). */
export function terms(source: TermsSource) {
  return (key: TermKey, opts?: TermOpts) => t(source, key, opts);
}
