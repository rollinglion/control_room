#!/usr/bin/env python3
"""Build precomputed UK rail/road polyline packs in TfL-like format.

Output schema:
{
  "polylines": [
    [ "<hexColor>", <opacity>, [lat, lon], [lat, lon], ... ],
    ...
  ]
}
"""

from __future__ import annotations

import argparse
import json
import math
from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, List, Tuple

Coord = List[float]
Route = Dict[str, object]


RAIL_COLOR = {
    "rail": "#38bdf8",
    "light_rail": "#22d3ee",
    "subway": "#22d3ee",
    "tram": "#67e8f9",
}

ROAD_COLOR = {
    "motorway": "#1d4ed8",
    "trunk": "#2563eb",
    "primary": "#3b82f6",
    "secondary": "#60a5fa",
}


def distance_km(a: Coord, b: Coord) -> float:
    lat1, lon1 = float(a[0]), float(a[1])
    lat2, lon2 = float(b[0]), float(b[1])
    rad = math.pi / 180.0
    d_lat = (lat2 - lat1) * rad
    d_lon = (lon2 - lon1) * rad
    x = d_lon * math.cos(((lat1 + lat2) * 0.5) * rad)
    y = d_lat
    return math.sqrt(x * x + y * y) * 6371.0


def route_length_km(coords: List[Coord]) -> float:
    if len(coords) < 2:
        return 0.0
    total = 0.0
    for i in range(1, len(coords)):
        total += distance_km(coords[i - 1], coords[i])
    return total


def normalize_coords(coords: Iterable[Iterable[float]], precision: int = 6) -> List[Coord]:
    out: List[Coord] = []
    last_key = None
    for c in coords:
        if not isinstance(c, (list, tuple)) or len(c) < 2:
            continue
        lat = float(c[0])
        lon = float(c[1])
        key = f"{lat:.{precision}f},{lon:.{precision}f}"
        if key == last_key:
            continue
        out.append([lat, lon])
        last_key = key
    return out


def simplify_by_step(coords: List[Coord], min_step_km: float) -> List[Coord]:
    if len(coords) < 3:
        return coords[:]
    out: List[Coord] = [coords[0]]
    last = coords[0]
    for i, p in enumerate(coords[1:], 1):
        if i == len(coords) - 1:
            out.append(p)
            break
        if distance_km(last, p) >= min_step_km:
            out.append(p)
            last = p
    if len(out) < 2:
        return [coords[0], coords[-1]]
    return out


def key_of(coord: Coord, precision: int) -> str:
    return f"{coord[0]:.{precision}f},{coord[1]:.{precision}f}"


def merge_segments(routes: List[Route], join_precision: int = 3) -> List[Route]:
    buckets: Dict[Tuple[str, str], List[Route]] = defaultdict(list)
    for r in routes:
        t = str(r.get("type", "")).lower()
        n = str(r.get("name", "")).strip().lower()
        coords = normalize_coords(r.get("coords", []))
        if len(coords) < 2:
            continue
        buckets[(t, n)].append({"type": t, "name": n, "coords": coords})

    merged: List[Route] = []
    for (_, _), segs in buckets.items():
        pending = segs[:]
        while pending:
            current = pending.pop()
            line = current["coords"][:]
            changed = True
            while changed:
                changed = False
                start_key = key_of(line[0], join_precision)
                end_key = key_of(line[-1], join_precision)
                for i in range(len(pending) - 1, -1, -1):
                    seg = pending[i]
                    s_start = key_of(seg["coords"][0], join_precision)
                    s_end = key_of(seg["coords"][-1], join_precision)
                    consumed = False
                    if end_key == s_start:
                        line.extend(seg["coords"][1:])
                        consumed = True
                    elif end_key == s_end:
                        line.extend(list(reversed(seg["coords"]))[1:])
                        consumed = True
                    elif start_key == s_end:
                        line = seg["coords"][:-1] + line
                        consumed = True
                    elif start_key == s_start:
                        line = list(reversed(seg["coords"]))[:-1] + line
                        consumed = True
                    if consumed:
                        pending.pop(i)
                        changed = True
            merged.append(
                {
                    "type": current["type"],
                    "name": current["name"],
                    "coords": normalize_coords(line),
                }
            )
    return merged


def filter_rail(routes: List[Route]) -> List[Route]:
    out = []
    for r in routes:
        t = str(r.get("type", "")).lower()
        if t not in {"rail", "light_rail", "subway", "tram"}:
            continue
        km = route_length_km(r.get("coords", []))
        name = str(r.get("name", "")).lower()
        if "main line" in name or "high speed" in name or km >= 2.0:
            out.append(r)
    return out


def filter_roads(routes: List[Route]) -> List[Route]:
    out = []
    for r in routes:
        t = str(r.get("type", "")).lower()
        if t not in {"motorway", "trunk", "primary", "secondary"}:
            continue
        km = route_length_km(r.get("coords", []))
        if t in {"motorway", "trunk"} or km >= 1.4:
            out.append(r)
    return out


def to_polyline_pack(routes: List[Route], color_map: Dict[str, str], simplify_km: float) -> Dict[str, object]:
    polylines: List[list] = []
    for r in routes:
        t = str(r.get("type", "")).lower()
        color = color_map.get(t, "#60a5fa")
        coords = simplify_by_step(normalize_coords(r.get("coords", [])), simplify_km)
        if len(coords) < 2:
            continue
        row = [color, 0.9]
        row.extend(coords)
        polylines.append(row)
    return {"polylines": polylines}


def load_routes(path: Path) -> List[Route]:
    data = json.loads(path.read_text(encoding="utf-8"))
    routes = data.get("routes", [])
    if not isinstance(routes, list):
        return []
    out: List[Route] = []
    for r in routes:
        if not isinstance(r, dict):
            continue
        out.append(
            {
                "type": str(r.get("type", "")),
                "name": str(r.get("name", "")),
                "coords": r.get("coords", []),
            }
        )
    return out


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rail-in", default="data/transport_static/rail_core.json")
    parser.add_argument("--roads-in", default="data/transport_static/roads_core.json")
    parser.add_argument("--rail-out", default="data/transport_static/uk-lines.json")
    parser.add_argument("--roads-out", default="data/transport_static/uk-roads.json")
    args = parser.parse_args()

    rail_routes = load_routes(Path(args.rail_in))
    road_routes = load_routes(Path(args.roads_in))

    rail_merged = merge_segments(filter_rail(rail_routes), join_precision=3)
    road_merged = merge_segments(filter_roads(road_routes), join_precision=4)

    rail_pack = to_polyline_pack(rail_merged, RAIL_COLOR, simplify_km=0.18)
    roads_pack = to_polyline_pack(road_merged, ROAD_COLOR, simplify_km=0.15)

    rail_out = Path(args.rail_out)
    roads_out = Path(args.roads_out)
    rail_out.parent.mkdir(parents=True, exist_ok=True)
    roads_out.parent.mkdir(parents=True, exist_ok=True)
    rail_out.write_text(json.dumps(rail_pack, separators=(",", ":")), encoding="utf-8")
    roads_out.write_text(json.dumps(roads_pack, separators=(",", ":")), encoding="utf-8")

    print(f"Wrote {rail_out} with {len(rail_pack['polylines'])} polylines")
    print(f"Wrote {roads_out} with {len(roads_pack['polylines'])} polylines")


if __name__ == "__main__":
    main()
