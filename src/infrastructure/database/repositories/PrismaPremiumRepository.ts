import type { PrismaClient } from "@prisma/client";

import type { PremiumRepository } from "../../../application/ports/Repositories";

export class PrismaPremiumRepository implements PremiumRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async hasPremium(userId: string): Promise<boolean> {
    const premium = await this.prisma.premium.findUnique({ where: { userId } });
    if (!premium) {
      return false;
    }
    if (premium.tier === "FREE") {
      return false;
    }
    return !premium.expiresAt || premium.expiresAt.getTime() > Date.now();
  }
}
