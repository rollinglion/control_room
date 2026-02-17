"""Build an enriched crime grid GeoJSON from monthly Police Data extracts."""

from __future__ import annotations

import csv
import json
from collections import Counter, defaultdict
from pathlib import Path
from typing import Dict, Iterable, Tuple

GRID_SIZE = 0.002  # approx 200 m buckets

DATA_DIR = Path(__file__).resolve().parents[1]
INPUT_DIR = DATA_DIR / "Police Data"
OUTPUT_PATH = DATA_DIR / "Processed" / "crime_grid.geojson"
SAMPLE_LIMIT = 6


FORCE_NAME_OVERRIDES = {
    "avon-and-somerset": "Avon and Somerset Police",
    "bedfordshire": "Bedfordshire Police",
    "btp": "British Transport Police",
    "cambridgeshire": "Cambridgeshire Constabulary",
    "cheshire": "Cheshire Constabulary",
    "city-of-london": "City of London Police",
    "cleveland": "Cleveland Police",
    "cumbria": "Cumbria Constabulary",
    "derbyshire": "Derbyshire Constabulary",
    "devon-and-cornwall": "Devon & Cornwall Police",
    "dorset": "Dorset Police",
    "durham": "Durham Constabulary",
    "dyfed-powys": "Dyfed-Powys Police",
    "essex": "Essex Police",
    "gloucestershire": "Gloucestershire Constabulary",
    "greater-manchester": "Greater Manchester Police",
    "gwent": "Gwent Police",
    "hampshire": "Hampshire & Isle of Wight Constabulary",
    "hertfordshire": "Hertfordshire Constabulary",
    "humberside": "Humberside Police",
    "kent": "Kent Police",
    "lancashire": "Lancashire Constabulary",
    "leicestershire": "Leicestershire Police",
    "lincolnshire": "Lincolnshire Police",
    "merseyside": "Merseyside Police",
    "metropolitan": "Metropolitan Police Service",
    "norfolk": "Norfolk Constabulary",
    "north-wales": "North Wales Police",
    "north-yorkshire": "North Yorkshire Police",
    "northamptonshire": "Northamptonshire Police",
    "northern-ireland": "Police Service of Northern Ireland",
    "northumbria": "Northumbria Police",
    "nottinghamshire": "Nottinghamshire Police",
    "scotland": "Police Scotland",
    "south-wales": "South Wales Police",
    "south-yorkshire": "South Yorkshire Police",
    "staffordshire": "Staffordshire Police",
    "suffolk": "Suffolk Constabulary",
    "surrey": "Surrey Police",
    "sussex": "Sussex Police",
    "thames-valley": "Thames Valley Police",
    "warwickshire": "Warwickshire Police",
    "west-mercia": "West Mercia Police",
    "west-midlands": "West Midlands Police",
    "west-yorkshire": "West Yorkshire Police",
    "wiltshire": "Wiltshire Police"
}


def friendly_force_name(slug: str | None) -> str | None:
    if not slug:
        return None
    slug_norm = slug.lower()
    if slug_norm in FORCE_NAME_OVERRIDES:
        return FORCE_NAME_OVERRIDES[slug_norm]
    return slug.replace("-", " ").title() + " Police"


def safe_float(value: str | float | None) -> float | None:
    try:
        return float(value)
    except (TypeError, ValueError):  # noqa: PERF203
        return None


def quantize(coord: float) -> float:
    return round(coord / GRID_SIZE) * GRID_SIZE


def make_cell() -> Dict[str, Counter | int]:
    return {
        "crime_count": 0,
        "crime_types": Counter(),
        "crime_outcomes": Counter(),
        "forces": Counter(),
        "stop_count": 0,
        "stop_outcomes": Counter(),
        "stop_objects": Counter(),
        "stop_legislation": Counter(),
        "stop_gender": Counter(),
        "stop_ethnicity": Counter(),
        "outcome_total": 0,
        "outcome_types": Counter(),
        "timeline": defaultdict(lambda: {"crime": 0, "stop": 0, "outcome": 0}),
        "incident_samples": []
    }


grid = defaultdict(make_cell)
crime_rows = stop_rows = outcome_rows = 0
all_months = set()


def grid_key(lat: float, lon: float) -> Tuple[float, float]:
    return quantize(lat), quantize(lon)


def bump(counter: Counter, value: str | None) -> None:
    if not value:
        return
    counter[value] += 1


def extract_month(raw: str | None) -> str | None:
    if not raw:
        return None
    value = str(raw).strip()
    if not value:
        return None
    if len(value) >= 7 and value[4] == "-":
        return value[:7]
    return None


def record_month(cell, month: str | None, key: str) -> None:
    if not month:
        return
    all_months.add(month)
    bucket = cell["timeline"][month]
    bucket[key] += 1


def maybe_add_sample(cell, row, lat, lon, month: str | None) -> None:
    samples = cell["incident_samples"]
    if len(samples) >= SAMPLE_LIMIT:
        return
    samples.append({
        "crime_id": (row.get("Crime ID") or row.get("crime_id") or "").strip(),
        "type": (row.get("Crime type") or row.get("Crime Type") or "Crime").strip() or "Crime",
        "location": (row.get("Location") or row.get("Street") or "").strip(),
        "month": month,
        "outcome": (row.get("Last outcome category") or row.get("Outcome type") or "").strip(),
        "force": (row.get("Reported by") or row.get("Force") or "").strip(),
        "lat": round(lat, 5),
        "lon": round(lon, 5)
    })


def extract_force_slug(path: Path, suffix: str) -> str | None:
    stem = path.stem  # 2025-12-metropolitan-stop-and-search
    parts = stem.split("-", 2)
    if len(parts) < 3:
        return None
    remainder = parts[2]
    suffix_token = f"-{suffix}"
    if remainder.endswith(suffix_token):
        remainder = remainder[: -len(suffix_token)]
    return remainder or None


def iter_files(pattern: str) -> Iterable[Path]:
    return sorted(INPUT_DIR.rglob(pattern))


def top_label(counter: Counter, fallback: str | None = None) -> str | None:
    if not counter:
        return fallback
    label, _ = counter.most_common(1)[0]
    return label or fallback


def process_street_files() -> None:
    global crime_rows
    for csv_path in iter_files("*-street.csv"):
        print(f"[street] {csv_path.relative_to(INPUT_DIR)}")
        with csv_path.open(encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                lat = safe_float(row.get("Latitude"))
                lon = safe_float(row.get("Longitude"))
                if lat is None or lon is None:
                    continue
                month = extract_month(row.get("Month"))
                cell = grid[grid_key(lat, lon)]
                cell["crime_count"] += 1
                bump(cell["crime_types"], (row.get("Crime type") or "").strip())
                bump(cell["crime_outcomes"], (row.get("Last outcome category") or "").strip())
                bump(cell["forces"], (row.get("Reported by") or "").strip())
                record_month(cell, month, "crime")
                maybe_add_sample(cell, row, lat, lon, month)
                crime_rows += 1


def process_stop_and_search_files() -> None:
    global stop_rows
    for csv_path in iter_files("*-stop-and-search.csv"):
        slug = extract_force_slug(csv_path, "stop-and-search")
        fallback_force = friendly_force_name(slug)
        print(f"[stop-search] {csv_path.relative_to(INPUT_DIR)}")
        with csv_path.open(encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                lat = safe_float(row.get("Latitude"))
                lon = safe_float(row.get("Longitude"))
                if lat is None or lon is None:
                    continue
                month = extract_month(row.get("Date") or row.get("Month"))
                cell = grid[grid_key(lat, lon)]
                cell["stop_count"] += 1
                bump(cell["stop_outcomes"], (row.get("Outcome") or "").strip())
                bump(cell["stop_objects"], (row.get("Object of search") or "").strip())
                bump(cell["stop_legislation"], (row.get("Legislation") or "").strip())
                bump(cell["stop_gender"], (row.get("Gender") or "").strip())
                officer_ethnicity = (row.get("Officer-defined ethnicity") or "").strip()
                self_ethnicity = (row.get("Self-defined ethnicity") or "").strip()
                bump(cell["stop_ethnicity"], officer_ethnicity or self_ethnicity)
                if fallback_force:
                    bump(cell["forces"], fallback_force)
                record_month(cell, month, "stop")
                stop_rows += 1


def process_outcomes_files() -> None:
    global outcome_rows
    for csv_path in iter_files("*-outcomes.csv"):
        print(f"[outcomes] {csv_path.relative_to(INPUT_DIR)}")
        with csv_path.open(encoding="utf-8") as handle:
            reader = csv.DictReader(handle)
            for row in reader:
                lat = safe_float(row.get("Latitude"))
                lon = safe_float(row.get("Longitude"))
                if lat is None or lon is None:
                    continue
                month = extract_month(row.get("Month") or row.get("Date"))
                cell = grid[grid_key(lat, lon)]
                cell["outcome_total"] += 1
                bump(cell["outcome_types"], (row.get("Outcome type") or "").strip())
                bump(cell["forces"], (row.get("Reported by") or "").strip())
                record_month(cell, month, "outcome")
                outcome_rows += 1


def build_features() -> list:
    features = []
    for (lat, lon), cell in grid.items():
        props = {
            "count": cell["crime_count"],
            "dominant_type": top_label(cell["crime_types"], "Unknown"),
            "reported_by": top_label(cell["forces"]),
            "crime_outcome_top": top_label(cell["crime_outcomes"]),
            "stop_search_total": cell["stop_count"],
            "stop_search_top_outcome": top_label(cell["stop_outcomes"]),
            "stop_search_top_object": top_label(cell["stop_objects"]),
            "stop_search_top_legislation": top_label(cell["stop_legislation"]),
            "stop_search_top_gender": top_label(cell["stop_gender"]),
            "stop_search_top_ethnicity": top_label(cell["stop_ethnicity"]),
            "outcome_total": cell["outcome_total"],
            "outcome_top": top_label(cell["outcome_types"]),
            "forces": [name for name, _ in cell["forces"].most_common(3)]
        }

        if cell["timeline"]:
            ordered_timeline = dict(sorted(cell["timeline"].items()))
            props["timeline"] = ordered_timeline
            props["latest_month"] = next(reversed(ordered_timeline))

        if cell["incident_samples"]:
            props["incident_samples"] = cell["incident_samples"]

        # Trim optional keys to keep file size sensible
        if not props["forces"]:
            props.pop("forces")
        if not props["reported_by"]:
            props.pop("reported_by", None)
        if props.get("stop_search_total", 0) == 0:
            for key in list(props.keys()):
                if key.startswith("stop_search_"):
                    props.pop(key)
        if props.get("outcome_total", 0) == 0:
            props.pop("outcome_total")
            props.pop("outcome_top", None)
        if not props.get("crime_outcome_top"):
            props.pop("crime_outcome_top", None)

        features.append({
            "type": "Feature",
            "properties": props,
            "geometry": {
                "type": "Point",
                "coordinates": [lon, lat]
            }
        })
    return features


def main() -> None:
    if not INPUT_DIR.exists():
        raise SystemExit(f"Input folder not found: {INPUT_DIR}")

    process_street_files()
    process_stop_and_search_files()
    process_outcomes_files()

    features = build_features()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    meta = {"months": sorted(all_months)}
    geojson = {"type": "FeatureCollection", "features": features, "meta": meta}

    with OUTPUT_PATH.open("w", encoding="utf-8") as handle:
        json.dump(geojson, handle, separators=(",", ":"))

    print("")
    print(f"Crime rows processed: {crime_rows:,}")
    print(f"Stop & search rows processed: {stop_rows:,}")
    print(f"Outcome rows processed: {outcome_rows:,}")
    print(f"Grid cells created: {len(features):,}")
    print(f"Output: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
