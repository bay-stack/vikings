import {blankBook,validateBook,CARD_NAMES,COLORS,contrastColor,swapPlays,imageLayout,defaultImageMode,TEXT_SIZES,GEOMETRY as G} from './model.js?v=20260908-simple-editor';
import {createPDF,layoutBannerText} from './pdf.js?v=20260908-simple-editor';
import {rpc,draftStore,draftRead} from './cloud.js';
const $=id=>document.getElementById(id);
let book=blankBook(),selected=0,history=[],revision=0,dirty=false,serial=0,timer,saving=null,conflict=false,busy=false,initialized=false,dragFrom=null;
let key='',bookId='',books=[];
const uuidPattern=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const textMeasure=document.createElement('canvas').getContext('2d');
function bannerNumber(number){
  const ns='http://www.w3.org/2000/svg',holder=document.createElement('b'),svg=document.createElementNS(ns,'svg'),text=document.createElementNS(ns,'text'),divider=document.createElementNS(ns,'line'),width=G.cellWidth*.24,height=G.cellHeight*.2;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);svg.setAttribute('aria-hidden','true');textMeasure.font='bold 9px Arial';const measured=textMeasure.measureText(number).width,size=Math.min(9,measured?9*(width-6)/measured:9);
  for(const [key,value] of Object.entries({x:3,y:height/2+size*.34,'font-family':'Arial, sans-serif','font-size':size,'font-weight':700,fill:'currentColor'}))text.setAttribute(key,String(value));
  for(const [key,value] of Object.entries({x1:width-2,x2:width-2,y1:3,y2:height-3,stroke:'currentColor','stroke-width':.25}))divider.setAttribute(key,String(value));
  text.textContent=number;svg.append(text,divider);holder.append(svg);return holder;
}
let previewMetrics;
function previewLabel(p){
  const PDF=globalThis.jspdf?.jsPDF;if(!PDF)return null;
  previewMetrics ||= new PDF({unit:'pt'});
  return layoutBannerText(p,G.cellWidth,G.cellHeight,'wrist',previewMetrics);
}
function bannerWords(p){
  const label=previewLabel(p);
  if(!label){const words=document.createElement('span');words.textContent=[p.name,p.line2].filter(Boolean).join(' / ');return words;}
  const ns='http://www.w3.org/2000/svg',words=document.createElementNS(ns,'svg'),width=G.cellWidth*.76,height=G.cellHeight*.2;
  words.classList.add('banner-words');words.setAttribute('viewBox',`0 0 ${width} ${height}`);words.setAttribute('aria-hidden','true');
  for(const [i,line] of label.lines.entries()){const text=document.createElementNS(ns,'text');text.setAttribute('x','1');text.setAttribute('y',String(label.baseline+i*label.size*1.05));text.setAttribute('font-family','Helvetica, Arial, sans-serif');text.setAttribute('font-size',String(label.size));text.setAttribute('font-weight','700');text.setAttribute('fill','currentColor');text.textContent=line;words.append(text);}
  return words;
}
function renderTextSizeHelp(){
  const p=book.plays[selected],label=previewLabel(p),help=$('textSizeHelp');
  help.classList.toggle('text-overflow',Boolean(label?.overflow));
  help.textContent=label?.overflow?'Text does not fit. Choose a smaller size or shorten the words before printing.':p.textSize==null?'Auto fits the words inside the banner.':'Both lines use this size on wristbands. The coach sheet enlarges it.';
}

function status(text,error=false){$('saveStatus').textContent=text;$('saveStatus').dataset.state=error?'error':'ok';}
function notice(text,actions=[]){$('notice').replaceChildren(document.createTextNode(text));for(const [label,fn] of actions){const b=document.createElement('button');b.textContent=label;b.onclick=()=>Promise.resolve(fn()).catch(report);$('notice').append(b);}$('notice').hidden=false;}
function report(e){notice(e.message||'Something went wrong. Please try again.');}
function cacheId(){return `${key||'local'}:${bookId||'draft'}`;}
function cache(){return draftStore(cacheId(),{book,revision,dirty}).catch(()=>{notice('This browser cannot keep an offline draft. Wait for “Saved to cloud” or download a backup before closing.');});}
function remember(){history.push(JSON.stringify(book));if(history.length>20)history.shift();$('undo').disabled=false;}
function changed(){dirty=true;serial++;renderCards();renderPreview();$('playCount').textContent=`${book.plays.filter(p=>p.image).length} / 24 plays`;cache();status(key?'Unsaved changes':'Saved on this device');clearTimeout(timer);if(key&&!conflict)timer=setTimeout(()=>save(),900);}
function makeSlot(p,i,editable=true){
  const el=document.createElement(editable?'button':'div');el.className='play-slot'+(p.overlay&&p.imageMode!=='canva-326'?' overlay':'')+(editable&&i===selected?' selected':'');
  const diagram=document.createElement('div');diagram.className='diagram';
  if(p.image){const box=imageLayout(p,G.cellWidth,G.cellHeight),frame=document.createElement('div');frame.className='image-window';Object.assign(frame.style,{left:`${box.x/G.cellWidth*100}%`,top:`${box.y/box.diagramHeight*100}%`,width:`${box.width/G.cellWidth*100}%`,height:`${box.height/box.diagramHeight*100}%`});const img=document.createElement('img');img.src=p.image.data;img.alt=[p.name,p.line2].filter(Boolean).join(' · ')||`Play ${p.number}`;img.draggable=false;img.style.height=`${box.fullHeight/box.height*100}%`;frame.append(img);diagram.append(frame);}else{const plus=document.createElement('span');plus.className='empty-diagram';plus.textContent='＋';diagram.append(plus);}
  const banner=document.createElement('div');banner.className='play-banner';banner.style.background=p.color;banner.style.color=contrastColor(p.color);banner.append(bannerNumber(p.number),bannerWords(p));el.append(diagram,banner);
  if(editable){el.type='button';el.draggable=true;el.setAttribute('aria-label',`${CARD_NAMES[Math.floor(i/8)]}, slot ${i+1}: ${p.number} ${[p.name,p.line2].filter(Boolean).join(', ')||'empty play'}`);el.setAttribute('aria-pressed',String(i===selected));el.onclick=()=>{if(busy||!initialized)return;selected=i;renderCards();renderEditor();};el.ondblclick=()=>{if(busy||!initialized)return;selected=i;renderEditor();$('imagesInput').click();};el.ondragstart=e=>{dragFrom=i;e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',String(i));};el.ondragend=()=>{dragFrom=null;document.querySelectorAll('.drag-over').forEach(x=>x.classList.remove('drag-over'));};el.ondragover=e=>{e.preventDefault();el.classList.add('drag-over');};el.ondragleave=()=>el.classList.remove('drag-over');el.ondrop=e=>{e.preventDefault();el.classList.remove('drag-over');if(busy||!initialized)return;if(e.dataTransfer.files.length){selected=i;renderEditor();uploadFiles([...e.dataTransfer.files]).catch(report);return;}if(dragFrom!==null&&dragFrom!==i){remember();swapPlays(book,dragFrom,i);selected=i;changed();renderEditor();}dragFrom=null;};}
  return el;
}
function renderCards(){const groups=[];for(let g=0;g<3;g++){const section=document.createElement('div');section.className='wrist-group';const label=document.createElement('div');label.className='card-label';label.innerHTML=`<span class="card-index">0${g+1}</span><strong>${CARD_NAMES[g]}</strong><small>Plays ${g*8+1}–${g*8+8}</small>`;const grid=document.createElement('div');grid.className='wrist-card';grid.setAttribute('aria-label',CARD_NAMES[g]+' card');for(let i=0;i<8;i++)grid.append(makeSlot(book.plays[g*8+i],g*8+i));section.append(label,grid);groups.push(section);}$('cards').replaceChildren(...groups);}
function renderPreview(){const p=book.plays[selected];$('editPreview').replaceChildren(makeSlot(p,selected,false));const label=p.image?'Replace play image':'Upload image for this play';$('editPreview').setAttribute('aria-label',label);$('editPreview').title=label;$('clearImage').hidden=!p.image;renderTextSizeHelp();}
function renderEditor(){const p=book.plays[selected];$('selectedPosition').textContent=`${CARD_NAMES[Math.floor(selected/8)].toUpperCase()} · SLOT ${selected+1}`;$('playNumber').value=p.number;$('playName').value=p.name;$('playLine2').value=p.line2||'';$('textSize').value=p.textSize==null?'auto':String(p.textSize);$('moveTo').value=selected;$('swatches').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===p.color)));renderPreview();}
function renderAll(){$('bookTitle').value=book.title;$('playCount').textContent=`${book.plays.filter(p=>p.image).length} / 24 plays`;renderCards();renderEditor();$('undo').disabled=!history.length;}
function lock(value){busy=value;document.querySelectorAll('main button, main input, main select').forEach(el=>el.disabled=value);if(!value)$('undo').disabled=!history.length;$('notice').querySelectorAll('button').forEach(el=>el.disabled=false);}
async function decodeFile(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw Error(`${file.name}: use a PNG, JPG, or WebP image exported from Canva.`);
  if(file.size>20000000)throw Error(`${file.name}: choose an image smaller than 20 MB.`);
  const url=URL.createObjectURL(file);try{const img=new Image();img.src=url;await img.decode();if(img.naturalWidth*img.naturalHeight>40000000)throw Error(`${file.name}: export a smaller image from Canva.`);
    let scale=Math.min(1,1200/Math.max(img.naturalWidth,img.naturalHeight));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(img,0,0,canvas.width,canvas.height);let data=canvas.toDataURL('image/png');if(data.length>320000)data=canvas.toDataURL('image/jpeg',.9);if(data.length>320000)data=canvas.toDataURL('image/jpeg',.72);if(data.length>320000)throw Error(`${file.name}: this image is too detailed. Try a smaller Canva export.`);return {data,width:canvas.width,height:canvas.height};
  }finally{URL.revokeObjectURL(url);}
}
async function uploadFiles(files){if(busy||!initialized||!files.length)return;
  const target=selected,order=Array.from({length:24},(_,i)=>(target+i)%24),slots=order.filter(i=>i===target||!book.plays[i].image);
  if(files.length>slots.length){notice(`There are ${slots.length} available slots, including this play. Choose ${slots.length} or fewer images.`);return;}
  lock(true);status('Preparing play images…');const loaded=[],errors=[];for(let i=0;i<files.length;i++){try{loaded.push({slot:slots[i],image:await decodeFile(files[i]),name:files[i].name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').slice(0,38)});}catch(e){errors.push(e.message);}}
  lock(false);if(loaded.length){remember();for(const item of loaded){const p=book.plays[item.slot];p.image=item.image;p.imageMode=defaultImageMode(item.image);p.overlay=false;if(!p.name)p.name=item.name;}selected=loaded[0].slot;changed();renderEditor();}else status(dirty?'Unsaved changes':key?'Cloud connected':'On this device');if(errors.length)notice(errors.join(' '));
}
async function save(){if(!key||!dirty||conflict||!initialized)return false;if(saving)return saving;
  const snapshot=JSON.stringify(book),saveSerial=serial,currentId=bookId;status('Saving to cloud…');
  saving=(async()=>{try{const result=await rpc('save',{p_key:key,p_id:currentId,p_payload:JSON.parse(snapshot),p_revision:revision});if(bookId!==currentId)return false;revision=result.revision;dirty=serial!==saveSerial;await cache();status(dirty?'Unsaved changes':'Saved to cloud');if(!dirty)$('notice').hidden=true;await refreshBooks();return true;}catch(e){if(e.status===409){conflict=true;status('Cloud version changed',true);notice('This playbook was changed on another device. Your draft is safe here. Open the cloud version or save your edits as a new playbook.',[['Open cloud version',()=>loadBook(bookId,true)],['Save as new playbook',()=>makeBook(book,true)]]);}else{status('Not saved to cloud',true);notice('Cloud save did not finish. Your draft is kept on this device. Retry, or save a backup before switching computers.',[['Retry save',()=>save()]]);}return false;}finally{saving=null;if(dirty&&!conflict&&serial!==saveSerial)timer=setTimeout(()=>save(),900);}})();return saving;
}
function updateUrl(){if(key){historyURL();try{localStorage.setItem('vikings-playbook-location',`${key}.${bookId}`);}catch{}}}
function historyURL(){window.history.replaceState(null,'',`${location.pathname}#${key}.${bookId}`);}
async function refreshBooks(){if(!key)return;try{books=await rpc('list',{p_key:key});const select=$('bookSelect');if(select){select.replaceChildren(...books.map(b=>{const o=document.createElement('option');o.value=b.id;o.textContent=b.title||'Untitled playbook';return o;}));select.value=bookId;}}catch{/* Saving a record must not be reported as failed when only the menu refresh fails. */}}
async function loadBook(id,discard=false){
  if(busy)return;lock(true);
  let recovered=null;
  try{
    if(saving)await saving;
    if(!discard&&dirty){const ok=await save();if(!ok)return;}
    clearTimeout(timer);status('Opening cloud playbook…');
    if(!discard){const cached=await draftRead(`${key}:${id}`).catch(()=>null);if(cached){try{recovered={...cached,book:validateBook(cached.book)};}catch{}}}
    const result=await rpc('load',{p_key:key,p_id:id});
    const validated=validateBook(result.payload);bookId=id;book=validated;revision=result.revision;dirty=false;conflict=false;history=[];selected=0;serial++;updateUrl();
    if(recovered?.dirty){book=recovered.book;dirty=true;if(recovered.revision!==revision){revision=recovered.revision;conflict=true;notice('An unsaved draft on this device differs from the cloud version.',[['Open cloud version',()=>loadBook(bookId,true)],['Save as new playbook',()=>makeBook(book,true)]]);}}
    initialized=true;renderAll();if(!conflict)$('notice').hidden=true;status(conflict?'Cloud version changed':dirty?'Restored unsaved draft':'Saved to cloud',conflict);await refreshBooks();if(dirty&&!conflict)timer=setTimeout(()=>save(),900);await cache();
  }catch(e){
    if(recovered){bookId=id;book=recovered.book;revision=recovered.revision;dirty=recovered.dirty;conflict=false;initialized=true;history=[];selected=0;renderAll();updateUrl();}
    status(recovered?'Offline draft opened':'Could not open cloud playbook',true);
    notice(recovered?'Cloud is unavailable. Your saved draft is open on this device. Retry before switching computers.':'Could not open this playbook. Check your connection and private link.',[['Try again',()=>loadBook(id,false)]]);
  }finally{lock(!initialized);busy=false;}
}
async function makeBook(source=blankBook(),copy=false){
  if(busy)return;lock(true);
  try{
    if(saving)await saving;
    if(dirty&&!copy&&key&&!await save())return;
    clearTimeout(timer);
    const next=validateBook(structuredClone(source));if(copy)next.title=(next.title+' (copy)').slice(0,70);
    book=next;bookId=key?crypto.randomUUID():'draft';revision=0;conflict=false;dirty=true;serial++;history=[];selected=0;initialized=true;updateUrl();renderAll();await cache();
    if(key)await save();else{changed();notice('This draft is on this device. Open your private cloud link to connect saved playbooks.');}
  }finally{lock(!initialized);busy=false;}
}
function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
function filename(){return (book.title.replace(/[^a-z0-9]+/gi,'-').replace(/^-|-$/g,'')||'vikings-playbook').slice(0,70);}
$('editPreview').onclick=()=>{if(!busy&&initialized)$('imagesInput').click();};
$('editPreview').ondragover=e=>{e.preventDefault();if(!busy&&initialized&&Array.from(e.dataTransfer.types).includes('Files'))$('editPreview').classList.add('drag-over');};
$('editPreview').ondragleave=()=>$('editPreview').classList.remove('drag-over');
$('editPreview').ondrop=e=>{e.preventDefault();$('editPreview').classList.remove('drag-over');if(e.dataTransfer.files.length)uploadFiles([...e.dataTransfer.files]).catch(report);};
$('imagesInput').onchange=async e=>{await uploadFiles([...e.target.files]).catch(report);e.target.value='';};
for(const [id,prop] of [['playNumber','number'],['playName','name'],['playLine2','line2']]){$(id).addEventListener('focus',remember);$(id).oninput=e=>{book.plays[selected][prop]=e.target.value;changed();};}
for(const size of TEXT_SIZES){const option=document.createElement('option');option.value=String(size);option.textContent=`${size} pt`;$('textSize').append(option);}
$('textSize').onchange=e=>{remember();book.plays[selected].textSize=e.target.value==='auto'?null:Number(e.target.value);changed();};
$('bookTitle').addEventListener('focus',remember);$('bookTitle').oninput=e=>{book.title=e.target.value;changed();};
for(const [i,color] of COLORS.entries()){const b=document.createElement('button');b.className='swatch';b.style.background=color;b.dataset.color=color;b.setAttribute('aria-label',['Purple','Navy','Green','Red','Gold','Black'][i]);b.onclick=()=>{remember();book.plays[selected].color=color;changed();renderEditor();};$('swatches').append(b);}
for(let i=0;i<24;i++){const o=document.createElement('option');o.value=i;o.textContent=`${i+1} · ${CARD_NAMES[Math.floor(i/8)]}`;$('moveTo').append(o);}$('moveTo').onchange=e=>{const target=Number(e.target.value);remember();swapPlays(book,selected,target);selected=target;changed();renderEditor();};
$('clearImage').onclick=()=>{if(busy||!initialized||!book.plays[selected].image)return;remember();book.plays[selected].image=null;changed();renderEditor();};$('undo').onclick=()=>{if(!history.length)return;book=JSON.parse(history.pop());changed();renderAll();};
$('backup').onclick=()=>download(JSON.stringify(book),filename()+'.json','application/json');$('restore').onclick=()=>$('backupInput').click();$('backupInput').onchange=async e=>{const f=e.target.files[0];if(!f)return;try{if(f.size>8000000)throw Error('This backup is too large.');const candidate=validateBook(JSON.parse(await f.text()));await makeBook(candidate,true);}catch(e){report(e);}finally{$('backupInput').value='';}};
$('newBook').onclick=()=>makeBook().catch(report);
for(const [id,kind] of [['wristPdf','wrist'],['coachPdf','coach']]){$(id).onclick=async()=>{try{const snapshot=validateBook(structuredClone(book));$('notice').hidden=true;$(id).disabled=true;await new Promise(r=>setTimeout(r,0));createPDF(snapshot,kind).save(filename()+(kind==='wrist'?'-wristbands.pdf':'-coach.pdf'));}catch(e){report(e);}finally{$(id).disabled=false;}};}
$('cloudLink').onclick=async()=>{if(!key){notice('Use the private cloud link supplied with this tool to open your saved playbooks.');return;}if(dirty&&!await save())return;$('privateLink').value=location.origin+location.pathname+'#'+key+'.'+bookId;$('copyStatus').textContent='';$('linkDialog').showModal();};$('copyLink').onclick=async()=>{try{await navigator.clipboard.writeText($('privateLink').value);$('copyStatus').textContent='Private link copied.';}catch{$('privateLink').select();$('copyStatus').textContent='Select and copy the link above.';}};
window.addEventListener('beforeunload',e=>{if(dirty&&key){e.preventDefault();e.returnValue='';}});window.addEventListener('online',()=>{if(dirty&&!conflict&&!busy)save();});window.addEventListener('hashchange',()=>location.reload());
async function initialize(){let saved='';try{saved=localStorage.getItem('vikings-playbook-location')||'';}catch{}const token=location.hash.slice(1)||saved;const parts=token.split('.');if(/^[a-f0-9]{64}$/.test(parts[0]||'')){key=parts[0];bookId=uuidPattern.test(parts[1]||'')?parts[1]:'';
  const selector=document.createElement('select');selector.id='bookSelect';selector.setAttribute('aria-label','Switch saved playbook');selector.onchange=e=>loadBook(e.target.value).catch(report);$('bookTitle').before(selector);
  if(bookId){await loadBook(bookId);return;}try{await refreshBooks();if(books.length){await loadBook(books[0].id);return;}await makeBook();}catch(e){report(e);status('Could not connect to cloud',true);}
}else{bookId='draft';const draft=await draftRead(cacheId()).catch(()=>null);if(draft?.book){try{book=validateBook(draft.book);}catch{}}initialized=true;renderAll();status('On this device');notice('Open your private cloud link to load and save playbooks across computers. You can also try the editor and print here.');}}
renderAll();initialize().catch(report);
