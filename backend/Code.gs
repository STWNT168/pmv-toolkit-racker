/*
 PMV Toolkit Tracker v8 field-aligned backend.
 Replace SPREADSHEET_ID with your Google Spreadsheet ID before deployment.
 Existing USER_MASTER / OFFICE_MASTER structure is retained.
*/

const SPREADSHEET_ID = "1vEjY1z-147b38XTWV7vRm_9pjXVMfJmjdQtrKRkkLy8";
const SHEETS = {
  DAILY_DATA: "DAILY_DATA",
  OFFICE_MASTER: "OFFICE_MASTER",
  USER_MASTER: "USER_MASTER",
  SESSIONS: "SESSIONS"
};
const ROLES = {SPM:"SPM", DPS:"DPS", ADMIN:"ADMIN"};
const SESSION_DAYS = 7;
const MAX_VALUE = 1000000;

function doGet(e) {
  try {
    const p=e&&e.parameter?e.parameter:{};
    const s=needsSession(p.session);
    switch(p.action) {
      case "getUser": return out(getUser(p.userId,s));
      case "getOwnTodayRecord": return out(getOwnTodayRecord(s));
      case "getAdminTodayUpdateStatus": return out(getAdminTodayUpdateStatus(s,p.date||todayISO()));
      case "getOfficeList": return out(getOfficeList(s));
      default: return out(err("Unknown GET action."));
    }
  } catch(x) { return out(err(x.message||String(x))); }
}

function doPost(e) {
  try {
    const b=JSON.parse((e&&e.postData&&e.postData.contents)||"{}");
    switch(b.action) {
      case "login": return out(login(b.userId,b.mobile));
      case "logout": return out(logout(b.session));
      case "submitDailyRecord": return out(submitDailyRecord(b.record,b.session));
      case "syncOfflineRecord": return out(submitDailyRecord(b.record,b.session));
      case "deleteOwnTodayRecord": return out(deleteOwnTodayRecord(b.session,b.recordId));
      default: return out(err("Unknown POST action."));
    }
  } catch(x) { return out(err(x.message||String(x))); }
}

function login(userId,mobile) {
  const u=findUser(userId);
  if(!u) return err("User not found.");
  if(String(u.MOBILE).trim()!==String(mobile).trim()) return err("Mobile number does not match our records.");
  if(!active(u.ACTIVE)) return err("This account is inactive.");
  const role=normRole(u.ROLE);
  if(!role) return err("Invalid role.");

  const token=Utilities.getUuid()+"-"+Utilities.getUuid();
  const now=new Date(), expires=new Date(now.getTime()+SESSION_DAYS*86400000);
  getSheet(SHEETS.SESSIONS).appendRow([token,u.USER_ID,now,expires,true]);

  return ok({
    userId:String(u.USER_ID),name:String(u.NAME||""),role,
    officeId:String(u.OFFICE_ID||""),
    officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),
    token,expiresAt:expires.toISOString()
  },"Login successful.");
}

function logout(s) {
  const a=auth(s);
  const sh=getSheet(SHEETS.SESSIONS), rows=sh.getDataRange().getValues();
  for(let i=1;i<rows.length;i++) if(String(rows[i][0])===String(s.token)){sh.getRange(i+1,5).setValue(false);break;}
  return ok(null,"Logged out.");
}

function needsSession(raw) {
  if(!raw) throw new Error("Not authenticated.");
  try{return JSON.parse(raw);}catch(_){throw new Error("Invalid session.");}
}

function auth(s) {
  if(!s||!s.userId||!s.token) throw new Error("Not authenticated.");
  const r=read(SHEETS.SESSIONS).find(x=>String(x.TOKEN).trim()===String(s.token).trim()&&String(x.USER_ID).trim()===String(s.userId).trim());
  if(!r||!active(r.ACTIVE)) throw new Error("Session expired or invalid.");
  if(new Date(r.EXPIRES_AT).getTime()<=Date.now()){invalidate(s.token);throw new Error("Session expired. Please log in again.");}
  const u=findUser(s.userId);
  if(!u||!active(u.ACTIVE)) throw new Error("Account is inactive.");
  const role=normRole(u.ROLE);
  if(!role) throw new Error("Invalid role.");
  return {user:u,role,token:s.token};
}

function findUser(id){return read(SHEETS.USER_MASTER).find(r=>String(r.USER_ID).trim()===String(id||"").trim())||null;}

function getUser(id,s) {
  const a=auth(s);
  if(a.role===ROLES.SPM&&String(id)!==String(a.user.USER_ID)) throw new Error("Not authorized.");
  const u=findUser(id); if(!u) return err("User not found.");
  return ok({userId:String(u.USER_ID||""),name:String(u.NAME||""),role:normRole(u.ROLE),officeId:String(u.OFFICE_ID||""),officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME)});
}

function getOfficeList(s) {
  auth(s);
  return ok(read(SHEETS.OFFICE_MASTER).filter(r=>active(r.ACTIVE)).map(r=>({officeId:String(r.OFFICE_ID||""),officeName:String(r.OFFICE_NAME||""),division:String(r.DIVISION||"")})));
}

function getOwnTodayRecord(s) {
  const a=auth(s);
  if(a.role!==ROLES.SPM) throw new Error("Only SPM users can access this function.");
  const rs=read(SHEETS.DAILY_DATA).filter(r=>String(r.SPM_ID).trim()===String(a.user.USER_ID).trim()&&dateOf(r.DATE)===todayISO()).sort((x,y)=>Number(y.__row)-Number(x.__row));
  return ok(rs.length?mapRecord(rs[0]):null);
}

function getAdminTodayUpdateStatus(s,date) {
  const a=auth(s);
  if(a.role!==ROLES.DPS&&a.role!==ROLES.ADMIN) throw new Error("Only DPS/Admin users can access update status.");
  const d=validateDate(date);
  const users=read(SHEETS.USER_MASTER).filter(u=>active(u.ACTIVE)&&normRole(u.ROLE)===ROLES.SPM);
  const recs=dedupe().filter(r=>dateOf(r.DATE)===d);
  const updated={}; recs.forEach(r=>updated[String(r.SPM_ID).trim()]=true);

  const officeMap={};
  read(SHEETS.OFFICE_MASTER).filter(o=>active(o.ACTIVE)).forEach(o=>{
    officeMap[String(o.OFFICE_ID)] = blankOffice(String(o.OFFICE_ID),String(o.OFFICE_NAME||""));
  });

  const pending=[],done=[];
  users.forEach(u=>{
    const uid=String(u.USER_ID), oid=String(u.OFFICE_ID);
    if(!officeMap[oid]) officeMap[oid]=blankOffice(oid,officeName(oid,u.OFFICE_NAME));
    officeMap[oid].totalSpms++;
    if(updated[uid]) {
      officeMap[oid].updatedSpms++;
      done.push({spmId:uid,spmName:String(u.NAME||""),officeId:oid,officeName:officeMap[oid].officeName});
    } else {
      officeMap[oid].pendingSpms++;
      pending.push({spmId:uid,spmName:String(u.NAME||""),officeId:oid,officeName:officeMap[oid].officeName});
    }
  });

  recs.forEach(r=>{
    const oid=String(r.OFFICE_ID);
    if(!officeMap[oid]) officeMap[oid]=blankOffice(oid,String(r.OFFICE_NAME||""));
    const o=officeMap[oid];
    o.allKits+=num(r.ALL_KITS);
    o.similarArticle+=num(r.SIMILAR_ARTICLE);
    o.invalidMobileKits+=num(r.INVALID_MOBILE_KITS);
    o.deliverableKits+=num(r.DELIVERABLE_KITS);
    o.incompleteKits+=num(r.INCOMPLETE_KITS);
    o.withoutProperDetailsKits+=num(r.WITHOUT_PROPER_DETAILS_KITS);
    o.invalidMobileArticles+=num(r.INVALID_MOBILE_ARTICLES);
    o.deliverableArticles+=num(r.DELIVERABLE_ARTICLES);
    o.incompleteArticles+=num(r.INCOMPLETE_ARTICLES);
    o.withoutProperDetailsArticles+=num(r.WITHOUT_PROPER_DETAILS_ARTICLES);
  });

  Object.values(officeMap).forEach(o=>o.completionPercentage=o.totalSpms?round(o.updatedSpms/o.totalSpms*100):0);

  const detailedSpmData=users.map(u=>{
    const r=recs.find(x=>String(x.SPM_ID).trim()===String(u.USER_ID).trim());
    return r?{
      officeName:String(r.OFFICE_NAME||""),
      spmName:String(r.SPM_NAME||u.NAME||""),
      spmId:String(r.SPM_ID||u.USER_ID),
      status:"Updated",
      allKits:num(r.ALL_KITS),similarArticle:num(r.SIMILAR_ARTICLE),
      invalidMobileKits:num(r.INVALID_MOBILE_KITS),deliverableKits:num(r.DELIVERABLE_KITS),
      incompleteKits:num(r.INCOMPLETE_KITS),withoutProperDetailsKits:num(r.WITHOUT_PROPER_DETAILS_KITS),
      invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),deliverableArticles:num(r.DELIVERABLE_ARTICLES),
      incompleteArticles:num(r.INCOMPLETE_ARTICLES),withoutProperDetailsArticles:num(r.WITHOUT_PROPER_DETAILS_ARTICLES)
    }:{
      officeName:officeName(u.OFFICE_ID,u.OFFICE_NAME),spmName:String(u.NAME||""),spmId:String(u.USER_ID||""),
      status:"Not updated",allKits:0,similarArticle:0,invalidMobileKits:0,deliverableKits:0,incompleteKits:0,
      withoutProperDetailsKits:0,invalidMobileArticles:0,deliverableArticles:0,incompleteArticles:0,withoutProperDetailsArticles:0
    };
  });

  const total=users.length, updatedCount=done.length;
  return ok({
    date:d,spmsUpdatedToday:updatedCount,activeSpms:total,spmsPendingUpdate:total-updatedCount,
    completionPercentage:total?round(updatedCount/total*100):0,
    officeWise:Object.values(officeMap),updatedSpms:done,pendingSpms:pending,detailedSpmData
  });
}

function blankOffice(id,name){
  return {officeId:id,officeName:name,totalSpms:0,updatedSpms:0,pendingSpms:0,completionPercentage:0,
    allKits:0,similarArticle:0,invalidMobileKits:0,deliverableKits:0,incompleteKits:0,withoutProperDetailsKits:0,
    invalidMobileArticles:0,deliverableArticles:0,incompleteArticles:0,withoutProperDetailsArticles:0};
}

function submitDailyRecord(record,s) {
  const a=auth(s), r=normalize(record);
  if(a.role===ROLES.SPM&&String(a.user.OFFICE_ID)!==String(r.officeId)) return err("You are not authorized to submit data for this office.","FORBIDDEN");
  const o=getOffice(r.officeId); r.officeName=String(o.OFFICE_NAME||""); r.spmId=String(a.user.USER_ID); r.spmName=String(a.user.NAME||"");
  const v=validateRecord(r); if(!v.valid) return {success:false,code:"VALIDATION",message:v.errors[0],errors:v.errors};

  const lock=LockService.getScriptLock(); lock.waitLock(15000);
  try {
    if(findBySpmDate(r.spmId,r.date)) return err("You have already submitted data for this date.","DUPLICATE");
    const row=[
      r.id,r.date,r.officeId,r.officeName,r.spmId,r.spmName,
      r.allKits,r.similarArticle,r.invalidMobileKits,r.deliverableKits,r.incompleteKits,r.withoutProperDetailsKits,
      r.invalidMobileArticles,r.deliverableArticles,r.incompleteArticles,r.withoutProperDetailsArticles,
      new Date(r.submittedAt||Date.now()),new Date(),"FINAL"
    ];
    getSheet(SHEETS.DAILY_DATA).appendRow(row);
  } finally {lock.releaseLock();}
  return ok({recordId:r.id},"Record saved successfully.");
}

function deleteOwnTodayRecord(s,recordId) {
  const a=auth(s); if(a.role!==ROLES.SPM) return err("Only SPM users can delete their own entry.","FORBIDDEN");
  const sh=getSheet(SHEETS.DAILY_DATA), rows=read(SHEETS.DAILY_DATA).filter(r=>String(r.SPM_ID).trim()===String(a.user.USER_ID).trim()&&dateOf(r.DATE)===todayISO());
  if(!rows.length) return err("No entry for today was found.","NOT_FOUND");
  rows.sort((a,b)=>Number(b.__row)-Number(a.__row)).forEach(r=>sh.deleteRow(Number(r.__row)));
  return ok({deleted:true,rowsDeleted:rows.length},"Today's entry deleted.");
}

function normalize(r) {
  r=JSON.parse(JSON.stringify(r||{}));
  r.id=String(r.id||"").trim(); r.date=String(r.date||"").trim(); r.officeId=String(r.officeId||"").trim();
  ["allKits","similarArticle","invalidMobileKits","deliverableKits","incompleteKits","withoutProperDetailsKits",
   "invalidMobileArticles","deliverableArticles","incompleteArticles","withoutProperDetailsArticles"].forEach(k=>r[k]=r[k]===""||r[k]==null?0:Number(r[k]));
  return r;
}

function validateRecord(r) {
  const e=[];
  if(!r.id) e.push("Record ID is required.");
  if(!r.date) e.push("Date is required."); else if(validateDate(r.date)>todayISO()) e.push("Future dates are not allowed.");
  if(!getOffice(r.officeId)) e.push("Office is invalid.");
  ["allKits","similarArticle","invalidMobileKits","deliverableKits","incompleteKits","withoutProperDetailsKits",
   "invalidMobileArticles","deliverableArticles","incompleteArticles","withoutProperDetailsArticles"].forEach(k=>{
    if(!isInt(r[k])||r[k]>MAX_VALUE) e.push(k+" must be a non-negative integer up to "+MAX_VALUE+".");
  });
  if(e.length) return {valid:false,errors:e};
  const kt=r.invalidMobileKits+r.deliverableKits+r.incompleteKits+r.withoutProperDetailsKits;
  const at=r.invalidMobileArticles+r.deliverableArticles+r.incompleteArticles+r.withoutProperDetailsArticles;
  if(r.allKits!==kt) e.push("Kit total does not match the four kit categories.");
  if(r.similarArticle!==at) e.push("Article total does not match the four article categories.");
  return {valid:!e.length,errors:e};
}

function dedupe(){
  const m={};
  read(SHEETS.DAILY_DATA).forEach(r=>{
    const k=String(r.SPM_ID).trim()+"|"+dateOf(r.DATE);
    if(!m[k]||Number(r.__row)>Number(m[k].__row))m[k]=r;
  });
  return Object.values(m);
}

function findBySpmDate(spm,date){return read(SHEETS.DAILY_DATA).find(r=>String(r.SPM_ID).trim()===String(spm).trim()&&dateOf(r.DATE)===String(date))||null;}

function mapRecord(r){
  return {id:String(r.ID||""),date:dateOf(r.DATE),officeId:String(r.OFFICE_ID||""),officeName:String(r.OFFICE_NAME||""),
    spmId:String(r.SPM_ID||""),spmName:String(r.SPM_NAME||""),allKits:num(r.ALL_KITS),similarArticle:num(r.SIMILAR_ARTICLE),
    invalidMobileKits:num(r.INVALID_MOBILE_KITS),deliverableKits:num(r.DELIVERABLE_KITS),incompleteKits:num(r.INCOMPLETE_KITS),
    withoutProperDetailsKits:num(r.WITHOUT_PROPER_DETAILS_KITS),invalidMobileArticles:num(r.INVALID_MOBILE_ARTICLES),
    deliverableArticles:num(r.DELIVERABLE_ARTICLES),incompleteArticles:num(r.INCOMPLETE_ARTICLES),
    withoutProperDetailsArticles:num(r.WITHOUT_PROPER_DETAILS_ARTICLES),status:String(r.STATUS||"")};
}

function getOffice(id){
  const o=read(SHEETS.OFFICE_MASTER).find(x=>String(x.OFFICE_ID).trim()===String(id).trim());
  if(!o) throw new Error("Office not found in OFFICE_MASTER.");
  if(!active(o.ACTIVE)) throw new Error("Office is inactive.");
  return o;
}

function officeName(id,fallback){
  const o=read(SHEETS.OFFICE_MASTER).find(x=>String(x.OFFICE_ID).trim()===String(id).trim());
  return o?String(o.OFFICE_NAME||""):String(fallback||"");
}

function read(name){
  const d=getSheet(name).getDataRange().getValues(); if(d.length<2)return[];
  const h=d[0].map(x=>String(x).trim());
  return d.slice(1).filter(r=>r.join("")!=="").map((r,i)=>{const o={__row:i+2};h.forEach((x,j)=>o[x]=r[j]);return o;});
}

function getSheet(name){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID), sh=ss.getSheetByName(name);
  if(!sh) throw new Error("Sheet not found: "+name+". Run setupSheetsV8().");
  return sh;
}

function setupSheetsV8(){
  const ss=SpreadsheetApp.openById(SPREADSHEET_ID);
  const defs={
    DAILY_DATA:["ID","DATE","OFFICE_ID","OFFICE_NAME","SPM_ID","SPM_NAME",
      "ALL_KITS","SIMILAR_ARTICLE","INVALID_MOBILE_KITS","DELIVERABLE_KITS","INCOMPLETE_KITS","WITHOUT_PROPER_DETAILS_KITS",
      "INVALID_MOBILE_ARTICLES","DELIVERABLE_ARTICLES","INCOMPLETE_ARTICLES","WITHOUT_PROPER_DETAILS_ARTICLES",
      "SUBMITTED_AT","UPDATED_AT","STATUS"],
    OFFICE_MASTER:["OFFICE_ID","OFFICE_NAME","DIVISION","SPM_ID","SPM_NAME","ACTIVE"],
    USER_MASTER:["USER_ID","NAME","ROLE","OFFICE_ID","OFFICE_NAME","MOBILE","ACTIVE"],
    SESSIONS:["TOKEN","USER_ID","CREATED_AT","EXPIRES_AT","ACTIVE"]
  };
  Object.keys(defs).forEach(name=>{
    let sh=ss.getSheetByName(name); if(!sh)sh=ss.insertSheet(name);
    if(sh.getLastRow()===0)sh.getRange(1,1,1,defs[name].length).setValues([defs[name]]);
  });
  return "PMV v8 sheets ready.";
}

function active(v){return v===true||["TRUE","1","YES","Y"].includes(String(v).trim().toUpperCase());}
function normRole(v){v=String(v||"").trim().toUpperCase();return Object.values(ROLES).includes(v)?v:"";}
function num(v){const n=Number(v);return Number.isFinite(n)?n:0;}
function isInt(v){return Number.isInteger(v)&&v>=0;}
function round(v){return Math.round(v*10)/10;}
function validateDate(v){if(!/^\d{4}-\d{2}-\d{2}$/.test(String(v||"")))throw new Error("Date must be in YYYY-MM-DD format.");const d=new Date(v+"T00:00:00");if(isNaN(d.getTime()))throw new Error("Invalid date.");return String(v);}
function dateOf(v){if(v instanceof Date)return Utilities.formatDate(v,Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd");const s=String(v||"");if(/^\d{4}-\d{2}-\d{2}$/.test(s))return s;const d=new Date(s);return isNaN(d.getTime())?s:Utilities.formatDate(d,Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd");}
function todayISO(){return Utilities.formatDate(new Date(),Session.getScriptTimeZone()||"Asia/Kolkata","yyyy-MM-dd");}
function invalidate(t){const s=getSheet(SHEETS.SESSIONS),r=s.getDataRange().getValues();for(let i=1;i<r.length;i++)if(String(r[i][0])===String(t)){s.getRange(i+1,5).setValue(false);break;}}
function ok(data,message){return {success:true,message:message||"OK",data:data};}
function err(message,code){return {success:false,code:code||undefined,message:message||"Request failed.",errors:[]};}
function out(x){return ContentService.createTextOutput(JSON.stringify(x)).setMimeType(ContentService.MimeType.JSON);}
