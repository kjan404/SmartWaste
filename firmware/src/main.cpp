#include <Arduino.h>
#include <ArduinoJson.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <driver/gpio.h>
#include <esp_camera.h>

#if __has_include("config.h")
#include "config.h"
#else
#include "config.example.h"
#endif

namespace {
constexpr int SERVO_CHANNEL = 6;
constexpr int PWM_BITS = 14;
constexpr unsigned REPORT_MS = 3000;
constexpr unsigned SCAN_MS = 1200;
constexpr unsigned WIFI_RETRY_MS = 12000;

struct Bin {
  int trigger;
  int echo;
  float emptyCm;
  float fullCm;
};
const Bin paper{PAPER_TRIG, PAPER_ECHO, PAPER_EMPTY_CM, PAPER_FULL_CM};
const Bin plastic{PLASTIC_TRIG, PLASTIC_ECHO, PLASTIC_EMPTY_CM, PLASTIC_FULL_CM};

struct Reading {
  float distance;
  int fill;
  bool valid;
};

bool cameraReady = false;
bool sensorsReady = false;
bool servoReady = false;
bool automatic = false;
bool armed = false;
int emptyFrames = 0;
int itemFrames = 0;
String previousLabel;
String pendingReport;
unsigned lastReport = 0;
unsigned lastScan = 0;
unsigned lastWiFiRetry = 0;

bool claimPin(int pin, bool output, bool used[], bool optional = false) {
  if (optional && pin == -1) return true;
  if (pin < 0 || pin >= 49 || !GPIO_IS_VALID_GPIO(pin) || used[pin] ||
      (output && !GPIO_IS_VALID_OUTPUT_GPIO(pin))) {
    Serial.printf("Missing, invalid or conflicting GPIO %d. Check config.h.\n", pin);
    return false;
  }
  used[pin] = true;
  return true;
}

bool validPins() {
  bool used[49]{};
  if (ENABLE_CAMERA) {
    const int outputs[] = {CAM_XCLK, CAM_SIOD, CAM_SIOC};
    const int inputs[] = {CAM_D0, CAM_D1, CAM_D2, CAM_D3, CAM_D4, CAM_D5, CAM_D6,
                          CAM_D7, CAM_VSYNC, CAM_HREF, CAM_PCLK};
    for (int pin : outputs) if (!claimPin(pin, true, used)) return false;
    for (int pin : inputs) if (!claimPin(pin, false, used)) return false;
    if (!claimPin(CAM_PWDN, true, used, true) || !claimPin(CAM_RESET, true, used, true)) return false;
  }
  if (ENABLE_SENSORS) {
    if (!claimPin(paper.trigger, true, used) || !claimPin(paper.echo, false, used) ||
        !claimPin(plastic.trigger, true, used) || !claimPin(plastic.echo, false, used)) return false;
  }
  return !ENABLE_SERVO || claimPin(SERVO_PIN, true, used);
}

bool startCamera() {
  camera_config_t config{};
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = CAM_D0;
  config.pin_d1 = CAM_D1;
  config.pin_d2 = CAM_D2;
  config.pin_d3 = CAM_D3;
  config.pin_d4 = CAM_D4;
  config.pin_d5 = CAM_D5;
  config.pin_d6 = CAM_D6;
  config.pin_d7 = CAM_D7;
  config.pin_xclk = CAM_XCLK;
  config.pin_pclk = CAM_PCLK;
  config.pin_vsync = CAM_VSYNC;
  config.pin_href = CAM_HREF;
  config.pin_sccb_sda = CAM_SIOD;
  config.pin_sccb_scl = CAM_SIOC;
  config.pin_pwdn = CAM_PWDN;
  config.pin_reset = CAM_RESET;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_QVGA;
  config.jpeg_quality = 13;
  config.fb_count = 1;
  config.fb_location = CAMERA_FB_IN_DRAM;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  const esp_err_t status = esp_camera_init(&config);
  Serial.printf("Camera initialization: 0x%x\n", static_cast<unsigned>(status));
  return status == ESP_OK;
}

void servoPulse(int microseconds) {
  constexpr uint32_t periodUs = 20000;
  ledcWrite(SERVO_CHANNEL, microseconds * (1UL << PWM_BITS) / periodUs);
}

Reading sample(const Bin &bin) {
  if (!sensorsReady || bin.emptyCm <= bin.fullCm || bin.fullCm < 2.0f) return {0, 0, false};
  float readings[3]{};
  int valid = 0;
  for (int i = 0; i < 3; ++i) {
    digitalWrite(bin.trigger, LOW);
    delayMicroseconds(3);
    digitalWrite(bin.trigger, HIGH);
    delayMicroseconds(10);
    digitalWrite(bin.trigger, LOW);
    const unsigned long echo = pulseIn(bin.echo, HIGH, 25000);
    const float cm = echo * 0.01715f;
    if (echo && cm >= 2.0f && cm <= 400.0f && cm <= bin.emptyCm + 10.0f) {
      int pos = valid++;
      while (pos > 0 && readings[pos - 1] > cm) {
        readings[pos] = readings[pos - 1];
        --pos;
      }
      readings[pos] = cm;
    }
    // Leave time for the previous ultrasonic burst to clear before either sensor fires again.
    delay(60);
  }
  if (valid < 2) return {0, 0, false};
  const float cm = valid == 3 ? readings[1] : (readings[0] + readings[1]) / 2;
  const int fill = constrain(lroundf(100 * (bin.emptyCm - cm) / (bin.emptyCm - bin.fullCm)), 0L, 100L);
  return {cm, fill, true};
}

int post(const char *path, const char *mime, uint8_t *data, size_t size, String &body) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, String(SERVER_URL) + path)) return -1;
  http.setConnectTimeout(3000);
  http.setTimeout(4000);
  http.addHeader("Content-Type", mime);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);
  const int code = http.POST(data, size);
  if (code > 0) body = http.getString();
  http.end();
  if (code != 200) Serial.printf("%s -> %d %s\n", path, code, body.c_str());
  return code;
}

void writeReading(JsonObject dest, const Reading &reading) {
  if (reading.valid) {
    dest["fill"] = reading.fill;
    dest["distance_cm"] = roundf(reading.distance * 10) / 10;
  } else {
    dest["fill"] = nullptr;
    dest["distance_cm"] = nullptr;
  }
}

void queueReport(const Reading &paperReading, const Reading &plasticReading,
                 const String &id = "", const char *outcome = nullptr) {
  JsonDocument report;
  report["device_id"] = DEVICE_ID;
  report["camera"] = cameraReady ? "Ready" : "Unavailable";
  report["gate"] = servoReady ? "Standby" : "Disabled";
  JsonObject bins = report["bins"].to<JsonObject>();
  writeReading(bins["paper"].to<JsonObject>(), paperReading);
  writeReading(bins["plastic"].to<JsonObject>(), plasticReading);
  if (id.length() && outcome) {
    report["result_id"] = id;
    report["outcome"] = outcome;
  }
  pendingReport = "";
  serializeJson(report, pendingReport);
}

void flushReport() {
  if (!pendingReport.length()) return;
  String response;
  const int code = post("/api/device/report", "application/json",
                        reinterpret_cast<uint8_t *>(const_cast<char *>(pendingReport.c_str())),
                        pendingReport.length(), response);
  if (code == 200 || code == 400) {
    if (code == 400) Serial.println("Backend rejected the report. Review its error before continuing.");
    pendingReport = "";
  }
}

bool readyForItem(const String &label, float confidence) {
  if (label == "empty" && confidence >= EMPTY_CONFIDENCE) {
    itemFrames = 0;
    if (emptyFrames < 2) ++emptyFrames;
    if (emptyFrames >= 2) armed = true;
    return false;
  }
  emptyFrames = 0;
  if (!armed || label == "empty" || confidence < ITEM_CONFIDENCE) {
    itemFrames = 0;
    return false;
  }
  if (label != previousLabel) {
    previousLabel = label;
    itemFrames = 0;
  }
  if (++itemFrames < 2) return false;
  itemFrames = 0;
  armed = false;
  return true;
}

void captureAndSort(bool manual) {
  if (!cameraReady || WiFi.status() != WL_CONNECTED || pendingReport.length()) return;
  // The single queued framebuffer may have been captured before this request.
  if (camera_fb_t *queued = esp_camera_fb_get()) esp_camera_fb_return(queued);
  camera_fb_t *frame = esp_camera_fb_get();
  if (!frame) {
    Serial.println("Capture failed.");
    return;
  }
  String response;
  const int code = post("/api/device/classify", "image/jpeg", frame->buf, frame->len, response);
  esp_camera_fb_return(frame);
  if (code != 200) {
    emptyFrames = itemFrames = 0;
    armed = false;
    return;
  }
  JsonDocument decision;
  if (deserializeJson(decision, response)) return;
  const String label = decision["label"] | "";
  const String id = decision["id"] | "";
  if (label == "untrained" && id.length()) {
    Serial.printf("Training photo: %s/frames/latest.jpg?id=%s\n", SERVER_URL, id.c_str());
    return;
  }
  const float confidence = decision["confidence"] | -1.0f;
  if ((label != "empty" && label != "paper" && label != "plastic") ||
      !id.length() || !isfinite(confidence) || confidence < 0 || confidence > 1) return;
  Serial.printf("Prediction: %s (%.1f%%)\n", label.c_str(), confidence * 100);
  if (!manual && !readyForItem(label, confidence)) return;
  if (manual) {
    armed = false;
    itemFrames = emptyFrames = 0;
  }
  if (label == "empty") return;

  const Reading paperReading = sample(paper);
  const Reading plasticReading = sample(plastic);
  const Reading &target = label == "paper" ? paperReading : plasticReading;
  const char *outcome;
  if (confidence < ITEM_CONFIDENCE) outcome = "low_confidence";
  else if (!target.valid) outcome = "invalid_distance";
  else if (target.fill >= FULL_PERCENT) outcome = "full";
  else if (!servoReady) outcome = "disabled";
  else {
    servoPulse(label == "paper" ? SERVO_PAPER_US : SERVO_PLASTIC_US);
    delay(SORT_HOLD_MS);
    servoPulse(SERVO_NEUTRAL_US);
    outcome = "actuated";
  }
  Serial.printf("Sorting outcome: %s\n", outcome);
  queueReport(paperReading, plasticReading, id, outcome);
  flushReport();
  lastReport = millis();
}
}  // namespace

void setup() {
  Serial.begin(115200);
  if (validPins()) {
    if (ENABLE_SENSORS) {
      pinMode(PAPER_TRIG, OUTPUT);
      pinMode(PAPER_ECHO, INPUT);
      pinMode(PLASTIC_TRIG, OUTPUT);
      pinMode(PLASTIC_ECHO, INPUT);
      digitalWrite(PAPER_TRIG, LOW);
      digitalWrite(PLASTIC_TRIG, LOW);
      sensorsReady = true;
    }
    if (ENABLE_CAMERA) cameraReady = startCamera();
    if (ENABLE_SERVO && sensorsReady && cameraReady &&
        ledcSetup(SERVO_CHANNEL, 50, PWM_BITS) > 0) {
      servoPulse(SERVO_NEUTRAL_US);
      ledcAttachPin(SERVO_PIN, SERVO_CHANNEL);
      servoReady = true;
    }
  }
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.println("SortCycle ready. c: capture once, a: toggle automatic scanning.");
}

void loop() {
  const unsigned tick = millis();
  if (WiFi.status() != WL_CONNECTED) {
    automatic = false;
    armed = false;
    if (tick - lastWiFiRetry >= WIFI_RETRY_MS) {
      lastWiFiRetry = tick;
      WiFi.reconnect();
    }
    delay(20);
    return;
  }
  if (tick - lastReport >= REPORT_MS) {
    lastReport = tick;
    if (!pendingReport.length()) {
      const Reading paperReading = sample(paper);
      const Reading plasticReading = sample(plastic);
      queueReport(paperReading, plasticReading);
    }
    flushReport();
  }
  if (Serial.available()) {
    const int cmd = Serial.read();
    if (cmd == 'a') {
      automatic = !automatic;
      armed = false;
      itemFrames = emptyFrames = 0;
      Serial.println(automatic ? "Auto scanning. Begin with the chute empty." : "Auto scanning off.");
    }
    if (cmd == 'c') {
      automatic = false;
      captureAndSort(true);
    }
  }
  if (automatic && tick - lastScan >= SCAN_MS) {
    lastScan = millis();
    captureAndSort(false);
  }
  delay(10);
}
