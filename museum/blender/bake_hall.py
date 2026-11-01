"""The museum hall: real stone piers standing proud, pictures recessed between them, a coffered vault, a glass end.
Only the light is computed here: Cycles bakes what reaches each surface, the elevation photographs in public/hall supply
all the detail. It writes hall.glb and one lm-<surface>.exr per surface; the film loads them from public/hall as they are.

Run it from the museum folder:
  blender -b -P blender/bake_hall.py -- public/hall 1024 128
That is full quality: minutes on a good GPU and 1.2 GB of maps, with files over GitHub's 100 MB limit. The maps in this repo
are the same light at an eighth of that size, so 128 16 is enough to try a change quickly.
Blender is Z-up, the hall runs along +Y; the glTF export turns that into three's Y-up hall along -Z."""
import bpy, math, os, sys

argv = sys.argv[sys.argv.index("--") + 1:]
OUT = argv[0]
SIZE = int(argv[1]) if len(argv) > 1 else 1024
SAMPLES = int(argv[2]) if len(argv) > 2 else 64
os.makedirs(OUT, exist_ok=True)

# metres
W = 24.0  # half width at the pier faces
D = 3.2  # how deep the pictures sit behind them
BAY = 34.0
PIER = 10.0  # pier width
PIER_H = PIER * 1672 / 941  # each of the two pier photographs
TOP = PIER_H * 2  # top of the piers, 28.4
BAND_H = BAY * 941 / 1672
SPRING = TOP + BAND_H  # 45.3
RV = 18.0  # vault rise: 73 m at the crown
NBAYS = 31
Y0 = -BAY / 2 - BAY
Y1 = (NBAYS - 1) * BAY + BAY / 2
LEN = Y1 - Y0
PH = 32.0  # the pictures
PZ = 17.0

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
# the first GPU backend this machine has; without one Cycles runs on the CPU
scene.cycles.device = "CPU"
for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
    try:
        prefs.compute_device_type = backend
    except TypeError:
        continue
    prefs.get_devices()
    gpus = [d for d in prefs.devices if d.type != "CPU"]
    if gpus:
        for d in gpus:
            d.use = True
        scene.cycles.device = "GPU"
        break
scene.cycles.samples = SAMPLES
scene.cycles.max_bounces = 5
world = bpy.data.worlds.new("night")
world.use_nodes = True
bg = world.node_tree.nodes["Background"]
bg.inputs[0].default_value = (0.3, 0.36, 0.5, 1)
bg.inputs[1].default_value = 0.1
scene.world = world


def mat(name, color, rough=0.6, emit=None, strength=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = (*color, 1)
    p.inputs["Roughness"].default_value = rough
    if emit:
        p.inputs["Emission Color"].default_value = (*emit, 1)
        p.inputs["Emission Strength"].default_value = strength
    return m


def link(name, verts, faces, tile, light, material, centres=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.update()
    uv0 = me.uv_layers.new(name="tile")
    uv1 = me.uv_layers.new(name="light")
    for k, poly in enumerate(me.polygons):
        for n, li in enumerate(poly.loop_indices):
            uv0.uv[li].vector = tile[k][n]
            uv1.uv[li].vector = light[k][n]
    for k, poly in enumerate(me.polygons):
        c, n = poly.center, poly.normal
        if centres and centres[k]:
            o = centres[k]
            d_ = n.x * (c.x - o[0]) + n.y * (c.y - o[1]) + n.z * (c.z - o[2])
        elif name.startswith("end"):
            d_ = n.y * ((Y0 + Y1) / 2 - c.y)
        elif name == "floor":
            d_ = n.z
        else:
            d_ = n.x * (0 - c.x) + n.z * (25 - c.z)
        if d_ < 0:
            poly.flip()
    me.update()
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    me.materials.append(material)
    return ob


def grid(name, nu, nv, fn, material):
    verts, tiles = [], {}
    for j in range(nv + 1):
        for i in range(nu + 1):
            p, t = fn(i / nu, j / nv)
            verts.append(p)
            tiles[(i, j)] = t
    faces, tile, light = [], [], []
    for j in range(nv):
        for i in range(nu):
            c = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            faces.append(tuple(q * (nu + 1) + p for p, q in c))
            tile.append([tiles[k] for k in c])
            light.append([(p / nu, q / nv) for p, q in c])
    return link(name, verts, faces, tile, light, material)


def quads(name, items, material):
    """Separate quads, each (4 corners, 4 tile uvs, outward-from point); the light uvs are an atlas of cells."""
    n = len(items)
    cols = math.ceil(math.sqrt(n))
    rows = math.ceil(n / cols)
    verts, faces, tile, light, centres = [], [], [], [], []
    for k, item in enumerate(items):
        ps, ts = item[0], item[1]
        centres.append(item[2])
        b = len(verts)
        verts += ps
        faces.append((b, b + 1, b + 2, b + 3))
        tile.append(ts)
        cx, cy = k % cols, k // cols
        m = 0.04
        light.append([((cx + m) / cols, (cy + m) / rows), ((cx + 1 - m) / cols, (cy + m) / rows), ((cx + 1 - m) / cols, (cy + 1 - m) / rows), ((cx + m) / cols, (cy + 1 - m) / rows)])
    return link(name, verts, faces, tile, light, material, centres)


floor_m = mat("floor", (0.05, 0.05, 0.05), 0.2)
stone_m = mat("stone", (0.42, 0.39, 0.34), 0.75)
vault_m = mat("vault", (0.42, 0.39, 0.34), 0.7)
pic_m = mat("pic", (0.1, 0.1, 0.1), 0.5, emit=(1.0, 0.95, 0.88), strength=0.22)
cove_m = mat("cove", (0, 0, 0), 1.0, emit=(1.0, 0.93, 0.82), strength=6.0)
end_m = mat("end", (0.04, 0.05, 0.08), 0.6, emit=(0.3, 0.42, 0.8), strength=4.0)

baked = []
UV1 = [(0, 0), (1, 0), (1, 1), (0, 1)]

baked.append((grid("floor", 420, 16, lambda u, v: (((v - 0.5) * 2 * (W + D), Y0 + u * LEN, 0.0), (u * LEN / 12, v * 2 * (W + D) / 12)), floor_m), SIZE * 8, SIZE))
for s, name in ((-1, "backL"), (1, "backR")):
    baked.append((grid(name, 420, 10, lambda u, v, s=s: ((s * (W + D), Y0 + u * LEN, v * TOP), (u * LEN / 9, v * TOP / 9)), stone_m), SIZE * 8, SIZE // 2))


def on_vault(t, y, inset=0.0):
    return ((W - inset) * math.cos(t), y, SPRING + (RV - inset) * math.sin(t))


ARC = 66.0
baked.append((grid("vault", 420, 40, lambda u, v: (on_vault(v * math.pi, Y0 + u * LEN), (u * LEN / 16, v * ARC / 16)), vault_m), SIZE * 8, SIZE))

piers_y = [Y0 + i * BAY for i in range(NBAYS + 2)]
bays_y = [y + BAY / 2 for y in piers_y[:-1]]

lo, hi, sides, band, soffit, ribs = [], [], [], [], [], []
# wide recesses on the ordinary walls, for the pictures that are wider than a bay: (side, row, row + 1), the pier between them gone
WIDE = [(-1, 11), (1, 16), (1, 27)]
GONE = {(s, (r - 1) * BAY + BAY / 2) for s, r in WIDE}
for y in piers_y:
    for s in (-1, 1):
        a, b = y - PIER / 2, y + PIER / 2
        if (s, y) in GONE:
            # the bays' own soffits already run under where the pier was
            continue
        x = s * W
        out = (s * (W + 5), y, 10)
        # the photograph reads left to right as seen from inside the hall
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)] if s > 0 else [(1, 0), (0, 0), (0, 1), (1, 1)]
        lo.append(([(x, a, 0), (x, b, 0), (x, b, PIER_H), (x, a, PIER_H)], uv, out))
        hi.append(([(x, a, PIER_H), (x, b, PIER_H), (x, b, TOP), (x, a, TOP)], uv, out))
        for side_y, inward in ((a, y), (b, y)):
            sides.append(([(x, side_y, 0), (s * (W + D), side_y, 0), (s * (W + D), side_y, TOP), (x, side_y, TOP)], [(0, 0), (D / 9, 0), (D / 9, TOP / 9), (0, TOP / 9)], (x + s * D / 2, inward, TOP / 2)))
for y in bays_y:
    for s in (-1, 1):
        a, b = y - BAY / 2, y + BAY / 2
        x = s * W
        uv = [(0, 0), (1, 0), (1, 1), (0, 1)] if s > 0 else [(1, 0), (0, 0), (0, 1), (1, 1)]
        band.append(([(x, a, TOP), (x, b, TOP), (x, b, SPRING), (x, a, SPRING)], uv, (s * (W + 5), y, TOP + 5)))
        soffit.append(([(x, a, TOP), (x, b, TOP), (s * (W + D), b, TOP), (s * (W + D), a, TOP)], [(0, 0), (BAY / 9, 0), (BAY / 9, D / 9), (0, D / 9)], (x + s, y, TOP + 3)))
# plain stone arches across the vault, one over each pier
RW, RD = 2.2, 1.1
for y in piers_y:
    n = 24
    for i in range(n):
        t0, t1 = math.pi * i / n, math.pi * (i + 1) / n
        mid = on_vault((t0 + t1) / 2, y, RD / 2)
        uv = [(i * 0.5, 0), (i * 0.5, 0.5), ((i + 1) * 0.5, 0.5), ((i + 1) * 0.5, 0)]
        ribs.append(([on_vault(t0, y - RW, RD), on_vault(t0, y + RW, RD), on_vault(t1, y + RW, RD), on_vault(t1, y - RW, RD)], uv, on_vault((t0 + t1) / 2, y, -3)))
        for dy in (-RW, RW):
            ribs.append(([on_vault(t0, y + dy), on_vault(t0, y + dy, RD), on_vault(t1, y + dy, RD), on_vault(t1, y + dy)], [(0, 0), (0.12, 0), (0.12, 0.5), (0, 0.5)], mid))
baked.append((quads("pierLo", lo, stone_m), SIZE * 4, SIZE * 4))
baked.append((quads("pierHi", hi, stone_m), SIZE * 4, SIZE * 4))
baked.append((quads("sides", sides, stone_m), SIZE * 4, SIZE * 4))
baked.append((quads("band", band, stone_m), SIZE * 4, SIZE * 2))
baked.append((quads("soffit", soffit, stone_m), SIZE * 2, SIZE))
baked.append((quads("ribs", ribs, stone_m), SIZE * 4, SIZE * 4))
baked.append((grid("endNear", 16, 16, lambda u, v: (((u - 0.5) * 2 * (W + D), Y0, v * (SPRING + RV)), (u * 2 * (W + D) / 9, v * (SPRING + RV) / 9)), stone_m), SIZE // 2, SIZE // 2))

# the glass end (exported, not baked; it carries its own light)
HE = SPRING + RV
m0 = 0.5 - (W + D) / HE
m1 = 0.5 + (W + D) / HE
end_v = [(-(W + D), Y1, 0), ((W + D), Y1, 0), ((W + D), Y1, HE), (-(W + D), Y1, HE)]
me = bpy.data.meshes.new("endFar")
me.from_pydata(end_v, [], [(0, 1, 2, 3)])
me.update()
u0 = me.uv_layers.new(name="tile")
u1 = me.uv_layers.new(name="light")
for a, li in enumerate(me.polygons[0].loop_indices):
    u0.uv[li].vector = [(m0, 0), (m1, 0), (m1, 1), (m0, 1)][a]
    u1.uv[li].vector = (0, 0)
end_ob = bpy.data.objects.new("endFar", me)
scene.collection.objects.link(end_ob)
me.materials.append(end_m)


def spot(loc, aim, energy, cone, blend, color):
    bpy.ops.object.light_add(type="SPOT", location=loc)
    L = bpy.context.object
    L.data.energy = energy
    L.data.color = color
    L.data.spot_size = math.radians(cone)
    L.data.spot_blend = blend
    L.data.shadow_soft_size = 0.25
    t = bpy.data.objects.new("t", None)
    scene.collection.objects.link(t)
    t.location = aim
    c = L.constraints.new("TRACK_TO")
    c.target = t
    c.track_axis = "TRACK_NEGATIVE_Z"
    c.up_axis = "UP_Y"


LAMP = (1.0, 0.95, 0.88)
for y in bays_y:
    for s in (-1, 1):
        x = s * (W + D - 0.08)
        # the picture itself glows a little and shades the wall behind it
        pm = bpy.data.meshes.new("p")
        pm.from_pydata([(x, y - 9.0, PZ - PH / 2), (x, y + 9.0, PZ - PH / 2), (x, y + 9.0, PZ + PH / 2), (x, y - 9.0, PZ + PH / 2)], [], [(0, 1, 2, 3)])
        pm.update()
        po = bpy.data.objects.new("p", pm)
        scene.collection.objects.link(po)
        pm.materials.append(pic_m)
        # the lamps over it: they light the picture (in the film's shader) and spill on the recess, the piers and the floor
        for dy in (-5.8, 0.0, 5.8):
            spot((s * (W + D - 2.7), y + dy, PZ + PH / 2 + 1.0), (s * (W + D), y + dy, PZ - 6), 3200, 76, 0.75, LAMP)
# a soft white wash from above each pier, so the carving reads
for y in piers_y:
    for s in (-1, 1):
        spot((s * (W - 7), y, TOP + 4), (s * W, y, TOP * 0.42), 3000, 34, 0.9, LAMP)
# a very low warm wash from a hidden ledge on the entablature, so the vault is barely there
for s in (-1, 1):
    x = s * (W - 0.1)
    z = TOP + 3.2
    c = bpy.data.meshes.new("c")
    c.from_pydata([(x, Y0, z), (x, Y1, z), (x - s * 0.7, Y1, z), (x - s * 0.7, Y0, z)], [], [(0, 1, 2, 3)])
    c.update()
    co = bpy.data.objects.new("c", c)
    scene.collection.objects.link(co)
    c.materials.append(cove_m)

bpy.context.view_layer.update()
for ob, w, h in baked:
    img = bpy.data.images.new(f"lm-{ob.name}", w, h, alpha=False, float_buffer=True)
    for m in ob.data.materials:
        nt = m.node_tree
        for n_ in list(nt.nodes):
            n_.select = False
        node = nt.nodes.new("ShaderNodeTexImage")
        node.image = img
        node.select = True
        nt.nodes.active = node
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    ob.data.uv_layers.active = ob.data.uv_layers["light"]
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, use_clear=True, margin=4, margin_type="EXTEND", uv_layer="light")
    img.filepath_raw = os.path.join(OUT, f"lm-{ob.name}.exr")
    img.file_format = "OPEN_EXR"
    img.save()
    px = list(img.pixels[:: 4 * max(1, (w * h) // 4000)])
    print("BAKED", ob.name, w, h, "max", round(max(px), 3), flush=True)
    for m in ob.data.materials:
        m.node_tree.nodes.remove(m.node_tree.nodes.active)

bpy.ops.object.select_all(action="DESELECT")
for ob, _, _ in baked:
    ob.select_set(True)
    ob.data.uv_layers.active = ob.data.uv_layers["tile"]
end_ob.select_set(True)
end_ob.data.uv_layers.active = end_ob.data.uv_layers["tile"]
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "hall.glb"), use_selection=True, export_format="GLB", export_materials="NONE", export_normals=True, export_texcoords=True, export_apply=False)
print("DONE", flush=True)
