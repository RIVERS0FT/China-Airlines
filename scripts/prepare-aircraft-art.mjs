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

/** No artwork is generated in the browser. The same registered pair creates the preview. */
export function prepareAircraftArt({review=false}={}){
  const format=readJson('src/ui/aircraft-canvas.json'),layouts=readJson('src/ui/aircraft-layer-layouts.json');
  const out=resolve(root,'public/art');mkdirSync(out,{recursive:true});
  const report=[];
  for(const [id,layout] of Object.entries(layouts)){
    let hull,near,source;
    if(layout.master){
      // New artwork must be exported from one master, full canvas, at the origin.
      hull=decodePng(readFileSync(resolve(root,layout.master.cutaway)));
      near=decodePng(readFileSync(resolve(root,layout.master.near)));
      assertCanvas(hull,format.canvas,id);assertCanvas(near,format.canvas,id);source='registered-master';
    }else{
      const atlas=decodePng(readFileSync(resolve(root,`art/aircraft-layers-v4/${id}-source.png`)));
      assertCanvas(atlas,format.legacyAtlas,id);
      hull=crop(atlas,format.cutawayCrop);
      near=registerLayer(crop(atlas,format.nearCrop),format.canvas,layout.nearBounds);
      source='legacy-atlas-registration';
    }
    assertCanvas(hull,format.canvas,id);assertCanvas(near,format.canvas,id);
    const full=composite(hull,near);
    for(const [kind,image] of [['cutaway',hull],['near',near],['exterior',full]]){
      const path=resolve(out,`aircraft-${id}-${kind}-v4.png`),bytes=encodePng(image);
      // Repeated dev/test/build commands are deterministic and do not rewrite equal output.
      if(!existsSync(path)||!readFileSync(path).equals(bytes))writeFileSync(path,bytes);
    }
    const entry={id,source,canvas:format.canvas,sha256:createHash('sha256').update(full.data).digest('hex')};report.push(entry);
    if(review){
      const check=Buffer.from(hull.data);
      for(let i=0;i<check.length;i+=4){const a=near.data[i+3]/255*.5;if(a){check[i]=Math.round(check[i]*(1-a)+near.data[i]*a);check[i+1]=Math.round(check[i+1]*(1-a)+near.data[i+1]*a);check[i+2]=Math.round(check[i+2]*(1-a)+near.data[i+2]*a);check[i+3]=Math.max(check[i+3],near.data[i+3]);}}
      mkdirSync(resolve(root,'artifacts/aircraft-registration'),{recursive:true});
      writeFileSync(resolve(root,`artifacts/aircraft-registration/${id}.png`),encodePng({...hull,data:check}));
    }
  }
  mkdirSync(resolve(root,'artifacts'),{recursive:true});
  writeFileSync(resolve(root,'artifacts/aircraft-registration.json'),JSON.stringify(report,null,2)+'\n');
  console.log(`Prepared ${report.length} aircraft: equal canvases, shared origin, composed previews.`);
  return report;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)prepareAircraftArt({review:process.argv.includes('--review')});
