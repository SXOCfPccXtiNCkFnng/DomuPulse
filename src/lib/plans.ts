// Preço por assento (membro ativo) por mês, em centavos. Ajuste antes de vender.
export const PRICE_PER_SEAT_CENTS = 3900;
export const MIN_SEATS = 5;
export const MAX_SEATS = 500;

export function monthlyPriceCents(seats: number) {
  return seats * PRICE_PER_SEAT_CENTS;
}

export function seatsForPayment(valueCents: number) {
  return Math.max(MIN_SEATS, Math.min(MAX_SEATS, Math.floor(valueCents / PRICE_PER_SEAT_CENTS)));
}
