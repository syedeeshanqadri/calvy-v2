// In-memory stand-ins for the Prisma models the Calvy Levels code touches, to merge into a test's fake db.
export interface LevelRow { identity: string; level: string; levelSince: Date; lastAttendedAt: Date | null; pendingLevelUp: string | null }

export function levelModels(o: { config?: unknown } = {}) {
  const levels = new Map<string, LevelRow>();
  const boosts: { identity: string; month: string }[] = [];
  const grants: { identity: string; tier: string }[] = [];
  const models = {
    levelConfig: { findUnique: async () => (o.config ? { config: o.config } : null) },
    customerLevel: {
      findUnique: async ({ where }: { where: { identity: string } }) => levels.get(where.identity) ?? null,
      upsert: async ({ where, create, update }: { where: { identity: string }; create: Partial<LevelRow>; update: Partial<LevelRow> }) => {
        const cur = levels.get(where.identity);
        const row = cur ? Object.assign(cur, update) : ({ levelSince: new Date(), pendingLevelUp: null, lastAttendedAt: null, ...create } as LevelRow);
        levels.set(where.identity, row);
        return row;
      },
      updateMany: async ({ where, data }: { where: { identity: string }; data: Partial<LevelRow> }) => {
        const cur = levels.get(where.identity);
        if (!cur) return { count: 0 };
        Object.assign(cur, data);
        return { count: 1 };
      },
    },
    fastTrackBoost: {
      createMany: async ({ data }: { data: { identity: string; month: string }[] }) => {
        let c = 0;
        for (const d of data) if (!boosts.some((b) => b.identity === d.identity && b.month === d.month)) { boosts.push(d); c++; }
        return { count: c };
      },
    },
    tierGrant: {
      createMany: async ({ data }: { data: { identity: string; tier: string }[] }) => {
        let c = 0;
        for (const d of data) if (!grants.some((g) => g.identity === d.identity && g.tier === d.tier)) { grants.push(d); c++; }
        return { count: c };
      },
    },
  };
  return { models, levels, boosts, grants };
}
