#pragma once

// Copy this to config.h. Keep config.h private.
constexpr char WIFI_SSID[] = "YOUR_2_4_GHZ_WIFI";
constexpr char WIFI_PASSWORD[] = "YOUR_WIFI_PASSWORD";
constexpr char SERVER_URL[] = "http://192.168.1.100:8000";  // PC IPv4, no trailing slash
constexpr char DEVICE_ID[] = "esp32-s3-cam-01";
constexpr char DEVICE_TOKEN[] = "COPY_FROM_state/.device-token";

// Verify actual carrier schematic and headers before enabling hardware.
constexpr bool ENABLE_CAMERA = false;
constexpr bool ENABLE_SENSORS = false;
constexpr bool ENABLE_SERVO = false;

// Required pins must come from the verified camera profile. -1 means unset.
// PWDN and RESET may stay -1 only when the verified profile specifies no GPIO.
constexpr int CAM_XCLK = -1;
constexpr int CAM_SIOD = -1;
constexpr int CAM_SIOC = -1;
constexpr int CAM_D0 = -1; // Y2
constexpr int CAM_D1 = -1; // Y3
constexpr int CAM_D2 = -1; // Y4
constexpr int CAM_D3 = -1; // Y5
constexpr int CAM_D4 = -1; // Y6
constexpr int CAM_D5 = -1; // Y7
constexpr int CAM_D6 = -1; // Y8
constexpr int CAM_D7 = -1; // Y9
constexpr int CAM_VSYNC = -1;
constexpr int CAM_HREF = -1;
constexpr int CAM_PCLK = -1;
constexpr int CAM_PWDN = -1;
constexpr int CAM_RESET = -1;

// Illustrative candidates only. Replace any pin used by your carrier.
constexpr int PAPER_TRIG = 1;
constexpr int PAPER_ECHO = 2;
constexpr int PLASTIC_TRIG = 4;
constexpr int PLASTIC_ECHO = 5;
constexpr int SERVO_PIN = 6;

// Examples only. Measure each empty bin and the desired full distance.
constexpr float PAPER_EMPTY_CM = 50.0;
constexpr float PAPER_FULL_CM = 5.0;
constexpr float PLASTIC_EMPTY_CM = 50.0;
constexpr float PLASTIC_FULL_CM = 5.0;
constexpr int FULL_PERCENT = 80;
constexpr float ITEM_CONFIDENCE = 0.80;
constexpr float EMPTY_CONFIDENCE = 0.90;

// Calibrate with the linkage disconnected and stay inside the servo's rated range.
constexpr int SERVO_NEUTRAL_US = 1500;
constexpr int SERVO_PAPER_US = 1250;
constexpr int SERVO_PLASTIC_US = 1750;
constexpr unsigned SORT_HOLD_MS = 700;
