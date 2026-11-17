const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();

function text(value,max){return String(value==null?'':value).trim().slice(0,max);}
const PRIVACY_VERSIONS=new Set(['2026-09-28','2026-10-04']);
function publicReview(row,openid){return {id:row._id,targetId:row.targetId,rating:row.rating,comment:row.comment,targetName:row.targetName,createdAt:row.createdAt,canDelete:!!openid&&row.authorOpenId===openid};}
exports.main=async event=>{
  const action=event&&event.action;
  const openid=cloud.getWXContext().OPENID||'';
  if(action==='list'){
    const targetId=text(event.targetId,160);
    if(!targetId)return {ok:false,error:'missing target'};
    const result=await db.collection('reviews').where({targetId}).orderBy('createdAt','desc').limit(20).get();
    return {ok:true,reviews:(result.data||[]).map(row=>publicReview(row,openid))};
  }
  if(action==='add'){
    if(!openid||!PRIVACY_VERSIONS.has(event.privacyVersion))return {ok:false,error:'privacy required'};
    const targetId=text(event.targetId,160),targetName=text(event.targetName,120),comment=text(event.comment,240),rating=Number(event.rating);
    if(!targetId||!targetName||!comment||!Number.isInteger(rating)||rating<1||rating>5)return {ok:false,error:'invalid review'};
    const id=text(event.clientReviewId,100);
    if(!/^review-[0-9]+-[a-f0-9]+$/.test(id))return {ok:false,error:'invalid review'};
    await db.collection('reviews').add({data:{_id:id,targetId,targetName,rating,comment,createdAt:db.serverDate(),authorOpenId:openid,privacyVersion:event.privacyVersion}});
    return {ok:true};
  }
  if(action==='mine'){
    if(!openid)return {ok:false,error:'identity unavailable'};
    const result=await db.collection('reviews').where({authorOpenId:openid}).orderBy('createdAt','desc').limit(100).get();
    return {ok:true,reviews:(result.data||[]).map(row=>publicReview(row,openid))};
  }
  if(action==='delete'){
    const id=text(event.id,160);
    if(!openid||!id)return {ok:false,error:'identity unavailable'};
    const result=await db.collection('reviews').where({_id:id,authorOpenId:openid}).remove();
    return result.stats&&result.stats.removed>0?{ok:true}:{ok:false,error:'not your review'};
  }
  return {ok:false,error:'unsupported action'};
};
