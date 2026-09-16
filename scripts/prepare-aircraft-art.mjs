import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { decodePng, encodePng, registerLayer, composite } from './aircraft-png.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
const readJson=path=>JSON.parse(readFileSync(resolve(root,path),'utf8'));
function crop(image,rect){
  const {x,y,width,height}=rect;
  if(![x,y,width,height].every(Number.isInteger)||x<0||y<0||width<=0||height<=0||x+width>image.width||y+height>image.height)throw new Error('Invalid source crop');
  const data=Buffer.alloc(width*height*4);
  for(let row=0;row<height;row++)image.data.copy(data,row*width*4,((y+row)*image.width+x)*4,((y+row)*image.width+x+width)*4);
  return {width,height,data};
}
function assertCanvas(image,canvas,label){if(image.width!==canvas.width||image.height!==canvas.height)throw new Error(`${label}: expected ${canvas.width}x${canvas.height}`);}
function hasSamePixels(path,image){
  if(!existsSync(path))return false;
  try{
    const current=decodePng(readFileSync(path));
    return current.width===image.width&&current.height===image.height&&current.data.equals(image.data);
  }catch{return false;}
}
function restoreAlpha(image,mask,label){
  assertCanvas(mask,{width:image.width,height:image.height},`${label} alpha mask`);
  const data=Buffer.from(image.data);
  for(let i=0;i<data.length;i+=4){
    data[i+3]=mask.data[i+3];
    if(data[i+3]===0)data.fill(0,i,i+3);
  }
  return {...image,data};
}

/** No artwork is generated in the browser. The same registered pair creates the preview. */
export function prepareAircraftArt({review=false}={}){
  const format=readJson('src/ui/aircraft-canvas.json'),layouts=readJson('src/ui/aircraft-layer-layouts.json');
  const out=resolve(root,'public/art');mkdirSync(out,{recursive:true});
  const report=[];
  for(const [id,layout] of Object.entries(layouts)){
    let hull,near,full,source;
    const revision=layout.revision??'v4';
    if(layout.pair){
      // v6+ artwork is reviewed as two complete, independently generated views.
      hull=decodePng(readFileSync(resolve(root,layout.pair.cutaway)));
      full=decodePng(readFileSync(resolve(root,layout.pair.exterior)));
      assertCanvas(hull,format.canvas,id);assertCanvas(full,format.canvas,id);source='direct-pair';
    }else if(layout.master){
      // New artwork must be exported from one master, full canvas, at the origin.
      hull=decodePng(readFileSync(resolve(root,layout.master.cutaway)));
      near=decodePng(readFileSync(resolve(root,layout.master.near)));
      assertCanvas(hull,format.canvas,id);assertCanvas(near,format.canvas,id);source='registered-master';
    }else{
      const atlasPath=layout.sourceAtlas??`art/aircraft-layers-v4/${id}-source.png`;
      let atlas=decodePng(readFileSync(resolve(root,atlasPath)));
      assertCanvas(atlas,format.legacyAtlas,id);
      if(layout.alphaMaskAtlas){
        const mask=decodePng(readFileSync(resolve(root,layout.alphaMaskAtlas)));
        atlas=restoreAlpha(atlas,mask,id);
      }
      hull=crop(atlas,format.cutawayCrop);
      near=registerLayer(crop(atlas,format.nearCrop),format.canvas,layout.nearBounds);
      source=layout.sourceAtlas?'capacity-atlas-registration':'legacy-atlas-registration';
    }
    assertCanvas(hull,format.canvas,id);
    if(!full){assertCanvas(near,format.canvas,id);full=composite(hull,near);}
    for(const [kind,image] of [['cutaway',hull],...(near?[['near',near]]:[]),['exterior',full]]){
      const path=resolve(out,`aircraft-${id}-${kind}-${revision}.png`),bytes=encodePng(image);
      // Encoder versions may produce different byte streams for identical pixels.
      // Avoid dirtying reviewed artwork unless the rendered output really changed.
      if(!hasSamePixels(path,image))writeFileSync(path,bytes);
    }
    const entry={id,revision,source,canvas:format.canvas,sha256:createHash('sha256').update(full.data).digest('hex')};report.push(entry);
    if(review){
      const check=Buffer.from(hull.data);
      if(near)for(let i=0;i<check.length;i+=4){const a=near.data[i+3]/255*.5;if(a){check[i]=Math.round(check[i]*(1-a)+near.data[i]*a);check[i+1]=Math.round(check[i+1]*(1-a)+near.data[i+1]*a);check[i+2]=Math.round(check[i+2]*(1-a)+near.data[i+2]*a);check[i+3]=Math.max(check[i+3],near.data[i+3]);}}
      mkdirSync(resolve(root,'artifacts/aircraft-registration'),{recursive:true});
      writeFileSync(resolve(root,`artifacts/aircraft-registration/${id}.png`),encodePng({...hull,data:check}));
    }
  }
  mkdirSync(resolve(root,'artifacts'),{recursive:true});
  writeFileSync(resolve(root,'artifacts/aircraft-registration.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Prepared ${report.length} aircraft: equal canvases, shared origin, complete cutaway/exterior views.`);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareAircraftArt({review:process.argv.includes('--review')});
