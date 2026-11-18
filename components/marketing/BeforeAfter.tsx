"use client";
import { useRegion } from "@/components/landing/useRegion";
import { Phone } from "./ui";

// Illustration of the "before": a generic message thread over a paper diary. No third-party logo, colour or branding;
// names and wording follow the visitor's region (India / International), like the screenshots.
const CHAT = {
  IN: {
    who: "Mrs. Nair",
    msgs: [
      { from: "them", t: "4:12 PM", text: "Can I come at 5?" },
      { from: "me", t: "4:40 PM", text: "Doctor busy, come 6:30" },
      { from: "them", t: "4:41 PM", text: "Ok. Is tomorrow also free?" },
      { from: "other", t: "6:02 PM", text: "Rahul S.: Appointment for Saturday?" },
      { from: "me", t: "6:30 PM", text: "Let me check the diary" },
      { from: "other", t: "9:15 PM", text: "Rahul S.: Hello?? Any reply" },
    ],
    diary: ["10:00  Mrs Nair ?", "5:00 → 6:30 ??", "Sat  Rahul – call back", "Kavita 11:30 (paid?)"],
  },
  INTL: {
    who: "Sarah",
    msgs: [
      { from: "them", t: "4:12 PM", text: "Can I come at 5?" },
      { from: "me", t: "4:40 PM", text: "Dr. Carter is running late, can you do 6:30?" },
      { from: "them", t: "4:41 PM", text: "Ok. Is tomorrow also free?" },
      { from: "other", t: "6:02 PM", text: "James: Appointment for Saturday?" },
      { from: "me", t: "6:30 PM", text: "Let me check the diary" },
      { from: "other", t: "9:15 PM", text: "James: Hello?? Any reply" },
    ],
    diary: ["10:00  Sarah ?", "5:00 → 6:30 ??", "Sat  James – call back", "Aisha 11:30 (paid?)"],
  },
} as const;

const HAND = { fontFamily: '"Bradley Hand","Segoe Script","Comic Sans MS",cursive' };

export function Chat() {
  const region = useRegion();
  const c = CHAT[region === "IN" ? "IN" : "INTL"];
  return (
    <div className="relative mx-auto w-full max-w-md" aria-label="An example of managing bookings by message">
      {/* paper diary, tilted, behind the thread */}
      <div className="absolute -left-3 -top-4 bottom-6 right-10 rotate-[-3deg] rounded-xl border border-cv-line bg-[#fffbea]" aria-hidden
        style={{ backgroundImage: "repeating-linear-gradient(transparent 0 27px, #e3ddd2 27px 28px)" }}>
        <div className="px-6 pt-5 text-lg text-cv-ink/70" style={HAND}>
          {c.diary.map((d, i) => <p key={d} className={`m-0 leading-[28px] ${i === 1 ? "line-through decoration-cv-ink/50" : ""}`}>{d}</p>)}
        </div>
      </div>
      <div className="relative ml-8 mt-24 rounded-xl border border-cv-line bg-white">
        <div className="border-b border-cv-line px-4 py-3 text-sm font-semibold text-cv-ink">{c.who}</div>
        <ul className="space-y-2.5 px-4 py-4 m-0 list-none">
          {c.msgs.map((m) => (
            <li key={m.t} className={m.from === "me" ? "flex justify-end" : "flex justify-start"}>
              <div className={`max-w-[85%] rounded-xl border px-3 py-2 text-sm ${m.from === "me" ? "border-cv-blue/20 bg-cv-blue-tint text-cv-ink" : "border-cv-line bg-cv-paper text-cv-ink"}`}>
                {m.text}
                <span className="mt-0.5 block text-[10px] text-cv-mute">{m.t}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/** Left: the old way (message thread over a paper diary). Right: the real Calvy "Today" screen. */
export function BeforeAfter() {
  return (
    <div className="grid gap-10 md:grid-cols-2 items-start">
      <figure className="m-0 min-w-0">
        <figcaption className="mb-4 text-sm font-semibold text-cv-mute">Before</figcaption>
        <Chat />
      </figure>
      <figure className="m-0 min-w-0">
        <figcaption className="mb-4 text-sm font-semibold text-cv-blue">With Calvy</figcaption>
        <Phone name="today" alt="Calvy Today screen: the day's bookings in one list, with Arrived, Completed and No-show buttons" crop />
      </figure>
    </div>
  );
}
