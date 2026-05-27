import socket
import os

HOST = "0.0.0.0"
PORT = 5000

print("Laptop agent started. Waiting for commands...")

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind((HOST, PORT))
server.listen(1)

while True:
    conn, addr = server.accept()
    print("Connected by", addr)

    data = conn.recv(1024).decode()

    if data == "LOCK":
        print("Lock command received")
        os.system("rundll32.exe user32.dll,LockWorkStation")

    conn.close()
