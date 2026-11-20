import * as THREE from 'three';
import * as Radio from './radio.js';

const radioStations = Radio.radioStations;
const stationKeys = Radio.stationKeys;
const volumeSteps = Radio.volumeSteps;
const toggleRadioPower = Radio.toggleRadioPower;
const setStation = Radio.setStation;
const cycleVolume = Radio.cycleVolume;
const updateAllRadioDisplays = Radio.updateAllRadioDisplays;
const resetRadioUI = Radio.resetRadioUI;
const forceRadioOff = Radio.forceRadioOff;

let gameStarted = false;
    let isHomeMode = false;
    let isMonitorZoomed = false;
    let roomChairGroup = null;
    let pcPoweredOn = false;

    let screenMatAlgo = null;
    let screenMatTech = null;
    let screenMatDrive = null;
    let offScreenMat = null;

    let roomNeonOn = false;
    const roomLedStrips = [];
    const pcFanRings = [];
    let pcFrontStripMesh = null;
    let pcGpuMesh = null;
    let kbGlowMesh = null;
    let mouseGlowMesh = null;
    let matLedOff = null;
    let matPcLedRed = null;
    let matPcLedLime = null;
    let matGlowCyan = null;
    let matGlowLime = null;
    let matGlowPink = null;
    let switchBtnMesh = null;
    const switchClickables = [];

    let audioCtx = null;
    let engineOsc = null;
    let engineOsc2 = null;
    let engineGain = null;
    let engineFilter = null;
    let engineStarted = false;

    function initEngineSound() {
      if (engineStarted) return;
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        // Suono motore più morbido: triangle + sine filtrati
        engineOsc = audioCtx.createOscillator();
        engineOsc.type = 'triangle';
        engineOsc.frequency.value = 52;
        engineOsc2 = audioCtx.createOscillator();
        engineOsc2.type = 'sine';
        engineOsc2.frequency.value = 26;
        engineFilter = audioCtx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 320;
        engineFilter.Q.value = 0.7;
        engineGain = audioCtx.createGain();
        engineGain.gain.value = 0;
        engineOsc.connect(engineFilter);
        engineOsc2.connect(engineFilter);
        engineFilter.connect(engineGain);
        engineGain.connect(audioCtx.destination);
        engineOsc.start();
        engineOsc2.start();
        engineStarted = true;
      } catch (e) {
        console.warn('Engine audio unavailable', e);
      }
    }

    /** Browser bloccano AudioContext finché non c'è interazione utente */
    function resumeAudioContext() {
      if (!audioCtx) {
        initEngineSound();
      }
      if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume().catch(() => {});
      }
    }

    function updateEngineSound(kmh, muted) {
      if (!engineStarted || !engineGain || !audioCtx) return;
      if (muted || kmh < 1) {
        engineGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.12);
        return;
      }
      const t = Math.min(kmh / 320, 1);
      // Volume a circa il 20% del precedente; tono più basso e rotondo
      const freq = 42 + t * 95;
      const vol = 0.012 + t * 0.022;
      engineOsc.frequency.setTargetAtTime(freq, audioCtx.currentTime, 0.05);
      if (engineOsc2) engineOsc2.frequency.setTargetAtTime(freq * 0.5, audioCtx.currentTime, 0.05);
      engineFilter.frequency.setTargetAtTime(220 + t * 480, audioCtx.currentTime, 0.08);
      engineGain.gain.setTargetAtTime(vol, audioCtx.currentTime, 0.06);
    }

    // Feedback collisione: click breve via WebAudio
    function playCollisionTick() {
      if (!audioCtx || audioCtx.state !== 'running') return;
      try {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = 90;
        g.gain.value = 0.04;
        osc.connect(g);
        g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime;
        g.gain.setTargetAtTime(0, t0, 0.04);
        osc.start(t0);
        osc.stop(t0 + 0.12);
      } catch (_) { /* ignore */ }
    }

    // Rumore frenata continuo (stridio leggero proporzionale alla velocità)
    let brakeNoiseNode = null;
    let brakeNoiseGain = null;
    let brakeNoiseFilter = null;
    let brakeSoundReady = false;

    function initBrakeSound() {
      if (brakeSoundReady || !audioCtx) return;
      try {
        const bufferSize = 2 * audioCtx.sampleRate;
        const noiseBuffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
        const data = noiseBuffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
          data[i] = Math.random() * 2 - 1;
        }
        brakeNoiseNode = audioCtx.createBufferSource();
        brakeNoiseNode.buffer = noiseBuffer;
        brakeNoiseNode.loop = true;
        brakeNoiseFilter = audioCtx.createBiquadFilter();
        brakeNoiseFilter.type = 'bandpass';
        brakeNoiseFilter.frequency.value = 900;
        brakeNoiseFilter.Q.value = 1.2;
        brakeNoiseGain = audioCtx.createGain();
        brakeNoiseGain.gain.value = 0;
        brakeNoiseNode.connect(brakeNoiseFilter);
        brakeNoiseFilter.connect(brakeNoiseGain);
        brakeNoiseGain.connect(audioCtx.destination);
        brakeNoiseNode.start();
        brakeSoundReady = true;
      } catch (e) {
        console.warn('Brake audio unavailable', e);
      }
    }

    function updateBrakeSound(braking, kmh, handbrake) {
      if (!audioCtx) return;
      if (!brakeSoundReady) initBrakeSound();
      if (!brakeNoiseGain || !brakeNoiseFilter) return;
      const t0 = audioCtx.currentTime;
      if (!braking || kmh < 3) {
        brakeNoiseGain.gain.setTargetAtTime(0, t0, 0.08);
        return;
      }
      const speedT = Math.min(1, kmh / 280);
      const base = handbrake ? 0.028 : 0.016;
      const vol = base + speedT * (handbrake ? 0.045 : 0.032);
      const freq = handbrake ? (700 + speedT * 900) : (550 + speedT * 600);
      brakeNoiseFilter.frequency.setTargetAtTime(freq, t0, 0.05);
      brakeNoiseGain.gain.setTargetAtTime(vol, t0, 0.06);
    }

    // Record personale
    const BEST_KM_KEY = 'midnightVibe_bestKm';
    const CAREER_KM_KEY = 'midnightVibe_careerKm';
    function loadBestKm() {
      const v = parseFloat(localStorage.getItem(BEST_KM_KEY) || '0');
      return Number.isFinite(v) ? v : 0;
    }
    function saveBestKm(km) {
      const prev = loadBestKm();
      if (km > prev) {
        localStorage.setItem(BEST_KM_KEY, String(km));
        return true;
      }
      return false;
    }
    function loadCareerKm() {
      const v = parseFloat(localStorage.getItem(CAREER_KM_KEY) || '0');
      return Number.isFinite(v) ? v : 0;
    }
    function addCareerKm(delta) {
      if (delta <= 0) return loadCareerKm();
      const next = loadCareerKm() + delta;
      localStorage.setItem(CAREER_KM_KEY, String(next));
      return next;
    }
    let bestKm = loadBestKm();
    let careerKm = loadCareerKm();
    let lastCareerFlushKm = 0;

    // Camera shake da collisione
    let shakeTime = 0;
    let shakeAmp = 0;

    let nextCheckpointKm = 100;
    const checkpointToast = document.getElementById('checkpoint-toast');
    const checkpointKmEl = document.getElementById('checkpoint-km');
    let checkpointHideTimer = null;

    function showCheckpoint(km) {
      if (!checkpointToast) return;
      checkpointKmEl.textContent = `${km} KM`;
      checkpointToast.classList.add('visible');
      if (checkpointHideTimer) clearTimeout(checkpointHideTimer);
      checkpointHideTimer = setTimeout(() => {
        checkpointToast.classList.remove('visible');
      }, 2800);
    }

    const startScreen = document.getElementById('start-screen');
    const btnStartGame = document.getElementById('btn-start-game');
    const hudEl = document.getElementById('hud');
    const homeHudEl = document.getElementById('home-hud');
    const btnHome = document.getElementById('btn-home');
    const miniRadioEl = document.getElementById('mini-radio');

    const bgColor = 0x070b1a;
    const limeColor = 0xa8ff00;
    const cyanColor = 0x00f0ff;
    const stopRedColor = 0xff2a6d;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(bgColor);
    // Densità moderata: lontano sfuma, skyline vicino resta leggibile
    scene.fog = new THREE.FogExp2(0x0a1028, 0.0045);

    const camera = new THREE.PerspectiveCamera(
      65,
      window.innerWidth / window.innerHeight,
      0.1,
      240
    );
    camera.position.set(0, 3.2, 7.5);
    camera.lookAt(0, 1.2, -10);

    const renderer = new THREE.WebGLRenderer({
      antialias: false,
      powerPreference: 'high-performance',
      alpha: false
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    // DPR più basso = meno pixel, frame più stabili in guida e Safehouse
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.35));
    document.body.appendChild(renderer.domElement);

    const highwayGroup = new THREE.Group();
    scene.add(highwayGroup);

    const roomGroup = new THREE.Group();
    roomGroup.visible = false;
    scene.add(roomGroup);

    const ambientLight = new THREE.AmbientLight(0x1a1435, 1.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x6a8cff, 1.1);
    dirLight.position.set(8, 30, 12);
    highwayGroup.add(dirLight);

    const cityGlow = new THREE.HemisphereLight(0x2a1a55, 0x0a0818, 0.9);
    highwayGroup.add(cityGlow);

    const roadWidth = 14;

    const groundGeo = new THREE.PlaneGeometry(500, 300);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0c0f1c,
      roughness: 0.55,
      metalness: 0.35
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(0, -0.05, -120);
    highwayGroup.add(ground);

    const roadGeo = new THREE.PlaneGeometry(roadWidth, 260);
    const roadMat = new THREE.MeshStandardMaterial({
      color: 0x0a0c16,
      roughness: 0.12,
      metalness: 0.85
    });
    const road = new THREE.Mesh(roadGeo, roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.z = -110;
    highwayGroup.add(road);

    const restAreaGeo = new THREE.PlaneGeometry(4, 260);
    const restAreaMat = new THREE.MeshStandardMaterial({
      color: 0x0d101c,
      roughness: 0.22,
      metalness: 0.7
    });
    const restArea = new THREE.Mesh(restAreaGeo, restAreaMat);
    restArea.rotation.x = -Math.PI / 2;
    restArea.position.set(roadWidth / 2 + 2, -0.01, -110);
    highwayGroup.add(restArea);

    const parkBayGroup = new THREE.Group();
    parkBayGroup.visible = false;
    const cyanLineMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const parkBayX = roadWidth / 2 + 2;
    const parkBayZ = 0;
    const parkLen = 7;
    const parkW = 3.4;
    const lineH = 0.05;
    const lineT = 0.14;
    
    const parkL1 = new THREE.Mesh(new THREE.BoxGeometry(lineT, lineH, parkLen), cyanLineMat);
    parkL1.position.set(parkBayX - parkW / 2, 0.05, parkBayZ);
    parkBayGroup.add(parkL1);
    const parkL2 = new THREE.Mesh(new THREE.BoxGeometry(lineT, lineH, parkLen), cyanLineMat);
    parkL2.position.set(parkBayX + parkW / 2, 0.05, parkBayZ);
    parkBayGroup.add(parkL2);
    const parkL3 = new THREE.Mesh(new THREE.BoxGeometry(parkW, lineH, lineT), cyanLineMat);
    parkL3.position.set(parkBayX, 0.05, parkBayZ - parkLen / 2);
    parkBayGroup.add(parkL3);
    const parkL4 = new THREE.Mesh(new THREE.BoxGeometry(parkW, lineH, lineT), cyanLineMat);
    parkL4.position.set(parkBayX, 0.05, parkBayZ + parkLen / 2);
    parkBayGroup.add(parkL4);

    const pCanvas = document.createElement('canvas');
    pCanvas.width = 128;
    pCanvas.height = 128;
    const pCtx = pCanvas.getContext('2d');
    pCtx.clearRect(0, 0, 128, 128);
    pCtx.fillStyle = '#00f0ff';
    pCtx.font = 'bold 96px "Courier New", monospace';
    pCtx.textAlign = 'center';
    pCtx.textBaseline = 'middle';
    pCtx.fillText('P', 64, 70);
    const pTex = new THREE.CanvasTexture(pCanvas);
    const pMark = new THREE.Mesh(
      new THREE.PlaneGeometry(1.5, 1.5),
      new THREE.MeshBasicMaterial({ map: pTex, transparent: true, side: THREE.DoubleSide })
    );
    pMark.rotation.x = -Math.PI / 2;
    pMark.position.set(parkBayX, 0.06, parkBayZ);
    parkBayGroup.add(pMark);

    [[-1, -1], [-1, 1], [1, -1], [1, 1]].forEach(([sx, sz]) => {
      const corner = new THREE.Mesh(
        new THREE.BoxGeometry(0.5, 0.05, 0.5),
        cyanLineMat
      );
      corner.position.set(parkBayX + sx * (parkW / 2 - 0.2), 0.05, parkBayZ + sz * (parkLen / 2 - 0.2));
      parkBayGroup.add(corner);
    });
    highwayGroup.add(parkBayGroup);

    const borderGeo = new THREE.BoxGeometry(0.22, 0.07, 260);
    const borderMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff });

    const leftBorder = new THREE.Mesh(borderGeo, borderMat);
    leftBorder.position.set(-roadWidth / 2, 0.04, -110);
    highwayGroup.add(leftBorder);

    const rightBorder = new THREE.Mesh(borderGeo, borderMat);
    rightBorder.position.set(roadWidth / 2, 0.04, -110);
    highwayGroup.add(rightBorder);

    const outerBorder = new THREE.Mesh(borderGeo, borderMat);
    outerBorder.position.set(roadWidth / 2 + 4, 0.04, -110);
    highwayGroup.add(outerBorder);

    const posts = [];
    const postGeo = new THREE.BoxGeometry(0.12, 0.6, 0.12);
    const postMat = new THREE.MeshStandardMaterial({ color: 0x241740, roughness: 0.3 });
    const tipGeo = new THREE.BoxGeometry(0.14, 0.12, 0.14);
    const tipMat = new THREE.MeshBasicMaterial({ color: limeColor });

    const postCount = 30;
    const postSpacing = 8;
    const leftPostX = -roadWidth / 2 - 0.5;
    const rightPostX = roadWidth / 2 + 4.5;

    for (let i = 0; i < postCount; i++) {
      const zPos = -i * postSpacing + 15;
      const lGroup = new THREE.Group();
      lGroup.add(new THREE.Mesh(postGeo, postMat));
      const lTip = new THREE.Mesh(tipGeo, tipMat);
      lTip.position.y = 0.28;
      lGroup.add(lTip);
      lGroup.position.set(leftPostX, 0.3, zPos);
      highwayGroup.add(lGroup);
      posts.push(lGroup);

      const rGroup = new THREE.Group();
      rGroup.add(new THREE.Mesh(postGeo, postMat));
      const rTip = new THREE.Mesh(tipGeo, tipMat);
      rTip.position.y = 0.28;
      rGroup.add(rTip);
      rGroup.position.set(rightPostX, 0.3, zPos);
      highwayGroup.add(rGroup);
      posts.push(rGroup);
    }

    const stripes = [];
    const centerLineMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const centerLine = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.06, 260), centerLineMat);
    centerLine.position.set(0, 0.04, -110);
    highwayGroup.add(centerLine);

    const stripeGeo = new THREE.BoxGeometry(0.2, 0.05, 4.2);
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const stripeCount = 20;
    const stripeSpacing = 12;

    for (let i = 0; i < stripeCount; i++) {
      const z = -i * stripeSpacing + 10;
      const stripeL = new THREE.Mesh(stripeGeo, stripeMat);
      stripeL.position.set(-3.5, 0.04, z);
      highwayGroup.add(stripeL);
      stripes.push(stripeL);
      const stripeR = new THREE.Mesh(stripeGeo, stripeMat);
      stripeR.position.set(3.5, 0.04, z);
      highwayGroup.add(stripeR);
      stripes.push(stripeR);
    }

    const lamps = [];
    const lampSpacing = 22;
    const lampCount = 10;
    const poleBaseMat = new THREE.MeshStandardMaterial({ color: 0x1d1435, roughness: 0.3 });
    const cyanBulbMat = new THREE.MeshBasicMaterial({ color: cyanColor });
    // Geometrie lampione condivise
    const lampVerticalGeo = new THREE.BoxGeometry(0.35, 9, 0.35);
    const lampArmGeo = new THREE.BoxGeometry(2.8, 0.25, 0.35);
    const lampBulbGeo = new THREE.BoxGeometry(0.8, 0.15, 0.4);

    for (let i = 0; i < lampCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const xPos = side === 1 ? roadWidth / 2 + 8.5 : side * (roadWidth / 2 + 5.5);
      const zPos = -i * lampSpacing;

      const group = new THREE.Group();
      const verticalMesh = new THREE.Mesh(lampVerticalGeo, poleBaseMat);
      verticalMesh.position.y = 4.5;
      group.add(verticalMesh);

      const armMesh = new THREE.Mesh(lampArmGeo, poleBaseMat);
      armMesh.position.set(-side * 1.2, 8.8, 0);
      group.add(armMesh);

      const bulbMesh = new THREE.Mesh(lampBulbGeo, cyanBulbMat);
      bulbMesh.position.set(-side * 1.2, 8.6, 0);
      group.add(bulbMesh);

      group.position.set(xPos, 0, zPos);
      highwayGroup.add(group);
      lamps.push(group);
    }

    const gantryGroup = new THREE.Group();
    const gantryMat = new THREE.MeshStandardMaterial({ color: 0x1d1435, roughness: 0.3 });
    const cableMat = new THREE.MeshBasicMaterial({ color: cyanColor });

    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), gantryMat);
    pLeft.position.set(-roadWidth / 2 - 1.5, 4.5, 0);
    gantryGroup.add(pLeft);

    const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), gantryMat);
    pRight.position.set(roadWidth / 2 + 1.5, 4.5, 0);
    gantryGroup.add(pRight);

    const bar = new THREE.Mesh(new THREE.BoxGeometry(roadWidth + 3.4, 0.4, 0.4), gantryMat);
    bar.position.set(0, 8.8, 0);
    gantryGroup.add(bar);

    const cableL = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05), cableMat);
    cableL.position.set(-3, 8.2, 0);
    gantryGroup.add(cableL);

    const cableR = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.2, 0.05), cableMat);
    cableR.position.set(3, 8.2, 0);
    gantryGroup.add(cableR);

    // Canvas + texture del cartello checkpoint: riusati, mai ricreati a runtime
    const boardCanvas = document.createElement('canvas');
    boardCanvas.width = 512;
    boardCanvas.height = 128;
    const boardCtx = boardCanvas.getContext('2d');
    const boardTexture = new THREE.CanvasTexture(boardCanvas);

    function updateBoardTexture(kmText) {
      boardCtx.fillStyle = '#0f1325';
      boardCtx.fillRect(0, 0, 512, 128);
      boardCtx.lineWidth = 6;
      boardCtx.strokeStyle = '#00f0ff';
      boardCtx.strokeRect(3, 3, 506, 122);
      boardCtx.fillStyle = '#00f0ff';
      boardCtx.font = 'bold 36px "Courier New", monospace';
      boardCtx.textAlign = 'center';
      boardCtx.textBaseline = 'middle';
      boardCtx.fillText(`CHECKPOINT // ${kmText} KM`, 256, 64);
      boardTexture.needsUpdate = true;
    }

    let nextTargetKm = 100;
    updateBoardTexture(nextTargetKm);
    const boardMat = new THREE.MeshBasicMaterial({ map: boardTexture });
    const boardMesh = new THREE.Mesh(new THREE.BoxGeometry(roadWidth - 2, 2.2, 0.15), boardMat);
    boardMesh.position.set(0, 7.3, 0);
    gantryGroup.add(boardMesh);

    gantryGroup.position.set(0, 0, -500);
    highwayGroup.add(gantryGroup);

    const skylineBuildings = [];

    function createWindowTexture() {
      const c = document.createElement('canvas');
      c.width = 128;
      c.height = 256;
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#12101f';
      ctx.fillRect(0, 0, 128, 256);
      const winColors = ['#1a3a5c', '#2a2040', '#0e2a3a', '#3a2850', '#152838', '#1e3050'];
      for (let row = 0; row < 14; row++) {
        for (let col = 0; col < 5; col++) {
          if (Math.random() > 0.28) {
            ctx.fillStyle = winColors[(row * 5 + col) % winColors.length];
            ctx.fillRect(6 + col * 24, 8 + row * 17, 16, 12);
            if (Math.random() > 0.7) {
              ctx.fillStyle = 'rgba(180, 220, 255, 0.35)';
              ctx.fillRect(6 + col * 24, 8 + row * 17, 16, 12);
            }
          }
        }
      }
      const tex = new THREE.CanvasTexture(c);
      tex.wrapS = THREE.RepeatWrapping;
      tex.wrapT = THREE.RepeatWrapping;
      return tex;
    }
    const windowTex = createWindowTexture();

    const buildingMatDark = new THREE.MeshStandardMaterial({
      color: 0x14101f,
      map: windowTex,
      emissive: 0x1a1030,
      emissiveIntensity: 0.35,
      roughness: 0.55,
      metalness: 0.25
    });
    const buildingMatMid = new THREE.MeshStandardMaterial({
      color: 0x1a1428,
      map: windowTex,
      emissive: 0x241550,
      emissiveIntensity: 0.3,
      roughness: 0.5,
      metalness: 0.3
    });

    const neonStripCyan = new THREE.MeshBasicMaterial({ color: cyanColor });
    const neonStripLime = new THREE.MeshBasicMaterial({ color: limeColor });
    const neonStripMagenta = new THREE.MeshBasicMaterial({ color: stopRedColor });

    const buildingSpecs = [
      { w: 5.0, h: 28, d: 5.0, dist: 16, strip: neonStripCyan, antenna: true },
      { w: 6.5, h: 18, d: 6.0, dist: 20, strip: null, antenna: false },
      { w: 4.2, h: 34, d: 4.2, dist: 24, strip: neonStripMagenta, antenna: true },
      { w: 5.8, h: 22, d: 5.2, dist: 17, strip: neonStripLime, antenna: false },
      { w: 7.5, h: 30, d: 6.5, dist: 26, strip: neonStripCyan, antenna: true },
      { w: 4.5, h: 16, d: 4.5, dist: 15, strip: null, antenna: false },
      { w: 5.5, h: 38, d: 5.5, dist: 28, strip: neonStripCyan, antenna: true },
      { w: 7.0, h: 24, d: 6.0, dist: 21, strip: neonStripMagenta, antenna: false }
    ];

    const skylineCount = 18;
    const skylineSpacing = 26;

    for (let i = 0; i < skylineCount; i++) {
      const side = i % 2 === 0 ? -1 : 1;
      const spec = buildingSpecs[i % buildingSpecs.length];
      const baseOffset = side === 1 ? roadWidth / 2 + 4 : roadWidth / 2;
      const xPos = side * (baseOffset + spec.dist);
      const zPos = -Math.floor(i / 2) * skylineSpacing - 10;

      const bGroup = new THREE.Group();
      const mainGeo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
      const mainMesh = new THREE.Mesh(mainGeo, i % 2 === 0 ? buildingMatDark : buildingMatMid);
      mainMesh.position.y = spec.h / 2;
      bGroup.add(mainMesh);

      const facade = new THREE.Mesh(
        new THREE.PlaneGeometry(spec.w * 0.92, spec.h * 0.9),
        new THREE.MeshBasicMaterial({ map: windowTex, transparent: true, opacity: 0.85 })
      );
      facade.position.set(-side * (spec.w / 2 + 0.02), spec.h * 0.5, 0);
      facade.rotation.y = side > 0 ? -Math.PI / 2 : Math.PI / 2;
      bGroup.add(facade);

      if (spec.strip) {
        const stripGeo = new THREE.BoxGeometry(0.12, spec.h * 0.78, 0.28);
        const stripMesh = new THREE.Mesh(stripGeo, spec.strip);
        stripMesh.position.set(-side * (spec.w / 2 + 0.08), spec.h * 0.48, 0);
        bGroup.add(stripMesh);
      }

      const baseMesh = new THREE.Mesh(
        new THREE.BoxGeometry(spec.w + 0.4, 1.2, spec.d + 0.4),
        new THREE.MeshStandardMaterial({ color: 0x0c0a14, roughness: 0.7, metalness: 0.2 })
      );
      baseMesh.position.y = 0.6;
      bGroup.add(baseMesh);

      if (spec.antenna) {
        const antGeo = new THREE.BoxGeometry(0.14, 5.0, 0.14);
        const antMesh = new THREE.Mesh(antGeo, new THREE.MeshStandardMaterial({ color: 0x1a1528, metalness: 0.8 }));
        antMesh.position.y = spec.h + 2.5;
        bGroup.add(antMesh);
        const beaconMesh = new THREE.Mesh(
          new THREE.BoxGeometry(0.28, 0.28, 0.28),
          spec.strip || neonStripCyan
        );
        beaconMesh.position.y = spec.h + 5.0;
        bGroup.add(beaconMesh);
      }

      bGroup.position.set(xPos, 0, zPos);
      highwayGroup.add(bGroup);
      skylineBuildings.push(bGroup);
    }

    const horizonSkyline = new THREE.Group();
    const horizonBlocks = [
      { x: -72, w: 16, h: 42 }, { x: -54, w: 12, h: 58 }, { x: -38, w: 14, h: 36 },
      { x: -22, w: 11, h: 50 }, { x: -8,  w: 10, h: 30 }, { x: 8,   w: 12, h: 46 },
      { x: 24,  w: 15, h: 62 }, { x: 42,  w: 13, h: 38 }, { x: 58,  w: 16, h: 52 }, { x: 74,  w: 14, h: 40 }
    ];

    for (let i = 0; i < horizonBlocks.length; i++) {
      const hb = horizonBlocks[i];
      const hGeo = new THREE.BoxGeometry(hb.w, hb.h, 10);
      const hMesh = new THREE.Mesh(hGeo, buildingMatDark);
      hMesh.position.set(hb.x, hb.h / 2 - 2, -200);
      horizonSkyline.add(hMesh);

      if (i % 2 === 1) {
        const crownMesh = new THREE.Mesh(
          new THREE.BoxGeometry(hb.w * 0.55, 0.4, 0.4),
          i % 4 === 1 ? neonStripCyan : neonStripMagenta
        );
        crownMesh.position.set(hb.x, hb.h - 3, -195);
        horizonSkyline.add(crownMesh);
      }
      if (i % 3 === 0) {
        const vStrip = new THREE.Mesh(
          new THREE.BoxGeometry(0.25, hb.h * 0.6, 0.25),
          neonStripLime
        );
        vStrip.position.set(hb.x + hb.w * 0.3, hb.h * 0.4, -194);
        horizonSkyline.add(vStrip);
      }
    }
    highwayGroup.add(horizonSkyline);

    function createStopSignTexture() {
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, 256, 256);
      const cx = 128, cy = 128, r = 110;
      ctx.beginPath();
      for (let i = 0; i < 8; i++) {
        const angle = (Math.PI / 4) * i + Math.PI / 8;
        const x = cx + r * Math.cos(angle);
        const y = cy + r * Math.sin(angle);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = '#3a1224';
      ctx.fill();
      ctx.lineWidth = 14;
      ctx.strokeStyle = '#ff2a6d';
      ctx.stroke();
      ctx.fillStyle = '#ff2a6d';
      ctx.font = 'bold 64px "Courier New", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('STOP', cx, cy + 4);
      return new THREE.CanvasTexture(canvas);
    }

    const stopSignGroup = new THREE.Group();
    const poleStop = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.8, 8), new THREE.MeshStandardMaterial({ color: 0x38255c, metalness: 0.8, roughness: 0.2 }));
    poleStop.position.set(0, 0.9, -0.06);
    stopSignGroup.add(poleStop);

    const signMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.25, 1.25), new THREE.MeshBasicMaterial({ map: createStopSignTexture(), transparent: true, side: THREE.DoubleSide }));
    signMesh.position.set(0, 1.95, 0.02);
    stopSignGroup.add(signMesh);

    const signLight = new THREE.PointLight(stopRedColor, 2.0, 5);
    signLight.position.set(-0.4, 1.95, 0.5);
    stopSignGroup.add(signLight);

    stopSignGroup.position.set(roadWidth / 2 + 4.8, 0, -3.8);
    stopSignGroup.visible = false;
    highwayGroup.add(stopSignGroup);

    const carGroup = new THREE.Group();
    const silverChassisMat = new THREE.MeshStandardMaterial({ color: 0xa3b2c6, roughness: 0.2, metalness: 0.9 });
    const trimDarkMat = new THREE.MeshStandardMaterial({ color: 0x1b112b, roughness: 0.4, metalness: 0.6 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x0c0716, roughness: 0.1, metalness: 0.95 });
    const stripeSilverMat = new THREE.MeshBasicMaterial({ color: 0xe8f0fe });
    const tailRedMat = new THREE.MeshBasicMaterial({ color: stopRedColor });
    const tailBrakeMat = new THREE.MeshBasicMaterial({ color: 0xff5a9a });
    const tailBars = [];
    const exhaustMat = new THREE.MeshStandardMaterial({ color: 0x9082b2, metalness: 0.9, roughness: 0.2 });

    const lowerBody = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.52, 4.35), silverChassisMat);
    lowerBody.position.set(0, 0.52, 0);
    carGroup.add(lowerBody);

    const frontFenders = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.34, 1.05), silverChassisMat);
    frontFenders.position.set(0, 0.46, -1.32);
    carGroup.add(frontFenders);

    const rearFenders = new THREE.Mesh(new THREE.BoxGeometry(2.08, 0.34, 1.05), silverChassisMat);
    rearFenders.position.set(0, 0.48, 1.32);
    carGroup.add(rearFenders);

    const hoodMesh = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.14, 1.65), silverChassisMat);
    hoodMesh.position.set(0, 0.81, -1.25);
    carGroup.add(hoodMesh);

    const hoodScoop = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.11, 0.85), trimDarkMat);
    hoodScoop.position.set(0, 0.91, -1.15);
    carGroup.add(hoodScoop);

    const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.42, 1.25), silverChassisMat);
    roofMesh.position.set(0, 1.04, 0.12);
    carGroup.add(roofMesh);

    const windshield = new THREE.Mesh(new THREE.BoxGeometry(1.50, 0.38, 0.65), glassMat);
    windshield.position.set(0, 0.98, -0.58);
    windshield.rotation.x = 0.52;
    carGroup.add(windshield);

    const fastbackRear = new THREE.Mesh(new THREE.BoxGeometry(1.52, 0.36, 1.15), glassMat);
    fastbackRear.position.set(0, 0.96, 1.05);
    fastbackRear.rotation.x = -0.34;
    carGroup.add(fastbackRear);

    for (let l = 0; l < 4; l++) {
      const louver = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.03, 0.12), trimDarkMat);
      louver.position.set(0, 1.11 - l * 0.06, 0.72 + l * 0.24);
      louver.rotation.x = -0.34;
      carGroup.add(louver);
    }

    const trunkDeck = new THREE.Mesh(new THREE.BoxGeometry(1.86, 0.16, 0.65), silverChassisMat);
    trunkDeck.position.set(0, 0.82, 1.82);
    carGroup.add(trunkDeck);

    const spoilerWing = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.07, 0.32), trimDarkMat);
    spoilerWing.position.set(0, 1.03, 2.02);
    spoilerWing.rotation.x = 0.12;
    carGroup.add(spoilerWing);

    const spoilerEdge = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.03, 0.04), stripeSilverMat);
    spoilerEdge.position.set(0, 1.04, 2.17);
    carGroup.add(spoilerEdge);

    const strutGeo = new THREE.BoxGeometry(0.08, 0.18, 0.16);
    const strutL = new THREE.Mesh(strutGeo, trimDarkMat);
    strutL.position.set(-0.62, 0.93, 2.0);
    carGroup.add(strutL);

    const strutR = new THREE.Mesh(strutGeo, trimDarkMat);
    strutR.position.set(0.62, 0.93, 2.0);
    carGroup.add(strutR);

    [-0.22, 0.22].forEach((offsetX) => {
      const sHood = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 1.62), stripeSilverMat);
      sHood.position.set(offsetX, 0.89, -1.26);
      carGroup.add(sHood);

      const sRoof = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 1.24), stripeSilverMat);
      sRoof.position.set(offsetX, 1.26, 0.12);
      carGroup.add(sRoof);

      const sTrunk = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.02, 0.62), stripeSilverMat);
      sTrunk.position.set(offsetX, 0.91, 1.82);
      carGroup.add(sTrunk);
    });

    const rearPanel = new THREE.Mesh(new THREE.BoxGeometry(1.88, 0.32, 0.08), trimDarkMat);
    rearPanel.position.set(0, 0.68, 2.16);
    carGroup.add(rearPanel);

    const barGeo = new THREE.BoxGeometry(0.11, 0.22, 0.05);
    [-0.76, -0.58, -0.40, 0.40, 0.58, 0.76].forEach((bx) => {
      const tailBar = new THREE.Mesh(barGeo, tailRedMat);
      tailBar.position.set(bx, 0.68, 2.19);
      carGroup.add(tailBar);
      tailBars.push(tailBar);
    });

    const rearLight = new THREE.PointLight(stopRedColor, 1.5, 4);
    rearLight.position.set(0, 0.68, 2.3);
    carGroup.add(rearLight);
    let brakingLightsOn = false;

    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.18, 0.14), trimDarkMat);
    diffuser.position.set(0, 0.34, 2.14);
    carGroup.add(diffuser);

    const pipeGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.22, 8);
    pipeGeo.rotateX(Math.PI / 2);
    [-0.68, -0.50, 0.50, 0.68].forEach((px) => {
      const pipe = new THREE.Mesh(pipeGeo, exhaustMat);
      pipe.position.set(px, 0.32, 2.20);
      carGroup.add(pipe);
    });

    const headlightBulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.78, 0.78].forEach((hx) => {
      const headlightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.08), headlightBulbMat);
      headlightMesh.position.set(hx, 0.62, -2.18);
      carGroup.add(headlightMesh);

      const headlightSpot = new THREE.SpotLight(0xffffff, 6.0, 45, Math.PI / 3, 0.3, 1);
      headlightSpot.position.set(hx, 0.62, -2.15);
      headlightSpot.target.position.set(hx, -0.2, -22);
      carGroup.add(headlightSpot);
      carGroup.add(headlightSpot.target);
    });

    const wheels = [];
    const tireGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.28, 16);
    tireGeo.rotateZ(Math.PI / 2);
    const rimGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.30, 12);
    rimGeo.rotateZ(Math.PI / 2);

    [[-0.96, 0.38, -1.32], [0.96, 0.38, -1.32], [-0.96, 0.38, 1.32], [0.96, 0.38, 1.32]].forEach(([wx, wy, wz]) => {
      const wGroup = new THREE.Group();
      wGroup.add(new THREE.Mesh(tireGeo, trimDarkMat));
      wGroup.add(new THREE.Mesh(rimGeo, stripeSilverMat));
      wGroup.position.set(wx, wy, wz);
      carGroup.add(wGroup);
      wheels.push(wGroup);
    });

    const underglow = new THREE.PointLight(limeColor, 2.4, 5);
    underglow.position.set(0, 0.28, 0);
    carGroup.add(underglow);
    highwayGroup.add(carGroup);

    const trafficCars = [];
    const trafficColors = [0xff2a6d, 0x00f0ff, 0xa3b2c6, 0x5e23b6, 0xffb86c];

    // --- Pool materiali/geometrie traffico (condivisi, zero alloc a runtime) ---
    const trafficBodyMats = trafficColors.map(
      (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.3, metalness: 0.8 })
    );
    const trafficBikeBodyMats = trafficColors.map(
      (col) => new THREE.MeshStandardMaterial({ color: col, roughness: 0.25, metalness: 0.85 })
    );
    const trafficRoofMat = new THREE.MeshStandardMaterial({ color: 0x1b112b, roughness: 0.4 });
    const trafficDarkMat = new THREE.MeshStandardMaterial({ color: 0x1a1228, roughness: 0.4, metalness: 0.6 });
    const trafficWheelMat = new THREE.MeshBasicMaterial({ color: 0x111118 });
    const trafficLightWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const trafficLightRedMat = new THREE.MeshBasicMaterial({ color: 0xff2a6d });

    const carBodyGeo = new THREE.BoxGeometry(1.8, 0.5, 4.0);
    const carRoofGeo = new THREE.BoxGeometry(1.4, 0.4, 2.0);
    const carLightGeo = new THREE.BoxGeometry(0.3, 0.12, 0.05);

    const bikeBodyGeo = new THREE.BoxGeometry(0.55, 0.35, 1.9);
    const bikeSeatGeo = new THREE.BoxGeometry(0.4, 0.18, 0.7);
    const bikeHandleGeo = new THREE.BoxGeometry(0.7, 0.08, 0.08);
    const bikeLightGeo = new THREE.BoxGeometry(0.2, 0.15, 0.08);
    const bikeWheelGeo = new THREE.CylinderGeometry(0.28, 0.28, 0.12, 10);
    bikeWheelGeo.rotateZ(Math.PI / 2);

    function createTrafficCarModel(isIncoming, colorIndex) {
      const group = new THREE.Group();
      const bodyMat = trafficBodyMats[colorIndex % trafficBodyMats.length];

      const body = new THREE.Mesh(carBodyGeo, bodyMat);
      body.position.y = 0.45;
      group.add(body);

      const roof = new THREE.Mesh(carRoofGeo, trafficRoofMat);
      roof.position.set(0, 0.85, -0.1);
      group.add(roof);

      const lightMat = isIncoming ? trafficLightWhiteMat : trafficLightRedMat;
      [-0.65, 0.65].forEach((lx) => {
        const l = new THREE.Mesh(carLightGeo, lightMat);
        l.position.set(lx, 0.45, isIncoming ? 2.02 : -2.02);
        group.add(l);
      });

      return group;
    }

    function createTrafficBikeModel(isIncoming, colorIndex) {
      const group = new THREE.Group();
      const bodyMat = trafficBikeBodyMats[colorIndex % trafficBikeBodyMats.length];

      const body = new THREE.Mesh(bikeBodyGeo, bodyMat);
      body.position.y = 0.55;
      group.add(body);
      const seat = new THREE.Mesh(bikeSeatGeo, trafficDarkMat);
      seat.position.set(0, 0.72, 0.15);
      group.add(seat);
      const handle = new THREE.Mesh(bikeHandleGeo, trafficDarkMat);
      handle.position.set(0, 0.85, -0.7);
      group.add(handle);
      const wF = new THREE.Mesh(bikeWheelGeo, trafficWheelMat);
      wF.position.set(0, 0.28, -0.75);
      group.add(wF);
      const wR = new THREE.Mesh(bikeWheelGeo, trafficWheelMat);
      wR.position.set(0, 0.28, 0.75);
      group.add(wR);
      const lightMat = isIncoming ? trafficLightWhiteMat : trafficLightRedMat;
      const light = new THREE.Mesh(bikeLightGeo, lightMat);
      light.position.set(0, 0.55, isIncoming ? 0.98 : -0.98);
      group.add(light);

      return group;
    }

    const trafficCount = 12;
    const spacingZ = 90;
    for (let i = 0; i < trafficCount; i++) {
      const isIncoming = i < 6;
      const laneIndex = i % 6;
      const xLane = isIncoming ? -2.2 : 1.5;
      const zPos = -40 - (laneIndex * spacingZ);
      const isBike = (i % 4 === 1);
      const colorIndex = i % trafficColors.length;

      const mesh = isBike
        ? createTrafficBikeModel(isIncoming, colorIndex)
        : createTrafficCarModel(isIncoming, colorIndex);
      mesh.position.set(xLane, 0, zPos);
      highwayGroup.add(mesh);

      trafficCars.push({
        mesh,
        isIncoming,
        laneIndex,
        halfLen: isBike ? 1.1 : 2.3,
        halfWidth: isBike ? 0.45 : 1.1
      });
    }

    const tunnels = [];
    const tunnelMat = new THREE.MeshStandardMaterial({
      color: 0x12151f,
      roughness: 0.7,
      metalness: 0.3
    });
    const tunnelNeonMat = new THREE.MeshBasicMaterial({ color: cyanColor });
    const tunnelCount = 3;
    const tunnelSpacing = 280;
    // Geometrie tunnel condivise
    const tunnelWallGeo = new THREE.BoxGeometry(1.2, 7, 28);
    const tunnelRoofGeo = new THREE.BoxGeometry(roadWidth + 3, 1.0, 28);
    const tunnelRingGeo = new THREE.BoxGeometry(roadWidth + 3.2, 0.2, 0.25);
    const tunnelLightGeo = new THREE.BoxGeometry(0.6, 0.12, 0.6);

    for (let i = 0; i < tunnelCount; i++) {
      const tGroup = new THREE.Group();
      const wallL = new THREE.Mesh(tunnelWallGeo, tunnelMat);
      wallL.position.set(-roadWidth / 2 - 0.8, 3.5, 0);
      tGroup.add(wallL);
      const wallR = new THREE.Mesh(tunnelWallGeo, tunnelMat);
      wallR.position.set(roadWidth / 2 + 0.8, 3.5, 0);
      tGroup.add(wallR);
      const roof = new THREE.Mesh(tunnelRoofGeo, tunnelMat);
      roof.position.set(0, 7.2, 0);
      tGroup.add(roof);
      const ring1 = new THREE.Mesh(tunnelRingGeo, tunnelNeonMat);
      ring1.position.set(0, 7.5, 14);
      tGroup.add(ring1);
      const ring2 = new THREE.Mesh(tunnelRingGeo, tunnelNeonMat);
      ring2.position.set(0, 7.5, -14);
      tGroup.add(ring2);
      for (let li = 0; li < 5; li++) {
        const tl = new THREE.Mesh(tunnelLightGeo, tunnelNeonMat);
        tl.position.set(0, 6.6, -10 + li * 5);
        tGroup.add(tl);
      }
      tGroup.position.set(0, 0, -120 - i * tunnelSpacing);
      highwayGroup.add(tGroup);
      tunnels.push(tGroup);
    }

    // =========================================================================
    // SEZIONE B: STANZA 3D HOME
    // =========================================================================
    const clickables = [];
    const pcClickables = [];

    function buildCyberpunkRoom() {
      const wallMat = new THREE.MeshStandardMaterial({ color: 0x221a42, roughness: 0.55, metalness: 0.15 });
      const trimPurpleMat = new THREE.MeshStandardMaterial({ color: 0x2e1a5e, roughness: 0.4 });
      const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x221538, roughness: 0.4, metalness: 0.3 });
      const bedSheetMat = new THREE.MeshStandardMaterial({ color: 0x42227d, roughness: 0.7 });
      const pillowMat = new THREE.MeshStandardMaterial({ color: 0xbac7db, roughness: 0.5 });

      const glowCyan = new THREE.MeshBasicMaterial({ color: cyanColor });
      const glowLime = new THREE.MeshBasicMaterial({ color: limeColor });
      const glowPink = new THREE.MeshBasicMaterial({ color: stopRedColor });
      const ledOffMat = new THREE.MeshStandardMaterial({ color: 0x161424, roughness: 0.5, metalness: 0.2 });

      matGlowCyan = glowCyan;
      matGlowLime = glowLime;
      matGlowPink = glowPink;
      matLedOff = ledOffMat;
      matPcLedRed = new THREE.MeshBasicMaterial({ color: 0xff1e42 });
      matPcLedLime = new THREE.MeshBasicMaterial({ color: limeColor });

      function registerLedStrip(mesh, onMat) {
        mesh.userData.onMat = onMat;
        mesh.material = ledOffMat;
        roomLedStrips.push(mesh);
      }

      const floor = new THREE.Mesh(new THREE.PlaneGeometry(16, 14), new THREE.MeshStandardMaterial({ color: 0x1a1635, roughness: 0.4 }));
      floor.rotation.x = -Math.PI / 2;
      roomGroup.add(floor);

      const rug = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.03, 3.8), new THREE.MeshStandardMaterial({ color: 0x6b1f8a, roughness: 0.75, emissive: 0x2a0a40, emissiveIntensity: 0.25 }));
      rug.position.set(0, 0.015, 0.5);
      roomGroup.add(rug);
      const rugBorder = new THREE.Mesh(new THREE.BoxGeometry(5.35, 0.025, 3.95), glowCyan);
      rugBorder.position.set(0, 0.01, 0.5);
      registerLedStrip(rugBorder, glowCyan);
      roomGroup.add(rugBorder);

      const backWall = new THREE.Mesh(new THREE.BoxGeometry(16, 6.5, 0.3), wallMat);
      backWall.position.set(0, 3.25, -5);
      roomGroup.add(backWall);

      // Parete sinistra: apertura allineata al telaio (2.5h x 3.8w @ y=3.5, z=-1)
      const leftWallBack = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.5, 4.05), wallMat);
      leftWallBack.position.set(-7.5, 3.25, -4.975);
      roomGroup.add(leftWallBack);
      const leftWallFront = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.5, 5.05), wallMat);
      leftWallFront.position.set(-7.5, 3.25, 4.425);
      roomGroup.add(leftWallFront);
      const leftWallTop = new THREE.Mesh(new THREE.BoxGeometry(0.3, 1.75, 3.85), wallMat);
      leftWallTop.position.set(-7.5, 5.625, -1.0);
      roomGroup.add(leftWallTop);
      const leftWallBottom = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.25, 3.85), wallMat);
      leftWallBottom.position.set(-7.5, 1.125, -1.0);
      roomGroup.add(leftWallBottom);

      const rightWall = new THREE.Mesh(new THREE.BoxGeometry(0.3, 6.5, 14), wallMat);
      rightWall.position.set(7.5, 3.25, 0);
      roomGroup.add(rightWall);

      // Tetto: stanza chiusa (niente cielo visibile)
      const ceiling = new THREE.Mesh(
        new THREE.BoxGeometry(16, 0.25, 14),
        new THREE.MeshStandardMaterial({ color: 0x1a1430, roughness: 0.75, metalness: 0.1 })
      );
      ceiling.position.set(0, 6.55, 0);
      roomGroup.add(ceiling);
      const ceilingTrim = new THREE.Mesh(
        new THREE.BoxGeometry(15.6, 0.04, 13.6),
        glowCyan
      );
      ceilingTrim.position.set(0, 6.42, 0);
      registerLedStrip(ceilingTrim, glowCyan);
      roomGroup.add(ceilingTrim);

      // Interruttore luce sulla parete destra (base grigio scuro, pulsante bianco)
      const switchGroup = new THREE.Group();
      const switchPlateMat = new THREE.MeshStandardMaterial({ color: 0x2a2d36, roughness: 0.45, metalness: 0.35 });
      const switchBtnMat = new THREE.MeshStandardMaterial({ color: 0xf4f6fa, roughness: 0.25, metalness: 0.1, emissive: 0x222630, emissiveIntensity: 0.25 });

      const switchPlate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.44, 0.30), switchPlateMat);
      switchPlate.userData = { isLightSwitch: true };
      switchClickables.push(switchPlate);
      switchGroup.add(switchPlate);

      const switchBtn = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.14), switchBtnMat);
      switchBtn.position.set(-0.025, 0, 0);
      switchBtn.rotation.z = -0.14;
      switchBtn.userData = { isLightSwitch: true };
      switchClickables.push(switchBtn);
      switchGroup.add(switchBtn);
      switchBtnMesh = switchBtn;

      // Posizionato sulla parete destra a buona distanza dal quadro NET (z: -3.2), non troppo in alto
      switchGroup.position.set(7.31, 2.35, -1.25);
      roomGroup.add(switchGroup);

      const stripBack = new THREE.Mesh(new THREE.BoxGeometry(13.2, 0.09, 0.09), glowCyan);
      stripBack.position.set(0, 5.88, -4.88);
      registerLedStrip(stripBack, glowCyan);
      roomGroup.add(stripBack);
      const stripRight = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 11.0), glowPink);
      stripRight.position.set(7.38, 5.88, 0.3);
      registerLedStrip(stripRight, glowPink);
      roomGroup.add(stripRight);
      const stripLeftTop = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 11.0), glowLime);
      stripLeftTop.position.set(-7.38, 5.88, 0.3);
      registerLedStrip(stripLeftTop, glowLime);
      roomGroup.add(stripLeftTop);
      const stripCornerR = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.09), glowPink);
      stripCornerR.position.set(7.15, 5.88, -4.88);
      registerLedStrip(stripCornerR, glowPink);
      roomGroup.add(stripCornerR);
      const stripCornerL = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.09, 0.09), glowLime);
      stripCornerL.position.set(-7.15, 5.88, -4.88);
      registerLedStrip(stripCornerL, glowLime);
      roomGroup.add(stripCornerL);

      const winFrame = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.55, 3.85), trimPurpleMat);
      winFrame.position.set(-7.35, 3.5, -1.0);
      roomGroup.add(winFrame);
      const winCrossH = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 3.7), trimPurpleMat);
      winCrossH.position.set(-7.28, 3.5, -1.0);
      roomGroup.add(winCrossH);
      const winCrossV = new THREE.Mesh(new THREE.BoxGeometry(0.06, 2.35, 0.08), trimPurpleMat);
      winCrossV.position.set(-7.28, 3.5, -1.0);
      roomGroup.add(winCrossV);

      // Vetro con skyline dipinto (città in lontananza, sempre leggibile)
      const skyCanvas = document.createElement('canvas');
      skyCanvas.width = 512;
      skyCanvas.height = 320;
      const sCtx = skyCanvas.getContext('2d');
      function paintWindowSkyline() {
        const g = sCtx.createLinearGradient(0, 0, 0, 320);
        g.addColorStop(0, '#050818');
        g.addColorStop(0.45, '#0a1430');
        g.addColorStop(0.7, '#12102a');
        g.addColorStop(1, '#1a0a28');
        sCtx.fillStyle = g;
        sCtx.fillRect(0, 0, 512, 320);
        // bagliore orizzonte
        const hg = sCtx.createRadialGradient(256, 250, 10, 256, 260, 200);
        hg.addColorStop(0, 'rgba(80, 40, 140, 0.55)');
        hg.addColorStop(1, 'rgba(0,0,0,0)');
        sCtx.fillStyle = hg;
        sCtx.fillRect(0, 160, 512, 160);
        // silhouettes edifici
        const buildings = [
          [20, 200, 55, 120], [80, 160, 48, 160], [135, 190, 40, 130],
          [185, 140, 60, 180], [255, 175, 45, 145], [310, 130, 70, 190],
          [390, 185, 50, 135], [450, 155, 42, 165]
        ];
        buildings.forEach((b, i) => {
          sCtx.fillStyle = i % 2 === 0 ? '#0c0e1a' : '#101428';
          sCtx.fillRect(b[0], b[1], b[2], b[3]);
          // finestre sparse
          sCtx.fillStyle = '#00f0ff';
          for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 3; col++) {
              if ((row + col + i) % 3 !== 0) continue;
              sCtx.globalAlpha = 0.35 + ((row * 3 + col) % 5) * 0.1;
              sCtx.fillRect(b[0] + 8 + col * 14, b[1] + 12 + row * 16, 6, 8);
            }
          }
          sCtx.globalAlpha = 1;
          // neon laterale
          sCtx.fillStyle = i % 3 === 0 ? '#ff2a6d' : '#a8ff00';
          sCtx.globalAlpha = 0.7;
          sCtx.fillRect(b[0] + b[2] - 3, b[1] + 20, 3, b[3] * 0.45);
          sCtx.globalAlpha = 1;
        });
      }
      paintWindowSkyline();
      const skyTex = new THREE.CanvasTexture(skyCanvas);
      skyTex.colorSpace = THREE.SRGBColorSpace;
      const winGlass = new THREE.Mesh(
        new THREE.PlaneGeometry(3.55, 2.35),
        new THREE.MeshBasicMaterial({
          map: skyTex,
          transparent: true,
          opacity: 0.92,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      winGlass.position.set(-7.42, 3.5, -1.0);
      winGlass.rotation.y = Math.PI / 2;
      roomGroup.add(winGlass);
      // leggero riflesso interno sul vetro
      const winSheen = new THREE.Mesh(
        new THREE.PlaneGeometry(3.55, 2.35),
        new THREE.MeshBasicMaterial({
          color: 0x88c8ff,
          transparent: true,
          opacity: 0.06,
          side: THREE.DoubleSide,
          depthWrite: false
        })
      );
      winSheen.position.set(-7.40, 3.5, -1.0);
      winSheen.rotation.y = Math.PI / 2;
      roomGroup.add(winSheen);

      function makeTechPoster(title, sub, accentHex) {
        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 384;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#0e1018';
        ctx.fillRect(0, 0, 256, 384);
        ctx.strokeStyle = accentHex;
        ctx.lineWidth = 8;
        ctx.strokeRect(10, 10, 236, 364);
        ctx.fillStyle = accentHex;
        ctx.font = 'bold 36px "Courier New", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(title, 128, 90);
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px "Courier New", monospace';
        ctx.fillText(sub, 128, 140);
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        for (let y = 180; y < 340; y += 14) {
          ctx.beginPath();
          ctx.moveTo(28, y);
          ctx.lineTo(40 + ((y * 3) % 160), y);
          ctx.stroke();
        }
        ctx.fillStyle = accentHex;
        ctx.fillRect(48, 355, 160, 5);
        const tex = new THREE.CanvasTexture(c);
        tex.needsUpdate = true;
        return tex;
      }

      const posters = [
        { title: 'KERNEL', sub: 'v. 0x48', color: '#00f0ff', x: -3.2, y: 3.6, z: -4.78, wall: 'back' },
        { title: 'ROOT', sub: 'ACCESS', color: '#a8ff00', x: -1.0, y: 3.6, z: -4.78, wall: 'back' },
        { title: 'NET', sub: 'PROTOCOL', color: '#ff2a6d', x: 7.28, y: 3.6, z: -3.2, wall: 'right' }
      ];
      posters.forEach((p) => {
        const tex = makeTechPoster(p.title, p.sub, p.color);
        const posterOnMat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, depthWrite: true });
        const posterOffMat = new THREE.MeshStandardMaterial({
          map: tex,
          color: 0x252838,
          roughness: 0.7,
          metalness: 0.1,
          side: THREE.DoubleSide
        });
        const poster = new THREE.Mesh(
          new THREE.PlaneGeometry(1.5, 2.1),
          posterOffMat
        );
        poster.position.set(p.x, p.y, p.z);
        if (p.wall === 'right') poster.rotation.y = -Math.PI / 2;
        poster.userData.onMat = posterOnMat;
        poster.userData.offMat = posterOffMat;
        roomLedStrips.push(poster);
        roomGroup.add(poster);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(1.58, 2.18, 0.04),
          new THREE.MeshStandardMaterial({ color: 0x151820, roughness: 0.6 })
        );
        frame.position.copy(poster.position);
        frame.rotation.copy(poster.rotation);
        if (p.wall === 'back') frame.position.z -= 0.04;
        else if (p.wall === 'right') frame.position.x += 0.04;
        roomGroup.add(frame);
      });

      const bedGroup = new THREE.Group();
      const bedBase = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.45, 4.4), darkWoodMat);
      bedBase.position.set(0, 0.225, 0);
      bedGroup.add(bedBase);

      const headboard = new THREE.Mesh(new THREE.BoxGeometry(2.7, 1.35, 0.22), trimPurpleMat);
      headboard.position.set(0, 0.675, -2.15);
      bedGroup.add(headboard);
      const headNeon = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 0.05), glowLime);
      headNeon.position.set(0, 1.15, -2.02);
      registerLedStrip(headNeon, glowLime);
      bedGroup.add(headNeon);

      const mattress = new THREE.Mesh(new THREE.BoxGeometry(2.45, 0.28, 4.2), bedSheetMat);
      mattress.position.set(0, 0.58, 0.05);
      bedGroup.add(mattress);

      const blanket = new THREE.Mesh(new THREE.BoxGeometry(2.52, 0.14, 2.7), new THREE.MeshStandardMaterial({ color: 0x5528a8, roughness: 0.8 }));
      blanket.position.set(0, 0.72, 0.75);
      bedGroup.add(blanket);

      [-0.6, 0.6].forEach(px => {
        const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 0.55), pillowMat);
        pillow.position.set(px, 0.78, -1.55);
        pillow.rotation.x = 0.2;
        bedGroup.add(pillow);
      });
      bedGroup.position.set(-4.8, 0, -2.3);
      roomGroup.add(bedGroup);

      const nightstand = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.65, 0.9), darkWoodMat);
      nightstand.position.set(-2.9, 0.325, -4.1);
      roomGroup.add(nightstand);
      const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.25, 12), trimPurpleMat);
      lampBase.position.set(-2.9, 0.775, -4.1);
      roomGroup.add(lampBase);
      const lampRedMat = new THREE.MeshBasicMaterial({ color: 0xff1e42 });
      const lampShade = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.28, 12), lampRedMat);
      lampShade.position.set(-2.9, 1.0, -4.1);
      roomGroup.add(lampShade);
      const bedsideRedLight = new THREE.PointLight(0xff1e42, 1.4, 5);
      bedsideRedLight.position.set(-2.9, 1.05, -3.9);
      roomGroup.add(bedsideRedLight);
      // Collegati all'interruttore stanza
      window._bedsideRedLight = bedsideRedLight;
      window._lampShade = lampShade;
      window._lampRedMat = lampRedMat;
      window._lampOffMat = new THREE.MeshStandardMaterial({ color: 0x2a2035, roughness: 0.6 });
      bedsideRedLight.intensity = 0; // parte spenta con stanza
      lampShade.material = window._lampOffMat;

      const deskGroup = new THREE.Group();
      const deskTop = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.12, 1.9), darkWoodMat);
      deskTop.position.set(0, 1.35, 0);
      deskGroup.add(deskTop);
      const deskNeonEdge = new THREE.Mesh(new THREE.BoxGeometry(6.42, 0.04, 0.04), glowCyan);
      deskNeonEdge.position.set(0, 1.35, 0.96);
      registerLedStrip(deskNeonEdge, glowCyan);
      deskGroup.add(deskNeonEdge);

      [[-3.0, -0.8], [3.0, -0.8], [-3.0, 0.8], [3.0, 0.8]].forEach(([lx, lz]) => {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.35, 0.12), trimPurpleMat);
        leg.position.set(lx, 0.675, lz);
        deskGroup.add(leg);
      });

      const lightGrayPCMat = new THREE.MeshStandardMaterial({ color: 0xd0d8e2, metalness: 0.85, roughness: 0.18 });
      const pcCase = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.05, 1.05), lightGrayPCMat);
      pcCase.position.set(2.85, 1.93, -0.1);
      pcCase.userData = { isPcCase: true };
      pcClickables.push(pcCase);
      deskGroup.add(pcCase);

      const pcFrontStrip = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.92, 0.04), ledOffMat);
      pcFrontStrip.position.set(2.58, 1.93, 0.43);
      pcFrontStrip.userData = { isPcCase: true };
      pcClickables.push(pcFrontStrip);
      pcFrontStripMesh = pcFrontStrip;
      deskGroup.add(pcFrontStrip);

      // I tre cerchi luminosi del PC (rossi quando PC spento, verde-lime quando PC acceso)
      [2.28, 1.93, 1.58].forEach((fy, idx) => {
        const fanRing = new THREE.Mesh(new THREE.RingGeometry(0.09, 0.135, 24), matLedOff);
        fanRing.position.set(2.85, fy, 0.435);
        fanRing.userData = { isPcCase: true };
        pcClickables.push(fanRing);
        pcFanRings.push(fanRing);
        deskGroup.add(fanRing);

        // Simbolo power bianco all'interno del primo cerchio (in alto, idx === 0)
        if (idx === 0) {
          const pwrWhiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.DoubleSide });
          // Arco aperto in alto (da 125° a 415° -> apertura centrata a 90° = pi/2)
          const arcStart = Math.PI * 0.5 + 0.48;
          const arcLen = Math.PI * 2 - 0.96;
          const pwrArc = new THREE.Mesh(new THREE.RingGeometry(0.036, 0.052, 24, 1, arcStart, arcLen), pwrWhiteMat);
          pwrArc.position.set(2.85, fy, 0.438);
          pwrArc.userData = { isPcCase: true };
          pcClickables.push(pwrArc);
          deskGroup.add(pwrArc);

          const pwrBar = new THREE.Mesh(new THREE.PlaneGeometry(0.016, 0.052), pwrWhiteMat);
          pwrBar.position.set(2.85, fy + 0.032, 0.438);
          pwrBar.userData = { isPcCase: true };
          pcClickables.push(pwrBar);
          deskGroup.add(pwrBar);
        }
      });

      const pcGpu = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.12, 0.55), ledOffMat);
      pcGpu.position.set(2.62, 1.85, -0.05);
      pcGpuMesh = pcGpu;
      deskGroup.add(pcGpu);

      /* =======================================================================
         CANVAS MONITOR 1 (SINISTRA): ALGORHYTHM
         ======================================================================= */
      const algoCanvas = document.createElement('canvas');
      algoCanvas.width = 512;
      algoCanvas.height = 256;
      const aCtx = algoCanvas.getContext('2d');

      function drawAlgoMonitorCanvas() {
        aCtx.fillStyle = '#070b19';
        aCtx.fillRect(0, 0, 512, 256);
        aCtx.strokeStyle = '#00f0ff';
        aCtx.lineWidth = 4;
        aCtx.strokeRect(10, 10, 492, 236);

        aCtx.fillStyle = '#00f0ff';
        aCtx.font = 'bold 22px "Courier New", monospace';
        aCtx.textAlign = 'center';
        aCtx.fillText('ALGORHYTHM // RADIO', 256, 38);

        aCtx.fillStyle = '#0c1428';
        aCtx.fillRect(36, 52, 440, 36);
        aCtx.strokeStyle = '#a8ff00';
        aCtx.lineWidth = 2;
        aCtx.strokeRect(36, 52, 440, 36);
        aCtx.fillStyle = '#a8ff00';
        aCtx.font = 'bold 14px "Courier New", monospace';
        aCtx.fillText(Radio.currentTrackDisplay, 256, 74);

        const stButtons = [
          { key: 'PulseFM', label: 'PULSE FM', x: 36 },
          { key: 'NeonReggaeton', label: 'NEON REG', x: 186 },
          { key: 'HazeWave', label: 'HAZE WAVE', x: 336 }
        ];
        stButtons.forEach((btn) => {
          const isSelected = Radio.currentStationKey === btn.key;
          aCtx.fillStyle = isSelected ? 'rgba(0, 240, 255, 0.35)' : 'rgba(0, 240, 255, 0.1)';
          aCtx.fillRect(btn.x, 102, 140, 46);
          aCtx.strokeStyle = isSelected ? '#a8ff00' : '#00f0ff';
          aCtx.lineWidth = isSelected ? 3 : 2;
          aCtx.strokeRect(btn.x, 102, 140, 46);

          aCtx.fillStyle = isSelected ? '#a8ff00' : '#00f0ff';
          aCtx.font = 'bold 15px "Courier New", monospace';
          aCtx.fillText(btn.label, btn.x + 70, 130);
        });

        // Power (compatto, solo ON/OFF)
        aCtx.fillStyle = Radio.radioOn ? 'rgba(168, 255, 0, 0.25)' : 'rgba(255, 42, 109, 0.25)';
        aCtx.fillRect(36, 168, 96, 48);
        aCtx.strokeStyle = Radio.radioOn ? '#a8ff00' : '#ff2a6d';
        aCtx.lineWidth = 2;
        aCtx.strokeRect(36, 168, 96, 48);
        aCtx.fillStyle = Radio.radioOn ? '#a8ff00' : '#ff2a6d';
        aCtx.font = 'bold 16px "Courier New", monospace';
        aCtx.fillText(Radio.radioOn ? 'ON' : 'OFF', 84, 198);

        // Equalizer piccolo tra Power e Volume
        const eqBase = 208;
        const bars = 10;
        const tNow = performance.now() * 0.004;
        const eqStartX = 150;
        for (let i = 0; i < bars; i++) {
          let h = 2;
          if (Radio.radioOn) {
            h = 3 + Math.abs(Math.sin(tNow + i * 0.6)) * 10
              + Math.abs(Math.sin(tNow * 1.8 + i * 1.2)) * 8;
          }
          aCtx.fillStyle = i % 2 === 0 ? '#a8ff00' : '#00f0ff';
          aCtx.fillRect(eqStartX + i * 20, eqBase - h, 14, h);
        }

        // Volume (compatto, solo percentuale)
        aCtx.fillStyle = 'rgba(0, 240, 255, 0.18)';
        aCtx.fillRect(380, 168, 96, 48);
        aCtx.strokeStyle = '#00f0ff';
        aCtx.lineWidth = 2;
        aCtx.strokeRect(380, 168, 96, 48);
        aCtx.fillStyle = '#00f0ff';
        aCtx.font = 'bold 16px "Courier New", monospace';
        aCtx.fillText(`${volumeSteps[Radio.volumeStepIndex]}%`, 428, 198);
      }

      drawAlgoMonitorCanvas();
      const algoTex = new THREE.CanvasTexture(algoCanvas);
      screenMatAlgo = new THREE.MeshBasicMaterial({ map: algoTex });

      /* =======================================================================
         CANVAS MONITOR 2 (CENTRO): TERMINAL + stats carriera
         ======================================================================= */
      const techCanvas = document.createElement('canvas');
      techCanvas.width = 512;
      techCanvas.height = 256;
      const tCtx = techCanvas.getContext('2d');

      function drawTechMonitorCanvas() {
        const career = loadCareerKm();
        const best = loadBestKm();
        tCtx.fillStyle = '#04080f';
        tCtx.fillRect(0, 0, 512, 256);
        tCtx.strokeStyle = '#00f0ff';
        tCtx.lineWidth = 3;
        tCtx.strokeRect(6, 6, 500, 244);
        tCtx.fillStyle = '#00f0ff';
        tCtx.font = 'bold 16px "Courier New", monospace';
        tCtx.textAlign = 'left';
        tCtx.fillText('> ALGORHYTHM OS  //  terminal', 20, 32);
        tCtx.fillStyle = '#2a6080';
        tCtx.fillRect(18, 40, 476, 1);
        const termLines = [
          '$ ssh root@night-city',
          'connected.',
          '$ cat /proc/drive/stats',
          `career_km: ${career.toFixed(2)}`,
          `best_run:  ${best.toFixed(2)} KM`,
          '$ ./safehouse --mode lounge',
          'radio: online | monitors: 3 active',
          '$ _'
        ];
        tCtx.font = '15px "Courier New", monospace';
        termLines.forEach((line, i) => {
          tCtx.fillStyle = line.startsWith('$') ? '#a8ff00' : '#7ec8e3';
          if (line.startsWith('career') || line.startsWith('best')) tCtx.fillStyle = '#a8ff00';
          tCtx.fillText(line, 24, 60 + i * 22);
        });
      }

      drawTechMonitorCanvas();
      const techTex = new THREE.CanvasTexture(techCanvas);
      screenMatTech = new THREE.MeshBasicMaterial({ map: techTex });
      window._updateTechMonitorCanvas = drawTechMonitorCanvas;
      window._techTexture = techTex;

      /* =======================================================================
         CANVAS MONITOR 3 (DESTRA): MIDNIGHT VIBE
         ======================================================================= */
      const monCanvas = document.createElement('canvas');
      monCanvas.width = 512;
      monCanvas.height = 256;
      const mCtx = monCanvas.getContext('2d');

      function drawMonitorCanvas(hovered) {
        // Sfondo a tutto schermo (edge-to-edge)
        mCtx.fillStyle = '#070b19';
        mCtx.fillRect(0, 0, 512, 256);

        // Sottile bordo neon esterno
        mCtx.strokeStyle = 'rgba(0, 240, 255, 0.55)';
        mCtx.lineWidth = 3;
        mCtx.strokeRect(2, 2, 508, 252);

        // Titolo
        mCtx.fillStyle = '#a8ff00';
        mCtx.font = 'bold 26px "Courier New", monospace';
        mCtx.textAlign = 'center';
        mCtx.fillText('MIDNIGHT VIBE', 256, 36);

        // Silhouette auto (vista laterale stilizzata)
        mCtx.save();
        mCtx.translate(256, 118);
        mCtx.scale(1.15, 1.15);
        // corpo
        mCtx.fillStyle = '#00f0ff';
        mCtx.beginPath();
        mCtx.moveTo(-70, 8);
        mCtx.lineTo(-62, -6);
        mCtx.lineTo(-28, -10);
        mCtx.lineTo(-12, -28);
        mCtx.lineTo(18, -28);
        mCtx.lineTo(38, -8);
        mCtx.lineTo(68, -4);
        mCtx.lineTo(74, 8);
        mCtx.closePath();
        mCtx.fill();
        // finestrini
        mCtx.fillStyle = '#0b0717';
        mCtx.beginPath();
        mCtx.moveTo(-8, -12);
        mCtx.lineTo(-4, -24);
        mCtx.lineTo(14, -24);
        mCtx.lineTo(24, -10);
        mCtx.closePath();
        mCtx.fill();
        // ruote
        mCtx.fillStyle = '#a8ff00';
        mCtx.beginPath();
        mCtx.arc(-40, 10, 11, 0, Math.PI * 2);
        mCtx.arc(42, 10, 11, 0, Math.PI * 2);
        mCtx.fill();
        mCtx.fillStyle = '#070b19';
        mCtx.beginPath();
        mCtx.arc(-40, 10, 5, 0, Math.PI * 2);
        mCtx.arc(42, 10, 5, 0, Math.PI * 2);
        mCtx.fill();
        // linea sottoscocca
        mCtx.strokeStyle = '#a8ff00';
        mCtx.lineWidth = 2;
        mCtx.beginPath();
        mCtx.moveTo(-68, 8);
        mCtx.lineTo(72, 8);
        mCtx.stroke();
        mCtx.restore();

        // Equalizer sotto l'auto
        for (let b = 0; b < 14; b++) {
          const bh = 8 + ((b * 17) % 28);
          mCtx.fillStyle = b % 2 === 0 ? 'rgba(168, 255, 0, 0.85)' : 'rgba(0, 240, 255, 0.75)';
          mCtx.fillRect(96 + b * 23, 200 - bh, 14, bh);
        }

        // Pulsante solo in zoom: torna alla guida
        if (isMonitorZoomed) {
          mCtx.fillStyle = hovered ? '#a8ff00' : 'rgba(0, 240, 255, 0.22)';
          mCtx.fillRect(106, 210, 300, 36);
          mCtx.strokeStyle = '#a8ff00';
          mCtx.lineWidth = 2;
          mCtx.strokeRect(106, 210, 300, 36);
          mCtx.fillStyle = hovered ? '#070b19' : '#a8ff00';
          mCtx.font = 'bold 15px "Courier New", monospace';
          mCtx.fillText('TORNA ALLA GUIDA', 256, 233);
        }
      }

      drawMonitorCanvas(false);
      const monitorTexture = new THREE.CanvasTexture(monCanvas);
      screenMatDrive = new THREE.MeshBasicMaterial({ map: monitorTexture });

      offScreenMat = new THREE.MeshBasicMaterial({ color: 0x020408 });

      const monConfigs = [
        { x: -1.4, activeMat: screenMatAlgo, id: 'algo' },
        { x: 0.0,  activeMat: screenMatTech, id: 'tech' },
        { x: 1.4,  activeMat: screenMatDrive, id: 'drive' }
      ];

      monConfigs.forEach((cfg) => {
        const stand = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.35, 0.14), trimPurpleMat);
        stand.position.set(cfg.x, 1.58, -0.4);
        deskGroup.add(stand);
        const base = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.04, 0.35), trimPurpleMat);
        base.position.set(cfg.x, 1.43, -0.35);
        deskGroup.add(base);
        const frame = new THREE.Mesh(
          new THREE.BoxGeometry(1.35, 0.92, 0.08),
          new THREE.MeshStandardMaterial({ color: 0x130d24, roughness: 0.3 })
        );
        frame.position.set(cfg.x, 2.15, -0.42);
        frame.userData = { monitorFrame: true, monitorId: cfg.id };
        clickables.push(frame);
        deskGroup.add(frame);

        const screen = new THREE.Mesh(
          new THREE.PlaneGeometry(1.25, 0.82),
          offScreenMat
        );
        screen.position.set(cfg.x, 2.15, -0.375);
        screen.userData = { monitorScreen: true, monitorId: cfg.id, activeMaterial: cfg.activeMat };
        clickables.push(screen);
        deskGroup.add(screen);
      });

      const keyboard = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.04, 0.34), new THREE.MeshStandardMaterial({ color: 0x221538 }));
      keyboard.position.set(0.0, 1.445, 0.35);
      deskGroup.add(keyboard);
      const kbGlow = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.01, 0.31), ledOffMat);
      kbGlow.position.set(0.0, 1.466, 0.35);
      kbGlowMesh = kbGlow;
      deskGroup.add(kbGlow);

      const mouse = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.26), new THREE.MeshStandardMaterial({ color: 0x221538 }));
      mouse.position.set(0.85, 1.45, 0.35);
      deskGroup.add(mouse);
      const mouseGlow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.01, 0.18), ledOffMat);
      mouseGlow.position.set(0.85, 1.476, 0.35);
      mouseGlowMesh = mouseGlow;
      deskGroup.add(mouseGlow);

      const chairGroup = new THREE.Group();
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.14, 0.95), trimPurpleMat);
      seat.position.set(0, 0.78, 0);
      chairGroup.add(seat);
      const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.88, 1.25, 0.16), trimPurpleMat);
      backrest.position.set(0, 1.42, 0.42);
      backrest.rotation.x = -0.12;
      chairGroup.add(backrest);
      const chairNeon = new THREE.Mesh(new THREE.BoxGeometry(0.06, 1.1, 0.04), glowPink);
      chairNeon.position.set(0, 1.42, 0.51);
      chairNeon.rotation.x = -0.12;
      registerLedStrip(chairNeon, glowPink);
      chairGroup.add(chairNeon);
      const chairPole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 10), darkWoodMat);
      chairPole.position.set(0, 0.38, 0);
      chairGroup.add(chairPole);
      const chairFoot = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 5), darkWoodMat);
      chairFoot.position.set(0, 0.05, 0);
      chairGroup.add(chairFoot);
      chairGroup.position.set(0.0, 0, 1.15);
      deskGroup.add(chairGroup);
      roomChairGroup = chairGroup;

      deskGroup.position.set(2.4, 0, -3.6);
      roomGroup.add(deskGroup);

      const shelf = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.08, 0.45), darkWoodMat);
      shelf.position.set(2.4, 3.7, -4.7);
      roomGroup.add(shelf);
      const shelfNeon = new THREE.Mesh(new THREE.BoxGeometry(4.2, 0.03, 0.03), glowPink);
      shelfNeon.position.set(2.4, 3.66, -4.48);
      registerLedStrip(shelfNeon, glowPink);
      roomGroup.add(shelfNeon);

      [0.8, 4.0].forEach(sx => {
        const speaker = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.55, 0.35), trimPurpleMat);
        speaker.position.set(sx, 4.02, -4.7);
        roomGroup.add(speaker);
        const woofer = new THREE.Mesh(new THREE.CircleGeometry(0.1, 16), glowCyan);
        woofer.position.set(sx, 4.0, -4.5);
        registerLedStrip(woofer, glowCyan);
        roomGroup.add(woofer);
      });

      const cbRadioGroup = new THREE.Group();
      const cbBody = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.5, 0.45), new THREE.MeshStandardMaterial({ color: 0x18122c, metalness: 0.8, roughness: 0.3 }));
      cbBody.position.y = 0.25;
      cbRadioGroup.add(cbBody);

      const cbDisplay = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.18, 0.02), glowCyan);
      cbDisplay.position.set(0, 0.3, 0.23);
      registerLedStrip(cbDisplay, glowCyan);
      cbRadioGroup.add(cbDisplay);

      [-0.4, 0.4].forEach(kx => {
        const knob = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.08, 12), glowLime);
        knob.rotation.x = Math.PI / 2;
        knob.position.set(kx, 0.15, 0.23);
        registerLedStrip(knob, glowLime);
        cbRadioGroup.add(knob);
      });

      cbRadioGroup.position.set(2.4, 3.74, -4.7);
      roomGroup.add(cbRadioGroup);

      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.24, 0.5, 12), trimPurpleMat);
      pot.position.set(5.8, 0.25, -4.0);
      roomGroup.add(pot);
      const plantLeaves = new THREE.Mesh(new THREE.DodecahedronGeometry(0.45, 0), new THREE.MeshStandardMaterial({ color: 0x228b55, emissive: 0x0f4a28 }));
      plantLeaves.position.set(5.8, 0.8, -4.0);
      roomGroup.add(plantLeaves);

      const roomLightCyan = new THREE.PointLight(cyanColor, 3.6, 20);
      roomLightCyan.position.set(3.0, 3.5, -2.5);
      roomGroup.add(roomLightCyan);

      const roomLightPurple = new THREE.PointLight(0xa87aff, 3.2, 20);
      roomLightPurple.position.set(-4.0, 4.0, -2.0);
      roomGroup.add(roomLightPurple);

      const roomLightMain = new THREE.PointLight(0xffffff, 2.4, 16);
      roomLightMain.position.set(0, 4.5, 0);
      roomGroup.add(roomLightMain);

      const deskLight = new THREE.PointLight(0xd0e8ff, 1.8, 8);
      deskLight.position.set(0.0, 3.1, -1.8);
      roomGroup.add(deskLight);

      window._updateMonitorCanvas = drawMonitorCanvas;
      window._monitorTexture = monitorTexture;
      window._updateAlgoMonitorCanvas = drawAlgoMonitorCanvas;
      window._algoTexture = algoTex;
    }

    buildCyberpunkRoom();

    Radio.setOnRadioDisplayUpdate(() => {
      if (window._updateAlgoMonitorCanvas && pcPoweredOn) {
        window._updateAlgoMonitorCanvas();
        if (window._algoTexture) window._algoTexture.needsUpdate = true;
      }
    });


    const raycaster = new THREE.Raycaster();
    const mousePos = new THREE.Vector2();

    function playUiClick(freq = 420, dur = 0.06, vol = 0.035) {
      resumeAudioContext();
      if (!audioCtx) return;
      try {
        const osc = audioCtx.createOscillator();
        const g = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        g.gain.value = vol;
        osc.connect(g);
        g.connect(audioCtx.destination);
        const t0 = audioCtx.currentTime;
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
        osc.start(t0);
        osc.stop(t0 + dur);
      } catch (_) { /* ignore */ }
    }

    let fanOsc = null;
    let fanGain = null;
    let fanFilter = null;
    function setPcFanHum(/* on */) {
      // Ronzio disattivato: a lungo risultava fastidioso
      if (fanGain && audioCtx) {
        fanGain.gain.setTargetAtTime(0, audioCtx.currentTime, 0.05);
      }
    }

    function setRoomNeons(on) {
      const changed = roomNeonOn !== on;
      roomNeonOn = on;
      for (const strip of roomLedStrips) {
        strip.material = on ? strip.userData.onMat : (strip.userData.offMat || matLedOff);
      }
      if (switchBtnMesh) {
        switchBtnMesh.rotation.z = on ? 0.14 : -0.14;
      }
      // Lampada comodino legata all'interruttore
      if (window._bedsideRedLight) {
        window._bedsideRedLight.intensity = on ? 1.4 : 0;
      }
      if (window._lampShade) {
        window._lampShade.material = on ? window._lampRedMat : window._lampOffMat;
      }
      // Senza corrente di stanza il PC non può restare acceso
      if (!on && pcPoweredOn) {
        powerOffPC();
      }
      if (changed) playUiClick(on ? 520 : 280, 0.05, 0.03);
    }

    // Look yaw in safehouse (0 = verso desk, negativo = finestra a sinistra)
    let homeLookYaw = 0;
    const HOME_YAW_MIN = -1.05;
    const HOME_YAW_MAX = 0.35;
    const HOME_CAM_POS = new THREE.Vector3(0.0, 2.75, 4.4);
    const HOME_LOOK_BASE = new THREE.Vector3(0.5, 1.65, -3.5);

    function applyHomeCameraLook() {
      camera.position.copy(HOME_CAM_POS);
      const look = HOME_LOOK_BASE.clone().sub(HOME_CAM_POS);
      const cos = Math.cos(homeLookYaw);
      const sin = Math.sin(homeLookYaw);
      const lx = look.x * cos - look.z * sin;
      const lz = look.x * sin + look.z * cos;
      camera.lookAt(HOME_CAM_POS.x + lx, HOME_LOOK_BASE.y, HOME_CAM_POS.z + lz);
    }

    window.addEventListener('mousemove', (e) => {
      if (!isHomeMode) return;
      mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mousePos, camera);
      const allIntersects = raycaster.intersectObjects([...clickables, ...pcClickables, ...switchClickables]);
      
      if (allIntersects.length > 0) {
        const hitObj = allIntersects[0].object;
        if (hitObj.userData.isPcCase || hitObj.userData.isLightSwitch || (pcPoweredOn && hitObj.userData.monitorId)) {
          document.body.style.cursor = 'pointer';
          const hitId = hitObj.userData.monitorId;
          if (hitId === 'drive' && window._updateMonitorCanvas && pcPoweredOn) {
            window._updateMonitorCanvas(true);
            window._monitorTexture.needsUpdate = true;
          }
          return;
        }
      }
      document.body.style.cursor = 'default';
      if (window._updateMonitorCanvas && pcPoweredOn) {
        window._updateMonitorCanvas(false);
        window._monitorTexture.needsUpdate = true;
      }
    });

    function powerOnPC() {
      // Serve l'interruttore stanza ON per alimentare il PC
      if (!roomNeonOn) {
        playUiClick(140, 0.08, 0.02);
        return;
      }
      pcPoweredOn = true;
      for (const ring of pcFanRings) {
        ring.material = matPcLedLime;
      }
      if (pcFrontStripMesh) pcFrontStripMesh.material = matGlowCyan;
      if (pcGpuMesh) pcGpuMesh.material = matGlowPink;
      if (kbGlowMesh) kbGlowMesh.material = matGlowLime;
      if (mouseGlowMesh) mouseGlowMesh.material = matGlowCyan;
      for (const obj of clickables) {
        if (obj.userData && obj.userData.activeMaterial) {
          obj.material = obj.userData.activeMaterial;
        }
      }
      if (window._updateMonitorCanvas) {
        window._updateMonitorCanvas(false);
        window._monitorTexture.needsUpdate = true;
      }
      if (window._updateAlgoMonitorCanvas) {
        window._updateAlgoMonitorCanvas();
        window._algoTexture.needsUpdate = true;
      }
      if (window._updateTechMonitorCanvas) {
        window._updateTechMonitorCanvas();
        if (window._techTexture) window._techTexture.needsUpdate = true;
      }
      playUiClick(180, 0.08, 0.025);
      setPcFanHum(true);
    }

    function powerOffPC() {
      pcPoweredOn = false;
      // Con interruttore OFF: LED completamente spenti (niente rosso standby)
      const ledMat = roomNeonOn ? matPcLedRed : matLedOff;
      for (const ring of pcFanRings) {
        ring.material = ledMat;
      }
      if (pcFrontStripMesh) pcFrontStripMesh.material = matLedOff;
      if (pcGpuMesh) pcGpuMesh.material = matLedOff;
      if (kbGlowMesh) kbGlowMesh.material = matLedOff;
      if (mouseGlowMesh) mouseGlowMesh.material = matLedOff;
      if (isMonitorZoomed) {
        exitMonitorZoomToRoom();
      }
      for (const obj of clickables) {
        if (obj.userData && obj.userData.activeMaterial) {
          obj.material = offScreenMat;
        }
      }
      setPcFanHum(false);
      // Spegnendo il PC si spegne anche la radio
      forceRadioOff();
    }

    function zoomToMonitors() {
      isMonitorZoomed = true;
      if (roomChairGroup) roomChairGroup.visible = false;
      homeHudEl.classList.remove('visible');

      if (window._updateMonitorCanvas) {
        window._updateMonitorCanvas(false);
        window._monitorTexture.needsUpdate = true;
      }
      if (window._updateAlgoMonitorCanvas) {
        window._updateAlgoMonitorCanvas();
        window._algoTexture.needsUpdate = true;
      }

      camera.position.set(2.4, 2.15, -1.05);
      camera.lookAt(2.4, 2.15, -3.98);
      camera.fov = 52;
      camera.updateProjectionMatrix();
    }

    function exitMonitorZoomToRoom() {
      isMonitorZoomed = false;
      document.body.style.cursor = 'default';
      if (roomChairGroup) roomChairGroup.visible = true;
      homeHudEl.classList.add('visible');

      camera.fov = 65;
      camera.updateProjectionMatrix();
      applyHomeCameraLook();
      if (window._updateMonitorCanvas && pcPoweredOn) {
        window._updateMonitorCanvas(false);
        window._monitorTexture.needsUpdate = true;
      }
    }

    window.addEventListener('click', (e) => {
      if (!isHomeMode) return;
      mousePos.x = (e.clientX / window.innerWidth) * 2 - 1;
      mousePos.y = -(e.clientY / window.innerHeight) * 2 + 1;

      raycaster.setFromCamera(mousePos, camera);
      
      const switchIntersects = raycaster.intersectObjects(switchClickables);
      if (switchIntersects.length > 0) {
        setRoomNeons(!roomNeonOn);
        return;
      }

      const pcIntersects = raycaster.intersectObjects(pcClickables);
      if (pcIntersects.length > 0) {
        if (!pcPoweredOn) {
          powerOnPC();
        } else {
          powerOffPC();
        }
        return;
      }

      const intersects = raycaster.intersectObjects(clickables);
      const hit = intersects.length > 0 ? intersects[0] : null;

      if (!isMonitorZoomed) {
        if (pcPoweredOn && hit && hit.object.userData && hit.object.userData.monitorId) {
          document.body.style.cursor = 'default';
          zoomToMonitors();
        }
      } else {
        if (!hit) {
          exitMonitorZoomToRoom();
          return;
        }

        const monitorId = hit.object.userData.monitorId;

        if (monitorId === 'algo' && hit.uv) {
          const px = hit.uv.x * 512;
          const py = (1 - hit.uv.y) * 256;

          if (py >= 102 && py <= 148) {
            if (px >= 36 && px <= 176) setStation('PulseFM');
            else if (px >= 186 && px <= 326) setStation('NeonReggaeton');
            else if (px >= 336 && px <= 476) setStation('HazeWave');
          } else if (py >= 168 && py <= 220) {
            if (px >= 36 && px <= 132) toggleRadioPower();
            else if (px >= 380 && px <= 476) cycleVolume();
          }
        } else if (monitorId === 'drive' && hit.uv) {
          const px = hit.uv.x * 512;
          const py = (1 - hit.uv.y) * 256;
          if (px >= 106 && px <= 406 && py >= 210 && py <= 246) {
            document.body.style.cursor = 'default';
            if (roomChairGroup) roomChairGroup.visible = true;
            camera.fov = 65;
            camera.updateProjectionMatrix();
            returnToPitStop();
          }
        }
      }
    });

    function softReentryToRoad() {
      // Sterzo/velocità azzerati, traffico allontanato, breve grace period
      keys.left = keys.right = keys.up = keys.down = keys.handbrake = false;
      currentKmh = 0;
      const pitX = roadWidth / 2 + 2;
      targetX = pitX;
      carGroup.position.x = pitX;
      carGroup.rotation.set(0, 0, 0);

      for (let ti = 0; ti < trafficCars.length; ti++) {
        const t = trafficCars[ti];
        // Spinge i veicoli lontani dal player
        if (Math.abs(t.mesh.position.z) < 40) {
          t.mesh.position.z = t.isIncoming ? -55 - (ti % 6) * 12 : -70 - (ti % 6) * 14;
        }
      }

      spawnGraceUntil = performance.now() + 3500;
      stopSignGroup.position.z = -3.8;
      stopSignGroup.visible = true;
      parkBayGroup.visible = true;
      isAfk = false;
      parkedSinceTime = null;
      restModalShown = false;
      lastInputTime = performance.now();
      lastFrameTime = performance.now();
    }

    function enterHomeRoom() {
      isHomeMode = true;
      isMonitorZoomed = false;
      homeLookYaw = 0;
      setRoomNeons(false);
      powerOffPC();
      if (roomChairGroup) roomChairGroup.visible = true;

      restModal.classList.remove('visible');
      telemetryBox.classList.add('hidden');
      speedometerBr.classList.add('hidden');
      hudEl.classList.add('hidden');
      homeHudEl.classList.add('visible');
      
      miniRadioEl.classList.add('hidden');
      // Radio completamente OFF entrando in Safehouse (si riaccende solo dal PC)
      forceRadioOff();
      setPcFanHum(false);

      highwayGroup.visible = false;
      roomGroup.visible = true;
      // Nebbia leggera anche indoor
      scene.fog = new THREE.FogExp2(bgColor, 0.008);

      camera.fov = 65;
      camera.updateProjectionMatrix();
      applyHomeCameraLook();
      if (window._updateTechMonitorCanvas) {
        window._updateTechMonitorCanvas();
        if (window._techTexture) window._techTexture.needsUpdate = true;
      }
      if (window._updateAlgoMonitorCanvas) {
        window._updateAlgoMonitorCanvas();
        if (window._algoTexture) window._algoTexture.needsUpdate = true;
      }
    }

    function returnToPitStop() {
      isHomeMode = false;
      isMonitorZoomed = false;
      document.body.style.cursor = 'default';
      roomGroup.visible = false;
      highwayGroup.visible = true;
      // Nebbia leggera: skyline leggibile, tinta ancora percepibile
      scene.fog = new THREE.FogExp2(0x0a1028, 0.0045);
      setPcFanHum(false);

      homeHudEl.classList.remove('visible');
      hudEl.classList.remove('hidden');
      telemetryBox.classList.remove('hidden');
      speedometerBr.classList.remove('hidden');
      
      miniRadioEl.classList.remove('hidden');
      // Radio resta OFF finché non la riaccendi dalla mini-radio

      softReentryToRoad();

      camera.fov = 62;
      camera.updateProjectionMatrix();
      const pitX = roadWidth / 2 + 2;
      camera.position.set(pitX * 0.45, 3.2, 7.5);
      camera.lookAt(pitX * 0.3, 1.2, -10);
    }

    // Aggiorna label BEST sulla start screen
    const startBestEl = document.getElementById('start-best');
    function refreshBestLabels(isNew = false) {
      bestKm = loadBestKm();
      if (startBestEl) {
        startBestEl.textContent = `BEST — ${bestKm.toFixed(2)} KM`;
      }
      const modalBest = document.getElementById('modal-best-value');
      if (modalBest) {
        modalBest.textContent = `${bestKm.toFixed(2)} KM`;
        modalBest.classList.toggle('is-new', !!isNew);
      }
    }
    refreshBestLabels();

    btnStartGame.addEventListener('click', () => {
      startScreen.classList.add('hidden');
      gameStarted = true;
      resetRadioUI();

      resumeAudioContext();
      initBrakeSound();

      lastFrameTime = performance.now();
      registerActivity();
    });

    btnHome.addEventListener('click', () => {
      enterHomeRoom();
    });

    const gaugeCanvas = document.getElementById('analog-gauge');
    const gCtx = gaugeCanvas.getContext('2d');

    function drawAnalogGauge(kmh, isParked) {
      gCtx.clearRect(0, 0, 140, 140);
      const cx = 70, cy = 68, r = 52;
      
      gCtx.beginPath();
      gCtx.arc(cx, cy, r, Math.PI * 0.75, Math.PI * 2.25);
      gCtx.strokeStyle = 'rgba(0, 240, 255, 0.15)';
      gCtx.lineWidth = 6;
      gCtx.stroke();

      for (let i = 0; i <= 8; i++) {
        const val = i * 40;
        const angle = Math.PI * 0.75 + (val / 320) * (Math.PI * 1.5);
        const innerR = i % 2 === 0 ? r - 8 : r - 5;
        gCtx.beginPath();
        gCtx.moveTo(cx + innerR * Math.cos(angle), cy + innerR * Math.sin(angle));
        gCtx.lineTo(cx + r * Math.cos(angle), cy + r * Math.sin(angle));
        gCtx.strokeStyle = i % 2 === 0 ? '#00f0ff' : 'rgba(0, 240, 255, 0.4)';
        gCtx.lineWidth = i % 2 === 0 ? 2 : 1;
        gCtx.stroke();
      }

      const fraction = Math.min(kmh / 320, 1);
      const activeAngle = Math.PI * 0.75 + fraction * (Math.PI * 1.5);
      
      gCtx.beginPath();
      gCtx.arc(cx, cy, r, Math.PI * 0.75, activeAngle);
      gCtx.strokeStyle = '#00f0ff';
      gCtx.lineWidth = 6;
      gCtx.shadowColor = '#00f0ff';
      gCtx.shadowBlur = 12;
      gCtx.stroke();
      gCtx.shadowBlur = 0;

      const needleLen = r - 3;
      gCtx.beginPath();
      gCtx.moveTo(cx, cy);
      gCtx.lineTo(cx + needleLen * Math.cos(activeAngle), cy + needleLen * Math.sin(activeAngle));
      gCtx.strokeStyle = '#a8ff00';
      gCtx.lineWidth = 3;
      gCtx.stroke();

      gCtx.beginPath();
      gCtx.arc(cx, cy, 4.5, 0, Math.PI * 2);
      gCtx.fillStyle = '#a8ff00';
      gCtx.fill();

      gCtx.fillStyle = '#00f0ff';
      gCtx.font = 'bold 16px "Courier New", monospace';
      gCtx.textAlign = 'center';
      gCtx.textBaseline = 'middle';
      gCtx.fillText(isParked ? 'PARK' : `${Math.round(kmh)}`, cx, cy + 28);
    }

    const keys = { left: false, right: false, up: false, down: false, handbrake: false };
    let lastInputTime = performance.now();
    const AFK_LIMIT_MS = 15000;
    const AFK_WARN_MS = 10000;
    const PARKED_PROMPT_DELAY_MS = 0; // niente timer in corsia di sosta

    let isAfk = false;
    let parkedSinceTime = null;
    let restModalShown = false;

    // Tunnel: no pit-stop under tunnels; if no accel input, cruise at 50 km/h until exit then pit
    const TUNNEL_HALF_LEN = 14.5;
    function isUnderTunnel() {
      for (const tn of tunnels) {
        if (Math.abs(tn.position.z) < TUNNEL_HALF_LEN) return true;
      }
      return false;
    }
    let wasUnderTunnel = false;
    let tunnelAutoCruise = false;

    const kmDisplay = document.getElementById('km-display');
    const telemetryBox = document.getElementById('telemetry');
    const speedometerBr = document.getElementById('speedometer-br');
    const restModal = document.getElementById('rest-modal');
    const modalKmValue = document.getElementById('modal-km-value');
    const btnContinue = document.getElementById('btn-continue');
    const afkWarning = document.getElementById('afk-warning');
    const afkWarningText = document.getElementById('afk-warning-text');

    let spawnGraceUntil = 0;

    function closeRestModal() {
      restModal.classList.remove('visible');
      restModalShown = false;
      parkedSinceTime = null;
      telemetryBox.classList.remove('hidden');
      speedometerBr.classList.remove('hidden');
    }

    function registerActivity() {
      if (isHomeMode) return;
      lastInputTime = performance.now();
      if (afkWarning) afkWarning.classList.remove('visible');
      if (restModalShown) {
        // CONTINUA dal modal → rientro morbido
        isAfk = false;
        parkBayGroup.visible = false;
        closeRestModal();
        softReentryToRoad();
      } else if (isAfk) {
        isAfk = false;
        parkBayGroup.visible = false;
        closeRestModal();
      } else {
        parkBayGroup.visible = false;
      }
    }

    btnContinue.addEventListener('click', () => { registerActivity(); });

    window.addEventListener('keydown', (e) => {
      resumeAudioContext();
      if (e.key === 'Escape' && isHomeMode && isMonitorZoomed) {
        exitMonitorZoomToRoom();
        return;
      }
      if (isHomeMode) {
        if (!isMonitorZoomed) {
          if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = true;
          if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = true;
        }
        return;
      }
      const validKeys = ['a', 'A', 'ArrowLeft', 'd', 'D', 'ArrowRight', 'w', 'W', 'ArrowUp', 's', 'S', 'ArrowDown'];
      if (validKeys.includes(e.key)) registerActivity();
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = true;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = true;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.up = true;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.down = true;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        keys.handbrake = true;
        registerActivity();
      }
    });

    window.addEventListener('keyup', (e) => {
      if (e.key === 'a' || e.key === 'A' || e.key === 'ArrowLeft') keys.left = false;
      if (e.key === 'd' || e.key === 'D' || e.key === 'ArrowRight') keys.right = false;
      if (e.key === 'w' || e.key === 'W' || e.key === 'ArrowUp') keys.up = false;
      if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') keys.down = false;
      if (e.code === 'Space' || e.key === ' ') keys.handbrake = false;
    });

    let targetX = 0;
    const maxLaneX = roadWidth / 2 - 1.5;
    const restAreaTargetX = roadWidth / 2 + 2;

    let currentKmh = 0;
    const maxKmh = 320;
    let totalKm = 0;
    let lastFrameTime = performance.now();
    let smoothDelta = 1 / 60;
    // Anti-lag: smooth più reattivo, clamp più stretto sugli spike, no teletrasporti
    const DELTA_SMOOTH = 0.28;
    const DELTA_MIN = 0.006;
    const DELTA_MAX = 0.036;
    const RAW_DELTA_CAP = 0.055;

    function animate(now) {
      requestAnimationFrame(animate);

      let rawDelta = (now - lastFrameTime) / 1000;
      lastFrameTime = now;
      // Limita spike di frame (tab in background, hitch GPU)
      if (rawDelta > RAW_DELTA_CAP) rawDelta = RAW_DELTA_CAP;
      if (rawDelta < 0) rawDelta = 0;

      // Smooth esponenziale più reattivo → meno "lag gommoso"
      smoothDelta = smoothDelta + (rawDelta - smoothDelta) * DELTA_SMOOTH;
      let deltaTime = smoothDelta;
      if (deltaTime < DELTA_MIN) deltaTime = DELTA_MIN;
      if (deltaTime > DELTA_MAX) deltaTime = DELTA_MAX;

      if (!gameStarted) {
        renderer.render(scene, camera);
        return;
      }

      if (isHomeMode) {
        updateEngineSound(0, true);
        updateBrakeSound(false, 0, false);
        if (afkWarning) afkWarning.classList.remove('visible');
        if (!isMonitorZoomed) {
          // Guardare a sinistra (finestra) / destra con A/D o frecce — senza oscillazione
          const lookSpeed = 1.35 * deltaTime;
          if (keys.left) homeLookYaw = Math.max(HOME_YAW_MIN, homeLookYaw - lookSpeed);
          if (keys.right) homeLookYaw = Math.min(HOME_YAW_MAX, homeLookYaw + lookSpeed);
          applyHomeCameraLook();
        }
        // Equalizer: aggiorna 1 frame su 3 (meno lag in Safehouse)
        if (pcPoweredOn && Radio.radioOn && window._updateAlgoMonitorCanvas) {
          window._eqFrame = (window._eqFrame || 0) + 1;
          if (window._eqFrame % 3 === 0) {
            window._updateAlgoMonitorCanvas();
            if (window._algoTexture) window._algoTexture.needsUpdate = true;
          }
        }
        renderer.render(scene, camera);
        return;
      }

      if (keys.left || keys.right || keys.up || keys.down || keys.handbrake) {
        registerActivity();
      }

      const underTunnel = isUnderTunnel();

      // Sotto i tunnel: nessun pit stop, timer AFK in pausa, niente piazzola
      if (underTunnel) {
        if (afkWarning) afkWarning.classList.remove('visible');
        if (!isAfk) parkBayGroup.visible = false;
        // Metti in pausa il timer AFK: il tempo sotto tunnel non conta per il pit
        if (!isAfk) lastInputTime = now;
      }

      const idleDuration = now - lastInputTime;

      if (!underTunnel) {
        if (!isAfk && idleDuration > AFK_WARN_MS && idleDuration < AFK_LIMIT_MS) {
          const remain = Math.ceil((AFK_LIMIT_MS - idleDuration) / 1000);
          if (afkWarningText) afkWarningText.textContent = `PIT STOP TRA ${remain}s`;
          if (afkWarning) afkWarning.classList.add('visible');
          parkBayGroup.visible = true;
        } else if (!isAfk) {
          if (afkWarning) afkWarning.classList.remove('visible');
          parkBayGroup.visible = false;
        }

        if (idleDuration > AFK_LIMIT_MS && !isAfk) {
          isAfk = true;
          parkedSinceTime = null;
          if (afkWarning) afkWarning.classList.remove('visible');
          parkBayGroup.visible = true;
          stopSignGroup.position.z = -3.8;
          stopSignGroup.visible = true;
        }
      }

      wasUnderTunnel = underTunnel;

      if (isAfk) {
        if (underTunnel) {
          // AFK ma ancora sotto tunnel: resta in carreggiata a 50 km/h, niente piazzola
          const cruiseTarget = 50;
          const approach = 55 * deltaTime;
          if (currentKmh < cruiseTarget - 0.5) currentKmh = Math.min(cruiseTarget, currentKmh + approach);
          else if (currentKmh > cruiseTarget + 0.5) currentKmh = Math.max(cruiseTarget, currentKmh - approach);
          else currentKmh = cruiseTarget;
          targetX = Math.max(-maxLaneX, Math.min(maxLaneX, targetX));
          if (carGroup.position.x > maxLaneX) {
            targetX = Math.min(targetX, maxLaneX - 0.8);
          }
        } else {
          // Fuori tunnel: pit stop normale verso la piazzola
          const afkSteer = 1 - Math.exp(-4.5 * deltaTime);
          targetX += (restAreaTargetX - targetX) * afkSteer;
          const progress = Math.min(1, (320 - currentKmh) / 320);
          const decelRate = 32 + progress * 42;
          currentKmh = Math.max(0, currentKmh - decelRate * deltaTime);

          if (stopSignGroup.visible && stopSignGroup.position.z < -3.8) {
            stopSignGroup.position.z = -3.8;
          }
        }
      } else {
        // Cruise a 50 SOLO se sotto tunnel E nessun input acceleratore (né freno intenzionale prioritario)
        if (underTunnel && !keys.up && !keys.down && !keys.handbrake) {
          const cruiseTarget = 50;
          const approach = 55 * deltaTime;
          if (currentKmh < cruiseTarget - 0.5) currentKmh = Math.min(cruiseTarget, currentKmh + approach);
          else if (currentKmh > cruiseTarget + 0.5) currentKmh = Math.max(cruiseTarget, currentKmh - approach);
          else currentKmh = cruiseTarget;
          // non entrare nella rest area mentre sei sotto il tunnel
          if (targetX > maxLaneX) targetX = maxLaneX;
        } else {
          // Freno / freno a mano hanno priorità sull'acceleratore
          if (keys.down || keys.handbrake) {
            const decelRate = keys.handbrake ? (320 / 2.8) : (320 / 5);
            currentKmh = Math.max(0, currentKmh - decelRate * deltaTime);
          } else if (keys.up) {
            let accelRate = currentKmh < 100 ? (100 / 3.4) : (currentKmh < 200 ? (100 / 6.5) : (120 / 20));
            currentKmh = Math.min(maxKmh, currentKmh + accelRate * deltaTime);
          } else {
            const isInRestLane = Math.abs(carGroup.position.x - restAreaTargetX) < 0.45;
            const friction = isInRestLane ? 45 : 25;
            currentKmh = Math.max(0, currentKmh - friction * deltaTime);
          }
        }

        // frameScale: i valori originali erano "unità per frame" a ~60 Hz
        const frameScaleEarly = deltaTime * 60;
        if (stopSignGroup.visible) {
          const moveSpd = Math.max(0.05, (currentKmh / 50) * 0.36) * frameScaleEarly;
          stopSignGroup.position.z += moveSpd;
          if (stopSignGroup.position.z > 15) stopSignGroup.visible = false;
        }
      }

      const isInRestLane = Math.abs(carGroup.position.x - restAreaTargetX) < 0.45;
      const stopSignAtRest = stopSignGroup.visible && Math.abs(stopSignGroup.position.z - (-3.8)) < 0.05;

      // Hint corsia di sosta
      const pitLaneHint = document.getElementById('pit-lane-hint');
      if (pitLaneHint) {
        const showPitHint = isInRestLane && !restModalShown && !isHomeMode && currentKmh < 80;
        pitLaneHint.classList.toggle('visible', showPitHint);
      }

      if (currentKmh <= 0.05 && isInRestLane && stopSignAtRest) {
        currentKmh = 0;

        if (parkedSinceTime === null) {
          parkedSinceTime = now;
        } else {
          const elapsedParked = now - parkedSinceTime;
          if (elapsedParked >= PARKED_PROMPT_DELAY_MS && !restModalShown) {
            restModalShown = true;
            const runKm = Math.max(0, totalKm);
            if (runKm > lastCareerFlushKm) {
              addCareerKm(runKm - lastCareerFlushKm);
              lastCareerFlushKm = runKm;
            }
            modalKmValue.textContent = `${runKm.toFixed(2)} KM`;
            const isNewBest = saveBestKm(runKm);
            refreshBestLabels(isNewBest);
            telemetryBox.classList.add('hidden');
            speedometerBr.classList.add('hidden');
            restModal.classList.add('visible');
          }
        }
      } else {
        if (!isAfk && currentKmh > 0.05) {
          parkedSinceTime = null;
        }
      }

      // Velocità di scorrimento mondo: indipendente dal framerate (baseline 60 Hz)
      const frameScale = deltaTime * 60;
      const currentSpeed = (currentKmh / 50) * 0.36 * frameScale;
      const kmPerSecond = currentKmh / 3600;
      totalKm += kmPerSecond * deltaTime * 20;

      const safeKm = Math.max(0, totalKm);
      const displayKmh = Math.round(currentKmh);
      kmDisplay.textContent = `${safeKm.toFixed(2)} KM`;
      drawAnalogGauge(currentKmh, isAfk && displayKmh === 0);

      // Accumulo carriera (flush ogni ~0.5 km percorsi)
      if (safeKm - lastCareerFlushKm >= 0.5) {
        addCareerKm(safeKm - lastCareerFlushKm);
        lastCareerFlushKm = safeKm;
      }

      // Stop posteriori + suono frenata
      const wantBrake = (keys.down || keys.handbrake) && currentKmh > 2;
      if (wantBrake !== brakingLightsOn) {
        brakingLightsOn = wantBrake;
        for (let bi = 0; bi < tailBars.length; bi++) {
          tailBars[bi].material = wantBrake ? tailBrakeMat : tailRedMat;
        }
        rearLight.intensity = wantBrake ? 3.4 : 1.5;
        rearLight.color.setHex(wantBrake ? 0xff5a9a : stopRedColor);
      }
      updateBrakeSound(wantBrake, currentKmh, keys.handbrake);

      // FOV dinamico più marcato: ~60 a fermo → ~82 a 320 km/h
      const speedT = Math.min(1, currentKmh / 320);
      const targetFov = 60 + speedT * 22;
      if (Math.abs(camera.fov - targetFov) > 0.08) {
        camera.fov += (targetFov - camera.fov) * Math.min(1, 5 * deltaTime);
        camera.updateProjectionMatrix();
      }

      // Atmosfera ogni ~100 KM: nebbia + cielo + lampioni (densità leggera, tinta evidente)
      const phase = Math.floor(safeKm / 100) % 4;
      if (!window._fogTargetColor) {
        window._fogTargetColor = new THREE.Color(0x0a1028);
        window._bgTargetColor = new THREE.Color(0x070b1a);
        window._fogPhase = -1;
      }
      if (phase !== window._fogPhase) {
        window._fogPhase = phase;
        const fogTargets = [0x0a1028, 0x1a0a30, 0x061a14, 0x1c1208];
        const bgTargets = [0x070b1a, 0x12081e, 0x061210, 0x140e08];
        const lampTargets = [cyanColor, 0xc070ff, 0x70ffb0, 0xffb060];
        window._fogTargetColor.setHex(fogTargets[phase]);
        window._bgTargetColor.setHex(bgTargets[phase]);
        if (cyanBulbMat) cyanBulbMat.color.setHex(lampTargets[phase]);
        if (scene.fog) scene.fog.density = 0.0045;
      }
      if (scene.fog && scene.fog.color) {
        scene.fog.color.lerp(window._fogTargetColor, Math.min(1, 0.55 * deltaTime));
      }
      if (scene.background && scene.background.isColor) {
        scene.background.lerp(window._bgTargetColor, Math.min(1, 0.4 * deltaTime));
      }

      updateEngineSound(currentKmh, isHomeMode || isAfk);

      if (safeKm >= nextCheckpointKm) {
        showCheckpoint(nextCheckpointKm);
        nextCheckpointKm += 100;
      }

      const controlsHint = document.getElementById('controls-hint');
      if (controlsHint) {
        controlsHint.style.opacity = (currentKmh < 0.5) ? '1' : '0';
      }

      const trafficWorldSpeed = (80 / 50) * 0.36 * frameScale;
      const totalSpan = 6 * spacingZ;
      const collRangeZ = 8;

      for (let ti = 0; ti < trafficCars.length; ti++) {
        const t = trafficCars[ti];
        const mz = t.mesh.position.z;
        const halfLen = t.halfLen || 2.3;
        const halfWidth = t.halfWidth || 1.1;

        if (t.isIncoming) {
          t.mesh.position.z = mz + (currentSpeed + trafficWorldSpeed);
          if (t.mesh.position.z > 20) t.mesh.position.z -= totalSpan;
        } else {
          t.mesh.position.z = mz + (currentSpeed - trafficWorldSpeed);
          if (t.mesh.position.z > 20) t.mesh.position.z -= totalSpan;
          else if (t.mesh.position.z < -totalSpan - 50) t.mesh.position.z += totalSpan;
        }

        const dz = -t.mesh.position.z;
        if (dz > collRangeZ || dz < -collRangeZ) continue;

        const dx = carGroup.position.x - t.mesh.position.x;
        const absDx = dx < 0 ? -dx : dx;
        const absDz = dz < 0 ? -dz : dz;

        if (absDx < halfWidth + 1.05 && absDz < halfLen + 2.15) {
          const inGrace = now < spawnGraceUntil;
          if (inGrace) {
            // Durante il grace period sposta solo il traffico, senza frenate brutali
            if (t.isIncoming) t.mesh.position.z -= (halfLen + 2.15 - absDz + 1.5);
            else if (dz > 0) t.mesh.position.z -= (halfLen + 2.15 - absDz + 1.2);
            else t.mesh.position.z += (halfLen + 2.15 - absDz + 1.2);
            continue;
          }
          // Feedback collisione
          if (shakeTime <= 0) {
            shakeTime = 0.22;
            shakeAmp = 0.18;
            playCollisionTick();
          }
          if (t.isIncoming) {
            t.mesh.position.z -= (halfLen + 2.15 - absDz + 0.3);
            currentKmh = Math.max(0, currentKmh - 160 * deltaTime);
          } else if (dz > 0) {
            const overlap = halfLen + 2.15 - absDz;
            t.mesh.position.z -= (overlap + 0.2);
            currentKmh = Math.max(0, currentKmh - (90 + overlap * 35) * deltaTime);
            if (currentKmh > 35) currentKmh = 35;
          } else {
            t.mesh.position.z += (halfLen + 2.15 - absDz + 0.2);
          }
        }
      }

      const tunnelLoop = tunnelCount * tunnelSpacing;
      for (const tn of tunnels) {
        tn.position.z += currentSpeed;
        if (tn.position.z > 40) tn.position.z -= tunnelLoop;
      }

      const distanceToTarget = nextTargetKm - safeKm;
      if (distanceToTarget <= 2.5 && distanceToTarget > 0) {
        const progress = 1 - (distanceToTarget / 2.5);
        gantryGroup.position.z = -140 + (progress * 155);
      } else if (distanceToTarget <= 0) {
        nextTargetKm += 100;
        updateBoardTexture(nextTargetKm);
        gantryGroup.position.z = -500;
      } else {
        gantryGroup.position.z = -500;
      }

      // Sterzo più morbido: meno sensibile, roll ridotto
      const steerSpeed = 9.5 * deltaTime;
      if (!isAfk && currentSpeed > 0.005) {
        if (keys.left) targetX = Math.max(targetX - steerSpeed, -maxLaneX);
        if (keys.right) targetX = Math.min(targetX + steerSpeed, maxLaneX);
      }

      const prevX = carGroup.position.x;
      const posLerp = 1 - Math.exp(-7.5 * deltaTime);
      carGroup.position.x += (targetX - carGroup.position.x) * posLerp;

      const deltaX = carGroup.position.x - prevX;
      carGroup.rotation.z = -deltaX * 0.28;
      carGroup.rotation.y = -deltaX * 0.14;

      for (const wheel of wheels) {
        wheel.rotation.x -= currentSpeed * 0.8;
      }

      const camLerp = 1 - Math.exp(-5 * deltaTime);
      const camTargetX = carGroup.position.x * 0.45;
      camera.position.x += (camTargetX - camera.position.x) * camLerp;

      // Shake collisione (decadimento temporale, indipendente dal FPS)
      if (shakeTime > 0) {
        shakeTime = Math.max(0, shakeTime - deltaTime);
        const falloff = shakeTime / 0.22;
        camera.position.x += (Math.random() - 0.5) * shakeAmp * falloff;
        camera.position.y = 3.2 + (Math.random() - 0.5) * shakeAmp * falloff * 0.6;
      } else {
        camera.position.y += (3.2 - camera.position.y) * Math.min(1, 8 * deltaTime);
      }

      horizonSkyline.position.x = camera.position.x * 0.85;

      const maxZ = 20;

      for (const stripe of stripes) {
        stripe.position.z += currentSpeed;
        if (stripe.position.z > maxZ) stripe.position.z -= stripeCount * stripeSpacing;
      }

      for (const post of posts) {
        post.position.z += currentSpeed;
        if (post.position.z > maxZ) post.position.z -= postCount * postSpacing;
      }

      for (const lamp of lamps) {
        lamp.position.z += currentSpeed;
        if (lamp.position.z > maxZ) lamp.position.z -= lampCount * lampSpacing;
      }

      const skylineLoopDepth = (skylineCount / 2) * skylineSpacing;
      for (const building of skylineBuildings) {
        building.position.z += currentSpeed;
        if (building.position.z > maxZ) building.position.z -= skylineLoopDepth;
      }

      renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    animate(performance.now());
  