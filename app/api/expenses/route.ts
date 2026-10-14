import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const month = searchParams.get("month"); // e.g. "2024-01"

  let dateFilter = {};
  if (month) {
    const [y, m] = month.split("-").map(Number);
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0, 23, 59, 59);
    dateFilter = { date: { gte: start, lte: end } };
  }

  const expenses = await prisma.expense.findMany({
    where: { businessId: session.user.businessId, ...dateFilter },
    orderBy: { date: "desc" },
  });

  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, category, description, date } = await req.json();
  if (!amount || amount <= 0) return NextResponse.json({ error: "Valid amount required" }, { status: 400 });
  if (!category) return NextResponse.json({ error: "Category required" }, { status: 400 });

  const expense = await prisma.expense.create({
    data: {
      businessId: session.user.businessId,
      amount: parseFloat(amount),
      category,
      description: description?.trim() || null,
      date: date ? new Date(date) : new Date(),
    },
  });

  return NextResponse.json(expense, { status: 201 });
}
