const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuration
const ARDUINO_PORT = '/dev/ttyACM0'; // Change if your port is different
const BAUD_RATE = 115200;
const WEB_PORT = 3000;

// Demo mode state
let demoMode = false;
let demoInterval = null;
const DEMO_INTERVAL_MS = 200; // Send demo data every 200ms

// Convert ADC value (0-1023) to kPa
// Using typical FSR calibration: resistance decreases as force increases
// Formula: Force (N) = 1000 / ((1023/ADC - 1) * 0.1) approx, then convert to kPa
function adcToKPa(adcValue) {
  if (adcValue <= 10) return 0; // Below threshold, no significant pressure
  // Approximate calibration - actual values depend on FSR model and circuit
  // Using a simplified linear approximation for demo purposes
  const voltage = (adcValue / 1023) * 5; // 5V reference
  const kPa = Math.round((voltage / 5) * 1000); // 0-1000 kPa range (0-1 MPa)
  return Math.max(0, Math.min(999, kPa));
}

// Generate realistic demo sensor data (continuous pattern)
// Values converted to kPa (kilopascals) - real pressure units
function generateDemoData() {
  const timestamp = Date.now();
  const phase = (timestamp % 10000) / 10000; // Cycle every 10 seconds
  
  // Create a walking-like pressure pattern (ADC values 100-1000 converted to kPa)
  // Normal walking pressure: 100-800 kPa (0.1-0.8 MPa)
  const baseADC = 500 + Math.sin(phase * Math.PI * 2) * 300;
  const variation = Math.random() * 200 - 100;
  
  // Generate raw ADC values then convert to kPa
  const adcValues = {
    s1: Math.round(Math.max(100, Math.min(1000, baseADC + variation + Math.sin(phase * Math.PI * 4) * 150))),
    s2: Math.round(Math.max(50, Math.min(800, baseADC * 0.6 + variation))),
    s3: Math.round(Math.max(100, Math.min(1000, baseADC * 1.3 + variation + 100))),
    s4: Math.round(Math.max(100, Math.min(1000, baseADC * 1.2 + variation + 80))),
    s5: Math.round(Math.max(50, Math.min(700, baseADC * 0.5 + variation))),
    s6: Math.round(Math.max(100, Math.min(1000, baseADC * 1.4 + variation + 150)))
  };
  
  // Convert ADC to kPa for each sensor
  const data = {
    s1: adcToKPa(adcValues.s1),
    s2: adcToKPa(adcValues.s2),
    s3: adcToKPa(adcValues.s3),
    s4: adcToKPa(adcValues.s4),
    s5: adcToKPa(adcValues.s5),
    s6: adcToKPa(adcValues.s6),
    _adc: adcValues // Keep raw ADC for debugging if needed
  };
  
  return data;
}

// Start demo mode - runs continuously until stopped
function startDemo() {
  if (demoInterval) return;
  
  console.log('🎮 Starting demo mode (continuous)...');
  demoMode = true;
  
  // Send initial demo data immediately
  io.emit('sensorData', generateDemoData());
  
  // Then send continuously at regular intervals
  demoInterval = setInterval(() => {
    if (demoMode) {
      io.emit('sensorData', generateDemoData());
    }
  }, DEMO_INTERVAL_MS);
  
  io.emit('demoStatus', { active: true });
}

// Stop demo mode
function stopDemo() {
  if (!demoInterval) return;
  
  console.log('🎮 Stopping demo mode');
  demoMode = false;
  clearInterval(demoInterval);
  demoInterval = null;
  
  io.emit('demoStatus', { active: false });
}


// Serve static files from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize serial connection
let serialPort;
let parser;

function connectToArduino() {
  console.log(`Attempting to connect to Arduino on ${ARDUINO_PORT}...`);
  
  serialPort = new SerialPort({
    path: ARDUINO_PORT,
    baudRate: BAUD_RATE,
    autoOpen: false
  });
  
  // Open the port
  serialPort.open((err) => {
    if (err) {
      console.error('Error opening port:', err.message);
      console.log('Available ports:');
      SerialPort.list().then(ports => {
        ports.forEach(port => {
          console.log(`  - ${port.path}`);
        });
        console.log('\nPlease update ARDUINO_PORT in server.js to match your Arduino port');
      });
      return;
    }
    
    console.log('✓ Successfully connected to Arduino');
    
    // Create parser
    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
    
    // Read data from Arduino
    parser.on('data', (data) => {
      try {
        const trimmedData = data.trim();
        
        // Try to parse JSON
        const sensorData = JSON.parse(trimmedData);
        
        // Only broadcast if it has sensor values
        if (sensorData.s1 !== undefined) {
          // Broadcast to all connected web clients
          io.emit('sensorData', sensorData);
          
          // Optional: Log to console (comment out if too verbose)
          // console.log('Sensor data:', sensorData);
        } else {
          console.log('Status:', sensorData);
        }
      } catch (e) {
        // Not JSON or malformed - just log it
        console.log('Arduino:', data.trim());
      }
    });
    
    // Handle serial port errors
    serialPort.on('error', (err) => {
      console.error('Serial port error:', err.message);
    });
    
    // Handle serial port close
    serialPort.on('close', () => {
      console.log('Serial port closed');
    });
  });
}

// Handle WebSocket connections
io.on('connection', (socket) => {
  console.log('✓ Web client connected');
  
  // Send initial status
  socket.emit('status', { 
    connected: true, 
    port: ARDUINO_PORT,
    baudRate: BAUD_RATE 
  });
  
  socket.on('disconnect', () => {
    console.log('✗ Web client disconnected');
  });
  
  // Handle commands from web client
  socket.on('command', (cmd) => {
    console.log('Received command:', cmd);
    // You can send commands to Arduino if needed
    if (serialPort && serialPort.isOpen) {
      serialPort.write(cmd + '\n');
    }
  });
  
  // Handle demo mode toggle
  socket.on('demo', (action) => {
    if (action === 'start') {
      startDemo();
    } else if (action === 'stop') {
      stopDemo();
    }
  });
});


// Start the web server
server.listen(WEB_PORT, () => {
  console.log('\n========================================');
  console.log('🚀 Foot Pressure Sensor Server Started');
  console.log('========================================');
  console.log(`Web interface: http://localhost:${WEB_PORT}`);
  console.log(`Arduino port: ${ARDUINO_PORT}`);
  console.log(`Baud rate: ${BAUD_RATE}`);
  console.log('========================================\n');
  
  // Connect to Arduino
  connectToArduino();
});

// Handle graceful shutdown
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

// List available serial ports (helpful for debugging)
SerialPort.list().then(ports => {
  console.log('\nAvailable serial ports:');
  if (ports.length === 0) {
    console.log('  No ports found');
  } else {
    ports.forEach(port => {
      console.log(`  - ${port.path}${port.manufacturer ? ' (' + port.manufacturer + ')' : ''}`);
    });
  }
  console.log();
});