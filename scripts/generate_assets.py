"""Original KESI stationery. Blender 5.1, metres/Z-up/-Y-front; glTF Y-up/+Z-front.
Run blender --background --factory-startup --python scripts/generate_assets.py
Only writes the explicitly named assets under this repository.
"""
import bpy, math, json, os, sys, random
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'public' / 'models'
ICONS = ROOT / 'public' / 'icons'
TEX = ROOT / 'public' / 'textures'
SOURCE = ROOT / 'assets' / 'source'
for folder in (OUT, ICONS, TEX, SOURCE): folder.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.unit_settings.system = 'METRIC'
scene.unit_settings.scale_length = 1
S = 50
def vec(p): return Vector((p[0]/S, -p[2]/S, p[1]/S))
def rgb(hex):
    c = [int(hex[i:i+2],16)/255 for i in (0,2,4)]
    return tuple(((x+.055)/1.055)**2.4 if x>.04045 else x/12.92 for x in c) + (1,)
def material(name, color, rough=.5, metal=0):
    m = bpy.data.materials.new(name); m.diffuse_color = rgb(color); m.use_nodes=True
    bs = m.node_tree.nodes.get('Principled BSDF')
    bs.inputs['Base Color'].default_value=rgb(color); bs.inputs['Roughness'].default_value=rough
    bs.inputs['Metallic'].default_value=metal
    return m
M={
    'Rubber':material('Rubber','F3EEE1',.87), 'Sleeve':material('Sleeve','367AA0',.61),
    'Paper':material('Paper','FFF5D9',.86), 'Ink':material('Ink','263E53',.65),
    'Gold':material('Golden paint','E5AD48',.38,.14),'Coral':material('Coral plastic','ED705B',.33),
    'Teal':material('Teal plastic','4D9D9C',.32),'Blue':material('Blue plastic','6596CF',.3),
    'Pink':material('Pink paper','F2A5AF',.78),'Green':material('Mint plastic','95B9A4',.46),
    'Metal':material('Brushed steel','A6B9C1',.27,.8),'Dark':material('Black coated metal','263944',.4,.4),
    'Wood':material('Cedar wood','C99055',.66),'Graphite':material('Graphite','45494C',.68,.12),
    'Band':material('Amber rubber','D39749',.79),'Tape':material('Frosted tape','DCECC8',.28),
    'Bristle':material('Natural bristles','B98C5D',.93),'Chalk':material('Chalk','F4E5CD',.96),
    'Desk':material('Honey oak','CAA273',.62),'Red':material('Magnet red','DC675D',.3,.3),
    'Floor':material('Cork edges','99764D',.82), 'White':material('White print','FFFCF2',.75),
}

# A shared, original 512px oak texture. Pixel generation makes the export portable.
image = bpy.data.images.new('Original oak grain 512',width=512,height=512)
pixels=[]
for j in range(512):
    for i in range(512):
        n=math.sin(j*.105+math.sin(i*.011)*2.2)*.025+math.sin(j*.68+math.sin(i*.022)*.65)*.009
        base=(.58+n,.386+n*.8,.215+n*.55)
        pixels.extend((*base,1))
image.pixels=pixels; image.filepath_raw=str(TEX/'oak_grain.png'); image.file_format='PNG'; image.save(); image.pack()
tex=M['Desk'].node_tree.nodes.new('ShaderNodeTexImage'); tex.image=image
M['Desk'].node_tree.links.new(tex.outputs['Color'],M['Desk'].node_tree.nodes['Principled BSDF'].inputs['Base Color'])

assets=[]; current=None; root=None
def begin(name):
    global current,root
    current=bpy.data.collections.new(name); scene.collection.children.link(current)
    root=bpy.data.objects.new('mount_origin' if name.startswith('part_') else name,None)
    current.objects.link(root); root.empty_display_size=.003
    assets.append((name,current,root)); return root
def register(o,name,mat=None):
    o.name=name
    for c in list(o.users_collection): c.objects.unlink(o)
    current.objects.link(o); o.parent=root
    if mat: o.data.materials.append(M[mat] if isinstance(mat,str) else mat)
    return o
def finish(o,bevel=0,smooth=True):
    bpy.context.view_layer.objects.active=o
    bpy.ops.object.transform_apply(location=False,rotation=False,scale=True)
    if bevel:
        mod=o.modifiers.new('Soft manufactured edges','BEVEL'); mod.width=bevel/S; mod.segments=3
    if o.type=='MESH' and smooth:
        for f in o.data.polygons: f.use_smooth=True
        mod=o.modifiers.new('Weighted corner normals','WEIGHTED_NORMAL'); mod.keep_sharp=True; mod.weight=50
    return o
def box(name,pos,size,mat='Paper',bevel=.025):
    bpy.ops.mesh.primitive_cube_add(size=1,location=vec(pos)); o=register(bpy.context.object,name,mat)
    o.dimensions=(size[0]/S,size[2]/S,size[1]/S)
    return finish(o,bevel)
def cylinder(name,pos,r,depth,mat='Metal',axis=(0,1,0),vertices=24,r2=None):
    if r2 is None: bpy.ops.mesh.primitive_cylinder_add(vertices=vertices,radius=r/S,depth=depth/S,location=vec(pos))
    else: bpy.ops.mesh.primitive_cone_add(vertices=vertices,radius1=r/S,radius2=r2/S,depth=depth/S,location=vec(pos))
    o=register(bpy.context.object,name,mat)
    direction=vec(axis).normalized(); o.rotation_euler=Vector((0,0,1)).rotation_difference(direction).to_euler()
    return finish(o,.009 if vertices>8 else 0)
def wire(name,points,r=.035,mat='Metal',cyclic=False):
    cu=bpy.data.curves.new(name,'CURVE'); cu.dimensions='3D'; cu.resolution_u=1; cu.bevel_depth=r/S; cu.bevel_resolution=1
    sp=cu.splines.new('POLY'); sp.points.add(len(points)-1)
    for p,co in zip(sp.points,points): p.co=(*vec(co),1)
    sp.use_cyclic_u=cyclic
    o=bpy.data.objects.new(name,cu); current.objects.link(o); o.parent=root; cu.materials.append(M[mat]); return o
def ring(name,pos,outer,inner,depth,mat='Metal',axis='y',steps=32):
    verts=[]
    for side in (-1,1):
        for radius in (outer,inner):
            for i in range(steps):
                a=2*math.pi*i/steps
                p=(radius*math.cos(a),side*depth/2,radius*math.sin(a))
                if axis=='z': p=(p[0],p[2],p[1])
                if axis=='x': p=(p[1],p[0],p[2])
                verts.append(tuple(vec(tuple(p[k]+pos[k] for k in range(3)))))
    faces=[]
    for i in range(steps):
        j=(i+1)%steps
        faces.extend([(i,j,2*steps+j,2*steps+i),(steps+j,steps+i,3*steps+i,3*steps+j),
                      (j,i,steps+i,steps+j),(2*steps+i,2*steps+j,3*steps+j,3*steps+i)])
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); current.objects.link(o); o.parent=root; mesh.materials.append(M[mat]); return finish(o,.009)
def poly(name,points,thick,mat='Paper'):
    verts=[tuple(vec((x,y+side*thick/2,z))) for side in (-1,1) for x,y,z in points]
    n=len(points); faces=[tuple(range(n-1,-1,-1)),tuple(range(n,2*n))]
    faces += [(i,(i+1)%n,(i+1)%n+n,i+n) for i in range(n)]
    mesh=bpy.data.meshes.new(name); mesh.from_pydata(verts,[],faces); mesh.update()
    o=bpy.data.objects.new(name,mesh); current.objects.link(o); o.parent=root; mesh.materials.append(M[mat]); return finish(o,.008)
def label(text,pos,size,mat='Ink',rotation=0):
    cu=bpy.data.curves.new('Printed '+text,'FONT'); cu.body=text; cu.size=size/S; cu.align_x='CENTER'; cu.align_y='CENTER'; cu.resolution_u=2
    o=bpy.data.objects.new('Print '+text,cu); current.objects.link(o); o.parent=root; o.location=vec(pos); o.rotation_euler.z=rotation; cu.materials.append(M[mat]); return o
def adapter():
    box('Universal rubber mounting pad',(0,0,.015),(.28,.19,.21),'Dark',.045)
    box('Snap-in brass tongue',(0,0,-.075),(.18,.11,.14),'Gold',.02)
def graduations(width,z0,z1,y,count=15):
    for i in range(count+1):
        x=-width/2+.08+(width-.16)*i/count
        box('Printed graduation %02d'%i,(x,y,z0),(.014,.004,(z1-z0)*(.75 if i%5==0 else .4)),'Ink',0)

BODY={'standard':(1.3,.6,3),'mini':(1,.4,2.1),'wide':(2,.5,2.7),'round':(1.7,.6,1.9),'tall':(1.3,1.1,2.3),'slim':(.85,.5,3.5)}
for idx,(id,(w,h,l)) in enumerate(BODY.items()):
    begin('body_'+id)
    box('Rubber rounded core',(0,0,0),(w,h,l),'Rubber', min(h*.27,.19) if id!='round' else .285)
    sleeve=M['Sleeve'].copy(); sleeve.name='Sleeve' if idx==0 else 'Sleeve.'+id
    sleeve_color=['367AA0','E4A656','719889','EC8B7D','717CAE','B9849B'][idx]
    sleeve.diffuse_color=rgb(sleeve_color); sleeve.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value=rgb(sleeve_color)
    box('Paper sleeve',(0,.002,-l*.06),(w+.012,h+.015,l*.59),sleeve,.055)
    box('Cream brand panel',(0,h/2+.014,-l*.075),(w*.78,.008,l*.28),'Paper',.025)
    label('KESI',(0,h/2+.021,-l*.065),w*.225)
    label('ERASER',(0,h/2+.021,l*.025),w*.078)
    for stripe in (-1,1): box('Sleeve fine stripe',(0,h/2+.015,-l*.06+stripe*l*.235),(w*.85,.005,.018),'Paper',0)
    for i in range(3): box('Rubber fine surface groove',(w*.24+i*.052,h/2-.001,l*.38),(.01,.004,l*.12),'Paper',0)
    sockets={'front':(0,0,l/2),'back':(0,0,-l/2),'left':(-w/2,0,0),'right':(w/2,0,0),'top_left':(-w*.27,h/2,0),'top_right':(w*.27,h/2,0)}
    for name,p in sockets.items():
        o=bpy.data.objects.new('socket_'+name,None); current.objects.link(o); o.parent=root; o.location=vec(p); o.empty_display_size=.002

begin('part_ruler'); adapter()
box('Rounded translucent ruler',(0,0,.34),(1.8,.12,.65),'Tape',.055)
graduations(1.8,.5,.74,.063)
label('KESI  05',(0,.066,.18),.115)

begin('part_pencil'); adapter()
cylinder('Hexagonal lacquer',(0,0,.69),.13,1.24,'Gold',(0,0,1),6)
cylinder('Sharpened cedar',(0,0,1.44),.13,.3,'Wood',(0,0,1),6,r2=.027)
cylinder('Blunt graphite nib',(0,0,1.635),.028,.09,'Graphite',(0,0,1),6,r2=.014)
box('Pencil paint highlight',(.064,.111,.68),(.036,.008,1.05),'Paper',.002)

begin('part_binder_clip'); adapter()
poly('Folded black steel body',[(-.325,-.2,.08),(.325,-.2,.08),(.255,-.2,.55),(-.255,-.2,.55)],.25,'Dark')
box('Clamping lip',(0,-.19,.57),(.65,.08,.055),'Dark',.025)
for z in (.14,.49):
    wire('Hinged chrome handle', [(-.2,-.04,z),(-.25,.14,z),(-.2,.28,z),(.2,.28,z),(.25,.14,z),(.2,-.04,z)],.024)
    cylinder('Chrome hinge',(0,-.04,z),.035,.57,'Metal',(1,0,0))

begin('part_rubber_band'); adapter()
box('Bumper bracket',(0,0,.15),(.82,.23,.24),'Teal',.04)
for y in (-.14,0,.14):
    pts=[(.5*math.cos(a),y,.35+.26*math.sin(a)) for a in [i*math.tau/32 for i in range(32)]]
    wire('Elastic amber loop',pts,.044,'Band',True)
for x in (-.4,.4): cylinder('Band fixing pin',(x,0,.23),.045,.39,'Metal')

begin('part_sticky_note'); adapter()
for side in (-1,1):
    poly('Folded paper wing',[(0,0,.1),(side*.28,.02,.05),(side*.81,.1,.18),(side*.72,.11,.85),(0,0,.73)],.019,'Pink' if side==1 else 'Gold')
    wire('Paper crease',[(side*.27,.032,.12),(side*.29,.066,.74)],.005,'Paper')
box('Sticky paper root',(0,.018,.36),(.23,.04,.66),'Paper',.013)

begin('part_pen_cap'); adapter()
ring('Hollow cap shell',(0,.065,.46),.21,.158,.63,'Blue','z')
cylinder('Cap closed end',(0,.065,.79),.211,.045,'Blue',(0,0,1))
box('Pocket clip',(0,.286,.42),(.11,.055,.59),'Blue',.025)
box('Spring support',(0,-.205,.27),(.29,.14,.49),'Metal',.033)

begin('part_triangle_ruler'); adapter()
outer=[(-.725,0,.03),(.725,0,.03),(-.725,0,1.35)]
inner=[(-.5,0,.23),(.21,0,.23),(-.5,0,.88)]
for i in range(3): poly('Triangle frame edge '+str(i),[outer[i],outer[(i+1)%3],inner[(i+1)%3],inner[i]],.12,'Tape')
for i in range(11): box('Triangle measurement',( -.63+i*.113,.063,.1),(.014,.003,.07 if i%5 else .12),'Ink',0)
label('45',( -.59,.065,.55),.13)

begin('part_eraser_shield'); adapter()
box('Rounded shield rubber',(0,0,.29),(1.1,.65,.48),'Rubber',.14)
box('Shield paper band',(0,.002,.3),(.47,.66,.47),'Coral',.055)
label('K',(0,.338,.3),.22,'White')

begin('part_tape_roll'); adapter()
ring('Frosted adhesive tape',(0,0,.38),.35,.19,.58,'Tape','x')
ring('Cardboard spool',(0,0,.38),.19,.155,.605,'Paper','x')
box('Tape loose tab',(.29,-.26,.52),(.026,.055,.27),'Tape',.012)

begin('part_correction_tape'); adapter()
box('Rounded correction case',(0,0,.49),(.64,.29,.87),'Green',.13)
box('Clear reel window',(0,.153,.43),(.48,.014,.66),'Tape',.105)
for z,r in ((.26,.18),(.62,.13)):
    ring('Exposed tape reel',(0,.17,z),r,r*.43,.019,'Paper')
    cylinder('Reel axle',(0,.19,z),r*.2,.04,'Gold')
poly('Correction dispensing nose',[(-.24,0,.78),(.24,0,.78),(.11,0,1),(-.11,0,1)],.13,'White')

begin('part_stapler'); adapter()
box('Stapler steel lower jaw',(0,-.14,.56),(.53,.11,1.06),'Metal',.04)
box('Stapler dark magazine',(0,-.04,.56),(.35,.11,.96),'Dark',.023)
upper=box('hinged_upper_handle',(0,.15,.56),(.55,.17,.96),'Coral',.075)
upper.rotation_euler.x=math.radians(-6)
cylinder('Rear hinge pin',(0,.03,.14),.092,.57,'Metal',(1,0,0))
box('Striking nose',(0,.02,1.04),(.38,.22,.1),'Metal',.013)

begin('part_magnet'); adapter()
# Open U contour: two poles and a curved connecting base.
box('Red magnet arm',(-.34,0,.52),(.34,.39,.61),'Red',.06)
box('Blue magnet arm',(.34,0,.52),(.34,.39,.61),'Blue',.06)
box('Magnet rounded bridge',(0,0,.21),(1.02,.39,.3),'Dark',.12)
for x,c,t in ((-.34,'Red','N'),(.34,'Blue','S')):
    box('Bare steel pole',(x,0,.86),(.34,.39,.11),'Metal',.02)
    label(t,(x,.203,.53),.17,'White')

begin('part_paper_clip'); adapter()
pts=[]
pts.extend([(-.29,0,.1),(-.29,0,.99)])
for i in range(13):
    a=math.pi-i*math.pi/12; pts.append((.29*math.cos(a),0,.99+.29*math.sin(a)))
pts.append((.29,0,.28))
for i in range(13):
    a=-i*math.pi/12; pts.append((.2*math.cos(a)+.09,0,.28+.2*math.sin(a)))
pts.append((-.11,0,.95))
for i in range(9):
    a=math.pi-i*math.pi/8; pts.append((.11*math.cos(a),0,.95+.11*math.sin(a)))
pts.append((.11,0,.48))
wire('Continuous bent steel paperclip',pts,.032)

begin('part_sharpener'); adapter()
box('Machined sharpener case',(0,0,.33),(.65,.44,.59),'Metal',.055)
box('Angled cutting plate',(.09,.235,.35),(.23,.032,.48),'Dark',.012)
cylinder('Blade screw',(.1,.26,.33),.043,.026,'Metal')
box('Screw slot',(.1,.276,.33),(.051,.005,.012),'Dark',0)
ring('Pencil entry rim',(-.12,0,.635),.13,.095,.029,'Metal','z')
cylinder('Pencil entry shadow',(-.12,0,.625),.096,.013,'Dark',(0,0,1))
for x in (-.329,.329):
    for z in (.18,.26,.34,.42,.5): box('Grip groove',(x,0,z),(.009,.29,.011),'Dark',0)

begin('part_chalk'); adapter()
cylinder('Powdery chalk',(0,0,.46),.15,.83,'Chalk',(0,0,1),16)
for i in range(4):
    box('Chalk longitudinal scuff',(.09+i*.01,.114,.3+i*.12),(.012,.009,.19),'Paper',0)

begin('part_brush'); adapter()
box('Brush wooden grip',(0,.105,.3),(.85,.19,.5),'Wood',.065)
box('Brass bristle ferrule',(0,.003,.3),(.83,.065,.46),'Gold',.027)
for ix in range(11):
    for iz in range(4): cylinder('Individual bristle tuft',(-.375+ix*.075,-.144,.125+iz*.115),.018,.23,'Bristle',vertices=6)
label('KESI',(0,.205,.3),.11)

begin('part_glue_stick'); adapter()
cylinder('Glue barrel',(0,0,.49),.197,.77,'Paper',(0,0,1))
cylinder('Mint cap',(0,0,.82),.207,.2,'Green',(0,0,1))
cylinder('Twist base',(0,0,.115),.207,.12,'Green',(0,0,1))
for i in range(12):
    a=i*math.tau/12; cylinder('Base grip flute',(.2*math.cos(a),.2*math.sin(a),.11),.012,.085,'Teal',(0,0,1),8)
box('Glue label stripe',(0,.198,.48),(.22,.004,.24),'Green',.015)

begin('part_crayon'); adapter()
cylinder('Crayon wax',(0,0,.46),.146,.82,'Coral',(0,0,1),16)
cylinder('Paper crayon sleeve',(0,0,.44),.153,.58,'Pink',(0,0,1),16)
cylinder('Rounded wax tip',(0,0,.92),.143,.2,'Coral',(0,0,1),16,r2=.045)
for z in (.2,.68): ring('Paper wrapper stripe',(0,0,z),.154,.15,.025,'Ink','z',16)

begin('part_protractor'); adapter()
for i in range(24):
    a=i*math.pi/24; b=(i+1)*math.pi/24
    poly('Semicircle clear scale segment',[(.75*math.cos(a),0,.1+.75*math.sin(a)),(.75*math.cos(b),0,.1+.75*math.sin(b)),(.47*math.cos(b),0,.1+.47*math.sin(b)),(.47*math.cos(a),0,.1+.47*math.sin(a))],.08,'Tape')
    ra=.6 if i%3==0 else .66
    wire('Angle tick',[(ra*math.cos(a),.046,.1+ra*math.sin(a)),(.735*math.cos(a),.046,.1+.735*math.sin(a))],.006,'Ink')
box('Protractor baseline',(0,0,.105),(1.48,.08,.14),'Tape',.023)
label('90',(0,.049,.67),.095)

begin('part_pencil_extender'); adapter()
cylinder('Wood extension handle',(0,0,.96),.139,1.43,'Wood',(0,0,1),16)
ring('Hollow metal collet',(0,0,.22),.16,.118,.39,'Metal','z',24)
ring('Adjustment collar',(0,0,.4),.177,.145,.14,'Dark','z',24)
cylinder('End cap',(0,0,1.675),.141,.05,'Gold',(0,0,1),16)

# Stage models are canonical 1 x 1 x 1 objects, independently scaled by StageSystem.
begin('prop_desk')
box('Oak desktop',(0,.025,0),(1,.95,1),'Desk',.045)
box('Rounded laminated edge',(0,-.42,0),(1.001,.12,1.001),'Floor',.045)
for x in (-.46,.46):
    for z in (-.46,.46): cylinder('Recessed desktop screw',(x,.502,z),.009,.003,'Metal',vertices=12)

begin('prop_book')
box('Ivory page block',(0,0,0),(.95,.85,.94),'Paper',.018)
for y in (-.465,.465): box('Cloth book cover',(0,y,0),(1,.07,1),'Coral',.023)
box('Cloth bound spine',(-.47,0,0),(.06,.97,1),'Coral',.028)
for y in (-.3,-.15,0,.15,.3): box('Page edge line',(.48,y,.005),(.003,.006,.86),'Chalk',0)
label('NOTE',(0,.503,0),.2,'White')

begin('prop_ruler_wall')
box('Desk ruler timber',(0,0,0),(1,1,1),'Wood',.027)
for i in range(21): box('Ruler engraved mark',(-.47+i*.047,.502,-.28),(.008,.004,.34 if i%5==0 else .17),'Ink',0)
label('KESI  /  30',(0,.505,.19),.1)

begin('prop_bridge')
box('Plywood bridge',(0,0,0),(1,1,1),'Desk',.024)
for z in (-.43,-.215,0,.215,.43): box('Board seam',(0,.502,z),(.95,.004,.009),'Floor',0)
for x in (-.44,.44):
    for z in (-.4,.4): cylinder('Bridge countersunk bolt',(x,.504,z),.017,.004,'Metal',vertices=12)

begin('prop_bumper')
cylinder('Elastic bumper body',(0,0,0),.5,1,'Band',vertices=32)
ring('Moulded bumper top ridge',(0,.45,0),.475,.395,.05,'Gold')
cylinder('Central fixing bolt',(0,.505,0),.074,.012,'Metal')

begin('prop_mat')
box('Cutting mat rubber',(0,0,0),(1,1,1),'Teal',.032)
for i in range(9):
    v=-.4+i*.1
    box('Mat grid X',(v,.502,0),(.003,.004,.85),'Green',0)
    box('Mat grid Z',(0,.502,v),(.85,.004,.003),'Green',0)

begin('prop_case')
box('Pencil case base',(0,-.025,0),(1,.95,1),'Blue',.13)
box('Pencil case raised lid',(0,.435,0),(.94,.13,.94),'Teal',.085)
wire('Zipper piping',[(-.43,.29,-.43),(.43,.29,-.43),(.43,.29,.43),(-.43,.29,.43)],.012,'Metal',True)
box('Zipper tab',(.32,.46,.24),(.1,.037,.15),'Gold',.015)

begin('prop_seesaw')
box('Balance plank',(0,0,0),(1,1,1),'Wood',.037)
box('Balance center grip',(0,.502,0),(.2,.009,.97),'Coral',.003)
for x in (-.38,.38): box('Balance grip mark',(x,.502,0),(.025,.009,.82),'Gold',.003)

begin('prop_chair')
box('Rounded plywood seat',(0,.7,0),(3,.25,2.8),'Desk',.2)
box('Plywood backrest',(0,2,-1.15),(3,1.7,.21),'Desk',.2)
for x in (-1.15,1.15):
    for z in (-1.03,1.03): cylinder('Tubular chair leg',(x,-.7,z),.095,2.8,'Metal')
    cylinder('Back support',(x,1.85,-1.16),.085,2.6,'Metal')

begin('prop_lamp')
cylinder('Lamp weighted base',(0,-1.6,0),.75,.19,'Teal',vertices=32)
wire('Bent lamp neck',[(0,-1.5,0),(.2,.45,0),(.25,1.5,.3),(0,1.8,1.1)],.075,'Metal')
cylinder('Spun metal lamp shade',(0,1.48,1.1),.63,.73,'Teal',(0,1,0),32,r2=.26)
cylinder('Warm diffuser',(0,1.1,1.1),.55,.025,'Paper')

# Convert text/curves into exported mesh, retaining the named construction objects in blend.
for name,col,r in assets:
    for o in list(col.objects):
        if o.type in ('CURVE','FONT'):
            bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active=o
            bpy.ops.object.convert(target='MESH')

manifest={'generator':'Blender '+bpy.app.version_string,'units':'metres; uniform game scale 50; glTF +Y up, +Z front','assets':{}}
for name,col,r in assets:
    bpy.ops.object.select_all(action='DESELECT')
    for o in col.objects: o.select_set(True)
    bpy.context.view_layer.objects.active=r
    bpy.ops.export_scene.gltf(filepath=str(OUT/(name+'.glb')),export_format='GLB',use_selection=True,export_apply=True,export_yup=True,export_extras=True)
    lo=[1e9]*3; hi=[-1e9]*3; triangles=0
    for o in col.objects:
        if o.type!='MESH': continue
        evaluated=o.evaluated_get(bpy.context.evaluated_depsgraph_get()); mesh=evaluated.to_mesh(); mesh.calc_loop_triangles(); triangles+=len(mesh.loop_triangles)
        for v in mesh.vertices:
            p=o.matrix_world@v.co; q=(p.x*S,p.z*S,-p.y*S)
            for k in range(3): lo[k]=min(lo[k],q[k]);hi[k]=max(hi[k],q[k])
        evaluated.to_mesh_clear()
    manifest['assets'][name]={'glb':'/models/'+name+'.glb','icon':'/icons/'+name+'.png','triangles':triangles,'boundsGame':{'min':lo,'max':hi},'meshObjects':sum(o.type=='MESH' for o in col.objects),'sourceCollection':name}
    print('EXPORTED',name,triangles,flush=True)
(OUT/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')

# Contact sheet scene and studio preview rig, retained in the editable source.
scene.render.engine='CYCLES'; scene.cycles.samples=16; scene.cycles.use_denoising=True
scene.render.film_transparent=True
scene.render.resolution_x=320;scene.render.resolution_y=320;scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG';scene.render.image_settings.color_mode='RGBA'
scene.world=bpy.data.worlds.new('Warm miniature studio'); scene.world.use_nodes=True
scene.world.node_tree.nodes['Background'].inputs[0].default_value=(.78,.83,.88,1)
scene.world.node_tree.nodes['Background'].inputs[1].default_value=.5
studio=bpy.data.collections.new('Studio lighting and camera');scene.collection.children.link(studio)
def area(name,pos,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size/S
    obj=bpy.data.objects.new(name,data);studio.objects.link(obj);obj.location=vec(pos);obj.rotation_euler=(-obj.location).to_track_quat('-Z','Y').to_euler()
area('Large softbox',(5,9,4),12,7);area('Cool fill',(-5,5,-3),8,6)
camdata=bpy.data.cameras.new('Product camera');cam=bpy.data.objects.new('Product camera',camdata);studio.objects.link(cam);scene.camera=cam;camdata.type='ORTHO';camdata.clip_start=.001;camdata.clip_end=10
scene.view_settings.view_transform='AgX'
for name,col,r in assets: col.hide_render=True
skip='--skip-render' in sys.argv
if not skip:
    for name,col,r in assets:
        col.hide_render=False
        info=manifest['assets'][name]['boundsGame'];lo=info['min'];hi=info['max'];mid=[(lo[k]+hi[k])/2 for k in range(3)]
        span=max(hi[k]-lo[k] for k in range(3))
        target=vec(mid);cam.location=target+vec((span*1.2,span*1.5,span*1.65));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=span*1.48/S
        scene.render.filepath=str(ICONS/(name+'.png'));bpy.ops.render.render(write_still=True);col.hide_render=True
        print('RENDERED',name,flush=True)
for idx,(name,col,r) in enumerate(assets):
    col.hide_render=False;r.location=vec((((idx%6)-2.5)*5,0,((idx//6)-2.5)*5))
target=Vector((0,0,0));cam.location=vec((0,50,27));cam.rotation_euler=(target-cam.location).to_track_quat('-Z','Y').to_euler();camdata.ortho_scale=.77
scene.render.resolution_x=1800;scene.render.resolution_y=1800
if not skip:
    scene.render.filepath=str(SOURCE/'asset_contact_sheet.png');bpy.ops.render.render(write_still=True)
bpy.ops.wm.save_as_mainfile(filepath=str(SOURCE/'kesi_stationery_library.blend'))
print('DONE:',len(assets),'editable collections, GLBs and icons',flush=True)
