'use strict';

const timetable=require('./timetable');
const DAY=86400000,WEEK=7*DAY,CHINA_OFFSET=480;
const MAX_TEXT=512000,MAX_EVENTS=1000,MAX_OCCURRENCES=7200;
const WEEKDAYS={SU:0,MO:1,TU:2,WE:3,TH:4,FR:5,SA:6};

// RFC 5545: unfold content lines before reading properties, then unescape TEXT.
function textValue(value){return String(value||'').replace(/\\([nN,;\\])/g,(_,c)=>c==='n'||c==='N'?'\n':c);}
function property(line){
  let quoted=false,colon=-1;
  for(let i=0;i<line.length;i++){if(line[i]==='"')quoted=!quoted;else if(line[i]===':'&&!quoted){colon=i;break;}}
  if(colon<1)throw Error('日历内容格式不完整，请重新导出 .ics 文件。');
  const pieces=line.slice(0,colon).match(/(?:[^;"]|"[^"]*")+/g)||[];
  const name=(pieces.shift()||'').toUpperCase(),params={};
  for(const piece of pieces){const at=piece.indexOf('=');if(at<1)throw Error('日历参数格式无效，请重新导出。');params[piece.slice(0,at).toUpperCase()]=piece.slice(at+1).replace(/^"|"$/g,'');}
  return {name,params,value:line.slice(colon+1)};
}
function readEvents(input){
  const raw=String(input||'').replace(/^\ufeff/,'');
  if(raw.length>MAX_TEXT)throw Error('日历文件过大，请只导出本学期课表。');
  const lines=raw.replace(/\r\n?/g,'\n').replace(/\n[ \t]/g,'').split('\n');
  const events=[],stack=[];let event=null,calendars=0,timezone='Asia/Shanghai';
  for(const line of lines){
    if(!line.trim())continue;
    const prop=property(line);
    if(prop.name==='BEGIN'){
      const component=prop.value.toUpperCase();
      if(!stack.length&&component!=='VCALENDAR')throw Error('请选择完整的 .ics 日历文件。');
      if(component==='VCALENDAR'){if(stack.length||++calendars>1)throw Error('请一次导入一个学期的日历。');}
      if(component==='VEVENT'){
        if(stack.join('/')!=='VCALENDAR')throw Error('日历课程层级无效，请重新导出。');
        event={};if(events.length>=MAX_EVENTS)throw Error('日历课程条目过多，请按学期分开导出。');
      }
      stack.push(component);continue;
    }
    if(prop.name==='END'){
      const component=prop.value.toUpperCase();
      if(stack.pop()!==component)throw Error('日历文件未完整保存，请重新导出。');
      if(component==='VEVENT'){events.push(event);event=null;}
      continue;
    }
    if(stack.join('/')==='VCALENDAR/VEVENT'){
      if(!event[prop.name])event[prop.name]=[];
      event[prop.name].push(prop);
    }else if(stack.join('/')==='VCALENDAR'&&prop.name==='X-WR-TIMEZONE')timezone=prop.value;
    else if(!stack.length)throw Error('日历文件包含不完整的内容，请重新导出。');
  }
  if(stack.length||calendars!==1||!events.length)throw Error('未找到完整的课程日历，请导出包含课程的 .ics 文件。');
  return {events,timezone};
}
function single(event,name,required){
  const values=event[name]||[];
  if(values.length>1)throw Error(`日历课程含有重复的 ${name}，请重新导出。`);
  if(required&&!values.length)throw Error(`日历课程缺少 ${name}，请导出包含上课和下课时间的日历。`);
  return values[0];
}
function zoneOffset(zone){
  if(zone==='Asia/Shanghai')return CHINA_OFFSET;
  if(zone==='UTC'||zone==='Etc/UTC'||zone==='GMT')return 0;
  throw Error('日历使用了暂不支持的时区，请按北京时间重新导出。');
}
function parseStamp(prop,defaultZone,allowDate,allowSeconds){
  const value=prop.value,kind=(prop.params.VALUE||'DATE-TIME').toUpperCase();
  const dateOnly=kind==='DATE';
  if(kind!=='DATE-TIME'&&!dateOnly)throw Error('暂不支持此日历时间格式，请导出普通课程日历。');
  if(dateOnly&&!allowDate)throw Error('日历含全天事件，缺少上课时间，请导出带具体时间的课程。');
  const match=value.match(dateOnly?/^(\d{4})(\d{2})(\d{2})$/:/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if(!match)throw Error('日历日期或时间格式无效，请重新导出 .ics 文件。');
  const year=Number(match[1]),month=Number(match[2]),day=Number(match[3]);
  const hour=Number(match[4]||0),minute=Number(match[5]||0),second=Number(match[6]||0);
  if(year<2000||year>2199||(!allowSeconds&&second!==0))throw Error('日历日期超出支持范围或含非整分钟时间，请检查课程时间。');
  if(match[7]&&prop.params.TZID)throw Error('日历同时设置了 UTC 和其他时区，请重新导出。');
  const wall=Date.UTC(year,month-1,day,hour,minute,second),date=new Date(wall);
  if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day||date.getUTCHours()!==hour||date.getUTCMinutes()!==minute||date.getUTCSeconds()!==second)throw Error('日历含无效日期或上课时间，请检查后重试。');
  const offset=match[7]?0:zoneOffset(prop.params.TZID||defaultZone);
  return {wall,offset,instant:wall-offset*60000,dateOnly};
}
function localParts(instant){
  const value=new Date(instant+CHINA_OFFSET*60000);
  return {date:value.toISOString().slice(0,10),time:value.toISOString().slice(11,16),day:((value.getUTCDay()+6)%7)+1};
}
function ruleDates(prop,start){
  const rule={};
  for(const part of prop.value.toUpperCase().split(';')){
    const pieces=part.split('=');
    if(pieces.length!==2||!pieces[0]||!pieces[1]||rule[pieces[0]])throw Error('日历重复规则无效，请重新导出。');
    rule[pieces[0]]=pieces[1];
  }
  const allowed=['FREQ','INTERVAL','BYDAY','UNTIL','COUNT','WKST'];
  if(rule.FREQ!=='WEEKLY'||Object.keys(rule).some(key=>!allowed.includes(key)))throw Error('当前仅支持按周重复的课表，请导出具体课程日期或改用 CSV。');
  const interval=rule.INTERVAL===undefined?1:Number(rule.INTERVAL);
  if(!/^\d+$/.test(rule.INTERVAL||'1')||!Number.isInteger(interval)||interval<1||interval>timetable.MAX_WEEKS)throw Error('课程重复间隔无效，请检查日历。');
  if(rule.COUNT&&rule.UNTIL)throw Error('日历同时设置了重复次数和截止日期，请重新导出。');
  if(!rule.COUNT&&!rule.UNTIL)throw Error('课程未设置结束日期，请只导出本学期的课程日历。');
  const count=rule.COUNT?Number(rule.COUNT):Infinity;
  if(rule.COUNT&&(!/^\d+$/.test(rule.COUNT)||count<1||count>timetable.MAX_WEEKS*7))throw Error('课程重复次数超出学期范围，请按学期导出。');
  const weekday=new Date(start.wall).getUTCDay();
  const days=rule.BYDAY?rule.BYDAY.split(',').map(day=>{if(WEEKDAYS[day]===undefined)throw Error('暂不支持按月序号重复的课程，请导出具体课程日期。');return WEEKDAYS[day];}):[weekday];
  if(!days.includes(weekday))throw Error('课程开始日期与重复星期不一致，请重新导出。');
  const wkst=rule.WKST||'MO';
  if(WEEKDAYS[wkst]===undefined)throw Error('日历每周开始日无效。');
  const weekStart=WEEKDAYS[wkst],midnight=Math.floor(start.wall/DAY)*DAY;
  const firstWeek=midnight-((weekday-weekStart+7)%7)*DAY;
  let until=Infinity;
  if(rule.UNTIL){
    const untilProp={value:rule.UNTIL,params:{}};
    if(/^\d{8}$/.test(rule.UNTIL))untilProp.params.VALUE='DATE';
    const stamp=parseStamp(untilProp,start.offset===0?'UTC':'Asia/Shanghai',true,true);
    until=stamp.instant+(stamp.dateOnly?DAY-1:0);
    if(until<start.instant)throw Error('课程截止日期早于开始日期，请检查日历。');
    if(until-start.instant>=timetable.MAX_WEEKS*WEEK)throw Error('日历超过 30 周，请只导出本学期的课程。');
  }
  const dates=[];
  for(let delta=0;delta<timetable.MAX_WEEKS*7;delta++){
    const wall=start.wall+delta*DAY,instant=wall-start.offset*60000;
    if(instant>until)break;
    const week=Math.floor((Math.floor(wall/DAY)*DAY-firstWeek)/WEEK);
    if(week%interval===0&&days.includes(new Date(wall).getUTCDay())){
      dates.push(instant);if(dates.length===count)break;
    }
  }
  if(Number.isFinite(count)&&dates.length!==count)throw Error('课程重复日期超过 30 周，请按学期导出。');
  return dates;
}
function recurrenceValues(props,start,defaultZone){
  const values=[];
  for(const prop of props||[]){
    for(const value of prop.value.split(',')){
      const stamp=parseStamp({...prop,value},defaultZone,true);
      // Date-only additions/exclusions refer to the original event's local time.
      values.push(stamp.dateOnly?stamp.wall+(start.wall%DAY)-start.offset*60000:stamp.instant);
      if(values.length>timetable.MAX_WEEKS*7)throw Error('课程补课或停课日期过多，请按学期导出。');
    }
  }
  return values;
}
function details(event){
  const name=textValue(single(event,'SUMMARY',true).value).trim();
  const place=textValue((single(event,'LOCATION')||{}).value).trim();
  const description=textValue((single(event,'DESCRIPTION')||{}).value);
  const teacher=(description.match(/(?:^|\n)\s*(?:任课教师|教师|老师|Teacher)\s*[：:]\s*([^\n]+)/i)||[])[1]||'';
  let start=null,end=null;
  const periodLine=description.match(/(?:^|\n)\s*节次\s*[：:]\s*([^\n]+)/);
  if(periodLine){
    const period=periodLine[1].trim().match(/^第?\s*(\d{1,2})(?:\s*[-—–~～至]\s*(\d{1,2}))?\s*节?\s*$/);
    if(!period)throw Error('日历中的节次格式无法识别，请改为“节次：1-2”或删除该行。');
    start=Number(period[1]);end=Number(period[2]||period[1]);
  }
  return {name,place,teacher:teacher.trim(),start,end};
}
function parseCalendar(input,options){
  const opts=options||{},parsed=readEvents(input),occurrences=[];
  const limit=opts.maxCourses===undefined?240:Number(opts.maxCourses);
  if(!Number.isInteger(limit)||limit<1||limit>240)throw Error('课程数量上限无效。');
  if(opts.termStart&&(!/^\d{4}-\d{2}-\d{2}$/.test(opts.termStart)||timetable.monday(opts.termStart)!==opts.termStart))throw Error('请将第 1 周开始日期设置为有效的周一。');
  parsed.events.forEach((event,index)=>{
    try{
      if(event['RECURRENCE-ID']||event.EXRULE)throw Error('日历包含单次改期规则，请导出展开后的具体课程日期或改用 CSV。');
      if((single(event,'STATUS')||{}).value==='CANCELLED')return;
      if(event.DURATION)throw Error('日历未提供明确下课时间，请导出包含 DTSTART 和 DTEND 的课表。');
      const start=parseStamp(single(event,'DTSTART',true),parsed.timezone,false);
      const end=parseStamp(single(event,'DTEND',true),parsed.timezone,false);
      const duration=end.instant-start.instant;
      if(duration<=0||duration>=DAY)throw Error('下课时间必须晚于上课时间，且课程不能跨天。');
      const course=details(event),rule=single(event,'RRULE');
      const dates=new Set(rule?ruleDates(rule,start):[start.instant]);
      for(const instant of recurrenceValues(event.RDATE,start,parsed.timezone))dates.add(instant);
      for(const instant of recurrenceValues(event.EXDATE,start,parsed.timezone))dates.delete(instant);
      for(const instant of dates){
        const from=localParts(instant),to=localParts(instant+duration);
        if(from.date!==to.date)throw Error('日历含跨天课程，请按每天的实际上课时段拆分。');
        occurrences.push({...course,date:from.date,day:from.day,startTime:from.time,endTime:to.time});
        if(occurrences.length>MAX_OCCURRENCES)throw Error('日历课程过多，请只导出本学期课表。');
      }
    }catch(error){throw Error(`第 ${index+1} 条日历课程：${error.message}`);}
  });
  if(!occurrences.length)throw Error('日历中没有可导入的课程，请检查导出范围。');
  occurrences.sort((a,b)=>a.date.localeCompare(b.date)||a.startTime.localeCompare(b.startTime));
  const termStart=opts.termStart||timetable.monday(occurrences[0].date),groups=new Map();
  for(const occurrence of occurrences){
    const week=timetable.weekNumber(termStart,occurrence.date);
    if(week<1||week>timetable.MAX_WEEKS)throw Error('课程日期不在第 1—30 周内，请检查开学日期或按学期导出。');
    const {date,...raw}=occurrence;
    const key=JSON.stringify(raw);
    if(groups.has(key))groups.get(key).weeks.push(week);
    else groups.set(key,{...raw,weeks:[week]});
    if(groups.size>limit)throw Error('课程时段过多，请按学期分开导入。');
  }
  return {termStart,courses:[...groups.values()].map(raw=>timetable.course(raw))};
}

module.exports={parseCalendar};
