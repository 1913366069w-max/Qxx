'use strict';

const MAX_BYTES=1024*1024;
let gbkTable;
function utf8(bytes){
  const chars=[];
  for(let i=0;i<bytes.length;){
    const first=bytes[i++];
    if(first<0x80){chars.push(String.fromCharCode(first));continue;}
    const size=first>=0xc2&&first<=0xdf?1:first>=0xe0&&first<=0xef?2:first>=0xf0&&first<=0xf4?3:-1;
    if(size<0||i+size>bytes.length)throw Error('UTF8');
    let code=first&((1<<(6-size))-1);
    for(let k=0;k<size;k++){const b=bytes[i++];if((b&0xc0)!==0x80)throw Error('UTF8');code=(code<<6)|(b&0x3f);}
    if(code<(size===1?0x80:size===2?0x800:0x10000)||code>0x10ffff||(code>=0xd800&&code<=0xdfff))throw Error('UTF8');
    if(code<=0xffff)chars.push(String.fromCharCode(code));
    else{code-=0x10000;chars.push(String.fromCharCode(0xd800+(code>>10),0xdc00+(code&1023)));}
  }
  return chars.join('');
}
function utf16(bytes,little){
  if(bytes.length%2)throw Error('UTF16');
  const chars=[];
  for(let i=0;i<bytes.length;i+=2)chars.push(String.fromCharCode(little?bytes[i]|bytes[i+1]<<8:bytes[i]<<8|bytes[i+1]));
  const text=chars.join('');
  for(let i=0;i<text.length;i++){
    const code=text.charCodeAt(i);
    if(code>=0xd800&&code<=0xdbff){const next=text.charCodeAt(++i);if(!(next>=0xdc00&&next<=0xdfff))throw Error('UTF16');}
    else if(code>=0xdc00&&code<=0xdfff)throw Error('UTF16');
  }
  return text;
}
function table(){
  if(gbkTable)return gbkTable;
  const text=require('./gbk-table.js'),alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const out=[];let bits=0,value=0;
  for(let i=0;i<text.length&&text[i]!=='=';i++){const n=alphabet.indexOf(text[i]);if(n<0)continue;value=(value<<6)|n;bits+=6;if(bits>=8){bits-=8;out.push((value>>bits)&255);}}
  gbkTable=new Uint8Array(out);return gbkTable;
}
function gbk(bytes){
  const data=table(),chars=[];
  for(let i=0;i<bytes.length;i++){
    const lead=bytes[i];if(lead<0x80){chars.push(String.fromCharCode(lead));continue;}
    if(lead===0x80){chars.push('€');continue;}
    const trail=bytes[++i];
    if(lead<0x81||lead>0xfe||trail==null||trail<0x40||trail>0xfe||trail===0x7f)throw Error('GBK');
    const offset=((lead-0x81)*190+trail-0x40-(trail>0x7f?1:0))*2;
    const code=data[offset]|data[offset+1]<<8;if(!code)throw Error('GBK');
    chars.push(String.fromCharCode(code));
  }
  return chars.join('');
}
function decodeTextFile(input){
  if(typeof input==='string')return input.replace(/^\ufeff/,'');
  let bytes;
  try{bytes=ArrayBuffer.isView(input)?new Uint8Array(input.buffer,input.byteOffset,input.byteLength):new Uint8Array(input);}catch(_){throw Error('无法读取课表文件，请重新选择。');}
  if(!bytes.length)throw Error('所选文件为空。');
  if(bytes.length>MAX_BYTES)throw Error('请选择不超过 1 MB 的课表文件。');
  if((bytes[0]===0x50&&bytes[1]===0x4b)||(bytes[0]===0xd0&&bytes[1]===0xcf))throw Error('这是 Excel 工作簿，请先另存为 CSV 文件，再选择导入。');
  let result;
  try{
    if(bytes[0]===0xff&&bytes[1]===0xfe)result=utf16(bytes.subarray(2),true);
    else if(bytes[0]===0xfe&&bytes[1]===0xff)result=utf16(bytes.subarray(2),false);
    else{
      let even=0,odd=0;const end=Math.min(bytes.length,2048);
      for(let i=0;i<end;i++)if(bytes[i]===0)(i%2?odd++:even++);
      if(odd>end*.12&&even===0)result=utf16(bytes,true);
      else if(even>end*.12&&odd===0)result=utf16(bytes,false);
      else{try{result=utf8(bytes);}catch(_){result=gbk(bytes);}}
    }
  }catch(_){throw Error('文件文字无法识别，请将表格另存为 CSV UTF-8 后重试。');}
  if(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffd]/.test(result))throw Error('文件内容不是可读课表文本，请另存为 CSV UTF-8 后重试。');
  return result.replace(/^\ufeff/,'');
}
module.exports={decodeTextFile,MAX_BYTES};
