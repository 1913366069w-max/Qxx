'use strict';
const config=require('../config.js');
const privacy=require('./privacy.js');
const STORAGE_PREFIX='qingxiaoxun_reviews_';

function timed(promise,milliseconds){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(new Error('timeout')),milliseconds);
    promise.then(value=>{clearTimeout(timer);resolve(value);},error=>{clearTimeout(timer);reject(error);});
  });
}
function cloud(name,data){
  if(!privacy.hasConsent())return Promise.reject(new Error('privacy required'));
  return timed(new Promise((resolve,reject)=>{
    if(!wx.cloud||!wx.cloud.callFunction){reject(new Error('cloud unavailable'));return;}
    try{
      const options={traceUser:false};if(config.cloudEnv)options.env=config.cloudEnv;
      wx.cloud.init(options);
      wx.cloud.callFunction({name,data,success:res=>{
        const result=res&&res.result;
        if(result&&result.ok!==false)resolve(result);
        else{const error=new Error(result&&result.error||'cloud failed');error.code=result&&result.error;reject(error);}
      },fail:reject});
    }catch(error){reject(error);}
  }),6000);
}
function cachedReviews(targetId){
  try{const rows=wx.getStorageSync(STORAGE_PREFIX+targetId);return Array.isArray(rows)?rows:[];}catch(_){return [];}
}
function saveLocalReview(payload){
  const review={id:payload.clientReviewId,rating:payload.rating,comment:payload.comment,targetName:payload.targetName,targetId:payload.targetId,created_at:new Date().toISOString(),local:true,canDelete:true};
  wx.setStorageSync(STORAGE_PREFIX+payload.targetId,[review,...cachedReviews(payload.targetId)].slice(0,20));
  return review;
}
function getContent(){
  if(!privacy.hasConsent())return Promise.reject(new Error('offline content'));
  return privacy.ensureConsent().then(()=>cloud('content',{action:'get'})).then(result=>result&&result.life?result:Promise.reject(new Error('content empty')));
}
function listReviews(targetId){
  if(!privacy.hasConsent())return Promise.resolve(cachedReviews(targetId));
  return privacy.ensureConsent().then(()=>cloud('reviews',{action:'list',targetId})).then(result=>{
    if(!privacy.hasConsent())return cachedReviews(targetId);
    const remote=result.reviews||[],ids=new Set(remote.map(row=>row.id));
    const local=cachedReviews(targetId).filter(row=>!ids.has(row.id));
    wx.setStorageSync(STORAGE_PREFIX+targetId,local);
    return [...local,...remote];
  }).catch(()=>cachedReviews(targetId));
}
function addReview(payload){
  const prepared={...payload,privacyVersion:privacy.policy.version,clientReviewId:'review-'+Date.now()+'-'+Math.random().toString(16).slice(2)};
  return privacy.ensureConsent().then(()=>cloud('reviews',{action:'add',...prepared}).catch(error=>{
    if(!privacy.hasConsent()||error.code==='privacy required'||error.code==='invalid review')throw error;
    const review=saveLocalReview(prepared);return {ok:true,local:true,review};
  }));
}
function deleteReview(targetId,review){
  if(review.local){wx.setStorageSync(STORAGE_PREFIX+targetId,cachedReviews(targetId).filter(row=>row.id!==review.id));return Promise.resolve({ok:true});}
  return privacy.ensureConsent().then(()=>cloud('reviews',{action:'delete',id:review.id}));
}
function listMyReviews(){return privacy.ensureConsent().then(()=>cloud('reviews',{action:'mine'})).then(result=>{if(!privacy.hasConsent())throw new Error('privacy revoked');return result.reviews||[];});}
function clearLocalReviews(){
  const keys=(wx.getStorageInfoSync().keys||[]).filter(key=>key.startsWith(STORAGE_PREFIX));
  keys.forEach(key=>wx.removeStorageSync(key));return keys.length;
}
module.exports={getContent,listReviews,addReview,cachedReviews,deleteReview,listMyReviews,clearLocalReviews};
