import Link from "next/link";
import { ArrowRight } from "lucide-react";

/** Hero call to action: straight to signup (the old email box is gone). */
export function HeroLeadForm() {
  return (
    <div className="max-w-md">
      <Link
        href="/signup"
        className="group inline-flex w-full sm:w-auto min-h-12 items-center justify-center gap-2 bg-sky-600 hover:bg-sky-700 text-white font-semibold px-8 py-4 rounded-2xl transition-all shadow-lg shadow-sky-200 hover:shadow-sky-300 hover:-translate-y-0.5 whitespace-nowrap"
      >
        Get started for free <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" aria-hidden />
      </Link>
      <p className="text-xs text-gray-400 mt-2.5 ml-1">No credit card · Free forever plan · Setup in 60 seconds</p>
    </div>
  );
}
