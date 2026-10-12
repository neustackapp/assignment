// All money is an integer number of minor units (cents). No floats are ever stored or summed.

export function assertCents(value: number, label = 'amount'): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${label} must be a non-negative integer number of cents`);
  }
  return value;
}

// Percentage discount, rounded half-up to the nearest cent using integer math only,
// then capped at the subtotal so a total can never go negative.
export function percentDiscountCents(subtotalCents: number, percent: number): number {
  const discount = Math.floor((subtotalCents * percent + 50) / 100);
  return Math.min(discount, subtotalCents);
}
