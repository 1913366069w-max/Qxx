'use strict';
const assert=require('node:assert/strict');
const {test}=require('node:test');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..','wechat-miniprogram');
const {parseImport}=require(path.join(root,'utils','schedule-import.js'));
const {decodeTextFile}=require(path.join(root,'utils','text-file.js'));

const ICS=[
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'X-WR-TIMEZONE:Asia/Shanghai',
  'BEGIN:VEVENT',
  'DTSTART:20260907T080000',
  'DTEND:20260907T093500',
  'SUMMARY:高等数学',
  'LOCATION:博学楼101',
  'DESCRIPTION:任课教师：张老师\\n节次：1-2',
  'RRULE:FREQ=WEEKLY;COUNT=16;BYDAY=MO',
  'END:VEVENT',
  'END:VCALENDAR'
].join('\r\n');

test('parseImport keeps the existing CSV behaviour',()=>{
  const result=parseImport('课程名称,星期,开始节数,结束节数,老师,地点,周数\n高等数学,1,1,2,张老师,博学楼101,1-16');
  assert.equal(result.courses.length,1);
  assert.equal(result.courses[0].name,'高等数学');
  assert.equal(result.courses[0].day,1);
  assert.deepEqual(result.courses[0].weeks,[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16]);
});

test('parseImport expands an ICS calendar and infers the semester Monday',()=>{
  const result=parseImport(ICS);
  assert.equal(result.termStart,'2026-09-07');
  assert.equal(result.courses.length,1);
  assert.equal(result.courses[0].name,'高等数学');
  assert.equal(result.courses[0].teacher,'张老师');
  assert.equal(result.courses[0].place,'博学楼101');
  assert.equal(result.courses[0].startTime,'08:00');
  assert.equal(result.courses[0].endTime,'09:35');
  assert.equal(result.courses[0].weeks.length,16);
});

test('parseImport explains WakeUp share codes and pasted HTML instead of throwing CSV errors',()=>{
  assert.throws(()=>parseImport('a'.repeat(32)),/WakeUp/);
  assert.throws(()=>parseImport('<table><tr><td>高等数学</td></tr></table>'),/复制表格中的课程文字/);
});

test('decodeTextFile handles BOM, GBK and UTF-16 exports',()=>{
  assert.equal(decodeTextFile(Buffer.concat([Buffer.from([0xef,0xbb,0xbf]),Buffer.from('课程名称,星期','utf8')])),'课程名称,星期');
  assert.equal(decodeTextFile(Buffer.from([0xbf,0xce,0xb3,0xcc])),'课程');
  assert.equal(decodeTextFile(Buffer.concat([Buffer.from([0xff,0xfe]),Buffer.from('课程,1,1-4','utf16le')])),'课程,1,1-4');
  assert.throws(()=>decodeTextFile(Buffer.from([0x50,0x4b,0x03,0x04])),/Excel/);
});

test('study page actually uses the calendar and encoding helpers',()=>{
  const source=fs.readFileSync(path.join(root,'pages','study','study.js'),'utf8');
  assert.ok(source.includes("require('../../utils/schedule-import.js')"),'页面应接入 schedule-import');
  assert.ok(source.includes("require('../../utils/text-file.js')"),'页面应接入 text-file');
  assert.ok(source.includes('parseImport('),'页面应调用 parseImport');
  assert.ok(source.includes('decodeTextFile('),'页面应调用 decodeTextFile');
  assert.ok(/extension:\['csv','txt','ics'\]/.test(source),'文件选择器应接受 .ics');
  assert.ok(!/encoding:'utf8'/.test(source),'不应再按固定 UTF-8 读取文件');
});
