import websocket
import json
import time
import threading

API_KEY = "48f05eedd37f197271eee83920267a8d1b73196b"

OUTPUT_FILE = r"C:\Users\44752\Desktop\Control Room\data\live\ships_live.json"

ships = {}

def save_loop():
    while True:
        try:
            with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
                json.dump(list(ships.values()), f)
        except Exception as e:
            print("Save error:", e)

        time.sleep(5)


def on_message(ws, message):

    try:
        data = json.loads(message)

        # AISStream wraps inside Message
        msg = data.get("Message", {})

        if "PositionReport" in msg:

            report = msg["PositionReport"]

            mmsi = report.get("UserID")

            if not mmsi:
                return

            ships[mmsi] = {

                "mmsi": mmsi,
                "lat": report.get("Latitude"),
                "lon": report.get("Longitude"),
                "speed": report.get("Sog"),
                "heading": report.get("Cog")

            }

            print(f"Ship saved: {mmsi}")

    except Exception as e:

        print("Parse error:", e)



def on_open(ws):

    print("Connected to AISStream")
    print("Subscribing with API key:", API_KEY[:6], "...")
    subscribe_message = {
        "APIKey": API_KEY,
        "BoundingBoxes": [
            [
                [48.0, -12.0],
                [62.0, 5.0]
            ]
        ]
    }

    ws.send(json.dumps(subscribe_message))

    print("Subscription sent")



def run():

    threading.Thread(target=save_loop, daemon=True).start()

    ws = websocket.WebSocketApp(

        "wss://stream.aisstream.io/v0/stream",

        on_message=on_message,
        on_open=on_open

    )

    ws.run_forever()


if __name__ == "__main__":
    run()
