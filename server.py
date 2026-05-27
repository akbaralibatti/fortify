import socket

HOST = "0.0.0.0"
PORT = 5000

print("Host agent running...")

server = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
server.bind((HOST, PORT))
server.listen(1)

while True:
    conn, addr = server.accept()
    print("Connected from:", addr)

    data = conn.recv(1024).decode()
    print("Received:", data)

    conn.close()