import requests
import os
import time

API_TOKEN = "6eb684ed401640309c4826f4da16b63c"

COLLECTION_UID = "00d22c2772c544629f28a2b6250d45a6"

OUTPUT_DIR = r"C:\Users\44752\Desktop\Control Room\data\vehicles\sketchfab_collection"

headers = {
    "Authorization": f"Token {API_TOKEN}"
}

os.makedirs(OUTPUT_DIR, exist_ok=True)


def get_collection_models(collection_uid):

    url = f"https://api.sketchfab.com/v3/collections/1fe4fde8c14445ac81391fb1472d7dad/models"

    models = []

    while url:

        r = requests.get(url, headers=headers)

        if r.status_code != 200:
            print("Failed to fetch collection")
            print(r.text)
            return models

        data = r.json()

        models.extend(data["results"])

        url = data["next"]

    return models


def download_model(uid, name):

    try:

        info_url = f"https://api.sketchfab.com/v3/models/{uid}/download"

        r = requests.get(info_url, headers=headers)

        if r.status_code != 200:
            print(f"Skipping {name} (API access denied)")
            return

        data = r.json()

        download_url = None
        ext = None

        # Priority order
        if "glb" in data and data["glb"]:
            download_url = data["glb"]["url"]
            ext = "glb"

        elif "gltf" in data and data["gltf"]:
            download_url = data["gltf"]["url"]
            ext = "zip"

        elif "original" in data and data["original"]:
            download_url = data["original"]["url"]
            ext = "zip"

        else:
            print(f"Skipping {name} (no downloadable formats)")
            return


        safe_name = "".join(c for c in name if c.isalnum() or c in " _-").strip()

        filename = os.path.join(OUTPUT_DIR, f"{safe_name}_{uid}.{ext}")

        print(f"Downloading: {name}")

        with requests.get(download_url, stream=True) as r:
            r.raise_for_status()

            with open(filename, "wb") as f:
                for chunk in r.iter_content(8192):
                    f.write(chunk)

        time.sleep(1)


    except Exception as e:

        print(f"FAILED: {name}")
        print(e)

        # continue script regardless
        return


print("Fetching collection models...")

models = get_collection_models(COLLECTION_UID)

print(f"Found {len(models)} models")

for model in models:

    uid = model["uid"]
    name = model["name"]

    download_model(uid, name)

print("Complete.")
