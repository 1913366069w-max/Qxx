const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const {Viewport,TouchGesture,prepare,draw,commands,layout,overlaps}=require('../shared/map-renderer.js');
const data=JSON.parse(fs.readFileSync(path.join(__dirname,'../assets/campus.json'),'utf8'));
const {RouteModel,drawRoute}=require('../shared/routing.js');
const {TouchInput}=require('../shared/touch-input.js');
test('pinch keeps its focal point and accepts arbitrary pointer IDs',()=>{const v=new Viewport();v.resize(400,700);v.focus(650,550,4);const g=new TouchGesture(v),before=v.point(180,350);g.update([{id:7,x:150,y:350},{id:19,x:210,y:350}]);g.update([{id:19,x:270,y:350},{id:7,x:90,y:350}]);assert.equal(v.z,12);assert.ok(Math.abs(v.point(180,350)[0]-before[0])<1e-8);assert.ok(Math.abs(v.point(180,350)[1]-before[1])<1e-8);g.update([{id:7,x:90,y:350}]);const x=v.cx;g.update([{id:7,x:100,y:350}]);assert.ok(Math.abs(v.cx-(x-10/v.scale))<1e-8);});
test('zoom and pan stay bounded across resize and focus',()=>{const v=new Viewport();v.resize(400,700);v.zoomAt(1000);assert.equal(v.z,64);v.pan(1e8,-1e8);assert.ok(v.cx>=0&&v.cy<=1048);v.resize(700,400);assert.equal(v.z,64);v.zoomAt(.00001);assert.equal(v.z,1);assert.equal(v.cx,640);v.focus(...data.textileCenter,5.2);assert.equal(v.z,5.2);assert.ok(v.cx>1000);v.fit();assert.equal(v.z,1);});
test('WeChat compact fallback renders actual paths and level-dependent textile labels',()=>{let fills=0;const texts=[];const methods=['setTransform','fillRect','save','restore','translate','scale','rotate','beginPath','moveTo','lineTo','closePath','stroke','strokeText','setLineDash','quadraticCurveTo','bezierCurveTo'];const ctx=Object.fromEntries(methods.map(m=>[m,()=>{}]));ctx.fill=()=>fills++;ctx.fillText=t=>texts.push(t);const mini=require('../wechat-miniprogram/data/campus.js');assert.ok(mini.shapes.every(shape=>!shape.triangles&&!shape.segments));const p=prepare(mini),v=new Viewport();v.resize(1280,1048);draw(ctx,p,v,2);assert.ok(fills>200);assert.ok(texts.includes('新纺织大楼'));assert.ok(!texts.includes('东院教学实验楼'));v.focus(...mini.textileCenter,5.2);draw(ctx,p,v,3);assert.ok(texts.includes('东院教学实验楼'));assert.equal(p.shapes.length,data.shapes.length);assert.throws(()=>commands('M NaN 3'));assert.throws(()=>commands('X 3 4'));});
test('client bundles retain geography with bounded subpixel path rounding and no duplicate caches',()=>{
 const web=JSON.parse(fs.readFileSync(path.join(__dirname,'../web-preview/public/campus.json'),'utf8'));
 const mini=structuredClone(require('../wechat-miniprogram/data/campus.js')),expected=structuredClone(data);
 assert.deepEqual(web,data);assert.equal(mini.shapes.length,expected.shapes.length);
 for(let i=0;i<expected.shapes.length;i++){
   const shape=expected.shapes[i],compact=mini.shapes[i];
   const parts=s=>s.match(/[A-Za-z]|-?\d+(?:\.\d+)?/g);
   const before=parts(shape.d),after=parts(compact.d);assert.equal(after.length,before.length);
   before.forEach((value,j)=>{if(/[A-Za-z]/.test(value))assert.equal(after[j],value);else assert.ok(Math.abs(Number(after[j])-Number(value))<=.005001,`${i}:${j}`);});
   delete shape.d;delete compact.d;
   for(const key of ['triangles','segments','linePoints'])delete shape[key];
 }
 for(const key of ['shops','accessPoints','wayfindingReference','screenshotReferences','commercialShopCorrections','commercialAreas','unlocatedShops','updated','projection','version','buildingCount'])delete expected[key];
 for(const target of expected.routing.buildings)for(const key of ['entranceSource','centerX','centerY','bounds','entranceStatus','entranceSide','zone'])delete target[key];
 for(const key of ['zones','obstacles','nodeZones','restrictedAreas','notice','gates','gateCorridors','westCampusZone','passagePairs'])delete expected.routing[key];
 for(const place of expected.life.places){delete place.sources;delete place.notice;}
 delete expected.life.entranceNotice;delete expected.life.updated;assert.deepEqual(mini,expected);
 const source=fs.readFileSync(path.join(__dirname,'../shared/map-renderer.js'),'utf8');
 assert.equal(fs.readFileSync(path.join(__dirname,'../wechat-miniprogram/utils/map-renderer.js'),'utf8'),source);
 assert.equal(fs.readFileSync(path.join(__dirname,'../web-preview/lib/map-renderer.mjs'),'utf8'),source.replace('module.exports={Viewport,TouchGesture,commands,prepare,draw,layout,overlaps};','export {Viewport,TouchGesture,commands,prepare,draw,layout,overlaps};'));
});
test('two building selections calculate a real cross-campus route through both passages',()=>{const r=new RouteModel(data),a=r.buildings.findIndex(b=>b.name==='浩园1号'),b=r.buildings.findIndex(b=>b.name==='新纺织大楼');assert.ok(a>=0&&b>=0);r.select(a);assert.equal(r.result,null);r.select(b);assert.ok(r.result&&r.result.distance>500);assert.equal(r.result.segments.filter(s=>s.kind==='underpass').length,2);assert.ok(r.result.nodeIds.length>10);assert.ok(r.result.segments.some(s=>s.kind==='reference'));assert.ok(!r.buildings.some(b=>/润园|沁园|家属楼/.test(b.name)));const v=new Viewport();v.resize(400,650);r.fitResult(v);assert.ok(v.z>=1&&v.z<=9);r.select(b);assert.equal(r.start,b);assert.equal(r.end,-1);assert.equal(r.result,null);r.clear();assert.equal(r.start,-1);});
test('route search chooses graph distance and never fabricates missing connections',()=>{const bs=[0,1,2,3].map((n)=>({id:String(n),name:String(n),x:n,y:0,iconX:n,iconY:0,node:n,component:n===3?1:0,approach:[[n,0],[n,0]]}));const g={metersToPageUnits:1,routing:{nodes:[[0,0],[1,0],[2,0],[3,0]],edges:[[0,2,20,'walk'],[0,1,1,'walk'],[1,2,1,'walk']],buildings:bs}};const r=new RouteModel(g);assert.equal(r.find(0,2).distance,2);assert.deepEqual(r.find(0,2).nodeIds,[0,1,2]);assert.equal(r.find(0,3),null);bs[3].node=-1;assert.equal(r.find(0,3),null);});
test('route icons can be selected at their displayed position and draw on Canvas2D',()=>{const r=new RouteModel(data),v=new Viewport();v.resize(1080,1400);const i=r.buildings.findIndex(b=>b.name==='新纺织大楼'),b=r.buildings[i];v.focus(b.iconX,b.iconY,7);assert.equal(r.hit(v,v.ox+b.iconX*v.scale,v.oy+b.iconY*v.scale),i);v.fit();assert.equal(r.hit(v,100,100),-1);r.select(i);let circles=0;const c={beginPath(){},arc(){circles++;},fill(){},stroke(){},fillText(){},setLineDash(){},moveTo(){},lineTo(){}};drawRoute(c,r,v);assert.equal(circles,1);});
test('routing implementation is identical in the browser and mini program',()=>{const source=fs.readFileSync(path.join(__dirname,'../shared/routing.js'),'utf8');assert.equal(fs.readFileSync(path.join(__dirname,'../wechat-miniprogram/utils/routing.js'),'utf8'),source);assert.equal(fs.readFileSync(path.join(__dirname,'../web-preview/lib/routing.mjs'),'utf8'),source.replace('module.exports={RouteModel,drawRoute};','export {RouteModel,drawRoute};'));});
test('endpoint auxiliary lines are hidden while real paths, stairs and passages remain visible',()=>{
 const r=new RouteModel(data),a=r.buildings.findIndex(b=>b.name==='浩园1号'),b=r.buildings.findIndex(b=>b.name==='新纺织大楼');r.select(a);r.select(b);
 const before=JSON.stringify(r.result);assert.ok(r.result.segments.some(s=>s.kind==='approach'));
 const starts=[],strokes=[];const c={beginPath(){this.isPin=false;},moveTo(x,y){starts.push([x,y]);},lineTo(){},setLineDash(v){this.dash=v;},stroke(){if(!this.isPin)strokes.push([this.strokeStyle,[...this.dash]]);},arc(){this.isPin=true;},fill(){},fillText(){}};
 const v={ox:0,oy:0,scale:1,z:3,w:1280,h:1048,visibleBuildings:new Set()};drawRoute(c,r,v);
 const visible=r.result.segments.filter(s=>s.kind!=='approach');assert.deepEqual(starts,visible.map(s=>s.points[0]));assert.equal(strokes.length,visible.length*2);
 visible.forEach((s,i)=>assert.deepEqual(strokes[i*2+1],s.kind==='walk'||s.kind==='steps'?['#e87958',[]]:['#9171b2',[6,5]]));
 assert.equal(JSON.stringify(r.result),before,'hiding helper lines must not alter path or distance');
});
const unproject=([x,y])=>{const r=6378137,k=Math.cos(36.0717*Math.PI/180)*.725,y0=r*Math.log(Math.tan(Math.PI/4+36.0773242*Math.PI/360));return [120.4082475+(x-60)/(r*k)*180/Math.PI,(2*Math.atan(Math.exp((y0-(y-55)/k)/r))-Math.PI/2)*180/Math.PI];};
test('fresh location routes from an exact road point and updates without losing destination',()=>{
 const r=new RouteModel(data),from=r.buildings.find(b=>b.name==='浩园1号'),to=r.buildings.findIndex(b=>b.name==='新纺织大楼'),now=100000;
 const xy=r.graph.nodes[from.node],ll=unproject(xy);assert.ok(Math.hypot(...RouteModel.project(...ll).map((v,i)=>v-xy[i]))<.00001);
 r.useLocation();r.setLocation(...ll,8,now,now);assert.ok(r.position.usable);r.select(to);assert.ok(r.result);assert.equal(r.result.segments.filter(s=>s.kind==='underpass').length,2);
 assert.ok(Math.hypot(r.result.segments[0].points[0][0]-xy[0],r.result.segments[0].points[0][1]-xy[1])<.00001);
 r.setLocation(...ll,6,now+2000,now+2000);assert.equal(r.end,to);assert.ok(r.result);r.clear();assert.ok(r.position);assert.equal(r.fromLocation,false);r.stopLocation();assert.equal(r.position,null);
});
test('poor, stale, denied and off-campus fixes cannot create a current-location route',()=>{
 const r=new RouteModel(data),from=r.buildings.find(b=>b.name==='浩园1号'),to=r.buildings.findIndex(b=>b.name==='新纺织大楼'),ll=unproject(r.graph.nodes[from.node]),now=100000;
 r.useLocation();r.select(to);assert.equal(r.result,null);r.setLocation(...ll,8,now,now);assert.ok(r.result);r.expireLocation(now+30001);assert.equal(r.result,null);assert.equal(r.position.fresh,false);
 r.setLocation(...ll,500,now,now);assert.equal(r.result,null);assert.match(r.message,/精度/);r.setLocation(116.4,39.9,5,now,now);assert.match(r.message,/范围外/);assert.equal(r.result,null);
 r.setLocation(...ll,8,now,now);assert.ok(r.result);r.locationError('未授权定位');assert.equal(r.result,null);r.setLocation(NaN,36,5,now,now);assert.match(r.message,/无效/);
});
test('position access cannot cross another footprint or a campus boundary',()=>{
 const r=new RouteModel({routing:{nodes:[],edges:[],buildings:[],zones:[[[[0,0],[100,0],[100,100],[0,100],[0,0]]]],obstacles:[[[[40,30],[60,30],[60,70],[40,70],[40,30]]]]}});
 assert.equal(r.clearApproach([10,50],[90,50],0),false);assert.equal(r.clearApproach([10,10],[90,10],0),true);assert.equal(r.clearApproach([50,50],[80,50],0),true);assert.equal(r.clearApproach([10,10],[120,10],0),false);
});
test('stairs have ordinary metric cost and multi-source routing chooses the shortest valid start',()=>{
 const r=new RouteModel({metersToPageUnits:1,routing:{nodes:[[0,0],[1,0],[2,0]],edges:[[0,2,9,'walk'],[0,1,1,'steps'],[1,2,1,'walk']],buildings:[{x:2,y:0,node:2,approach:[[2,0]]}]}});
 const b=r.buildings[0],result=r.search(b,[{node:0,cost:0,segments:[]},{node:1,cost:5,segments:[]}]);assert.equal(result.distance,2);assert.deepEqual(result.nodeIds,[0,1,2]);assert.ok(result.segments.some(s=>s.kind==='steps'));
});
test('embedded-browser Touch Events preserve pinch and never turn a drag or cancellation into a tap',()=>{
 const v=new Viewport();v.resize(390,650);v.focus(640,520,4);const g=new TouchGesture(v),taps=[],input=new TouchInput(g,p=>taps.push(p));
 const a={id:8,x:120,y:300},b={id:26,x:180,y:300};input.handle('touchstart',[a],[a],0);input.handle('touchstart',[a,b],[b],30);input.handle('touchmove',[{...a,x:90},{...b,x:210}],[],60);assert.equal(v.z,8);input.handle('touchend',[a],[b],90);input.handle('touchend',[],[a],110);assert.equal(taps.length,0);
 input.handle('touchstart',[a],[a],200);input.handle('touchend',[],[a],240);assert.equal(taps.length,1);input.handle('touchstart',[a],[a],300);input.handle('touchmove',[{...a,x:150}],[],320);input.handle('touchend',[],[{...a,x:150}],340);assert.equal(taps.length,1);input.handle('touchstart',[a],[a],400);input.handle('touchcancel',[],[a],420);assert.equal(taps.length,1);
});
test('phone portrait, landscape and narrow screens preserve map and route state',()=>{
 const r=new RouteModel(data),v=new Viewport();const a=r.buildings.findIndex(b=>b.name==='浩园1号'),b=r.buildings.findIndex(b=>b.name==='新纺织大楼');r.select(a);r.select(b);
 for(const [w,h] of [[320,430],[375,610],[390,660],[430,730],[760,205],[350,560]]){v.resize(w,h);r.fitResult(v);assert.ok(v.z>=1&&v.z<=9);assert.ok(Number.isFinite(v.scale));assert.equal(r.end,b);v.focus(r.buildings[b].iconX,r.buildings[b].iconY,7);assert.equal(r.hit(v,v.ox+r.buildings[b].iconX*v.scale,v.oy+r.buildings[b].iconY*v.scale),b);}
});
test('screen-space labels and selectable marker glyphs never overlap at phone sizes',()=>{
 const ctx={font:'',measureText(t){const n=Number(this.font.match(/([\d.]+)px/)[1]);return {width:[...t].reduce((s,c)=>s+(c.charCodeAt(0)>255?n:n*.6),0)};}};
 let scenes=0,labelCount=0;
 for(const [w,h] of [[320,490],[375,620],[430,730],[760,260]])for(const z of [1,2.2,4,8,14,32,64])for(const [x,y] of [[640,524],[775,575],[1000,850],[200,300]]){
   const v=new Viewport();v.resize(w,h);v.focus(x,y,z);v.exclusions=[[w-60,h-225,w-10,h-10]];
   const scene=layout(ctx,data,v);scenes++;labelCount+=scene.labels.length;
   const rects=[...scene.labels,...scene.markers].map(x=>x.rect);
   for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++)assert.ok(!overlaps(rects[i],rects[j]),`collision ${w} ${h} ${z}`);
   assert.ok(scene.labels.every(l=>l.fontSize>=9.5&&l.fontSize<=20));
 }
 assert.equal(scenes,112);assert.ok(labelCount>300,'must render useful labels, not hide everything');
});
test('every food marker resolves to current bundled details and independent commercial street keeps its own identity',()=>{
 const ids=new Set(data.life.places.map(p=>p.id));assert.ok(data.life.markers.every(m=>ids.has(m.placeId)));
 assert.equal(data.life.places.filter(p=>p.kind==='cafeteria').length,8);
 const dining=data.life.places.filter(p=>p.id.startsWith('food-'));
 assert.equal(dining.length,7);
 const xinyuan=dining.find(p=>p.name==='莘园餐厅'),legacy=dining.filter(p=>p!==xinyuan);
 const source=JSON.parse(fs.readFileSync(path.join(__dirname,'../research/xiaoshenghuo-xinyuan-2026-10-06.json'),'utf8'));
 assert.deepEqual(xinyuan.entries,source.entries);
 assert.deepEqual(xinyuan.entries.map(e=>e.title),['一楼','二楼','三楼']);
 assert.deepEqual(xinyuan.entries.map(e=>e.stalls.length),[14,14,1]);
 const stalls=xinyuan.entries.flatMap(e=>e.stalls),menu=stalls.flatMap(s=>s.dishes);
 assert.equal(stalls.length,29);assert.equal(menu.length,68);
 assert.ok(stalls.some(s=>s.name==='老蔡早点铺'&&s.dishes.some(d=>d.name==='酱肉包')));
 assert.ok(stalls.some(s=>s.name==='蹦蹦鸡'&&s.dishes.some(d=>d.name==='浓郁番茄蹦蹦鸡')));
 assert.ok([xinyuan,...xinyuan.entries,...stalls,...menu].every(item=>!('rating' in item)&&!('score' in item)));
 assert.deepEqual(Object.fromEntries(legacy.map(p=>[p.name,p.entries.flatMap(e=>e.dishes).length])),{'仁园餐厅':29,'浩园餐厅':14,'国际餐厅':5,'滢园餐厅':25,'泓园餐厅':12,'浏园餐厅':4});
 assert.ok(legacy.every(p=>p.notice.includes('每学期可能微调')));
 assert.ok(dining.every(p=>p.theme==='cream'));
 assert.ok(!data.life.places.some(p=>p.id==='food-laoma-halal'));
 assert.ok(legacy.flatMap(p=>p.entries).flatMap(e=>e.dishes).every(name=>!name.includes('档口')&&!name.includes('窗口')));
 assert.ok(stalls.every(stall=>!stall.name.includes('档口')&&!stall.name.includes('窗口')));
 assert.ok(data.life.places.find(p=>p.id==='screen-qingda-tea').notice.includes('暂未提供档口名单或菜单'));
 assert.ok(data.life.places.some(p=>p.id==='screen-hushangayi'));
 assert.equal(data.life.places.find(p=>p.id==='qingda-underpass').theme,'sky');
 assert.ok(!data.life.markers.some(m=>m.placeId==='qingda-food-lane'));assert.equal(data.life.southStreetOrder.length,9);
 assert.ok(!data.life.markers.some(m=>/^\d{2}\s/.test(m.label)||m.label==='快递驿站'));
 assert.deepEqual(data.life.news,[]);assert.equal(data.life.newsPolicy,undefined);
});
test('teaching aliases and purposes are searchable without becoming map labels',()=>{
 assert.equal(data.searchEntries.length,19);assert.equal(data.searchEntries.filter(e=>e.buildingId).length,16);
 assert.equal(data.searchEntries.find(e=>e.alias==='西1教').label,'博学楼 / 西1教（现代教育技术中心、公共教室）');
 const labels=new Set(data.labels.map(label=>label.text));assert.ok(!labels.has('西1教'));assert.ok(!labels.has('东12教'));
 assert.ok(data.searchEntries.every(entry=>!labels.has(entry.label)));
});
test('Liuyuan corrections and the confirmed three-gate corridor are bundled',()=>{
 const names=new Set(data.shops.map(shop=>shop.name));assert.ok(!names.has('北院便利店（艺靖然商店）'));assert.ok(names.has('浏园超市'));assert.ok(names.has('一支味'));assert.ok(names.has('再来吧水果店'));
 const liuyuan=['浏园超市','一支味','再来吧水果店'].map(name=>data.life.places.find(place=>place.name===name));assert.ok(liuyuan.every(Boolean));assert.ok(liuyuan[0].x<liuyuan[1].x&&liuyuan[1].x<liuyuan[2].x);
 assert.deepEqual(liuyuan.map(place=>place.id),['screen-liuyuan-market','screen-yizhiwei','screen-zailaiba-fruit']);
 const buildings=new Map(data.routing.buildings.map(building=>[building.name,building]));assert.ok(buildings.has('浏园C'));assert.ok(buildings.has('浏园D'));
 assert.deepEqual(data.routing.gateCorridors,[['西院4号门','东院3号门'],['东院3号门','北院2号门']]);
 const gates=new Map(data.routing.gates.map(gate=>[gate.name,gate.node]));for(const [left,right] of data.routing.gateCorridors)assert.ok(data.routing.edges.some(edge=>new Set([edge[0],edge[1]]).has(gates.get(left))&&new Set([edge[0],edge[1]]).has(gates.get(right))&&edge[3]==='walk'));
});
test('access labels stay beside their symbols and searchable access excludes the iron gate',()=>{
 const access=new Map(data.accessPoints.map(point=>[point.name,point])),labels=data.labels.filter(label=>label.category==='access_label');
 assert.equal(labels.length,21);assert.deepEqual(new Set(labels.map(label=>label.accessName)),new Set(access.keys()));
 assert.ok(labels.every(label=>Math.hypot(label.x-access.get(label.accessName).x,label.y-access.get(label.accessName).y)<25));
 const pois=new Set(data.pois.map(poi=>poi.name));for(const gate of data.accessPoints.filter(point=>point.kind==='gate'&&point.name!=='浩园对面铁门'))assert.ok(pois.has(gate.name));
 assert.ok(!pois.has('浩园对面铁门'));assert.ok(pois.has('麦岛站（B口）'));
 const roads=new Map(data.labels.filter(label=>label.category==='road_label').map(label=>[label.text,label]));assert.ok(roads.has('香港东路'));assert.ok(roads.get('香港东路').y>roads.get('青大路').y);
 const tea=data.life.places.find(place=>place.id==='screen-qingda-tea');assert.equal(tea.summary,'国际学术交流中心内');
});
test('all located directory entries have route targets, including gates, courier hall and cafeterias',()=>{
 const model=new RouteModel(data);
 for(const poi of data.pois.filter(poi=>Number.isFinite(poi.x)&&Number.isFinite(poi.y))){
   const index=model.targetIndex(poi.buildingId||poi.routeTargetId);
   assert.ok(index>=0,poi.name);
 }
 const courier=model.targets.findIndex(target=>target.name==='西院浩园快递服务大厅');
 const future=model.targets.findIndex(target=>target.name==='未来研究院');
 const westGate=model.targets.findIndex(target=>target.name==='西院4号门');
 const eastGate=model.targets.findIndex(target=>target.name==='东院3号门');
 assert.ok(model.find(courier,future)?.distance>500);
 assert.ok(model.find(westGate,eastGate)?.distance>0);
 model.select(courier);model.select(future);
 assert.match(model.message,/快递服务大厅.*未来研究院/);
 assert.equal(model.targets[future].entranceStatus,'user-screenshot');
 assert.equal(data.routing.buildings.some(target=>target.name==='科技园D座'),false);
});
