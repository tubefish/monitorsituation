"""Render the MONITOR silver globe atlas from the bundled 50m country topology.

Run with: python scripts/generate-silver-globe-atlas.py
Requires Pillow. The original 2k atlas remains available for older devices.
"""

import json
from pathlib import Path

from PIL import Image, ImageDraw


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 8192, 4096
TOPOLOGY = ROOT / "public/data/countries-50m.json"
OUTPUT = ROOT / "public/textures/earth-silver-atlas-8k.webp"

topology = json.loads(TOPOLOGY.read_text())
scale_x, scale_y = topology["transform"]["scale"]
translate_x, translate_y = topology["transform"]["translate"]


def decode_arc(index):
    x = y = 0
    points = []
    for dx, dy in topology["arcs"][index if index >= 0 else ~index]:
        x += dx
        y += dy
        lng = x * scale_x + translate_x
        lat = y * scale_y + translate_y
        points.append(((lng + 180) * WIDTH / 360, (90 - lat) * HEIGHT / 180))
    return points if index >= 0 else points[::-1]


arc_cache = {}


def ring(indices):
    points = []
    for index in indices:
        if index not in arc_cache:
            arc_cache[index] = decode_arc(index)
        segment = arc_cache[index]
        points.extend(segment if not points else segment[1:])
    # TopoJSON rings can cross the antimeridian. Unwrap them before drawing,
    # otherwise Pillow connects +180 to -180 with a line across the atlas.
    unwrapped = []
    offset = 0
    for x, y in points:
        if unwrapped:
            while x + offset - unwrapped[-1][0] > WIDTH / 2:
                offset -= WIDTH
            while x + offset - unwrapped[-1][0] < -WIDTH / 2:
                offset += WIDTH
        unwrapped.append((x + offset, y))
    return unwrapped


atlas = Image.new("RGB", (WIDTH, HEIGHT), "#f5f6f8")
draw = ImageDraw.Draw(atlas)

# Keep the longitude/latitude grid subordinate to the borders and labels.
for lng in range(-180, 180, 15):
    x = round((lng + 180) * WIDTH / 360)
    draw.line((x, 0, x, HEIGHT), fill="#e9ebee", width=1)
for lat in range(-75, 90, 15):
    y = round((90 - lat) * HEIGHT / 180)
    draw.line((0, y, WIDTH, y), fill="#e9ebee", width=1)

border = "#979fa7"
for feature in topology["objects"]["countries"]["geometries"]:
    kind = feature.get("type")
    if kind == "Polygon":
        polygons = [feature["arcs"]]
    elif kind == "MultiPolygon":
        polygons = feature["arcs"]
    else:
        continue

    for polygon in polygons:
        if not polygon:
            continue
        outer = ring(polygon[0])
        if len(outer) < 3:
            continue
        holes = [ring(hole) for hole in polygon[1:]]
        # The polar mainland is represented as a bottom-edge ring plus a
        # coast ring in the topology. Treat the coast as the upper boundary
        # of the land, rather than cutting it out as an ocean hole.
        if feature.get("properties", {}).get("name") == "Antarctica" and holes \
                and min(y for _, y in outer) > HEIGHT - 2:
            outer = [(0, HEIGHT), *holes[0], (WIDTH, HEIGHT)]
            holes = holes[1:]
        for shift in (-WIDTH, 0, WIDTH):
            shifted_outer = [(x + shift, y) for x, y in outer]
            draw.polygon(shifted_outer, fill="#c8cdd1")
            for hole in holes:
                if len(hole) >= 3:
                    draw.polygon([(x + shift, y) for x, y in hole], fill="#f5f6f8")
            draw.line(shifted_outer + shifted_outer[:1], fill=border, width=2, joint="curve")
            for hole in holes:
                if len(hole) >= 3:
                    shifted_hole = [(x + shift, y) for x, y in hole]
                    draw.line(shifted_hole + shifted_hole[:1], fill=border, width=2, joint="curve")

atlas.save(OUTPUT, "WEBP", quality=90, method=6)
print(f"Wrote {OUTPUT} ({WIDTH} x {HEIGHT})")
