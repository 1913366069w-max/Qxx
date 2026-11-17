const cloud=require('wx-server-sdk');
cloud.init({env:cloud.DYNAMIC_CURRENT_ENV});
const db=cloud.database();

exports.main=async event=>{
  if(!event||event.action!=='get')return {ok:false,error:'unsupported action'};
  try{
    const result=await db.collection('content').doc('main').get();
    return {ok:true,life:result.data&&result.data.life||null,updatedAt:result.data&&result.data.updatedAt||null};
  }catch(error){
    return {ok:true,life:null,empty:true};
  }
};
