import bpy, os, math
from mathutils import Vector
p = r"C:\Users\44752\Desktop\Control Room\data\vehicles\Skoda Octavia RS_852ea89f86e647998b11b7eb9cac6f8a.glb"

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=p)
meshes=[o for o in bpy.context.selected_objects if o.type=='MESH']
print('meshes',len(meshes))

def get_bounds(ms):
  bpy.context.view_layer.update()
  pts=[]
  for m in ms:
    for v in m.bound_box:
      pts.append(m.matrix_world @ Vector(v))
  xs=sorted(q.x for q in pts); ys=sorted(q.y for q in pts); zs=sorted(q.z for q in pts)
  lo=0; hi=len(pts)-1
  if len(pts)>=20:
    lo=int(len(pts)*0.02); hi=int(len(pts)*0.98)-1
  return Vector((xs[lo],ys[lo],zs[lo])), Vector((xs[hi],ys[hi],zs[hi]))

bpy.ops.object.empty_add(location=(0,0,0)); pivot=bpy.context.object
bpy.ops.object.empty_add(location=(0,0,0)); root=bpy.context.object; root.parent=pivot
for m in meshes:
  mw=m.matrix_world.copy(); m.parent=root; m.matrix_world=mw

mn,mx=get_bounds(meshes); sz=mx-mn
print('initial bounds',tuple(round(v,3) for v in mn),tuple(round(v,3) for v in mx),'size',tuple(round(v,3) for v in sz))
if sz.z>max(sz.x,sz.y)*1.2:
  if sz.x>=sz.y: root.rotation_euler=(0,math.radians(90),0)
  else: root.rotation_euler=(math.radians(-90),0,0)
mn,mx=get_bounds(meshes); sz=mx-mn
print('after upright',tuple(round(v,3) for v in mn),tuple(round(v,3) for v in mx),'size',tuple(round(v,3) for v in sz))
center=(mn+mx)/2
root.location += Vector((-center.x,-center.y,-mn.z))
mn,mx=get_bounds(meshes); sz=mx-mn
print('after center',tuple(round(v,3) for v in mn),tuple(round(v,3) for v in mx),'size',tuple(round(v,3) for v in sz))

maxd=max(sz.x,sz.y,sz.z)
s=3.6/maxd
root.scale=(s,s,s)
mn,mx=get_bounds(meshes); sz=mx-mn
print('after scale',tuple(round(v,3) for v in mn),tuple(round(v,3) for v in mx),'size',tuple(round(v,3) for v in sz))

# quick render
scene=bpy.context.scene
scene.render.engine='CYCLES'; scene.cycles.samples=8; scene.render.film_transparent=True
scene.render.resolution_x=512; scene.render.resolution_y=512
scene.render.image_settings.file_format='PNG'; scene.render.image_settings.color_mode='RGBA'

bpy.ops.object.camera_add(location=(8,-2,2)); cam=bpy.context.object; scene.camera=cam
bpy.ops.object.empty_add(location=(0,0,sz.z*0.4)); tgt=bpy.context.object
con=cam.constraints.new(type='TRACK_TO'); con.target=tgt; con.track_axis='TRACK_NEGATIVE_Z'; con.up_axis='UP_Y'
out=r"C:\Users\44752\Desktop\Control Room\data\vehicles\png_icons\_debug_octavia_rs.png"
scene.render.filepath=out
bpy.ops.render.render(write_still=True)
print('saved',out,os.path.exists(out))
