/**
 * The secret token for a booking is kept only in this browser (localStorage),
 * never in the URL, so sharing/bookmarking the payment page link does not leak it.
 */
const key = (orderNo: string) => `skd.booking.${orderNo}`;

export function saveBookingToken(orderNo: string, token: string) {
  try {
    localStorage.setItem(key(orderNo), token);
  } catch {
    /* storage unavailable (private mode): user will be told to keep the page open */
  }
}

export function loadBookingToken(orderNo: string): string | null {
  try {
    return localStorage.getItem(key(orderNo));
  } catch {
    return null;
  }
}
