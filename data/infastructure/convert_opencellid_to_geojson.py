import csv
import json
import os

# INPUT CSV
INPUT_FILE = r"C:\Users\44752\Desktop\Control Room\data\infastructure\cell_towers_uk.csv"

# OUTPUT GEOJSON
OUTPUT_FILE = r"C:\Users\44752\Desktop\Control Room\data\infastructure\cell_towers_uk.geojson"

# OPTIONAL: limit number for testing (set to None for full dataset)
LIMIT = None
# LIMIT = 5000


def main():

    print("Reading OpenCellID CSV...")

    features = []
    count = 0
    skipped = 0

    with open(INPUT_FILE, newline='', encoding='utf-8') as csvfile:

        reader = csv.reader(csvfile)

        for row in reader:

            try:
                radio = row[0]
                mcc = row[1]
                mnc = row[2]
                lac = row[3]
                cellid = row[4]
                lon = float(row[6])
                lat = float(row[7])

                # Skip invalid coords
                if lat == 0 or lon == 0:
                    skipped += 1
                    continue

                feature = {
                    "type": "Feature",
                    "properties": {
                        "radio": radio,
                        "mcc": mcc,
                        "mnc": mnc,
                        "lac": lac,
                        "cellid": cellid
                    },
                    "geometry": {
                        "type": "Point",
                        "coordinates": [lon, lat]
                    }
                }

                features.append(feature)

                count += 1

                if LIMIT and count >= LIMIT:
                    break

                if count % 10000 == 0:
                    print(f"Processed {count} towers...")

            except Exception:
                skipped += 1
                continue

    geojson = {
        "type": "FeatureCollection",
        "features": features
    }

    print("Writing GeoJSON...")

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(geojson, f, separators=(",", ":"))

    print("")
    print("DONE")
    print(f"Converted: {count}")
    print(f"Skipped: {skipped}")
    print(f"Output: {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
