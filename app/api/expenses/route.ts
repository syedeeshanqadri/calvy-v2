import { safeRoute } from "@/lib/api";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

import { parseBody, parseQuery } from "@/lib/validation/common";
import { expenseCreateSchema, expenseListQuery } from "@/lib/validation/dashboard";

export const dynamic = "force-dynamic";

async function GET_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const q = parseQuery(req.url, expenseListQuery);
  if (!q.ok) return q.res;
  const { month } = q.data; // e.g. "2024-01"

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

async function POST_handler(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.businessId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = await parseBody(req, expenseCreateSchema);
  if (!parsed.ok) return parsed.res;
  const { amount, category, description, date } = parsed.data;

  const expense = await prisma.expense.create({
    data: {
      businessId: session.user.businessId,
      amount,
      category,
      description: description || null,
      date: date ? new Date(date) : new Date(),
    },
  });

  return NextResponse.json(expense, { status: 201 });
}

export const GET = safeRoute(GET_handler);
export const POST = safeRoute(POST_handler);
