import { GEOMETRY as G,CARD_NAMES,contrastColor,fitImage } from './model.js';
export function createPDF(book,kind,PDF=globalThis.jspdf?.jsPDF) {
  if(!PDF) throw Error('The PDF tool did not load. Refresh the page and try again.');
  const doc=new PDF({unit:'pt',format:'letter',orientation:'portrait',precision:6,compress:true});
  doc.viewerPreferences({PrintScaling:'None'});
  doc.setProperties({title:book.title+' - '+(kind==='wrist'?'Wristband cards':'Coach sheet'),author:'Vikings Playbook'});
  const ascii=s=>s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/[–—·]/g,'-').replace(/[^\x20-\x7e]/g,'');
  doc.setFont('helvetica','bold');doc.setFontSize(19);doc.setTextColor('#301449');
  const title=ascii(book.title)||'Vikings Playbook';
  doc.text(doc.splitTextToSize(title,540).slice(0,2),36,40);
  doc.setFont('helvetica','normal');doc.setFontSize(9);doc.setTextColor('#555555');
  doc.text(kind==='wrist'?'WRISTBAND CARDS  /  4 5/16 in x 2 in  /  PRINT AT 100%':'COACH SHEET  /  ALL 24 PLAYS',36,78);
  function play(p,x,y,w,h){
    const bannerH=h*.2;
    if(p.image){const box=fitImage(p.image.width,p.image.height,x+2,y+2,w-4,h-(p.overlay?0:bannerH)-4);doc.addImage(p.image.data,p.image.data.startsWith('data:image/png')?'PNG':'JPEG',box.x,box.y,box.width,box.height,undefined,'FAST');}
    doc.setFillColor(p.color);doc.rect(x,y+h-bannerH,w,bannerH,'F');doc.setTextColor(contrastColor(p.color));
    doc.setFont('helvetica','bold');const num=ascii(p.number);let nf=kind==='wrist'?9:13;doc.setFontSize(nf);while(doc.getTextWidth(num)>w*.24-6&&nf>5){doc.setFontSize(--nf);}doc.text(num,x+3,y+h-bannerH/2+nf*.34);
    const numberWidth=w*.24;doc.setDrawColor(contrastColor(p.color));doc.setLineWidth(.25);doc.line(x+numberWidth-2,y+h-bannerH+3,x+numberWidth-2,y+h-3);
    const name=ascii(p.name);let fs=kind==='wrist'?7:10;doc.setFontSize(fs);let lines=doc.splitTextToSize(name,w-numberWidth-5);
    while((lines.length>2||lines.length*fs*1.05>bannerH-2)&&fs>4.5){fs-=.25;doc.setFontSize(fs);lines=doc.splitTextToSize(name,w-numberWidth-5);}
    // Labels are capped in the editor; two measured lines remain inside the fixed banner.
    if(lines.length>2){throw Error('Shorten the banner words on play '+p.number+' before printing.');}
    doc.text(lines,x+numberWidth+1,y+h-bannerH/2-(lines.length-1)*fs*.525+fs*.34,{lineHeightFactor:1.05});
  }
  for(let group=0;group<3;group++){
    const wrist=kind==='wrist',x=wrist?G.cardX:G.coachX,y=(wrist?G.cardY:G.coachY)[group],w=wrist?G.cardWidth:G.coachWidth,h=wrist?G.cardHeight:G.coachHeight;
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor('#444444');doc.text(`${group+1}  ${CARD_NAMES[group].toUpperCase()}`,x,y-9);
    for(let i=0;i<8;i++) play(book.plays[group*8+i],x+(i%4)*w/4,y+Math.floor(i/4)*h/2,w/4,h/2);
    doc.setDrawColor('#666666');doc.setLineWidth(.3);
    for(let i=1;i<4;i++)doc.line(x+i*w/4,y,x+i*w/4,y+h);doc.line(x,y+h/2,x+w,y+h/2);
    doc.setDrawColor('#111111');doc.setLineWidth(.4);doc.rect(x,y,w,h,'S');
    if(wrist){for(const [cx,cy,dx,dy] of [[x,y,-1,-1],[x+w,y,1,-1],[x,y+h,-1,1],[x+w,y+h,1,1]]){doc.line(cx+dx*3,cy,cx+dx*9,cy);doc.line(cx,cy+dy*3,cx,cy+dy*9);}}
  }
  if(kind==='wrist'){
    doc.setDrawColor('#111111');doc.setLineWidth(.6);doc.line(150.75,670,222.75,670);doc.line(150.75,666,150.75,674);doc.line(222.75,666,222.75,674);
    doc.line(430,654,430,726);doc.line(426,654,434,654);doc.line(426,726,434,726);
    doc.setFont('helvetica','bold');doc.setFontSize(9);doc.setTextColor('#222222');doc.text('THIS LINE MUST MEASURE 1 INCH',150.75,690);doc.text('1 INCH',442,693);
    doc.setFont('helvetica','normal');doc.setFontSize(9);doc.text('Letter paper. Choose Actual size / 100%, with no Fit or Shrink.',150.75,711);doc.text('Cut around each outer rectangle. Keep the eight plays together.',150.75,725);
  }
  return doc;
}
