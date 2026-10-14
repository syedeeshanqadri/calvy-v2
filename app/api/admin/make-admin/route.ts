import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = 'force-dynamic';

// Grant admin role. Two allowed callers:
//   1. An existing admin (session-based), or
//   2. Bootstrap: ADMIN_SETUP_SECRET, but ONLY while no admin exists yet.
// Once an admin exists, the secret path is closed so a leaked secret can't be
// used to escalate.
export async function POST(req: NextRequest) {
  const { email, secret } = await req.json();
  if (!email) return NextResponse.json({ error: "Email is required" }, { status: 400 });

  const session = await getServerSession(authOptions);
  const callerIsAdmin =
    session?.user?.role === "admin" ||
    (!!process.env.SUPER_ADMIN_EMAIL && session?.user?.email === process.env.SUPER_ADMIN_EMAIL);

  const adminCount = await prisma.user.count({ where: { role: "admin" } });
  const secretValid = !!secret && secret === process.env.ADMIN_SETUP_SECRET;
  const bootstrapAllowed = adminCount === 0 && secretValid;

  if (!callerIsAdmin && !bootstrapAllowed) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target = await prisma.user.findUnique({ where: { email } });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  const user = await prisma.user.update({
    where: { email },
    data: { role: "admin" },
  });

  return NextResponse.json({ id: user.id, email: user.email, role: user.role });
}
