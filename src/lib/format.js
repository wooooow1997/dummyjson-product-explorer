const currency = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const compact = new Intl.NumberFormat('en-US', { notation: 'compact' });

/** `19.99` -> `$19.99`. Missing/invalid input renders as an em dash rather than `$NaN`. */
export function formatPrice(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? currency.format(amount) : '—';
}

export function formatCompact(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? compact.format(amount) : '—';
}

/** Price before the advertised discount, used to show a struck-through original. */
export function originalPrice(price, discountPercentage) {
  const amount = Number(price);
  const discount = Number(discountPercentage);
  if (!Number.isFinite(amount) || !Number.isFinite(discount) || discount <= 0) return null;
  return amount / (1 - discount / 100);
}

export function formatRating(value) {
  const rating = Number(value);
  return Number.isFinite(rating) ? rating.toFixed(1) : '—';
}

/** `mens-watches` -> `Mens Watches` */
export function titleCase(slug) {
  return String(slug ?? '')
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/** Text fallback for the ~30% of DummyJSON records that omit `brand`. */
export function orDash(value) {
  const text = String(value ?? '').trim();
  return text || '—';
}
