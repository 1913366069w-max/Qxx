'use strict';
const timetable=require('./timetable.js');
const {parseCalendar}=require('./calendar-import.js');

function parseImport(input,options={}){
  const text=String(input||'').replace(/^\ufeff/,'').trim();
  if(!text)throw Error('请先选择课表文件，或粘贴表格内容。');
  if(/^[a-f\d]{32}$/i.test(text)||/分享口令|从口令导入|从分享口令导入/.test(text)){
    throw Error('这是 WakeUp 在线分享口令，不能作为 CSV 导入。请在 WakeUp 中选择“导出为日历文件”，将 .ics 文件发送到微信聊天，再点“选择课表文件”。');
  }
  if(/^BEGIN:VCALENDAR\s*$/im.test(text))return parseCalendar(text,options);
  if(/<(?:html|table)\b/i.test(text))throw Error('请复制表格中的课程文字，或将表格另存为 CSV 文件后导入。');
  return {courses:timetable.parseCsv(text),termStart:timetable.monday(options.termStart)};
}
module.exports={parseImport};
