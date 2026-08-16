const AdminDashboard=(()=>{let initialized=false;
function init(){if(initialized)return;initialized=true;const s=Auth.getSession();if(!["ADMIN","DPS"].includes(String(s?.role||"").toUpperCase()))return;const d=document.getElementById("admin-dashboard-date"),b=document.getElementById("admin-dashboard-refresh");if(!d||!b)return;const t=UI.todayISO();d.value=t;d.max=t;b.onclick=()=>load(d.value);d.onchange=()=>load(d.value);load(t);}
async function load(date){const status=document.getElementById("admin-dashboard-status"),b=document.getElementById("admin-dashboard-refresh");if(b)b.disabled=true;try{const x=await AdminDashboardApi.getUpdateStatus(date);render(x);status.textContent=`Updated ${new Date().toLocaleTimeString()}`;status.className="admin-status admin-status-success"}catch(e){status.textContent=e.message||"Unable to load dashboard.";status.className="admin-status admin-status-error"}finally{if(b)b.disabled=false}}
function render(d){
  const n=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=String(v??"")};
  n("admin-updated-count",d.spmsUpdatedToday||0);
  n("admin-total-count",d.activeSpms||0);
  n("admin-pending-count",d.spmsPendingUpdate||0);
  n("admin-completion-percent",`${Number(d.completionPercentage||0)}%`);
  n("admin-selected-date",d.date||"—");
  const bar=document.getElementById("admin-progress-bar");
  if(bar)bar.style.width=`${Math.max(0,Math.min(100,Number(d.completionPercentage||0)))}%`;

  const o=document.getElementById("admin-office-rows");
  o.replaceChildren();
  (d.officeWise||[]).forEach(x=>{
    const tr=document.createElement("tr");
    [
      x.officeName,x.totalSpms,x.updatedSpms,x.pendingSpms,
      `${Number(x.completionPercentage||0)}%`,
      x.kitsCameToday??0,x.kitsDelivered??0,x.redirected??0,
      x.mobileInvalid??0,x.addressNotFound??0,x.torn??0,
      x.kitsIncomplete??0,x.kitsComplete??0,x.totalPending??0,
      `${Number(x.deliveryPercentage||0).toFixed(1)}%`
    ].forEach(v=>{
      const td=document.createElement("td");
      td.textContent=String(v);
      tr.appendChild(td);
    });
    o.appendChild(tr);
  });
  if(!o.children.length)o.innerHTML='<tr><td colspan="16">No active SPM offices found.</td></tr>';

  const p=document.getElementById("admin-pending-rows");
  p.replaceChildren();
  (d.pendingSpms||[]).forEach((x,i)=>{
    const tr=document.createElement("tr");
    [i+1,x.spmName,x.spmId,x.officeName,"Not updated"].forEach(v=>{
      const td=document.createElement("td");td.textContent=String(v||"—");tr.appendChild(td);
    });
    p.appendChild(tr);
  });
  if(!p.children.length)p.innerHTML='<tr><td colspan="5">All active SPMs have updated.</td></tr>';

  const detailed=document.getElementById("admin-detailed-rows");
  if(detailed){
    detailed.replaceChildren();
    (d.detailedSpmData||[]).forEach((x,i)=>{
      const tr=document.createElement("tr");
      [
        i+1,x.officeName,x.spmName,x.spmId,x.status,
        x.kitsCameToday??0,x.kitsDelivered??0,x.redirected??0,
        x.mobileInvalid??0,x.addressNotFound??0,x.torn??0,
        x.kitsIncomplete??0,x.kitsComplete??0,x.totalPending??0,
        `${Number(x.deliveryPercentage||0).toFixed(1)}%`
      ].forEach(v=>{
        const td=document.createElement("td");td.textContent=String(v??"—");tr.appendChild(td);
      });
      detailed.appendChild(tr);
    });
    if(!detailed.children.length)detailed.innerHTML='<tr><td colspan="15">No records found for the selected date.</td></tr>';
  }
}
return{init,load};})();
