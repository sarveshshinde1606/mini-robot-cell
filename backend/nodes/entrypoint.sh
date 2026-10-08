#!/usr/bin/env bash
set -eo pipefail

source /opt/ros/jazzy/setup.bash
children=()
cleanup() {
  trap - TERM INT EXIT
  for pid in "${children[@]:-}"; do kill "$pid" 2>/dev/null || true; done
  wait || true
}
trap cleanup TERM INT EXIT

ros2 launch rosbridge_server rosbridge_websocket_launch.xml port:=9090 &
children+=("$!")
ros2 run robot_state_publisher robot_state_publisher /workspace/urdf/mini_6dof.urdf &
children+=("$!")
python3 /workspace/nodes/cell_node.py &
children+=("$!")

wait -n
exit $?
