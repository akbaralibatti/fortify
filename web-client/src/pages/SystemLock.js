import React, { useEffect, useState } from "react";

const WS_URL = "wss://signaling-server-631615784234.asia-south1.run.app";


function SystemLock() {
  const [lastPassword, setLastPassword] = useState("");
  const [password, setPassword] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [ws, setWs] = useState(null);

  useEffect(() => {

    const socket = new WebSocket(WS_URL);

    socket.onopen = () => {
      socket.send(JSON.stringify({
        type: "register-client",
        clientId: "lock-client",
        authenticated: true
      }));
    };

    socket.onmessage = (event) => {
  const msg = JSON.parse(event.data);

  if (msg.type === "lock-status") {
    setIsLocked(msg.locked);
  }

  if (msg.type === "initial-state") {
    setIsLocked(msg.locked);
    if (msg.password) {
      setLastPassword(msg.password);
    }
  }
};

    setWs(socket);

    return () => socket.close();

  }, []);

  const handleLock = () => {

  if (!password) {
    alert("Enter password");
    return;
  }

  ws.send(JSON.stringify({
    type: "system-lock",
    password
  }));

  setLastPassword(password); // 🔥 store locally also
};

  return (
    <div className="app-container">

      <h2>🔒 System Lock</h2>

      <input
        type="password"
        placeholder="Enter password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="form-input"
      />
      {lastPassword && (
        <div style={{ marginTop: 10 }}>
          Last Password: <strong>{lastPassword}</strong>
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <button className="btn-host" onClick={handleLock}>
          🔒 Lock System
        </button>
      </div>

      <div style={{ marginTop: 20 }}>
        Status: <strong>{isLocked ? "LOCKED 🔒" : "UNLOCKED 🔓"}</strong>
      </div>

    </div>
  );
}

export default SystemLock;
