'use strict';
// Pure offline graph search and selection state shared by web / WeChat.
class MinHeap {
  constructor(){this.items=[];}
  less(a,b){return a[1]<b[1]||(a[1]===b[1]&&a[0]<b[0]);}
  push(value){const heap=this.items;let i=heap.length;heap.push(value);while(i>0){const parent=(i-1)>>1;if(!this.less(value,heap[parent]))break;heap[i]=heap[parent];i=parent;}heap[i]=value;}
  pop(){const heap=this.items;if(!heap.length)return null;const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&this.less(heap[child+1],heap[child]))child++;if(!this.less(heap[child],last))break;heap[i]=heap[child];i=child;}heap[i]=last;}return first;}
}
class RouteModel {
  constructor(data){this.data=data;this.graph=data.routing||{nodes:[],edges:[],buildings:[]};this.buildings=this.graph.buildings;this.targets=[...this.buildings,...(this.graph.targets||[])];this.targetById=new Map(this.targets.map((target,index)=>[String(target.id),index]));this.adj=this.graph.nodes.map(()=>[]);for(const e of this.graph.edges){this.adj[e[0]].push([e[1],e[2],e[3]]);this.adj[e[1]].push([e[0],e[2],e[3]]);}this.clear();}
  targetIndex(id){return this.targetById.get(String(id))??-1;}
  clear(){this.start=-1;this.end=-1;this.fromLocation=false;this.result=null;this.message='';}
  useLocation(){this.start=-1;this.end=-1;this.fromLocation=true;this.result=null;this.message=this.position?.usable?'当前位置已设为起点 · 请点目的楼宇':(this.locationMessage||'等待定位授权与信号…');}
  static project(lon,lat){const r=6378137,k=Math.cos(36.0717*Math.PI/180)*.725,mercY=a=>r*Math.log(Math.tan(Math.PI/4+a*Math.PI/360));return [60+(lon-120.4082475)*Math.PI/180*r*k,55+(mercY(36.0773242)-mercY(lat))*k];}
  static inRing(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if(((a[1]>p[1])!==(b[1]>p[1]))&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
  static inPolygon(p,rings){return rings.length>0&&RouteModel.inRing(p,rings[0])&&!rings.slice(1).some(r=>RouteModel.inRing(p,r));}
  static crosses(a,b,c,d){const cross=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);return cross(a,b,c)*cross(a,b,d)<-1e-8&&cross(c,d,a)*cross(c,d,b)<-1e-8;}
  setLocation(lon,lat,accuracy,timestamp=Date.now(),now=Date.now()){
    if(![lon,lat,accuracy,timestamp].every(Number.isFinite)||Math.abs(lat)>85||Math.abs(lon)>180||accuracy<0){this.locationError('定位数据无效，请重试');return;}
    const [x,y]=RouteModel.project(lon,lat),zone=(this.graph.zones||[]).findIndex(z=>RouteModel.inPolygon([x,y],z)),fresh=now-timestamp<=30000&&timestamp-now<=5000;
    this.position={x,y,accuracy,timestamp,zone,fresh,usable:fresh&&accuracy<=80&&zone>=0};
    this.locationMessage=!fresh?'定位已过期，等待新信号':zone<0?'当前位置在校园路网范围外':accuracy>80?'定位精度不足，请到开阔处重试':`定位精度 ±${Math.round(accuracy)}米`;
    if(this.fromLocation){if(this.end>=0)this.planCurrent();else this.message=this.position.usable?'当前位置已设为起点 · 请点目的楼宇':this.locationMessage;}
  }
  locationError(message){this.locationMessage=message;if(this.position){this.position.fresh=false;this.position.usable=false;}if(this.fromLocation){this.result=null;this.message=message;}}
  expireLocation(now=Date.now()){if(this.position?.fresh&&now-this.position.timestamp>30000)this.locationError('定位已过期，等待新信号');}
  stopLocation(){this.position=null;this.locationMessage='定位已关闭';if(this.fromLocation)this.clear();}
  planCurrent(){this.result=this.position?.usable?this.findCurrent(this.end):null;this.message=this.result?`当前位置 → ${this.targets[this.end].name} · ${Math.round(this.result.distance)}米 / 步行约${this.result.minutes}分钟`:!this.position?.usable?(this.locationMessage||'等待定位信号'):'当前位置无法接入目的地的已知路网，请现场确认';}
  select(index){if(index<0||index>=this.targets.length)return;const b=this.targets[index];
    if(this.fromLocation){this.end=index;this.planCurrent();return;}
    if(this.start<0||this.end>=0){this.start=index;this.end=-1;this.result=null;this.message='起点：'+b.name+' · 请点终点';return;}
    if(index===this.start){this.message='请选择另一处地点作为终点';return;}
    this.end=index;this.result=this.find(this.start,this.end)||this.findNearestRoad(this.start,this.end);
    this.message=this.result?`${this.targets[this.start].name} → ${b.name} · ${Math.round(this.result.distance)}米 / 步行约${this.result.minutes}分钟`:'';
  }
  find(start,end){const a=this.targets[start],b=this.targets[end];if(!a||!b||a.node<0||b.node<0||a.component!==b.component)return null;
    const points=[[a.x,a.y],...a.approach];return this.search(b,[{node:a.node,cost:this.length(points),segments:[{points,kind:'approach'}]}]);
  }
  nearestRoad(target,component){
    let best=null;
    for(const e of this.graph.edges){
      if(e[3]==='approach'||e[3]==='underpass'||this.graph.nodeComponents[e[0]]!==component||this.graph.nodeLayers[e[0]]!=='0'||this.graph.nodeLayers[e[1]]!=='0')continue;
      const a=this.graph.nodes[e[0]],b=this.graph.nodes[e[1]],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;if(den<1e-8)continue;
      const t=Math.max(0,Math.min(1,((target.x-a[0])*dx+(target.y-a[1])*dy)/den)),q=[a[0]+dx*t,a[1]+dy*t],distance=Math.hypot(target.x-q[0],target.y-q[1]);
      if(!best||distance<best.distance)best={edge:e,point:q,distance};
    }
    return best;
  }
  findNearestRoad(start,end){
    const a=this.targets[start],b=this.targets[end];if(!a||!b||!this.graph.nodeComponents)return null;
    const counts=new Map();for(const value of this.graph.nodeComponents)counts.set(value,(counts.get(value)||0)+1);
    const component=[...counts].sort((a,b)=>b[1]-a[1])[0]?.[0];if(component==null)return null;
    // Snap to road projections, not invented connecting lines across property.
    // Only traversed graph edges contribute to distance; endpoint markers show
    // the road actually reached when a destination's own network is disconnected.
    const from=a.node<0||a.component!==component?this.nearestRoad(a,component):null;
    const to=b.node<0||b.component!==component?this.nearestRoad(b,component):null;
    if((a.node<0||a.component!==component)&&!from||(b.node<0||b.component!==component)&&!to)return null;
    const startPoints=[[a.x,a.y],...a.approach];
    const seeds=from?from.edge.slice(0,2).map(node=>({node,cost:this.length([from.point,this.graph.nodes[node]]),segments:[{points:[from.point,this.graph.nodes[node]],kind:from.edge[3]}]})):[{node:a.node,cost:this.length(startPoints),segments:[{points:startPoints,kind:'approach'}]}];
    const ends=to?to.edge.slice(0,2).map(node=>({node,x:to.point[0],y:to.point[1],approach:[to.point,this.graph.nodes[node]],approachKind:to.edge[3]})):[b];
    const results=ends.map(target=>this.search(target,seeds)).filter(Boolean);
    if(from&&to&&from.edge===to.edge){const distance=this.length([from.point,to.point]);results.push({distance,minutes:Math.max(1,Math.ceil(distance/70)),segments:[{points:[from.point,to.point],kind:from.edge[3]}],nodeIds:[]});}
    const result=results.sort((a,b)=>a.distance-b.distance)[0];
    return result?{...result,roadFallback:true,startPoint:from?.point||[a.x,a.y],endPoint:to?.point||[b.x,b.y]}:null;
  }
  markerPoint(index){const override=index===this.start?this.result?.startPoint:index===this.end?this.result?.endPoint:null;const b=this.targets[index];return override||[b.iconX,b.iconY];}
  length(pts){return pts.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1])/(this.data.metersToPageUnits||.725),0);}
  clearApproach(a,b,zone){
    // Only the footprint containing the fix may be exited. Other buildings and
    // campus boundaries remain barriers; this is an estimated access segment.
    const n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/2));
    for(let i=0;i<=n;i++)if(!RouteModel.inPolygon([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n],this.graph.zones[zone]))return false;
    for(const poly of this.graph.obstacles||[]){if(RouteModel.inPolygon(a,poly))continue;if(RouteModel.inPolygon(b,poly))return false;for(const ring of poly)for(let i=1;i<ring.length;i++)if(RouteModel.crosses(a,b,ring[i-1],ring[i]))return false;}
    return true;
  }
  findCurrent(end){const p=this.position,b=this.targets[end];if(!p?.usable||!b||b.node<0)return null;const at=[p.x,p.y],scale=this.data.metersToPageUnits||.725,candidates=[];
    for(const e of this.graph.edges){const [ai,bi,,kind]=e;if(kind==='underpass'||kind==='approach'||this.graph.nodeZones[ai]!==p.zone||this.graph.nodeZones[bi]!==p.zone||this.graph.nodeLayers[ai]!=='0'||this.graph.nodeLayers[bi]!=='0')continue;
      const a=this.graph.nodes[ai],b=this.graph.nodes[bi],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;if(den<1e-8)continue;const t=Math.max(0,Math.min(1,((p.x-a[0])*dx+(p.y-a[1])*dy)/den)),q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(p.x-q[0],p.y-q[1]);
      if(d<=70*scale)candidates.push({e,q,d});
    }
    candidates.sort((a,b)=>a.d-b.d);const valid=[];let nearest=Infinity;
    for(const c of candidates){if(c.d>nearest+1.5*scale)break;if(!this.clearApproach(at,c.q,p.zone))continue;nearest=Math.min(nearest,c.d);valid.push(c);}
    const seeds=[];for(const {e,q,d} of valid)for(const node of [e[0],e[1]])seeds.push({node,cost:d/scale+this.length([q,this.graph.nodes[node]]),segments:[{points:[at,q],kind:'approach'},{points:[q,this.graph.nodes[node]],kind:e[3]}]});
    return this.search(b,seeds);
  }
  search(b,seeds){if(!seeds.length)return null;
    const n=this.graph.nodes.length,dist=new Float64Array(n).fill(Infinity),prev=new Int32Array(n).fill(-1),kind=Array(n),used=new Uint8Array(n),origins=new Map();
    const queue=new MinHeap();
    for(const s of seeds)if(s.cost<dist[s.node]){dist[s.node]=s.cost;origins.set(s.node,s);queue.push([s.node,s.cost]);}
    // Heap Dijkstra avoids repeatedly scanning every node on the UI thread.
    for(let next;(next=queue.pop());){const [u,best]=next;if(used[u]||best!==dist[u])continue;if(u===b.node)break;used[u]=1;
      for(const [v,w,k] of this.adj[u])if(dist[v]>best+w){dist[v]=best+w;prev[v]=u;kind[v]=k;queue.push([v,dist[v]]);}}
    if(!Number.isFinite(dist[b.node]))return null;
    const ids=[b.node];while(prev[ids[ids.length-1]]>=0)ids.push(prev[ids[ids.length-1]]);ids.reverse();const seed=origins.get(ids[0]);if(!seed)return null;
    const segments=[],push=(points,k)=>{if(points.length<2)return;const prev=segments[segments.length-1],last=prev?.points[prev.points.length-1];if(prev&&prev.kind===k&&last[0]===points[0][0]&&last[1]===points[0][1])prev.points.push(...points.slice(1));else segments.push({points:[...points],kind:k});};
    const endPoints=[...b.approach].reverse().concat([[b.x,b.y]]);
    for(const s of seed.segments)push(s.points,s.kind);for(let i=1;i<ids.length;i++)push([this.graph.nodes[ids[i-1]],this.graph.nodes[ids[i]]],kind[ids[i]]);push(endPoints,b.approachKind||'approach');
    const distance=dist[b.node]+this.length(endPoints);
    return {distance,minutes:Math.max(1,Math.ceil(distance/70)),segments,nodeIds:ids};
  }
  hit(view,x,y){if(view.z<2.2)return -1;let found=-1,best=18*18;this.targets.forEach((b,i)=>{if(i<this.buildings.length&&view.visibleBuildings&&!view.visibleBuildings.has(i))return;const dx=x-(view.ox+b.iconX*view.scale),dy=y-(view.oy+b.iconY*view.scale),d=dx*dx+dy*dy;if(d<best){best=d;found=i;}});return found;}
  fitResult(view){if(!this.result)return;const pts=this.result.segments.flatMap(s=>s.points);for(const i of [this.start,this.end])if(i>=0)pts.push([this.targets[i].iconX,this.targets[i].iconY]);const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]);const x1=Math.min(...xs),x2=Math.max(...xs),y1=Math.min(...ys),y2=Math.max(...ys);const z=Math.max(1,Math.min(9,Math.min(Math.max(80,view.w-144)/(x2-x1+30),Math.max(80,view.h-110)/(y2-y1+30))/view.base));view.focus((x1+x2)/2+32/(view.base*z),(y1+y2)/2,z);}
}
function drawRoute(c,model,v){
  if(model.result)for(const seg of model.result.segments){
    // Endpoint access estimates remain in distance calculation, but are not
    // displayed as purple auxiliary lines on the map.
    if(seg.kind==='approach')continue;
    const pts=seg.points;c.beginPath();
    pts.forEach((p,i)=>{const x=v.ox+p[0]*v.scale,y=v.oy+p[1]*v.scale;if(i)c.lineTo(x,y);else c.moveTo(x,y);});
    c.lineJoin='round';c.lineCap='round';c.setLineDash([]);c.lineWidth=8;c.strokeStyle='#fffdf4';c.stroke();
    c.lineWidth=4;const walk=seg.kind==='walk'||seg.kind==='steps';c.strokeStyle=walk?'#e87958':'#9171b2';c.setLineDash(walk?[]:[6,5]);c.stroke();
  }c.setLineDash([]);
  model.buildings.forEach((b,i)=>{const selected=i===model.start||i===model.end;if((v.z<2.2&&!selected)||(!selected&&v.visibleBuildings&&!v.visibleBuildings.has(i)))return;const point=model.markerPoint(i),x=v.ox+point[0]*v.scale,y=v.oy+point[1]*v.scale;if(x<-25||x>v.w+25||y<-25||y>v.h+25)return;
    const color=i===model.start?'#258b75':i===model.end?'#e87958':b.kind==='dorm'?'#9879ba':'#568eaa';
    c.beginPath();c.arc(x,y,selected?13:10,0,Math.PI*2);c.fillStyle=color;c.fill();c.strokeStyle='#fffef5';c.lineWidth=2;c.stroke();c.fillStyle='#ffffff';c.font='bold 11px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(i===model.start?'起':i===model.end?'终':b.kind==='dorm'?'宿':'教',x,y+.5);
  });
  for(const index of [model.start,model.end])if(index>=model.buildings.length){const point=model.markerPoint(index),x=v.ox+point[0]*v.scale,y=v.oy+point[1]*v.scale;if(x< -25||x>v.w+25||y< -25||y>v.h+25)continue;c.beginPath();c.arc(x,y,13,0,Math.PI*2);c.fillStyle=index===model.start?'#258b75':'#e87958';c.fill();c.strokeStyle='#fffef5';c.lineWidth=2;c.stroke();c.fillStyle='#ffffff';c.font='bold 11px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(index===model.start?'起':'终',x,y+.5);}
  const p=model.position;if(p){const x=v.ox+p.x*v.scale,y=v.oy+p.y*v.scale;if(x>=-100&&x<=v.w+100&&y>=-100&&y<=v.h+100){c.beginPath();c.arc(x,y,Math.max(9,Math.min(2000,p.accuracy*(model.data.metersToPageUnits||.725)*v.scale)),0,Math.PI*2);c.fillStyle=p.fresh?'#3988e326':'#7c879726';c.fill();c.beginPath();c.arc(x,y,8,0,Math.PI*2);c.fillStyle=p.fresh?'#3988e3':'#7c8797';c.fill();c.strokeStyle='#fff';c.lineWidth=3;c.stroke();}}
}
module.exports={RouteModel,drawRoute};
