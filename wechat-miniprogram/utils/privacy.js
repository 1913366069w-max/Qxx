'use strict';
const policy=require('./privacy-policy.js');
const KEY='qingxiaoxun_privacy_consent';
let initialized=false;
let waiting=[];
let platformResolvers=[];
let subscribers=[];
let visible=false;
let contractName=policy.name;
function failure(code,message){const error=new Error(message);error.code=code;return error;}
function hasConsent(){try{return (wx.getStorageSync(KEY)||{}).version===policy.version;}catch(_){return false;}}
function notify(){const listener=subscribers[subscribers.length-1];if(listener)listener({visible,name:contractName});}
function init(){
  if(initialized)return;
  initialized=true;
  if(wx.onNeedPrivacyAuthorization)wx.onNeedPrivacyAuthorization(resolve=>{platformResolvers.push(resolve);visible=true;notify();});
}
function subscribe(listener){init();subscribers.push(listener);notify();return ()=>{subscribers=subscribers.filter(item=>item!==listener);notify();};}
function setting(){
  return new Promise((resolve,reject)=>{
    if(!wx.getPrivacySetting){reject(failure('PRIVACY_UNSUPPORTED','请更新微信后使用联网评论。'));return;}
    wx.getPrivacySetting({success:resolve,fail:()=>reject(failure('PRIVACY_UNAVAILABLE','暂时无法读取微信隐私设置，请稍后重试。'))});
  });
}
function ensureConsent(){
  init();
  return setting().then(result=>{
    if(hasConsent()&&!result.needAuthorization)return;
    contractName=result.privacyContractName||policy.name;
    if(!subscribers.length)throw failure('PRIVACY_REQUIRED','请在小程序页面阅读并同意隐私保护指引。');
    return new Promise((resolve,reject)=>{waiting.push({resolve,reject});visible=true;notify();});
  });
}
function agree(buttonId){
  try{wx.setStorageSync(KEY,{version:policy.version,agreedAt:new Date().toISOString()});}
  catch(_){reject();throw failure('PRIVACY_STORAGE','无法保存隐私授权，请检查微信存储空间。');}
  platformResolvers.splice(0).forEach(resolve=>resolve({event:'agree',buttonId}));
  visible=false;notify();waiting.splice(0).forEach(item=>item.resolve());
}
function reject(){
  platformResolvers.splice(0).forEach(resolve=>resolve({event:'disagree'}));
  visible=false;notify();waiting.splice(0).forEach(item=>item.reject(failure('PRIVACY_DECLINED','未同意隐私保护指引，您仍可浏览离线地图和资料。')));
}
function hasPending(){return waiting.length>0||platformResolvers.length>0;}
function hideDialog(){visible=false;notify();}
function resumePending(){if(hasPending()){visible=true;notify();}}
function revoke(){wx.removeStorageSync(KEY);reject();try{getApp().globalData.cloudEnabled=false;}catch(_){} }
module.exports={policy,init,subscribe,hasConsent,ensureConsent,agree,reject,revoke,hasPending,hideDialog,resumePending};
