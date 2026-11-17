'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseCalendar}=require('../wechat-miniprogram/utils/calendar-import.js');

const event=(body)=>`BEGIN:VEVENT\r\n${body}\r\nEND:VEVENT`;
const calendar=(...events)=>`BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events.join('\r\n')}\r\nEND:VCALENDAR`;
const base='SUMMARY:高等数学\r\nDTSTART;TZID=Asia/Shanghai:20260928T080000\r\nDTEND;TZID=Asia/Shanghai:20260928T095000';

test('calendar export imports unfolded escaped text, teacher, explicit periods and week dates',()=>{
  const result=parseCalendar(calendar(event(`${base}\r\nLOCATION:博学楼\\,101\r\nDESCRIPTION:老师：张老师\\n节次：1-2\\n备注：实验课\r\n 说明\r\nRRULE:FREQ=WEEKLY;COUNT=3`)));
  assert.equal(result.termStart,'2026-09-28');
  assert.deepEqual(result.courses,[{name:'高等数学',teacher:'张老师',place:'博学楼,101',day:1,start:1,end:2,weeks:[1,2,3],startTime:'08:00',endTime:'09:50'}]);
});

test('clock-only UTC events convert to China date without inventing periods',()=>{
  const result=parseCalendar(calendar(event('SUMMARY:晚间课程\r\nDTSTART:20260927T180000Z\r\nDTEND:20260927T193000Z\r\nRRULE:FREQ=WEEKLY;BYDAY=SU;COUNT=2')));
  assert.equal(result.termStart,'2026-09-28');
  assert.equal(result.courses[0].day,1);
  assert.equal(result.courses[0].startTime,'02:00');
  assert.equal(result.courses[0].endTime,'03:30');
  assert.equal(result.courses[0].start,null);
  assert.equal(result.courses[0].end,null);
  assert.deepEqual(result.courses[0].weeks,[1,2]);
});

test('weekly interval and BYDAY respect count across week boundaries',()=>{
  const result=parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE;COUNT=5`)));
  assert.equal(result.courses.length,2);
  assert.deepEqual(result.courses.find(c=>c.day===1).weeks,[1,3,5]);
  assert.deepEqual(result.courses.find(c=>c.day===3).weeks,[1,3]);
});

test('custom week start changes multi-day interval expansion',()=>{
  const result=parseCalendar(calendar(event('SUMMARY:课程\r\nDTSTART:20260927T080000\r\nDTEND:20260927T090000\r\nRRULE:FREQ=WEEKLY;WKST=SU;INTERVAL=2;BYDAY=SU,MO;COUNT=4')));
  assert.deepEqual(result.courses.find(c=>c.day===7).weeks,[1,3]);
  assert.deepEqual(result.courses.find(c=>c.day===1).weeks,[2,4]);
});

test('UNTIL is inclusive, RDATE adds classes and EXDATE removes exact dates',()=>{
  const result=parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;UNTIL=20261012T000000Z\r\nEXDATE;TZID=Asia/Shanghai:20261005T080000\r\nRDATE;VALUE=DATE:20261019,20261026`)));
  assert.deepEqual(result.courses[0].weeks,[1,3,4,5]);
});

test('date-only exclusions and date-only until retain original local time',()=>{
  const result=parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;UNTIL=20261012\r\nEXDATE;VALUE=DATE:20261005`)));
  assert.deepEqual(result.courses[0].weeks,[1,3]);
  const seconds=parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;UNTIL=20261012T235959Z`)));
  assert.deepEqual(seconds.courses[0].weeks,[1,2,3]);
});

test('explicit semester Monday is preserved and repeated individual events merge',()=>{
  const next=base.replace(/20260928/g,'20261005');
  const result=parseCalendar(calendar(event(base),event(next),event(base)),{termStart:'2026-09-21'});
  assert.equal(result.termStart,'2026-09-21');
  assert.deepEqual(result.courses[0].weeks,[2,3]);
  assert.equal(result.courses.length,1);
  assert.throws(()=>parseCalendar(calendar(event(base)),{termStart:'2026-09-29'}),/周一/);
  assert.throws(()=>parseCalendar(calendar(event(base)),{termStart:'2026-10-05'}),/开学日期/);
});

test('cancelled events do not import and alarm descriptions do not override course data',()=>{
  const result=parseCalendar(calendar(event(`${base}\r\nDESCRIPTION:教师：李老师\r\nBEGIN:VALARM\r\nDESCRIPTION:提醒\r\nEND:VALARM`),event(`${base}\r\nSTATUS:CANCELLED`)));
  assert.equal(result.courses.length,1);
  assert.equal(result.courses[0].teacher,'李老师');
});

test('unsupported recurrence, timezone and implicit recurrence end fail actionably',()=>{
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=DAILY;COUNT=5`))),/按周重复/);
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY`))),/结束日期/);
  assert.throws(()=>parseCalendar(calendar(event(base.replace(/Asia\/Shanghai/g,'America/New_York')))),/北京时间/);
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRECURRENCE-ID:20260928T080000`))),/单次改期/);
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;COUNT=3`),event(`${base}\r\nRECURRENCE-ID:20260928T080000\r\nSTATUS:CANCELLED`))),/单次改期/);
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;BYDAY=TU;COUNT=3`))),/重复星期/);
});

test('malformed, all-day, cross-day and second-level times are never guessed',()=>{
  assert.throws(()=>parseCalendar('BEGIN:VCALENDAR\nBEGIN:VEVENT'),/完整/);
  assert.throws(()=>parseCalendar(calendar(event('SUMMARY:课程\r\nDTSTART;VALUE=DATE:20260928\r\nDTEND;VALUE=DATE:20260929'))),/全天事件/);
  assert.throws(()=>parseCalendar(calendar(event(base.replace('20260928T080000','20260928T230000').replace('20260928T095000','20260929T010000')))),/跨天/);
  assert.throws(()=>parseCalendar(calendar(event(base.replace('080000','080030')))),/非整分钟/);
  assert.throws(()=>parseCalendar(calendar(event(base.replace(/20260928/g,'20260230')))),/无效日期/);
});

test('imports are bounded by text, event, recurrence, semester and merged-course limits',()=>{
  assert.throws(()=>parseCalendar(' '.repeat(512001)),/过大/);
  assert.throws(()=>parseCalendar(calendar(...Array(1001).fill(event(base)))),/条目过多/);
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;COUNT=31`))),/30 周/);
  assert.throws(()=>parseCalendar(calendar(event(`${base}\r\nRRULE:FREQ=WEEKLY;UNTIL=20271012`))),/30 周/);
  assert.throws(()=>parseCalendar(calendar(event(base),event(base.replace('高等数学','另一门课'))),{maxCourses:1}),/时段过多/);
});
