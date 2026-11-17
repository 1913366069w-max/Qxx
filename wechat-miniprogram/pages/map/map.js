const data=require('../../data/campus.js');
const studyMap=require('../../utils/study-map.js');
const {Viewport,TouchGesture,prepare,draw}=require('../../utils/map-renderer.js');
const {RouteModel,drawRoute}=require('../../utils/routing.js');
const indexedNames=new Set((data.searchEntries||[]).map(entry=>entry.name));
const directoryItems=[...(data.searchEntries||[]).map(entry=>({...entry,kind:'search'})),...data.pois.filter(place=>!indexedNames.has((place.name||'').replace(/\n/g,'')))];
const FOOD_TABS=[{id:'cafeteria',name:'餐厅'},{id:'shop',name:'商铺 / 校外'},{id:'passage',name:'地下通道'}];
const foodTabIds=new Set(FOOD_TABS.map(tab=>tab.id));
function foodPlacesOf(places,tab){return (places||[]).filter(place=>foodTabIds.has(place.kind)&&place.kind===tab);}
let searchIndex=null;
const foodCache=new Map();
function foodItems(tab){if(!foodCache.has(tab))foodCache.set(tab,foodPlacesOf(data.life.places,tab));return foodCache.get(tab);}
function touchPoint(t){
  const x=Number.isFinite(t.x)?t.x:Number.isFinite(t.clientX)?t.clientX:t.pageX;
  const y=Number.isFinite(t.y)?t.y:Number.isFinite(t.clientY)?t.clientY:t.pageY;
  return {id:t.identifier==null?0:t.identifier,x,y};
}
Page({
  data:{showSearch:false,searchQuery:'',searchResults:[],zoom:'1.0',error:'',showInfo:false,showFood:false,activePlace:null,foodTab:'cafeteria',foodTabs:FOOD_TABS,foodPlaces:[],expandedStallEntry:-1,expandedStallIndex:-1,routeText:'',hasStart:false},
  onReady(){this.view=new Viewport(data.width,data.height);this.gesture=new TouchGesture(this.view);this.routeModel=new RouteModel(data);this.prepared=prepare(data);this.refreshTodayBuildings();this.attach();},
  attach(){if(this.destroyed||this.pageVisible===false||this.data.showFood||this.data.showInfo||this.data.showSearch)return;const revision=this.attachRevision=(this.attachRevision||0)+1;this.createSelectorQuery().select('.map-frame').boundingClientRect().select('#mapCanvas').fields({node:true,size:true,rect:true}).exec(res=>{
    if(this.destroyed||this.pageVisible===false||revision!==this.attachRevision)return;
    const frame=res[0]||{},info=res[1]||{};
    if(!info.node){this.setData({error:'当前微信版本不支持Canvas 2D，请升级微信后重试。'});return;}
    const node=info.node,width=Math.max(1,Math.round(info.width||frame.width||0)),height=Math.max(1,Math.round(info.height||frame.height||0));
    if(width<=1||height<=1)return;
    const ratio=Number((wx.getWindowInfo?wx.getWindowInfo():wx.getSystemInfoSync()).pixelRatio)||1;
    const dpr=Math.min(Math.max(1,ratio),3,Math.sqrt(2400000/(width*height)));
    if(this.canvas===node&&this.view.w===width&&this.view.h===height&&this.dpr===dpr){this.schedule();return;}
    this.cancelFrame();this.canvas=node;this.ctx=node.getContext('2d');this.dpr=dpr;
    node.width=Math.max(1,Math.round(width*dpr));node.height=Math.max(1,Math.round(height*dpr));this.view.resize(width,height);this.schedule();
  });},
  onResize(){if(this.view)this.attach();},
  onShow(){this.pageVisible=true;if(this.routeModel)this.refreshTodayBuildings();this.scheduleMidnightRefresh();if(this.view)this.attach();},
  onHide(){this.pageVisible=false;this.attachRevision=(this.attachRevision||0)+1;this.cancelFrame();clearTimeout(this.midnightTimer);this.cancel();},
  onUnload(){this.destroyed=true;this.onHide();this.canvas=null;this.ctx=null;this.prepared=null;this.routeModel=null;},
  cancelFrame(){if(this.frame!=null&&this.canvas){this.canvas.cancelAnimationFrame(this.frame);this.frame=null;}},
  refreshTodayBuildings(){
    let indices=[];
    try{
      const role=wx.getStorageSync(studyMap.ACTIVE_ROLE_KEY);
      if(role==='undergraduate'||role==='graduate')indices=studyMap.todayBuildingIndices(wx.getStorageSync(studyMap.STORAGE_PREFIX+role),data.searchEntries,this.routeModel.buildings);
    }catch(_){}
    this.todayBuildingIndices=indices;this.schedule();
  },
  scheduleMidnightRefresh(){
    clearTimeout(this.midnightTimer);
    if(this.destroyed||this.pageVisible===false)return;
    const now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1);
    this.midnightTimer=setTimeout(()=>{if(this.routeModel)this.refreshTodayBuildings();this.scheduleMidnightRefresh();},Math.max(1000,next.getTime()-now.getTime()));
  },
  schedule(){
    if(this.destroyed||this.pageVisible===false||!this.canvas||this.frame!=null||this.data.showFood||this.data.showInfo||this.data.showSearch)return;
    this.frame=this.canvas.requestAnimationFrame(()=>{
      this.frame=null;if(this.destroyed||this.pageVisible===false||this.data.showFood||this.data.showInfo||this.data.showSearch)return;
      try{draw(this.ctx,this.prepared,this.view,this.dpr,{start:this.routeModel.start,end:this.routeModel.end});drawRoute(this.ctx,this.routeModel,this.view);studyMap.drawTodayGlow(this.ctx,this.view,this.routeModel.buildings,this.todayBuildingIndices);}
      catch(_){if(!this.data.error)this.setData({error:'地图绘制失败，请退出页面后重试。'});return;}
      const patch={},zoom=this.view.z.toFixed(1),routeText=this.routeModel.message,hasStart=this.routeModel.start>=0;
      if(zoom!==this.data.zoom)patch.zoom=zoom;if(routeText!==this.data.routeText)patch.routeText=routeText;if(hasStart!==this.data.hasStart)patch.hasStart=hasStart;
      if(this.data.error)patch.error='';
      if(Object.keys(patch).length)this.setData(patch,()=>{if('routeText' in patch||'hasStart' in patch)this.attach();});
    });
  },
  touch(e){if(!this.gesture)return;const ts=(e.touches||[]).map(touchPoint);
    if(e.type==='touchstart'){if(ts.length===1)this.tapStart={x:ts[0].x,y:ts[0].y,time:Date.now(),cancelled:false};else if(this.tapStart)this.tapStart.cancelled=true;}
    if(e.type==='touchmove'&&this.tapStart&&(ts.length!==1||Math.hypot(ts[0].x-this.tapStart.x,ts[0].y-this.tapStart.y)>8))this.tapStart.cancelled=true;
    if(e.type==='touchend'&&ts.length===0){const changed=(e.changedTouches||[]).map(touchPoint),p=changed[0],t=this.tapStart;if(p&&t&&!t.cancelled&&Date.now()-t.time<400){const i=this.routeModel.hit(this.view,p.x,p.y);if(i>=0){this.routeModel.select(i);this.routeModel.fitResult(this.view);}}this.tapStart=null;}
    this.gesture.update(ts);this.schedule();},
  cancel(){this.tapStart=null;if(this.gesture)this.gesture.reset();},
  clearRoute(){if(this.routeModel){this.routeModel.clear();this.schedule();}},
  zoomIn(){if(this.view){this.view.zoomAt(1.65);this.schedule();}},
  zoomOut(){if(this.view){this.view.zoomAt(1/1.65);this.schedule();}},
  fit(){if(this.view){this.view.fit();this.schedule();}},
  searchMatches(query){
    const term=String(query||'').trim().toLowerCase();
    if(!searchIndex)searchIndex=directoryItems.map((item,index)=>({index,label:item.label||item.name,haystack:[item.name,item.label,item.alias,item.purpose,item.location].filter(Boolean).join(' ').toLowerCase()}));
    const matches=[];for(const item of searchIndex)if(!term||item.haystack.includes(term)){matches.push({index:item.index,label:item.label});if(matches.length===80)break;}return matches;
  },
  openSearch(){this.cancelFrame();this.cancel();this.setData({showSearch:true,searchQuery:'',searchResults:this.searchMatches('')});},
  closeSearch(){this.setData({showSearch:false,searchQuery:'',searchResults:[]},()=>this.attach());},
  setSearchQuery(e){const query=String(e.detail.value||'');this.setData({searchQuery:query,searchResults:this.searchMatches(query)});},
  chooseSearchResult(e){this.closeSearch();this.choosePlace({detail:{value:e.currentTarget.dataset.index}});},
  choosePlace(e){
    const p=directoryItems[Number(e.detail.value)];if(!p||!this.view)return;
    if(p.kind==='unlocated'){wx.showModal({title:p.name,content:p.note,showCancel:false});return;}
    const index=p.buildingId?this.routeModel.targetIndex(p.buildingId):p.routeTargetId?this.routeModel.targetIndex(p.routeTargetId):-1;
    if(index<0){
      if(p.kind==='search'){wx.showModal({title:p.name,content:`${p.alias}（${p.purpose}）\n该资料仅供搜索，地图上暂无可靠位置。`,showCancel:false});return;}
      this.view.focus(p.x,p.y,p.zoom||7);this.schedule();return;
    }
    const target=this.routeModel.targets[index];this.view.focus(target.iconX,target.iconY,p.zoom||7);
    this.routeModel.select(index);if(this.routeModel.result)this.routeModel.fitResult(this.view);
    this.schedule();
  },
  foodRows(tab){return foodItems(tab).map(({id,name})=>({id,name}));},
  setFoodTab(e){const tab=String(e.currentTarget.dataset.tab||'');if(!foodTabIds.has(tab)||tab===this.data.foodTab)return;this.setData({foodTab:tab,activePlace:null,foodPlaces:this.foodRows(tab),expandedStallEntry:-1,expandedStallIndex:-1});},
  openFood(){this.cancelFrame();this.cancel();this.setData({showFood:true,activePlace:null,foodPlaces:this.foodRows(this.data.foodTab),expandedStallEntry:-1,expandedStallIndex:-1});},
  closeFood(){this.setData({showFood:false,activePlace:null,foodPlaces:[],expandedStallEntry:-1,expandedStallIndex:-1},()=>this.attach());},
  openMiniPlace(e){const item=foodItems(this.data.foodTab)[Number(e.currentTarget.dataset.index)];if(item)this.setData({activePlace:item,expandedStallEntry:-1,expandedStallIndex:-1});},
  backFood(){this.setData({activePlace:null,expandedStallEntry:-1,expandedStallIndex:-1});},
  toggleFoodStall(e){
    const entryIndex=Number(e.currentTarget.dataset.entry),stallIndex=Number(e.currentTarget.dataset.stall);
    const place=this.data.activePlace,entry=place&&place.entries&&place.entries[entryIndex];
    if(!entry||!entry.stalls||!entry.stalls[stallIndex])return;
    const closing=this.data.expandedStallEntry===entryIndex&&this.data.expandedStallIndex===stallIndex;
    this.setData({expandedStallEntry:closing?-1:entryIndex,expandedStallIndex:closing?-1:stallIndex});
  },
  openStudy(){wx.navigateTo({url:'/pages/study/study'});},
  info(){this.cancelFrame();this.cancel();this.setData({showInfo:true});},closeInfo(){this.setData({showInfo:false},()=>this.attach());},
  onShareAppMessage(){return {title:'青小寻 · 浮山校区',path:'/pages/map/map'};},
  onShareTimeline(){return {title:'青小寻 · 浮山校区'};}
});
