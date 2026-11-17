'use strict';
const timetable=require('../../utils/timetable.js');
const {parseImport}=require('../../utils/schedule-import.js');
const {decodeTextFile,MAX_BYTES}=require('../../utils/text-file.js');
const studyMap=require('../../utils/study-map.js');
const STORAGE_PREFIX=studyMap.STORAGE_PREFIX;
const TEMPLATE='课程名称,星期,开始节数,结束节数,老师,地点,周数,开始时间,结束时间\n高等数学,1,1,2,张老师,博学楼101,1-16,08:00,09:35';
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function storageKey(role){return STORAGE_PREFIX+role;}
function readState(role){
  try{
    const saved=wx.getStorageSync(storageKey(role))||{};
    const courses=(Array.isArray(saved.courses)?saved.courses:[]).slice(0,240).flatMap((raw,index)=>{try{return [{...timetable.course(raw),id:String(raw.id||`saved-${index}`)}];}catch(_){return [];}});
    return {termStart:timetable.monday(saved.termStart),courses};
  }catch(_){return {termStart:'',courses:[]};}
}
Page({
  data:{role:'',roleName:'',portalUrl:'',termStart:'',week:1,days:[],courses:[],showForm:false,dayIndex:0,dayNames:timetable.DAYS,paste:'',message:''},
  onLoad(){
    try{
      const role=wx.getStorageSync(studyMap.ACTIVE_ROLE_KEY);
      if(timetable.PORTALS[role])this.selectRole(role,false);
    }catch(_){}
  },
  onShow(){if(this.data.role)this.refresh();},
  chooseRole(e){
    const role=e.currentTarget.dataset.role;
    if(!Object.prototype.hasOwnProperty.call(timetable.PORTALS,role))return;
    this.selectRole(role,true);
  },
  selectRole(role,openPortal){
    const saved=readState(role),current=saved.termStart?timetable.weekNumber(saved.termStart,today()):1;
    const week=Math.min(timetable.MAX_WEEKS,Math.max(1,current));
    try{wx.setStorageSync(studyMap.ACTIVE_ROLE_KEY,role);}catch(_){}
    this.setData({role,roleName:role==='graduate'?'研究生':'本科生',portalUrl:timetable.PORTALS[role],termStart:saved.termStart,week,courses:saved.courses,paste:'',message:'',showForm:false},()=>{
      this.refresh();if(openPortal)this.openOfficial();
    });
  },
  switchRole(){this.setData({role:'',roleName:'',showForm:false,message:'',paste:''});},
  openOfficial(){
    const role=this.data.role;if(!role)return;
    wx.navigateTo({url:`/pages/study/portal?type=${role}`,fail:()=>wx.showToast({title:'网页未打开，可复制网址',icon:'none'})});
  },
  copyUrl(){if(this.data.portalUrl)wx.setClipboardData({data:this.data.portalUrl,success:()=>wx.showToast({title:'网址已复制'})});},
  copyTemplate(){wx.setClipboardData({data:TEMPLATE,success:()=>wx.showToast({title:'模板已复制'})});},
  refresh(){this.setData({days:timetable.weekDays(this.data.courses,this.data.termStart,this.data.week)});},
  setTermStart(e){const termStart=timetable.monday(e.detail.value);if(!termStart)return;this.persist(this.data.courses,termStart);},
  prevWeek(){if(this.data.week>1)this.setData({week:this.data.week-1},()=>this.refresh());},
  nextWeek(){if(this.data.week<timetable.MAX_WEEKS)this.setData({week:this.data.week+1},()=>this.refresh());},
  currentWeek(){if(!this.data.termStart)return;const number=timetable.weekNumber(this.data.termStart,today());this.setData({week:Math.max(1,Math.min(timetable.MAX_WEEKS,number))},()=>this.refresh());},
  persist(courses,termStart=this.data.termStart){
    try{wx.setStorageSync(storageKey(this.data.role),{termStart,courses});this.setData({courses,termStart,message:''},()=>this.refresh());return true;}
    catch(_){this.setData({message:'保存失败，请检查微信存储空间。'});return false;}
  },
  chooseFile(){
    if(!wx.chooseMessageFile){this.setData({message:'当前微信版本不支持选择文件，请粘贴 CSV 内容。'});return;}
    wx.chooseMessageFile({count:1,type:'file',extension:['csv','txt','ics'],success:result=>{
      const file=result.tempFiles&&result.tempFiles[0];
      if(!file||file.size>MAX_BYTES){this.setData({message:'请选择不超过 1 MB 的 CSV 或 .ics 日历文件。'});return;}
      wx.getFileSystemManager().readFile({filePath:file.path,success:data=>{
        let text;
        try{text=decodeTextFile(data.data);}catch(error){this.setData({message:error.message});return;}
        this.importText(text);
      },fail:()=>this.setData({message:'文件读取失败，请重新选择 CSV 或 .ics 日历文件。'})});
    }});
  },
  setPaste(e){this.setData({paste:String(e.detail.value||'').slice(0,120000),message:''});},
  importPaste(){this.importText(this.data.paste);},
  importText(text){
    let parsed;try{parsed=parseImport(text,{termStart:this.data.termStart});}catch(error){this.setData({message:error.message});return;}
    const courses=(parsed.courses||[]).map((item,index)=>({...item,id:`import-${Date.now()}-${index}`}));
    if(!courses.length){this.setData({message:'没有可导入的课程，请检查文件内容。'});return;}
    const termStart=parsed.termStart||this.data.termStart;
    const save=()=>{if(this.persist(courses,termStart))wx.showToast({title:`已导入 ${courses.length} 门课`,icon:'none'});};
    if(this.data.courses.length)wx.showModal({title:'替换课表',content:`即将用 ${courses.length} 门课替换当前${this.data.roleName}课表，确定继续？`,success:result=>{if(result.confirm)save();}});
    else save();
  },
  toggleForm(){this.setData({showForm:!this.data.showForm,message:''});},
  chooseDay(e){this.setData({dayIndex:Number(e.detail.value)||0});},
  addCourse(e){
    const value=e.detail.value||{};let item;
    try{item=timetable.course({name:value.name,day:this.data.dayIndex+1,start:value.start,end:value.end,teacher:value.teacher,place:value.place,weeks:value.weeks,startTime:value.startTime,endTime:value.endTime});}
    catch(error){this.setData({message:error.message});return;}
    if(this.data.courses.length>=240){this.setData({message:'课表已达到 240 条课程上限。'});return;}
    if(this.persist([...this.data.courses,{...item,id:`manual-${Date.now()}-${Math.random().toString(36).slice(2)}`}]))this.setData({showForm:false});
  },
  deleteCourse(e){const id=e.currentTarget.dataset.id;if(!id)return;wx.showModal({title:'删除课程',content:'删除这门课在本课表中的记录？',success:result=>{if(result.confirm)this.persist(this.data.courses.filter(item=>item.id!==id));}});},
  clearSchedule(){wx.showModal({title:'清空课表',content:`清除本机的${this.data.roleName}课表？`,success:result=>{if(!result.confirm)return;try{wx.removeStorageSync(storageKey(this.data.role));this.setData({courses:[],termStart:'',week:1,message:''},()=>this.refresh());}catch(_){this.setData({message:'清理失败，请稍后再试。'});}}});},
  onShareAppMessage(){return {title:'青小寻 · 学在青大',path:'/pages/study/study'};}
});
