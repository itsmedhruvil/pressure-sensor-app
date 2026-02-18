/*
 * Foot Pressure Sensor Sketch
 * Reads 5 FSR sensors from analog pins A0-A4
 * Outputs JSON data for the web interface on demand
 * 
 * Sensor mapping:
 * A0 -> s1 (Zone 1: Hallux)
 * A1 -> s2 (Zone 2: Medial forefoot - 1st MTH)
 * A2 -> s3 (Zone 3: Lateral forefoot - 5th MTH)
 * A3 -> s4 (Zone 4: Midfoot)
 * A4 -> s5 (Zone 5: Heel)
 */

#define BAUD_RATE 115200

// Analog pins for sensors
const int SENSOR_PINS[5] = {A0, A1, A2, A3, A4};
const char* SENSOR_KEYS[5] = {"s1", "s2", "s3", "s4", "s5"}; // s1: Hallux, s2: Medial forefoot, s3: Lateral forefoot, s4: Midfoot, s5: Heel

// Sensor values
int sensorValues[5];
unsigned long startTime = 0;

void setup() {
  Serial.begin(BAUD_RATE);

  // Wait for serial to be ready (with 3s timeout for non-native USB boards)
  unsigned long start = millis();
  while (!Serial && millis() - start < 3000) {
    ;
  }

  startTime = millis();
  // Send reay signal
  Serial.println("{\"status\":\"ready\"}");
}

void loop() {
  // Read all sensor values
  for (int i = 0; i < 5; i++) {
    sensorValues[i] = analogRead(SENSOR_PINS[i]);
  }

  // Output JSON with elapsed time from start
  unsigned long elapsedTime = millis() - startTime;
  Serial.print("{\"t\":");
  Serial.print(elapsedTime);
  Serial.print(",");

  for (int i = 0; i < 5; i++) {
    if (i > 0) Serial.print(",");
    Serial.print("\"");
    Serial.print(SENSOR_KEYS[i]);
    Serial.print("\":");
    Serial.print(sensorValues[i]);
  }

  Serial.println("}");

  // 100ms delay = ~10 readings per second
  delay(100);
}