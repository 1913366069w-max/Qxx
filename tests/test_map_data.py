"""Geometry regression checks for the actual bundled map, including courtyard holes."""
import json, math, sys, re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'.pydeps'))
from shapely.geometry import Polygon,LineString,shape
from shapely.ops import unary_union,transform
data=json.loads((root/'assets/campus.json').read_text(encoding='utf8'))
checked=0
for item in data['shapes']:
    if 'triangles' not in item:continue
    t=item['triangles'];assert len(t)%6==0
    assert all(math.isfinite(v) for v in t)
    area=sum(abs((t[i+2]-t[i])*(t[i+5]-t[i+1])-(t[i+4]-t[i])*(t[i+3]-t[i+1]))/2 for i in range(0,len(t),6))
    geom=Polygon()
    for ring in item['d'].split('M ')[1:]:
        numbers=[float(v) for v in re.findall(r'-?\d+(?:\.\d+)?',ring)]
        points=list(zip(numbers[::2],numbers[1::2]));geom=geom.symmetric_difference(Polygon(points))
    assert abs(area-geom.area)<max(.03,geom.area*.00005),(checked,area,geom.area)
    checked+=1
geo=json.loads((root/'output/campus-footprints.geojson').read_text(encoding='utf8'))
assert len(geo['features'])==data['buildingCount']==151
new=[f for f in geo['features'] if f['properties'].get('status')]
assert len(new)==3
def all_xy(coords):
    if isinstance(coords[0],(float,int)):yield coords
    else:
        for c in coords:yield from all_xy(c)
for feature in geo['features']:
    for lon,lat in all_xy(feature['geometry']['coordinates']):
        assert 120.408<lon<120.427 and 36.065<lat<36.078,(lon,lat)
assert '蜜雪冰城' in str(data['shops']) and '肯德基' in str(data['shops'])
assert len(data['shops'])>=20
assert any(s['name']=='浮山书店' for s in data['shops'])
assert any('7-ELEVEN' in s['name'] for s in data['shops'])
assert all(s['source'] and s['precision'] and s['liveStatus'] is False for s in data['shops'])
gates=[p for p in data['accessPoints'] if p['kind']=='gate']
tunnels=[p for p in data['accessPoints'] if p['kind']=='underpass']
assert len(gates)==17 and len(tunnels)==4
assert len({p['name'] for p in data['accessPoints']})==21
assert all(p['source'] and p['precision'] and p['liveStatus'] is False for p in data['accessPoints'])
assert all('（约）' not in p['displayName'] for p in data['accessPoints'])
access_labels=[p for p in data['labels'] if p.get('category')=='access_label']
access_by_name={p['name']:p for p in data['accessPoints']}
assert len(access_labels)==21 and {p['accessName'] for p in access_labels}==set(access_by_name)
assert all(math.dist([p['x'],p['y']],[access_by_name[p['accessName']]['x'],access_by_name[p['accessName']]['y']])<25 for p in access_labels)
assert not any(len(s.get('linePoints',[]))==6 and any(math.dist(s['linePoints'][:2],[p['x'],p['y']])<.01 for p in data['accessPoints']) for s in data['shapes'])
poi_names={p['name'] for p in data['pois']}
assert {p['name'] for p in gates if p['name']!='浩园对面铁门'} <= poi_names
assert {p['name'] for p in tunnels} <= poi_names
assert '浩园对面铁门' not in poi_names
assert tunnels[0]['x']<tunnels[1]['x']
assert 40<(tunnels[1]['x']-tunnels[0]['x'])/data['metersToPageUnits']<100
textile=next(f for f in geo['features'] if f['properties']['name']=='新纺织大楼')
assert textile['properties']['official_name']=='东院教学实验楼'
assert textile['properties']['category']=='teaching'
textile_shape=next(s for s in data['shapes'] if s.get('featureId')=='textile-building')
assert textile_shape['fill']=='#fffdec' and textile_shape['category']=='teaching'
assert not any(t in l['text'] for l in data['labels'] for t in ['QINGDAO UNIVERSITY','地理校正版','WGS84 坐标','空心门标','OpenStreetMap'])
assert not any(l['text'] in ('青岛大学','浮山校区') for l in data['labels'])
assert not any(l['text'].replace(' ','') in ('浮山','山海之间·青春正好') for l in data['labels'])
assert not any(t in l['text'] for l in data['labels'] for t in ['润园','沁园'])
assert sum(l['text']=='家属楼区域' for l in data['labels'])==4
family=[f for f in geo['features'] if f['properties'].get('category')=='family_housing']
assert len(family)==34 and all(f['properties']['name']=='家属楼区域' for f in family)
assert sum(s.get('category')=='family_housing' for s in data['shapes'])==34
assert next(f for f in geo['features'] if f['properties'].get('osm_id')==772903231)['properties']['category']=='teach'
assert all(f['properties']['category']=='dorm' for f in new)
assert not any('2026新' in l['text'] or '新建宿舍' in l['text'] for l in data['labels'])
hao=next(p for p in gates if p['name']=='浩园1号门')
marked=[p for p in data['accessPoints'] if 'annotationPixel' in p]
assert len(marked)==3
for p in marked:
    assert p['confidence']=='approximate' and '用户2026-08-28标注图' in p['source'][0]
    # Reprojection must preserve the user's circle centers, within subpixel rounding.
    assert abs((p['x']-hao['x'])*3.66667+85-p['annotationPixel'][0])<.02
    assert abs((p['y']-hao['y'])*3.66667+199-p['annotationPixel'][1])<.02
assert not any('（约）' in p['text'] for p in data['labels'])
assert any(p['text']=='麦岛站（B口）' for p in data['labels'])
assert any(p['name']=='麦岛站（B口）' and p['kind']=='transit' for p in data['pois'])
assert not any(p.get('text')=='麦岛站' for p in data['labels'])
road_labels=[p for p in data['labels'] if p.get('category')=='road_label']
assert {'宁夏路','青大路','青大一路','宁德路','香港东路'} <= {p['text'] for p in road_labels}
assert all(p.get('roadName')==p['text'] and math.isfinite(p['angle']) for p in road_labels)
assert not any(p['text'] in ('宁 夏 路','青 大 路','青 大 一 路') for p in data['labels'])
road_by_name={p['text']:p for p in road_labels}
assert road_by_name['香港东路']['y']>road_by_name['青大路']['y']
road_surfaces=[s for s in data['shapes'] if s.get('category')=='road_surface']
road_casings=[s for s in data['shapes'] if s.get('category')=='road_surface_casing']
assert {s['roadClass'] for s in road_surfaces}=={'major','street','path'}
assert {s['roadClass'] for s in road_casings}=={'major','street','path'}
assert all(s.get('triangles') for s in road_surfaces+road_casings)
search=data['searchEntries'];assert len(search)==19 and sum(bool(e['buildingId']) for e in search)==16
assert next(e for e in search if e['alias']=='西1教')['label']=='博学楼 / 西1教（现代教育技术中心、公共教室）'
assert next(e for e in search if e['alias']=='东12教')['label']=='敏思楼 / 东12教（公共教学楼）'
assert not any(alias in p['text'] for alias in [e['alias'] for e in search] for p in data['labels'])
assert not any(e['label']==p['text'] for e in search for p in data['labels'])
east_gate=next(p for p in gates if p['name']=='东院1号门')
assert data['textileCenter'][0]>east_gate['x']
assert data['textileCenter'][1]<east_gate['y']
assert all(0<p['x']<1280 and 0<p['y']<1048 for p in data['pois'] if p['kind']!='unlocated')
assert all('x' not in p and 'y' not in p for p in data['pois'] if p['kind']=='unlocated')
graph=data['routing']
assert len(graph['buildings'])==86 and graph['passagePairs']==2
assert not any(any(t in b['name'] for t in ['润园','沁园','家属楼']) for b in graph['buildings'])
R=6378137;K=math.cos(math.radians(36.0717))*data['metersToPageUnits']
X0=R*math.radians(120.4082475);Y0=R*math.asinh(math.tan(math.radians(36.0773242)))
def project(x,y,z=None):return 60+(R*math.radians(x)-X0)*K,55+(Y0-R*math.asinh(math.tan(math.radians(y))))*K
blocked=unary_union([transform(project,shape(f['geometry'])) for f in geo['features']]).buffer(-.12)
for a,b,metres,kind in graph['edges']:
    assert 0<=a<len(graph['nodes']) and 0<=b<len(graph['nodes']) and metres>0
    assert abs(math.dist(graph['nodes'][a],graph['nodes'][b])/data['metersToPageUnits']-metres)<.003
    if kind in ('walk','reference','steps'):
        assert LineString([graph['nodes'][a],graph['nodes'][b]]).intersection(blocked).length<.1
assert sum(e[3]=='underpass' for e in graph['edges'])==2
gate_by_name={g['name']:g for g in graph['gates']}
assert {'西院4号门','东院3号门','北院2号门'} <= gate_by_name.keys()
assert graph['gateCorridors']==[['西院4号门','东院3号门'],['东院3号门','北院2号门']]
for left,right in graph['gateCorridors']:
    a,b=gate_by_name[left]['node'],gate_by_name[right]['node']
    assert any({e[0],e[1]}=={a,b} and e[3]=='walk' for e in graph['edges'])
for b in graph['buildings']:
    if b['approach']:assert [b['iconX'],b['iconY']]==b['approach'][0]
    assert b['entranceStatus'] in ('building-edge-reference','user-side-midpoint','user-screenshot')
    assert [b['x'],b['y']]==[b['iconX'],b['iconY']]
    if b['kind']=='teaching' and b['zone']==graph['westCampusZone'] and b['entranceStatus']!='user-screenshot':
        assert b['entranceSide']=='south'
        assert abs(b['iconX']-(b['bounds'][0]+b['bounds'][2])/2)<.002
        assert b['iconY']>=(b['bounds'][1]+b['bounds'][3])/2
    if b['name'] in ('学思楼','敏思楼'):
        assert b['entranceSide']=='north'
        assert abs(b['iconX']-(b['bounds'][0]+b['bounds'][2])/2)<.002
        assert b['iconY']<=(b['bounds'][1]+b['bounds'][3])/2
    if b['approach']:assert LineString(b['approach']).intersection(blocked).length<.1
assert len([b for b in graph['buildings'] if b['entranceStatus']=='user-screenshot'])==17
future=next(b for b in graph['buildings'] if b['name']=='未来研究院')
assert future['id']=='osm-way-772903231' and future['node']>=0
assert not any(b['name']=='科技园D座' for b in graph['buildings'])
assert data['wayfindingReference']['image']=='a5ee68d7bb8c7edc63ec07cb04d58bbb.jpg'
assert len(data['wayfindingReference']['walkways'])==5
assert len(graph['targets'])>=80
assert all(p.get('buildingId') or p.get('routeTargetId') for p in data['pois'] if 'x' in p)
assert all(any(t['id']==p['routeTargetId'] for t in graph['targets']) for p in data['pois'] if p.get('routeTargetId'))
for name in ('西院4号门','东院3号门','北院2号门','西院浩园快递服务大厅','仁园餐厅'):
    assert next(t for t in graph['targets'] if t['name']==name)['node']>=0
west=next(p for p in tunnels if p['name']=='地下通道·西入口')
east=next(p for p in tunnels if p['name']=='地下通道·东入口')
correction=json.loads((root/'research/west-underpass-correction.json').read_text(encoding='utf8'))
assert west['referenceImage']==correction['image']
assert west['cursorPixel']==[436,1182]
assert west['x']<correction['mapOrigin'][0] and west['y']>correction['mapOrigin'][1]
assert math.dist([east['x'],east['y']],[809.3308,633.8026])<.001
assert any(e[3]=='underpass' and min(math.dist(graph['nodes'][n],[west['x'],west['y']]) for n in e[:2])<.002 for e in graph['edges'])
life=data['life'];assert len([p for p in life['places'] if p['kind']=='cafeteria'])==8
dining=[p for p in life['places'] if p['id'].startswith('food-')]
assert len(dining)==7
by_dining={p['name']:p for p in dining}
legacy_counts={'仁园餐厅':29,'浩园餐厅':14,'国际餐厅':5,'滢园餐厅':25,'泓园餐厅':12,'浏园餐厅':4}
assert {name:sum(len(e['dishes']) for e in by_dining[name]['entries']) for name in legacy_counts}==legacy_counts
assert sum(legacy_counts.values())==89
xinyuan_source=json.loads((root/'research/xiaoshenghuo-xinyuan-2026-10-06.json').read_text(encoding='utf8'))
xinyuan=by_dining['莘园餐厅']
assert xinyuan['entries']==xinyuan_source['entries']
assert [entry['title'] for entry in xinyuan['entries']]==['一楼','二楼','三楼']
stalls=[stall for entry in xinyuan['entries'] for stall in entry['stalls']]
assert [len(entry['stalls']) for entry in xinyuan['entries']]==[14,14,1]
assert len(stalls)==29 and sum(len(stall['dishes']) for stall in stalls)==68
assert any(stall['name']=='老蔡早点铺' and any(dish['name']=='酱肉包' for dish in stall['dishes']) for stall in stalls)
assert any(stall['name']=='蹦蹦鸡' and any(dish['name']=='浓郁番茄蹦蹦鸡' for dish in stall['dishes']) for stall in stalls)
assert all('rating' not in obj and 'score' not in obj for obj in [xinyuan,*xinyuan['entries'],*stalls,*(dish for stall in stalls for dish in stall['dishes'])])
assert sum(len(e['dishes']) for e in by_dining['泓园餐厅']['entries'])==12
assert any('擂椒拌饭' in dish for e in by_dining['泓园餐厅']['entries'] for dish in e['dishes'])
underpass=next(p for p in life['places'] if p['id']=='qingda-underpass')
assert [e['title'] for e in underpass['entries']]==['百分糕点房','青大好印文具店','书亦烧仙草','顺利图文','滕小姐鲜果屋','美尚美美发','百文鑫文体超市','饕餮小站便利店','修鞋/配钥匙/修箱包服务点','日用百货店','快印店','办公服务点']
assert '西院 → 东院' in underpass['notice'] and '7:00–22:00' in underpass['notice'] and '23:00' in underpass['notice']
marker=next(m for m in life['markers'] if m['id']=='passage-地下通道·西入口')
assert [marker['x'],marker['y']]==[west['x'],west['y']]
assert life['news']==[] and 'newsPolicy' not in life
assert all(m['placeId'] in {p['id'] for p in life['places']} for m in life['markers'])
south=[s for s in data['shops'] if s.get('street')=='south-gate']
assert [s['name'] for s in south]==['麦当劳','星巴克','霸王茶姬','西村叔叔','一点点','柳州肥姨妈螺蛳粉','红辣椒','煲火火鸡公煲','张亮麻辣烫']
assert not any(re.match(r'^\d{2}\s',m['label']) or m['label']=='快递驿站' for m in life['markers'])
assert not any('菜鸟驿站' in m['label'] for m in life['markers'])
assert all(a['point'][0]>b['point'][0] for a,b in zip(south,south[1:]))
assert all(s['positionBasis']=='user-order-schematic' for s in south[1:])
commercial=data['commercialAreas'][0]
commercial_shape=unary_union([Polygon(r) for r in commercial['rings']])
hong5=transform(project,shape(next(f for f in geo['features'] if f['properties'].get('osm_id')==768055187)['geometry']))
assert commercial_shape.intersection(hong5).area==0
assert not hong5.covers(__import__('shapely').geometry.Point(commercial['anchor']))
assert commercial['anchor'][1]>hong5.centroid.y,'commercial street must be SOUTH of 泓园5号'
assert commercial_shape.intersection(blocked).area<.1
screens=[s for s in data['shops'] if s.get('positionBasis')=='user-map-screenshot']
assert len(screens)==23 and len(data['screenshotReferences']['sheets'])==9
assert all(s['referenceImage'] and len(s['referencePixel'])==2 for s in screens)
assert any(s['name']=='沪上阿姨·精选茶饮' for s in screens)
assert not any(s['name']=='沪上阿姨' for s in data['unlocatedShops'])
guming=next(p for p in life['places'] if p['id']=='screen-guming')
assert [guming['x'],guming['y']]==[788.773,669.432]
assert any(s['name']=='古茗' for s in data['shops'])
assert any(s['name']=='蜜雪冰城（浩园店）' for s in data['shops'])
assert not any(s['name']=='北院便利店（艺靖然商店）' for s in data['shops'])
liuyuan_shop_names=['浏园超市','一支味','再来吧水果店']
assert set(liuyuan_shop_names) <= {s['name'] for s in data['shops']}
liuyuan_shops=[next(p for p in life['places'] if p['name']==name) for name in liuyuan_shop_names]
assert [[p['x'],p['y']] for p in liuyuan_shops]==[[838.848,135.758],[849.615,135.065],[862.809,133.564]]
assert all(a['x']<b['x'] for a,b in zip(liuyuan_shops,liuyuan_shops[1:]))
liuyuan_retail=transform(project,shape(next(f for f in geo['features'] if f['properties'].get('osm_id')==959921808)['geometry']))
assert all(liuyuan_retail.covers(__import__('shapely').geometry.Point(p['x'],p['y'])) for p in liuyuan_shops)
liuyuan_sheet=data['screenshotReferences']['sheets']['liuyuan-shops']
assert liuyuan_sheet['file']=='36d92343f00641c0a37a6cbdfaf7d4e1.jpg' and len(liuyuan_sheet['anchors'])==6
assert [p['name'] for p in data['screenshotReferences']['points'] if p['sheet']=='liuyuan-shops']==liuyuan_shop_names
hao_labels={l['text'] for l in data['labels']}
assert {'浩园12号楼','浩园13号楼','浩园14号楼'} <= hao_labels
assert sum(l['text']=='浩园餐厅' for l in data['labels'])==1
assert not any('浩园1213号' in l['text'] for l in data['labels'])
liuyuan_features={str(f['properties'].get('osm_id')):f['properties']['name'] for f in geo['features'] if f['properties'].get('osm_id') in (987842664,987842665)}
assert liuyuan_features=={'987842664':'浏园D','987842665':'浏园C'}
assert {'浏园C','浏园D'} <= {l['text'] for l in data['labels']}
assert not any(l['text'] in ('浏园C座','浏园D座') for l in data['labels'])
assert not data['unlocatedShops'] and not life['pending']
assert len([s for s in data['shops'] if s['name']=='肯德基（青大店）'])==1
kfc=next(p for p in life['places'] if p['id']=='screen-kfc')
assert kfc['y']>hong5.centroid.y and not hong5.covers(__import__('shapely').geometry.Point(kfc['x'],kfc['y']))
assert '历史推荐' not in next(p for p in life['places'] if p['id']=='screen-qingda-tea')['notice']
assert all(not e['dishes'] for e in next(p for p in life['places'] if p['id']=='screen-qingda-tea')['entries'])
tea_shop=next(p for p in data['shops'] if p['name']=='印象青大茶餐厅')
tea=next(p for p in life['places'] if p['id']=='screen-qingda-tea')
exchange=transform(project,shape(next(f for f in geo['features'] if f['properties'].get('osm_id')==255899635)['geometry']))
assert tea_shop['positionBasis']=='user-building-placement' and 'referenceImage' not in tea_shop
assert tea_shop['location']=='国际学术交流中心内' and tea['summary']=='国际学术交流中心内'
assert exchange.covers(__import__('shapely').geometry.Point(tea['x'],tea['y']))
assert any(p['name']=='青岛大学浮山校区职工医院' for p in data['pois'])
changes=data['commercialShopCorrections']
by_id={p['id']:p for p in life['places']}
assert [by_id['screen-cotti']['x'],by_id['screen-cotti']['y']]==changes['cotti']
assert [by_id['owner-liqun']['x'],by_id['owner-liqun']['y']]==changes['liqun']
for key,pixel in [('kfc',changes['redPixel']),('liqun',changes['bluePixel'])]:
    actual=[changes['pixelAnchor'][i]+(changes[key][i]-changes['mapAnchor'][i])*changes['pixelsPerMapUnit'] for i in (0,1)]
    assert math.dist(actual,pixel)<.001
assert kfc['x']<by_id['owner-romeo']['x']<by_id['owner-luckin']['x']
assert len([s for s in data['shops'] if s['name'].startswith('库迪咖啡')])==1
assert len([s for s in data['shops'] if s['name'].startswith('瑞幸咖啡')])==1
assert len([s for s in data['shops'] if s['name'].startswith('罗密欧')])==1
assert len(data['shops'])==57
video_group=by_id['douyin-20260803-row']
assert [entry['title'] for entry in video_group['entries']]==['森螺螺蛳粉','杨国福麻辣烫','温暖十里新疆番茄米粉']
assert '青大美食街' not in [place['name'] for place in data['pois']]
assert not any(word in label['text'] for label in data['labels'] for word in ('马克思主义学院','青岛大学生公寓宁园','院士楼','浩园教学实验楼'))
assert any(label['text']=='浩园1教' for label in data['labels'])
assert not any(place['name']=='菜鸟驿站（滢园生活区）' for place in data['pois'])
assert next(p for p in life['places'] if p['id']=='screen-haoyuan-parcel')['y']<210
seven=next(p for p in life['places'] if p['id']=='owner-seven-west4')
assert seven['y']>access_by_name['西院4号门']['y'] and seven['y']-access_by_name['西院4号门']['y']<20
private_zones=unary_union([Polygon(rings[0],rings[1:]) for rings in graph['restrictedAreas']])
for a,b,_,kind in graph['edges']:
    assert LineString([graph['nodes'][a],graph['nodes'][b]]).intersection(private_zones.buffer(-.02)).length<.1,(a,b,kind)
print(f'PASS: {checked} meshes; 151 buildings; 19 teaching records; 89 legacy dining listings; 29 莘园 stalls with 68 menu dishes; short access labels; searchable gates/transit; Liuyuan corrections; three-gate corridor; Hong Kong East Road.')
