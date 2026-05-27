import cv2
import os
from datetime import datetime

IMAGE_DIR = "captures"

def capture_image():
    os.makedirs(IMAGE_DIR, exist_ok=True)

    cam = cv2.VideoCapture(0)
    if not cam.isOpened():
        return None

    ret, frame = cam.read()
    cam.release()

    if not ret:
        return None

    filename = f"intruder_{datetime.now().strftime('%Y%m%d_%H%M%S')}.jpg"
    path = os.path.join(IMAGE_DIR, filename)
    cv2.imwrite(path, frame)

    return path
