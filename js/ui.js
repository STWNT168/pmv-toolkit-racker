const UI = (() => {
  const $=id=>document.getElementById(id);
  const pad=n=>String(n).padStart(2,"0");
  function todayISO(){const d=new Date();return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function previousDateISO(date){const d=new Date(date+"T00:00:00");d.setDate(d.getDate()-1);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;}
  function setText(id,v){const e=$(id);if(e)e.textContent=String(v??"");}
  function toast(msg,type="info",ms=4000){const c=$("toast-container");if(!c)return;const e=document.createElement("div");e.className=`toast ${type}`;e.textContent=msg;c.appendChild(e);setTimeout(()=>e.remove(),ms);}
  function confirmModal(title,msg,ok="OK"){return new Promise(resolve=>{const b=$("modal-backdrop"),m=$("modal");if(!b||!m){resolve(window.confirm(msg.replace(/<[^>]+>/g,"")));return}m.innerHTML=`<h3>${title}</h3><div>${msg}</div><div class="modal-actions"><button id="modal-no">Cancel</button><button id="modal-yes" class="btn btn-primary">${ok}</button></div>`;b.classList.remove("hidden");$("modal-no").onclick=()=>{b.classList.add("hidden");resolve(false)};$("modal-yes").onclick=()=>{b.classList.add("hidden");resolve(true)}});}
  return {todayISO,previousDateISO,setText,toast,confirmModal};
})();
