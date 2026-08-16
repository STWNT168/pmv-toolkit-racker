const SPREADSHEET_ID="1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";
const SHEETS={DAILY_DATA:"DAILY_DATA",OFFICE_MASTER:"OFFICE_MASTER",USER_MASTER:"USER_MASTER",SET_TRACKER:"SET_TRACKER",AUDIT_LOG:"AUDIT_LOG",SESSIONS:"SESSIONS"};
const ROLES={SPM:"SPM",DPS:"DPS",ADMIN:"ADMIN"};
const SESSION_DAYS=7;

function doGet(e){try{const p=e?.parameter||{},a=p.action,s=needsSession(p.session);switch(a){
case"getOfficeList":return out(getOfficeList(s));
case"getUser":return out(getUser(p.userId,s));
case"getPreviousDay":return out(getPreviousDay(p.officeId,p.date,s));
case"getOwnTodayRecord":return out(getOwnTodayRecord(s));
case"getAdminTodayUpdateStatus":return out(getAdminTodayUpdateStatus(s,p.date||todayISO()));
default:return out(err("Unknown GET action."));
}}catch(x){return out(err(x.message))}}

function doPost(e){try{const b=JSON.parse(e?.postData?.contents||"{}");switch(b.action){
case"login":return out(login(b.userId,b.mobile));
case"logout":return out(logout(b.session));
case"submitDailyRecord":return out(submitDailyRecord(b.record,b.session));
case"syncOfflineRecord":return out(submitDailyRecord(b.record,b.session));
case"updateDailyRecord":return out(updateDailyRecord(b.record,b.session));
case"deleteOwnTodayRecord":return out(deleteOwnTodayRecord(b.session,b.recordId));
default:return out(err("Unknown POST action."));
}}catch(x){return out(err(x.message))}}

function login(userId,mobile){const u=findUser(userId);if(!u)return err("User not found.");if(String(u.MOBILE).trim()!==String(mobile).trim())return err("Mobile number does not match our records.");if(!active(u.ACTIVE))return err("This account is inactive.");const role=normRole(u.ROLE);if(!role)return err("Invalid role.");const t=Utilities.getUuid()+"-"+Utilities.getUuid(),now=new Date(),ex=new Date(now.getTime()+SESSION_DAYS*86400000);getSheet(SHEETS.SESSIONS).appendRow([t,u.USER_ID,now,ex,true]);return ok({userId:u.USER_ID,name:u.NAME,role,officeId:u.OFFICE_ID,officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),token:t,expiresAt:ex.toISOString()},"Login successful.")}
function logout(s){const a=auth(s),sh=getSheet(SHEETS.SESSIONS),rows=sh.getDataRange().getValues();for(let i=1;i<rows.length;i++)if(String(rows[i][0])===String(s.token)){sh.getRange(i+1,5).setValue(false);break}return ok(null,"Logged out.")}
function needsSession(raw){if(!raw)throw Error("Not authenticated.");return JSON.parse(raw)}
function auth(s){if(!s?.userId||!s?.token)throw Error("Not authenticated.");const r=read(SHEETS.SESSIONS).find(x=>String(x.TOKEN).trim()===String(s.token).trim()&&String(x.USER_ID).trim()===String(s.userId).trim());if(!r||!active(r.ACTIVE))throw Error("Session expired or invalid.");if(new Date(r.EXPIRES_AT).getTime()<=Date.now()){invalidate(s.token);throw Error("Session expired. Please log in again.");}const u=findUser(s.userId);if(!u||!active(u.ACTIVE))throw Error("Account is inactive.");const role=normRole(u.ROLE);if(!role)throw Error("Invalid role.");return{user:u,role,token:s.token}}
function findUser(id){return read(SHEETS.USER_MASTER).find(r=>String(r.USER_ID).trim()===String(id||"").trim())||null}
function getOfficeList(s){auth(s);return ok(read(SHEETS.OFFICE_MASTER).filter(r=>active(r.ACTIVE)).map(r=>({officeId:String(r.OFFICE_ID),officeName:String(r.OFFICE_NAME),division:String(r.DIVISION||"")})))}
function getUser(id,s){const a=auth(s);if(a.role===ROLES.SPM&&String(id)!==String(a.user.USER_ID))throw Error("Not authorized.");const u=findUser(id);return u?ok({userId:u.USER_ID,name:u.NAME,role:normRole(u.ROLE),officeId:u.OFFICE_ID,officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME)}):err("User not found.")}
function getPreviousDay(officeId,date,s){const a=auth(s);assertOffice(a,officeId);const prev=shift(validateDate(date),-1),r=dedupe().find(x=>String(x.OFFICE_ID)===String(officeId)&&dateOf(x.DATE)===prev);return ok(r?{date:prev,kitsCameToday:num(r.KITS_CAME_TODAY),kitsDelivered:num(r.KITS_DELIVERED),redirected:num(r.REDIRECTED),currentPending:num(r.CURRENT_PENDING)}:null)}
function getOwnTodayRecord(s){const a=auth(s);if(a.role!==ROLES.SPM)throw Error("Only SPM users can access this function.");const rs=read(SHEETS.DAILY_DATA).filter(r=>String(r.SPM_ID).trim()===String(a.user.USER_ID).trim()&&dateOf(r.DATE)===todayISO()).sort((x,y)=>y.__row-x.__row);return ok(rs.length?mapRecord(rs[0]):null)}
function getAdminTodayUpdateStatus(s,date){const a=auth(s);if(![ROLES.DPS,ROLES.ADMIN].includes(a.role))throw Error("Only DPS/Admin users can access update status.");const d=validateDate(date),users=read(SHEETS.USER_MASTER).filter(u=>active(u.ACTIVE)&&normRole(u.ROLE)===ROLES.SPM),recs=dedupe().filter(r=>dateOf(r.DATE)===d),updated=new Set(recs.map(r=>String(r.SPM_ID).trim()));const offices=read(SHEETS.OFFICE_MASTER).filter(o=>active(o.ACTIVE)),map={};offices.forEach(o=>map[o.OFFICE_ID]={officeId:o.OFFICE_ID,officeName:o.OFFICE_NAME,totalSpms:0,updatedSpms:0,pendingSpms:0});const pending=[],done=[];users.forEach(u=>{const id=String(u.USER_ID),oid=String(u.OFFICE_ID);if(!map[oid])map[oid]={officeId:oid,officeName:officeName(oid,u.OFFICE_NAME),totalSpms:0,updatedSpms:0,pendingSpms:0};map[oid].totalSpms++;if(updated.has(id)){map[oid].updatedSpms++;done.push({spmId:id,spmName:u.NAME,officeId:oid,officeName:map[oid].officeName})}else{map[oid].pendingSpms++;pending.push({spmId:id,spmName:u.NAME,officeId:oid,officeName:map[oid].officeName})}});const totalsByOffice={};
recs.forEach(r=>{
  const oid=String(r.OFFICE_ID);
  if(!totalsByOffice[oid])totalsByOffice[oid]={kitsCameToday:0,kitsDelivered:0,redirected:0,mobileInvalid:0,addressNotFound:0,torn:0,kitsIncomplete:0,kitsComplete:0,totalPending:0,deliveryPercentage:0};
  const t=totalsByOffice[oid];
  t.kitsCameToday+=num(r.KITS_CAME_TODAY);
  t.kitsDelivered+=num(r.KITS_DELIVERED);
  t.redirected+=num(r.REDIRECTED);
  t.mobileInvalid+=num(r.MOBILE_NUMBER_INVALID);
  t.addressNotFound+=num(r.ADDRESS_NOT_FOUND);
  t.torn+=num(r.TORN_CONDITION);
  t.kitsIncomplete+=num(r.KITS_INCOMPLETE);
  t.kitsComplete+=num(r.KITS_COMPLETE);
  t.totalPending+=num(r.TOTAL_PENDING);
});
Object.keys(map).forEach(oid=>Object.assign(map[oid],totalsByOffice[oid]||{}));
Object.values(map).forEach(o=>{o.deliveryPercentage=o.kitsCameToday?round(o.kitsDelivered/o.kitsCameToday*100):0});
const detailedSpmData=users.map(u=>{
  const r=recs.find(x=>String(x.SPM_ID).trim()===String(u.USER_ID).trim());
  return r?{officeName:String(r.OFFICE_NAME),spmName:String(r.SPM_NAME),spmId:String(r.SPM_ID),status:"Updated",
    kitsCameToday:num(r.KITS_CAME_TODAY),kitsDelivered:num(r.KITS_DELIVERED),redirected:num(r.REDIRECTED),
    mobileInvalid:num(r.MOBILE_NUMBER_INVALID),addressNotFound:num(r.ADDRESS_NOT_FOUND),torn:num(r.TORN_CONDITION),
    kitsIncomplete:num(r.KITS_INCOMPLETE),kitsComplete:num(r.KITS_COMPLETE),totalPending:num(r.TOTAL_PENDING),
    deliveryPercentage:num(r.DELIVERY_PERCENTAGE)}
  :{officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),spmName:String(u.NAME),spmId:String(u.USER_ID),status:"Not updated",
    kitsCameToday:0,kitsDelivered:0,redirected:0,mobileInvalid:0,addressNotFound:0,torn:0,kitsIncomplete:0,kitsComplete:0,totalPending:0,deliveryPercentage:0};
});
const total=users.length,uc=done.length;return ok({date:d,spmsUpdatedToday:uc,activeSpms:total,spmsPendingUpdate:total-uc,completionPercentage:total?round(uc/total*100):0,
officeWise:Object.values(map).map(o=>({...o,completionPercentage:o.totalSpms?round(o.updatedSpms/o.totalSpms*100):0})),
updatedSpms:done,pendingSpms:pending,detailedSpmData})}

function submitDailyRecord(record,s){const a=auth(s),r=normalize(record);if(a.role===ROLES.SPM&&String(a.user.OFFICE_ID)!==String(r.officeId))return err("You are not authorized to submit data for this office.");const o=getOffice(r.officeId);r.officeName=o.OFFICE_NAME;r.spmId=a.user.USER_ID;r.spmName=a.user.NAME;const v=validateRecord(r);if(!v.valid)return{success:false,code:"VALIDATION",message:v.errors[0],errors:v.errors};if(findById(r.id))return ok({recordId:r.id,alreadyProcessed:true},"Record already synchronized.");if(findBySpmDate(r.spmId,r.date))return{success:false,code:"DUPLICATE",message:"You have already submitted data for this date."};const totals=totalsFor(r),prev=previousPending(r),life={previousPending:prev,newPending:totals.totalPending,resolvedPending:0,currentPending:Math.max(0,prev+totals.totalPending)};const sh=getSheet(SHEETS.DAILY_DATA),row=[r.id,r.date,r.officeId,r.officeName,a.user.USER_ID,a.user.NAME,r.kitsCameToday,r.kitsDelivered,r.redirected,r.mobileInvalid,r.addressNotFound,r.torn,r.incompleteRows.length,totals.kitsIncomplete,r.completeRows.length,totals.kitsComplete,totals.totalPending,totals.deliveryPercentage,life.previousPending,life.newPending,0,life.currentPending,new Date(r.submittedAt||Date.now()),new Date(),"FINAL"];const lock=LockService.getScriptLock();lock.waitLock(15000);try{if(findById(r.id)||findBySpmDate(r.spmId,r.date))return{success:false,code:"DUPLICATE",message:"Duplicate submission blocked."};sh.appendRow(row)}finally{lock.releaseLock()}return ok({recordId:r.id},"Record saved successfully.")}
function updateDailyRecord(record,s){const a=auth(s);if(![ROLES.DPS,ROLES.ADMIN].includes(a.role))return err("Only DPS/Admin users can edit finalized records.");const ex=findById(record?.id);if(!ex)return err("Record not found.");const r=normalize(record);r.officeId=String(ex.OFFICE_ID);r.officeName=String(ex.OFFICE_NAME);r.spmId=String(ex.SPM_ID);r.spmName=String(ex.SPM_NAME);const v=validateRecord(r);if(!v.valid)return{success:false,code:"VALIDATION",message:v.errors[0],errors:v.errors};const other=findBySpmDate(r.spmId,r.date);if(other&&Number(other.__row)!==Number(ex.__row))return{success:false,code:"DUPLICATE",message:"Another submission already exists for this SPM and date."};const t=totalsFor(r),p=previousPending(r),life={previousPending:p,newPending:t.totalPending,resolvedPending:0,currentPending:Math.max(0,p+t.totalPending)},row=[r.id,r.date,r.officeId,r.officeName,r.spmId,r.spmName,r.kitsCameToday,r.kitsDelivered,r.redirected,r.mobileInvalid,r.addressNotFound,r.torn,r.incompleteRows.length,t.kitsIncomplete,r.completeRows.length,t.kitsComplete,t.totalPending,t.deliveryPercentage,life.previousPending,life.newPending,0,life.currentPending,ex.SUBMITTED_AT,new Date(),"FINAL"];getSheet(SHEETS.DAILY_DATA).getRange(ex.__row,1,1,row.length).setValues([row]);return ok({recordId:r.id},"Record updated successfully.")}
function deleteOwnTodayRecord(s,recordId){const a=auth(s);if(a.role!==ROLES.SPM)return err("Only SPM users can delete their own today's entry.","FORBIDDEN");const uid=String(a.user.USER_ID),today=todayISO(),sh=getSheet(SHEETS.DAILY_DATA),rs=read(SHEETS.DAILY_DATA).filter(r=>String(r.SPM_ID).trim()===uid&&dateOf(r.DATE)===today).sort((x,y)=>y.__row-x.__row);if(!rs.length)return err("No entry for today was found.","NOT_FOUND");const lock=LockService.getScriptLock();lock.waitLock(15000);try{rs.forEach(r=>sh.deleteRow(Number(r.__row)))}finally{lock.releaseLock()}return ok({deleted:true,rowsDeleted:rs.length},"Today's entry deleted.")}
function normalize(r){r=JSON.parse(JSON.stringify(r||{}));r.id=String(r.id||"").trim();r.date=String(r.date||"").trim();r.officeId=String(r.officeId||"").trim();for(const k of["kitsCameToday","kitsDelivered","redirected","mobileInvalid","addressNotFound","torn"])r[k]=r[k]===""||r[k]==null?0:Number(r[k]);r.incompleteRows=Array.isArray(r.incompleteRows)?r.incompleteRows.map(x=>({setNumber:x.setNumber===""||x.setNumber==null?"":Number(x.setNumber),kitsIncomplete:x.kitsIncomplete===""||x.kitsIncomplete==null?0:Number(x.kitsIncomplete)})):[];r.completeRows=Array.isArray(r.completeRows)?r.completeRows.map(x=>({setNumber:x.setNumber===""||x.setNumber==null?"":Number(x.setNumber),kitsComplete:x.kitsComplete===""||x.kitsComplete==null?0:Number(x.kitsComplete)})):[];return r}
function validateRecord(r){const e=[];if(!r.id)e.push("Record ID is required.");if(!r.date) e.push("Date is required.");else{try{if(validateDate(r.date)>todayISO())e.push("Future dates are not allowed.")}catch(x){e.push(x.message)}}if(!getOffice(r.officeId))e.push("Office is invalid.");for(const k of["kitsCameToday","kitsDelivered","redirected","mobileInvalid","addressNotFound","torn"])if(!isInt(r[k]))e.push(k+" must be a non-negative integer.");for(const [rows,key] of[[r.incompleteRows,"kitsIncomplete"],[r.completeRows,"kitsComplete"]])rows.forEach((x,i)=>{if(x.setNumber!==""&&!isInt(x.setNumber))e.push("Set number must be a non-negative integer.");if(!isInt(x[key]))e.push("Set quantity must be a non-negative integer.")});if(e.length)return{valid:false,errors:e};const t=totalsFor(r);if(t.kitsDelivered+t.redirected+t.totalPending>r.kitsCameToday)e.push("Delivered + Redirected + Pending cannot exceed Kits Came Today.");return{valid:!e.length,errors:e}}
function totalsFor(r){const a=r.incompleteRows.reduce((s,x)=>s+(Number(x.kitsIncomplete)||0),0),b=r.completeRows.reduce((s,x)=>s+(Number(x.kitsComplete)||0),0),p=r.mobileInvalid+r.addressNotFound+r.torn+a+b;return{kitsIncomplete:a,kitsComplete:b,totalPending:p,deliveryPercentage:r.kitsCameToday?round(r.kitsDelivered/r.kitsCameToday*100):0}}
function previousPending(r){const x=dedupe().find(z=>String(z.OFFICE_ID)===String(r.officeId)&&dateOf(z.DATE)===shift(r.date,-1));return x?num(x.CURRENT_PENDING):0}
function dedupe(){const m={};read(SHEETS.DAILY_DATA).forEach(r=>{const k=String(r.SPM_ID).trim()+"|"+dateOf(r.DATE),old=m[k];if(!old||Number(r.__row)>Number(old.__row))m[k]=r});return Object.values(m)}
function findById(id){return read(SHEETS.DAILY_DATA).find(r=>String(r.ID).trim()===String(id).trim())||null}
function findBySpmDate(spm,date){return read(SHEETS.DAILY_DATA).find(r=>String(r.SPM_ID).trim()===String(spm).trim()&&dateOf(r.DATE)===date)||null}
function mapRecord(r){return{id:String(r.ID||""),date:dateOf(r.DATE),officeId:String(r.OFFICE_ID||""),officeName:String(r.OFFICE_NAME||""),spmId:String(r.SPM_ID||""),spmName:String(r.SPM_NAME||""),kitsCameToday:num(r.KITS_CAME_TODAY),kitsDelivered:num(r.KITS_DELIVERED),redirected:num(r.REDIRECTED),totalPending:num(r.TOTAL_PENDING),deliveryPercentage:num(r.DELIVERY_PERCENTAGE),status:String(r.STATUS||"")}}
function getOffice(id){const o=read(SHEETS.OFFICE_MASTER).find(x=>String(x.OFFICE_ID).trim()===String(id).trim());if(!o)throw Error("Office not found in OFFICE_MASTER.");if(!active(o.ACTIVE))throw Error("Office is inactive.");return o}
function assertOffice(a,id){const o=getOffice(id);if(a.role===ROLES.SPM&&String(a.user.OFFICE_ID)!==String(o.OFFICE_ID))throw Error("Not authorized for this office.")}
function officeName(id,f){const o=read(SHEETS.OFFICE_MASTER).find(x=>String(x.OFFICE_ID).trim()===String(id).trim());return o?String(o.OFFICE_NAME):String(f||"")}
function read(name){const d=getSheet(name).getDataRange().getValues();if(d.length<2)return[];const h=d[0];return d.slice(1).filter(r=>r.join("")!=="").map((r,i)=>{const o={__row:i+2};h.forEach((x,j)=>o[x]=r[j]);return o})}
function getSheet(n){const s=SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(n);if(!s)throw Error("Sheet not found: "+n);return s}
function active(v){return v===true||["TRUE","1"].includes(String(v).trim().toUpperCase())}
function normRole(v){v=String(v||"").trim().toUpperCase();return Object.values(ROLES).includes(v)?v:""}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0}
function isInt(v){return Number.isInteger(v)&&v>=0}
function round(v){return Math.round(v*10)/10}
function validateDate(v){if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(String(v||"")))throw Error("Date must be in YYYY-MM-DD format.");const d=new Date(v+"T00:00:00");if(isNaN(d.getTime()))throw Error("Invalid date.");return v}
function dateOf(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd");const s=String(v||"");if(/^\\d{4}-\\d{2}-\\d{2}$/.test(s))return s;const d=new Date(s);return isNaN(d.getTime())?s:Utilities.formatDate(d,Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd")}
function shift(v,n){const d=new Date(validateDate(v)+"T00:00:00");d.setDate(d.getDate()+n);return Utilities.formatDate(d,Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd")}
function todayISO(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd")}
function invalidate(t){const s=getSheet(SHEETS.SESSIONS),r=s.getDataRange().getValues();for(let i=1;i<r.length;i++)if(String(r[i][0])===String(t)){s.getRange(i+1,5).setValue(false);break}}
function ok(data,message){return{success:true,message:message||"OK",data:data}}
function err(message,code){return{success:false,code:code||undefined,message:message||"Request failed.",errors:[]}}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON)}
function setupSheets(){const ss=SpreadsheetApp.openById(SPREADSHEET_ID);const defs={
DAILY_DATA:["ID","DATE","OFFICE_ID","OFFICE_NAME","SPM_ID","SPM_NAME","KITS_CAME_TODAY","KITS_DELIVERED","REDIRECTED","MOBILE_NUMBER_INVALID","ADDRESS_NOT_FOUND","TORN_CONDITION","INCOMPLETE_SET_NUMBER","KITS_INCOMPLETE","COMPLETE_SET_NUMBER","KITS_COMPLETE","TOTAL_PENDING","DELIVERY_PERCENTAGE","PREVIOUS_PENDING","NEW_PENDING","RESOLVED_PENDING","CURRENT_PENDING","SUBMITTED_AT","UPDATED_AT","STATUS"],
OFFICE_MASTER:["OFFICE_ID","OFFICE_NAME","DIVISION","SPM_ID","SPM_NAME","ACTIVE"],USER_MASTER:["USER_ID","NAME","ROLE","OFFICE_ID","OFFICE_NAME","MOBILE","ACTIVE"],SET_TRACKER:["TIMESTAMP","DATE","OFFICE_ID","SET_TYPE","SET_NUMBER","QUANTITY","ENTERED_BY"],AUDIT_LOG:["TIMESTAMP","USER_ID","USER_NAME","ROLE","ACTION","RECORD_ID","OFFICE_ID","DATE","OLD_VALUE","NEW_VALUE","REQUEST_INFO","RESULT"],SESSIONS:["TOKEN","USER_ID","CREATED_AT","EXPIRES_AT","ACTIVE"]};
Object.entries(defs).forEach(([n,h])=>{let s=ss.getSheetByName(n);if(!s)s=ss.insertSheet(n);if(s.getLastRow()===0)s.getRange(1,1,1,h.length).setValues([h])})}
