"use client";
import { useSession } from "next-auth/react";
import { Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { vibrateNow } from "@/lib/alertSound";
import { getAlertAudio, useAudioState, useSoundSettings } from "@/lib/useSoundSettings";

/** Sound for alerts while the app is open: on/off, volume, and a test button (a tap, which also unlocks audio). */
export function SoundSettings() {
  const userId = useSession().data?.user?.id;
  const { settings, update } = useSoundSettings(userId);
  const audioState = useAudioState();
  const test = async () => {
    const audio = getAlertAudio();
    await audio?.unlock();
    await audio?.play(settings.volume);
    vibrateNow();
  };
  return (
    <div className="space-y-3" data-testid="sound-settings">
      <label className="flex items-center justify-between min-h-11 text-sm font-medium">
        <span className="flex items-center gap-2">{settings.on ? <Volume2 size={16} aria-hidden /> : <VolumeX size={16} aria-hidden />} Play a sound for new bookings</span>
        <input type="checkbox" role="switch" className="size-5 accent-sky-600" checked={settings.on} onChange={(e) => update({ on: e.target.checked })} />
      </label>
      <div className="flex items-center gap-3">
        <label htmlFor="alert-volume" className="text-sm font-medium shrink-0">Volume</label>
        <input id="alert-volume" type="range" min={10} max={100} step={5} value={Math.round(settings.volume * 100)} disabled={!settings.on}
          onChange={(e) => update({ volume: Number(e.target.value) / 100 })} className="w-full min-h-11 accent-sky-600" aria-valuetext={`${Math.round(settings.volume * 100)} percent`} />
        <span className="text-xs text-[#6b6b80] w-9 text-right tabular-nums">{Math.round(settings.volume * 100)}%</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={test} data-testid="play-test-sound">Play test sound</Button>
        {settings.on && audioState === "locked" && <span className="text-xs text-amber-800">Sound is locked until you tap anywhere once.</span>}
      </div>
      <p className="text-xs text-[#6b6b80]">Applies to this phone or computer. On Android the phone also vibrates. When the app is closed, the sound comes from your phone&apos;s notification settings (see the steps above).</p>
    </div>
  );
}
