# SortCycle for Visual Studio Code

IoT-Based Smart Waste Segregation System for Automatic Classification of Paper and Plastic Waste. This project contains the SortCycle dashboard, a local Python API, a trainable baseline image classifier and PlatformIO firmware. It supports one ESP32 station and one item in the staging area at a time.

## Project files

| Path | Purpose |
| --- | --- |
| `dashboard/` | HTML, CSS and JavaScript for the dashboard and commissioning pages |
| `server.py` | Serves the dashboard, API, latest JPEG and SQLite sorting history |
| `classifier.py`, `train.py` | Image features, model training, evaluation and prediction |
| `requirements.txt` | Python dependencies |
| `dataset/paper/`, `dataset/plastic/`, `dataset/empty/` | Put your labeled photos here |
| `firmware/` | PlatformIO project for the ESP32-S3 |
| `PARTS.md` | Parts list, tentative GPIO assignments and wiring checks |

## 1. Start the dashboard on Windows

Extract the ZIP. Open the extracted **SortCycle** folder in VS Code using **File → Open Folder**. Install Python 3.11 or 3.12 and optionally the Microsoft Python extension. Open **Terminal → New Terminal**. Run the following in that terminal, in the folder containing `requirements.txt`.

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe server.py
```

Use `py -3.11` in the first command if you installed Python 3.11. Using the virtual environment’s executable directly works without activating a PowerShell script. On macOS/Linux, create the environment with `python3 -m venv .venv` and use `.venv/bin/python` for the next commands.

Open [http://127.0.0.1:8000/](http://127.0.0.1:8000/) in your browser. The dashboard starts in **Simulation**. **Connection test → Health check** should show HTTP 200. **Send test POST** exercises JSON handling without creating a sorting event. A telemetry response of HTTP 503 is expected before the first ESP32 report.

## 2. Train the camera classifier

1. To capture training photos with the ESP32, first follow the connection steps below through camera bring-up. With the servo disabled and no model loaded, send **c** to capture a photo. Open the link printed in the serial monitor or save the image from the live dashboard before capturing the next photo. Photograph paper and plastic in the same staging area and camera position the project will use. Include different pieces, rotations, backgrounds and lighting conditions expected in operation. Put JPEG or PNG files in `dataset/paper/` and `dataset/plastic/`.
2. Take pictures of the empty staging area under varied lighting and put them in `dataset/empty/`. Use at least 10 distinct images per folder to run the trainer. Collect substantially more for meaningful evaluation. Keep near-duplicates and bursts of the same physical item out of your independent evaluation set.
3. Run the command below. It prints held-out metrics and writes `model.json`. Restart the server to load the model. Evaluate the model separately with physical items and lighting excluded from training before enabling motion.

```powershell
.\.venv\Scripts\python.exe train.py
```

The baseline uses spatial color and edge features with logistic regression. It is trained on your photos. The ZIP contains no trained model or example dataset. Low confidence blocks the gate, but model confidence alone cannot identify every unfamiliar material. Validate performance with your own samples, including ambiguous or unsupported items.

## 3. Connect the ESP32

1. Read [PARTS.md](PARTS.md). Identify the carrier and camera, find the correct camera GPIO profile, and verify spare GPIOs. Keep the servo linkage disconnected while commissioning.
2. Stop the first server with **Ctrl+C**. Start it on the PC’s LAN interface with the command below. Use a trusted private Wi-Fi network. If needed, allow inbound TCP port 8000 on the PC’s private network firewall. Keep the laptop and ESP32 on the same reachable network. The ESP32 needs a 2.4 GHz Wi-Fi network.
3. Run `ipconfig` on Windows to find the PC’s Wi-Fi IPv4 address. For example, if it is `192.168.1.100`, use `http://192.168.1.100:8000` in the ESP32 configuration. Use your real IP, as `127.0.0.1` on the ESP32 points back to the ESP32.

```powershell
.\.venv\Scripts\python.exe server.py --host 0.0.0.0
```

4. In VS Code install **PlatformIO IDE**. Open the **firmware** folder separately so PlatformIO can find `platformio.ini`. Copy `include/config.example.h` to `include/config.h`. Enter Wi-Fi credentials, the server URL, and the token from `state/.device-token` in the main SortCycle folder. The server creates that file on first start. Keep it and `config.h` private.
5. Start with all three `ENABLE_...` flags set to `false` for a network-only test. The build target uses a generic ESP32-S3 DevKitC configuration. Check your actual carrier’s flash size, USB/UART connection, upload method and serial setting before flashing. Use **PlatformIO → Build → Upload**, then open **Monitor** at 115200 baud.
6. Open the local dashboard in your browser. Under **Device settings**, choose **Live Python backend** and save. A blank backend URL uses the current page’s origin. Under **Connection test**, **Read telemetry** should show a fresh timestamp and your device ID even with hardware flags disabled.
7. Set your verified camera profile and enable the camera. Upload again. Put a sample in view and send **c** from the serial monitor. Verify the image and result. Before training, the dashboard shows the frame with unknown material and no confidence score. Then wire and calibrate the two sensors, enter their measured empty and full distances, and enable the sensors.
8. Set calibrated servo pulse widths, confirm neutral and travel with the linkage disconnected, then enable the servo. **c** requests one capture. **a** toggles automatic scanning. Auto starts disabled on every boot and after Wi-Fi drops. In auto mode the staging area must look empty for two frames before two confident frames of the same material can trigger a sort. Clear the area between items. Keep hands clear of the gate and verify it stops at neutral without binding.

In live mode, the counters track acknowledged gate actuations. There is no independent sensor to verify the item landed in the bin. A full or unreadable destination bin blocks the gate. Check the fill setting in three places if you change it. Use `FULL_PERCENT` in firmware to hold the gate, `server.py --full PERCENT` for backend notification events, and the dashboard threshold for visual alerts. The dashboard’s simulated angles are separate from the firmware’s servo pulse widths.

## API and storage

| Method and path | Use |
| --- | --- |
| `GET /api/health` | Backend status and whether a model was loaded |
| `GET /api/telemetry` | Latest live dashboard snapshot |
| `POST /api/test/telemetry` | JSON response check with no device side effects |
| `POST /api/device/classify` | ESP32 uploads raw `image/jpeg`, receives a result ID, label and confidence. Before training this route provides a preview with no prediction. |
| `POST /api/device/report` | ESP32 sends bin readings, component status and optional sorting outcome |

Device POSTs use a Bearer token. Report retries use the same result ID so an acknowledged gate actuation is counted once. Counts and sorting history persist in `state/events.db`. The latest camera image, telemetry and recent bin alert events are held in memory. The browser stores its settings and checklist locally.

The supplied HTTP server is for local bench and trusted LAN use. A hosted dashboard requires a separate HTTPS integration with appropriate access controls. The optional `--allow-origin` flag sets browser CORS for one exact origin. Keep local HTTP and its device token on the private network. The ZIP can be run entirely on your own computer without the hosted Site.

## Verified scope

The dashboard, Python API, classifier training path, and sorting report flow were exercised with synthetic test frames and simulated ESP32 requests. Physical camera operation, firmware flashing, board pin availability, classifier accuracy and servo calibration depend on your hardware and training data.
