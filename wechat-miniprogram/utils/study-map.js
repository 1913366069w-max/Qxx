'use strict';

const timetable=require('./timetable.js');
const STORAGE_PREFIX='qingxiaoxun_study_v1_';
const ACTIVE_ROLE_KEY='qingxiaoxun_study_active_role';

function localDate(date=new Date()){
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function normalize(value){return String(value||'').replace(/[\s\u3000·（）()【】\[\],，.。-]/g,'').replace(/^青岛大学(?:浮山校区)?/,'');}
function matches(place,name){
  const text=normalize(place),alias=normalize(name);
  if(!alias||!text.includes(alias))return false;
  const index=text.indexOf(alias),after=text.slice(index+alias.length);
  return !(/\d$/.test(alias)&&/^\d/.test(after));
}
function resolveBuilding(place,entries,buildings){
  if(!place)return -1;
  const candidates=[];
  for(const entry of entries||[]){
    if(!entry.buildingId)continue;
    for(const alias of [entry.name,entry.alias])if(alias&&matches(place,alias))candidates.push({id:entry.buildingId,length:normalize(alias).length});
  }
  const counts=new Map();for(const building of buildings||[])counts.set(building.name,(counts.get(building.name)||0)+1);
  for(const building of buildings||[])if(building.kind==='teaching'&&counts.get(building.name)===1&&matches(place,building.name))candidates.push({id:building.id,length:normalize(building.name).length});
  if(!candidates.length)return -1;
  candidates.sort((a,b)=>b.length-a.length);
  const longest=candidates[0].length;
  if(new Set(candidates.filter(item=>item.length===longest).map(item=>item.id)).size!==1)return -1;
  return (buildings||[]).findIndex(building=>String(building.id)===String(candidates[0].id));
}
function todayBuildingIndices(state,entries,buildings,date=localDate()){
  if(!state||!state.termStart||!Array.isArray(state.courses))return [];
  const week=timetable.weekNumber(state.termStart,date);
  if(week<1||week>timetable.MAX_WEEKS)return [];
  const day=new Date(`${date}T00:00:00Z`).getUTCDay()||7;
  if(!day)return [];
  const indices=new Set();
  for(const raw of state.courses){
    let item;try{item=timetable.course(raw);}catch(_){continue;}
    if(item.day!==day||!item.weeks.includes(week))continue;
    const index=resolveBuilding(item.place,entries,buildings);
    if(index>=0)indices.add(index);
  }
  return [...indices];
}
function drawTodayGlow(ctx,view,buildings,indices){
  for(const index of indices||[]){
    const building=buildings[index];if(!building)continue;
    const x=view.ox+building.iconX*view.scale,y=view.oy+building.iconY*view.scale;
    if(x< -30||x>view.w+30||y< -30||y>view.h+30)continue;
    for(const [radius,color] of [[23,'rgba(166,255,43,0.16)'],[16,'rgba(163,255,46,0.3)'],[10,'rgba(194,255,77,0.92)']]){
      ctx.beginPath();ctx.arc(x,y,radius,0,Math.PI*2);ctx.fillStyle=color;ctx.fill();
    }
    ctx.beginPath();ctx.arc(x,y,10,0,Math.PI*2);ctx.strokeStyle='#294f12';ctx.lineWidth=2;ctx.stroke();
    ctx.beginPath();ctx.arc(x,y,3,0,Math.PI*2);ctx.fillStyle='#ffffff';ctx.fill();
  }
}
module.exports={STORAGE_PREFIX,ACTIVE_ROLE_KEY,localDate,resolveBuilding,todayBuildingIndices,drawTodayGlow};
