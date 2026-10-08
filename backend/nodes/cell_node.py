#!/usr/bin/env python3
import math
import os
import threading
import time
from datetime import datetime, timezone

import cv2
import numpy as np
import yaml
from flask import Flask, Response, jsonify
import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from std_msgs.msg import Bool
from geometry_msgs.msg import PointStamped

CONFIG_PATH = os.environ.get("CONFIG_PATH", "/workspace/config/cell.yaml")
with open(CONFIG_PATH, "r", encoding="utf-8") as f:
    CONFIG = yaml.safe_load(f)["cell"]

required_config = ["mm_per_pixel", "belt_speed_mps", "pipeline_latency_ms", "camera_device", "camera_fps", "source_width", "source_height", "websocket_port", "camera_http_port", "home_pose_rad"]
missing = [key for key in required_config if key not in CONFIG]
if missing:
    raise RuntimeError(f"Missing configuration keys: {missing}")
if len(CONFIG["home_pose_rad"]) != 6:
    raise RuntimeError("home_pose_rad must contain exactly 6 joint values")
if float(CONFIG["mm_per_pixel"]) <= 0 or float(CONFIG["camera_fps"]) < 5:
    raise RuntimeError("mm_per_pixel must be positive and camera_fps must be at least 5")

JOINT_NAMES = [f"joint_{i}" for i in range(1, 7)]
HOME = [float(v) for v in CONFIG["home_pose_rad"]]

app = Flask(__name__)
camera = None
camera_lock = threading.Lock()
last_frame = None
frame_seq = 0


def synthetic_frame(width, height, seq):
    frame = np.full((height, width, 3), 245, dtype=np.uint8)
    step = 80
    for x in range(0, width, step):
        cv2.line(frame, (x, 0), (x, height), (215, 215, 215), 1)
    for y in range(0, height, step):
        cv2.line(frame, (0, y), (width, y), (215, 215, 215), 1)
    cx = int(width * 0.50 + math.sin(seq * 0.08) * width * 0.25)
    cy = int(height * 0.50 + math.cos(seq * 0.06) * height * 0.20)
    cv2.circle(frame, (cx, cy), 45, (40, 90, 220), -1)
    cv2.circle(frame, (width // 2, height // 2), 12, (30, 30, 30), 2)
    cv2.line(frame, (width // 2 - 22, height // 2), (width // 2 + 22, height // 2), (30, 30, 30), 2)
    cv2.line(frame, (width // 2, height // 2 - 22), (width // 2, height // 2 + 22), (30, 30, 30), 2)
    stamp = datetime.now(timezone.utc).strftime("%H:%M:%S UTC")
    cv2.putText(frame, "SYNTHETIC CAMERA FALLBACK", (28, 42), cv2.FONT_HERSHEY_SIMPLEX, 1.0, (30, 30, 30), 2)
    cv2.putText(frame, f"frame={seq}  {stamp}", (28, height - 28), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (60, 60, 60), 2)
    return frame


def capture_loop():
    global camera, last_frame, frame_seq
    device = int(CONFIG.get("camera_device", 0))
    width = int(CONFIG.get("source_width", 1280))
    height = int(CONFIG.get("source_height", 720))
    fps = max(5, int(CONFIG.get("camera_fps", 10)))
    period = 1.0 / fps

    cap = cv2.VideoCapture(device)
    if cap.isOpened():
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, width)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, height)
        camera = cap
        print(f"[camera] webcam opened at /dev/video{device}", flush=True)
    else:
        cap.release()
        camera = None
        print(f"[camera] WARNING: /dev/video{device} unavailable; using synthetic fallback", flush=True)

    while rclpy.ok():
        started = time.monotonic()
        if camera is not None:
            ok, frame = camera.read()
            if not ok:
                print("[camera] WARNING: webcam read failed; switching to synthetic fallback", flush=True)
                camera.release()
                camera = None
                frame = synthetic_frame(width, height, frame_seq)
        else:
            frame = synthetic_frame(width, height, frame_seq)
        frame_seq += 1
        ok, encoded = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 82])
        if ok:
            with camera_lock:
                last_frame = encoded.tobytes()
        time.sleep(max(0.0, period - (time.monotonic() - started)))

    if camera is not None:
        camera.release()


@app.get("/health")
def health():
    return jsonify({"ok": True, "camera": camera is not None, "fps": CONFIG.get("camera_fps", 10)})


@app.get("/urdf/mini_6dof.urdf")
def urdf():
    with open("/workspace/urdf/mini_6dof.urdf", "r", encoding="utf-8") as f:
        return Response(f.read(), mimetype="application/xml")


@app.get("/camera.mjpg")
def camera_stream():
    def stream():
        while True:
            with camera_lock:
                frame = last_frame
            if frame:
                yield b"--frame\r\nContent-Type: image/jpeg\r\nContent-Length: " + str(len(frame)).encode() + b"\r\n\r\n" + frame + b"\r\n"
            time.sleep(0.05)
    return Response(stream(), mimetype="multipart/x-mixed-replace; boundary=frame")


class CellNode(Node):
    def __init__(self):
        super().__init__("cell_controller")
        self.state = list(HOME)
        self.estop = False
        self.joint_pub = self.create_publisher(JointState, "/joint_states", 10)
        self.estop_pub = self.create_publisher(Bool, "/estop", 10)
        self.create_subscription(JointState, "/joint_command", self.on_joint_command, 10)
        self.create_subscription(Bool, "/estop", self.on_estop, 10)
        self.create_subscription(PointStamped, "/pick_target", self.on_pick_target, 10)
        self.timer = self.create_timer(0.05, self.publish_state)  # 20 Hz
        self.publish_state()
        self.get_logger().info("Cell controller ready; publishing /joint_states at 20 Hz")

    def publish_state(self):
        msg = JointState()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.name = JOINT_NAMES
        msg.position = list(self.state)
        self.joint_pub.publish(msg)

    def on_joint_command(self, msg):
        if self.estop:
            self.get_logger().warn("E-STOP latched: rejected /joint_command")
            return
        values = list(msg.position[:6])
        if len(values) != 6:
            self.get_logger().warn("Rejected /joint_command: expected 6 joint values")
            return
        self.state = [float(v) for v in values]

    def on_estop(self, msg):
        previous = self.estop
        self.estop = bool(msg.data)
        if self.estop and not previous:
            self.get_logger().warn("E-STOP LATCHED: joint commands are now rejected")
        elif not self.estop and previous:
            self.get_logger().info("E-STOP RESET")

    def on_pick_target(self, msg):
        self.get_logger().info(
            f"pick_target received: x={msg.point.x:.2f} mm, y={msg.point.y:.2f} mm, z={msg.point.z:.2f} mm"
        )


def start_http():
    app.run(host="0.0.0.0", port=int(CONFIG["camera_http_port"]), threaded=True, use_reloader=False)


def main():
    rclpy.init()

    node = CellNode()

    camera_thread = threading.Thread(target=capture_loop, daemon=True)
    camera_thread.start()

    http_thread = threading.Thread(target=start_http, daemon=True)
    http_thread.start()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    except rclpy.executors.ExternalShutdownException:
        pass
    finally:
        node.destroy_node()
        if rclpy.ok():
            rclpy.shutdown()


if __name__ == "__main__":
    main()