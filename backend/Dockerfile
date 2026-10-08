FROM ros:jazzy-ros-base

ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /workspace

RUN apt-get update && apt-get install -y --no-install-recommends \
    ros-jazzy-rosbridge-server \
    ros-jazzy-robot-state-publisher \
    python3-flask \
    python3-opencv \
    python3-yaml \
    curl \
    tini \
    && rm -rf /var/lib/apt/lists/*

COPY backend/urdf /workspace/urdf
COPY backend/nodes /workspace/nodes
COPY config /workspace/config

RUN chmod +x /workspace/nodes/entrypoint.sh /workspace/nodes/cell_node.py

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/workspace/nodes/entrypoint.sh"]
