import React from "react";
import "../App.css";

function RemoteAccess({
  hosts,
  status,
  connectedHost,
  connect,
  handleDisconnect,
  toggleFullscreen,
  videoRef
}) {

  const isConnected = status === "Connected ✅" || status === "connected";

  return (
    <div className="app-container">

      <div className="app-header">
        <div className="header-info">
          <h2>Remote Desktop</h2>

          <div className="status-indicator">
            <span className={`status-dot ${isConnected ? 'connected' : ''}`}></span>
            <span className="status-text">{status}</span>
          </div>

        </div>
      </div>

      {connectedHost && (
        <div className="connected-host-info">
          <span style={{ fontSize: '20px' }}>🟢</span>
          <span>Connected to: <strong>{connectedHost}</strong></span>
        </div>
      )}

      <div className="host-buttons">

        {hosts.map(h => (
          <button
            key={h}
            onClick={() => connect(h)}
            className={`btn-host ${connectedHost === h ? 'connected' : ''}`}
          >
            {connectedHost === h && <span>✓ </span>}
            <span>Connect to {h}</span>
          </button>
        ))}

        {connectedHost && (
          <button
            onClick={handleDisconnect}
            className="btn-disconnect"
          >
            ✕ Disconnect
          </button>
        )}

        {connectedHost && (
          <button
            onClick={toggleFullscreen}
            className="btn-fullscreen"
          >
            ⛶ Fullscreen
          </button>
        )}

      </div>

      <div className="video-container">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          onDoubleClick={toggleFullscreen}
          className="remote-video"
        />
      </div>

      {!connectedHost && hosts.length === 0 && (
        <div className="no-hosts-message">
          <div className="no-hosts-icon">🔍</div>
          <p className="no-hosts-title">No hosts available</p>
          <p className="no-hosts-subtitle">
            Start a host to begin remote desktop connection
          </p>
        </div>
      )}

    </div>
  );
}

export default RemoteAccess;
