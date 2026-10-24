import { describe, it, expect, vi } from "vitest";
import { findOrCreateClient } from "@/lib/clients";

const victim = { id: "c1", businessId: "biz", name: "Victim", email: null as string | null, phone: "+919876543210" };

function fakeDb(existing: typeof victim | null) {
  return {
    client: {
      findFirst: vi.fn(async ({ where }: { where: { phone?: string; email?: unknown } }) =>
        existing && where.phone && where.phone === existing.phone ? existing : null),
      update: vi.fn(async ({ data }: { data: object }) => ({ ...existing, ...data })),
      create: vi.fn(async ({ data }: { data: object }) => ({ id: "new", ...data })),
    },
  } as never;
}

describe("findOrCreateClient: public input cannot rewrite or hijack a client", () => {
  it("public booking quoting a known phone with no email reuses the record without editing it", async () => {
    const db = fakeDb(victim);
    const c = await findOrCreateClient(db, "biz", { name: "X", phone: "98765 43210" }, "Asia/Kolkata");
    expect(c.id).toBe("c1");
    expect((db as any).client.update).not.toHaveBeenCalled();
  });

  it("public booking with the victim's phone and a different email never gets the email attached", async () => {
    const db = fakeDb({ ...victim, email: "victim@x.com" });
    const c = await findOrCreateClient(db, "biz", { name: "Attacker", email: "evil@x.com", phone: "+919876543210" }, "Asia/Kolkata");
    expect(c.id).toBe("new"); // a separate client, without the taken phone
    expect((db as any).client.create).toHaveBeenCalledWith({ data: { businessId: "biz", name: "Attacker", email: "evil@x.com", phone: null } });
    expect((db as any).client.update).not.toHaveBeenCalled();
  });

  it("public booking never fills in a missing email on a phone match", async () => {
    const db = fakeDb(victim);
    await findOrCreateClient(db, "biz", { name: "X", email: "new@x.com", phone: "+919876543210" }, "Asia/Kolkata");
    expect((db as any).client.update).not.toHaveBeenCalled();
  });

  it("owner-entered details (trusted) match on phone alone and fill the missing email", async () => {
    const db = fakeDb(victim);
    const c = await findOrCreateClient(db, "biz", { name: "X", email: "new@x.com", phone: "+919876543210" }, "Asia/Kolkata", { trusted: true });
    expect(c.id).toBe("c1");
    expect((db as any).client.update).toHaveBeenCalledWith({ where: { id: "c1" }, data: { email: "new@x.com" } });
  });
});
