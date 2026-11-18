import { PrimaryLink } from "@/components/marketing/ui";

/** Hero call to action: straight to signup (the old email box is gone). */
export function HeroLeadForm() {
  return (
    <div className="max-w-md">
      <PrimaryLink href="/signup" className="w-full sm:w-auto">Get started for free</PrimaryLink>
      <p className="text-xs text-cv-mute mt-2.5 ml-1">No credit card · Free forever plan · Setup in 60 seconds</p>
    </div>
  );
}
