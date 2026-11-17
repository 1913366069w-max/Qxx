const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {RouteModel}=require('../shared/routing.js');
const data=require('../assets/campus.json');
const mini=require('../wechat-miniprogram/data/campus.js');
const model=new RouteModel(data);
const index=name=>model.targets.findIndex(target=>target.name===name);
test('Hongyuan to Boyuan takes the shorter east-3/west-4 corridor',()=>{
 const result=model.find(index('泓园9号'),index('博远楼'));
 assert.ok(result.distance>250&&result.distance<360);
 assert.ok(!result.segments.some(s=>s.kind==='underpass'));
 for(const name of ['东院3号门','西院4号门'])assert.ok(result.nodeIds.includes(model.targets[index(name)].node));
 assert.ok(Math.abs(result.distance-model.find(index('博远楼'),index('泓园9号')).distance)<.01);
});
test('Haoyuan, Derun and Future Institute door have direct verified links',()=>{
 for(const [a,b,max] of [['浩园1教','宁德路地下通道·浩园侧',85],['德润楼','北院3号门',130],['未来研究院','新纺织大楼',140]]){
  const result=model.find(index(a),index(b));assert.ok(result&&result.distance<max,a);
 }
 const future=model.targets[index('未来研究院')];assert.ok(model.length(future.approach)<.02);
});
test('disconnected destinations finish on an existing road without drawing a false connector',()=>{
 for(const [a,b] of [['博学楼','麦当劳'],['创客大街A座','滢园1号'],['麦岛站（B口）','泓园9号']]){
  model.clear();model.select(index(a));model.select(index(b));
  assert.ok(model.result?.roadFallback,a+' '+b);
  assert.doesNotMatch(model.message,/未连通|未接入|请换|现场确认/);
  assert.ok(model.result.distance>=0);
  for(const key of ['startPoint','endPoint']){
   const target=model.targets[key==='startPoint'?model.start:model.end];
   if(target.node>=0&&target.component===0)continue;
   const point=model.result[key];
   assert.ok(data.routing.edges.some(e=>{const a=data.routing.nodes[e[0]],b=data.routing.nodes[e[1]];return Math.abs(Math.hypot(point[0]-a[0],point[1]-a[1])+Math.hypot(point[0]-b[0],point[1]-b[1])-Math.hypot(b[0]-a[0],b[1]-a[1]))<.001;}));
  }
 }
});
test('active UI is offline and contact-only, with no ratings or document viewers',()=>{
 const js=fs.readFileSync('wechat-miniprogram/pages/map/map.js','utf8');
 const wxml=fs.readFileSync('wechat-miniprogram/pages/map/map.wxml','utf8');
 assert.doesNotMatch(js,/cloudApi|privacy|reviews|sources/);
 assert.doesNotMatch(wxml,/privacy-dialog|review|资料说明|sources/);
 assert.doesNotMatch(wxml,/networkText|设备网络正常|地点寻路/);
 assert.match(wxml,/联系方式：QXXqdu（微信号）/);
 assert.match(wxml,/（小程序内测中，有任何意见定会积极采纳）/);
 assert.ok(!require('../wechat-miniprogram/app.json').pages.includes('pages/privacy/privacy'));
 for(const name of ['shops','wayfindingReference','screenshotReferences','commercialShopCorrections'])assert.equal(mini[name],undefined);
 assert.ok(mini.life.places.every(p=>!p.sources&&!p.notice));
});
