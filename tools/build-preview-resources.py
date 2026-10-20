"""Rebuild browser block models/atlases from the installed, pinned resources. No tile exporter."""
from pathlib import Path
from zipfile import ZipFile
from io import BytesIO
import json,os,hashlib,sys
from PIL import Image
workspace=Path(__file__).resolve().parents[2]
public='--public' in sys.argv
metadata=workspace/'stage-editor-public/dist/block-resources'
out=metadata if public else workspace/'stage-editor-public/artifacts/local-block-resources'
out.mkdir(parents=True,exist_ok=True)
vanilla=Path(os.environ['APPDATA'])/'PrismLauncher/libraries/com/mojang/minecraft/1.21.1/minecraft-1.21.1-client.jar'
jars=[vanilla]+[workspace/'minecraft/mods'/n for n in ['create-1.21.1-6.0.10.jar','copycats-3.0.9+mc.1.21.1-neoforge.jar','createdeco-2.1.3.jar']]
resources={}
for jar in ([] if public else jars):
 with ZipFile(jar) as z:
  for n in z.namelist():
   bits=n.split('/')
   if len(bits)>3 and bits[0]=='assets' and bits[1] in ['minecraft','create','copycats','createdeco'] and bits[2] in ['blockstates','models','textures'] and (n.endswith('.json') or n.endswith('.png') or n.endswith('.mcmeta')):resources[n]=z.read(n)
root=workspace/'lobby-mod/src/main/resources/assets/erosionsector'
for p in root.rglob('*'):
 if p.is_file() and p.parts[len(root.parts)] in ['blockstates','models','textures']:resources['assets/erosionsector/'+p.relative_to(root).as_posix()]=p.read_bytes()
data={'version':1,'sources':['Minecraft 1.21.1','Create 6.0.10','Copycats+ 3.0.9','Create Deco 2.1.3','ES working resources'],'states':{},'models':{},'textures':{},'pages':[]}
if public:
 import re
 version=re.search(r'^mod_version=(.+)$',(workspace/'lobby-mod/gradle.properties').read_text(encoding='utf-8'),re.M).group(1).strip()
 data['sources']=['Erosion Sector '+version]
images=[]
for n,raw in resources.items():
 ns,kind,tail=n.split('/',3)[1:]
 key=ns+':'+tail.rsplit('.',1)[0]
 if n.endswith('.json') and kind in ['blockstates','models']:
  try:data['states' if kind=='blockstates' else 'models'][key]=json.loads(raw)
  except (ValueError,UnicodeDecodeError):pass
 if kind=='textures' and n.endswith('.png') and ('/block/' in n or '/entity/' in n):
  im=Image.open(BytesIO(raw)).convert('RGBA');meta=resources.get(n+'.mcmeta')
  if meta:
   try:
    anim=json.loads(meta).get('animation',{});w=anim.get('width',im.width);h=anim.get('height',w);frame=(anim.get('frames')or[0])[0];frame=frame.get('index',0) if isinstance(frame,dict) else frame
    im=im.crop(((frame%(im.width//w))*w,(frame//(im.width//w))*h,(frame%(im.width//w)+1)*w,(frame//(im.width//w)+1)*h))
   except (ValueError,ZeroDivisionError):pass
  if max(im.size)<=4094:images.append((key,im))
# Missing texture is explicit and shared by unsupported models.
missing=Image.new('RGBA',(16,16),'#111111')
for y in range(16):
 for x in range(16):
  if (x//8+y//8)%2:missing.putpixel((x,y),(235,30,210,255))
images.append(('erosionsector:missing',missing))
images.sort(key=lambda p:p[1].height,reverse=True)
page=Image.new('RGBA',(4096,4096));x=y=row=0;number=0

def save_page():
 global page,number
 stream=BytesIO();page.save(stream,format='PNG');raw=stream.getvalue();name='atlas-'+hashlib.sha256(raw).hexdigest()[:16]+'.png';(out/name).write_bytes(raw);data['pages'].append(name);number+=1;page=Image.new('RGBA',(4096,4096))
for key,im in images:
 w,h=im.size
 if x+w+2>4096:x=0;y+=row;row=0
 if y+h+2>4096:save_page();x=y=row=0
 page.paste(im,(x+1,y+1));data['textures'][key]={'page':number,'x':x+1,'y':y+1,'w':w,'h':h};x+=w+2;row=max(row,h+2)
save_page()
data['ctRules']=json.loads((metadata/'ct-rules.json').read_text(encoding='utf-8'))
data['copycatDefaults']=json.loads((metadata/'copycat-states.json').read_text(encoding='utf-8'))
raw=json.dumps(data,separators=(',',':')).encode();name='models-'+hashlib.sha256(raw).hexdigest()[:16]+'.json';(out/name).write_bytes(raw)
(out/'index.json').write_text(json.dumps({'version':1,'models':name,'sources':data['sources']},ensure_ascii=False),encoding='utf-8')
print(len(data['states']),'blockstates,',len(data['models']),'models,',len(images),'textures,',number,'atlases; JSON',len(raw))

if not public:
 from zipfile import ZIP_DEFLATED
 bundle=workspace/'stage-editor-public/artifacts/block-resources.esresources'
 with ZipFile(bundle,'w',ZIP_DEFLATED) as z:
  for item in ['index.json',name,*data['pages']]:z.write(out/item,item)
 print('Local-only resource pack:',bundle)
