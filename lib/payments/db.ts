import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { PaymentEventStore } from "./events";

/** PaymentEventStore over Prisma: the event row and the payment update commit together. */
export const prismaPaymentEventStore: PaymentEventStore<Prisma.TransactionClient> = {
  transaction: (fn) => prisma.$transaction(fn),

  async recordEvent(tx, provider, event) {
    try {
      await tx.webhookEvent.create({ data: { provider, eventId: event.eventId, kind: event.kind } });
      return true;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return false;
      throw e;
    }
  },

  async findPayment(tx, provider, providerOrderId) {
    return tx.payment.findFirst({
      where: { provider, providerOrderId },
      select: { id: true, status: true, amountMinor: true },
    });
  },

  async updatePayment(tx, id, data) {
    await tx.payment.update({ where: { id }, data });
  },
};
