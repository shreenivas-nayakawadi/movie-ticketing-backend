import { env } from '../../config/env';
import { HttpError } from '../../lib/http-error';

export type ConcessionRequest = {
  itemCode: string;
  quantity: number;
};

type ConcessionMenuItem = {
  code: string;
  name: string;
  unitPriceCents: number;
};

export type PricingComboRule = {
  minTickets: number;
  targetSku: string;
  discountPercent: number;
} | null;

export type PricingConcessionLine = {
  itemCode: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  lineSubtotalCents: number;
  discountCents: number;
  payableCents: number;
  discountedQuantity: number;
  discountPercentApplied: number;
};

export type PersistedConcessionItem = {
  sku: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  discountPercent: number;
};

export type CheckoutPricingResult = {
  ticketCount: number;
  ticketSubtotalCents: number;
  concessionSubtotalCents: number;
  subtotalCents: number;
  comboDiscountCents: number;
  loyaltyRedeemPointsUsed: number;
  loyaltyRedeemCents: number;
  totalDiscountCents: number;
  payableTotalCents: number;
  earnedPoints: number;
  concessions: PricingConcessionLine[];
  persistedConcessionItems: PersistedConcessionItem[];
};

const CONCESSION_MENU: Record<string, ConcessionMenuItem> = {
  LARGE_POPCORN: {
    code: 'LARGE_POPCORN',
    name: 'Large Popcorn',
    unitPriceCents: 30000,
  },
  MEDIUM_POPCORN: {
    code: 'MEDIUM_POPCORN',
    name: 'Medium Popcorn',
    unitPriceCents: 22000,
  },
  COKE: {
    code: 'COKE',
    name: 'Coke',
    unitPriceCents: 12000,
  },
};

// Convert raw concession array into grouped quantities by SKU.
function normalizeConcessions(concessions: ConcessionRequest[]): Map<string, number> {
  const grouped = new Map<string, number>();

  for (const concession of concessions) {
    const itemCode = concession.itemCode.trim().toUpperCase();
    if (!itemCode) {
      throw new HttpError(400, 'Concession code is required', 'INVALID_CONCESSION');
    }

    if (!Number.isInteger(concession.quantity) || concession.quantity <= 0) {
      throw new HttpError(
        400,
        `Invalid quantity for concession ${itemCode}`,
        'INVALID_CONCESSION_QUANTITY',
      );
    }

    const menuItem = CONCESSION_MENU[itemCode];
    if (!menuItem) {
      throw new HttpError(400, `Unsupported concession item: ${itemCode}`, 'INVALID_CONCESSION');
    }

    const existing = grouped.get(itemCode) ?? 0;
    grouped.set(itemCode, existing + concession.quantity);
  }

  return grouped;
}

// Build pricing lines from grouped concessions and static menu pricing.
function buildConcessionLines(groupedConcessions: Map<string, number>): PricingConcessionLine[] {
  const lines: PricingConcessionLine[] = [];

  for (const [itemCode, quantity] of groupedConcessions.entries()) {
    const menuItem = CONCESSION_MENU[itemCode];
    if (!menuItem) {
      throw new HttpError(400, `Unsupported concession item: ${itemCode}`, 'INVALID_CONCESSION');
    }

    const lineSubtotalCents = quantity * menuItem.unitPriceCents;
    lines.push({
      itemCode,
      name: menuItem.name,
      quantity,
      unitPriceCents: menuItem.unitPriceCents,
      lineSubtotalCents,
      discountCents: 0,
      payableCents: lineSubtotalCents,
      discountedQuantity: 0,
      discountPercentApplied: 0,
    });
  }

  return lines;
}

// Apply "buy N tickets -> discount target SKU" combo rule to concession lines.
function applyComboDiscount(
  concessionLines: PricingConcessionLine[],
  ticketCount: number,
  comboRule: PricingComboRule,
): number {
  if (!comboRule) {
    return 0;
  }

  if (ticketCount < comboRule.minTickets) {
    return 0;
  }

  const targetLine = concessionLines.find(
    (line: PricingConcessionLine) => line.itemCode === comboRule.targetSku,
  );

  if (!targetLine) {
    return 0;
  }

  const eligibleQuantity = Math.min(targetLine.quantity, Math.floor(ticketCount / comboRule.minTickets));
  if (eligibleQuantity <= 0) {
    return 0;
  }

  const discountPerUnitCents = Math.round(
    (targetLine.unitPriceCents * comboRule.discountPercent) / 100,
  );
  const comboDiscountCents = eligibleQuantity * discountPerUnitCents;

  targetLine.discountCents = comboDiscountCents;
  targetLine.payableCents = targetLine.lineSubtotalCents - comboDiscountCents;
  targetLine.discountedQuantity = eligibleQuantity;
  targetLine.discountPercentApplied = comboRule.discountPercent;

  return comboDiscountCents;
}

// Prepare concession rows to persist on ConcessionOrder with accurate discount split.
function buildPersistedConcessionItems(
  concessionLines: PricingConcessionLine[],
): PersistedConcessionItem[] {
  const items: PersistedConcessionItem[] = [];

  for (const line of concessionLines) {
    if (line.discountedQuantity > 0) {
      items.push({
        sku: line.itemCode,
        name: line.name,
        quantity: line.discountedQuantity,
        unitPriceCents: line.unitPriceCents,
        discountPercent: line.discountPercentApplied,
      });
    }

    const nonDiscountedQuantity = line.quantity - line.discountedQuantity;
    if (nonDiscountedQuantity > 0) {
      items.push({
        sku: line.itemCode,
        name: line.name,
        quantity: nonDiscountedQuantity,
        unitPriceCents: line.unitPriceCents,
        discountPercent: 0,
      });
    }
  }

  return items;
}

// Compute total checkout pricing from ticket prices, concessions, combo and loyalty redemption.
export function calculateCheckoutPricing(input: {
  ticketPricesCents: number[];
  concessions: ConcessionRequest[];
  comboRule: PricingComboRule;
  redeemPointsRequested: number;
  availableLoyaltyPoints: number;
}): CheckoutPricingResult {
  const ticketCount = input.ticketPricesCents.length;
  if (ticketCount <= 0) {
    throw new HttpError(409, 'No seats found in hold for checkout', 'EMPTY_HOLD');
  }

  const ticketSubtotalCents = input.ticketPricesCents.reduce(
    (sum: number, priceCents: number) => sum + priceCents,
    0,
  );

  const groupedConcessions = normalizeConcessions(input.concessions);
  const concessionLines = buildConcessionLines(groupedConcessions);
  const concessionSubtotalCents = concessionLines.reduce(
    (sum: number, line: PricingConcessionLine) => sum + line.lineSubtotalCents,
    0,
  );

  const comboDiscountCents = applyComboDiscount(concessionLines, ticketCount, input.comboRule);
  const subtotalCents = ticketSubtotalCents + concessionSubtotalCents;
  const payableBeforeLoyaltyCents = subtotalCents - comboDiscountCents;

  if (input.redeemPointsRequested > input.availableLoyaltyPoints) {
    throw new HttpError(422, 'Not enough loyalty points to redeem', 'LOYALTY_INSUFFICIENT_POINTS');
  }

  const maxRedeemablePoints = Math.floor(payableBeforeLoyaltyCents / env.LOYALTY_POINT_VALUE_CENTS);
  if (input.redeemPointsRequested > maxRedeemablePoints) {
    throw new HttpError(
      422,
      'Redeem points exceed payable amount',
      'LOYALTY_REDEEM_EXCEEDS_TOTAL',
    );
  }

  const loyaltyRedeemPointsUsed = input.redeemPointsRequested;
  const loyaltyRedeemCents = loyaltyRedeemPointsUsed * env.LOYALTY_POINT_VALUE_CENTS;
  const totalDiscountCents = comboDiscountCents + loyaltyRedeemCents;
  const payableTotalCents = subtotalCents - totalDiscountCents;
  const earnedPoints = Math.floor(
    payableTotalCents / (env.LOYALTY_EARN_PER_CURRENCY_UNIT * env.LOYALTY_POINT_VALUE_CENTS),
  );

  return {
    ticketCount,
    ticketSubtotalCents,
    concessionSubtotalCents,
    subtotalCents,
    comboDiscountCents,
    loyaltyRedeemPointsUsed,
    loyaltyRedeemCents,
    totalDiscountCents,
    payableTotalCents,
    earnedPoints,
    concessions: concessionLines,
    persistedConcessionItems: buildPersistedConcessionItems(concessionLines),
  };
}
