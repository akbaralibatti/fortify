import json
import os
from datetime import datetime
from security import get_fernet

LOG_DIR = "logs"
LOG_FILE = os.path.join(LOG_DIR, "events.enc")

fernet = get_fernet()

def log_event(event_type, details):
    os.makedirs(LOG_DIR, exist_ok=True)

    event = {
        "timestamp": datetime.now().isoformat(),
        "event_type": event_type,
        "details": details
    }

    data = []

    if os.path.exists(LOG_FILE):
        with open(LOG_FILE, "rb") as f:
            decrypted = fernet.decrypt(f.read()).decode()
            data = json.loads(decrypted)

    data.append(event)

    encrypted = fernet.encrypt(json.dumps(data).encode())

    with open(LOG_FILE, "wb") as f:
        f.write(encrypted)
