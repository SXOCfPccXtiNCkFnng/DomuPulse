// Preço por assento (membro ativo) por mês, em centavos. Ajuste antes de vender.
export const PRICE_PER_SEAT_CENTS = 3900;
export const MIN_SEATS = 5;
export const MAX_SEATS = 500;

// Valor mensal com o desconto do cupom, quando houver.
export function monthlyPriceCents(seats: number, percentOff = 0) {
  return Math.round(seats * PRICE_PER_SEAT_CENTS * (1 - percentOff / 100));
}

