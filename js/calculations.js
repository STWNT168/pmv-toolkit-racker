const Calculations = (() => {
  const int = v => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? n : 0;
  };

  const kitTotal = r =>
    int(r.invalidMobileKits) +
    int(r.deliverableKits) +
    int(r.incompleteKits) +
    int(r.withoutProperDetailsKits);

  const articleTotal = r =>
    int(r.invalidMobileArticles) +
    int(r.deliverableArticles) +
    int(r.incompleteArticles) +
    int(r.withoutProperDetailsArticles);

  const kitCheck = r => ({
    total: int(r.allKits),
    categories: kitTotal(r),
    valid: int(r.allKits) === kitTotal(r)
  });

  const articleCheck = r => ({
    total: int(r.similarArticle),
    categories: articleTotal(r),
    valid: int(r.similarArticle) === articleTotal(r)
  });

  function calculateTotalPending(r) {
    return int(r.invalidMobileKits) +
      int(r.incompleteKits) +
      int(r.withoutProperDetailsKits);
  }

  function calculateDeliveryPercent(delivered, total) {
    const t = int(total);
    return t ? Math.round(int(delivered) / t * 1000) / 10 : 0;
  }

  return {
    kitTotal, articleTotal, kitCheck, articleCheck,
    calculateTotalPending, calculateDeliveryPercent,
    toNonNegativeInt: int
  };
})();
