from cryptography.fernet import Fernet
import os

KEY_FILE = "secret.key"

def generate_key():
    if not os.path.exists(KEY_FILE):
        key = Fernet.generate_key()
        with open(KEY_FILE, "wb") as f:
            f.write(key)

def load_key():
    return open(KEY_FILE, "rb").read()

def get_fernet():
    generate_key()
    key = load_key()
    return Fernet(key)
