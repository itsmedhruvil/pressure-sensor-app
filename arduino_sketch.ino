/*
 * Foot Pressure Sensor Sketch
 * Reads 6 FSR sensors from analog pins A0-A5
 * Outputs JSON data for the web interface
 * 
 * Sensor mapping:
 * A0 -> s1 (Big Toe)
 * A1 -> s2 (Little Toe)  
 * A2 -> s3 (Ball - Medial)
 * A3 -> s4 (Ball - Lateral)
 * A4 -> s5 (Arch)
 * A5 -> s6 (Heel)
 */

#define BAUD_RATE 115200

// Analog pins for sensors
const int SENSOR_PINS[6] = {A0, A1, A2, A3, A4, A5};

// Sensor values
int sensorValues[6];

void setup() {
  Serial.begin(BAUD_RATE);
  
  // Configure sensor pins as inputs
  for (int i = 0; i < 6; i++) {
    pinMode(SENSOR_PINS[i], INPUT);
  }
  
  // Wait for serial to be ready
  while (!Serial) {
    ; // Wait for serial connection
  }
  
  // Send ready signal
  Serial.println("{\"status\":\"ready\"}");
}

void loop() {
  // Read all sensor values
  for (int i = 0; i < 6; i++) {
    sensorValues[i] = analogRead(SENSOR_PINS[i]);
  }
  
  // Output JSON format
  Serial.print("{\"s1\":");
  Serial.print(sensorValues[0]);
  Serial.print(",\"s2\":");
  Serial.print(sensorValues[1]);
  Serial.print(",\"s3\":");
  Serial.print(sensorValues[2]);
  Serial.print(",\"s4\":");
  Serial.print(sensorValues[3]);
  Serial.print(",\"s5\":");
  Serial.print(sensorValues[4]);
  Serial.print(",\"s6\":");
  Serial.print(sensorValues[5]);
  Serial.println("}");
  
  // Delay between readings (adjust for faster/slower updates)
  // 50ms = ~20 readings per second
  delay(50);
}
