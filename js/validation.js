const Validation = (() => {
  function validateDailyRecord(r){
    const e=[];
    if(!r.date)e.push("Date is required.");
    if(!r.officeId)e.push("Office is required.");
    if(r.kitsCameToday===""||r.kitsCameToday==null)e.push("Kits Came Today is required.");
    for(const [label,v] of Object.entries({
      "Kits Came Today":r.kitsCameToday,"Kits Delivered":r.kitsDelivered,"Redirected":r.redirected,
      "Mobile Number Invalid":r.mobileInvalid,"Address Not Found":r.addressNotFound,"Torn Condition":r.torn
    })) if(v!==""&&v!=null&&!isNonNegativeInteger(v)) e.push(`${label} must be a whole number that is zero or greater.`);
    for(const [kind,rows,key] of [["Incomplete",r.incompleteRows,"kitsIncomplete"],["Complete",r.completeRows,"kitsComplete"]]){
      (rows||[]).forEach((row,i)=>{
        if(row.setNumber!==""&&!isNonNegativeInteger(row.setNumber))e.push(`${kind} Set row ${i+1}: Set number must be a whole number.`);
        if(!isNonNegativeInteger(row[key]))e.push(`${kind} Set row ${i+1}: quantity must be a whole number.`);
      });
    }
    if(!e.length){
      const p=Calculations.calculateTotalPending(r);
      const c=Calculations.checkDeliverySumWithinCame({kitsCameToday:r.kitsCameToday,kitsDelivered:r.kitsDelivered,redirected:r.redirected,totalPending:p});
      if(!c.valid)e.push(`Delivered + Redirected + Pending (${c.sum}) exceeds Kits Came Today (${c.came}).`);
    }
    return {valid:!e.length,errors:e};
  }
  function isNonNegativeInteger(v){ return (typeof v==="number"&&Number.isInteger(v)&&v>=0)||(typeof v==="string"&&/^\d+$/.test(v.trim())); }
  return {validateDailyRecord,isNonNegativeInteger};
})();
