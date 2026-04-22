import React, { useEffect, useRef, useState, useCallback } from "react";
import './App.css';
import { messaging } from "./firebase";
import { getToken } from "firebase/messaging";
import { BrowserRouter, Routes, Route } from "react-router-dom";

import Dashboard from "./pages/Dashboard";
import RemoteAccess from "./pages/RemoteAccess";
import IntruderMonitor from "./pages/IntruderMonitor";
import SystemLock from "./pages/SystemLock";
const WS_URL = "wss://signaling-server-631615784234.asia-south1.run.app";
const API_URL = "https://signaling-server-631615784234.asia-south1.run.app";

// Persist CLIENT_ID so the host recognises the same client after refresh
const CLIENT_ID = (() => {
  let id = localStorage.getItem("clientId");
  if (!id) {
    id = "web-" + Math.random().toString(36).slice(2, 8);
    localStorage.setItem("clientId", id);
  }
  return id;
})();
//Request notification
async function requestNotificationPermission() {
  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    const token = await getToken(messaging, {
      vapidKey: "BM6gZYV0hwQeVqEOZNH1JJYdwDxY-A3-JaGkFUorHqmlMylIZArDhI4VcnzZ4pZHMQxJ6W3G4yWaKYt5ctNvkN4"
    });

    console.log("FCM Token:", token);

    // send token to your server
    fetch("https://signaling-server-631615784234.asia-south1.run.app/register-token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ token })
    });
  }
}

// HELPER FOR SAFARI CODECS
const preferH264 = (sdp) => {
  const lines = sdp.split('\r\n');
  const h264Payloads = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('a=rtpmap') && lines[i].toLowerCase().includes('h264')) {
      const match = lines[i].match(/a=rtpmap:(\d+) H264/i);
      if (match) h264Payloads.push(match[1]);
    }
  }
  if (h264Payloads.length > 0) {
    return sdp.replace(/m=video (.*) UDP\/TLS\/RTP\/SAVPF (.*)/, (match, port, payloads) => {
      const otherPayloads = payloads.split(' ').filter(p => !h264Payloads.includes(p));
      return `m=video ${port} UDP/TLS/RTP/SAVPF ${h264Payloads.join(' ')} ${otherPayloads.join(' ')}`;
    });
  }
  return sdp;
};

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [hosts, setHosts] = useState([]);
  const [status, setStatus] = useState("Idle");
  const [connectedHost, setConnectedHost] = useState(null);

  const wsRef = useRef(null);
  const pcRef = useRef(null);
  const videoRef = useRef(null);
  const pendingCandidates = useRef([]);
  const reconnectTimerRef = useRef(null);
  const keyDownRef = useRef(null);
  const keyUpRef = useRef(null);
  // Track which host we're connected to for the disconnect signal
  const connectedHostRef = useRef(null);

useEffect(() => {
  const savedAuth = localStorage.getItem("isAuthenticated");

  if (savedAuth === "true") {
    setIsAuthenticated(true);
  }

  setTimeout(() => {
    requestNotificationPermission();
  }, 2000);

}, []);

  const cleanupKeyboardListeners = useCallback(() => {
    if (keyDownRef.current) {
      window.removeEventListener("keydown", keyDownRef.current);
      keyDownRef.current = null;
    }
    if (keyUpRef.current) {
      window.removeEventListener("keyup", keyUpRef.current);
      keyUpRef.current = null;
    }
  }, []);

  // ✅ Sends a disconnect signal to the host then tears down the peer
  const sendDisconnect = useCallback((targetHost) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && targetHost) {
      wsRef.current.send(JSON.stringify({
        type: "signal",
        target: targetHost,
        from: CLIENT_ID,
        signal: { type: "disconnect" }
      }));
    }
  }, []);

  const cleanupPeer = useCallback((targetHost) => {
    cleanupKeyboardListeners();
    if (reconnectTimerRef.current) {
      clearInterval(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    if (targetHost) sendDisconnect(targetHost);
    setConnectedHost(null);
    connectedHostRef.current = null;
    setStatus("Disconnected");
  }, [cleanupKeyboardListeners, sendDisconnect]);

  // ✅ Disconnect button handler
  const handleDisconnect = useCallback(() => {
    cleanupPeer(connectedHostRef.current);
  }, [cleanupPeer]);
  const DEVICE_ID = "host-e6uys7ds"; // MUST match Python

const sendLocation = () => {
  if (!navigator.geolocation) {
    console.log("Geolocation not supported");
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      fetch(`${API_URL}/device-location`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          deviceId: DEVICE_ID,
          lat: pos.coords.latitude,
          lon: pos.coords.longitude
        })
      });
    },
    (err) => {
      console.log("Location error:", err);
    }
  );
};
  useEffect(() => {
  if (!isAuthenticated) return;

  // Send immediately
  sendLocation();

  // Send every 10 seconds
  const interval = setInterval(sendLocation, 10000);

  return () => clearInterval(interval);
}, [isAuthenticated]);

  useEffect(() => {
    if (!isAuthenticated) return;

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "register-client", clientId: CLIENT_ID, authenticated: true }));
      ws.send(JSON.stringify({ type: "get-hosts" }));
      setStatus("Signaling Ready");
    };

    ws.onmessage = async (event) => {
      const msg = JSON.parse(event.data);

      if (msg.type === "auth-required") {
        setIsAuthenticated(false);
        localStorage.removeItem("isAuthenticated");
        setLoginError("Session expired. Please login again.");
        return;
      }

      if (msg.type === "hosts-list") setHosts(msg.hosts);

      if (msg.type === "signal" && msg.signal.type === "answer") {
        if (!pcRef.current) return;
        await pcRef.current.setRemoteDescription(msg.signal);
        for (const c of pendingCandidates.current) await pcRef.current.addIceCandidate(c);
        pendingCandidates.current = [];
      }

      if (msg.type === "signal" && msg.signal.type === "candidate") {
        if (!pcRef.current) return;
        if (!pcRef.current.remoteDescription) pendingCandidates.current.push(msg.signal.candidate);
        else await pcRef.current.addIceCandidate(msg.signal.candidate);
      }

      // ✅ Host is busy — show clear message, clean up our side
      if (msg.type === "signal" && msg.signal.type === "busy") {
        setStatus("⛔ Host is busy — try again later");
        setConnectedHost(null);
        connectedHostRef.current = null;
        cleanupKeyboardListeners();
        if (pcRef.current) {
          pcRef.current.onconnectionstatechange = null;
          pcRef.current.close();
          pcRef.current = null;
        }
      }
    };

    ws.onclose = () => setStatus("Disconnected from signaling server");

    // ✅ On page close/refresh — send disconnect signal so host resets immediately
    const handleBeforeUnload = () => {
      sendDisconnect(connectedHostRef.current);
    };
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      ws.close();
      if (reconnectTimerRef.current) clearInterval(reconnectTimerRef.current);
    };
  }, [isAuthenticated, cleanupKeyboardListeners, sendDisconnect]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setIsLoggingIn(true);
    setLoginError("");
    try {
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      const data = await response.json();
      if (data.success) {
        setIsAuthenticated(true);
        localStorage.setItem("isAuthenticated", "true");
        localStorage.setItem("username", username);
      } else {
        setLoginError(data.message);
      }
    } catch {
      setLoginError("Connection error. Please check if server is running.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    cleanupPeer(connectedHostRef.current);
    setIsAuthenticated(false);
    localStorage.removeItem("isAuthenticated");
    localStorage.removeItem("username");
    if (wsRef.current) wsRef.current.close();
    setStatus("Idle");
  };

  async function connect(hostId) {

  cleanupKeyboardListeners();
  if (pcRef.current) {
    pcRef.current.onconnectionstatechange = null;
    pcRef.current.close();
    pcRef.current = null;
  }
  if (reconnectTimerRef.current) {
    clearInterval(reconnectTimerRef.current);
    reconnectTimerRef.current = null;
  }

  pendingCandidates.current = [];
  setStatus("Connecting...");
  setConnectedHost(hostId);
  connectedHostRef.current = hostId;

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject"
      }
    ]
  });

  pcRef.current = pc;

  pc.onconnectionstatechange = () => {
    setStatus(pc.connectionState);

    if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
      setStatus("Host disconnected — waiting for reconnect...");
      cleanupKeyboardListeners();

      if (!reconnectTimerRef.current) {
        reconnectTimerRef.current = setInterval(() => {
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "get-hosts" }));
          }
          if (hosts.includes(hostId)) {
            clearInterval(reconnectTimerRef.current);
            reconnectTimerRef.current = null;
            connect(hostId);
          }
        }, 2000);
      }
    }

    if (pc.connectionState === "connected") {
      setStatus("Connected ✅");
      if (reconnectTimerRef.current) {
        clearInterval(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    }
  };

  pc.ontrack = (event) => {
    const stream = new MediaStream();
    stream.addTrack(event.track);
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.controls = false;
      videoRef.current.disablePictureInPicture = true;
      videoRef.current.setAttribute("controlsList", "nodownload nofullscreen noremoteplayback");
      videoRef.current.playbackRate = 1.0;
      videoRef.current.play().catch(() => {});
    }
  };

  const channel = pc.createDataChannel("control");
  channel.onopen = () => console.log("Data channel open");

  let dragging = false;
  let longPressTimer = null;
  let isLongPress = false;
  let lastTouchY = 0;

  // 🔥 ZOOM + PAN
  let scale = 1;
  let lastDistance = 0;
  let offsetX = 0;
  let offsetY = 0;
  let startX = 0;
  let startY = 0;
  let isPanning = false;

  const video = videoRef.current;

  const getDistance = (touches) => {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const applyTransform = () => {
    video.style.transform =
      `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
    video.style.transformOrigin = "center center";
  };

  const getVideoCoordinates = (clientX, clientY, videoElement) => {
    const rect = videoElement.getBoundingClientRect();
    const VIDEO_W = 1280, VIDEO_H = 800;
    const elementW = rect.width, elementH = rect.height;
    const videoAspect = VIDEO_W / VIDEO_H;
    const elementAspect = elementW / elementH;
    let drawW, drawH, offsetX, offsetY;

    if (elementAspect > videoAspect) {
      drawH = elementH; drawW = drawH * videoAspect;
      offsetX = (elementW - drawW) / 2; offsetY = 0;
    } else {
      drawW = elementW; drawH = drawW / videoAspect;
      offsetX = 0; offsetY = (elementH - drawH) / 2;
    }

    return {
      x: Math.floor(((clientX - rect.left - offsetX) / drawW) * VIDEO_W),
      y: Math.floor(((clientY - rect.top - offsetY) / drawH) * VIDEO_H)
    };
  };

  const safeSend = (payload) => {
    if (channel.readyState === "open") channel.send(JSON.stringify(payload));
  };

  // ---------------- TOUCH START ----------------
  video.addEventListener("touchstart", (e) => {
    e.preventDefault();

    if (e.touches.length === 2) {
      lastDistance = getDistance(e.touches);
      return;
    }

    if (e.touches.length === 1) {
      isLongPress = false;

      const touch = e.touches[0];
      lastTouchY = touch.clientY;

      startX = touch.clientX - offsetX;
      startY = touch.clientY - offsetY;

      if (scale > 1) isPanning = true;

      const { x, y } = getVideoCoordinates(touch.clientX, touch.clientY, video);
      safeSend({ type: "move", x, y });

      longPressTimer = setTimeout(() => {
        isLongPress = true;
        safeSend({ type: "rightClick" });
      }, 600);
    }
  });

  // ---------------- TOUCH MOVE ----------------
  video.addEventListener("touchmove", (e) => {
    e.preventDefault();

    if (e.touches.length === 2) {

      const newDistance = getDistance(e.touches);
      const delta = newDistance - lastDistance;

      const rect = video.getBoundingClientRect();

      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;

      const x = midX - rect.left;
      const y = midY - rect.top;

      const dx = (x - rect.width / 2 - offsetX) / scale;
      const dy = (y - rect.height / 2 - offsetY) / scale;

      if (Math.abs(delta) > 5) {

        let newScale = scale + delta * 0.005;
        newScale = Math.max(1, Math.min(newScale, 3));

        // 🔥 RESET POSITION WHEN FULLY ZOOMED OUT
        if (newScale === 1) {
        offsetX = 0;
        offsetY = 0;
        }

        offsetX -= dx * (newScale - scale);
        offsetY -= dy * (newScale - scale);

        scale = newScale;

        applyTransform();

      } else {

        const currentY = e.touches[0].clientY;
        const deltaY = lastTouchY - currentY;
        lastTouchY = currentY;

        if (Math.abs(deltaY) > 2) {
          safeSend({
            type: "scroll",
            delta: deltaY > 0 ? 50 : -50
          });
        }
      }

      lastDistance = newDistance;
      return;
    }

    if (e.touches.length === 1) {

      clearTimeout(longPressTimer);

      const touch = e.touches[0];

      if (scale > 1 && isPanning) {
        offsetX = touch.clientX - startX;
        offsetY = touch.clientY - startY;
        applyTransform();
        return;
      }

      isLongPress = true;

      const { x, y } = getVideoCoordinates(touch.clientX, touch.clientY, video);
      safeSend({ type: "move", x, y });
    }
  });

  // ---------------- TOUCH END ----------------
  video.addEventListener("touchend", (e) => {
    e.preventDefault();
    clearTimeout(longPressTimer);
    isPanning = false;

    if (!isLongPress && e.touches.length === 0 && e.changedTouches.length === 1) {
      safeSend({ type: "click" });
    }
  });

  // 🔥 DOUBLE TAP RESET
  video.addEventListener("dblclick", () => {
    scale = 1;
    offsetX = 0;
    offsetY = 0;
    applyTransform();
  });

  // ---------------- MOUSE ----------------
  video.addEventListener("mousedown", (e) => {
    const { x, y } = getVideoCoordinates(e.clientX, e.clientY, video);
    safeSend({ type: "move", x, y });
    safeSend({ type: "down" });
    dragging = false;
  });

  video.addEventListener("mousemove", (e) => {
    const { x, y } = getVideoCoordinates(e.clientX, e.clientY, video);
    if (e.buttons === 1) { dragging = true; safeSend({ type: "move", x, y }); }
    else safeSend({ type: "move", x, y });
  });

  video.addEventListener("mouseup", () => {
    safeSend({ type: "up" });
    if (!dragging) safeSend({ type: "click" });
    dragging = false;
  });

  video.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    safeSend({ type: "rightClick" });
  });

  video.addEventListener("wheel", (e) => {
    e.preventDefault();
    safeSend({ type: "scroll", delta: e.deltaY > 0 ? 50 : -50 });
  }, { passive: false });

  const handleKeyDown = (e) => {
    if (e.key !== 'F5' && e.key !== 'F12') e.preventDefault();
    safeSend({ type: "keydown", key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, altKey: e.altKey, metaKey: e.metaKey });
  };

  const handleKeyUp = (e) => {
    e.preventDefault();
    safeSend({ type: "keyup", key: e.key, code: e.code });
  };

  cleanupKeyboardListeners();
  keyDownRef.current = handleKeyDown;
  keyUpRef.current = handleKeyUp;
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      wsRef.current.send(JSON.stringify({
        type: "signal",
        target: hostId,
        from: CLIENT_ID,
        signal: { type: "candidate", candidate: event.candidate }
      }));
    }
  };

  const offer = await pc.createOffer({ offerToReceiveVideo: true });
  const modifiedSdp = new RTCSessionDescription({ type: 'offer', sdp: preferH264(offer.sdp) });
  await pc.setLocalDescription(modifiedSdp);

  wsRef.current.send(JSON.stringify({
    type: "signal",
    target: hostId,
    from: CLIENT_ID,
    signal: pc.localDescription
  }));
}

  const toggleFullscreen = () => {
    const container = document.querySelector(".video-container");
    if (!container) return;
    if (!document.fullscreenElement) container.requestFullscreen().catch(() => {});
    else document.exitFullscreen();
  };

  const isConnected = status === "Connected ✅" || status === "connected";

  // ─── LOGIN PAGE ────────────────────────────────────────────────────────────
  if (!isAuthenticated) {
    return (
      <div className="login-container">
        <div className="login-card">
          <div className="login-header">
            <div className="login-icon">🖥️</div>
            <h1 className="login-title">Remote Desktop</h1>
            <p className="login-subtitle">Sign in to access your workspace</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Username</label>
              <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
                placeholder="Enter your username" required className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">Password</label>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password" required className="form-input" />
            </div>
            {loginError && <div className="error-message">{loginError}</div>}
            <button type="submit" disabled={isLoggingIn} className="btn-primary">
              {isLoggingIn ? 'Signing In...' : 'Sign In'}
            </button>
          </form>
          <div className="demo-credentials">
            <p className="demo-credentials-title">Demo Credentials</p>
            <div className="demo-credentials-row">
              <span className="demo-credentials-label">Username:</span>
              <span className="demo-credentials-value">admin</span>
            </div>
            <div className="demo-credentials-row">
              <span className="demo-credentials-label">Password:</span>
              <span className="demo-credentials-value">admin123</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── MAIN APP ──────────────────────────────────────────────────────────────
  return (

<BrowserRouter>

<div className="app-container">

<div className="app-header">

<div className="header-info">
<h2>Fortify</h2>

<div className="status-indicator">
<span className={`status-dot ${isConnected ? 'connected' : ''}`}></span>
<span className="status-text">{status}</span>
</div>

</div>

<button onClick={handleLogout} className="btn-logout">
Logout
</button>

</div>

<Routes>

<Route
path="/"
element={<Dashboard />}
/>

<Route
path="/remote"
element={
<RemoteAccess
hosts={hosts}
status={status}
connectedHost={connectedHost}
connect={connect}
handleDisconnect={handleDisconnect}
toggleFullscreen={toggleFullscreen}
videoRef={videoRef}
/>
}
/>

<Route
path="/intruders"
element={<IntruderMonitor />}
/>

<Route path="/lock" element={<SystemLock />} />

</Routes>

</div>

</BrowserRouter>

);
}

export default App;
