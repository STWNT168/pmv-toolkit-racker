const Calculations = (() => {
  const int = v => { const n = Number(v); return Number.isInteger(n) && n >= 0 ? n : 0; };
  const sumIncompleteKits = rows => (rows||[]).reduce((s,r)=>s+int(r.kitsIncomplete),0);
  const sumCompleteKits = rows => (rows||[]).reduce((s,r)=>s+int(r.kitsComplete),0);
  function calculateTotalPending({mobileInvalid=0,addressNotFound=0,torn=0,incompleteRows=[],completeRows=[]}){
    return int(mobileInvalid)+int(addressNotFound)+int(torn)+sumIncompleteKits(incompleteRows)+sumCompleteKits(completeRows);
  }
  function calculateDeliveryPercent(delivered,came){ const c=int(came); return c ? Math.round(int(delivered)/c*1000)/10 : 0; }
  function checkDeliverySumWithinCame({kitsCameToday,kitsDelivered,redirected,totalPending}){
    const came=int(kitsCameToday), sum=int(kitsDelivered)+int(redirected)+int(totalPending);
    return {valid:sum<=came,sum,came};
  }
  return {sumIncompleteKits,sumCompleteKits,calculateTotalPending,calculateDeliveryPercent,checkDeliverySumWithinCame,toNonNegativeInt:int};
})();
