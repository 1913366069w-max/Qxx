'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const timetable=require('../wechat-miniprogram/utils/timetable.js');
const studyMap=require('../wechat-miniprogram/utils/study-map.js');
const map=require('../wechat-miniprogram/data/campus.js');

test('imports WakeUp-style CSV with quoted rooms, weekdays and week parity',()=>{
  const csv='课程名称,星期,开始节数,结束节数,老师,地点,周数\n高等数学,1,1,2,张老师,"博学楼,101",1-16\n实验课,周三,3,4,李老师,东10教203,1-5、7-11单';
  const rows=timetable.parseCsv(csv);
  assert.equal(rows.length,2);
  assert.equal(rows[0].place,'博学楼,101');
  assert.deepEqual(rows[1].weeks,[1,2,3,4,5,7,9,11]);
  assert.equal(timetable.weekDays(rows,'2026-09-28',1)[0].courses[0].name,'高等数学');
  assert.equal(timetable.weekDays(rows,'2026-09-28',6)[2].courses.length,0);
});

test('weeks and dates are bounded and invalid CSV rows report the row number',()=>{
  assert.equal(timetable.monday('2026-10-04'),'2026-09-28');
  assert.equal(timetable.weekNumber('2026-09-28','2026-10-05'),2);
  assert.equal(timetable.dateFor('2026-09-28',2,1),'2026-10-05');
  assert.deepEqual(timetable.weeks('2-8双'),[2,4,6,8]);
  assert.throws(()=>timetable.parseCsv('课程名称,星期,开始节数,结束节数,周数\n课,8,1,2,1-16'),/第 2 行/);
});

test('imports Excel delimiters, leading blank lines and a separator preamble',()=>{
  const tab='\ufeff\r\n\r\n课程名称\t上课星期\t起始节数\t结束节次\t上课周次\r\n数学\t周二\t第1节\t第2节\t1-4（双周）';
  assert.deepEqual(timetable.parseCsv(tab)[0],{name:'数学',teacher:'',place:'',day:2,start:1,end:2,weeks:[2,4],startTime:'',endTime:''});
  const semicolon='\ufeff\nsep=;\nCourse Name;Weekday;Sections;Instructor;Classroom;Week Range;Start Time;End Time\n"Data ""Science""";Monday;第1–2节;Li;"Building; 101";1-8(单周);8:00;9:35';
  const row=timetable.parseCsv(semicolon)[0];
  assert.equal(row.name,'Data "Science"');
  assert.equal(row.place,'Building; 101');
  assert.deepEqual(row.weeks,[1,3,5,7]);
  assert.equal(row.start,1);
  assert.equal(row.end,2);
  assert.equal(row.startTime,'08:00');
  assert.equal(row.endTime,'09:35');
  assert.equal(timetable.parseCsv('sep=,\r\n课程名称,星期,节次,周数\r\n数学,1,3,1-16')[0].end,3);
});

test('retains quoted multiline cells and reports the physical row on errors',()=>{
  const csv='\n课程名称,星期,节次,周数,教室\n"实验\n课程",3,3-4,1-16,"博学楼,201"\n\n英语,8,1-2,1-16,博学楼101';
  assert.throws(()=>timetable.parseCsv(csv),/第 6 行.*星期/);
  const row=timetable.parseCsv(csv.slice(0,csv.lastIndexOf('\n英语')))[0];
  assert.equal(row.name,'实验\n课程');
  assert.equal(row.place,'博学楼,201');
  assert.throws(()=>timetable.parseCsv('课程名称,星期,节次,周数\n"未闭合,1,1-2,1-16'),/第 2 行.*引号/);
});

test('supports explicit clock-only courses without inventing section numbers',()=>{
  const csv='名称,星期几,周次,上课时间,下课时间,教师姓名,教学地点\n研讨课,周五,2-6,8:00,9:35,李老师,睿思楼101';
  const row=timetable.parseCsv(csv)[0];
  assert.equal(row.start,null);
  assert.equal(row.end,null);
  assert.equal(row.startTime,'08:00');
  assert.equal(row.endTime,'09:35');
  assert.equal(timetable.course(row).start,null);
  const span=timetable.parseCsv('Course,Day,Weeks,Time\nSeminar,Fri,1-16,14:00～15:35')[0];
  assert.equal(span.startTime,'14:00');
  assert.equal(span.endTime,'15:35');
  const numeric=timetable.course({name:'节次课',day:5,start:3,end:4,weeks:'2-6'});
  const morning=timetable.course({name:'早课',day:5,start:1,end:2,weeks:'2-6',startTime:'7:00',endTime:'7:45'});
  const friday=timetable.weekDays([numeric,row,span,morning],'2026-09-28',2)[4].courses;
  assert.deepEqual(friday.map(item=>item.name),['早课','研讨课','Seminar','节次课']);
  assert.equal(friday[1].period,'');
  assert.equal(friday[1].time,'08:00—09:35');
  assert.equal(friday[3].period,'第 3—4 节');
});

test('rejects incomplete or contradictory imports rather than guessing a timetable',()=>{
  assert.throws(()=>timetable.parseCsv('课程名称,星期,节次\n数学,1,1-2'),/CSV 需要/);
  assert.throws(()=>timetable.parseCsv('课程名称,星期,节次,周数\n数学,1,1-2,'),/第 2 行.*周数/);
  assert.throws(()=>timetable.parseCsv('课程名称,星期,开始节数,结束节数,周数\n数学,1,1,,1-16'),/第 2 行.*节次/);
  assert.throws(()=>timetable.parseCsv('课程名称,星期,开始节数,节次,周数\n数学,1,3,1-2,1-16'),/第 2 行.*不一致/);
  assert.throws(()=>timetable.parseCsv('课程名称,星期,节次,周数\n数学,1,1-2,1,3,5'),/第 2 行.*列数/);
  assert.throws(()=>timetable.parseCsv('课程名称,星期,周数,开始时间\n数学,1,1-16,8:00'),/第 2 行.*同时填写/);
  for(const periods of ['0-1','19-21','4-2','1、3'])assert.throws(()=>timetable.parseCsv(`课程名称,星期,节次,周数\n数学,1,${periods},1-16`),/第 2 行.*节次/);
  for(const times of [['25:00','26:00'],['9:35','8:00'],['8:60','9:35']])assert.throws(()=>timetable.course({name:'课',day:1,weeks:'1-16',startTime:times[0],endTime:times[1]}),/时间/);
  assert.throws(()=>timetable.weeks('1-31(单周)'),/1—30/);
});

test('today glow uses only the selected date, scheduled week and reliably mapped buildings',()=>{
  const first='2026-09-28',buildings=map.routing.buildings,entries=map.searchEntries;
  const item=(place,day,weeks)=>({...timetable.course({name:'课程',place,day,start:1,end:2,weeks}),id:place});
  const state={termStart:first,courses:[item('博学楼101',1,'1-16'),item('东10教203',1,'1-16'),item('东1教203',2,'1-16'),item('未知楼',1,'1-16'),item('博文楼',1,'2-16')]};
  const monday=studyMap.todayBuildingIndices(state,entries,buildings,'2026-09-28');
  assert.deepEqual(monday.map(index=>buildings[index].name).sort(),['博学楼','静思楼2']);
  const tuesday=studyMap.todayBuildingIndices(state,entries,buildings,'2026-09-29');
  assert.deepEqual(tuesday.map(index=>buildings[index].name),['睿思楼']);
  assert.deepEqual(studyMap.todayBuildingIndices(state,entries,buildings,'2026-10-05').map(index=>buildings[index].name).sort(),['博学楼','博文楼','静思楼2']);
  assert.deepEqual(studyMap.todayBuildingIndices(state,entries,buildings,'2027-09-28'),[]);
  assert.equal(studyMap.resolveBuilding('东10教203',entries,buildings),buildings.findIndex(item=>item.name==='静思楼2'));
  assert.equal(studyMap.resolveBuilding('东1教203',entries,buildings),buildings.findIndex(item=>item.name==='睿思楼'));
  assert.equal(studyMap.resolveBuilding('东6教',entries,buildings),-1);
});
