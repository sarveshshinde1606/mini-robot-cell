<template>
  <div class="vue-panel">
    <div class="card-title"><h2>Vue · Camera & Pick</h2><span>{{ sourceLabel }}</span></div>
 <div class="camera-wrap">
  <img
    ref="image"
    :src="cameraUrl"
    alt="Live camera"
    @load="onImageLoad"
    @click="pick"
  />
  <div class="crosshair" />
</div>
    <div class="readout">
      <div><span>Pixel</span><b>({{ pixel.u }}, {{ pixel.v }})</b></div>
      <div><span>Offset</span><b>Δx {{ offsets.x.toFixed(2) }} mm · Δy {{ offsets.y.toFixed(2) }} mm</b></div>
      <div><span>Latency compensation</span><b>+{{ compensation.toFixed(2) }} mm X</b></div>
    </div>
    <div class="config-grid">
      <label>mm / pixel<input v-model.number="mmPerPixel" type="number" min="0.01" step="0.01" /></label>
      <label>Belt speed (m/s)<input v-model.number="beltSpeed" type="number" min="0" step="0.01" /></label>
      <label>Latency (ms)<input v-model.number="latencyMs" type="number" min="0" step="10" /></label>
    </div>
    <div class="target" :class="sent ? 'sent' : ''">{{ sent ? 'Pick target sent to /pick_target' : 'Click the image to send a pick target' }}</div>
  </div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps({ wsUrl: { type: String, required: true } });

const cameraUrl = '/camera.mjpg';

const image = ref(null);
const source = ref({ width: 1280, height: 720 });
const pixel = ref({ u: 640, v: 360 });
const mmPerPixel = ref(0.4);
const beltSpeed = ref(0.25);
const latencyMs = ref(200);
const sent = ref(false);
let ws;
let mounted = true;

const offsets = computed(() => ({
  x: (pixel.value.u - source.value.width / 2) * mmPerPixel.value,
  y: (pixel.value.v - source.value.height / 2) * mmPerPixel.value
}));
const compensation = computed(() => {
  const speed = Number(beltSpeed.value) || 0;
  const latency = Number(latencyMs.value) || 0;
  return speed * latency;
});
const sourceLabel = computed(() => `${source.value.width}×${source.value.height} source`);

function onImageLoad() {
  if (image.value?.naturalWidth) source.value = { width: image.value.naturalWidth, height: image.value.naturalHeight };
}

function connect() {
  ws = new WebSocket(props.wsUrl);
  ws.onclose = () => {
  if (!mounted) return;
  setTimeout(() => { if (mounted && (!ws || ws.readyState === WebSocket.CLOSED)) connect(); }, 1000);
};
}
function pick(event) {
  const rect = image.value.getBoundingClientRect();
  const sx = image.value.naturalWidth / rect.width;
  const sy = image.value.naturalHeight / rect.height;
  const u = Math.max(0, Math.min(image.value.naturalWidth - 1, Math.round((event.clientX - rect.left) * sx)));
  const v = Math.max(0, Math.min(image.value.naturalHeight - 1, Math.round((event.clientY - rect.top) * sy)));
  pixel.value = { u, v };
  sent.value = false;
  const msg = {
    op: 'publish', topic: '/pick_target', type: 'geometry_msgs/PointStamped',
    msg: { header: { frame_id: 'camera' }, point: { x: offsets.value.x, y: offsets.value.y, z: compensation.value } }
  };
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
    sent.value = true;
  }
}

onMounted(connect);
onBeforeUnmount(() => { mounted = false; ws?.close(); });
</script>
