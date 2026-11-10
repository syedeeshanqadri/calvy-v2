/** Shown instead of a business's public pages while a Calvy admin has suspended it. Plain and neutral: no reason is given. */
export function Unavailable({ name }: { name: string }) {
  return (
    <main className="min-h-dvh flex items-center justify-center bg-[#f8f7f4] px-6">
      <div className="max-w-md text-center">
        <h1 className="font-syne font-bold text-2xl text-[#0f0f1a]">{name} is temporarily unavailable</h1>
        <p className="mt-3 text-sm text-[#6b6b80]">Please check back later. If you already have a booking, you will still get your reminders.</p>
      </div>
    </main>
  );
}
