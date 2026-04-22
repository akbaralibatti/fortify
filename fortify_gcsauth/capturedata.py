import cv2
import os

# ---------- CONFIG ----------
NUM_IMAGES = 600
MIN_FACE_SIZE = 100
MARGIN = 0.2   # 20% extra area around face
# ---------------------------

# ---------- STEP 1: ASK NAME ----------
name = input("Enter person name: ").strip()

if not name:
    print("❌ Name cannot be empty")
    exit()

print(f"📸 Capturing images for: {name}")

# ---------- STEP 2: CREATE FOLDER ON DESKTOP ----------
desktop_path = os.path.join(os.path.expanduser("~"), "Desktop")
dataset_dir = os.path.join(desktop_path, "dataset", name)

os.makedirs(dataset_dir, exist_ok=True)

# Optional: delete old images in same folder
for f in os.listdir(dataset_dir):
    if f.lower().endswith(".jpg"):
        os.remove(os.path.join(dataset_dir, f))

print(f"📂 Saving images to: {dataset_dir}")

# ---------- STEP 3: LOAD FACE DETECTOR ----------
face_cascade = cv2.CascadeClassifier(
    cv2.data.haarcascades + "haarcascade_frontalface_default.xml" # type: ignore
)

if face_cascade.empty():
    print("❌ Haar cascade not loaded")
    exit()

# ---------- STEP 4: OPEN CAMERA ----------
cap = cv2.VideoCapture(0)

if not cap.isOpened():
    print("❌ Camera not accessible")
    exit()

count = 501
print("🎯 Camera opened. Look at the camera... Press Q to stop.")

# ---------- STEP 5: CAPTURE LOOP ----------
while count < NUM_IMAGES:
    ret, frame = cap.read()
    if not ret:
        break

    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, 1.3, 5)

    if len(faces) == 0:
        cv2.putText(frame, "No face detected", (20, 40),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)
    else:
        # Take biggest face
        faces = sorted(faces, key=lambda x: x[2]*x[3], reverse=True)
        x, y, w, h = faces[0]

        if w >= MIN_FACE_SIZE and h >= MIN_FACE_SIZE:
            img_h, img_w, _ = frame.shape

            margin_x = int(w * MARGIN)
            margin_y = int(h * MARGIN)

            x1 = max(0, x - margin_x)
            y1 = max(0, y - margin_y)
            x2 = min(img_w, x + w + margin_x)
            y2 = min(img_h, y + h + margin_y)

            face_img = frame[y1:y2, x1:x2]

            count += 1
            file_path = os.path.join(dataset_dir, f"{count}.jpg")
            cv2.imwrite(file_path, face_img)

            print(f"✅ Saved image {count}/{NUM_IMAGES} -> {file_path}")

            # draw rectangle on screen
            cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)

    cv2.imshow("Face Dataset Capture", frame)

    if cv2.waitKey(1) & 0xFF == ord("q"):
        break

# ---------- STEP 6: CLEANUP ----------
cap.release()
cv2.destroyAllWindows()

print("🎉 Done! Images saved locally.")
