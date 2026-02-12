#!/usr/bin/env python3
"""
Build lightweight thematic overlays from a large OSM PBF.

Why:
- The raw GB PBF is too large for browser delivery.
- This script extracts only operationally useful themes and writes compact GeoJSON.

Backends:
1) pyrosm backend (recommended when running Python 3.11):
   pip install pyrosm geopandas shapely pyproj
2) ogr backend (works well on Python 3.12 if GDAL tools are installed):
   Install GDAL (ogr2ogr), then run with --backend ogr

Example:
  python scripts/build_osm_layers.py ^
    --pbf "data/OS Map/great-britain-260211.osm.pbf" ^
    --out "data/osm_derived" ^
    --simplify 25
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Dict, Optional


MAJOR_ROAD_TAGS = [
    "motorway",
    "motorway_link",
    "trunk",
    "trunk_link",
    "primary",
    "primary_link",
    "secondary",
    "secondary_link",
    "tertiary",
    "tertiary_link",
]

RAIL_TAGS = [
    "rail",
    "subway",
    "light_rail",
    "tram",
]

PLACE_TAGS = [
    "city",
    "town",
    "village",
    "hamlet",
    "suburb",
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract compact OSM overlays from PBF.")
    parser.add_argument("--pbf", required=True, help="Path to .osm.pbf source file.")
    parser.add_argument(
        "--out",
        default="data/osm_derived",
        help="Output directory for extracted overlays.",
    )
    parser.add_argument(
        "--simplify",
        type=float,
        default=25.0,
        help="Geometry simplify tolerance in meters (for line layers).",
    )
    parser.add_argument(
        "--backend",
        choices=["auto", "pyrosm", "ogr"],
        default="auto",
        help="Extraction backend. auto tries pyrosm first, then ogr2ogr.",
    )
    return parser.parse_args()


def import_pyrosm_stack():
    try:
        import geopandas as gpd  # type: ignore
        import pandas as pd  # type: ignore
        from pyrosm import OSM  # type: ignore
        return gpd, pd, OSM
    except Exception:
        return None, None, None


def simplify_lines(gdf, tolerance_m: float, gpd, pd):
    if gdf.empty:
        return gdf
    line_like = gdf[gdf.geometry.type.isin(["LineString", "MultiLineString"])].copy()
    other = gdf[~gdf.index.isin(line_like.index)].copy()
    if not line_like.empty:
        simplified = line_like.to_crs(27700)
        simplified.geometry = simplified.geometry.simplify(tolerance=tolerance_m, preserve_topology=True)
        line_like = simplified.to_crs(4326)
    if other.empty:
        return line_like
    return gpd.GeoDataFrame(
        pd.concat([line_like, other], ignore_index=True),
        geometry="geometry",
        crs="EPSG:4326",
    )


def compact_columns(gdf, columns: list[str]):
    if gdf.empty:
        return gdf
    keep = [c for c in columns if c in gdf.columns]
    keep.append("geometry")
    return gdf[keep].copy()


def write_geojson(gdf, path: Path) -> Dict[str, int]:
    if gdf.empty:
        payload = {"type": "FeatureCollection", "features": []}
        path.write_text(json.dumps(payload), encoding="utf-8")
    else:
        gdf.to_file(path, driver="GeoJSON")
    return {
        "features": int(len(gdf)),
        "bytes": int(path.stat().st_size),
    }


def run_ogr_extract(src_pbf: Path, out_path: Path, layer: str, where: str, select: str) -> Dict[str, int]:
    cmd = [
        "ogr2ogr",
        "-f",
        "GeoJSON",
        str(out_path),
        str(src_pbf),
        layer,
        "-t_srs",
        "EPSG:4326",
        "-lco",
        "RFC7946=YES",
        "-select",
        select,
        "-where",
        where,
    ]
    subprocess.run(cmd, check=True)
    return {
        "features": -1,  # unknown without loading JSON; kept lightweight
        "bytes": int(out_path.stat().st_size),
    }


def build_with_ogr(src_pbf: Path, out_dir: Path) -> dict:
    if not shutil.which("ogr2ogr"):
        raise SystemExit(
            "ogr2ogr not found. Install GDAL first, e.g. `winget install OSGeo.GDAL`, "
            "or use Python 3.11 + pyrosm backend."
        )

    roads_path = out_dir / "gb_major_roads.geojson"
    rail_path = out_dir / "gb_rail_lines.geojson"
    places_path = out_dir / "gb_places.geojson"

    roads_where = "highway IN (" + ",".join([f"'{t}'" for t in MAJOR_ROAD_TAGS]) + ")"
    rail_where = "railway IN (" + ",".join([f"'{t}'" for t in RAIL_TAGS]) + ")"
    places_where = "place IN (" + ",".join([f"'{t}'" for t in PLACE_TAGS]) + ")"

    manifest = {
        "source_pbf": str(src_pbf),
        "backend": "ogr",
        "outputs": {},
    }
    manifest["outputs"]["major_roads"] = run_ogr_extract(
        src_pbf, roads_path, "lines", roads_where, "name,ref,highway,maxspeed"
    )
    manifest["outputs"]["rail_lines"] = run_ogr_extract(
        src_pbf, rail_path, "lines", rail_where, "name,operator,railway"
    )
    manifest["outputs"]["places"] = run_ogr_extract(
        src_pbf, places_path, "points", places_where, "name,place,population"
    )
    return manifest


def build_with_pyrosm(src_pbf: Path, out_dir: Path, simplify: float) -> dict:
    gpd, pd, OSM = import_pyrosm_stack()
    if not (gpd and pd and OSM):
        raise SystemExit(
            "pyrosm backend unavailable. Install with:\n"
            "  pip install pyrosm geopandas shapely pyproj\n"
            "Or run with --backend ogr after installing GDAL."
        )

    print(f"Loading OSM PBF: {src_pbf}")
    osm = OSM(str(src_pbf))

    print("Extracting major roads...")
    roads = osm.get_data_by_custom_criteria(
        custom_filter={"highway": MAJOR_ROAD_TAGS},
        filter_type="keep",
        keep_nodes=False,
        keep_ways=True,
        keep_relations=False,
    )
    roads = roads.set_crs(4326, allow_override=True)
    roads = compact_columns(roads, ["name", "ref", "highway", "maxspeed"])
    roads = simplify_lines(roads, simplify, gpd, pd)

    print("Extracting rail lines...")
    rail = osm.get_data_by_custom_criteria(
        custom_filter={"railway": RAIL_TAGS},
        filter_type="keep",
        keep_nodes=False,
        keep_ways=True,
        keep_relations=False,
    )
    rail = rail.set_crs(4326, allow_override=True)
    rail = compact_columns(rail, ["name", "operator", "railway"])
    rail = simplify_lines(rail, simplify, gpd, pd)

    print("Extracting populated places...")
    places = osm.get_data_by_custom_criteria(
        custom_filter={"place": PLACE_TAGS},
        filter_type="keep",
        keep_nodes=True,
        keep_ways=False,
        keep_relations=False,
    )
    places = places.set_crs(4326, allow_override=True)
    places = compact_columns(places, ["name", "place", "population"])

    manifest = {
        "source_pbf": str(src_pbf),
        "backend": "pyrosm",
        "outputs": {},
    }

    roads_path = out_dir / "gb_major_roads.geojson"
    rail_path = out_dir / "gb_rail_lines.geojson"
    places_path = out_dir / "gb_places.geojson"

    manifest["outputs"]["major_roads"] = write_geojson(roads, roads_path)
    manifest["outputs"]["rail_lines"] = write_geojson(rail, rail_path)
    manifest["outputs"]["places"] = write_geojson(places, places_path)
    return manifest


def main() -> None:
    args = parse_args()
    pbf = Path(args.pbf)
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not pbf.exists():
        raise SystemExit(f"PBF not found: {pbf}")

    if args.backend == "pyrosm":
        manifest = build_with_pyrosm(pbf, out_dir, args.simplify)
    elif args.backend == "ogr":
        manifest = build_with_ogr(pbf, out_dir)
    else:
        gpd, pd, OSM = import_pyrosm_stack()
        if gpd and pd and OSM:
            manifest = build_with_pyrosm(pbf, out_dir, args.simplify)
        elif shutil.which("ogr2ogr"):
            manifest = build_with_ogr(pbf, out_dir)
        else:
            raise SystemExit(
                "No supported backend available.\n"
                "- Option A: Python 3.11 + `pip install pyrosm geopandas shapely pyproj`\n"
                "- Option B: install GDAL (`winget install OSGeo.GDAL`) and rerun with --backend ogr"
            )

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2), encoding="utf-8")

    print("\nDone.")
    print(f"- {roads_path}")
    print(f"- {rail_path}")
    print(f"- {places_path}")
    print(f"- {manifest_path}")


if __name__ == "__main__":
    main()
