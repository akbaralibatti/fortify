# Fortify — Secure Remote Desktop with Intruder Detection

Fortify is a secure remote desktop system enhanced with real-time intruder detection. It combines WebRTC-based remote control with a computer vision security layer that monitors unauthorized access using facial recognition. When an unknown face is detected, the system captures evidence, uploads it to the cloud, and instantly notifies connected users.

The project integrates three main components: a host agent running on the controlled computer, a signaling server that manages communication between devices, and a web dashboard used to control the remote machine. A Python-based face authorization module continuously monitors the host system to ensure only authorized users are present.

---

## System Overview

The system works as a multi-layer architecture combining remote access and security monitoring.

Remote control is achieved through WebRTC signaling handled by a Node.js server. A host agent running on the target computer registers itself with the server, while authenticated clients connect through a web interface. Once connected, users can view and control the host machine.

Alongside this, a face recognition module continuously checks the webcam feed of the host machine. If an unauthorized face appears, the system captures images, uploads them to Google Cloud Storage, and triggers an alert notification through Firebase Cloud Messaging.

---

## Architecture

```
                ┌───────────────────────┐
                │   Web Client (React)  │
                │ Remote Control Panel  │
                └─────────────┬─────────┘
                              │ WebSocket
                              ▼
                ┌─────────────────────────┐
                │  Signaling Server       │
                │  Node.js + WebSocket    │
                └─────────────┬───────────┘
                              │
          ┌───────────────────┴───────────────────┐
          ▼                                       ▼
 ┌────────────────────┐                 ┌─────────────────────┐
 │ Host Agent         │                 │ Face Authorization   │
 │ Node.js (target PC)│                 │ Python + OpenCV      │
 └───────────┬────────┘                 └───────────┬─────────┘
             │                                      │
             ▼                                      ▼
      Remote Desktop Control                Intruder Detection
             │                                      │
             ▼                                      ▼
       Host Computer                      Google Cloud Storage
                                                     │
                                                     ▼
                                          Firebase Push Notification
                                                     │
                                                     ▼
                                            User Mobile / Browser
```

---

## Key Features

Secure remote desktop access using WebRTC.
Real-time face recognition authentication.
Automatic intruder image capture.
Cloud storage for incident evidence.
Push notifications to web and mobile devices.
Multi-device host discovery through WebSocket signaling.
Touch and keyboard remote control support.

---

## Technology Stack

**Frontend**

* React
* WebRTC
* Firebase Cloud Messaging

**Backend**

* Node.js
* Express
* WebSocket (ws)

**Security Module**

* Python
* OpenCV
* LBPH Face Recognizer

**Cloud Services**

* Google Cloud Storage
* Firebase Cloud Messaging
* Google Cloud Run

---

## Project Structure

```
fortify/
│
├── server/
│   ├── index.js
│   └── firebase-admin.json
│
├── web-client/
│   ├── src/
│   │   ├── App.js
│   │   ├── firebase.js
│   │   └── App.css
│   └── public/
│       └── firebase-messaging-sw.js
│
├── host-agent/
│   ├── index.js
│   └── config.json
│
├── face-auth/
│   ├── face_auth_with_gcs.py
│   ├── dataset/
│   └── unauthorized/
│
└── README.md
```

---

## How It Works

### 1. Host Registration

The host agent connects to the signaling server and registers its device ID. The server keeps track of available hosts.

### 2. Client Authentication

Users log in through the web dashboard and request the list of available hosts.

### 3. Remote Connection

Once a host is selected, WebRTC signaling establishes a peer-to-peer connection allowing screen streaming and remote input control.

### 4. Face Monitoring

The Python face authorization module continuously scans the webcam feed and compares detected faces against the authorized dataset.

### 5. Intruder Detection

If an unknown face is detected:

* Five images are captured
* Images are stored locally
* Images are uploaded to Google Cloud Storage

### 6. Alert Notification

After uploading the images, the Python script sends a request to the signaling server. The server then sends push notifications through Firebase Cloud Messaging.

Users immediately receive an alert containing the device ID and timestamp of the incident.

---

## Setup Instructions

### 1. Clone the Repository

```
git clone https://github.com/your-username/fortify.git
cd fortify
```

---

### 2. Install Server Dependencies

```
cd server
npm install
```

Start the signaling server:

```
node index.js
```

---

### 3. Run the Web Client

```
cd web-client
npm install
npm start
```

For production deployment:

```
npm run build
firebase deploy
```

---

### 4. Configure Firebase

Enable Firebase Cloud Messaging and download the admin SDK credentials.
Place the file in the server directory as:

```
firebase-admin.json
```

---

### 5. Configure Google Cloud Storage

Create a bucket and grant read access:

```
gsutil iam ch allUsers:objectViewer gs://your-bucket-name
```

---

### 6. Run Face Authorization Module

```
cd face-auth
python face_auth_with_gcs.py
```

Ensure your dataset contains authorized user images.

---

## Security Considerations

Passwords should be hashed using a secure algorithm such as bcrypt.
Notification tokens should be stored in a persistent database.
WebSocket connections should be secured using authentication tokens.
Face recognition datasets should be protected and updated periodically.

---

## Future Improvements

Multi-user access control.
Intruder alert dashboard with live image feed.
Mobile application for alerts.
Improved face recognition models using deep learning.
Automated cloud event triggers for intrusion detection.

---

## Author

Developed as a secure remote desktop system integrating computer vision and cloud notification technologies.

---

## License

This project is intended for educational and research purposes.
