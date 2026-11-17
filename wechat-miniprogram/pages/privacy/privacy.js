const privacy=require('../../utils/privacy.js');
const api=require('../../utils/cloud-api.js');
Page({
  data:{policy:privacy.policy,agreed:false,pendingConsent:false,reviews:[],loaded:false,loading:false,error:''},
  onShow(){this.setData({agreed:privacy.hasConsent(),pendingConsent:privacy.hasPending()});},
  resumeConsent(){privacy.resumePending();},
  consentChanged(){this.setData({agreed:privacy.hasConsent(),pendingConsent:privacy.hasPending()});},
  openContract(){
    if(!wx.openPrivacyContract){wx.showToast({title:'请更新微信后查看官方指引',icon:'none'});return;}
    wx.openPrivacyContract({fail:()=>wx.showToast({title:'请先在微信后台完善隐私指引',icon:'none'})});
  },
  listMine(){
    if(this.data.loading)return;
    this.setData({loading:true,error:''});
    api.listMyReviews().then(rows=>this.setData({reviews:rows.map(row=>({...row,date:new Date(row.createdAt&&row.createdAt.$date||row.createdAt).toLocaleDateString()})),loaded:true,agreed:privacy.hasConsent(),loading:false})).catch(error=>this.setData({loading:false,error:error.code&&error.code.startsWith('PRIVACY')?error.message:'云端暂不可用，请稍后再试或联系开发者处理删除申请。'}));
  },
  deleteMine(e){
    const row=this.data.reviews[Number(e.currentTarget.dataset.index)];if(!row||this.data.loading)return;
    wx.showModal({title:'删除本人评论',content:'将删除这条云端评论及关联标识，删除后无法恢复。',success:res=>{
      if(!res.confirm)return;this.setData({loading:true,error:''});
      api.deleteReview(row.targetId,row).then(()=>{this.setData({reviews:this.data.reviews.filter(item=>item.id!==row.id),loading:false});wx.showToast({title:'已删除',icon:'success'});}).catch(()=>this.setData({loading:false,error:'删除失败，请稍后重试或联系开发者。'}));
    }});
  },
  clearLocal(){wx.showModal({title:'清除本机评论',content:'仅删除此设备上保存的评论，不影响已经发布的云端评论。',success:res=>{if(!res.confirm)return;try{api.clearLocalReviews();wx.showToast({title:'本机评论已清除',icon:'success'});}catch(_){wx.showToast({title:'清理失败，请稍后再试',icon:'none'});}}});},
  revoke(){wx.showModal({title:'撤回隐私同意',content:'停止后续联网业务，地图和离线资料仍可使用。已经发布的云端评论不会自动删除；可先删除本人评论或联系开发者。',success:res=>{if(!res.confirm)return;try{privacy.revoke();this.setData({agreed:false,reviews:[],loaded:false});wx.showToast({title:'已撤回同意',icon:'success'});}catch(_){wx.showToast({title:'撤回失败，请稍后再试',icon:'none'});}}});},
  back(){wx.navigateBack({fail:()=>wx.reLaunch({url:'/pages/map/map'})});}
});
