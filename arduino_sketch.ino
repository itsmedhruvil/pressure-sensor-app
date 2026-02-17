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
const char* SENSOR_KEYS[6] = {"s1", "s2", "s3", "s4", "s5", "s6"};

// Sensor values
int sensorValues[6];

void setup() {
  Serial.begin(BAUD_RATE);

  // Wait for serial to be ready (with 3s timeout for non-native USB boards)
  unsigned long start = millis();
  while (!Serial && millis() - start < 3000) {
    ;
  }

  // Send ready signal
  Serial.println("{\"status\":\"ready\"}");
}

void loop() {
  // Read all sensor values
  for (int i = 0; i < 6; i++) {
    sensorValues[i] = analogRead(SENSOR_PINS[i]);
  }

  // Output JSON with timestamp
  Serial.print("{\"t\":");
  Serial.print(millis());
  Serial.print(",");

  for (int i = 0; i < 6; i++) {
    if (i > 0) Serial.print(",");
    Serial.print("\"");
    Serial.print(SENSOR_KEYS[i]);
    Serial.print("\":");
    Serial.print(sensorValues[i]);
  }

  Serial.println("}");

  // 50ms delay = ~20 readings per second
  delay(50);
}