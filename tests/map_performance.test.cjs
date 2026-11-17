const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {createRequire}=require('node:module');
const {prepare,layout,Viewport}=require('../shared/map-renderer.js');
const {RouteModel}=require('../shared/routing.js');
const mini=require('../wechat-miniprogram/data/campus.js');
const full=require('../assets/campus.json');

test('geometry preparation is reused per dataset and drawing backend',()=>{
 const a=prepare(mini);assert.equal(prepare(mini),a);
 class Path {constructor(d){this.d=d;}}
 const b=prepare(mini,Path);assert.equal(prepare(mini,Path),b);assert.notEqual(a,b);
 assert.ok(b.shapes.every(s=>s.path instanceof Path));
 assert.notEqual(prepare(structuredClone(mini)),a);
});

test('panning reuses text measurements without changing label layout',()=>{
 let calls=0;const ctx={measureText(text){calls++;return {width:text.length*12};}};
 const v=new Viewport();v.resize(390,660);v.focus(775,575,4);
 const a=layout(ctx,mini,v),before=calls;assert.ok(before>0);
 assert.deepEqual(layout(ctx,mini,v),a);assert.equal(calls,before);
 v.pan(5,3);layout(ctx,mini,v);assert.equal(calls,before);
});

test('heap routing matches an independent shortest-path calculation',()=>{
 let random=42;const next=()=>((random=(Math.imul(random,1664525)+1013904223)>>>0)/2**32);
 for(let run=0;run<15;run++){
  const nodes=Array.from({length:25},(_,i)=>[i,0]),edges=[];
  for(let a=0;a<nodes.length;a++)for(let b=a+1;b<nodes.length;b++)if(next()<.12)edges.push([a,b,Math.floor(next()*20),'walk']);
  const buildings=nodes.map(([x,y],node)=>({id:String(node),name:String(node),x,y,node,component:0,approach:[[x,y]]}));
  const r=new RouteModel({metersToPageUnits:1,routing:{nodes,edges,buildings}});
  const seeds=[{node:0,cost:2,segments:[]},{node:6,cost:1,segments:[]},{node:0,cost:20,segments:[]}];
  const distances=nodes.map(()=>Infinity);distances[0]=2;distances[6]=1;
  for(let i=1;i<nodes.length;i++)for(const [a,b,w] of edges){distances[a]=Math.min(distances[a],distances[b]+w);distances[b]=Math.min(distances[b],distances[a]+w);}
  for(let i=0;i<nodes.length;i++){const route=r.search(buildings[i],seeds);if(Number.isFinite(distances[i]))assert.equal(route?.distance,distances[i]);else assert.equal(route,null);}
 }
});

test('compacted client data preserves every destination route and road fallback',()=>{
 const a=new RouteModel(full),b=new RouteModel(mini);
 assert.deepEqual(a.targets.map(t=>t.id),b.targets.map(t=>t.id));
 const start=a.targets.findIndex(t=>t.name==='博远楼');
 for(let end=0;end<a.targets.length;end++){
  assert.deepEqual(b.find(start,end),a.find(start,end));
  if(!a.find(start,end))assert.deepEqual(b.findNearestRoad(start,end),a.findNearestRoad(start,end));
 }
});

function pageHarness(){
 let config,sequence=0;const callbacks=[],frames=new Map(),timers=new Map(),patches=[];
 const noop=()=>{},ctx=new Proxy({measureText(t){return {width:t.length*12};}},{get:(t,k)=>k in t?t[k]:noop});
 const canvas={getContext:()=>ctx,requestAnimationFrame(fn){const id=++sequence;frames.set(id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
 const source=path.resolve(__dirname,'../wechat-miniprogram/pages/map/map.js');
 vm.runInNewContext(fs.readFileSync(source,'utf8'),{require:createRequire(source),Page:p=>config=p,wx:{getStorageSync:()=>'',getWindowInfo:()=>({pixelRatio:4})},setTimeout(fn){const id=++sequence;timers.set(id,fn);return id;},clearTimeout(id){timers.delete(id);}});
 const page={...config,data:structuredClone(config.data),setData(p,cb){patches.push(p);Object.assign(this.data,p);cb?.();},createSelectorQuery(){return {select(){return this;},boundingClientRect(){return this;},fields(){return this;},exec(fn){callbacks.push(fn);}};}};
 const attach=()=>{const fn=callbacks.shift();assert.ok(fn);fn([{width:390,height:660},{node:canvas,width:390,height:660}]);};
 const frame=()=>{const item=frames.entries().next().value;assert.ok(item);frames.delete(item[0]);item[1]();};
 return {page,canvas,callbacks,frames,timers,patches,attach,frame};
}

test('map coalesces frames and stops work while hidden or covered',()=>{
 const h=pageHarness(),p=h.page;p.onShow();p.onReady();h.attach();
 assert.ok(h.canvas.width*h.canvas.height<=2404000);assert.equal(p.dpr,3);
 for(let i=0;i<20;i++)p.schedule();assert.equal(h.frames.size,1);h.frame();
 assert.equal(h.frames.size,0);p.schedule();h.frame();assert.equal(h.patches.length,0,'unchanged frame must not cross setData bridge');
 p.info();p.schedule();assert.equal(h.frames.size,0);
 p.closeInfo();h.attach();assert.equal(h.frames.size,1);
 p.onHide();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);p.schedule();assert.equal(h.frames.size,0);
 p.onShow();h.attach();assert.equal(h.frames.size,1);
 p.onUnload();assert.equal(h.frames.size,0);assert.equal(h.timers.size,0);assert.equal(p.canvas,null);
});

test('late canvas callbacks cannot revive an unloaded page',()=>{
 const h=pageHarness(),p=h.page;p.onReady();p.onUnload();h.attach();assert.equal(p.canvas,null);assert.equal(h.frames.size,0);
});

test('food details are loaded only when opened and search remains available',()=>{
 const h=pageHarness(),p=h.page;assert.equal(p.data.foodPlaces.length,0);
 assert.equal(p.data.names,undefined);assert.equal(p.data.networkText,undefined);
 p.openFood();assert.ok(p.data.foodPlaces.length>0);
 for(const row of p.data.foodPlaces)assert.deepEqual(Object.keys(row).sort(),['id','name']);
 p.openMiniPlace({currentTarget:{dataset:{index:0}}});assert.ok(p.data.activePlace.entries.length>0);
 p.closeFood();assert.equal(p.data.foodPlaces.length,0);assert.equal(p.data.activePlace,null);
 assert.ok(p.searchMatches('西1教').some(result=>result.label.includes('博学楼')));
 assert.ok(p.searchMatches('泓园9号').length>0);
});

test('Xinyuan stalls reveal only the selected menu and reset on return',()=>{
 const p=pageHarness().page;
 p.openFood();
 const index=p.foodRows('cafeteria').findIndex(row=>row.name==='莘园餐厅');
 assert.ok(index>=0);
 p.openMiniPlace({currentTarget:{dataset:{index}}});
 assert.equal(p.data.activePlace.entries[0].stalls[0].name,'老蔡早点铺');
 assert.equal(p.data.expandedStallEntry,-1);
 p.toggleFoodStall({currentTarget:{dataset:{entry:0,stall:0}}});
 assert.deepEqual([p.data.expandedStallEntry,p.data.expandedStallIndex],[0,0]);
 p.toggleFoodStall({currentTarget:{dataset:{entry:0,stall:1}}});
 assert.deepEqual([p.data.expandedStallEntry,p.data.expandedStallIndex],[0,1]);
 p.toggleFoodStall({currentTarget:{dataset:{entry:0,stall:1}}});
 assert.deepEqual([p.data.expandedStallEntry,p.data.expandedStallIndex],[-1,-1]);
 p.backFood();assert.equal(p.data.activePlace,null);
 assert.deepEqual([p.data.expandedStallEntry,p.data.expandedStallIndex],[-1,-1]);
});
