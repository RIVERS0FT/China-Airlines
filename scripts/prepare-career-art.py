"""Original v2 green-screen sources -> separate transparent runtime sprites."""
from pathlib import Path
from collections import deque
from PIL import Image
import json

ROOT = Path(__file__).resolve().parents[1]
SOURCE, OUTPUT = ROOT/'art/source', ROOT/'public/art'

def key(image):
    image=image.convert('RGBA')
    pixels=[]
    for r,g,b,a in image.get_flattened_data():
        excess=g-max(r,b)
        alpha=round(255*(1-max(0,min(1,(excess-40)/130))))
        pixels.append((r,min(g,max(r,b)) if alpha<255 else g,b,alpha))
    image.putdata(pixels)
    return image

def save(image,name,size):
    box=image.getchannel('A').point(lambda a:255 if a>24 else 0).getbbox()
    assert box,name
    image=image.crop(box);image.thumbnail((size[0]-24,size[1]-24),Image.Resampling.LANCZOS)
    canvas=Image.new('RGBA',size)
    canvas.paste(image,((size[0]-image.width)//2,(size[1]-image.height)//2))
    canvas.save(OUTPUT/name,optimize=True)

planes=key(Image.open(SOURCE/'aircraft-career-green.png'))
# Connected silhouettes avoid cutting a wing where an artist exceeded an equal cell.
w,h=planes.size;mask=bytearray(1 if a>24 else 0 for a in planes.getchannel('A').get_flattened_data());components=[]
for start in range(w*h):
    if not mask[start]:continue
    q=deque([start]);mask[start]=0;points=[]
    while q:
        at=q.popleft();points.append(at);x=at%w
        for near in (at-w if at>=w else -1,at+w if at<(h-1)*w else -1,at-1 if x else -1,at+1 if x<w-1 else -1):
            if near>=0 and mask[near]:mask[near]=0;q.append(near)
    if len(points)>10000:components.append(points)
assert len(components)==6,len(components)
components.sort(key=lambda pts:(min(n//w for n in pts)//300,min(n%w for n in pts)))
for points,name in zip(components,['light-passenger','light-cargo','regional-passenger','regional-cargo','heavy-passenger','heavy-cargo']):
    xs=[n%w for n in points];ys=[n//w for n in points];box=(max(0,min(xs)-2),max(0,min(ys)-2),min(w,max(xs)+3),min(h,max(ys)+3))
    # Component-specific alpha retains antialiased fringes but excludes neighbouring aircraft.
    chosen=set(points);crop=planes.crop(box);px=crop.load()
    for y in range(crop.height):
        for x in range(crop.width):
            index=(y+box[1])*w+x+box[0]
            if index not in chosen and not any(index+off in chosen for off in [-1,1,-w,w]):px[x,y]=(0,0,0,0)
    save(crop,f'aircraft-{name}-v2.png',(1000,450))

props=key(Image.open(SOURCE/'career-props-green.png'));w,h=props.size
cuts=[0,round(h*285/1182),round(h*565/1182),round(h*850/1182),h]
names=['cargo-express','cargo-cold','cargo-industrial','facility-warehouse','facility-factory','facility-design','facility-research','facility-trade']
for i,name in enumerate(names):
    col,row=i%2,i//2
    cell=props.crop((col*w//2,cuts[row],(col+1)*w//2,cuts[row+1]))
    save(cell,f'{name}-v2.png',(384,320) if name.startswith('facility') else (256,256))

manifest=[]
for path in sorted(OUTPUT.glob('*')):
    if path.suffix not in ['.png','.jpg']:continue
    im=Image.open(path);item=dict(file=path.name,width=im.width,height=im.height,bytes=path.stat().st_size,mode=im.mode)
    if im.mode=='RGBA':
        alpha=im.getchannel('A');item.update(alphaRange=list(alpha.getextrema()),transparentPixels=alpha.histogram()[0])
    manifest.append(item)
(ROOT/'art/manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(f'Prepared 14 original sprites; manifest has {len(manifest)} assets.')
