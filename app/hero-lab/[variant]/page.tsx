// TEMPORARY (step 33): renders one hero candidate for side-by-side review. Deleted once a variant is chosen.
import { notFound } from "next/navigation";
import { Navbar } from "@/components/landing/Navbar";
import { Hero } from "@/components/landing/Hero";
import { BusinessTypes } from "@/components/landing/BusinessTypes";

export const metadata = { robots: { index: false, follow: false } };

export default async function HeroLab(props: { params: Promise<{ variant: string }> }) {
  const v = (await props.params).variant.toUpperCase();
  if (v !== "A" && v !== "B" && v !== "C") notFound();
  return (
    <main>
      <Navbar tone={v === "B" ? "dark" : "light"} solid={v === "C"} />
      <Hero variant={v} />
      <div className="bg-white"><BusinessTypes /></div>
    </main>
  );
}
