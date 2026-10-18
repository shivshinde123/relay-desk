/* Hero: a floating "AI core" (wireframe icosahedron + glowing nucleus + orbit ring) over a drifting particle mesh. */
(function () {
  const canvas = document.getElementById('hero-canvas');
  if (!canvas || typeof THREE === 'undefined') return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = 9;

  const MINT = 0x4df0c8, VIOLET = 0x8f7dff;
  const core = new THREE.Group();
  const shell = new THREE.Mesh(new THREE.IcosahedronGeometry(2, 1), new THREE.MeshBasicMaterial({ color: MINT, wireframe: true, transparent: true, opacity: 0.55 }));
  const nucleus = new THREE.Mesh(new THREE.IcosahedronGeometry(1.05, 2), new THREE.MeshBasicMaterial({ color: VIOLET, transparent: true, opacity: 0.9 }));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.9, 0.025, 8, 120), new THREE.MeshBasicMaterial({ color: MINT }));
  ring.rotation.x = Math.PI / 2.4;
  const orbiter = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), new THREE.MeshBasicMaterial({ color: 0xffb84d }));
  orbiter.position.set(2.9, 0, 0); // rides the ring, so it orbits as the ring spins
ring.add(orbiter);
core.add(shell, nucleus, ring);
  scene.add(core);

  // Particles
  const N = 700;
  const pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 30; pos[i * 3 + 1] = (Math.random() - 0.5) * 18; pos[i * 3 + 2] = (Math.random() - 0.5) * 16; }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const points = new THREE.Points(pGeo, new THREE.PointsMaterial({ color: 0x9fb0ff, size: 0.045, transparent: true, opacity: 0.8 }));
  scene.add(points);

  let mx = 0, my = 0, baseY = 0;
  window.addEventListener('pointermove', (e) => { mx = (e.clientX / innerWidth - 0.5) * 2; my = (e.clientY / innerHeight - 0.5) * 2; });

  function resize() {
    const { clientWidth: w, clientHeight: h } = canvas.parentElement;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    core.position.x = w > 900 ? 3.6 : 0;      // sit on the right when there is room
    baseY = w > 900 ? 0 : -2.4;
    core.position.y = baseY;
    core.scale.setScalar(w > 900 ? 1 : 0.7);
  }
  window.addEventListener('resize', resize); resize();

  const clock = new THREE.Clock();
  function frame() {
    const t = clock.getElapsedTime();
    shell.rotation.y = t * 0.25; shell.rotation.x = t * 0.12;
    nucleus.scale.setScalar(1 + Math.sin(t * 1.6) * 0.06);
    ring.rotation.z = t * 0.4;
    core.position.y = baseY + Math.sin(t) * 0.25;
    points.rotation.y = t * 0.02;
    camera.position.x += (mx * 0.9 - camera.position.x) * 0.04;
    camera.position.y += (-my * 0.6 - camera.position.y) * 0.04;
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    if (!reduce) requestAnimationFrame(frame);
  }
  frame();
})();
