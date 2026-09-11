// Original raster PWA icons, generated without a network asset or image dependency.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
function crc32(buf) { let c = 0xffffffff; for (const b of buf) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); } return (c ^ 0xffffffff) >>> 0; }
function chunk(name, data) { const n = Buffer.from(name), size = Buffer.alloc(4), crc = Buffer.alloc(4); size.writeUInt32BE(data.length); crc.writeUInt32BE(crc32(Buffer.concat([n, data]))); return Buffer.concat([size, n, data, crc]); }
const points = [[95,33],[78,71],[57,76],[44,92],[38,86],[49,69],[30,61],[35,55],[58,59],[84,34]];
function inside(x,y) { let yes = false; for(let i=0,j=points.length-1;i<points.length;j=i++) { const a=points[i],b=points[j]; if((a[1]>y)!==(b[1]>y) && x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0]) yes=!yes; } return yes; }
mkdirSync('public', {recursive:true});
for (const size of [192,512]) {
  const raw=Buffer.alloc((size*4+1)*size), header=Buffer.alloc(13); header.writeUInt32BE(size,0); header.writeUInt32BE(size,4); header[8]=8; header[9]=6;
  for(let y=0;y<size;y++) for(let x=0;x<size;x++) {
    const px=(x+.5)/size*128, py=(y+.5)/size*128, radius=Math.hypot(px-64,py-64);
    let c=[23,76,74]; if(Math.abs(radius-44)<1) c=[132,182,164]; if(py>97&&py<101&&px>33&&px<95) c=[217,175,105]; if(inside(px,py)) c=[241,238,224];
    const i=y*(size*4+1)+1+x*4; raw.set([...c,255],i);
  }
  writeFileSync(`public/icon-${size}.png`,Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',header),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]));
}
