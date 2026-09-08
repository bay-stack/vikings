const URL='https://xuvsehrevxackuhmbmry.supabase.co';
const ANON='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh1dnNlaHJldnhhY2t1aG1ibXJ5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2OTY4NjEsImV4cCI6MjA5NzI3Mjg2MX0.pURipAPZoVKFe3wdMQHBsw4Bd2mgG8OdzxaCJKGIqyY';
export async function rpc(name,args){
  const res=await fetch(`${URL}/rest/v1/rpc/vikings_${name}`,{method:'POST',headers:{apikey:ANON,Authorization:`Bearer ${ANON}`,'Content-Type':'application/json'},body:JSON.stringify(args),signal:AbortSignal.timeout(20000)});
  if(!res.ok){const e=await res.json().catch(()=>({}));const err=Error(e.message||'Cloud saving is unavailable. Your draft is kept on this device.');err.status=res.status;throw err;}
  return res.json();
}
let dbPromise;
function database(){return dbPromise ||= new Promise((resolve,reject)=>{const req=indexedDB.open('vikings-playbook-drafts',1);req.onupgradeneeded=()=>req.result.createObjectStore('drafts');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
export async function draftStore(id,value){const db=await database();return new Promise((resolve,reject)=>{const tx=db.transaction('drafts','readwrite');tx.objectStore('drafts').put(value,id);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});}
export async function draftRead(id){const db=await database();return new Promise((resolve,reject)=>{const req=db.transaction('drafts').objectStore('drafts').get(id);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});}
