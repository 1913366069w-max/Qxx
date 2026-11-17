'use strict';
// Shared by the browser and WeChat Canvas 2D. No network or location API calls.
class Viewport {
  constructor(width=1280,height=1048){this.mw=width;this.mh=height;this.w=0;this.h=0;this.z=1;this.cx=width/2;this.cy=height/2;this.base=1;}
  resize(w,h){this.w=Math.max(1,w);this.h=Math.max(1,h);this.base=Math.min(this.w/this.mw,this.h/this.mh);this.clamp();}
  get scale(){return this.base*this.z;}
  get ox(){return this.w/2-this.cx*this.scale;}
  get oy(){return this.h/2-this.cy*this.scale;}
  clamp(){const hw=this.w/this.scale/2,hh=this.h/this.scale/2;this.cx=hw>=this.mw/2?this.mw/2:Math.max(hw,Math.min(this.mw-hw,this.cx));this.cy=hh>=this.mh/2?this.mh/2:Math.max(hh,Math.min(this.mh-hh,this.cy));}
  fit(){this.z=1;this.cx=this.mw/2;this.cy=this.mh/2;this.clamp();}
  point(x,y){return [(x-this.ox)/this.scale,(y-this.oy)/this.scale];}
  zoomAt(factor,x=this.w/2,y=this.h/2){const [mx,my]=this.point(x,y);this.z=Math.max(1,Math.min(64,this.z*factor));this.cx=mx-(x-this.w/2)/this.scale;this.cy=my-(y-this.h/2)/this.scale;this.clamp();}
  pan(dx,dy){this.cx-=dx/this.scale;this.cy-=dy/this.scale;this.clamp();}
  focus(x,y,z=6){this.z=Math.max(1,Math.min(64,z));this.cx=x;this.cy=y;this.clamp();}
}
class TouchGesture {
  constructor(view){this.view=view;this.prev=[];}
  update(points){
    const sorted=points.slice(0,2).sort((a,b)=>a.id-b.id);
    if(sorted.length===this.prev.length && sorted.every((p,i)=>p.id===this.prev[i].id)){
      if(sorted.length===1)this.view.pan(sorted[0].x-this.prev[0].x,sorted[0].y-this.prev[0].y);
      if(sorted.length===2){
        const a=this.prev,b=sorted;const pc=[(a[0].x+a[1].x)/2,(a[0].y+a[1].y)/2],cc=[(b[0].x+b[1].x)/2,(b[0].y+b[1].y)/2];
        const pd=Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),cd=Math.hypot(b[0].x-b[1].x,b[0].y-b[1].y);
        if(pd>2&&cd>2)this.view.zoomAt(cd/pd,pc[0],pc[1]);
        this.view.pan(cc[0]-pc[0],cc[1]-pc[1]);
      }
    }
    this.prev=sorted.map(p=>({...p}));
  }
  reset(){this.prev=[];}
}
function commands(d){
  const t=d.trim().split(/[ ,\t\r\n]+/),out=[];let i=0;
  while(i<t.length){const op=t[i++],n={M:2,L:2,Q:4,C:6,Z:0}[op];if(n===undefined)throw Error('Unknown map path '+op);const args=t.slice(i,i+n).map(Number);if(args.length!==n||args.some(v=>!Number.isFinite(v)))throw Error('Invalid path');i+=n;out.push([op,...args]);}
  return out;
}
function replay(c,ops){c.beginPath();for(const o of ops){switch(o[0]){case 'M':c.moveTo(o[1],o[2]);break;case 'L':c.lineTo(o[1],o[2]);break;case 'Q':c.quadraticCurveTo(...o.slice(1));break;case 'C':c.bezierCurveTo(...o.slice(1));break;case 'Z':c.closePath();break;}}}
const preparedMaps=new WeakMap();
function prepare(data,PathCtor){
  let variants=preparedMaps.get(data);if(!variants){variants=new Map();preparedMaps.set(data,variants);}
  const key=PathCtor||null;if(variants.has(key))return variants.get(key);
  const result={data,shapes:data.shapes.map(s=>{
    const ops=commands(s.d);let left=Infinity,top=Infinity,right=-Infinity,bottom=-Infinity;
    for(const op of ops)for(let i=1;i+1<op.length;i+=2){const x=op[i],y=op[i+1];if(x<left)left=x;if(x>right)right=x;if(y<top)top=y;if(y>bottom)bottom=y;}
    const pad=(s.width||0)+2;return {...s,ops,path:PathCtor?new PathCtor(s.d):null,bounds:[left-pad,top-pad,right+pad,bottom+pad]};
  })};variants.set(key,result);return result;
}
const textCaches=new WeakMap();
function textMetrics(c,text,font,size){
  let cache=textCaches.get(c);if(!cache){cache=new Map();textCaches.set(c,cache);}
  const key=font+'\u0000'+text;let result=cache.get(key);if(result)return result;
  const lines=text.split('\n');c.font=font;
  const width=Math.max(...lines.map(t=>c.measureText?c.measureText(t).width:[...t].reduce((sum,ch)=>sum+(ch.charCodeAt(0)>255?size:size*.6),0)))+6;
  result={lines,width};if(cache.size>=1024)cache.clear();cache.set(key,result);return result;
}
function overlaps(a,b){return a[0]<b[2]&&a[2]>b[0]&&a[1]<b[3]&&a[3]>b[1];}
function layout(c,data,v,state={}){
  const occupied=(v.exclusions||[]).slice(),markers=[],labels=[];
  const candidates=[];
  (data.routing?.buildings||[]).forEach((b,i)=>{const selected=i===state.start||i===state.end;if(v.z>=2.2||selected)candidates.push({id:'building-'+i,index:i,x:b.iconX,y:b.iconY,label:b.name,kind:'building',selected,priority:selected?100:20});});
  if(v.z>=1.8)for(const m of data.life?.markers||[])candidates.push({...m,priority:m.kind==='passage'?70:m.kind==='cafeteria'?60:40});
  candidates.sort((a,b)=>b.priority-a.priority);
  const fits=r=>r[0]>=2&&r[1]>=2&&r[2]<=v.w-2&&r[3]<=v.h-2&&!occupied.some(b=>overlaps(r,b));
  for(const m of candidates){const x=v.ox+m.x*v.scale,y=v.oy+m.y*v.scale,r=m.selected?15:12,rect=[x-r,y-r,x+r,y+r];if(!fits(rect))continue;occupied.push(rect);markers.push({...m,sx:x,sy:y,rect});}
  const textCandidates=data.labels.filter(l=>l.minZoom<=v.z&&!(l.size>=18&&v.z>4)).map(l=>({...l,sx:v.ox+l.x*v.scale,sy:v.oy+l.y*v.scale,fontSize:Math.min(l.size>=18?20:16,Math.max(9.5,l.size*v.scale)),priority:l.text==='新纺织大楼'?55:l.size>=18?30:10}));
  for(const m of markers)if(m.kind!=='building'||m.selected)textCandidates.push({text:m.label,sx:m.sx,sy:m.sy+23,fontSize:11.5,color:m.kind==='passage'?'#3c88b0':'#49685e',bold:true,halo:true,angle:0,priority:m.selected?100:50,movable:true});
  textCandidates.sort((a,b)=>b.priority-a.priority);
  for(const l of textCandidates){const size=l.fontSize,font=`${l.bold?'bold':'normal'} ${size}px sans-serif`,{lines,width}=textMetrics(c,l.text,font,size),height=lines.length*size*1.35+4,angle=(l.angle||0)*Math.PI/180;
    const ww=Math.abs(width*Math.cos(angle))+Math.abs(height*Math.sin(angle)),hh=Math.abs(width*Math.sin(angle))+Math.abs(height*Math.cos(angle));
    const offsets=l.movable?[[0,0],[0,-46],[ww/2+16,-23],[-ww/2-16,-23]]:[[0,0]];
    for(const [dx,dy] of offsets){const sx=l.sx+dx,sy=l.sy+dy,rect=[sx-ww/2,sy-hh/2,sx+ww/2,sy+hh/2];if(!fits(rect))continue;occupied.push(rect);labels.push({...l,sx,sy,rect,lines});break;}
  }
  v.visibleBuildings=new Set(markers.filter(m=>m.kind==='building').map(m=>m.index));v.lifeMarkers=markers.filter(m=>m.kind!=='building');
  return {markers,labels,occupied};
}
function draw(c,prepared,v,dpr=1,state={}){
  c.setTransform(dpr,0,0,dpr,0,0);c.fillStyle='#f4f4e3';c.fillRect(0,0,v.w,v.h);
  c.save();c.translate(v.ox,v.oy);c.scale(v.scale,v.scale);c.lineCap='round';c.lineJoin='round';
  const left=-v.ox/v.scale,top=-v.oy/v.scale,right=(v.w-v.ox)/v.scale,bottom=(v.h-v.oy)/v.scale;
  for(const s of prepared.shapes){const b=s.bounds;if((s.minZoom||1)>v.z||b[2]<left||b[0]>right||b[3]<top||b[1]>bottom)continue;
    if(s.fill){c.fillStyle=s.fill;if(s.path)c.fill(s.path,'evenodd');else if(s.triangles){const t=s.triangles;c.beginPath();for(let i=0;i<t.length;i+=6){c.moveTo(t[i],t[i+1]);c.lineTo(t[i+2],t[i+3]);c.lineTo(t[i+4],t[i+5]);c.closePath();}c.fill();}else {replay(c,s.ops);c.fill();}}
    if(s.stroke&&s.width){c.strokeStyle=s.stroke;c.lineWidth=s.width;if(c.setLineDash)c.setLineDash(s.dashed?[s.width*4,s.width*3]:[]);if(s.path)c.stroke(s.path);else {replay(c,s.ops);c.stroke();}}
  }
  if(c.setLineDash)c.setLineDash([]);
  c.restore();
  const scene=layout(c,prepared.data,v,state);prepared.layout=scene;
  for(const l of scene.labels){c.save();c.translate(l.sx,l.sy);c.rotate((l.angle||0)*Math.PI/180);c.font=`${l.bold?'bold':'normal'} ${l.fontSize}px sans-serif`;c.textAlign='center';c.textBaseline='middle';l.lines.forEach((t,i)=>{const y=(i-(l.lines.length-1)/2)*l.fontSize*1.35;if(l.halo){c.strokeStyle='#f7f8ed';c.lineWidth=3;c.strokeText(t,0,y);}c.fillStyle=l.color;c.fillText(t,0,y);});c.restore();}
  for(const m of v.lifeMarkers){c.beginPath();if(c.arc)c.arc(m.sx,m.sy,10,0,Math.PI*2);else {c.moveTo(m.sx-10,m.sy-10);c.lineTo(m.sx+10,m.sy-10);c.lineTo(m.sx+10,m.sy+10);c.lineTo(m.sx-10,m.sy+10);c.closePath();}c.fillStyle=m.kind==='passage'?'#61a9c9':m.kind==='cafeteria'?'#c98b53':'#789873';c.fill();c.strokeStyle='#fffef7';c.lineWidth=2;c.stroke();c.font='bold 11px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillStyle='#fff';c.fillText(m.symbol,m.sx,m.sy);}
  return scene;
}
module.exports={Viewport,TouchGesture,commands,prepare,draw,layout,overlaps};
