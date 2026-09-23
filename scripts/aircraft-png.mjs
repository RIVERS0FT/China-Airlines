import { inflateSync, deflateSync } from 'node:zlib';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const table = Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};

/** Deliberately narrow: accept only the two 8-bit truecolor formats used by reviewed artwork. */
export function decodePng(bytes){
  if(!bytes.subarray(0,8).equals(signature))throw new Error('Not a PNG');
  let width=0,height=0,channels=0,ended=false;const parts=[];
  for(let p=8;p+12<=bytes.length;){
    const length=bytes.readUInt32BE(p),end=p+12+length;
    if(end>bytes.length)throw new Error('Truncated PNG');
    const type=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,end-4);
    if(crc(bytes.subarray(p+4,end-4))!==bytes.readUInt32BE(end-4))throw new Error(`PNG checksum: ${type}`);
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      channels=data[9]===6?4:data[9]===2?3:0;
      if(length!==13||data[8]!==8||!channels||data[10]||data[11]||data[12]||!width||!height||width*height>16000000)throw new Error('Expected non-interlaced 8-bit RGB or RGBA artwork');
    }else if(type==='IDAT')parts.push(data);
    else if(type==='IEND'){ended=true;break;}
    p=end;
  }
  if(!width||!ended||!parts.length)throw new Error('Incomplete PNG');
  const stride=width*channels,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});
  if(raw.length!==(stride+1)*height)throw new Error('Invalid PNG scanlines');
  const unpacked=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];if(filter>4)throw new Error('Unsupported PNG filter');
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=channels?unpacked[i-channels]:0,b=y?unpacked[i-stride]:0,c=y&&x>=channels?unpacked[i-stride-channels]:0;
      unpacked[i]=(raw[y*(stride+1)+1+x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;
    }
  }
  if(channels===4)return {width,height,data:unpacked};
  const data=Buffer.alloc(width*height*4);
  for(let source=0,target=0;source<unpacked.length;source+=3,target+=4){unpacked.copy(data,target,source,source+3);data[target+3]=255;}
  return {width,height,data};
}
function chunk(type,data){const t=Buffer.from(type),out=Buffer.alloc(data.length+12);out.writeUInt32BE(data.length);t.copy(out,4);data.copy(out,8);out.writeUInt32BE(crc(Buffer.concat([t,data])),out.length-4);return out;}
export function encodePng({width,height,data}){
  if(data.length!==width*height*4)throw new Error('RGBA length mismatch');
  const header=Buffer.alloc(13);header.writeUInt32BE(width);header.writeUInt32BE(height,4);header[8]=8;header[9]=6;
  const stride=width*4,raw=Buffer.alloc((stride+1)*height);
  for(let y=0;y<height;y++){raw[y*(stride+1)]=1;for(let x=0;x<stride;x++)raw[y*(stride+1)+1+x]=(data[y*stride+x]-(x>=4?data[y*stride+x-4]:0))&255;}
  return Buffer.concat([signature,chunk('IHDR',header),chunk('IDAT',deflateSync(raw,{level:6})),chunk('IEND',Buffer.alloc(0))]);
}
