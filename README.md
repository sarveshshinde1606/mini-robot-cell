# Mini Robot Cell Operator Console

Take-home practical assignment for Junior Robotics Application Engineer.

## Run

The reviewer only needs:

```bash
docker compose up --build
```

Then open **http://localhost:8080**.

No Node, Python, ROS, npm install, or second terminal is required on the host.

## Architecture

```text
Browser :8080
  |
  +-- React main console ------------------+
  |   Three.js URDF viewer                  |
  |   6 joint sliders / HOME / E-STOP      |
  |                                         |
  +-- Vue camera & pick panel               |
      MJPEG + pixel/mm + compensation       |
                    |                       |
                    +---- WebSocket --------+--> rosbridge :9090
                    |                       |
                    +---- MJPEG -----------> backend :8081
                                            |
                                  ROS 2 cell controller
                                  robot_state_publisher
                                            |
                                  /joint_states
                                  /joint_command
                                  /pick_target
                                  /estop
```

## ROS / URDF

- ROS 2 **Jazzy** (Lyrical was preferred by the brief but is not required).
- Hand-written 6-DOF URDF: `backend/urdf/mini_6dof.urdf`.
- Six revolute joints with explicit limits and simple primitive link geometry.
- `robot_state_publisher` publishes the TF tree from `base_link` through `tool0`.

## What works

- React 3D 6-DOF URDF-style robot viewer.
- Joint limits are parsed from the URDF, not duplicated in the UI.
- Slider → `/joint_command` → backend → `/joint_states` → React round trip.
- Joint values shown in radians and degrees.
- HOME pose.
- WebSocket connection indicator and automatic reconnect.
- UI E-STOP plus backend-side rejection of joint commands while latched.
- Separate Vue application mounted into the React page.
- Camera stream at 10 FPS.
- Synthetic 1280×720 moving camera fallback when `/dev/video0` is unavailable.
- Correct source/display scaling for pixel → mm.
- Latency compensation.
- Pick target published to `/pick_target` and logged by the backend.
- All runtime assets are inside the images; no runtime downloads.

## What doesn't work / deliberate scope cuts

- The URDF uses primitive geometry instead of a vendor mesh package. This keeps the repository small and avoids runtime downloads while satisfying the brief's accepted hand-written-URDF option.
- No Gazebo/Webots simulation.
- No IK.
- No MQTT bridge.
- No OpenCV blob detection bonus.
- Physical webcam passthrough is intentionally optional; the mandatory synthetic fallback is always available. If a host camera is exposed to the container, the backend attempts to open `/dev/video0` automatically.

## What I'd do next

1. Replace primitive URDF geometry with an attributed UR5e/Panda asset package.
2. Add smooth joint interpolation and real robot safety interlocks.
3. Add camera calibration and camera→robot TF calibration workflow.
4. Add integration tests around rosbridge and browser reconnect behavior.

## Camera fallback verification

The backend attempts `/dev/video0`. If it cannot open it, it logs a warning and immediately publishes a synthetic 1280×720 stream. The UI remains unchanged.

## E-STOP verification

Press **E-STOP**, then move a slider. The UI disables sliders and the backend log reports a rejected `/joint_command`. Press **RESET E-STOP** and commands work again.

## Tests

```bash
python3 -m unittest discover -s backend/tests -v
```

The tests cover centre conversion, pixel offset, display/source scaling, and latency compensation.

## Image size / build time

Fill these two values after the final clean build on the submission machine:

- Final image size: `TBD`
- Cold build time: `TBD`

## Demo video

Record 2–3 minutes showing: build, sliders, HOME, E-STOP/backend rejection/RESET, camera click and math, backend restart/reconnect, and no-camera fallback.

## Attribution

The URDF in this repository is original assignment-specific primitive geometry and does not redistribute third-party meshes.

### Camera device access

The backend container uses Docker privileged device access so Linux `/dev/video0` can be opened when present without making Compose fail when the device is absent. On a machine without a camera, startup still succeeds and the synthetic fallback is used. This is intentionally scoped to the take-home demo container; a production deployment would use a narrowly scoped device mapping.
