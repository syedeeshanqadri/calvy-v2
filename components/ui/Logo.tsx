import Image from "next/image";

// calvy.svg has a 236:60 viewBox. Tailwind's preflight sets `img { height: auto }`,
// so a height attribute that does not match the rendered height makes next/image
// warn "width or height modified, but not the other". Derive the height from the
// width so the attributes always equal the rendered size.
const RATIO = 60 / 236;

export function Logo({ width = 110, className, priority }: { width?: number; className?: string; priority?: boolean }) {
  return (
    <Image
      src="/calvy.svg"
      alt="Calvy"
      width={width}
      height={Math.round(width * RATIO)}
      className={className}
      style={{ width, height: "auto" }}
      priority={priority}
    />
  );
}
