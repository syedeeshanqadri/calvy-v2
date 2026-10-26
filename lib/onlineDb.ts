import { prisma } from "@/lib/prisma";
import { meetingUrlFor } from "@/lib/online";

/**
 * The meeting link of one appointment (null when it is not online or no link is set).
 * Only call this for a viewer who is already authorised: the booker right after booking, someone holding
 * the signed tracking code, the signed-in customer who owns it, or staff of that business.
 */
export async function loadMeetingUrl(appointmentId: string): Promise<string | null> {
  const a = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    select: { isOnline: true, meetingUrl: true, service: { select: { meetingUrl: true } }, staff: { select: { meetingUrl: true } } },
  });
  return a ? meetingUrlFor(a) : null;
}
