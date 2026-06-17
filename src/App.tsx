import React, { useState, useRef, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import Tesseract from 'tesseract.js';

const TARGET_FOLDER_ID = '1X7xdyeOm-MbJgjgoW63-ZW2qgKokgJW_'; // Extracted from user URL

function App() {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const sessionTextRef = useRef<string>('');

  const login = useGoogleLogin({
    onSuccess: (codeResponse) => {
      setAccessToken(codeResponse.access_token);
      addLog('Successfully logged in with Google.');
    },
    onError: (error) => addLog('Login Failed: ' + error),
    scope: 'https://www.googleapis.com/auth/drive.file',
  });

  const addLog = (msg: string) => {
    setLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const startMonitoring = async () => {
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      setIsMonitoring(true);
      sessionTextRef.current = ''; // Reset session text
      addLog('Screen monitoring started.');

      // Check stream track ended
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        stopMonitoring();
      });

      intervalRef.current = window.setInterval(captureAndOCR, 10000);
    } catch (err) {
      addLog(`Error starting screen capture: ${err}`);
    }
  };

  const stopMonitoring = async () => {
    setIsMonitoring(false);
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    addLog('Screen monitoring stopped.');

    if (accessToken && sessionTextRef.current.trim().length > 0) {
      await saveToDrive(sessionTextRef.current);
    }
  };

  const captureAndOCR = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/png');
    
    addLog('Captured frame, running OCR...');
    
    try {
      const { data: { text } } = await Tesseract.recognize(dataUrl, 'eng', {
        logger: m => {} // suppress progress logs to save resources
      });
      
      const cleanText = text.trim();
      if (cleanText) {
        addLog(`OCR Extracted ${cleanText.length} characters.`);
        sessionTextRef.current += `\n--- [${new Date().toISOString()}] ---\n${cleanText}\n`;
      } else {
        addLog('No text found in frame.');
      }
    } catch (error) {
      addLog(`OCR Error: ${error}`);
    }
  };

  const saveToDrive = async (text: string) => {
    if (!accessToken) {
      addLog('No Google access token, cannot save to Drive.');
      return;
    }
    addLog('Saving session to Google Drive...');
    
    const file = new Blob([text], { type: 'text/plain' });
    const metadata = {
      name: `ScreenMonitor_Session_${new Date().toISOString().replace(/:/g, '-')}.txt`,
      mimeType: 'text/plain',
      parents: [TARGET_FOLDER_ID]
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', file);

    try {
      const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
        body: form,
      });
      const data = await response.json();
      if (response.ok) {
        addLog(`Successfully saved to Drive: ${data.name}`);
      } else {
        addLog(`Drive API Error: ${data.error?.message || 'Unknown error'}`);
      }
    } catch (err) {
      addLog(`Error uploading to Drive: ${err}`);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Screen Monitor OCR</h1>
      </header>
      
      <main>
        {!accessToken ? (
          <div className="auth-section">
            <p>Please log in with Google to enable Drive uploads.</p>
            <button onClick={() => login()} className="btn primary">Login with Google</button>
          </div>
        ) : (
          <div className="controls">
            {!isMonitoring ? (
              <button onClick={startMonitoring} className="btn success">Start Monitoring</button>
            ) : (
              <button onClick={stopMonitoring} className="btn danger">Stop Monitoring</button>
            )}
            <p className="status">
              Status: <span className={isMonitoring ? 'active' : 'inactive'}>
                {isMonitoring ? 'Monitoring...' : 'Idle'}
              </span>
            </p>
          </div>
        )}

        <div className="logs-container">
          <h2>Activity Log</h2>
          <div className="logs">
            {logs.map((log, i) => <div key={i} className="log-entry">{log}</div>)}
            {logs.length === 0 && <div className="log-entry empty">No activity yet.</div>}
          </div>
        </div>

        {/* Hidden elements for processing */}
        <video ref={videoRef} style={{ display: 'none' }} muted />
        <canvas ref={canvasRef} style={{ display: 'none' }} />
      </main>
    </div>
  );
}

export default App;
