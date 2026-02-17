import os
import subprocess

SOURCE_DIR = r"C:\Users\44752\Desktop\Control Room\gfx\vehicle_icons\DMI_3D_Icons"
DEST_DIR = r"C:\Users\44752\Desktop\Control Room\gfx\vehicle_icons\extracted"

SEVENZIP = r"C:\Program Files\7-Zip\7z.exe"

os.makedirs(DEST_DIR, exist_ok=True)

archives = []

for root, dirs, files in os.walk(SOURCE_DIR):
    for file in files:
        if file.lower().endswith((".zip", ".rar")):
            archives.append(os.path.join(root, file))

print(f"Found {len(archives)} archives")

for archive in archives:

    name = os.path.splitext(os.path.basename(archive))[0]
    out_folder = os.path.join(DEST_DIR, name)

    os.makedirs(out_folder, exist_ok=True)

    print("Extracting:", archive)

    subprocess.run([
        SEVENZIP,
        "x",
        archive,
        f"-o{out_folder}",
        "-y"
    ])

print("DONE")
