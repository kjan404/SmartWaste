# SmartWaste for Visual Studio Code

IoT-Based Smart Waste Segregation System for Automatic Classification of Paper and Plastic Waste. This project contains the SmartWaste dashboard, a local Python API, a trainable baseline image classifier and PlatformIO firmware. It supports one ESP32 station and one item in the staging area at a time.

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
