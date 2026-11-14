import { Share, SquarePlus } from "lucide-react";

/** iPhone and iPad only deliver web push to an app that was added to the Home Screen (iOS 16.4+), so installing comes first. */
export function IosInstallSteps() {
  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900" data-testid="ios-install-steps">
      <p className="font-semibold">To get alerts on iPhone, install the app first</p>
      <ol className="mt-2 space-y-2 list-decimal pl-5">
        <li>In Safari, tap <Share size={14} className="inline -mt-0.5" aria-hidden /> <b>Share</b> at the bottom of the screen.</li>
        <li>Choose <SquarePlus size={14} className="inline -mt-0.5" aria-hidden /> <b>Add to Home Screen</b>, then tap <b>Add</b>.</li>
        <li>Open <b>Calvy</b> from your Home Screen (not from Safari).</li>
        <li>Come back to <b>Phone alerts</b> and tap <b>Turn on for this device</b>, then <b>Allow</b>.</li>
      </ol>
      <p className="mt-2 text-xs text-sky-800">Needs iOS 16.4 or newer. Alerts do not work in a Safari tab.</p>
    </div>
  );
}
