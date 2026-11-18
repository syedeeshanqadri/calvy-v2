// Alias kept so old links and bookmarks keep working: the booking page now lives at /{slug}/book. Same page, and its
// canonical URL (see generateMetadata) points at /book.
export const dynamic = "force-dynamic";
export { default, generateMetadata } from "../book/page";
