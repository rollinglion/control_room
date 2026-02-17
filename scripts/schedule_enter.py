import time
import pyautogui
from datetime import datetime

# ===== CONFIG =====
TARGET_TIME = "09:05:00"   # HH:MM:SS (24hr)
# ==================

print(f"Waiting until {TARGET_TIME} to press Enter...")

while True:
    now = datetime.now().strftime("%H:%M:%S")

    if now == TARGET_TIME:
        print("Pressing Enter now.")
        pyautogui.press("enter")
        break

    time.sleep(0.5)
