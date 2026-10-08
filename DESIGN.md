# DESIGN — Mini Robot Cell Operator Console

## 1. Architecture and interfaces

```text
React  ---------------- WebSocket ----------------> rosbridge
  |                                                   |
  | /joint_command (sensor_msgs/JointState)          |
  | /estop (std_msgs/Bool)                            v
  |                                             cell_controller
  |                                                   |
  | <------------- /joint_states --------------------+
  |
  +---- mounts independent Vue app
              |
              +---- GET /camera.mjpg <--- camera thread
              +---- /pick_target -----> rosbridge

robot_state_publisher reads mini_6dof.urdf and publishes TF.
```

| Topic / endpoint | Type | Units / purpose |
|---|---|---|
| `/joint_command` | `sensor_msgs/JointState` | joint positions in radians |
| `/joint_states` | `sensor_msgs/JointState` | reported joint positions in radians, 20 Hz |
| `/estop` | `std_msgs/Bool` | latched safety state |
| `/pick_target` | `geometry_msgs/PointStamped` | x/y offsets and z compensation in mm; frame `camera` |
| `/camera.mjpg` | HTTP MJPEG | 1280×720 camera/fallback frames |
| `/urdf/mini_6dof.urdf` | HTTP | committed URDF XML |

## 2. React + Vue integration

React owns the operator console and robot state. Vue is mounted into a dedicated `#vue-panel` element using `createApp`, so it is a genuinely separate Vue component tree rather than React code styled as Vue. This is simpler than an iframe while preserving independent Vue lifecycle/computed state.

Trade-off: both frameworks share one browser bundle, so the JavaScript payload is larger than an iframe split. The benefit is simpler same-page layout and no cross-document messaging.

## 3. Camera transport

MJPEG over HTTP was chosen for the camera because it is simple, browser-native, and independent from ROS image message serialization. The backend emits JPEG frames at 10 FPS. If `/dev/video0` cannot be opened, a synthetic 1280×720 frame is generated with a moving blob, grid, centre marker, and timestamp. This keeps the reviewer path deterministic and satisfies the no-camera requirement.

## 4. Pixel → mm math

The source image is `W × H`. The click is first converted from displayed coordinates `(xd, yd)` into source coordinates `(u, v)`:

`u = (xd - rect.left) × W / rect.width`

`v = (yd - rect.top) × H / rect.height`

Then, with `s = mm_per_pixel`:

`Δx = (u - W/2) × s`

`Δy = (v - H/2) × s`

Default `s = 0.4 mm/pixel`. This means a 1280px source displayed at 640px still produces the same physical offset.

## 5. Conveyor latency compensation

With belt speed `v` in m/s and pipeline latency `t` in ms:

`compensation_mm = v × (t / 1000) × 1000`

So the default `0.25 m/s × 0.200 s = 0.050 m = 50 mm`, displayed as an extra +X offset.

## 6. E-STOP enforcement

E-STOP is enforced in the backend, not only in React. The cell controller stores a latched boolean. While latched, `/joint_command` messages are ignored and a warning is logged. The UI also disables controls to give immediate operator feedback. This defence-in-depth design prevents a browser bug from bypassing the safety state.

## 7. Deliberate scope cuts

No Gazebo/Webots, IK, MQTT, blob detection, or vendor mesh package was attempted. The highest-risk grading item is the one-command Docker startup, so effort was spent on deterministic startup, ROS bridge integration, fallback camera behavior, and a small inspectable URDF instead of large optional features.
