import os
import re

PROJECT_ROOT = r"C:\Users\44752\Desktop\Control Room"

js_files_modified = []


def read_file_safely(filepath):
    try:
        with open(filepath, "r", encoding="utf-8") as f:
            return f.read()
    except UnicodeDecodeError:
        try:
            with open(filepath, "r", encoding="cp1252") as f:
                return f.read()
        except Exception:
            return None


def write_file_safely(filepath, content):
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)


def process_file(filepath):
    content = read_file_safely(filepath)

    if content is None:
        print(f"Skipped (binary or unreadable): {filepath}")
        return

    original_content = content

    # Replace fetch(`/ch/...`)
    content = re.sub(
        r'fetch\s*\(\s*`\/ch(.*?)`\s*\)',
        r'fetchCH(`\1`)',
        content
    )

    # Replace fetch("/ch/...")
    content = re.sub(
        r'fetch\s*\(\s*"\/ch(.*?)"\s*\)',
        r'fetchCH("\1")',
        content
    )

    # Replace fetch('/ch/...')
    content = re.sub(
        r"fetch\s*\(\s*'\/ch(.*?)'\s*\)",
        r"fetchCH('\1')",
        content
    )

    if content != original_content:
        backup_path = filepath + ".bak"

        write_file_safely(backup_path, original_content)
        write_file_safely(filepath, content)

        js_files_modified.append(filepath)


def main():
    print("Scanning project for proxy mode fetch calls...\n")

    for root, _, files in os.walk(PROJECT_ROOT):
        for file in files:
            if file.endswith(".js"):
                full_path = os.path.join(root, file)
                process_file(full_path)

    if js_files_modified:
        print("\nModified files:\n")
        for f in js_files_modified:
            print(f)
    else:
        print("No proxy calls found.")

    print("\nDone.")


if __name__ == "__main__":
    main()
