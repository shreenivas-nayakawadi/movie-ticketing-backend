import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../lib/prisma';

type LoyaltyClient = Prisma.TransactionClient | PrismaClient;

export type LoyaltySummary = {
  customerEmail: string;
  balancePoints: number;
  earnedPoints: number;
  redeemedPoints: number;
  adjustmentPoints: number;
};

// Convert ledger rows into customer point totals and running balance.
function summarizeLoyalty(customerEmail: string, entries: Array<{ points: number; type: string }>) {
  let earnedPoints = 0;
  let redeemedPoints = 0;
  let adjustmentPoints = 0;

  for (const entry of entries) {
    if (entry.type === 'EARN') {
      earnedPoints += entry.points;
    } else if (entry.type === 'REDEEM') {
      redeemedPoints += entry.points;
    } else {
      adjustmentPoints += entry.points;
    }
  }

  const balancePoints = earnedPoints + adjustmentPoints - redeemedPoints;
  return {
    customerEmail,
    balancePoints,
    earnedPoints,
    redeemedPoints,
    adjustmentPoints,
  };
}

// Read complete loyalty summary for a customer from ledger history.
export async function getLoyaltySummary(
  customerEmail: string,
  client: LoyaltyClient = prisma,
): Promise<LoyaltySummary> {
  const entries = await client.loyaltyLedger.findMany({
    where: { customerEmail },
    select: {
      points: true,
      type: true,
    },
  });

  return summarizeLoyalty(customerEmail, entries);
}

// Fetch the latest customer loyalty balance in points.
export async function getLoyaltyBalance(
  customerEmail: string,
  client: LoyaltyClient = prisma,
): Promise<number> {
  const summary = await getLoyaltySummary(customerEmail, client);
  return summary.balancePoints;
}

// Prepare loyalty ledger rows for redeem/earn side-effects during checkout.
export function buildCheckoutLoyaltyEntries(input: {
  bookingId: string;
  customerEmail: string;
  redeemedPoints: number;
  earnedPoints: number;
}): Prisma.LoyaltyLedgerCreateManyInput[] {
  const rows: Prisma.LoyaltyLedgerCreateManyInput[] = [];

  if (input.redeemedPoints > 0) {
    rows.push({
      bookingId: input.bookingId,
      customerEmail: input.customerEmail,
      points: input.redeemedPoints,
      type: 'REDEEM',
      reason: 'Redeemed at checkout',
    });
  }

  if (input.earnedPoints > 0) {
    rows.push({
      bookingId: input.bookingId,
      customerEmail: input.customerEmail,
      points: input.earnedPoints,
      type: 'EARN',
      reason: 'Earned from confirmed booking',
    });
  }

  return rows;
}
