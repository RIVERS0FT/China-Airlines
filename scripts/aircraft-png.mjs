import { inflateSync, deflateSync } from 'node:zlib';

const signature = Buffer.from([137,80,78,71,13,10,26,10]);
const table = Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc(bytes){let n=0xffffffff;for(const b of bytes)n=table[(n^b)&255]^(n>>>8);return (n^0xffffffff)>>>0;}
const paeth=(a,b,c)=>{const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);return pa<=pb&&pa<=pc?a:pb<=pc?b:c;};

/** Deliberately narrow: fail on unsupported art instead of silently converting it. */
export function decodePng(bytes){
  if(!bytes.subarray(0,8).equals(signature))throw new Error('Not a PNG');
  let width=0,height=0,ended=false;const parts=[];
  for(let p=8;p+12<=bytes.length;){
    const length=bytes.readUInt32BE(p),end=p+12+length;
    if(end>bytes.length)throw new Error('Truncated PNG');
    const type=bytes.toString('ascii',p+4,p+8),data=bytes.subarray(p+8,end-4);
    if(crc(bytes.subarray(p+4,end-4))!==bytes.readUInt32BE(end-4))throw new Error(`PNG checksum: ${type}`);
    if(type==='IHDR'){
      width=data.readUInt32BE(0);height=data.readUInt32BE(4);
      if(length!==13||data[8]!==8||data[9]!==6||data[10]||data[11]||data[12]||!width||!height||width*height>16000000)throw new Error('Expected non-interlaced 8-bit RGBA artwork');
    }else if(type==='IDAT')parts.push(data);
    else if(type==='IEND'){ended=true;break;}
    p=end;
  }
  if(!width||!ended||!parts.length)throw new Error('Incomplete PNG');
  const stride=width*4,raw=inflateSync(Buffer.concat(parts),{maxOutputLength:(stride+1)*height});
  if(raw.length!==(stride+1)*height)throw new Error('Invalid PNG scanlines');
  const data=Buffer.alloc(stride*height);
  for(let y=0;y<height;y++){
    const filter=raw[y*(stride+1)];if(filter>4)throw new Error('Unsupported PNG filter');
    for(let x=0;x<stride;x++){
      const i=y*stride+x,a=x>=4?data[i-4]:0,b=y?data[i-stride]:0,c=y&&x>=4?data[i-stride-4]:0;
      data[i]=(raw[y*(stride+1)+1+x]+(filter===1?a:filter===2?b:filter===3?Math.floor((a+b)/2):filter===4?paeth(a,b,c):0))&255;
    }
  }
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
/** One-time legacy registration, with premultiplied-alpha bilinear sampling. */
export function registerLayer(source,canvas,bounds){
  if(![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<=0||bounds.height<=0)throw new Error('Invalid registration');
  const {width,height}=canvas,data=Buffer.alloc(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const sx=(x+.5-bounds.x)/bounds.width*source.width-.5,sy=(y+.5-bounds.y)/bounds.height*source.height-.5;
    const x0=Math.floor(sx),y0=Math.floor(sy),dx=sx-x0,dy=sy-y0;
    let a=0,r=0,g=0,b=0;
    for(let j=0;j<2;j++)for(let k=0;k<2;k++){
      const px=x0+k,py=y0+j;if(px<0||py<0||px>=source.width||py>=source.height)continue;
      const i=(py*source.width+px)*4,w=(k?dx:1-dx)*(j?dy:1-dy)*source.data[i+3]/255;
      a+=w;r+=source.data[i]*w;g+=source.data[i+1]*w;b+=source.data[i+2]*w;
    }
    const i=(y*width+x)*4;if(a>0){data[i]=Math.round(r/a);data[i+1]=Math.round(g/a);data[i+2]=Math.round(b/a);data[i+3]=Math.round(a*255);}
  }
  return {width,height,data};
}
export function composite(base,near){
  if(base.width!==near.width||base.height!==near.height)throw new Error('Layers must share a canvas');
  const data=Buffer.alloc(base.data.length);
  for(let i=0;i<data.length;i+=4){const a=near.data[i+3]/255,b=base.data[i+3]/255*(1-a),sum=a+b;if(sum){for(let c=0;c<3;c++)data[i+c]=Math.round((near.data[i+c]*a+base.data[i+c]*b)/sum);data[i+3]=Math.round(sum*255);}}
  return {width:base.width,height:base.height,data};
}
