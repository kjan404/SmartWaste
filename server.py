"""Local SortCycle dashboard and single-station API."""

import argparse
import hmac
import json
import os
import secrets
import sqlite3
from contextlib import closing
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from io import BytesIO
from pathlib import Path
from threading import Lock
from urllib.parse import parse_qs, urlsplit

from PIL import Image

from classifier import Model

ROOT = Path(__file__).resolve().parent
MATERIALS = ("paper", "plastic")
OUTCOMES = {
    "actuated": "Gate actuated",
    "full": "Held · bin full",
    "invalid_distance": "Held · sensor unavailable",
    "low_confidence": "Held · low confidence",
    "disabled": "Held · gate disabled",
}
ASSETS = {
    "/": ("index.html", "text/html; charset=utf-8"),
    "/index.html": ("index.html", "text/html; charset=utf-8"),
    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
    "/style.css": ("style.css", "text/css; charset=utf-8"),
    "/icon.svg": ("icon.svg", "image/svg+xml"),
}


def now():
    return datetime.now(timezone.utc).isoformat()


def number(value, low, high):
    return type(value) in (int, float) and low <= value <= high


def bins_from(value):
    if not isinstance(value, dict):
        raise ValueError("Expected both bin readings.")
    result = {}
    for label in MATERIALS:
        reading = value.get(label)
        if not isinstance(reading, dict):
            raise ValueError(f"Missing {label} reading.")
        fill, distance = reading.get("fill"), reading.get("distance_cm")
        if fill is not None and not number(fill, 0, 100):
            raise ValueError("Fill must be 0–100 or null.")
        if distance is not None and not number(distance, 0, 400):
            raise ValueError("Distance must be 0–400 cm or null.")
        result[label] = {"fill": fill, "distance_cm": distance}
    return result


class Station:
    def __init__(self, state, model_path, device_id, threshold):
        state.mkdir(parents=True, exist_ok=True)
        token_path = state / ".device-token"
        self.token = os.environ.get("SORTCYCLE_DEVICE_TOKEN")
        if not self.token:
            try:
                self.token = token_path.read_text(encoding="ascii").strip()
            except FileNotFoundError:
                self.token = secrets.token_urlsafe(24)
                with os.fdopen(os.open(token_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600),
                               "w", encoding="ascii") as file:
                    file.write(self.token + "\n")
        if len(self.token) < 16 or not self.token.isascii():
            raise ValueError("The device token must contain at least 16 ASCII characters.")
        self.db = state / "events.db"
        with closing(sqlite3.connect(self.db)) as db:
            db.execute("""CREATE TABLE IF NOT EXISTS sorting (
                id TEXT PRIMARY KEY, device TEXT NOT NULL, label TEXT NOT NULL,
                confidence REAL NOT NULL, outcome TEXT NOT NULL, at TEXT NOT NULL
            )""")
            db.commit()
        self.model = Model(model_path) if model_path.is_file() else None
        self.device = device_id
        self.threshold = threshold
        self.lock = Lock()
        self.frame = None
        self.snapshot = None
        self.alerts = []
        self.full_bins = set()

    def classify(self, image):
        if self.model:
            label, confidence = self.model.predict(image)
        else:
            with Image.open(BytesIO(image)) as capture:
                if capture.format != "JPEG" or capture.width * capture.height > Image.MAX_IMAGE_PIXELS:
                    raise ValueError("Expected a JPEG frame of at most 2 megapixels.")
                capture.load()
            label, confidence = "untrained", None
        frame = {"id": secrets.token_hex(12), "label": label, "confidence": confidence, "at": now()}
        with self.lock:
            self.frame = (frame, image)
        return frame

    def report(self, body):
        if body.get("device_id") != self.device:
            raise ValueError(f"Expected device_id {self.device}.")
        bins = bins_from(body.get("bins"))
        camera, gate = body.get("camera"), body.get("gate")
        if camera not in ("Ready", "Unavailable") or gate not in ("Standby", "Disabled"):
            raise ValueError("Invalid component status.")
        event_id, outcome = body.get("result_id"), body.get("outcome")
        stamp = now()
        with self.lock, closing(sqlite3.connect(self.db)) as db:
            if event_id is not None:
                if not isinstance(event_id, str) or not isinstance(outcome, str) or outcome not in OUTCOMES:
                    raise ValueError("Invalid sorting report.")
                existing = db.execute(
                    "SELECT outcome FROM sorting WHERE id=? AND device=?", (event_id, self.device)
                ).fetchone()
                if existing and existing[0] != outcome:
                    raise ValueError("Sorting outcome already recorded.")
                if not existing:
                    frame = self.frame[0] if self.frame else {}
                    if frame.get("id") != event_id or frame["label"] not in MATERIALS:
                        raise ValueError("Unknown material result. Capture a new frame.")
                    db.execute("INSERT INTO sorting VALUES (?,?,?,?,?,?)",
                               (event_id, self.device, frame["label"], frame["confidence"], outcome, stamp))
                    db.commit()

            counts = dict.fromkeys(MATERIALS, 0)
            counts.update(db.execute("""SELECT label, COUNT(*) FROM sorting
                WHERE device=? AND outcome='actuated' GROUP BY label""", (self.device,)))
            rows = db.execute("""SELECT label, confidence, outcome, at FROM sorting
                WHERE device=? ORDER BY rowid DESC LIMIT 100""", (self.device,))
            activity = [dict(label=label, confidence=conf, status=OUTCOMES[result], at=at)
                        for label, conf, result, at in rows]

            for label, reading in bins.items():
                fill = reading["fill"]
                if fill is None:
                    continue
                if fill >= self.threshold and label not in self.full_bins:
                    self.full_bins.add(label)
                    self.alerts.insert(0, dict(id=secrets.token_hex(8), severity="warning",
                                            title=f"{label.capitalize()} bin full",
                                            detail=f"Measured fill is {fill}%.", at=stamp))
                if fill < self.threshold:
                    self.full_bins.discard(label)
            self.alerts = self.alerts[:40]
            self.snapshot = dict(
                device_id=self.device, updated_at=stamp, counts=counts, bins=bins, activity=activity,
                components=dict(camera=camera, gate=gate,
                                sensors="Sampling" if all(b["fill"] is not None for b in bins.values())
                                else "Check readings"),
                notifications=self.alerts.copy(),
            )
        return {"ok": True}

    def telemetry(self):
        with self.lock:
            if self.snapshot is None:
                return None
            result = self.snapshot.copy()
            if self.frame:
                frame = self.frame[0]
                label = frame["label"] if frame["label"] in MATERIALS else "unknown"
                result["classification"] = dict(label=label, confidence=frame["confidence"], at=frame["at"],
                                                image_url=f'/frames/latest.jpg?id={frame["id"]}')
            return result


class Handler(BaseHTTPRequestHandler):
    def setup(self):
        super().setup()
        self.connection.settimeout(10)

    def respond(self, code, body, content_type):
        self.send_response(code)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        origin = self.headers.get("Origin")
        if origin and origin == self.server.allowed_origin:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def json(self, code, data):
        self.respond(code, json.dumps(data, allow_nan=False).encode("utf-8"), "application/json")

    def body(self, limit, content_type):
        if self.headers.get_content_type() != content_type:
            raise ValueError(f"Expected {content_type}.")
        size = int(self.headers.get("Content-Length", "0"))
        if not 0 < size <= limit:
            raise ValueError(f"Body must be 1 to {limit} bytes.")
        data = self.rfile.read(size)
        if len(data) != size:
            raise ValueError("Incomplete request.")
        return data

    def do_OPTIONS(self):
        path = urlsplit(self.path).path
        allowed = path in ("/api/health", "/api/telemetry", "/api/test/telemetry")
        self.respond(204 if allowed else 404, b"", "text/plain")

    def do_GET(self):
        url = urlsplit(self.path)
        station = self.server.station
        if url.path in ASSETS:
            filename, mime = ASSETS[url.path]
            self.respond(200, (ROOT / "dashboard" / filename).read_bytes(), mime)
        elif url.path == "/api/health":
            self.json(200, {"ok": True, "model_loaded": station.model is not None,
                            "device_id": station.device})
        elif url.path == "/api/telemetry":
            snapshot = station.telemetry()
            self.json(200 if snapshot else 503, snapshot or {"error": "Waiting for an ESP32 report."})
        elif url.path == "/frames/latest.jpg":
            with station.lock:
                frame = station.frame
            frame_id = parse_qs(url.query).get("id", [None])[0]
            if frame and frame_id == frame[0]["id"]:
                self.respond(200, frame[1], "image/jpeg")
            else:
                self.json(404, {"error": "Frame unavailable."})
        else:
            self.json(404, {"error": "Unknown route."})

    def do_POST(self):
        path = urlsplit(self.path).path
        station = self.server.station
        if path in ("/api/device/classify", "/api/device/report"):
            auth = self.headers.get("Authorization", "").encode("utf-8")
            if not hmac.compare_digest(auth, f"Bearer {station.token}".encode("ascii")):
                self.json(401, {"error": "Invalid device token."})
                return
        try:
            if path == "/api/device/classify":
                result = station.classify(self.body(524_288, "image/jpeg"))
            elif path in ("/api/device/report", "/api/test/telemetry"):
                data = json.loads(self.body(32_768, "application/json"))
                if not isinstance(data, dict):
                    raise ValueError("Expected a JSON object.")
                result = station.report(data) if path == "/api/device/report" else {
                    "ok": True, "test": True, "fields": sorted(data)
                }
            else:
                self.json(404, {"error": "Unknown route."})
                return
        except (ValueError, OSError, Image.DecompressionBombError) as error:
            self.json(400, {"error": str(error)})
            return
        self.json(200, result)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--model", type=Path, default=ROOT / "model.json")
    parser.add_argument("--state-dir", type=Path, default=ROOT / "state")
    parser.add_argument("--device-id", default="esp32-s3-cam-01")
    parser.add_argument("--full", type=int, choices=range(1, 101), default=80, metavar="PERCENT")
    parser.add_argument("--allow-origin", default="", help="Exact HTTPS Site origin for CORS, if needed.")
    args = parser.parse_args()
    with ThreadingHTTPServer((args.host, args.port), Handler) as server:
        server.station = Station(args.state_dir, args.model, args.device_id, args.full)
        server.allowed_origin = args.allow_origin
        model = "loaded" if server.station.model else "missing (simulation available)"
        print(f"SortCycle on http://{args.host}:{server.server_port}/ | model {model}", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
