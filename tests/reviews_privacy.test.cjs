const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
function server(){
  const rows=[{_id:'mine',authorOpenId:'user-one',rating:5,comment:'mine',targetId:'food',targetName:'food',createdAt:'2026-09-28'},{_id:'other',authorOpenId:'user-two',rating:4,comment:'other',targetId:'food',createdAt:'2026-09-28'}];
  const db={serverDate:()=>new Date(),collection(){return {
    where(criteria){const matches=row=>Object.entries(criteria).every(([key,value])=>row[key]===value);return {orderBy(){return this;},limit(){return this;},async get(){return {data:rows.filter(matches)};},async remove(){const items=rows.filter(matches);items.forEach(row=>rows.splice(rows.indexOf(row),1));return {stats:{removed:items.length}};}};},
    async add({data}){rows.push(data);}
  };}};
  const cloud={init(){},database:()=>db,getWXContext:()=>({OPENID:'user-one'})},exports={};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../wechat-miniprogram/cloudfunctions/reviews/index.js'),'utf8'),{require:()=>cloud,exports});
  return {main:exports.main,rows};
}
test('public and personal review lists never disclose OpenID',async()=>{
  const {main}=server();
  const result=await main({action:'list',targetId:'food'});
  assert.equal(result.reviews.length,2);
  assert.equal(result.reviews[0].canDelete,true);assert.equal(result.reviews[1].canDelete,false);
  assert.equal(JSON.stringify(result).includes('user-one'),false);
  assert.equal(JSON.stringify(result).includes('authorOpenId'),false);
  const mine=await main({action:'mine'});assert.equal(mine.reviews.length,1);assert.equal(mine.reviews[0].id,'mine');
});
test('deletion requires platform identity to match stored author, not client claims',async()=>{
  const {main,rows}=server();
  const forbidden=await main({action:'delete',id:'other',authorOpenId:'user-two'});
  assert.equal(forbidden.ok,false);assert.equal(rows.length,2);
  const removed=await main({action:'delete',id:'mine'});
  assert.equal(removed.ok,true);assert.equal(rows.length,1);assert.equal(rows[0]._id,'other');
});
test('new reviews require the current privacy version and preserve minimal attribution',async()=>{
  const {main,rows}=server();
  const payload={action:'add',targetId:'food',targetName:'food',rating:5,comment:'good',clientReviewId:'review-123-abcd'};
  assert.equal((await main(payload)).ok,false);assert.equal(rows.length,2);
  assert.equal((await main({...payload,privacyVersion:'2026-10-04',authorOpenId:'spoof'})).ok,true);
  assert.equal(rows[2].authorOpenId,'user-one');assert.equal(rows[2].privacyVersion,'2026-10-04');
  assert.equal((await main({...payload,clientReviewId:'review-124-abcd',privacyVersion:'2026-09-28'})).ok,true);
});
