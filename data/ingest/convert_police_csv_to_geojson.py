import csv
import json
import os

INPUT_FOLDER = r"C:\Users\44752\Desktop\Control Room\data\Police Data"
OUTPUT_FILE = r"C:\Users\44752\Desktop\Control Room\data\processed\crime_street.geojson"

os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)

features = []

for root, dirs, files in os.walk(INPUT_FOLDER):

    for file in files:

        if file.endswith("-street.csv"):

            path = os.path.join(root, file)

            print("Processing:", path)

            with open(path, encoding="utf-8") as f:

                reader = csv.DictReader(f)

                for row in reader:

                    lat = row.get("Latitude")
                    lon = row.get("Longitude")

                    if not lat or not lon:
                        continue

                    try:
                        lat = float(lat)
                        lon = float(lon)
                    except:
                        continue

                    feature = {
                        "type": "Feature",
                        "properties": {
                            "crime_id": row.get("Crime ID"),
                            "month": row.get("Month"),
                            "location": row.get("Location"),
                            "crime_type": row.get("Crime type"),
                            "outcome": row.get("Last outcome category"),
                            "reported_by": row.get("Reported by")
                        },
                        "geometry": {
                            "type": "Point",
                            "coordinates": [lon, lat]
                        }
                    }

                    features.append(feature)

geojson = {
    "type": "FeatureCollection",
    "features": features
}

with open(OUTPUT_FILE, "w", encoding="utf-8") as f:

    json.dump(geojson, f, separators=(",", ":"))

print("")
print("DONE")
print("Crimes:", len(features))
print("Output:", OUTPUT_FILE)
