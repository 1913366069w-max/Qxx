'use strict';

const PORTALS=Object.freeze({undergraduate:'https://xjw.qdu.edu.cn/',graduate:'https://yjsxt.qdu.edu.cn/'});
const DAYS=['周一','周二','周三','周四','周五','周六','周日'];
const MAX_WEEKS=30,MAX_COURSES=240,MAX_TEXT=120000;

function dateUtc(value){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(value||'')))return null;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value?date:null;
}
function iso(date){return date.toISOString().slice(0,10);}
function monday(value){const d=dateUtc(value);if(!d)return '';d.setUTCDate(d.getUTCDate()-((d.getUTCDay()+6)%7));return iso(d);}
function weekNumber(firstMonday,today){const a=dateUtc(firstMonday),b=dateUtc(today);if(!a||!b)return 0;return Math.floor((b-a)/604800000)+1;}
function dateFor(firstMonday,week,day){const d=dateUtc(firstMonday);if(!d||week<1||week>MAX_WEEKS||day<1||day>7)return '';d.setUTCDate(d.getUTCDate()+(week-1)*7+day-1);return iso(d);}
function weekday(value){
  const raw=String(value||'').trim().replace(/星期|周|礼拜/g,'').toLowerCase();
  const chinese={'一':1,'二':2,'三':3,'四':4,'五':5,'六':6,'日':7,'天':7};
  const english={mon:1,monday:1,tue:2,tues:2,tuesday:2,wed:3,wednesday:3,thu:4,thur:4,thurs:4,thursday:4,fri:5,friday:5,sat:6,saturday:6,sun:7,sunday:7};
  return chinese[raw]||english[raw]||Number(raw)||0;
}
function weeks(value){
  const raw=String(value||'').replace(/第|周/g,'').replace(/[（(]\s*([单双])\s*[）)]/g,'$1').replace(/[；;，,]/g,'、').trim();
  if(!raw)throw Error('请填写上课周数。');
  const all=new Set();
  for(const piece of raw.split('、')){
    const match=piece.trim().match(/^(\d{1,2})(?:\s*[-—–~～至]\s*(\d{1,2}))?\s*(单|双)?$/);
    if(!match)throw Error('周数格式应为 1-16 或 1-5、7-11单。');
    const start=Number(match[1]),end=Number(match[2]||match[1]);
    if(start<1||end<start||end>MAX_WEEKS)throw Error('周数必须在 1—30 周内。');
    for(let n=start;n<=end;n++)if(!match[3]||(match[3]==='单'?n%2===1:n%2===0))all.add(n);
  }
  if(!all.size)throw Error('所填周数没有实际课程周。');
  return [...all].sort((a,b)=>a-b);
}
function periodNumber(value){
  const text=String(value==null?'':value).trim().replace(/^第\s*/,'').replace(/\s*节$/,'').trim();
  return /^\d{1,2}$/.test(text)?Number(text):NaN;
}
function timeValue(value){
  const text=String(value||'').trim().replace(/：/g,':'),match=text.match(/^(\d{1,2}):([0-5]\d)$/);
  return match?`${match[1].padStart(2,'0')}:${match[2]}`:text;
}
function course(raw){
  const name=String(raw.name||'').trim().slice(0,80),teacher=String(raw.teacher||'').trim().slice(0,80),place=String(raw.place||'').trim().slice(0,100);
  const day=weekday(raw.day),noPeriods=[raw.start,raw.end].every(value=>value==null||String(value).trim()==='');
  const start=noPeriods?null:periodNumber(raw.start),end=noPeriods?null:periodNumber(raw.end);
  if(!name)throw Error('请填写课程名称。');
  if(!Number.isInteger(day)||day<1||day>7)throw Error('星期必须是 1—7。');
  if(!noPeriods&&(!Number.isInteger(start)||!Number.isInteger(end)||start<1||end<start||end>20))throw Error('节次必须是 1—20，且结束节次不早于开始节次。');
  const span=Array.isArray(raw.weeks)?raw.weeks:weeks(raw.weeks);
  if(!span.length||span.some(n=>!Number.isInteger(n)||n<1||n>MAX_WEEKS))throw Error('上课周数无效。');
  const startTime=timeValue(raw.startTime),endTime=timeValue(raw.endTime);
  for(const time of [startTime,endTime])if(time&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(time))throw Error('时间格式应为 08:00。');
  if(noPeriods&&(!startTime||!endTime))throw Error('请填写开始/结束节次，或同时填写上课/下课时间。');
  if(startTime&&endTime&&startTime>=endTime)throw Error('结束时间必须晚于开始时间。');
  return {name,teacher:teacher==='无'?'':teacher,place:place==='无'?'':place,day,start,end,weeks:[...new Set(span)].sort((a,b)=>a-b),startTime,endTime};
}
function csvRows(input){
  const text=String(input||'').replace(/^\ufeff/,'');
  if(text.length>MAX_TEXT)throw Error('文件过大，请只导入本学期课表。');
  const lines=text.split(/\r\n|\r|\n/),first=lines.findIndex(line=>line.trim());
  if(first<0)return [];
  const directive=lines[first].match(/^[ \t]*sep=([,;\t])[ \t]*$/i);
  let delimiter=directive&&directive[1];
  if(!delimiter){
    const counts={',':0,'\t':0,';':0};let inQuotes=false;
    for(let i=0;i<lines[first].length;i++){
      const char=lines[first][i];
      if(char==='"'){if(inQuotes&&lines[first][i+1]==='"')i++;else inQuotes=!inQuotes;}
      else if(!inQuotes&&Object.prototype.hasOwnProperty.call(counts,char))counts[char]++;
    }
    delimiter=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  }
  const rows=[];let row=[],cell='',quoted=false,line=1,rowLine=1;
  const finishRow=()=>{row.push(cell);if(row.some(value=>value.trim())&&(!directive||rowLine!==first+1))rows.push({cells:row,line:rowLine});row=[];cell='';};
  for(let i=0;i<text.length;i++){
    const c=text[i];
    if(c==='\n'||c==='\r'){
      if(c==='\r'&&text[i+1]==='\n')i++;
      if(quoted)cell+='\n';else finishRow();
      line++;if(!quoted)rowLine=line;
    }
    else if(quoted){if(c==='"'&&text[i+1]==='"'){cell+='"';i++;}else if(c==='"')quoted=false;else cell+=c;}
    else if(c==='"'&&!cell.trim())quoted=true;
    else if(c===delimiter){row.push(cell);cell='';}
    else cell+=c;
  }
  if(quoted)throw Error(`第 ${rowLine} 行：CSV 引号没有闭合。`);
  finishRow();
  return rows;
}
const aliases={
  name:['课程名称','课程名','课程','名称','name','course','coursename','subject'],
  day:['星期','星期几','周几','上课星期','day','weekday','dayofweek'],
  start:['开始节数','开始节次','起始节次','起始节数','开始节','起始节','start','startnode','startperiod','startsection'],
  end:['结束节数','结束节次','终止节次','结束节','终止节','end','endnode','endperiod','endsection'],
  period:['节次','上课节次','课程节次','节数','period','periods','section','sections'],
  teacher:['老师','教师','任课教师','授课教师','教师姓名','teacher','instructor'],
  place:['地点','教室','上课地点','上课教室','教学地点','place','room','location','classroom'],
  weeks:['周数','上课周数','周次','教学周','上课周次','weeks','week','weekrange'],
  startTime:['开始时间','上课时间','起始时间','starttime','time'],
  endTime:['结束时间','下课时间','endtime']
};
function headerName(value){return value.trim().replace(/[\s_\-\ufeff]/g,'').toLowerCase();}
function periodRange(value){
  const match=String(value||'').trim().match(/^(?:第\s*)?(\d{1,2})\s*(?:节\s*)?(?:[-—–~～至]\s*(?:第\s*)?(\d{1,2})\s*)?(?:节)?$/);
  if(!match)throw Error('节次格式应为 1-2 或第1-2节。');
  return [match[1],match[2]||match[1]];
}
function parseCsv(input){
  const rows=csvRows(input);if(rows.length<2)throw Error('请导入包含表头和课程行的 CSV。');
  const header=rows[0].cells.map(headerName);
  const index={};for(const [field,names] of Object.entries(aliases))index[field]=header.findIndex(cell=>names.includes(cell));
  const missing=['name','day','weeks'].filter(field=>index[field]<0);
  if(index.period<0&&(index.start<0||index.end<0)&&index.startTime<0)missing.push('period');
  if(missing.length)throw Error('CSV 需要课程名称、星期、周数，以及节次或上课/下课时间列。');
  if(rows.length-1>MAX_COURSES)throw Error('课程行过多，请按学期分开导入。');
  const result=[];
  for(let i=1;i<rows.length;i++){
    const get=key=>index[key]<0?'':String(rows[i].cells[index[key]]||'').trim();
    try{
      if(rows[i].cells.length>header.length&&rows[i].cells.slice(header.length).some(cell=>cell.trim()))throw Error('列数超过表头，请给包含分隔符的内容加双引号。');
      let start=get('start'),end=get('end');
      if(index.period>=0&&(index.start<0||index.end<0)){
        const range=periodRange(get('period'));
        if(index.start>=0&&periodNumber(start)!==Number(range[0])||index.end>=0&&periodNumber(end)!==Number(range[1]))throw Error('节次列与开始/结束节数不一致。');
        [start,end]=range;
      }
      let startTime=get('startTime'),endTime=get('endTime');
      if(!endTime){
        const timeSpan=startTime.match(/^(\d{1,2}[:：]\d{2})\s*[-—–~～至]\s*(\d{1,2}[:：]\d{2})$/);
        if(timeSpan){startTime=timeSpan[1];endTime=timeSpan[2];}
      }
      result.push(course({name:get('name'),day:get('day'),start,end,teacher:get('teacher'),place:get('place'),weeks:get('weeks'),startTime,endTime}));
    }catch(error){throw Error(`第 ${rows[i].line} 行：${error.message}`);}
  }
  return result;
}
function courseOrder(a,b){
  if(a.startTime&&b.startTime)return a.startTime.localeCompare(b.startTime)||(a.start||0)-(b.start||0)||a.name.localeCompare(b.name);
  if(a.startTime||b.startTime)return a.startTime?-1:1;
  return a.start-b.start||a.name.localeCompare(b.name);
}
function weekDays(items,firstMonday,week){
  return DAYS.map((label,index)=>({day:index+1,label,date:dateFor(firstMonday,week,index+1),courses:(items||[]).filter(item=>item.day===index+1&&item.weeks.includes(week)).sort(courseOrder).map(item=>({...item,period:item.start==null?'':`第 ${item.start}${item.end===item.start?'':`—${item.end}`} 节`,time:item.startTime&&item.endTime?`${item.startTime}—${item.endTime}`:''}))}));
}
module.exports={PORTALS,DAYS,MAX_WEEKS,monday,weekNumber,dateFor,weeks,course,parseCsv,weekDays};
