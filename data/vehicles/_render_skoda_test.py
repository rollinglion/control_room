import bpy
import os
import math
import re
from pathlib import Path
from mathutils import Vector

# =====================================================
# CONFIG
# =====================================================

INPUT_DIR = r"C:\Users\44752\Desktop\Control Room\data\vehicles\sketchfab_collection"
OUTPUT_DIR = os.path.join(INPUT_DIR, "png_icons")

HDRI_PATH = r"C:\Users\44752\Desktop\Control Room\assets\studio_small_08_4k.exr"

RENDER_SIZE = 512

FRAME_MARGIN = 2.45
TARGET_MAX_DIM = 3.6
# Target card-like camera pose:
# - slightly above bonnet height (not top-down)
# - front-left three-quarter with nose pointing left
CAMERA_ELEVATION_DEG = 15.0
CAMERA_AZIMUTH_DEG = 190.0
CAMERA_TARGET_Z_RATIO = 0.40
DESIRED_HEADING_DEG = 150.0
FRONT_FLIP_NAMES = {
    "1971 Škoda 110 Super Sport LP",
    "1981 Škoda Ferat LP",
}

STATIC_OBJECT_NAMES = {"RenderCam", "RenderTarget", "Key", "Fill", "Rim"}
SAMPLES = int(os.environ.get("RENDER_SAMPLES", "48") or "48")
MAX_BOUNCES = int(os.environ.get("RENDER_MAX_BOUNCES", "12") or "12")
USE_ADAPTIVE_SAMPLING = os.environ.get("RENDER_USE_ADAPTIVE", "0").strip() in {"1", "true", "True"}
ADAPTIVE_THRESHOLD = float(os.environ.get("RENDER_ADAPTIVE_THRESHOLD", "0.01") or "0.01")
USE_CPU_WITH_GPU = os.environ.get("RENDER_USE_CPU_WITH_GPU", "0").strip() in {"1", "true", "True"}
PREFERRED_BACKEND = os.environ.get("RENDER_BACKEND", "").strip().upper()
RENDER_THREADS = int(os.environ.get("RENDER_THREADS", "0") or "0")
RENDER_COLOR_VARIANTS = os.environ.get("RENDER_COLOR_VARIANTS", "").strip()

PAINT_VARIANTS = {
    "blue": (0.12, 0.28, 0.82),
    "black": (0.14, 0.14, 0.14),
    "silver": (0.76, 0.76, 0.78),
    "red": (0.83, 0.16, 0.16),
    "green": (0.14, 0.52, 0.24),
    "yellow": (0.92, 0.72, 0.12),
    "white": (0.93, 0.93, 0.93),
}

os.makedirs(OUTPUT_DIR, exist_ok=True)

# =====================================================
# CLEAN NAME
# =====================================================


def clean_name(path):
    name = os.path.splitext(os.path.basename(path))[0]
    name = re.sub(r'_[0-9a-f]{32}$', '', name, flags=re.IGNORECASE)
    return name


# =====================================================
# SCENE
# =====================================================


def clear_scene():
    # Keep static camera/lights; remove model data blocks directly (faster than ops).
    for obj in list(bpy.data.objects):
        if obj.get("_render_static") or obj.name in STATIC_OBJECT_NAMES:
            continue
        bpy.data.objects.remove(obj, do_unlink=True)

    for coll in list(bpy.data.collections):
        if coll == bpy.context.scene.collection:
            continue
        if not coll.objects and coll.users <= 1:
            bpy.data.collections.remove(coll)

    # Prevent datablock buildup when processing many files.
    try:
        bpy.data.orphans_purge(do_recursive=True)
    except Exception:
        pass


def configure_cycles_device():
    scene = bpy.context.scene
    scene.cycles.device = 'GPU'
    selected_backend = None
    gpu_found = False
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        backends = ("OPTIX", "CUDA", "HIP", "METAL", "ONEAPI")
        if PREFERRED_BACKEND and PREFERRED_BACKEND in backends:
            backends = (PREFERRED_BACKEND,) + tuple(b for b in backends if b != PREFERRED_BACKEND)
        for backend in backends:
            try:
                prefs.compute_device_type = backend
                prefs.get_devices()
            except Exception:
                continue
            has_non_cpu = False
            for dev in prefs.devices:
                use_dev = (dev.type != 'CPU') or USE_CPU_WITH_GPU
                dev.use = use_dev
                has_non_cpu = has_non_cpu or (dev.type != 'CPU' and use_dev)
            if has_non_cpu:
                gpu_found = True
                selected_backend = backend
                break
    except Exception:
        gpu_found = False

    if not gpu_found:
        scene.cycles.device = 'CPU'
    return selected_backend, scene.cycles.device


def configure_threads(scene):
    if RENDER_THREADS > 0:
        scene.render.threads_mode = 'FIXED'
        scene.render.threads = RENDER_THREADS
    else:
        scene.render.threads_mode = 'AUTO'


def setup_render():
    scene = bpy.context.scene

    scene.render.engine = 'CYCLES'
    scene.render.use_persistent_data = True
    backend, device_mode = configure_cycles_device()
    configure_threads(scene)
    scene.cycles.samples = max(1, SAMPLES)
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = USE_ADAPTIVE_SAMPLING
    if USE_ADAPTIVE_SAMPLING:
        scene.cycles.adaptive_threshold = max(0.0, ADAPTIVE_THRESHOLD)
    scene.cycles.max_bounces = max(1, MAX_BOUNCES)

    scene.render.resolution_x = RENDER_SIZE
    scene.render.resolution_y = RENDER_SIZE

    scene.render.film_transparent = True

    scene.render.image_settings.file_format = 'PNG'
    scene.render.image_settings.color_mode = 'RGBA'

    print(
        "Render engine:",
        f"device={device_mode}",
        f"backend={backend or 'CPU/auto'}",
        f"samples={scene.cycles.samples}",
        f"adaptive={scene.cycles.use_adaptive_sampling}",
        f"max_bounces={scene.cycles.max_bounces}",
        f"threads_mode={scene.render.threads_mode}",
        f"threads={scene.render.threads if scene.render.threads_mode == 'FIXED' else 'auto'}",
    )


def setup_hdri():
    world = bpy.context.scene.world

    if world is None:
        world = bpy.data.worlds.new("World")
        bpy.context.scene.world = world

    world.use_nodes = True

    nodes = world.node_tree.nodes
    links = world.node_tree.links

    nodes.clear()

    env = nodes.new("ShaderNodeTexEnvironment")
    env.image = bpy.data.images.load(HDRI_PATH, check_existing=True)

    bg = nodes.new("ShaderNodeBackground")
    bg.inputs["Strength"].default_value = 1.05

    out = nodes.new("ShaderNodeOutputWorld")

    links.new(env.outputs["Color"], bg.inputs["Color"])
    links.new(bg.outputs["Background"], out.inputs["Surface"])


def add_area_light(name, location, rotation, energy, size):
    data = bpy.data.lights.new(name=name, type='AREA')
    data.energy = energy
    data.shape = 'RECTANGLE'
    data.size = size
    data.size_y = size * 0.6

    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj["_render_static"] = True
    obj.location = location
    obj.rotation_euler = rotation


def setup_studio_lights():
    add_area_light(
        "Key",
        location=(5.2, -5.8, 4.5),
        rotation=(math.radians(62), 0.0, math.radians(48)),
        energy=1500.0,
        size=3.2,
    )
    add_area_light(
        "Fill",
        location=(-3.8, 4.0, 2.8),
        rotation=(math.radians(70), 0.0, math.radians(-132)),
        energy=700.0,
        size=2.6,
    )
    add_area_light(
        "Rim",
        location=(-5.0, 1.5, 5.3),
        rotation=(math.radians(58), 0.0, math.radians(-70)),
        energy=1100.0,
        size=2.2,
    )


# =====================================================
# CAMERA
# =====================================================


def setup_camera():
    bpy.ops.object.camera_add(location=(6.0, -6.0, 3.0))

    cam = bpy.context.object
    cam.name = "RenderCam"
    cam["_render_static"] = True
    bpy.context.scene.camera = cam

    cam.data.lens = 72

    bpy.ops.object.empty_add(location=(0.0, 0.0, 1.0))
    target = bpy.context.object
    target.name = "RenderTarget"
    target["_render_static"] = True

    con = cam.constraints.new(type='TRACK_TO')
    con.target = target
    con.track_axis = 'TRACK_NEGATIVE_Z'
    con.up_axis = 'UP_Y'

    return cam, target


# =====================================================
# IMPORT + RIG
# =====================================================


def import_model(path):
    bpy.ops.import_scene.gltf(filepath=path)
    return [obj for obj in bpy.context.selected_objects if obj.type == 'MESH']


def split_suspicious_loose_parts(meshes):
    # Some GLBs bundle far-apart chunks into one mesh, which destroys framing.
    # For clearly suspicious long meshes, separate loose islands so we can
    # keep only the dominant vehicle cluster.
    long_meshes = []
    for m in meshes:
        d = m.dimensions
        if max(float(d.x), float(d.y), float(d.z)) >= 12.0:
            long_meshes.append(m)

    if not long_meshes:
        return meshes

    view_layer = bpy.context.view_layer
    for m in long_meshes:
        if m.type != 'MESH' or m.data is None or len(m.data.polygons) == 0:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        m.select_set(True)
        view_layer.objects.active = m
        try:
            bpy.ops.object.mode_set(mode='EDIT')
            bpy.ops.mesh.select_all(action='SELECT')
            bpy.ops.mesh.separate(type='LOOSE')
        except Exception:
            pass
        finally:
            try:
                bpy.ops.object.mode_set(mode='OBJECT')
            except Exception:
                pass

    bpy.context.view_layer.update()
    return [obj for obj in bpy.context.scene.objects if obj.type == 'MESH']


def create_rig(meshes):
    bpy.ops.object.empty_add(location=(0, 0, 0))
    pivot = bpy.context.object
    pivot.name = "YawPivot"

    bpy.ops.object.empty_add(location=(0, 0, 0))
    root = bpy.context.object
    root.name = "ModelRoot"
    root.parent = pivot

    for mesh in meshes:
        mw = mesh.matrix_world.copy()
        mesh.parent = root
        mesh.matrix_world = mw

    return pivot, root


# =====================================================
# BOUNDS / PLACEMENT
# =====================================================


def _primary_meshes(meshes):
    # Keep only the dominant connected cluster of meaningful meshes.
    if not meshes:
        return []
    info = []
    max_dim = 0.0
    max_vol = 0.0
    for m in meshes:
        d = m.dimensions
        mx = max(float(d.x), float(d.y), float(d.z))
        if mx <= 1e-4:
            continue
        vol = max(0.0, float(d.x) * float(d.y) * float(d.z))
        c = m.matrix_world.translation.copy()
        diag = math.sqrt(float(d.x * d.x + d.y * d.y + d.z * d.z))
        max_dim = max(max_dim, mx)
        max_vol = max(max_vol, vol)
        info.append((m, mx, vol, c, diag))

    if not info:
        return meshes

    # Pick one dense local cluster around a strong seed (prevents chain-linking
    # across distant duplicate cars / detached artifacts).
    seed_indices = [
        i for i, (_, mx, vol, _, _) in enumerate(info)
        if mx >= max_dim * 0.18 or vol >= max_vol * 0.03
    ]
    if not seed_indices:
        seed_indices = list(range(len(info)))

    def neighborhood(seed_idx):
        _, _, _, c0, d0 = info[seed_idx]
        radius = max(0.55, d0 * 1.45)
        local = []
        score = 0.0
        for i, (_, mx, vol, c, d) in enumerate(info):
            lim = radius + d * 0.70
            if (c - c0).length <= lim:
                local.append(i)
                score += vol + (mx * mx * mx * 0.03)
        return local, score

    best_ids = []
    best_score = -1.0
    for si in seed_indices:
        ids, score = neighborhood(si)
        if score > best_score:
            best_score = score
            best_ids = ids

    keep_ids = set(best_ids)

    keep = []
    for idx in sorted(keep_ids):
        m, mx, vol, _, _ = info[idx]
        if mx >= max_dim * 0.03 and vol >= max_vol * 0.0002:
            keep.append(m)
    return keep if keep else meshes


def get_bounds(meshes, clip=0.02):
    bpy.context.view_layer.update()

    points = []
    for mesh in meshes:
        for v in mesh.bound_box:
            points.append(mesh.matrix_world @ Vector(v))

    if not points:
        return Vector((0, 0, 0)), Vector((0, 0, 0))

    xs = sorted(p.x for p in points)
    ys = sorted(p.y for p in points)
    zs = sorted(p.z for p in points)
    n = len(points)

    lo = 0
    hi = n - 1
    if n >= 20 and clip > 0.0:
        lo = max(0, int(n * clip))
        hi = min(n - 1, int(n * (1.0 - clip)) - 1)

    minv = Vector((xs[lo], ys[lo], zs[lo]))
    maxv = Vector((xs[hi], ys[hi], zs[hi]))

    return minv, maxv


def auto_upright(root, meshes):
    minv, maxv = get_bounds(meshes, clip=0.0)
    size = maxv - minv
    if size.z <= max(size.x, size.y) * 1.2:
        return

    # Common bad import cases: cars standing on nose/side.
    if size.x >= size.y:
        root.rotation_euler = (0.0, math.radians(90.0), 0.0)
    else:
        root.rotation_euler = (math.radians(-90.0), 0.0, 0.0)

    bpy.context.view_layer.update()


def center_and_scale(root, meshes):
    minv, maxv = get_bounds(meshes)

    center = (minv + maxv) / 2
    size = maxv - minv

    root.location += Vector((-center.x, -center.y, -minv.z))

    max_dim = max(size.x, size.y, size.z)
    if max_dim > 0:
        s = TARGET_MAX_DIM / max_dim
        # Keep translation consistent with scaling: p' = s * (p + shift).
        root.location *= s
        root.scale = (root.scale.x * s, root.scale.y * s, root.scale.z * s)


def get_bbox_points(meshes):
    pts = []
    for mesh in meshes:
        for v in mesh.bound_box:
            pts.append(mesh.matrix_world @ Vector(v))
    return pts


def estimate_forward_axis_heading(meshes):
    minv, maxv = get_bounds(meshes)
    pts = get_bbox_points(meshes)
    sx = maxv.x - minv.x
    sy = maxv.y - minv.y

    if sx >= sy:
        pad = sx * 0.22
        plus = [p.z for p in pts if p.x >= (maxv.x - pad)]
        minus = [p.z for p in pts if p.x <= (minv.x + pad)]
        z_plus = sum(plus) / len(plus) if plus else 0.0
        z_minus = sum(minus) / len(minus) if minus else 0.0
        return 0.0 if z_plus < z_minus else 180.0

    pad = sy * 0.22
    plus = [p.z for p in pts if p.y >= (maxv.y - pad)]
    minus = [p.z for p in pts if p.y <= (minv.y + pad)]
    z_plus = sum(plus) / len(plus) if plus else 0.0
    z_minus = sum(minus) / len(minus) if minus else 0.0
    return 90.0 if z_plus < z_minus else -90.0


def fix_orientation(root, meshes, model_name):
    # Many sources use +X or +Y as forward. Pick the dominant horizontal axis
    # and rotate toward a consistent front-left presentation heading.
    axis_heading = estimate_forward_axis_heading(meshes)
    yaw = DESIRED_HEADING_DEG - axis_heading
    if model_name in FRONT_FLIP_NAMES:
        yaw += 180.0
    root.rotation_euler = (0.0, 0.0, math.radians(yaw))


def place_camera(cam, target, meshes):
    minv, maxv = get_bounds(meshes)
    size = maxv - minv

    max_dim = max(size.x, size.y, size.z)
    dist = max_dim * FRAME_MARGIN

    az = math.radians(CAMERA_AZIMUTH_DEG)
    el = math.radians(CAMERA_ELEVATION_DEG)
    horiz = dist * math.cos(el)
    cam.location = (
        horiz * math.cos(az),
        horiz * math.sin(az),
        dist * math.sin(el),
    )
    target.location = (0.0, 0.0, minv.z + (size.z * CAMERA_TARGET_Z_RATIO))


# =====================================================
# RENDER
# =====================================================


def render_icon(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    if not os.path.exists(path):
        rr = bpy.data.images.get("Render Result")
        if rr is not None:
            rr.save_render(path)


def rendered_has_alpha(path):
    if not os.path.exists(path):
        return False
    img = bpy.data.images.load(path, check_existing=True)
    px = img.pixels
    ok = False
    for i in range(3, len(px), 4):
        if px[i] > 0.02:
            ok = True
            break
    bpy.data.images.remove(img)
    return ok


def keep_largest_alpha_island(path, alpha_threshold=0.03, min_component_pixels=180):
    if not os.path.exists(path):
        return
    img = bpy.data.images.load(path, check_existing=True)
    w, h = img.size
    total = w * h
    px = list(img.pixels)
    mask = [False] * total
    for i in range(total):
        if px[i * 4 + 3] > alpha_threshold:
            mask[i] = True

    visited = [False] * total
    best = []

    for i in range(total):
        if visited[i] or not mask[i]:
            continue
        comp = []
        stack = [i]
        visited[i] = True
        while stack:
            cur = stack.pop()
            comp.append(cur)
            x = cur % w
            y = cur // w
            nbs = []
            if x > 0:
                nbs.append(cur - 1)
            if x < w - 1:
                nbs.append(cur + 1)
            if y > 0:
                nbs.append(cur - w)
            if y < h - 1:
                nbs.append(cur + w)
            for nb in nbs:
                if not visited[nb] and mask[nb]:
                    visited[nb] = True
                    stack.append(nb)
        if len(comp) > len(best):
            best = comp

    if len(best) < min_component_pixels:
        bpy.data.images.remove(img)
        return

    keep = set(best)
    changed = False
    for i in range(total):
        if i in keep:
            continue
        a_idx = i * 4 + 3
        if px[a_idx] > 0.0:
            px[i * 4 + 0] = 0.0
            px[i * 4 + 1] = 0.0
            px[i * 4 + 2] = 0.0
            px[a_idx] = 0.0
            changed = True

    # Optional normalization for pathological renders: if the largest component
    # is still tiny/off-center, reframe it in 2D.
    xs = [i % w for i in keep]
    ys = [i // w for i in keep]
    min_x = min(xs)
    max_x = max(xs)
    min_y = min(ys)
    max_y = max(ys)
    comp_w = max_x - min_x + 1
    comp_h = max_y - min_y + 1
    comp_area_ratio = len(best) / float(total)
    cx = (min_x + max_x) * 0.5
    cy = (min_y + max_y) * 0.5
    center_dx = abs(cx - (w * 0.5)) / float(w)
    center_dy = abs(cy - (h * 0.5)) / float(h)
    needs_normalize = comp_area_ratio < 0.12 or center_dx > 0.22 or center_dy > 0.22

    if needs_normalize and comp_w > 0 and comp_h > 0:
        target = int(min(w, h) * 0.68)
        scale = min(target / float(comp_w), target / float(comp_h))
        out_w = max(1, int(round(comp_w * scale)))
        out_h = max(1, int(round(comp_h * scale)))
        off_x = (w - out_w) // 2
        off_y = (h - out_h) // 2
        new_px = [0.0] * len(px)
        for dy in range(out_h):
            sy = min_y + int(dy / scale)
            if sy < min_y or sy > max_y:
                continue
            for dx in range(out_w):
                sx = min_x + int(dx / scale)
                if sx < min_x or sx > max_x:
                    continue
                sidx = sy * w + sx
                if sidx not in keep:
                    continue
                didx = (off_y + dy) * w + (off_x + dx)
                s4 = sidx * 4
                d4 = didx * 4
                a = px[s4 + 3]
                if a <= 0.0:
                    continue
                new_px[d4 + 0] = px[s4 + 0]
                new_px[d4 + 1] = px[s4 + 1]
                new_px[d4 + 2] = px[s4 + 2]
                new_px[d4 + 3] = a
        px = new_px
        changed = True

    if changed:
        img.pixels[:] = px
        img.filepath_raw = path
        img.file_format = 'PNG'
        img.save()

    bpy.data.images.remove(img)


def force_opaque_materials(meshes):
    for m in meshes:
        for slot in m.material_slots:
            mat = slot.material
            if mat is None:
                continue
            if hasattr(mat, "blend_method"):
                mat.blend_method = 'OPAQUE'
            if mat.use_nodes and mat.node_tree:
                for node in mat.node_tree.nodes:
                    if node.type == 'BSDF_PRINCIPLED' and "Alpha" in node.inputs:
                        alpha_input = node.inputs["Alpha"]
                        if alpha_input.is_linked:
                            for link in list(alpha_input.links):
                                mat.node_tree.links.remove(link)
                        node.inputs["Alpha"].default_value = 1.0


def _is_glass_like_material(mat):
    n = (mat.name or "").lower()
    keywords = ("glass", "window", "windscreen", "windshield", "visor")
    if any(k in n for k in keywords):
        return True
    if not (mat.use_nodes and mat.node_tree):
        return False
    for node in mat.node_tree.nodes:
        if node.type == 'BSDF_PRINCIPLED':
            transmission_input = node.inputs.get("Transmission")
            if transmission_input is None:
                transmission_input = node.inputs.get("Transmission Weight")
            transmission = float(transmission_input.default_value) if transmission_input is not None else 0.0
            alpha_input = node.inputs.get("Alpha")
            alpha = float(alpha_input.default_value) if alpha_input is not None else 1.0
            if transmission > 0.20 or alpha < 0.98:
                return True
    return False


def sanitize_materials_for_icons(meshes):
    # Keep true glass/window shaders; force everything else opaque so body/tyres
    # do not blend through each other on problematic GLBs.
    seen = set()
    for m in meshes:
        for slot in m.material_slots:
            mat = slot.material
            if mat is None or mat in seen:
                continue
            seen.add(mat)
            glass_like = _is_glass_like_material(mat)
            if hasattr(mat, "blend_method"):
                mat.blend_method = 'BLEND' if glass_like else 'OPAQUE'
            if hasattr(mat, "shadow_method"):
                mat.shadow_method = 'HASHED' if glass_like else 'OPAQUE'
            if not (mat.use_nodes and mat.node_tree):
                continue
            for node in mat.node_tree.nodes:
                if node.type != 'BSDF_PRINCIPLED' or "Alpha" not in node.inputs:
                    continue
                alpha_input = node.inputs["Alpha"]
                if glass_like:
                    continue
                if alpha_input.is_linked:
                    for link in list(alpha_input.links):
                        mat.node_tree.links.remove(link)
                alpha_input.default_value = 1.0


def parse_color_variants(raw):
    s = str(raw or "").strip().lower()
    if not s:
        return []
    if s == "all":
        return list(PAINT_VARIANTS.items())
    out = []
    for token in s.split(","):
        name = token.strip()
        if not name:
            continue
        if name in PAINT_VARIANTS:
            out.append((name, PAINT_VARIANTS[name]))
    seen = set()
    dedup = []
    for name, rgb in out:
        if name in seen:
            continue
        seen.add(name)
        dedup.append((name, rgb))
    return dedup


def _collect_material_usage(meshes):
    usage = {}
    for m in meshes:
        if m.type != 'MESH' or m.data is None:
            continue
        slots = m.material_slots
        if not slots:
            continue
        for poly in m.data.polygons:
            idx = int(poly.material_index)
            if idx < 0 or idx >= len(slots):
                continue
            mat = slots[idx].material
            if mat is None:
                continue
            usage[mat] = usage.get(mat, 0) + 1
    return usage


def find_body_materials(meshes, max_mats=3):
    usage = _collect_material_usage(meshes)
    if not usage:
        return []

    positive = {
        "body", "paint", "carpaint", "car_paint", "exterior", "coachwork",
        "bodywork", "bonnet", "hood", "door", "fender", "panel",
    }
    negative = {
        "glass", "window", "windscreen", "windshield", "visor", "tire", "tyre",
        "wheel", "rim", "brake", "disc", "caliper", "interior", "seat", "dash",
        "dashboard", "cockpit", "engine", "grille", "grill", "light", "lamp",
        "headlight", "headlamp", "taillight", "tail", "exhaust", "rubber", "chrome",
    }

    ranked = []
    for mat, faces in usage.items():
        n = (mat.name or "").lower()
        if _is_glass_like_material(mat):
            continue
        if any(k in n for k in negative):
            continue
        ranked.append((mat, faces, any(k in n for k in positive)))

    if not ranked:
        ranked = [(mat, faces, False) for mat, faces in usage.items() if not _is_glass_like_material(mat)]
    if not ranked:
        return []

    ranked.sort(key=lambda t: t[1], reverse=True)

    by_name = [mat for mat, _, pos in ranked if pos]
    picks = by_name[:max_mats]

    if not picks:
        picks = [ranked[0][0]]
        if len(ranked) > 1 and ranked[1][1] >= ranked[0][1] * 0.35:
            picks.append(ranked[1][0])

    seen = set()
    out = []
    for mat in picks:
        if mat in seen:
            continue
        seen.add(mat)
        out.append(mat)
    return out[:max_mats]


def _tint_material_copy(mat, rgb):
    if mat is None:
        return
    r, g, b = rgb
    if hasattr(mat, "diffuse_color"):
        mat.diffuse_color = (r, g, b, 1.0)
    if not (mat.use_nodes and mat.node_tree):
        return

    nodes = mat.node_tree.nodes
    links = mat.node_tree.links

    for node in nodes:
        if node.type != 'BSDF_PRINCIPLED':
            continue
        base = node.inputs.get("Base Color")
        if base is None:
            continue
        if base.is_linked and len(base.links) > 0:
            old_link = base.links[0]
            src = old_link.from_socket
            links.remove(old_link)
            mix = nodes.new("ShaderNodeMixRGB")
            mix.blend_type = 'MULTIPLY'
            mix.inputs["Fac"].default_value = 1.0
            mix.inputs["Color2"].default_value = (r, g, b, 1.0)
            links.new(src, mix.inputs["Color1"])
            links.new(mix.outputs["Color"], base)
        else:
            c = base.default_value
            base.default_value = (
                max(0.0, min(1.0, float(c[0]) * r)),
                max(0.0, min(1.0, float(c[1]) * g)),
                max(0.0, min(1.0, float(c[2]) * b)),
                float(c[3]) if len(c) > 3 else 1.0,
            )


def apply_color_variant(meshes, body_mats, variant_name, rgb):
    if not body_mats:
        return [], []
    mat_set = set(body_mats)
    cloned = {}
    assignments = []
    created = []

    for m in meshes:
        slots = m.material_slots
        if not slots:
            continue
        for i in range(len(slots)):
            mat = slots[i].material
            if mat is None or mat not in mat_set:
                continue
            if mat not in cloned:
                cp = mat.copy()
                cp.name = f"{mat.name}_variant_{variant_name}"
                _tint_material_copy(cp, rgb)
                cloned[mat] = cp
                created.append(cp)
            assignments.append((m, i, mat))
            slots[i].material = cloned[mat]

    return assignments, created


def restore_material_assignments(assignments, created_materials):
    for m, idx, original in assignments:
        if m is None:
            continue
        slots = m.material_slots
        if idx < 0 or idx >= len(slots):
            continue
        slots[idx].material = original
    for mat in created_materials:
        if mat is not None and mat.users == 0:
            bpy.data.materials.remove(mat)


def render_with_postprocess(out_path, meshes, source_path):
    render_icon(out_path)
    if not rendered_has_alpha(out_path):
        print("Re-rendering with opaque-material fallback:", source_path)
        force_opaque_materials(meshes)
        render_icon(out_path)
    keep_largest_alpha_island(out_path)


def process(path, cam, target, color_variants):
    print("Processing:", path)

    clear_scene()

    meshes = import_model(path)
    if not meshes:
        print("Skipped: no meshes")
        return

    meshes = split_suspicious_loose_parts(meshes)
    primary = set(_primary_meshes(meshes))
    if primary:
        for m in meshes:
            keep = m in primary
            m.hide_render = not keep
            m.hide_viewport = not keep
        meshes = [m for m in meshes if m in primary]

    pivot, root = create_rig(meshes)
    auto_upright(root, meshes)
    center_and_scale(root, meshes)
    fix_orientation(pivot, meshes, clean_name(path))
    sanitize_materials_for_icons(meshes)
    place_camera(cam, target, meshes)

    out = os.path.join(OUTPUT_DIR, clean_name(path) + ".png")
    render_with_postprocess(out, meshes, path)

    print("Saved:", out)

    if color_variants:
        body_mats = find_body_materials(meshes)
        if body_mats:
            print("Body material targets:", ", ".join(m.name for m in body_mats))
        else:
            print("No body material candidates found:", path)
        for variant_name, rgb in color_variants:
            if not body_mats:
                break
            assigns, created = apply_color_variant(meshes, body_mats, variant_name, rgb)
            if not assigns:
                restore_material_assignments(assigns, created)
                continue
            vout = os.path.join(OUTPUT_DIR, clean_name(path) + f"_{variant_name}.png")
            render_with_postprocess(vout, meshes, path)
            print("Saved:", vout)
            restore_material_assignments(assigns, created)


# =====================================================
# MAIN
# =====================================================


def main():
    input_root = Path(INPUT_DIR)
    recursive = os.environ.get("RENDER_RECURSIVE", "1").strip() not in {"0", "false", "False"}
    explicit_files = os.environ.get("RENDER_FILES", "").strip()

    if explicit_files:
        files = []
        for raw in explicit_files.split(";"):
            raw = raw.strip()
            if not raw:
                continue
            p = Path(raw)
            if not p.is_absolute():
                p = input_root / p
            if p.exists() and p.suffix.lower() == ".glb":
                files.append(str(p.resolve()))
    else:
        if recursive:
            files = [str(p) for p in input_root.rglob("*.glb")]
        else:
            files = [str(p) for p in input_root.glob("*.glb")]

    name_filter = os.environ.get("RENDER_NAME_FILTER", "").strip().lower()
    limit = int(os.environ.get("RENDER_LIMIT", "0") or "0")

    if name_filter:
        files = [f for f in files if name_filter in os.path.basename(f).lower()]
    if limit > 0:
        files = files[:limit]

    print(
        "Render config:",
        f"recursive={recursive}",
        f"explicit_files={bool(explicit_files)}",
        f"name_filter={name_filter or '<none>'}",
        f"limit={limit}",
        f"color_variants={RENDER_COLOR_VARIANTS or '<none>'}",
    )
    print("Found", len(files), "files")

    color_variants = parse_color_variants(RENDER_COLOR_VARIANTS)
    if color_variants:
        print("Enabled color variants:", ", ".join(name for name, _ in color_variants))

    # Build static scene once.
    setup_render()
    setup_hdri()
    setup_studio_lights()
    cam, target = setup_camera()

    for f in files:
        process(f, cam, target, color_variants)

    print("Done")


main()
