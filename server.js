const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');
const cookieParser = require('cookie-parser');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(cookieParser());

// Configuration
let ARDUINO_PORT = process.env.ARDUINO_PORT || null;
const BAUD_RATE = 115200;
const WEB_PORT = 3000;

// Session and recording state
let recordingActive = false;
let currentSession = null;
let sessionCounter = 0;
let demoMode = false;

// 5-second averaging buffer
let readingBuffer = [];
let lastAverageTime = Date.now();
const AVERAGING_INTERVAL = 5000; // 5 seconds

// Initialize session
function createSession() {
  sessionCounter++;
  return {
    id: `session_${sessionCounter}_${Date.now()}`,
    startTime: new Date(),
    readings: [],
    isDemo: false
  };
}

// Calculate average from buffer
function calculateAverageReading() {
  if (readingBuffer.length === 0) return null;
  
  const avg = {
    s1: 0, s2: 0, s3: 0, s4: 0, s5: 0, s6: 0
  };
  
  // Sum all readings
  readingBuffer.forEach(reading => {
    avg.s1 += reading.s1 || 0;
    avg.s2 += reading.s2 || 0;
    avg.s3 += reading.s3 || 0;
    avg.s4 += reading.s4 || 0;
    avg.s5 += reading.s5 || 0;
    avg.s6 += reading.s6 || 0;
  });
  
  // Divide by count to get average
  const count = readingBuffer.length;
  avg.s1 = Math.round(avg.s1 / count);
  avg.s2 = Math.round(avg.s2 / count);
  avg.s3 = Math.round(avg.s3 / count);
  avg.s4 = Math.round(avg.s4 / count);
  avg.s5 = Math.round(avg.s5 / count);
  avg.s6 = Math.round(avg.s6 / count);
  
  return avg;
}

// Start recording
function startRecording(isDemo = false) {
  recordingActive = true;
  readingBuffer = [];
  lastAverageTime = Date.now();
  currentSession = createSession();
  currentSession.isDemo = isDemo;
  console.log(`✓ Recording started (${isDemo ? 'DEMO' : 'LIVE'})`);
  
  io.emit('recordingStatus', {
    active: true,
    sessionId: currentSession.id,
    startTime: currentSession.startTime,
    isDemo: isDemo
  });
}

// Stop recording
function stopRecording() {
  if (!currentSession) return null;
  
  // Add final average if buffer has data
  const finalAvg = calculateAverageReading();
  if (finalAvg) {
    const reading = {
      timestamp: Date.now() - currentSession.startTime.getTime(),
      ...finalAvg
    };
    currentSession.readings.push(reading);
  }
  
  recordingActive = false;
  const session = currentSession;
  currentSession = null;
  readingBuffer = [];
  
  console.log(`✓ Recording stopped - ${session.readings.length} averaged readings saved`);
  
  io.emit('recordingStatus', {
    active: false,
    sessionData: session
  });
  
  return session;
}

// Add raw reading to buffer (will be averaged every 5 seconds)
function addRawReading(data) {
  if (!recordingActive) return;
  
  readingBuffer.push(data);
  
  // Check if 5 seconds have passed
  const now = Date.now();
  if (now - lastAverageTime >= AVERAGING_INTERVAL) {
    // Calculate and store average
    const avgReading = calculateAverageReading();
    if (avgReading && currentSession) {
      const reading = {
        timestamp: Date.now() - currentSession.startTime.getTime(),
        ...avgReading,
        _sampleSize: readingBuffer.length // For debugging
      };
      currentSession.readings.push(reading);
      console.log(`📊 5-sec average saved (${readingBuffer.length} samples)`);
    }
    
    // Reset buffer and timer
    readingBuffer = [];
    lastAverageTime = now;
  }
}

// Add reading to current session (deprecated - use addRawReading instead)
function addReading(data) {
  if (recordingActive && currentSession) {
    const reading = {
      timestamp: Date.now() - currentSession.startTime.getTime(),
      ...data
    };
    currentSession.readings.push(reading);
  }
}

// Convert session to CSV (5-second averaged data)
function sessionToCSV(session) {
  if (!session || session.readings.length === 0) {
    return 'No data';
  }
  
  const headers = ['Timestamp (ms)', 'Big Toe (s1)', 'Little Toe (s2)', 'Ball Medial (s3)', 'Ball Lateral (s4)', 'Arch (s5)', 'Heel (s6)'];
  const rows = session.readings.map(reading => [
    reading.timestamp,
    reading.s1 || 0,
    reading.s2 || 0,
    reading.s3 || 0,
    reading.s4 || 0,
    reading.s5 || 0,
    reading.s6 || 0
    // _sampleSize excluded - it's an internal field
  ]);
  
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

// Generate fake demo reading
function generateDemoReading() {
  const baseADC = 300 + Math.random() * 400;
  return {
    s1: Math.round(baseADC * 0.8 + Math.random() * 100),
    s2: Math.round(baseADC * 0.6 + Math.random() * 80),
    s3: Math.round(baseADC * 1.2 + Math.random() * 120),
    s4: Math.round(baseADC * 1.1 + Math.random() * 110),
    s5: Math.round(baseADC * 0.5 + Math.random() * 70),
    s6: Math.round(baseADC * 1.3 + Math.random() * 130),
    _isDemoData: true
  };
}

// Serve static files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
// Get current recording status
app.get('/api/status', (req, res) => {
  res.json({
    recordingActive,
    currentSessionId: currentSession?.id || null,
    sessionStartTime: currentSession?.startTime || null
  });
});

// Get session data
app.get('/api/session/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionData = req.cookies[sessionId];
  
  if (sessionData) {
    res.json(JSON.parse(sessionData));
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Download session as CSV
app.get('/api/download/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const sessionData = req.cookies[sessionId];
  
  if (sessionData) {
    const session = JSON.parse(sessionData);
    const csv = sessionToCSV(session);
    
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="pressure_${sessionId}.csv"`);
    res.send(csv);
  } else {
    res.status(404).json({ error: 'Session not found' });
  }
});

// Initialize serial connection
let serialPort;
let parser;

function connectToArduino() {
  // If port not specified, try to auto-detect Arduino
  if (!ARDUINO_PORT) {
    SerialPort.list().then(ports => {
      const arduinoPort = ports.find(port => 
        port.manufacturer && (port.manufacturer.includes('Arduino') || port.manufacturer.includes('CH340') || port.manufacturer.includes('Silicon Labs'))
      ) || ports[0];
      
      if (!arduinoPort) {
        console.error('No Arduino found on any serial port');
        console.log('Running in demo mode only');
        return;
      }
      
      ARDUINO_PORT = arduinoPort.path;
      console.log(`Auto-detected Arduino on ${ARDUINO_PORT}`);
      openSerialConnection();
    });
  } else {
    openSerialConnection();
  }
}

function openSerialConnection() {
  console.log(`Attempting to connect to Arduino on ${ARDUINO_PORT}...`);
  
  serialPort = new SerialPort({
    path: ARDUINO_PORT,
    baudRate: BAUD_RATE,
    autoOpen: false
  });
  
  serialPort.open((err) => {
    if (err) {
      console.error('Error opening port:', err.message);
      console.log('Running in demo mode only');
      return;
    }
    
    console.log('✓ Successfully connected to Arduino');
    
    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
    
    parser.on('data', (data) => {
      try {
        const trimmedData = data.trim();
        const sensorData = JSON.parse(trimmedData);
        
        // Broadcast live data to all clients
        if (sensorData.s1 !== undefined) {
          io.emit('liveReading', sensorData);
          
          // Add to 5-second averaging buffer
          addRawReading(sensorData);
        } else {
          console.log('Status:', sensorData);
        }
      } catch (e) {
        console.log('Arduino:', data.trim());
      }
    });
    
    serialPort.on('error', (err) => {
      console.error('Serial port error:', err.message);
    });
    
    serialPort.on('close', () => {
      console.log('Serial port closed');
    });
  });
}

// WebSocket connections
io.on('connection', (socket) => {
  console.log('✓ Web client connected');
  
  socket.emit('connectionStatus', {
    connected: true,
    port: ARDUINO_PORT,
    baudRate: BAUD_RATE,
    recordingActive: recordingActive
  });
  
  // Recording controls
  socket.on('startRecording', (data) => {
    const isDemo = data?.demo || false;
    startRecording(isDemo);
  });
  
  socket.on('stopRecording', () => {
    const session = stopRecording();
    
    // Send session to client and store in cookies
    if (session) {
      // Emit session data to all clients
      io.emit('sessionSaved', {
        sessionId: session.id,
        readingCount: session.readings.length,
        startTime: session.startTime,
        isDemo: session.isDemo
      });
    }
  });
  
  // Demo button press - generate single reading
  socket.on('demoReading', () => {
    if (recordingActive && currentSession?.isDemo) {
      const demoData = generateDemoReading();
      addRawReading(demoData);
      io.emit('liveReading', demoData);
    }
  });
  
  // Save session to cookies (from client)
  socket.on('saveSession', (sessionData) => {
    console.log(`Saving session ${sessionData.id} with ${sessionData.readings.length} readings`);
    // Client will handle cookie storage, but we can log it server-side
  });
  
  socket.on('disconnect', () => {
    console.log('✗ Web client disconnected');
  });
});

// Start server
server.listen(WEB_PORT, () => {
  console.log('\n========================================');
  console.log('🚀 Foot Pressure Sensor Server Started');
  console.log('========================================');
  console.log(`Web interface: http://localhost:${WEB_PORT}`);
  console.log(`Arduino port: ${ARDUINO_PORT || 'auto-detect'}`);
  console.log(`Baud rate: ${BAUD_RATE}`);
  console.log('========================================\n');
  
  connectToArduino();
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down server...');
  if (serialPort && serialPort.isOpen) {
    serialPort.close(() => {
      console.log('Serial port closed');
      process.exit(0);
    });
  } else {
    process.exit(0);
  }
});

// List available ports
SerialPort.list().then(ports => {
  if (ports.length > 0) {
    console.log('Available serial ports:');
    ports.forEach(port => {
      console.log(`  - ${port.path}${port.manufacturer ? ' (' + port.manufacturer + ')' : ''}`);
    });
    console.log();
  }
});