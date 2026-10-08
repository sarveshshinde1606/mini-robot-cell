# Mini Robot Cell Operator Console

Take-home practical assignment for Junior Robotics Application Engineer.

## Run

The reviewer only needs Docker.

From the repository root:

```bash
docker compose up --build

Then open:
http://localhost:8080
No Node.js, Python, ROS 2, npm install, or additional host-side setup is required.
Architecture
                         Browser :8080
                              |
              +---------------+---------------+
              |                               |
              v                               v
      React Main Console              Vue Camera & Pick Panel
      - 3D robot viewer               - Live MJPEG camera
      - 6 joint sliders               - Crosshair
      - HOME                          - Pixel → mm conversion
      - E-STOP                        - Latency compensation
              |                               |
              +---------------+---------------+
                              |
                         WebSocket
                              |
                              v
                       rosbridge :9090
                              |
                              v
                    ROS 2 Cell Controller
                              |
              +---------------+----------------+
              |               |                |
              v               v                v
        /joint_states   /joint_command   /pick_target
                              |
                              v
                    robot_state_publisher
                              |
                              v
                     6-DOF URDF / TF

The backend also provides the camera stream through HTTP/MJPEG.
ROS 2 / URDF
- ROS 2 Jazzy is used for the containerized ROS environment.
- The assignment preferred ROS 2 Lyrical, but Jazzy is acceptable.
- Hand-written 6-DOF URDF:
  backend/urdf/mini_6dof.urdf
- Six revolute joints with explicit joint limits.
- Simple primitive link geometry is used instead of third-party robot meshes.
- robot_state_publisher publishes the TF tree from base_link through tool0.
React Main Console
The React application provides:
- 3D 6-DOF robot visualization.
- Six joint sliders.
- Joint limits loaded from the URDF.
- Joint values displayed in radians and degrees.
- HOME pose.
- E-STOP and RESET E-STOP.
- WebSocket connection status.
- Automatic WebSocket reconnect.
Joint command flow:
React slider
     |
     v
/joint_command
     |
     v
ROS 2 backend
     |
     v
/joint_states
     |
     v
React UI

The robot pose displayed by the UI is driven by /joint_states feedback rather than directly by the slider value.
Vue Camera & Pick Panel
The camera and pick interface is implemented as a separate Vue application mounted inside the React page.
It provides:
- Live camera display.
- Centre crosshair.
- Pixel-to-mm conversion.
- Correct source/display scaling.
- Configurable millimetres-per-pixel.
- Configurable belt speed.
- Configurable pipeline latency.
- Latency compensation.
- /pick_target publication.
Pixel → mm Conversion
The default camera source resolution is:
1280 × 720

The default calibration scale is:
0.4 mm/pixel

The clicked browser coordinate is first converted back to source-image coordinates so that display scaling does not affect the result.
u = (x_display - rect.left) × source_width / rect.width
v = (y_display - rect.top)  × source_height / rect.height

The offset from the image centre is then:
dx = (u - source_width / 2) × mm_per_pixel
dy = (v - source_height / 2) × mm_per_pixel

Latency Compensation
The conveyor travel during the configured pipeline latency is:
compensation = belt_speed × latency

Default values:
Belt speed = 0.25 m/s
Latency    = 200 ms

Therefore:
0.25 × 0.2 = 0.05 m = 50 mm

The compensation is applied along the configured +X direction.
ROS Topics
Topic	Message Type	Units / Purpose
/joint_command	sensor_msgs/JointState	Joint commands in radians
/joint_states	sensor_msgs/JointState	Joint feedback in radians
/estop	std_msgs/Bool	E-STOP state
/pick_target	geometry_msgs/PointStamped	Pick coordinates in millimetres
/robot_description	std_msgs/String	Robot URDF description


The /pick_target message uses the camera frame.
E-STOP
E-STOP is enforced at both the frontend and backend.
When E-STOP is latched:
1. The React joint controls are disabled.
2. The backend latches the E-STOP state.
3. Incoming /joint_command messages are rejected.
4. The rejected command is logged by the backend.
5. RESET E-STOP clears the latch.
Verify the backend behavior with:
docker compose logs backend | grep -E "E-STOP|rejected"

Expected log messages include:
E-STOP LATCHED: joint commands are now rejected
E-STOP latched: rejected /joint_command
E-STOP RESET

Camera Fallback
The backend attempts to open:
/dev/video0

If a physical camera is unavailable, it automatically switches to a synthetic camera source.
The fallback provides:
1280 × 720
10 FPS

Expected warning:
[camera] WARNING: /dev/video0 unavailable; using synthetic fallback

The application continues to operate without a physical camera.
WebSocket Reconnect
The React application connects to rosbridge through the frontend reverse proxy:
ws://localhost:8080/rosbridge

The UI displays the WebSocket connection state.
If the backend is stopped, the indicator changes to disconnected. When the backend is started again, the client automatically reconnects.
Configuration
Runtime configuration is centralized in:
config/cell.yaml

This includes values such as:
- millimetres per pixel
- belt speed
- pipeline latency
- home pose
- WebSocket configuration
- camera device
- camera settings
Tests
Run the backend test suite with:
python3 -m unittest discover -s backend/tests -v

The current suite contains 10 tests covering:
- Centre pixel-to-mm conversion.
- Corner pixel-to-mm conversion.
- Display/source image scaling.
- Latency compensation.
- Zero-latency behavior.
- URDF joint-name uniqueness.
- Required base_link and tool0 links.
Bonus
Attempted
Tests
Unit tests were added for:
- pixel-to-mm conversion
- display/source scaling
- latency compensation
- basic URDF structure validation
Not Attempted
The following optional extensions were intentionally not implemented:
- Smooth motion / interpolation.
- OpenCV blob detection.
- Pixel-to-robot-frame transformation.
- MQTT bridge.
- Inverse kinematics.
- Gazebo/Webots simulation.
The focus was kept on the core operator-console workflow and reliable Docker/ROS integration.
What Works
- One-command Docker startup.
- React 6-DOF robot console.
- URDF-based joint limits.
- Six joint controls with radians and degrees.
- ROS /joint_states feedback at approximately 20 Hz.
- HOME command.
- E-STOP with backend enforcement.
- WebSocket status and automatic reconnect.
- Separate Vue camera/pick panel.
- Live synthetic camera stream.
- Physical camera support when /dev/video0 is available.
- Automatic camera fallback when no camera is present.
- Pixel-to-mm conversion with source/display scaling.
- Belt-speed latency compensation.
- /pick_target publication and backend logging.
- ROS 2 Jazzy.
- rosbridge.
- robot_state_publisher.
- Complete robot TF tree.
- Runtime assets bundled into Docker images.
- No runtime downloads.
Deliberate Scope Cuts
The following were intentionally excluded:
- Gazebo/Webots simulation.
- Inverse kinematics.
- MQTT bridge.
- OpenCV blob detection.
- Vendor-specific robot mesh package.
- Camera calibration workflow.
- Camera-to-robot TF calibration workflow.
- Real hardware safety interlocks.
- Smooth trajectory interpolation.
The URDF uses simple primitive geometry to keep the project self-contained and avoid external mesh dependencies.
What I'd Do Next
1. Replace the primitive URDF with a properly attributed UR5e/Panda asset package.
2. Add smooth joint interpolation and trajectory handling.
3. Add real hardware safety interlocks.
4. Add camera calibration and camera-to-robot TF calibration.
5. Add integration tests for rosbridge and browser reconnect behavior.
6. Add a production camera transport and calibration pipeline.
Console Screenshot

Image Size / Build Time
Measured on the development machine:
- Backend image: approximately 2.21 GB
- Frontend image: approximately 94 MB
- Combined image size: approximately 2.30 GB
- Cold build time: approximately 11 minutes 30 seconds
The cold-build measurement was obtained using:
docker compose build --no-cache

Build time is machine-dependent.
Demo Video
The final 2–3 minute demonstration should show:
1. docker compose up --build
2. Opening http://localhost:8080
3. Moving all six joint sliders.
4. Showing radians and degrees.
5. HOME.
6. E-STOP activation.
7. Disabled joint controls.
8. Backend rejection of a joint command while E-STOP is active.
9. RESET E-STOP.
10. Vue camera click.
11. Pixel-to-mm calculation.
12. Latency compensation.
13. Backend restart.
14. WebSocket reconnect.
15. Synthetic camera fallback.
Demo video: To be added as the final submission link/file.
Camera Device Access
The backend container uses Docker privileged device access so that /dev/video0 can be accessed when a host camera is available.
When no camera device is present, Compose startup still succeeds and the synthetic camera fallback is used.
This configuration is intentionally scoped to the take-home demonstration. A production deployment should use a narrowly scoped device mapping with appropriate permissions.
Attribution
The robot URDF is original assignment-specific primitive geometry and does not redistribute third-party robot meshes.
