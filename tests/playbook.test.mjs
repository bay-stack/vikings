import test from 'node:test';
import assert from 'node:assert/strict';
import { jsPDF } from 'jspdf';
import {blankBook,validateBook,swapPlays,fitImage,contrastColor,GEOMETRY,imageLayout,defaultImageMode,CANVA} from '../playbook/model.js';
import {createPDF} from '../playbook/pdf.js';
test('card measurements and all eight cells preserve the requested inches',()=>{assert.equal(GEOMETRY.cardWidth/72,4.3125);assert.equal(GEOMETRY.cardHeight/72,2);assert.equal(GEOMETRY.cellWidth*4,GEOMETRY.cardWidth);assert.equal(GEOMETRY.cellHeight*2,GEOMETRY.cardHeight);});
test('portrait and panoramic images stay fully contained without distortion',()=>{for(const [sw,sh] of [[100,1000],[1200,100],[500,500]]){const r=fitImage(sw,sh,10,20,70,55);assert.ok(r.x>=10&&r.y>=20);assert.ok(r.x+r.width<=80.00001&&r.y+r.height<=75.00001);assert.ok(Math.abs(r.width/r.height-sw/sh)<.00001);}});
test('reordering preserves number and text across card boundaries',()=>{const b=blankBook();b.plays[0].name='Twins right';swapPlays(b,0,23);assert.equal(b.plays[23].name,'Twins right');assert.equal(b.plays[23].number,'1');assert.equal(b.plays[0].number,'24');assert.throws(()=>swapPlays(b,-1,2));});
test('backups round trip and reject executable URLs, invalid shape, and oversized text',()=>{const b=blankBook();assert.deepEqual(validateBook(JSON.parse(JSON.stringify(b))),b);b.plays[0].image={data:'javascript:alert(1)',width:10,height:10};assert.throws(()=>validateBook(b));b.plays[0].image=null;b.plays[0].name='x'.repeat(39);assert.throws(()=>validateBook(b));assert.throws(()=>validateBook({...blankBook(),plays:[]}));});
test('banner colors pick readable text',()=>{assert.equal(contrastColor('#49206e'),'#ffffff');assert.equal(contrastColor('#f4c541'),'#111111');});
test('each PDF is one US Letter page and requests actual-size printing',()=>{for(const kind of ['wrist','coach']){const b=blankBook();b.plays.forEach((p,i)=>{p.name=i===23?'Right play action rollout pass':'Twins right';});const doc=createPDF(b,kind,jsPDF);assert.equal(doc.getNumberOfPages(),1);assert.equal(doc.internal.pageSize.getWidth(),612);assert.equal(doc.internal.pageSize.getHeight(),792);assert.match(doc.output(),/\/PrintScaling \/None/);}});
test('Canva crops exactly 326 source pixels, scales doubled exports, and preserves the full diagram',()=>{
  const p={...blankBook().plays[0],imageMode:'canva-326',overlay:true,image:{width:1200,height:1200}};
  const a=imageLayout(p,GEOMETRY.cellWidth,GEOMETRY.cellHeight);
  assert.equal(CANVA.height-CANVA.playHeight,326);
  assert.ok(Math.abs(a.height/a.fullHeight-874/1200)<1e-10);
  assert.ok(Math.abs(a.width/a.height-1200/874)<1e-10);
  assert.ok(a.y+a.height<=GEOMETRY.cellHeight*.8-2+1e-10);
  assert.deepEqual(imageLayout({...p,image:{width:2400,height:2400}},GEOMETRY.cellWidth,GEOMETRY.cellHeight),a);
  assert.equal(defaultImageMode(p.image),'canva-326');assert.equal(defaultImageMode({width:1200,height:874}),'full');
});
test('legacy backups preserve full-image and overlay behavior; new fields survive backup and swaps',()=>{
  const old=blankBook();old.plays.forEach(p=>{delete p.line2;delete p.imageMode;});old.plays[0].overlay=true;
  const migrated=validateBook(old);assert.equal(migrated.plays[0].imageMode,'full');assert.equal(migrated.plays[0].line2,'');assert.equal(migrated.plays[0].overlay,true);
  migrated.plays[0].image={width:1200,height:1200,data:'data:image/png;base64,AAAA'};
  const full=imageLayout(migrated.plays[0],GEOMETRY.cellWidth,GEOMETRY.cellHeight);assert.equal(full.height,full.fullHeight);assert.equal(full.diagramHeight,72);
  Object.assign(migrated.plays[0],{imageMode:'canva-326',line2:'Jet sweep'});swapPlays(migrated,0,23);
  const restored=validateBook(JSON.parse(JSON.stringify(migrated)));assert.equal(restored.plays[23].line2,'Jet sweep');assert.equal(restored.plays[23].imageMode,'canva-326');
  for(const invalid of [{line2:'x'.repeat(39)},{line2:null},{imageMode:'unknown'},{imageMode:null}]){const bad=structuredClone(restored);Object.assign(bad.plays[0],invalid);assert.throws(()=>validateBook(bad));}
});
test('both banner fields print as separate lines and overlong explicit lines are rejected',()=>{
  for(const kind of ['wrist','coach']){
    const b=blankBook();Object.assign(b.plays[0],{name:'Twins right',line2:'Jet sweep'});
    const doc=createPDF(b,kind,jsPDF),content=doc.internal.pages[1].join('\n');
    assert.match(content,/\(Twins right\) Tj/);assert.match(content,/\(Jet sweep\) Tj/);assert.equal(doc.getNumberOfPages(),1);
    Object.assign(b.plays[0],{name:'W'.repeat(38),line2:'W'.repeat(38)});assert.throws(()=>createPDF(b,kind,jsPDF),/Shorten the banner text on play 1/);
  }
});
