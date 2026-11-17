const privacy=require('../../utils/privacy.js');
Component({
  data:{visible:false,name:privacy.policy.name},
  lifetimes:{attached(){this.unsubscribe=privacy.subscribe(state=>this.setData(state));},detached(){if(this.unsubscribe)this.unsubscribe();}},
  methods:{
    agree(e){if(e.detail&&e.detail.errMsg&&e.detail.errMsg.includes('fail'))return;try{privacy.agree('privacy-agree');this.triggerEvent('change',{agreed:true});}catch(error){wx.showToast({title:error.message,icon:'none'});}},
    decline(){privacy.reject();this.triggerEvent('change',{agreed:privacy.hasConsent()});},
    readPolicy(){privacy.hideDialog();wx.navigateTo({url:'/pages/privacy/privacy',fail:()=>privacy.resumePending()});},
    openContract(){
      if(!wx.openPrivacyContract){wx.showToast({title:'请更新微信后查看官方指引',icon:'none'});return;}
      wx.openPrivacyContract({fail:()=>wx.showToast({title:'微信后台指引暂不可用，请查看本页隐私说明',icon:'none'})});
    },
    stop(){}
  }
});
