export const CARD_NAMES = ['Outside', 'Inside top', 'Inside bottom'];
export const COLORS = ['#49206e','#172d49','#176247','#b92f3e','#f4c541','#252332'];
export const GEOMETRY = Object.freeze({ pageWidth:612,pageHeight:792,cardWidth:310.5,cardHeight:144,cellWidth:77.625,cellHeight:72,cardX:150.75,cardY:[108,288,468],coachX:36,coachY:[100,322,544],coachWidth:540,coachHeight:198 });
export const CANVA = Object.freeze({width:1200,height:1200,bannerHeight:326,playHeight:874});
export const TEXT_SIZES = Object.freeze(Array.from({length:16},(_,i)=>4.5+i*.5));
export function emptyPlay(i) { return { number:String(i+1),name:'',line2:'',textSize:null,color:COLORS[0],overlay:false,imageMode:'full',image:null }; }
export function blankBook() { return {version:1,title:'Vikings · Game day',plays:Array.from({length:24},(_,i)=>emptyPlay(i))}; }
export function validateBook(value) {
  if (!value || value.version!==1 || typeof value.title!=='string' || value.title.length>70 || !Array.isArray(value.plays) || value.plays.length!==24) throw Error('Choose a Vikings playbook backup with 24 play slots.');
  if (JSON.stringify(value).length>8000000) throw Error('This playbook is too large. Use smaller play images.');
  return {version:1,title:value.title,plays:value.plays.map(p=>{
    if (!p || typeof p.number!=='string' || p.number.length>4 || typeof p.name!=='string' || p.name.length>38 || !/^#[0-9a-f]{6}$/i.test(p.color) || typeof p.overlay!=='boolean') throw Error('This playbook has an invalid play.');
    if ((p.line2!==undefined && (typeof p.line2!=='string' || p.line2.length>38)) || (p.imageMode!==undefined && !['full','canva-326'].includes(p.imageMode))) throw Error('This playbook has invalid banner or image settings.');
    if (p.textSize!==undefined && p.textSize!==null && !TEXT_SIZES.includes(p.textSize)) throw Error('This playbook has an invalid text size.');
    if (p.image!==null && (typeof p.image!=='object' || typeof p.image.data!=='string' || !/^data:image\/(png|jpeg);base64,[a-zA-Z0-9+/]+=*$/.test(p.image.data) || p.image.data.length>360000 || !Number.isInteger(p.image.width) || !Number.isInteger(p.image.height) || p.image.width<1 || p.image.height<1 || p.image.width>1600 || p.image.height>1600)) throw Error('This playbook contains an unsupported image.');
    return {number:p.number,name:p.name,line2:p.line2??'',textSize:p.textSize??null,color:p.color,overlay:p.overlay,imageMode:p.imageMode??'full',image:p.image ? {data:p.image.data,width:p.image.width,height:p.image.height} : null};
  })};
}
export function contrastColor(hex) {
  const rgb=hex.slice(1).match(/../g).map(v=>{const c=parseInt(v,16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4});
  return .2126*rgb[0]+.7152*rgb[1]+.0722*rgb[2]>.179?'#111111':'#ffffff';
}
export function fitImage(sw,sh,x,y,w,h) { const s=Math.min(w/sw,h/sh);return {x:x+(w-sw*s)/2,y:y+(h-sh*s)/2,width:sw*s,height:sh*s}; }
export function defaultImageMode(image) { return image.width===image.height?'canva-326':'full'; }
export function imageLayout(p,w,h) {
  const cropped=p.imageMode==='canva-326',fraction=cropped?CANVA.playHeight/CANVA.height:1;
  const diagramHeight=h*((p.overlay&&!cropped)?1:.8);
  const inset=cropped?0:2;
  const box=fitImage(p.image.width,p.image.height*fraction,inset,inset,w-inset*2,diagramHeight-inset*2);
  // Canva artwork meets the banner and uses the full wristband width.
  // Keep its proportions; the wider coach cells may have space at the sides.
  if(cropped)box.y=diagramHeight-box.height;
  return {...box,fullHeight:box.height/fraction,diagramHeight,cropped};
}
export function swapPlays(book,from,to) { if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||from>23||to<0||to>23) throw Error('Invalid slot');[book.plays[from],book.plays[to]]=[book.plays[to],book.plays[from]]; }
