import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

(function () {
  var root = document.querySelector('[data-anim-slideshow]');
  if (!root) return;

  /* ── DOM refs ── */
  var container   = root.querySelector('[data-anim-object]');
  var layer3d     = root.querySelector('[data-anim-3d]');
  var shadow      = root.querySelector('[data-anim-shadow]');
  var hint        = root.querySelector('[data-anim-hint]');
  var speedEl     = root.querySelector('[data-speed-lines]');
  var motionBlur  = root.querySelector('[data-motion-blur]');
  var particlesEl = root.querySelector('[data-particles]');
  var tireMarks   = root.querySelector('[data-tire-marks]');
  var slides      = root.querySelectorAll('.anim-slideshow__slide');
  var dots        = root.querySelectorAll('.anim-slideshow__dot');
  var canvas      = root.querySelector('[data-threejs-canvas]');

  if (!canvas) return;

  /* ── Settings from data attributes ── */
  var glbUrl      = root.getAttribute('data-glb-url') || '';
  var initialSide = root.getAttribute('data-initial-side') || 'front';
  var fov         = parseFloat(root.getAttribute('data-field-of-view')) || 45;
  var exposure    = parseFloat(root.getAttribute('data-exposure')) || 1;
  var rotSpeed    = parseFloat(root.getAttribute('data-rotation-speed')) || 15;
  var swipeSpeed  = parseInt(root.getAttribute('data-swipe-speed')) || 3000;

  /* ── Angle presets ── */
  var SIDES = {
    front:     [0,   75],  back:      [180,  75],
    left:      [270, 75],  right:     [90,   75],
    front_top: [0,   40],  front_low: [0,   110],
    left_top:  [270, 40],  right_top: [90,   40]
  };
  var startAngles = SIDES[initialSide] || SIDES.front;

  /* ══════════════════════════════════════
     THREE.JS  –  Scene, Camera, Renderer
     ══════════════════════════════════════ */
  var w = container.clientWidth  || 700;
  var h = container.clientHeight || 450;

  var renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  var scene  = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(fov, w / h, 0.01, 200);

  /* Environment – gives realistic reflections on metallic/glossy models */
  var pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment()).texture;
  pmrem.dispose();

  /* Lights */
  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  var key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(5, 8, 7);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0xffffff, 0.5);
  fill.position.set(-4, 4, -4);
  scene.add(fill);
  var rim = new THREE.DirectionalLight(0xffffff, 0.3);
  rim.position.set(0, -3, -6);
  scene.add(rim);

  /* OrbitControls – users can freely spin/tilt the model */
  var controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.enableZoom    = false;
  controls.enablePan     = false;
  controls.autoRotate    = false;
  controls.autoRotateSpeed = rotSpeed / 10;
  controls.minPolarAngle = THREE.MathUtils.degToRad(10);
  controls.maxPolarAngle = THREE.MathUtils.degToRad(170);

  /* Position camera from initial side */
  function positionCamera(theta, phi, radius) {
    var t = THREE.MathUtils.degToRad(theta);
    var p = THREE.MathUtils.degToRad(phi);
    camera.position.set(
      radius * Math.sin(p) * Math.sin(t),
      radius * Math.cos(p),
      radius * Math.sin(p) * Math.cos(t)
    );
    camera.lookAt(0, 0, 0);
    controls.update();
  }

  /* ── Load GLB ── */
  var model3d = null;
  var camDist = 4;

  if (glbUrl) {
    new GLTFLoader().load(glbUrl, function (gltf) {
      model3d = gltf.scene;

      /* Center at origin */
      var box    = new THREE.Box3().setFromObject(model3d);
      var center = box.getCenter(new THREE.Vector3());
      var size   = box.getSize(new THREE.Vector3());
      model3d.position.sub(center);

      /* Fit model so it fills the viewport nicely */
      var maxDim  = Math.max(size.x, size.y, size.z);
      var fovRad  = THREE.MathUtils.degToRad(fov);
      camDist     = (maxDim / 2) / Math.tan(fovRad / 2) * 1.5;

      controls.minDistance = camDist * 0.5;
      controls.maxDistance = camDist * 3;

      /* Enable shadows */
      model3d.traverse(function (c) {
        if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }
      });

      scene.add(model3d);
      positionCamera(startAngles[0], startAngles[1], camDist);
    });
  }

  /* ── Render loop ── */
  var isVisible = true;

  function render() {
    requestAnimationFrame(render);
    if (!isVisible) return;
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(render);

  /* Pause when off-screen */
  new IntersectionObserver(function (e) { isVisible = e[0].isIntersecting; }).observe(root);

  /* Resize */
  new ResizeObserver(function () {
    var nw = container.clientWidth, nh = container.clientHeight;
    if (nw && nh) {
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
      renderer.setSize(nw, nh);
    }
  }).observe(container);

  /* ══════════════════════════════════════
     SLIDESHOW  –  drag / fling / slides
     ══════════════════════════════════════ */
  var currentSlide = 0, isAnimating = false, objectGone = false;
  var dragging = false, posOffsetX = 0, posOffsetY = 0;
  var velX = 0, velY = 0, lastMoveTime = 0;
  var dragCurrentX = 0, dragCurrentY = 0;
  var FLING_THRESHOLD = 6;

  /* Speed lines */
  (function () {
    for (var i = 0; i < 16; i++) {
      var l = document.createElement('div');
      l.className = 'anim-slideshow__speed-line';
      l.style.top = (10 + Math.random() * 80) + '%';
      l.style.left = (Math.random() * 100) + '%';
      l.style.width = (60 + Math.random() * 250) + 'px';
      l.style.opacity = String(0.15 + Math.random() * 0.5);
      speedEl.appendChild(l);
    }
  })();

  /* Dust particles */
  function dust(dir) {
    for (var i = 0; i < 15; i++) {
      var p = document.createElement('div');
      p.className = 'anim-slideshow__particle';
      var sz = 6 + Math.random() * 16;
      p.style.width = sz + 'px'; p.style.height = sz + 'px';
      p.style.left = (50 + (Math.random() - 0.5) * 20) + '%';
      p.style.top  = (60 + Math.random() * 10) + '%';
      particlesEl.appendChild(p);
      (function (el) {
        var vx = -dir * (2 + Math.random() * 6), vy = -(1 + Math.random() * 4);
        var life = 500 + Math.random() * 700, t0 = performance.now();
        var ox = parseFloat(el.style.left), oy = parseFloat(el.style.top);
        (function frame(now) {
          var t = (now - t0) / life;
          if (t >= 1) { el.remove(); return; }
          el.style.left = (ox + vx * t * 8) + '%';
          el.style.top  = (oy + vy * t * 8 + 3 * t * t * 8) + '%';
          el.style.opacity = String((1 - t) * 0.6);
          el.style.transform = 'scale(' + (1 + t) + ')';
          requestAnimationFrame(frame);
        })(performance.now());
      })(p);
    }
  }

  /* ── Fly-out — X axis only ── */
  function flyOut(dir) {
    isAnimating = true; objectGone = true;
    controls.autoRotate = false;

    hint.classList.add('is-hidden');
    speedEl.classList.add('is-visible');
    motionBlur.classList.add('is-visible');
    tireMarks.classList.add('is-visible');
    dust(dir); setTimeout(function () { dust(dir); }, 120);

    var t0 = null, dur = swipeSpeed;
    var endX = dir * window.innerWidth * 1.3;
    var sx = posOffsetX;

    (function frame(ts) {
      if (!t0) t0 = ts;
      var p = Math.min((ts - t0) / dur, 1);
      var e = p * (2 - p);
      var x = sx + endX * e;
      var op = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;

      container.style.transform = 'translate(calc(-50% + ' + x + 'px), -50%)';
      container.style.opacity = String(op);
      shadow.style.transform = 'translateX(calc(-50% + ' + (x * 0.5) + 'px)) scaleX(' + (1 + p * 2) + ')';
      shadow.style.opacity = String(1 - p);

      if (p < 1) requestAnimationFrame(frame);
      else {
        speedEl.classList.remove('is-visible');
        motionBlur.classList.remove('is-visible');
        layer3d.classList.add('is-gone');
        isAnimating = false;
        setTimeout(function () { tireMarks.classList.remove('is-visible'); }, 1200);
      }
    })(performance.now());

    setTimeout(function () {
      var s = slides[currentSlide];
      if (s) { var c = s.querySelector('[data-slide-content]'); if (c) c.classList.add('is-revealed'); }
    }, dur * 0.35);
  }

  /* ── Drag handlers ──
     Horizontal drag (X) = move the car left/right
     Vertical drag up (Y) = camera transitions to top view
     Vertical drag down = camera goes back to side view
     Fast swipe = fling in that direction */

  /* ── Single layer: canvas handles EVERYTHING ──
     OrbitControls rotates the model (drag left/right/up/down).
     We listen on top and just track velocity for fling detection.
     Drag up naturally shows top view via OrbitControls polar angle.
     Fast swipe = fling the model off screen. */

  /* ── Drag / swipe logic ──
     Slow drag = OrbitControls rotates the 3D model
     Once user moves fast (swipe) = stop rotation, model follows finger
     Release after swipe = fling in that direction
     Release after slow drag = stay rotated */

  /* ── Interaction ──
     OrbitControls = 360 rotation (always active)
     Fast horizontal swipe = move on X axis + fling */

  var overlay = root.querySelector('[data-drag-overlay]');
  if (overlay) overlay.style.pointerEvents = 'none';

  controls.enabled = true;
  var SWIPE_DETECT = 8;
  var moveMode = false;

  function onDown(e) {
    if (isAnimating || objectGone) return;
    dragging = true;
    moveMode = false;
    dragCurrentX = e.touches ? e.touches[0].clientX : e.clientX;
    lastMoveTime = performance.now();
    velX = 0;
    container.style.transition = 'none';
    hint.classList.add('is-hidden');
  }

  function onMove(e) {
    if (!dragging) return;
    var now = performance.now();
    var cx = e.touches ? e.touches[0].clientX : e.clientX;
    var dx = cx - dragCurrentX;
    var dt = Math.max(now - lastMoveTime, 1);
    velX = dx / dt * 16;
    dragCurrentX = cx;
    lastMoveTime = now;

    /* Fast horizontal swipe → switch to move mode, stop rotation */
    if (!moveMode && Math.abs(velX) > SWIPE_DETECT) {
      moveMode = true;
      controls.enabled = false;
    }

    if (moveMode) {
      posOffsetX += dx;
      container.style.transform = 'translate(calc(-50% + ' + posOffsetX + 'px), -50%)';
      Math.abs(velX) > 4 ? speedEl.classList.add('is-visible') : speedEl.classList.remove('is-visible');
    }
  }

  function onUp() {
    if (!dragging) return;
    dragging = false;
    speedEl.classList.remove('is-visible');
    controls.enabled = true;

    if (moveMode) {
      if (Math.abs(velX) > FLING_THRESHOLD) {
        flyOut(velX > 0 ? 1 : -1);
      } else {
        hint.classList.remove('is-hidden');
        var sx = posOffsetX, t0 = null;
        (function frame(ts) {
          if (!t0) t0 = ts;
          var t = Math.min((ts - t0) / 400, 1);
          var ease = 1 - Math.pow(1 - t, 3);
          posOffsetX = sx * (1 - ease);
          container.style.transform = 'translate(calc(-50% + ' + posOffsetX + 'px), -50%)';
          if (t < 1) requestAnimationFrame(frame);
          else posOffsetX = 0;
        })(performance.now());
      }
    } else {
      hint.classList.remove('is-hidden');
    }
    moveMode = false;
  }

  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('touchstart', onDown, { passive: true });
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
  document.addEventListener('touchmove', onMove, { passive: true });
  document.addEventListener('touchend', onUp);

  /* ── Reset / slide navigation ── */
  function resetObject() {
    objectGone = false; isAnimating = false; posOffsetX = 0; posOffsetY = 0;
    layer3d.classList.remove('is-gone');
    shadow.style.transform = 'translateX(-50%)'; shadow.style.opacity = '1';
    hint.classList.remove('is-hidden');
    speedEl.classList.remove('is-visible');
    motionBlur.classList.remove('is-visible');
    tireMarks.classList.remove('is-visible');

    controls.autoRotate = false;
    positionCamera(startAngles[0], startAngles[1], camDist);
    /* Slide in from left */
    var from = -window.innerWidth;
    container.style.transition = 'none';
    container.style.transform = 'translate(calc(-50% + ' + from + 'px), -50%)';
    container.style.opacity = '0';

    var t0 = null;
    (function frame(ts) {
      if (!t0) t0 = ts;
      var t = Math.min((ts - t0) / 800, 1);
      var e = 1 - Math.pow(1 - t, 3);
      container.style.transform = 'translate(calc(-50% + ' + (from * (1 - e)) + 'px), -50%)';
      container.style.opacity = String(Math.min(t * 2.5, 1));
      if (t < 1) requestAnimationFrame(frame);
    })(performance.now());
  }

  function goToSlide(idx) {
    if (idx === currentSlide || isAnimating) return;
    var old = slides[currentSlide].querySelector('[data-slide-content]');
    if (old) old.classList.remove('is-revealed');
    slides[currentSlide].classList.remove('is-active');
    if (dots[currentSlide]) dots[currentSlide].classList.remove('is-active');
    currentSlide = idx;
    slides[currentSlide].classList.add('is-active');
    if (dots[currentSlide]) dots[currentSlide].classList.add('is-active');
    resetObject();
  }

  dots.forEach(function (d) {
    d.addEventListener('click', function () { goToSlide(parseInt(this.getAttribute('data-dot-index'))); });
  });

  if (slides.length > 1) {
    setInterval(function () {
      if (objectGone && !isAnimating) goToSlide((currentSlide + 1) % slides.length);
    }, 4000);
  }

  /* Shopify editor */
  if (typeof Shopify !== 'undefined' && Shopify.designMode) {
    document.addEventListener('shopify:section:load', function (e) {
      if (e.target.querySelector('[data-anim-slideshow]')) setTimeout(resetObject, 300);
    });
  }
})();
