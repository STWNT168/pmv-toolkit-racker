const Validation = (() => {
  function validateDailyRecord(r) {
    const e = [];
    if (!r.date) e.push("Date is required.");
    if (!r.officeId) e.push("Office is required.");

    const fields = {
      "All Kits / Total Kits": r.allKits,
      "Similar Article / Tool Kit Article": r.similarArticle,
      "Invalid Mobile Kits": r.invalidMobileKits,
      "Deliverable Kits": r.deliverableKits,
      "Incomplete Kits": r.incompleteKits,
      "Without Proper Details / Address Kits": r.withoutProperDetailsKits,
      "Invalid Mobile Articles": r.invalidMobileArticles,
      "Deliverable Articles": r.deliverableArticles,
      "Incomplete Articles": r.incompleteArticles,
      "Without Proper Details / Address Articles": r.withoutProperDetailsArticles
    };

    for (const [label, value] of Object.entries(fields)) {
      if (!isNonNegativeInteger(value)) {
        e.push(`${label} must be a whole number that is zero or greater.`);
      }
    }

    if (!e.length) {
      const kc = Calculations.kitCheck(r);
      const ac = Calculations.articleCheck(r);
      if (!kc.valid) e.push(`Kit total mismatch: ${kc.total} does not equal category total ${kc.categories}.`);
      if (!ac.valid) e.push(`Article total mismatch: ${ac.total} does not equal category total ${ac.categories}.`);
    }

    return { valid: !e.length, errors: e };
  }

  function isNonNegativeInteger(v) {
    return (typeof v === "number" && Number.isInteger(v) && v >= 0) ||
      (typeof v === "string" && /^\d+$/.test(v.trim()));
  }

  return { validateDailyRecord, isNonNegativeInteger };
})();
