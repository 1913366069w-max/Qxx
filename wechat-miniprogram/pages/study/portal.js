'use strict';
const {PORTALS}=require('../../utils/timetable.js');
Page({
  data:{url:'',roleName:'',copied:false,message:''},
  onLoad(options){const role=options.type==='graduate'?'graduate':'undergraduate',roleName=role==='graduate'?'研究生':'本科生';this.setData({url:PORTALS[role],roleName});wx.setNavigationBarTitle({title:roleName+'教务系统'});},
  copyUrl(){
    wx.setClipboardData({data:this.data.url,success:()=>this.setData({copied:true,message:''}),fail:()=>this.setData({message:'复制失败，可长按上方网址手动复制。'})});
  },
  backToStudy(){wx.navigateBack({delta:1});}
});
