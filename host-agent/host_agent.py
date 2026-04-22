import websocket
import json
import subprocess
import threading
import time

WS_URL = "wss://signaling-server-631615784234.asia-south1.run.app"
DEVICE_ID = "control device"

lock_process = None

# -----------------------------
# HANDLE SERVER MESSAGES
# -----------------------------
def on_message(ws, message):
    global lock_process

    msg = json.loads(message)

    if msg["type"] == "system-lock":

        password = msg["password"]
        print("🔒 Lock command received")

        # Prevent multiple locks
        if lock_process is not None:
            print("Already locked")
            return

        # Start lock screen
        lock_process = subprocess.Popen(
            ["python", "lock_screen.py", password]
        )

        # Notify server
        ws.send(json.dumps({
            "type": "lock-status-update",
            "locked": True
        }))


# -----------------------------
# MONITOR LOCK PROCESS
# -----------------------------
def monitor_lock(ws):
    global lock_process

    while True:
        if lock_process is not None:

            # If process ended → unlocked
            if lock_process.poll() is not None:
                print("🔓 Unlocked")

                lock_process = None

                ws.send(json.dumps({
                    "type": "lock-status-update",
                    "locked": False
                }))

        time.sleep(1)


# -----------------------------
# ON CONNECT
# -----------------------------
def on_open(ws):
    print("✅ Connected to server")

    ws.send(json.dumps({
        "type": "register-host",
        "deviceId": DEVICE_ID
    }))

    threading.Thread(target=monitor_lock, args=(ws,), daemon=True).start()


def on_close(ws, *args):
    print("❌ Disconnected from server")


# -----------------------------
# START CLIENT
# -----------------------------
ws = websocket.WebSocketApp(
    WS_URL,
    on_open=on_open,
    on_message=on_message,
    on_close=on_close
)

ws.run_forever()
