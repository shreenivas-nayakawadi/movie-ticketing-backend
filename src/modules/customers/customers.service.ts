import { prisma } from '../../lib/prisma';
import { getLoyaltySummary } from '../loyalty/loyalty.service';

// Return loyalty balance plus recent ledger rows for customer dashboard.
export async function getCustomerLoyaltyProfile(customerEmail: string) {
  const summary = await getLoyaltySummary(customerEmail);

  const recentTransactions = await prisma.loyaltyLedger.findMany({
    where: { customerEmail },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return {
    customerEmail,
    balancePoints: summary.balancePoints,
    earnedPoints: summary.earnedPoints,
    redeemedPoints: summary.redeemedPoints,
    adjustmentPoints: summary.adjustmentPoints,
    recentTransactions: recentTransactions.map((entry) => ({
      id: entry.id,
      type: entry.type,
      points: entry.points,
      reason: entry.reason,
      bookingId: entry.bookingId,
      createdAt: entry.createdAt,
    })),
  };
}
