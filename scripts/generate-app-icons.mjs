import fs from 'node:fs';
import path from 'node:path';
import {deflateSync} from 'node:zlib';
import {chromium} from '../tooling/node_modules/@playwright/test/index.mjs';
// Raster exports of the repository's vector logo, with an opaque iOS background.
const svg=fs.readFileSync('icon.svg','utf8'),browser=await chromium.launch({channel:'msedge'});
const crcTable=Array.from({length:256},(_,i)=>{for(let bit=0;bit<8;bit++)i=(i&1)?0xedb88320^(i>>>1):i>>>1;return i>>>0;});
function chunk(type,data){const name=Buffer.from(type),body=Buffer.concat([name,data]),size=Buffer.alloc(4),sum=Buffer.alloc(4);size.writeUInt32BE(data.length);let crc=0xffffffff;for(const byte of body)crc=crcTable[(crc^byte)&255]^(crc>>>8);sum.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([size,body,sum]);}
function rgbPNG(rgba,size){const rows=Buffer.alloc(size*(size*3+1)),head=Buffer.alloc(13);head.writeUInt32BE(size);head.writeUInt32BE(size,4);head[8]=8;head[9]=2;for(let y=0;y<size;y++)for(let x=0;x<size;x++){const source=(y*size+x)*4,target=y*(size*3+1)+1+x*3;if(rgba[source+3]!==255)throw Error('Icon export must be opaque');rgba.copy(rows,target,source,source+3);}return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',head),chunk('IDAT',deflateSync(rows)),chunk('IEND',Buffer.alloc(0))]);}
try{
 const page=await browser.newPage();
 async function png(size,inset=0){const pixels=await page.evaluate(async({svg,size,inset})=>{const image=new Image(),url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=reject;image.src=url;});const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d',{alpha:false});ctx.fillStyle='#1b58ad';ctx.fillRect(0,0,size,size);ctx.drawImage(image,inset,inset,size-inset*2,size-inset*2);URL.revokeObjectURL(url);const bytes=ctx.getImageData(0,0,size,size).data;let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(binary);},{svg,size,inset});return rgbPNG(Buffer.from(pixels,'base64'),size);}
 for(const [name,size] of [['icon-192-v1.png',192],['icon-512-v1.png',512],['apple-touch-icon-v1.png',180],['ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png',1024]])fs.writeFileSync(name,await png(size));
 const small=await png(64),header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);header[6]=64;header[7]=64;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);header.writeUInt32LE(small.length,14);header.writeUInt32LE(22,18);fs.writeFileSync('favicon-v1.ico',Buffer.concat([header,small]));
 for(const [density,size] of [['mdpi',48],['hdpi',72],['xhdpi',96],['xxhdpi',144],['xxxhdpi',192]]){
  const dir='android/app/src/main/res/mipmap-'+density;
  for(const name of ['ic_launcher.png','ic_launcher_round.png'])fs.writeFileSync(path.join(dir,name),await png(size));
  fs.writeFileSync(path.join(dir,'ic_launcher_foreground.png'),await png(size*108/48,size*21/48));
 }
 console.log('Exported framed N logo for Web, Android and iOS.');
}finally{await browser.close();}
