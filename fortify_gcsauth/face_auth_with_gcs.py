import cv2
import os
import numpy as np
import time
import requests
from datetime import datetime
from google.cloud import storage
import smtplib
from email.mime.text import MIMEText

# ---------------- GOOGLE CLOUD AUTH ----------------
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = r"C:\Users\AKBARALI\Desktop\rd4\fortify_gcsauth\remotedesk-485214-d0b7303b743a.json"

# ---------------- CONFIG ----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
UNAUTHORIZED_DIR = "unauthorized"
BUCKET_NAME = "remotedesktop-face-dataset-akbarali"

NUM_UNAUTHORIZED_IMAGES = 5
MIN_FACE_SIZE = 100
MARGIN = 0.30
CONFIDENCE_THRESHOLD = 70

RUN_DURATION_SECONDS = 9999
UPLOAD_COOLDOWN = 3

SERVER_ALERT_URL = "https://signaling-server-631615784234.asia-south1.run.app/intruder-alert"
DEVICE_ID = "host-e6uys7ds"
SHOW_WINDOW = True
# ----------------------------------------

#for this device location
def get_device_location():
    try:
        url = f"{SERVER_ALERT_URL.replace('/intruder-alert','')}/device-location/{DEVICE_ID}"

        res = requests.get(url, timeout=3)
        data = res.json()

        lat = data.get("lat")
        lon = data.get("lon")

        if not lat or not lon:
            return "Location not available"

        geo_url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lon}&format=json"

        headers = {"User-Agent": "fortify-app"}

        geo_res = requests.get(geo_url, headers=headers, timeout=5)
        geo_data = geo_res.json()

        return geo_data.get("display_name", f"{lat}, {lon}")

    except Exception as e:
        print("Location error:", e)
        return "Unknown Location"


def ensure_dir(path):
    if not os.path.exists(path):
        os.makedirs(path)


def get_face_crop(frame, x, y, w, h, margin=MARGIN):

    img_h, img_w = frame.shape[:2]

    margin_x = int(w * margin)
    margin_y = int(h * margin)

    x1 = max(0, x - margin_x)
    y1 = max(0, y - margin_y)
    x2 = min(img_w, x + w + margin_x)
    y2 = min(img_h, y + h + margin_y)

    return frame[y1:y2, x1:x2]


def load_training_data(dataset_dir, face_cascade):

    faces = []
    labels = []
    label_map = {}
    current_label = 0

    if not os.path.exists(dataset_dir):
        raise Exception("Dataset folder not found")

    for person_name in os.listdir(dataset_dir):

        person_path = os.path.join(dataset_dir, person_name)

        if not os.path.isdir(person_path):
            continue

        label_map[current_label] = person_name

        for img_file in os.listdir(person_path):

            img_path = os.path.join(person_path, img_file)

            img = cv2.imread(img_path)

            if img is None:
                continue

            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

            detected = face_cascade.detectMultiScale(gray, 1.3, 5)

            if len(detected) == 0:
                continue

            x, y, w, h = detected[0]

            face_roi = gray[y:y+h, x:x+w]

            faces.append(face_roi)
            labels.append(current_label)

        current_label += 1

    print(f"Loaded {len(faces)} training faces")

    return faces, np.array(labels), label_map


def upload_folder_to_gcs(bucket, local_folder, cloud_prefix):

    uploaded_files = []

    for filename in os.listdir(local_folder):

        local_path = os.path.join(local_folder, filename)

        if not os.path.isfile(local_path):
            continue

        blob = bucket.blob(f"{cloud_prefix}/{filename}")
        blob.upload_from_filename(local_path)

        print(f"Uploaded {filename} to cloud")

        uploaded_files.append(filename)

    return uploaded_files


def send_intruder_alert(image_url):

    payload = {
    "deviceId": DEVICE_ID,
    "image": image_url,
    "time": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
    "location": get_device_location()
}


    try:

        response = requests.post(SERVER_ALERT_URL, json=payload, timeout=5)

        if response.status_code == 200:
            print("Alert sent to server successfully")
        else:
            print("Server returned error:", response.status_code)

    except Exception as e:
        print("Failed to notify server:", e)

def send_email_alert(image_url):

    sender_email = "akbaralibatti123@gmail.com"
    app_password = "qxdjwlrtfosprqpu"
    receiver_email = "aliakbatti@gmail.com"

    subject = "⚠️ Intruder Detected"

    body = f"""
    Unauthorized access detected!

    Device: {DEVICE_ID}
    Time: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
    Location: {get_device_location()}
    App: {"https://remotedesk-485214.web.app/intruders"}
    Image:
    {image_url}
    """

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = sender_email
    msg["To"] = receiver_email

    try:
        server = smtplib.SMTP("smtp.gmail.com", 587)
        server.starttls()
        server.login(sender_email, app_password)
        server.send_message(msg)
        server.quit()

        print("Email alert sent successfully")

    except Exception as e:
        print("Email failed:", e)

def main():

    print("Starting Face Authorization System...")

    ensure_dir(UNAUTHORIZED_DIR)

    BASE_DIR = os.path.dirname(os.path.abspath(__file__))
    CASCADE_PATH = os.path.join(BASE_DIR, "haarcascade_frontalface_default.xml")

    face_cascade = cv2.CascadeClassifier(CASCADE_PATH)

    if face_cascade.empty():
        print("Haar cascade not loaded")
        return

    faces, labels, label_map = load_training_data(DATASET_DIR, face_cascade)

    recognizer = cv2.face.LBPHFaceRecognizer_create() # type: ignore
    recognizer.train(faces, labels)

    print("Face recognizer trained successfully")

    client = storage.Client()
    bucket = client.bucket(BUCKET_NAME)

    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Camera not accessible")
        return

    unauthorized_count = 0
    session_folder = None
    cloud_prefix = None
    last_upload_time = 0

    print("Webcam started")

    start_time = time.time()

    while True:

        ret, frame = cap.read()

        if not ret:
            break

        if time.time() - start_time >= RUN_DURATION_SECONDS:
            break

        current_time = time.time()

        if current_time - last_upload_time < UPLOAD_COOLDOWN:

            cv2.putText(frame, "Cooldown active",
                        (20, 40),
                        cv2.FONT_HERSHEY_SIMPLEX,
                        1,
                        (0, 255, 255),
                        2)

            if SHOW_WINDOW:
                cv2.imshow("Face Authorization", frame)

                if cv2.waitKey(1) & 0xFF == ord('q'):
                    break
            else:
                time.sleep(0.03)

            continue

        gray_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)

        faces_detected = face_cascade.detectMultiScale(gray_frame, 1.3, 5)

        display_text = "No Face"
        text_color = (0, 0, 255)

        if len(faces_detected) > 0:

            faces_detected = sorted(
                faces_detected,
                key=lambda f: f[2]*f[3],
                reverse=True
            )

            x, y, w, h = faces_detected[0]

            if w >= MIN_FACE_SIZE and h >= MIN_FACE_SIZE:

                face_roi_gray = gray_frame[y:y+h, x:x+w]

                label_id, confidence = recognizer.predict(face_roi_gray)

                if confidence < CONFIDENCE_THRESHOLD:

                    name = label_map.get(label_id, "UNKNOWN")

                    display_text = name
                    text_color = (0, 255, 0)

                else:

                    display_text = "UNAUTHORIZED"
                    text_color = (0, 0, 255)

                    if session_folder is None:

                        ts = datetime.now().strftime("%Y%m%d_%H%M%S")

                        session_folder = os.path.join(
                            UNAUTHORIZED_DIR,
                            f"unauthorized_{ts}"
                        )

                        ensure_dir(session_folder)

                        cloud_prefix = f"unauthorized/unauthorized_{ts}"

                        unauthorized_count = 0

                        print("Unauthorized detected")

                    if unauthorized_count < NUM_UNAUTHORIZED_IMAGES:

                        face_color = get_face_crop(frame, x, y, w, h)

                        unauthorized_count += 1

                        filename = f"{unauthorized_count}.jpg"

                        local_path = os.path.join(session_folder, filename)

                        cv2.imwrite(local_path, face_color)

                        print(f"Captured {unauthorized_count}/5")

                        time.sleep(0.4)

                        if unauthorized_count == NUM_UNAUTHORIZED_IMAGES:

                            print("Uploading images to cloud...")

                            uploaded = upload_folder_to_gcs(
                                bucket,
                                session_folder,
                                cloud_prefix
                            )

                            print("Upload complete")

                            time.sleep(2)

                            latest_image = uploaded[-1]

                            image_url = f"https://storage.googleapis.com/{BUCKET_NAME}/{cloud_prefix}/{latest_image}"

                            send_intruder_alert(image_url)
                            send_email_alert(image_url)

                            last_upload_time = time.time()

                            session_folder = None
                            cloud_prefix = None
                            unauthorized_count = 0

        if len(faces_detected) > 0:

            x, y, w, h = faces_detected[0]

            cv2.rectangle(
                frame,
                (x, y),
                (x+w, y+h),
                text_color,
                2
            )

        cv2.putText(
            frame,
            display_text,
            (20, 40),
            cv2.FONT_HERSHEY_SIMPLEX,
            1,
            text_color,
            2
        )

        if SHOW_WINDOW:
            cv2.imshow("Face Authorization", frame)

            if cv2.waitKey(1) & 0xFF == ord('q'):
                break
        else:
            time.sleep(0.03)

    cap.release()
    cv2.destroyAllWindows()

    print("Program stopped")


if __name__ == "__main__":
    main()
