/**
 * validation.js
 * Frontend validation. This is a CONVENIENCE layer for fast user feedback only.
 * The Apps Script backend (Code.gs) re-validates everything independently —
 * frontend validation must never be treated as sufficient on its own.
 */

const Validation = (() => {

  /**
   * Validates a daily record before submission.
   * @param {Object} record - shape produced by spm.js's collectFormData()
   * @returns {{valid: boolean, errors: string[]}}
   */
  function validateDailyRecord(record) {
    const errors = [];

    // Required fields
    if (!record.date) errors.push("Date is required.");
    if (!record.officeId) errors.push("Office is required.");
    if (record.kitsCameToday === null || record.kitsCameToday === undefined || record.kitsCameToday === "") {
      errors.push("Kits Came Today is required.");
    }

    // Integer / non-negative checks on all quantity fields
    const quantityFields = {
      "Kits Came Today": record.kitsCameToday,
      "Kits Delivered": record.kitsDelivered,
      "Redirected": record.redirected,
      "Mobile Number Invalid": record.mobileInvalid,
      "Address Not Found": record.addressNotFound,
      "Torn Condition": record.torn
    };

    for (const [label, value] of Object.entries(quantityFields)) {
      if (value !== "" && value !== null && value !== undefined) {
        if (!isNonNegativeInteger(value)) {
          errors.push(`${label} must be a whole number that is zero or greater.`);
        }
      }
    }

    // Set rows: set numbers and quantities must be integers
    (record.incompleteRows || []).forEach((row, idx) => {
      if (row.setNumber !== "" && !isInteger(row.setNumber)) {
        errors.push(`Incomplete Set row ${idx + 1}: Set number must be an integer.`);
      }
      if (row.kitsIncomplete !== "" && !isNonNegativeInteger(row.kitsIncomplete)) {
        errors.push(`Incomplete Set row ${idx + 1}: Kits Incomplete must be zero or greater.`);
      }
    });

    (record.completeRows || []).forEach((row, idx) => {
      if (row.setNumber !== "" && !isInteger(row.setNumber)) {
        errors.push(`Complete Set row ${idx + 1}: Set number must be an integer.`);
      }
      if (row.kitsComplete !== "" && !isNonNegativeInteger(row.kitsComplete)) {
        errors.push(`Complete Set row ${idx + 1}: Kits Complete must be zero or greater.`);
      }
    });

    // Business rule: Delivered + Redirected + TotalPending must not exceed KitsCameToday
    if (errors.length === 0) {
      const totalPending = Calculations.calculateTotalPending({
        mobileInvalid: record.mobileInvalid,
        addressNotFound: record.addressNotFound,
        torn: record.torn,
        incompleteRows: record.incompleteRows,
        completeRows: record.completeRows
      });

      const check = Calculations.checkDeliverySumWithinCame({
        kitsCameToday: record.kitsCameToday,
        kitsDelivered: record.kitsDelivered,
        redirected: record.redirected,
        totalPending
      });

      if (!check.valid) {
        errors.push(
          `Delivered + Redirected + Pending (${check.sum}) exceeds Kits Came Today (${check.came}). Please recheck the figures.`
        );
      }
    }

    return { valid: errors.length === 0, errors };
  }

  function isInteger(value) {
    if (value === "" || value === null || value === undefined) return false;
    const n = Number(value);
    return Number.isInteger(n);
  }

  function isNonNegativeInteger(value) {
    return isInteger(value) && Number(value) >= 0;
  }

  return { validateDailyRecord, isInteger, isNonNegativeInteger };
})();
