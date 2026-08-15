/**
 * calculations.js
 * SINGLE SOURCE OF TRUTH for all numeric business rules.
 * Both spm.js (live UI) and validation.js (pre-submit checks) must call
 * these functions rather than re-implementing the math, so the rules
 * below are the ONLY place they are defined.
 *
 * NON-NEGOTIABLE RULES (see project spec section 39):
 * 1. Set numbers are identifiers ONLY — never included in any quantity math.
 * 2. Only "Kits Incomplete" contributes from the incomplete-set rows.
 * 3. Only "Kits Complete" contributes from the complete-set rows.
 * 4. TOTAL PENDING = MobileInvalid + AddressNotFound + Torn + KitsIncomplete + KitsComplete
 * 5. DELIVERY % = Delivered / KitsCameToday * 100 (0 if KitsCameToday = 0)
 * 6. Delivered + Redirected + TotalPending must NOT exceed KitsCameToday.
 */

const Calculations = (() => {

  /**
   * Sums the "kits incomplete" quantity across all incomplete-set rows.
   * Set numbers themselves are ignored entirely.
   * @param {Array<{setNumber:number, kitsIncomplete:number}>} rows
   */
  function sumIncompleteKits(rows) {
    return (rows || []).reduce((total, row) => {
      const qty = toNonNegativeInt(row.kitsIncomplete);
      return total + qty;
    }, 0);
  }

  /**
   * Sums the "kits complete" quantity across all complete-set rows.
   * Set numbers themselves are ignored entirely.
   * @param {Array<{setNumber:number, kitsComplete:number}>} rows
   */
  function sumCompleteKits(rows) {
    return (rows || []).reduce((total, row) => {
      const qty = toNonNegativeInt(row.kitsComplete);
      return total + qty;
    }, 0);
  }

  /**
   * TOTAL PENDING = MobileInvalid + AddressNotFound + Torn + KitsIncomplete + KitsComplete
   * Set numbers are NEVER part of this sum.
   */
  function calculateTotalPending({
    mobileInvalid = 0,
    addressNotFound = 0,
    torn = 0,
    incompleteRows = [],
    completeRows = []
  }) {
    const kitsIncomplete = sumIncompleteKits(incompleteRows);
    const kitsComplete = sumCompleteKits(completeRows);

    return (
      toNonNegativeInt(mobileInvalid) +
      toNonNegativeInt(addressNotFound) +
      toNonNegativeInt(torn) +
      kitsIncomplete +
      kitsComplete
    );
  }

  /**
   * DELIVERY % = Delivered / KitsCameToday * 100, rounded to 1 decimal.
   * Returns 0 if KitsCameToday is 0 (avoid divide-by-zero).
   */
  function calculateDeliveryPercent(kitsDelivered, kitsCameToday) {
    const came = toNonNegativeInt(kitsCameToday);
    const delivered = toNonNegativeInt(kitsDelivered);
    if (came === 0) return 0;
    const pct = (delivered / came) * 100;
    return Math.round(pct * 10) / 10;
  }

  /**
   * Pending lifecycle (never double-count previous pending):
   * CURRENT PENDING = PREVIOUS CURRENT PENDING + NEW PENDING - RESOLVED PENDING
   */
  function calculateCurrentPending(previousCurrentPending, newPending, resolvedPending = 0) {
    const prev = toNonNegativeInt(previousCurrentPending);
    const fresh = toNonNegativeInt(newPending);
    const resolved = toNonNegativeInt(resolvedPending);
    const result = prev + fresh - resolved;
    return result < 0 ? 0 : result;
  }

  /**
   * Checks rule: Delivered + Redirected + TotalPending must not exceed KitsCameToday.
   * Returns { valid: boolean, sum: number, came: number }
   */
  function checkDeliverySumWithinCame({ kitsCameToday, kitsDelivered, redirected, totalPending }) {
    const came = toNonNegativeInt(kitsCameToday);
    const sum =
      toNonNegativeInt(kitsDelivered) +
      toNonNegativeInt(redirected) +
      toNonNegativeInt(totalPending);
    return { valid: sum <= came, sum, came };
  }

  /** Coerces a value to a non-negative integer, defaulting invalid input to 0. */
  function toNonNegativeInt(value) {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 0) return 0;
    return n;
  }

  return {
    sumIncompleteKits,
    sumCompleteKits,
    calculateTotalPending,
    calculateDeliveryPercent,
    calculateCurrentPending,
    checkDeliverySumWithinCame,
    toNonNegativeInt
  };
})();
