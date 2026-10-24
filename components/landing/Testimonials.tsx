import { Star, BadgeCheck } from "lucide-react";

const TESTIMONIALS = [
  {
    name: "Jamie Martinez",
    role: "Owner, Glow Beauty Studio",
    color: "#0284c7",
    quote: "Calvy cut our no-shows in half within the first week. The automated reminders are worth the price alone. Absolutely love this tool.",
    metric: "50% fewer no-shows",
    platform: "Google",
  },
  {
    name: "Dr. Rachel Chen",
    role: "Family Health Clinic",
    color: "#0ea5e9",
    quote: "I was using 3 different apps for bookings, payments, and reminders. Calvy replaced all of them for a fraction of the cost.",
    metric: "3 apps → 1",
    platform: "Trustpilot",
  },
  {
    name: "Tom Kirkland",
    role: "Life Coach & Consultant",
    color: "#10b981",
    quote: "My clients constantly compliment how easy it is to book with me now. Setup took 15 minutes and I've never looked back.",
    metric: "15-min setup",
    platform: "Google",
  },
  {
    name: "Sofia Reyes",
    role: "Yoga Studio Owner",
    color: "#ec4899",
    quote: "The analytics dashboard showed me I was losing 30% of potential clients on Sundays. I added Sunday hours and revenue jumped immediately.",
    metric: "30% more bookings",
    platform: "Capterra",
  },
  {
    name: "Marcus Bell",
    role: "Personal Trainer",
    color: "#f59e0b",
    quote: "Collecting payments upfront completely eliminated cancellations for me. Game changer. I wish I had found this 2 years ago.",
    metric: "Zero cancellations",
    platform: "Google",
  },
  {
    name: "Anita Shah",
    role: "Dermatology Practice",
    color: "#8b5cf6",
    quote: "Our admin team was drowning in phone calls. Now 90% of bookings happen automatically. Staff morale is through the roof.",
    metric: "90% automated",
    platform: "Trustpilot",
  },
];

const PLATFORM_COLORS: Record<string, string> = {
  Google: "#4285F4",
  Trustpilot: "#00B67A",
  Capterra: "#FF9D28",
};

function PlatformDot({ platform }: { platform: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PLATFORM_COLORS[platform] }} />
      <span className="text-xs text-gray-500 font-medium">{platform}</span>
    </div>
  );
}

function Stars() {
  return (
    <div className="flex gap-0.5">
      {Array(5).fill(0).map((_, i) => <Star key={i} size={13} className="text-amber-400 fill-amber-400" />)}
    </div>
  );
}

export function Testimonials() {
  return (
    <section id="testimonials" className="py-16 sm:py-20 lg:py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-12 lg:mb-16">
          <span className="inline-block bg-sky-100 text-sky-700 text-xs font-bold tracking-widest uppercase px-4 py-2 rounded-full mb-4">Testimonials</span>
          <h2 className="font-syne font-extrabold text-3xl sm:text-4xl lg:text-5xl tracking-tight text-gray-900 mb-4">Loved by 12,000+ businesses</h2>
          <p className="text-gray-500 text-lg max-w-md mx-auto">Real stories from real business owners who transformed their scheduling.</p>
          {/* Platform trust bar */}
          <div className="flex items-center justify-center gap-6 mt-6 flex-wrap">
            {Object.entries(PLATFORM_COLORS).map(([name, color]) => (
              <div key={name} className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="text-sm text-gray-500 font-medium">Verified on {name}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="columns-1 sm:columns-2 lg:columns-3 gap-6 space-y-6">
          {TESTIMONIALS.map((t) => (
            <div key={t.name} className="break-inside-avoid bg-gray-50 rounded-2xl p-6 border border-gray-100 hover:border-sky-200 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-3">
                <Stars />
                <PlatformDot platform={t.platform} />
              </div>
              {/* Metric callout */}
              <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-700 text-xs font-bold px-3 py-1.5 rounded-full mb-3">
                <BadgeCheck size={12} className="text-sky-500" />
                {t.metric}
              </div>
              <p className="text-gray-700 text-sm leading-relaxed mb-4">&ldquo;{t.quote}&rdquo;</p>
              <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
                <div className="relative flex-shrink-0">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white ring-2 ring-white shadow-sm"
                    style={{ background: t.color }}
                  >
                    {t.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-white flex items-center justify-center">
                    <span className="text-[7px] text-white font-black">✓</span>
                  </div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.role}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
