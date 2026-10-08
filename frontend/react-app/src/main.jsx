import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as THREE from 'three';
import { createApp } from 'vue';
import VuePanel from '../../vue-panel/src/VuePanel.vue';
import './styles.css';

const HOME = [0, -0.7, 1.0, -1.2, 0.8, 0];
const ROS_TOPIC = '/joint_states';

function parseVec(text, fallback = [0, 0, 0]) {
  if (!text) return fallback;
  return text.trim().split(/\s+/).map(Number);
}

function rpyMatrix(rpy) {
  const e = new THREE.Euler(rpy[0], rpy[1], rpy[2], 'XYZ');
  return new THREE.Matrix4().makeRotationFromEuler(e);
}

function makeVisual(link, visual) {
  const origin = visual?.querySelector('origin');
  const geometryNode = visual?.querySelector('geometry');
  const geom = geometryNode?.firstElementChild;
  if (!geom) return null;
  let geometry;
  if (geom.tagName === 'box') {
    const [x, y, z] = parseVec(geom.getAttribute('size'), [0.1, 0.1, 0.1]);
    geometry = new THREE.BoxGeometry(x, y, z);
  } else if (geom.tagName === 'cylinder') {
    geometry = new THREE.CylinderGeometry(Number(geom.getAttribute('radius')), Number(geom.getAttribute('radius')), Number(geom.getAttribute('length')), 24);
  } else {
    return null;
  }
  const material = new THREE.MeshStandardMaterial({ color: link === 'base_link' ? 0x334155 : 0x64748b, metalness: 0.25, roughness: 0.55 });
  const mesh = new THREE.Mesh(geometry, material);
  const xyz = parseVec(origin?.getAttribute('xyz'));
  const rpy = parseVec(origin?.getAttribute('rpy'));
  mesh.position.set(...xyz);
  mesh.setRotationFromEuler(new THREE.Euler(...rpy, 'XYZ'));
  return mesh;
}

function RobotViewer({ robot, jointValues }) {
  const mount = useRef(null);
  const sceneRef = useRef(null);
  const jointGroupsRef = useRef({});

  useEffect(() => {
    if (!mount.current || !robot) return;
    const width = mount.current.clientWidth || 640;
    const height = mount.current.clientHeight || 480;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0b1220);
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.01, 100);
    camera.position.set(2.6, -3.0, 2.5);
    camera.lookAt(0, 0, 0.75);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    mount.current.appendChild(renderer.domElement);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 2.2));
    const light = new THREE.DirectionalLight(0xffffff, 2.0);
    light.position.set(3, -3, 5);
    scene.add(light);
    const grid = new THREE.GridHelper(3, 30, 0x334155, 0x1e293b);
    scene.add(grid);

    const root = new THREE.Group();
    // Keep URDF Z-up convention; the Three.js camera is positioned accordingly.
    scene.add(root);

    const links = robot.links;
    const jointsByParent = {};
    robot.joints.forEach(j => { (jointsByParent[j.parent] ||= []).push(j); });

    const buildLink = (linkName, parentGroup) => {
      const link = links[linkName];
      if (!link) return;
      if (link.visual) {
        const mesh = makeVisual(linkName, link.visual);
        if (mesh) parentGroup.add(mesh);
      }
      for (const joint of (jointsByParent[linkName] || [])) {
        const g = new THREE.Group();
        const xyz = joint.origin.xyz;
        const rpy = joint.origin.rpy;
        g.position.set(...xyz);
        g.setRotationFromEuler(new THREE.Euler(...rpy, 'XYZ'));
        g.userData.axis = joint.axis;
        parentGroup.add(g);
        jointGroupsRef.current[joint.name] = g;
        buildLink(joint.child, g);
      }
    };
    buildLink(robot.root, root);

    sceneRef.current = { scene, camera, renderer };
    let frame;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      renderer.render(scene, camera);
    };
    animate();

    const resize = () => {
      const w = mount.current?.clientWidth || width;
      const h = mount.current?.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', resize);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      renderer.dispose();
      mount.current?.removeChild(renderer.domElement);
      jointGroupsRef.current = {};
      sceneRef.current = null;
    };
  }, [robot]);

  useEffect(() => {
    if (!robot) return;
    robot.joints.forEach((joint, i) => {
      const group = jointGroupsRef.current[joint.name];
      if (!group) return;
      const [x, y, z] = joint.axis;
      group.rotation.set(0, 0, 0);
      if (x) group.rotateX(jointValues[i] * x);
      if (y) group.rotateY(jointValues[i] * y);
      if (z) group.rotateZ(jointValues[i] * z);
    });
  }, [robot, jointValues]);

  return <div className="viewer" ref={mount} />;
}

function App() {
  const [robot, setRobot] = useState(null);
  const [jointValues, setJointValues] = useState(HOME);
  const [estop, setEstop] = useState(false);
  const [connected, setConnected] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState(false);
  const socketRef = useRef(null);
  const reconnectRef = useRef(null);

  const connect = () => {
    const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rosbridge`;
    const ws = new WebSocket(url);
    socketRef.current = ws;
    ws.onopen = () => {
      setConnected(true);
      ws.send(JSON.stringify({ op: 'subscribe', topic: ROS_TOPIC, type: 'sensor_msgs/JointState' }));
      ws.send(JSON.stringify({ op: 'subscribe', topic: '/estop', type: 'std_msgs/Bool' }));
    };
    ws.onmessage = event => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.topic === ROS_TOPIC && msg.msg?.position?.length >= 6) {
          const byName = {};
          (msg.msg.name || []).forEach((name, i) => { byName[name] = msg.msg.position[i]; });
          setJointValues(prev => robot ? robot.joints.map((j, i) => Number(byName[j.name] ?? prev[i])) : msg.msg.position.slice(0, 6));
        }
        if (msg.topic === '/estop') setEstop(Boolean(msg.msg?.data));
      } catch (_) {}
    };
    ws.onclose = () => {
      setConnected(false);
      reconnectRef.current = setTimeout(connect, 1000);
    };
    ws.onerror = () => ws.close();
  };

  useEffect(() => {
    fetch('/health').then(r => r.json()).then(data => setCameraAvailable(Boolean(data.camera))).catch(() => setCameraAvailable(false));
    fetch('/urdf/mini_6dof.urdf')
      .then(r => r.text())
      .then(text => {
        const xml = new DOMParser().parseFromString(text, 'application/xml');
        const links = {};
        xml.querySelectorAll('link').forEach(node => {
          links[node.getAttribute('name')] = { visual: node.querySelector(':scope > visual') };
        });
        const joints = [...xml.querySelectorAll('joint')].map(node => ({
          name: node.getAttribute('name'),
          parent: node.querySelector('parent').getAttribute('link'),
          child: node.querySelector('child').getAttribute('link'),
          axis: parseVec(node.querySelector('axis')?.getAttribute('xyz'), [0, 0, 1]),
          origin: { xyz: parseVec(node.querySelector('origin')?.getAttribute('xyz')), rpy: parseVec(node.querySelector('origin')?.getAttribute('rpy')) },
          limit: {
            lower: Number(node.querySelector('limit')?.getAttribute('lower') ?? -Math.PI),
            upper: Number(node.querySelector('limit')?.getAttribute('upper') ?? Math.PI)
          }
        }));
        const childNames = new Set(joints.map(j => j.child));
        const root = Object.keys(links).find(name => !childNames.has(name));
        setRobot({ links, joints, root });
      });
    connect();
    return () => {
      clearTimeout(reconnectRef.current);
      socketRef.current?.close();
    };
  }, []);

  const send = payload => socketRef.current?.readyState === WebSocket.OPEN && socketRef.current.send(JSON.stringify(payload));
  const command = values => send({ op: 'publish', topic: '/joint_command', type: 'sensor_msgs/JointState', msg: { name: robot?.joints.map(j => j.name) || [], position: values } });
  const setJoint = (i, value) => {
    const next = [...jointValues];
    next[i] = Number(value);
    command(next);
  };
  const home = () => command(HOME);
  const setEStop = value => send({ op: 'publish', topic: '/estop', type: 'std_msgs/Bool', msg: { data: value } });

  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/rosbridge`;

  useEffect(() => {
    const el = document.getElementById('vue-panel');
    if (!el) return;
    const app = createApp(VuePanel, { wsUrl: url });
    app.mount(el);
    return () => app.unmount();
  }, [url]);

  return (
    <main className="shell">
      <header>
        <div>
          <h1>Mini Robot Cell Operator Console</h1>
          <p className="muted">6-DOF operator station · React + Vue + ROS 2</p>
        </div>
        <div className={`connection ${connected ? 'online' : 'offline'}`}>
          <span className="dot" /> {connected ? 'WebSocket connected' : 'WebSocket disconnected'}
          <small>{url}</small>
        </div>
      </header>
      {estop && <div className="estop-banner">E-STOP LATCHED — backend is rejecting joint commands.</div>}
      <section className="grid">
        <article className="card robot-card">
          <div className="card-title"><h2>React · Robot</h2><span>URDF: mini_6dof · Camera: {cameraAvailable ? 'webcam' : 'synthetic fallback'}</span></div>
          <RobotViewer robot={robot} jointValues={jointValues} />
          <div className="controls">
            {robot?.joints.map((joint, i) => (
              <label className="joint" key={joint.name}>
                <span><b>{joint.name}</b><span>{jointValues[i].toFixed(3)} rad · {(jointValues[i] * 180 / Math.PI).toFixed(1)}°</span></span>
                <input disabled={estop || !connected} type="range" min={joint.limit.lower} max={joint.limit.upper} step="0.001" value={jointValues[i]} onChange={e => setJoint(i, e.target.value)} />
                <small>{joint.limit.lower.toFixed(2)} to {joint.limit.upper.toFixed(2)} rad</small>
              </label>
            ))}
          </div>
          <div className="button-row">
            <button onClick={home} disabled={estop || !connected}>HOME</button>
            {!estop ? <button className="danger" onClick={() => setEStop(true)}>E-STOP</button> : <button className="reset" onClick={() => setEStop(false)}>RESET E-STOP</button>}
          </div>
        </article>
        <article className="card"><div id="vue-panel" /></article>
      </section>
      <footer>All runtime assets are bundled into the Docker image. Camera panel uses synthetic fallback when no webcam is available.</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
