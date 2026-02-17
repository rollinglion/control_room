import os
import math
import bpy
import addon_utils

# Force enable LightWave importer addon
addon_name = "io_scene_lwo"

if addon_name not in bpy.context.preferences.addons:
    try:
        addon_utils.enable(addon_name)
        print("Enabled addon:", addon_name)
    except Exception as e:
        print("Failed to enable addon:", e)

INPUT_DIR = r"C:\Users\44752\Desktop\Control Room\gfx\vehicle_icons\extracted"
OUTPUT_DIR = r"C:\Users\44752\Desktop\Control Room\gfx\vehicle_icons\entity_icons"

os.makedirs(OUTPUT_DIR, exist_ok=True)

print("Scanning for LWO files in:", INPUT_DIR)

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def setup_render(output_path):
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'
    scene.render.filepath = output_path
    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'
    scene.render.film_transparent = True
    scene.render.resolution_x = 256
    scene.render.resolution_y = 256

def setup_camera():
    cam_data = bpy.data.cameras.new("Camera")
    cam = bpy.data.objects.new("Camera", cam_data)
    bpy.context.collection.objects.link(cam)
    bpy.context.scene.camera = cam

    cam.location = (4, -4, 3)
    cam.rotation_euler = (math.radians(60), 0, math.radians(45))

def setup_light():
    light_data = bpy.data.lights.new(name="Light", type='AREA')
    light = bpy.data.objects.new(name="Light", object_data=light_data)
    bpy.context.collection.objects.link(light)
    light.location = (5, -5, 5)

def find_lwo_files(folder):
    lwo_files = []
    for root, dirs, files in os.walk(folder):
        for file in files:
            if file.lower().endswith(".lwo"):
                full_path = os.path.join(root, file)
                lwo_files.append(full_path)
                print("Found:", full_path)
    return lwo_files

files = find_lwo_files(INPUT_DIR)

print(f"\nTotal LWO files found: {len(files)}\n")

if len(files) == 0:
    print("ERROR: No LWO files found. Check INPUT_DIR.")
    exit()

for filepath in files:

    filename = os.path.basename(filepath)
    output_path = os.path.join(
        OUTPUT_DIR,
        filename.replace(".lwo", ".png")
    )

    print("Rendering:", filename)

    clear_scene()

    bpy.ops.import_scene.lwo(filepath=filepath)

    # Get first object
    obj = bpy.context.selected_objects[0]

    # Center object
    obj.location = (0, 0, 0)

    setup_camera()
    setup_light()
    setup_render(output_path)

    bpy.ops.render.render(write_still=True)

print("\nDONE — Icons saved to:", OUTPUT_DIR)
