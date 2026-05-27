"""
Fortify OS Monitoring Agent
Windows Host-Based Intrusion Detection System
"""

import time
import os
import socket
import platform
from pynput import keyboard, mouse
import cv2
from cryptography.fernet import Fernet

# -----------------------------
# CONFIG
# -----------------------------
ARMED = True                 # System armed for intrusion detection
IDLE_THRESHOLD = 500         # Seconds after activity considered intrusion
CAPTURE_DIR = "captures"
LOG_DIR = "logs"
KEY_FILE = "secret.key"

os.makedirs(CAPTURE_DIR, exist_ok=True)
os.makedirs(LOG_DIR, exist_ok=True)

# -----------------------------
# ENCRYPTION SETUP
# -----------------------------
def load_key():
    if os.path.exists(KEY_FILE):
        return open(KEY_FILE, "rb").read()
    key = Fernet.generate_key()
    open(KEY_FILE, "wb").write(key)
    return key

fernet = Fernet(load_key())

def log_event(message):
    encrypted = fernet.encrypt(message.encode())
    with open(f"{LOG_DIR}/events.enc", "ab") as f:
        f.write(encrypted + b"\n")

# -----------------------------
# SYSTEM INFO
# -----------------------------
def get_ip():
    try:
        return socket.gethostbyname(socket.gethostname())
    except:
        return "UNKNOWN"

# -----------------------------
# WEBCAM CAPTURE
# -----------------------------
def capture_image():
    cam = cv2.VideoCapture(0)
    ret, frame = cam.read()
    filename = f"{CAPTURE_DIR}/intruder_{int(time.time())}.jpg"
    if ret:
        cv2.imwrite(filename, frame)
    cam.release()
    return filename if ret else "NO_IMAGE"

# -----------------------------
# OS LOCK
# -----------------------------
def lock_system():
    if platform.system() == "Windows":
        os.system("rundll32.exe user32.dll,LockWorkStation")

# -----------------------------
# INPUT LISTENER (OS ACTIVITY)
# -----------------------------
last_activity = time.time()

def on_key_press(key):
    global last_activity
    last_activity = time.time()

def on_mouse_move(x, y):
    global last_activity
    last_activity = time.time()

keyboard.Listener(on_press=on_key_press).start()
mouse.Listener(on_move=on_mouse_move).start()

# -----------------------------
# INTRUSION CHECK
# -----------------------------
def intrusion_detected():
    if not ARMED:
        return False
    return time.time() - last_activity < IDLE_THRESHOLD

# -----------------------------
# MAIN LOOP
# -----------------------------
print("Monitoring agent started...")

while True:
    if intrusion_detected():
        img = capture_image()
        ip = get_ip()
        event = f"UNAUTHORIZED ACCESS | IP={ip} | IMAGE={img}"
        log_event(event)
        lock_system()
        time.sleep(10)   # Prevent repeated triggers
    time.sleep(1)
