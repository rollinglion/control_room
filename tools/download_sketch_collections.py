import requests
import os
import time
import re

API_TOKEN = "6eb684ed401640309c4826f4da16b63c"

# PASTE FULL COLLECTION URLS HERE
COLLECTION_URLS = [
    "https://sketchfab.com/timblewee/models"
]
OUTPUT_DIR = r"C:\Users\44752\Desktop\Control Room\data\vehicles\police"

headers = {
    "Authorization": f"Token {API_TOKEN}"
}

os.makedirs(OUTPUT_DIR, exist_ok=True)


# =====================================================
# EXTRACT UID FROM COLLECTION URL
# =====================================================

def extract_uid(url):

    match = re.search(r'collections/.*-([a-f0-9]{32})', url)

    if match:
        return match.group(1)

    print("Invalid collection URL:", url)
    return None


# =====================================================
# FETCH COLLECTION MODELS
# =====================================================

def get_collection_models(collection_uid):

    url = f"https://api.sketchfab.com/v3/collections/{collection_uid}/models"

    models = []

    while url:

        try:

            r = requests.get(url, headers=headers)

            if r.status_code != 200:
                print(f"Failed collection fetch: {collection_uid}")
                print(r.text)
                return models

            data = r.json()

            models.extend(data.get("results", []))

            url = data.get("next")

        except Exception as e:

            print("Collection fetch error:", e)
            break

    return models


# =====================================================
# SAVE CREDIT FILE
# =====================================================

def save_credit_file(model, base_path):

    try:

        credit = f"""{model['name']}

Creator: {model['user']['displayName']}

License: {model['license']['label']}

Source:
{model['viewerUrl']}
"""

        with open(base_path + "_CREDIT.txt", "w", encoding="utf-8") as f:
            f.write(credit)

    except:
        pass


# =====================================================
# DOWNLOAD MODEL
# =====================================================

def download_model(model):

    uid = model["uid"]
    name = model["name"]

    try:

        safe_name = "".join(c for c in name if c.isalnum() or c in " _-").strip()

        base_path = os.path.join(OUTPUT_DIR, f"{safe_name}_{uid}")

        if (
            os.path.exists(base_path + ".glb") or
            os.path.exists(base_path + ".zip")
        ):
            print(f"Skipping {name} (already exists)")
            return


        info_url = f"https://api.sketchfab.com/v3/models/{uid}/download"

        r = requests.get(info_url, headers=headers)

        if r.status_code != 200:
            print(f"Skipping {name} (no permission)")
            return

        data = r.json()

        download_url = None
        ext = None


        if "glb" in data and data["glb"]:
            download_url = data["glb"]["url"]
            ext = ".glb"

        elif "gltf" in data and data["gltf"]:
            download_url = data["gltf"]["url"]
            ext = ".zip"

        elif "original" in data and data["original"]:
            download_url = data["original"]["url"]
            ext = ".zip"

        else:
            print(f"Skipping {name} (no downloadable format)")
            return


        print(f"Downloading: {name}")

        with requests.get(download_url, stream=True) as download:

            download.raise_for_status()

            with open(base_path + ext, "wb") as f:

                for chunk in download.iter_content(8192):
                    if chunk:
                        f.write(chunk)


        save_credit_file(model, base_path)

        time.sleep(1)


    except Exception as e:

        print(f"FAILED: {name}")
        print(e)


# =====================================================
# MAIN
# =====================================================

all_models = []

print("Fetching collections...")

for collection_url in COLLECTION_URLS:

    uid = extract_uid(collection_url)

    if not uid:
        continue

    print(f"\nFetching collection: {collection_url}")

    models = get_collection_models(uid)

    print(f"Found {len(models)} models")

    all_models.extend(models)


# Remove duplicates
unique_models = {model["uid"]: model for model in all_models}.values()

print(f"\nTotal unique models: {len(unique_models)}")


for model in unique_models:

    download_model(model)


print("\nComplete.")
