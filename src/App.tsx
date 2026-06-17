import React, { useState, useRef } from 'react';
import Tesseract from 'tesseract.js';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';

function App() {
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<number | null>(null);
  const sessionTextRef = useRef<string>('');

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

    if (sessionTextRef.current.trim().length > 0) {
      await saveLocally(sessionTextRef.current);
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
        logger: () => {} // suppress progress logs to save resources
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

  const saveLocally = async (text: string) => {
    addLog('Saving session to device locally...');
    
    const fileName = `ScreenMonitor_Session_${new Date().toISOString().replace(/:/g, '-')}.txt`;

    try {
      // Capacitor Filesystem API
      await Filesystem.writeFile({
        path: fileName,
        data: text,
        directory: Directory.Documents,
        encoding: Encoding.UTF8,
      });
      addLog(`Successfully saved file: ${fileName} in Documents`);
    } catch (err) {
      addLog(`Capacitor file write failed. Falling back to web download... Error: ${err}`);
      
      // Fallback for Web browser
      const blob = new Blob([text], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }
  };

  return (
    <div className="container">
      <header>
        <h1>Screen Monitor OCR</h1>
      </header>
      
      <main>
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
