const assert=require('node:assert/strict');
const test=require('node:test');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

function harness({consent=false,remote=false}={}){
  const storage=new Map(),calls=[];
  const wx={
    cloud:{init(options){calls.push({type:'init',options});},callFunction(options){calls.push({type:'cloud',name:options.name,data:options.data});if(remote)options.success({result:{ok:true,reviews:[]}});else options.fail(new Error('cloud unavailable'));}},
    request(){throw new Error('external network must not be used');},
    getPrivacySetting({success}){success({needAuthorization:false});},
    onNeedPrivacyAuthorization(callback){wx.nativePrivacyHandler=callback;},
    getStorageSync(key){return storage.get(key);},
    setStorageSync(key,value){storage.set(key,value);},
    removeStorageSync(key){storage.delete(key);},
    getStorageInfoSync(){return {keys:[...storage.keys()]};}
  };
  const cache=new Map();
  function load(file){
    file=path.resolve(__dirname,'../wechat-miniprogram',file);
    if(cache.has(file))return cache.get(file).exports;
    const module={exports:{}};cache.set(file,module);
    vm.runInNewContext(fs.readFileSync(file,'utf8'),{module,exports:module.exports,wx,getApp:()=>({globalData:{}}),require:relative=>load(path.resolve(path.dirname(file),relative)),setTimeout,clearTimeout,console},{filename:file});
    return module.exports;
  }
  const privacy=load('utils/privacy.js'),api=load('utils/cloud-api.js');
  const unsubscribe=privacy.subscribe(()=>{});
  if(consent)privacy.agree('test-agree');
  return {wx,privacy,api,storage,calls,unsubscribe};
}
const payload={targetId:'food:test',targetName:'测试餐食',rating:5,comment:'本机评论测试'};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('without consent browsing does not initialize cloud or make network calls',async()=>{
  const {api,calls}=harness();
  await assert.rejects(api.getContent());
  assert.equal((await api.listReviews(payload.targetId)).length,0);
  assert.equal(calls.length,0);
});

test('rejecting privacy blocks both remote publication and local fallback',async()=>{
  const {api,privacy,calls}=harness();
  const result=api.addReview(payload);
  const rejected=assert.rejects(result,error=>error.code==='PRIVACY_DECLINED');
  await tick();
  assert.equal(privacy.hasPending(),true);
  assert.equal(calls.length,0);
  privacy.reject();await rejected;
  assert.equal(api.cachedReviews(payload.targetId).length,0);
  assert.equal(calls.length,0);
});

test('consent allows local fallback when cloud is unavailable, without foreign requests',async()=>{
  const {api,calls}=harness({consent:true});
  const result=await api.addReview(payload);
  assert.equal(result.local,true);
  assert.equal(result.review.comment,payload.comment);
  assert.equal(api.cachedReviews(payload.targetId).length,1);
  const rows=await api.listReviews(payload.targetId);
  assert.equal(rows.length,1);
  assert.equal(rows[0].rating,5);
  assert.equal(calls[0].options.traceUser,false);
  await api.deleteReview(payload.targetId,rows[0]);
  assert.equal(api.cachedReviews(payload.targetId).length,0);
});

test('withdrawal blocks subsequent remote calls and leaves unrelated storage intact',async()=>{
  const {api,privacy,calls,storage}=harness({consent:true,remote:true});
  await api.addReview(payload);
  const count=calls.length;
  privacy.revoke();
  assert.equal(privacy.hasConsent(),false);
  await api.listReviews(payload.targetId);
  await assert.rejects(api.getContent());
  assert.equal(calls.length,count);
  storage.set('qingxiaoxun_reviews_a',[{id:'one'}]);storage.set('another-app-key','keep');
  api.clearLocalReviews();
  assert.equal(storage.has('qingxiaoxun_reviews_a'),false);
  assert.equal(storage.get('another-app-key'),'keep');
});

test('native platform authorization and instruction reading do not imply consent',async()=>{
  const {privacy,wx}=harness();
  let reply;
  privacy.init();privacy.init();
  wx.nativePrivacyHandler(result=>{reply=result;});
  const state=[];const stop=privacy.subscribe(value=>state.push(value));
  const pending=privacy.ensureConsent();
  await tick();privacy.hideDialog();
  assert.equal(state.at(-1).visible,false);
  assert.equal(privacy.hasConsent(),false);
  privacy.resumePending();assert.equal(state.at(-1).visible,true);
  privacy.agree('test-agree');await pending;
  assert.equal(reply.event,'agree');assert.equal(reply.buttonId,'test-agree');
  assert.equal(privacy.hasConsent(),true);stop();
});
test('platform requiring fresh authorization cannot be bypassed by a local consent record',async()=>{
  const {privacy,api,wx,calls}=harness({consent:true});
  wx.getPrivacySetting=({success})=>success({needAuthorization:true});
  const pending=api.addReview(payload),rejected=assert.rejects(pending,error=>error.code==='PRIVACY_DECLINED');
  await tick();assert.equal(calls.length,0);privacy.reject();await rejected;
  assert.equal(api.cachedReviews(payload.targetId).length,0);
});

test('failed WeChat privacy setting fails closed instead of saving or submitting',async()=>{
  const {wx,api,calls}=harness();
  wx.getPrivacySetting=({fail})=>fail(new Error('setting unavailable'));
  await assert.rejects(api.addReview(payload),error=>error.code==='PRIVACY_UNAVAILABLE');
  assert.equal(calls.length,0);
  assert.equal(api.cachedReviews(payload.targetId).length,0);
});
test('withdrawing consent discards a late response containing personal comments',async()=>{
  const {wx,api,privacy}=harness({consent:true});
  let complete;
  wx.cloud.callFunction=({success})=>{complete=success;};
  const pending=api.listMyReviews(),rejected=assert.rejects(pending,/privacy revoked/);
  await tick();assert.equal(typeof complete,'function');
  privacy.revoke();complete({result:{ok:true,reviews:[{id:'mine',comment:'private'}]}});
  await rejected;
});
