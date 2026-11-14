import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS3DRenderer, CSS3DObject } from "three/addons/renderers/CSS3DRenderer.js";
import { t } from "./i18n.js";

// Design tokens mirrored from CSS variables (--kaamos, --horizon, --snow, --birch, --lichen, --lingon, --frost)
export const COLORS = {
  kaamos: "#101C33",
  horizon: "#1C2E4D",
  snow: "#EEF2F6",   // Finnish (fi)
  birch: "#D9B872",  // Swedish (sv) & saved constellation path
  lichen: "#8FC3B7", // English (en) & semantic threads
  lingon: "#D43F55", // Edit war only
  frost: "#8A9BB3",  // Secondary text & ghost threads
  border: "#2A3B5C",
};

function hexToRgbArray(hex) {
  const clean = hex.replace("#", "");
  const num = parseInt(clean, 16);
  return [
    ((num >> 16) & 255) / 255,
    ((num >> 8) & 255) / 255,
    (num & 255) / 255,
  ];
}

const LANG_RGB = {
  fi: hexToRgbArray(COLORS.snow),
  sv: hexToRgbArray(COLORS.birch),
  en: hexToRgbArray(COLORS.lichen),
};

const LINGON_RGB = hexToRgbArray(COLORS.lingon);

const LANE_X = {
  fi: -1.65,
  sv: 0.0,
  en: 1.65,
};

const VERTEX_SHADER = /* glsl */ `
  uniform float uYear;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uReducedMotion;
  uniform float uHasSearch;
  uniform float uMorphT;
  uniform float uRoadModeMix;
  uniform float uSummaryModeMix;
  uniform float uIgnoreYearSlider;
  uniform vec3 uLingonColor;

  attribute vec3 aPosTo;
  attribute vec3 aColor;
  attribute float aSize;
  attribute float firstEditYear;
  attribute float aHasHistory;
  attribute float aSubYear;
  attribute float aIsEditWar;
  attribute float aHighlight;
  attribute float aRoadMember;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vIsEditWar;
  varying float vHighlight;
  varying float vPulse;

  void main() {
    vec3 morphedPos = mix(position, aPosTo, uMorphT);
    vec4 mvPosition = modelViewMatrix * vec4(morphedPos, 1.0);
    float dist = max(-mvPosition.z, 1.5);

    float pulse = 0.5 + 0.5 * sin(uTime * 3.2 + aPhase);
    vPulse = pulse;
    vIsEditWar = aIsEditWar;
    vHighlight = aHighlight;

    float vis = 1.0;
    float pointSize = aSize * (285.0 / dist) * uPixelRatio;

    // Every star is born in its article creation year (spec 023); history stars keep the flare + larger size.
    float birth = firstEditYear - 0.80 + aSubYear * 0.78;
    float yearVis = smoothstep(birth - 0.28, birth + 0.02, uYear);
    float born = mix(yearVis, 1.0, uIgnoreYearSlider);

    if (born <= 0.001 && aHighlight < 0.5 && aRoadMember < 0.5) {
      gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
      gl_PointSize = 0.0;
      vAlpha = 0.0;
      return;
    }

    if (aHasHistory > 0.5) {
      vis = born;
      pointSize = max(pointSize * 1.95, 6.2 * uPixelRatio);

      if (uReducedMotion < 0.5 && uIgnoreYearSlider < 0.5) {
        float age = uYear - birth;
        float flare = (1.0 - smoothstep(0.0, 0.65, age)) * step(0.0, age);
        pointSize *= (1.0 + flare * 0.85);
      }
    } else {
      vis = 0.42 * born;
      pointSize *= 0.88;
    }

    vColor = mix(aColor, uLingonColor, step(0.5, aIsEditWar));

    if (aIsEditWar > 0.5 && vis > 0.05) {
      if (uReducedMotion < 0.5) {
        pointSize = max(pointSize * (1.45 + 0.48 * pulse), (8.5 + 3.5 * pulse) * uPixelRatio);
      } else {
        pointSize = max(pointSize * 1.75, 10.5 * uPixelRatio);
      }
    }

    if (aHighlight > 1.8) {
      pointSize = max(pointSize * 2.1, 18.0 * uPixelRatio);
      vis = 1.0;
    } else if (aHighlight > 0.5) {
      pointSize = max(pointSize * 1.75, 13.5 * uPixelRatio);
      vis = 1.0;
    }

    float searchDim = (uHasSearch > 0.5 && aHighlight < 0.5) ? 0.28 : 1.0;
    float alphaBase = vis * searchDim;

    // In Talvitie road mode, non-topic stars dim to 15% and clamp size so nearby sky stars never blow up into foreground orbs
    if (uRoadModeMix > 0.001) {
      float roadNearFade = smoothstep(8.5, 11.8, -mvPosition.z);
      if (aRoadMember > 0.5) {
        vAlpha = mix(alphaBase, roadNearFade, uRoadModeMix);
        if (aRoadMember > 1.5) {
          // Direct event/article marker stars on the road posts
          pointSize = mix(pointSize, max(pointSize * 1.85, 14.0 * uPixelRatio), uRoadModeMix);
        }
      } else {
        float nearCull = smoothstep(10.0, 26.0, dist);
        vAlpha = mix(alphaBase, 0.15 * nearCull, uRoadModeMix);
        pointSize = mix(pointSize, min(pointSize, 4.2 * uPixelRatio), uRoadModeMix);
      }
    } else {
      vAlpha = alphaBase;
    }

    if (uSummaryModeMix > 0.001) {
      float summaryTargetAlpha = (aHighlight > 1.8) ? 1.0 : 0.15;
      vAlpha = mix(vAlpha, summaryTargetAlpha, uSummaryModeMix);
    }

    gl_PointSize = clamp(pointSize, 1.75 * uPixelRatio, 46.0 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uReducedMotion;
  uniform vec3 uLingonColor;

  varying vec3 vColor;
  varying float vAlpha;
  varying float vIsEditWar;
  varying float vHighlight;
  varying float vPulse;

  void main() {
    if (vAlpha <= 0.001) discard;

    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered);
    if (d > 0.5) discard;

    vec3 outColor = vColor;
    float alpha = 0.0;

    if (vIsEditWar > 0.5) {
      outColor = uLingonColor;
      if (uReducedMotion > 0.5) {
        float core = smoothstep(0.22, 0.08, d);
        float ring = smoothstep(0.49, 0.43, d) * smoothstep(0.32, 0.38, d);
        alpha = max(core, ring * 0.95);
      } else {
        float core = smoothstep(0.24, 0.04, d);
        float halo = smoothstep(0.5, 0.12, d) * (0.42 + 0.38 * vPulse);
        alpha = clamp(core + halo, 0.0, 1.0);
      }
    } else {
      float core = smoothstep(0.24, 0.04, d);
      float glow = pow(max(0.0, 1.0 - d * 2.0), 2.4) * 0.55;
      alpha = clamp(core + glow, 0.0, 1.0);
    }

    if (vHighlight > 0.5) {
      float selRing = smoothstep(0.49, 0.44, d) * smoothstep(0.35, 0.40, d);
      alpha = max(alpha, selRing * 0.95);
    }

    gl_FragColor = vec4(outColor, alpha * vAlpha);
  }
`;

// Subtle reflective polar ice shader for the Talvitie winter road strip
const ICE_ROAD_VERTEX = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vWorldPos;
  void main() {
    vUv = uv;
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWorldPos = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const ICE_ROAD_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying vec2 vUv;
  varying vec3 vWorldPos;

  void main() {
    // Edge feathering across road width (x in [-4.5, +4.5])
    float edgeDist = abs(vUv.x - 0.5) * 2.0;
    float edgeAlpha = 1.0 - smoothstep(0.84, 1.0, edgeDist);

    // Subtle longitudinal polar ice sheen & delicate frost rim along the road edges
    float centerSheen = pow(max(0.0, 1.0 - edgeDist * 0.9), 2.2) * 0.45;
    float edgeFrost = smoothstep(0.76, 0.85, edgeDist) * (1.0 - smoothstep(0.85, 0.92, edgeDist)) * 0.28;
    float zWave = 0.5 + 0.5 * cos(vWorldPos.z * 0.25);

    vec3 deepIce = vec3(0.075, 0.130, 0.235); // #13213C
    vec3 liftIce = vec3(0.118, 0.192, 0.325); // #1E3153
    vec3 reflectionTint = vec3(0.933, 0.949, 0.965); // --snow glint

    vec3 col = mix(deepIce, liftIce, centerSheen + zWave * 0.18);
    col += reflectionTint * edgeFrost;

    gl_FragColor = vec4(col, edgeAlpha * 0.88 * uOpacity);
  }
`;

// Sleek luminous star-to-causeway unroll particle trail shader along the Talvitie winter road
const ROAD_TRAIL_VERTEX = /* glsl */ `
  uniform float uUnroll;
  uniform float uTime;
  uniform float uPixelRatio;
  uniform float uReducedMotion;

  attribute vec3 aOrigin;
  attribute vec3 aColor;
  attribute float aProgress;
  attribute float aSize;
  attribute float aPhase;

  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    float localT = uReducedMotion > 0.5
      ? 1.0
      : clamp((uUnroll - aProgress * 0.44) / 0.56, 0.0, 1.0);
    float smoothT = localT * localT * (3.0 - 2.0 * localT);

    vec3 pos = mix(aOrigin, position, smoothT);
    // Gentle arc lift while unrolling from the article's sky star into the polar causeway
    pos.y += sin(smoothT * 3.14159265) * 2.4 * (1.0 - uReducedMotion);

    if (uReducedMotion < 0.5 && smoothT > 0.98) {
      pos.y += sin(uTime * 1.8 + aPhase) * 0.035;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    float camDepth = max(-mvPosition.z, 0.5);
    float dist = max(camDepth, 1.5);
    gl_PointSize = clamp(aSize * (210.0 / dist) * uPixelRatio, 1.5 * uPixelRatio, 5.5 * uPixelRatio);
    gl_Position = projectionMatrix * mvPosition;

    vColor = aColor;
    float nearTrailFade = smoothstep(9.5, 15.0, camDepth);
    float shimmer = uReducedMotion < 0.5 ? (0.72 + 0.28 * sin(uTime * 2.4 + aPhase)) : 0.88;
    vAlpha = smoothT * shimmer * 0.78 * nearTrailFade;
  }
`;

const ROAD_TRAIL_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;

  void main() {
    if (vAlpha <= 0.001) discard;
    vec2 centered = gl_PointCoord - vec2(0.5);
    float d = length(centered);
    if (d > 0.5) discard;
    float core = smoothstep(0.26, 0.03, d);
    float halo = pow(max(0.0, 1.0 - d * 2.0), 2.2) * 0.52;
    gl_FragColor = vec4(vColor, clamp(core + halo, 0.0, 1.0) * vAlpha);
  }
`;

function formatStationYears(station) {
  if (!Array.isArray(station?.years) || station.years.length === 0) {
    return null;
  }
  if (station.years.length === 1) {
    return String(station.years[0]);
  }
  const first = station.years[0];
  const last = station.years[station.years.length - 1];
  return first === last ? String(first) : `${first}–${last}`;
}

// Deterministic edit-war years for the 50 has_history Finnish articles
function getEditWarYearsForStar(star) {
  if (!star.has_history) return [];
  if (star.page_id === 1256) return [2006, 2007, 2008, 2014, 2018, 2022];
  if (star.page_id === 1150) return [2006, 2007, 2008, 2014, 2018];
  if (star.page_id === 52097) return [2007, 2014, 2018];
  if (star.page_id === 440) return [2006, 2008, 2014, 2018];
  const years = [2007];
  if (star.page_id % 2 === 0) years.push(2006, 2014);
  if (star.page_id % 3 === 0) years.push(2008, 2018);
  return years.filter((y) => y >= (star.first_edit_year || 2004));
}

// Convert historical year (1150..2026) to non-linear spiral progress [0..1]
function yearToSpiralProgress(year) {
  const y = Math.max(1150, Math.min(2026, year || 1900));
  if (y <= 1808) {
    return ((y - 1150) / (1808 - 1150)) * 0.22;
  }
  if (y <= 1916) {
    return 0.22 + ((y - 1808) / (1916 - 1808)) * 0.28;
  }
  if (y <= 1945) {
    return 0.50 + ((y - 1916) / (1945 - 1916)) * 0.28;
  }
  return 0.78 + ((y - 1945) / (2026 - 1945)) * 0.22;
}

function spiralProgressToPoint(u, radialOffset = 0, yOffset = 0) {
  const turns = 5.5;
  const angle = u * turns * Math.PI * 2.0;
  const radius = 10.5 + u * 15.5 + radialOffset;
  const x = Math.cos(angle) * radius;
  const y = -17.5 + u * 35.0 + yOffset;
  const z = Math.sin(angle) * radius;
  return [x, y, z];
}

// Convert Finland lat/lon to 3D Geography map position
function latLonToGeoPoint(lat, lon, zOffset = 0) {
  const gx = (lon - 25.3) * 2.25 + 6.5;
  const gy = (lat - 64.6) * 3.65;
  const gz = (64.6 - lat) * 0.65 + zOffset;
  return [gx, gy, gz];
}

// Simplified recognizable outline of Finland (including historical Karelian Isthmus)
const FINLAND_BORDER_LATLON = [
  [59.82, 22.96], // Hanko
  [60.45, 22.26], // Turku
  [61.48, 21.79], // Pori
  [63.09, 21.61], // Vaasa
  [63.84, 23.13], // Kokkola
  [65.01, 25.47], // Oulu
  [65.85, 24.15], // Tornio
  [67.98, 23.68], // Muonio
  [69.05, 20.80], // Kilpisjärvi
  [68.80, 22.25], // Enontekiö
  [69.90, 27.02], // Utsjoki
  [69.05, 28.92], // Inari / Petsamo corridor
  [67.70, 29.95], // Salla
  [65.80, 30.10], // Kuusamo
  [64.88, 29.50], // Suomussalmi / Raate
  [63.20, 31.00], // Ilomantsi
  [61.70, 30.69], // Sortavala / Ladoga
  [60.50, 29.50], // Karelian Isthmus
  [60.71, 28.75], // Viipuri
  [60.46, 26.94], // Kotka
  [60.17, 24.94], // Helsinki
  [59.82, 22.96], // Back to Hanko
];

export const SKY_CLUSTER_ROADS = [
  {
    id: "talvisota",
    label: "Talvisota",
    sublabel: t("scene.talvitieSublabel"),
    pos: [13.5, 18.8, 11.4],
    query: { lang: "fi", page_id: 1256, mode: "topic" },
  },
  {
    id: "sisallissota",
    idPage: 1150,
    label: "Suomen sisällissota",
    sublabel: t("scene.talvitieSublabel"),
    pos: [-9.4, 18.4, 8.6],
    query: { lang: "fi", page_id: 1150, mode: "topic" },
  },
  {
    id: "autonomia",
    label: "Suomen suuriruhtinaskunta",
    sublabel: t("scene.talvitieSublabel"),
    pos: [-22.0, -3.2, 16.0],
    query: { category: "Suomen suuriruhtinaskunta", mode: "topic" },
  },
];

export function createGalaxyScene({
  canvas,
  stars,
  reducedMotion = false,
  onHoverStar,
  onSelectStar,
  onFrameLabelsUpdate,
  onRoadIndexChange,
  onSummaryFocusScreenUpdate,
}) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "high-performance",
  });
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(0x000000, 0);

  const scene = new THREE.Scene();

  const camera = new THREE.PerspectiveCamera(
    50,
    window.innerWidth / window.innerHeight,
    0.5,
    450
  );
  camera.position.set(0, 6, 62);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.065;
  controls.autoRotate = false;
  controls.minDistance = 3;
  controls.maxDistance = 165;
  controls.target.set(0, 0, 0);

  const count = stars.length;
  const starByKey = new Map();
  const starsByWikidata = new Map();
  const editWarYearsByIndex = new Array(count);
  const isUnlocatedStar = new Uint8Array(count);
  let isPortraitGeo = typeof window !== "undefined" && window.innerWidth < window.innerHeight;

  function getUnlocatedLayout(isPortrait) {
    // On portrait viewports, tuck the unlocated nebula closer to Finland's west coast
    // (clear of the outline) so the map keeps ~96% of safe height and core south cities don't collide.
    return isPortrait
      ? { cx: -10.0, cy: -3.5, rStars: 4.1, rCircle: 4.8, labelY: -9.4 }
      : { cx: -24.5, cy: -3.5, rStars: 5.4, rCircle: 6.2, labelY: -10.8 };
  }

  function computeUnlocatedStarPoint(i, layout) {
    const theta = (i * 2.39996) % (Math.PI * 2);
    const phi = Math.acos(1 - 2 * ((i % 997) / 997));
    const rUnloc = layout.rStars * Math.cbrt(((i * 31) % 500) / 500);
    return [
      layout.cx + rUnloc * Math.sin(phi) * Math.cos(theta),
      layout.cy + rUnloc * Math.sin(phi) * Math.sin(theta),
      rUnloc * Math.cos(phi),
    ];
  }

  // Precompute the 3 lens position buffers (meaning, history spiral, geography map) + road buffer
  const posMeaning = new Float32Array(count * 3);
  const posHistory = new Float32Array(count * 3);
  const posGeography = new Float32Array(count * 3);
  const posRoad = new Float32Array(count * 3);

  const positions = new Float32Array(count * 3); // aPosFrom (and CPU raycast attribute)
  const posTo = new Float32Array(count * 3);     // aPosTo
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const firstEditYears = new Float32Array(count);
  const hasHistoryArr = new Float32Array(count);
  const subYears = new Float32Array(count);
  const isEditWar = new Float32Array(count);
  const highlights = new Float32Array(count);
  const roadMembers = new Float32Array(count);
  const phases = new Float32Array(count);

  for (let i = 0; i < count; i++) {
    const s = stars[i];
    s._index = i;
    starByKey.set(`${s.lang}:${s.page_id}`, s);
    if (s.wikidata_id) {
      if (!starsByWikidata.has(s.wikidata_id)) starsByWikidata.set(s.wikidata_id, []);
      starsByWikidata.get(s.wikidata_id).push(s);
    }

    const i3 = i * 3;
    // 1. Meaning (UMAP)
    posMeaning[i3] = s.x;
    posMeaning[i3 + 1] = s.y;
    posMeaning[i3 + 2] = s.z;

    positions[i3] = s.x;
    positions[i3 + 1] = s.y;
    positions[i3 + 2] = s.z;
    posTo[i3] = s.x;
    posTo[i3 + 1] = s.y;
    posTo[i3 + 2] = s.z;

    // 2. History (3D Spiral from 12th century to 2026)
    const h1 = Math.sin(i * 12.9898) * 43758.5453;
    const h2 = Math.cos(i * 78.233) * 19341.731;
    const frac1 = h1 - Math.floor(h1) - 0.5;
    const frac2 = h2 - Math.floor(h2) - 0.5;

    const uHist = yearToSpiralProgress(s.event_year || 1900);
    const [hx, hy, hz] = spiralProgressToPoint(
      Math.max(0, Math.min(1, uHist + frac1 * 0.012)),
      frac1 * 2.8,
      frac2 * 1.6
    );
    posHistory[i3] = hx;
    posHistory[i3 + 1] = hy;
    posHistory[i3 + 2] = hz;

    // 3. Geography (Map of Finland + Unlocated articles nebula)
    // Finland map box incl. ceded Karelia; coords outside it (abroad) go to the unlocated cluster.
    if (s.lat != null && s.lon != null && s.lat >= 59.5 && s.lat <= 70.5 && s.lon >= 19 && s.lon <= 33.5) {
      const [gx, gy, gz] = latLonToGeoPoint(s.lat, s.lon, frac2 * 0.7);
      posGeography[i3] = gx;
      posGeography[i3 + 1] = gy;
      posGeography[i3 + 2] = gz;
    } else {
      // Unlocated articles gather into a compact spherical cluster on the left
      isUnlocatedStar[i] = 1;
      const [ux, uy, uz] = computeUnlocatedStarPoint(i, getUnlocatedLayout(isPortraitGeo));
      posGeography[i3] = ux;
      posGeography[i3 + 1] = uy;
      posGeography[i3 + 2] = uz;
    }

    const rgb = LANG_RGB[s.lang] || LANG_RGB.fi;
    colors[i3] = rgb[0];
    colors[i3 + 1] = rgb[1];
    colors[i3 + 2] = rgb[2];

    const lenFactor = Math.max(0.0, Math.min(1.0, (Math.log10(Math.max(12, s.length)) - 2.0) / 3.0));
    sizes[i] = 0.40 + Math.pow(lenFactor, 1.6) * 1.65;

    hasHistoryArr[i] = s.has_history && s.first_edit_year !== null ? 1.0 : 0.0;
    firstEditYears[i] = s.created_year ?? s.first_edit_year ?? 2001;
    subYears[i] = ((i * 2654435761) >>> 0) / 4294967296;
    phases[i] = (i % 628) * 0.01;
    editWarYearsByIndex[i] = getEditWarYearsForStar(s);
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttr = new THREE.BufferAttribute(positions, 3);
  const posToAttr = new THREE.BufferAttribute(posTo, 3);
  const editWarAttr = new THREE.BufferAttribute(isEditWar, 1);
  const highlightAttr = new THREE.BufferAttribute(highlights, 1);
  const roadMemberAttr = new THREE.BufferAttribute(roadMembers, 1);

  geometry.setAttribute("position", positionAttr);
  geometry.setAttribute("aPosTo", posToAttr);
  geometry.setAttribute("aColor", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("aSize", new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute("firstEditYear", new THREE.BufferAttribute(firstEditYears, 1));
  geometry.setAttribute("aHasHistory", new THREE.BufferAttribute(hasHistoryArr, 1));
  geometry.setAttribute("aSubYear", new THREE.BufferAttribute(subYears, 1));
  geometry.setAttribute("aIsEditWar", editWarAttr);
  geometry.setAttribute("aHighlight", highlightAttr);
  geometry.setAttribute("aRoadMember", roadMemberAttr);
  geometry.setAttribute("aPhase", new THREE.BufferAttribute(phases, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uYear: { value: reducedMotion ? 2026.0 : 2001.0 },
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uReducedMotion: { value: reducedMotion ? 1.0 : 0.0 },
      uHasSearch: { value: 0.0 },
      uMorphT: { value: 0.0 },
      uRoadModeMix: { value: 0.0 },
      uSummaryModeMix: { value: 0.0 },
      uIgnoreYearSlider: { value: 0.0 },
      uLingonColor: { value: new THREE.Vector3(...LINGON_RGB) },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    depthTest: true,
  });

  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);

  // Groups for 3D Memory Threads, Birch Constellation Path, Lens Guides & Talvitie Winter Road
  const threadsGroup = new THREE.Group();
  const constellationGroup = new THREE.Group();
  const historyGuideGroup = new THREE.Group();
  const geographyGuideGroup = new THREE.Group();
  const roadGroup = new THREE.Group();
  const summaryTrailGroup = new THREE.Group();
  summaryTrailGroup.visible = false;

  const css3dLayer = typeof document !== "undefined" ? document.getElementById("summary-css3d-layer") : null;
  const css3dRenderer = css3dLayer ? new CSS3DRenderer({ element: css3dLayer }) : null;
  if (css3dRenderer) {
    css3dRenderer.setSize(window.innerWidth, window.innerHeight);
  }
  const css3dScene = new THREE.Scene();

  historyGuideGroup.visible = false;
  geographyGuideGroup.visible = false;
  roadGroup.visible = false;

  scene.add(threadsGroup);
  scene.add(constellationGroup);
  scene.add(historyGuideGroup);
  scene.add(geographyGuideGroup);
  scene.add(roadGroup);
  scene.add(summaryTrailGroup);

  // Build 3D History Spiral Guide Line
  const spiralPts = [];
  for (let k = 0; k <= 220; k++) {
    const u = k / 220;
    const [sx, sy, sz] = spiralProgressToPoint(u, 0, 0);
    spiralPts.push(new THREE.Vector3(sx, sy, sz));
  }
  const spiralLineGeo = new THREE.BufferGeometry().setFromPoints(spiralPts);
  const spiralLineMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(COLORS.border),
    transparent: true,
    opacity: 0.65,
  });
  historyGuideGroup.add(new THREE.Line(spiralLineGeo, spiralLineMat));

  const HISTORY_GUIDE_ANCHORS = [
    { label: t("scene.era1155"), year: 1155 },
    { label: t("scene.era1596"), year: 1596 },
    { label: t("scene.era1809"), year: 1809 },
    { label: t("scene.era1905"), year: 1905 },
    { label: t("scene.era1918"), year: 1918 },
    { label: t("scene.era1939"), year: 1939 },
    { label: t("scene.era1948"), year: 1948 },
    { label: t("scene.era1995"), year: 1995 },
  ].map((item) => {
    const u = yearToSpiralProgress(item.year);
    const [x, y, z] = spiralProgressToPoint(u, 1.2, 0.4);
    return { label: item.label, pos: new THREE.Vector3(x, y, z) };
  });

  // Build 3D Geography Map Outline of Finland + Unlocated circle
  const borderPts = FINLAND_BORDER_LATLON.map(([lat, lon]) => {
    const [gx, gy, gz] = latLonToGeoPoint(lat, lon, -0.2);
    return new THREE.Vector3(gx, gy, gz);
  });
  const borderGeo = new THREE.BufferGeometry().setFromPoints(borderPts);
  const borderMat = new THREE.LineBasicMaterial({
    color: new THREE.Color(COLORS.frost),
    transparent: true,
    opacity: 0.45,
  });
  geographyGuideGroup.add(new THREE.Line(borderGeo, borderMat));

  const initUnlocLayout = getUnlocatedLayout(isPortraitGeo);
  const unlocCirclePts = [];
  for (let a = 0; a <= 48; a++) {
    const ang = (a / 48) * Math.PI * 2;
    unlocCirclePts.push(
      new THREE.Vector3(
        initUnlocLayout.cx + Math.cos(ang) * initUnlocLayout.rCircle,
        initUnlocLayout.cy + Math.sin(ang) * initUnlocLayout.rCircle,
        0
      )
    );
  }
  const unlocGeo = new THREE.BufferGeometry().setFromPoints(unlocCirclePts);
  const unlocMat = new THREE.LineDashedMaterial({
    color: new THREE.Color(COLORS.border),
    dashSize: 0.7,
    gapSize: 0.5,
    transparent: true,
    opacity: 0.65,
  });
  const unlocLine = new THREE.Line(unlocGeo, unlocMat);
  unlocLine.computeLineDistances();
  geographyGuideGroup.add(unlocLine);

  const GEO_GUIDE_ANCHORS = [
    { label: "Helsinki", lat: 60.17, lon: 24.94 },
    { label: "Turku", lat: 60.45, lon: 22.27 },
    { label: "Tampere", lat: 61.50, lon: 23.76 },
    { label: "Viipuri", lat: 60.71, lon: 28.75 },
    { label: "Vaasa", lat: 63.10, lon: 21.62 },
    { label: "Oulu", lat: 65.01, lon: 25.47 },
    { label: "Suomussalmi", lat: 64.88, lon: 29.05 },
    { label: "Rovaniemi", lat: 66.50, lon: 25.73 },
  ].map((item) => {
    const [gx, gy, gz] = latLonToGeoPoint(item.lat, item.lon, 0.4);
    return { label: item.label, pos: new THREE.Vector3(gx, gy, gz) };
  });
  const unlocatedGuideAnchor = {
    label: t("scene.unlocated"),
    pos: new THREE.Vector3(initUnlocLayout.cx, initUnlocLayout.labelY, 0),
  };
  GEO_GUIDE_ANCHORS.push(unlocatedGuideAnchor);

  const geoFramingBorderPts = FINLAND_BORDER_LATLON.flatMap(([lat, lon]) => {
    const [x1, y1, z1] = latLonToGeoPoint(lat, lon, -0.2);
    const [x2, y2, z2] = latLonToGeoPoint(lat, lon, 0.4);
    return [new THREE.Vector3(x1, y1, z1), new THREE.Vector3(x2, y2, z2)];
  });

  const UI_EXCLUSION_IDS = ["sky-top-bar", "timeslider-root", "article-panel", "lens-switcher", "lang-switcher"];
  let cachedExclusionRects = [];
  let cachedSafeArea = null;

  function rectsIntersect(a, b, pad = 0) {
    return !(
      a.right + pad <= b.left ||
      a.left - pad >= b.right ||
      a.bottom + pad <= b.top ||
      a.top - pad >= b.bottom
    );
  }

  function refreshUiMetrics() {
    if (typeof document === "undefined" || typeof window === "undefined") return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const nextRects = [];
    for (const id of UI_EXCLUSION_IDS) {
      const el = document.getElementById(id);
      if (!el || el.hidden) continue;
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      nextRects.push({ left: r.left, right: r.right, top: r.top, bottom: r.bottom });
    }
    cachedExclusionRects = nextRects;

    const margin = 8;
    const headerEl = document.getElementById("sky-top-bar");
    const sliderEl = document.getElementById("timeslider-root");
    const headerRect = headerEl && !headerEl.hidden ? headerEl.getBoundingClientRect() : null;
    const sliderRect = sliderEl && !sliderEl.hidden ? sliderEl.getBoundingClientRect() : null;
    const safeTop = (headerRect && headerRect.height > 0 ? headerRect.bottom : 0) + margin;
    // Spec 033: in portrait the legend sits right above the slider; keep the map above it too.
    const legendEl = document.getElementById("sky-legend");
    const legendRect = isPortraitGeo && legendEl && !legendEl.hidden ? legendEl.getBoundingClientRect() : null;
    const bottomEdge = Math.min(
      sliderRect && sliderRect.height > 0 ? sliderRect.top : h,
      legendRect && legendRect.height > 0 ? legendRect.top : h
    );
    const safeBottom = bottomEdge - margin;
    const safeLeft = margin;
    const safeRight = w - margin;
    cachedSafeArea = {
      left: safeLeft,
      right: Math.max(safeLeft + 40, safeRight),
      top: safeTop,
      bottom: Math.max(safeTop + 40, safeBottom),
    };

    if (document.body) {
      const probe = document.createElement("div");
      probe.style.cssText =
        "position:fixed;left:-9999px;top:-9999px;visibility:hidden;pointer-events:none;";
      const allAnchors = [...HISTORY_GUIDE_ANCHORS, ...GEO_GUIDE_ANCHORS];
      const spans = allAnchors.map((anc) => {
        const span = document.createElement("span");
        span.className = "projected-lens-guide";
        span.textContent = anc.label;
        probe.appendChild(span);
        return { anc, span };
      });
      document.body.appendChild(probe);
      for (const { anc, span } of spans) {
        const r = span.getBoundingClientRect();
        anc.boxW = r.width;
        anc.boxH = r.height;
      }
      probe.remove();
    }
  }

  function applyUnlocatedLayout(nextIsPortrait, syncActiveBuffers = false) {
    if (nextIsPortrait === isPortraitGeo) return;
    isPortraitGeo = nextIsPortrait;
    const layout = getUnlocatedLayout(isPortraitGeo);
    for (let i = 0; i < count; i++) {
      if (!isUnlocatedStar[i]) continue;
      const i3 = i * 3;
      const [ux, uy, uz] = computeUnlocatedStarPoint(i, layout);
      posGeography[i3] = ux;
      posGeography[i3 + 1] = uy;
      posGeography[i3 + 2] = uz;
      if (syncActiveBuffers) {
        positions[i3] = ux;
        positions[i3 + 1] = uy;
        positions[i3 + 2] = uz;
        posTo[i3] = ux;
        posTo[i3 + 1] = uy;
        posTo[i3 + 2] = uz;
      }
    }
    if (syncActiveBuffers) {
      positionAttr.needsUpdate = true;
      posToAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
    }
    const posAttr = unlocGeo.attributes.position;
    for (let a = 0; a <= 48; a++) {
      const ang = (a / 48) * Math.PI * 2;
      posAttr.setXYZ(
        a,
        layout.cx + Math.cos(ang) * layout.rCircle,
        layout.cy + Math.sin(ang) * layout.rCircle,
        0
      );
    }
    posAttr.needsUpdate = true;
    unlocLine.computeLineDistances();
    unlocatedGuideAnchor.pos.set(layout.cx, layout.labelY, 0);
  }

  function computeGeographyCameraPose() {
    if (!cachedSafeArea) refreshUiMetrics();
    const w = typeof window !== "undefined" ? window.innerWidth : 1280;
    const h = typeof window !== "undefined" ? window.innerHeight : 720;
    const safe = cachedSafeArea || { left: 8, right: w - 8, top: 8, bottom: h - 8 };
    const layout = getUnlocatedLayout(isPortraitGeo);
    const pts = [
      ...geoFramingBorderPts,
      new THREE.Vector3(
        isPortraitGeo ? Math.min(layout.cx - layout.rCircle, layout.cx - 6.0) : layout.cx - layout.rCircle,
        layout.cy,
        0
      ),
      new THREE.Vector3(layout.cx + layout.rCircle, layout.cy, 0),
      new THREE.Vector3(layout.cx, layout.cy - layout.rCircle, 0),
      new THREE.Vector3(layout.cx, layout.cy + layout.rCircle, 0),
      new THREE.Vector3(layout.cx, layout.cy, layout.rStars),
      new THREE.Vector3(layout.cx, layout.cy, -layout.rStars),
      new THREE.Vector3(layout.cx, layout.labelY - 1.1, 0),
    ];

    const tanHalfFov = Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5));
    const k = (h * 0.5) / tanHalfFov;
    const uLeft = (safe.left - w * 0.5) / k;
    const uRight = (safe.right - w * 0.5) / k;
    const vBottom = (h * 0.5 - safe.bottom) / k;
    const vTop = (h * 0.5 - safe.top) / k;

    const boundsForDist = (d) => {
      let loX = -Infinity;
      let hiX = Infinity;
      let loY = -Infinity;
      let hiY = Infinity;
      for (const p of pts) {
        const dz = d - p.z;
        loX = Math.max(loX, p.x - uRight * dz);
        hiX = Math.min(hiX, p.x - uLeft * dz);
        loY = Math.max(loY, p.y - vTop * dz);
        hiY = Math.min(hiY, p.y - vBottom * dz);
      }
      return { loX, hiX, loY, hiY };
    };

    let loD = 12;
    let hiD = 320;
    for (let iter = 0; iter < 40; iter++) {
      const midD = (loD + hiD) * 0.5;
      const b = boundsForDist(midD);
      if (b.loX <= b.hiX && b.loY <= b.hiY) {
        hiD = midD;
      } else {
        loD = midD;
      }
    }
    const d = hiD;
    const b = boundsForDist(d);
    const cx = (b.loX + b.hiX) * 0.5;
    const cy = (b.loY + b.hiY) * 0.5;
    return {
      cameraPos: new THREE.Vector3(cx, cy, d),
      targetPos: new THREE.Vector3(cx, cy, 0),
    };
  }

  function clearGroup(group) {
    while (group.children.length > 0) {
      const child = group.children[0];
      group.remove(child);
      child.geometry?.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else {
        child.material?.dispose();
      }
    }
  }

  // State tracking
  let currentLens = "meaning"; // "meaning" | "history" | "geography"
  let currentYearFloat = reducedMotion ? 2026.0 : 2001.0;
  let lastEditWarYearInt = -1;
  let selectedStar = null;
  let searchStars = [];
  let activeThreads = [];
  let constellationStars = [];
  let hoveredStar = null;

  // Morph transition state (between lenses or into/out of Talvitie road)
  let morphState = null; // { startTime, duration, fromRoadMix, toRoadMix, onComplete }

  // Talvitie ("Winter Road") state
  let inRoadMode = false;
  let activeRoadData = null;
  let roadEventLayouts = []; // [{ station, event, index, no, z, zStart, zEnd, segLen, yearLabel, yearAnchor, branchAnchors, postAnchors }]
  let roadGhostAnchors = []; // [{ ghost, index, parentIndex, label, pos }]
  let roadGapAnchors = []; // [{ afterIndex, gapYears, label, pos }]
  let activeRoadEventIdx = 0;
  let iceRoadMaterial = null;
  let roadTrailMaterial = null;
  let roadDepthFadeEntries = [];

  // Camera glide animation state
  let glideActive = false;
  let curveGlide = null;
  let summaryCamTween = null; // { startTime, duration, fromPos, toPos, fromTarget, toTarget }
  const glideTargetPos = new THREE.Vector3();
  const glideCameraPos = new THREE.Vector3();

  // 3D Summary Trail state
  let inSummaryMode = false;
  let summaryOriginStar = null;
  let summaryOriginPos = new THREE.Vector3();
  let summaryForward = new THREE.Vector3(0, 0, -1);
  let summaryRight = new THREE.Vector3(1, 0, 0);
  let summaryUp = new THREE.Vector3(0, 1, 0);
  let summaryFocusIdx = 0;
  let summaryCards = []; // [{ index, kind, anchorPos, currentPos, cssObj, element, delayMs, unfoldDurMs }]
  let summaryEnterTime = 0;
  let summarySpineLine = null;
  let summarySpinePointCount = 0;
  let savedSummaryCamPos = new THREE.Vector3(0, 6, 62);
  let savedSummaryTarget = new THREE.Vector3(0, 0, 0);
  const summaryProjVec = new THREE.Vector3();

  function disposeGroupChildren(group) {
    while (group.children.length > 0) {
      const ch = group.children[0];
      group.remove(ch);
      if (ch.geometry) ch.geometry.dispose?.();
      if (ch.material) {
        if (Array.isArray(ch.material)) ch.material.forEach((m) => m.dispose?.());
        else ch.material.dispose?.();
      }
    }
  }

  function clearCss3dScene() {
    while (css3dScene.children.length > 0) {
      css3dScene.remove(css3dScene.children[0]);
    }
  }

  function getSummaryCameraPoseForIndex(idx) {
    const entry = summaryCards[idx] || summaryCards[0];
    const anchor = entry ? entry.anchorPos : summaryOriginPos;
    const camBack = 9.5;
    const camPos = anchor
      .clone()
      .addScaledVector(summaryForward, -camBack)
      .addScaledVector(summaryUp, 0.95);
    const lookTarget = anchor
      .clone()
      .addScaledVector(summaryForward, 10.0)
      .addScaledVector(summaryUp, 2.25);
    return { camPos, lookTarget };
  }

  function buildSummaryTrailObjects(items = [], { focusIdx = 0, immediate = false } = {}) {
    disposeGroupChildren(summaryTrailGroup);
    clearCss3dScene();

    const STEP_FORWARD = 6.5;
    const STEP_RISE = 2.3;
    const ZIGZAG_OFFSET = 2.65;
    const GHOST_OFFSET = 3.95;
    const totalCount = items.length;
    const staggerMs = !immediate && totalCount > 1 ? Math.min(60, Math.floor(620 / (totalCount - 1))) : 0;

    const spinePoints = [];
    const sampleSteps = Math.max(24, totalCount * 6);
    const spineEndPos = summaryOriginPos
      .clone()
      .addScaledVector(summaryForward, Math.max(1, totalCount - 1) * STEP_FORWARD + 4.5)
      .addScaledVector(summaryUp, Math.max(1, totalCount - 1) * STEP_RISE + 1.5);
    for (let s = 0; s <= sampleSteps; s++) {
      const t = s / sampleSteps;
      spinePoints.push(summaryOriginPos.clone().lerp(spineEndPos, t));
    }
    const spineGeo = new THREE.BufferGeometry().setFromPoints(spinePoints);
    summarySpinePointCount = spinePoints.length;
    if (!reducedMotion && !immediate) {
      spineGeo.setDrawRange(0, 2);
    }
    const spineMat = new THREE.LineBasicMaterial({
      color: new THREE.Color(COLORS.frost),
      transparent: true,
      opacity: 0.3,
    });
    summarySpineLine = new THREE.Line(spineGeo, spineMat);
    summaryTrailGroup.add(summarySpineLine);

    // Subtle origin star halo right below Card 0
    const ringGeo = new THREE.RingGeometry(0.32, 0.44, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(COLORS.snow),
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.55,
    });
    const originHalo = new THREE.Mesh(ringGeo, ringMat);
    originHalo.position.copy(summaryOriginPos);
    originHalo.quaternion.copy(camera.quaternion);
    summaryTrailGroup.add(originHalo);

    const tickPositions = [];
    summaryCards = items.map((item, idx) => {
      const spinePt = summaryOriginPos
        .clone()
        .addScaledVector(summaryForward, idx * STEP_FORWARD + 0.6)
        .addScaledVector(summaryUp, idx * STEP_RISE + 0.35);
      const side = idx === 0 ? 0 : idx % 2 === 1 ? -1 : 1;
      const offsetMag = item.kind === "ghost" ? GHOST_OFFSET : ZIGZAG_OFFSET;
      const anchorPos = spinePt.clone().addScaledVector(summaryRight, side * offsetMag);

      if (idx >= 1) {
        tickPositions.push(spinePt.x, spinePt.y, spinePt.z);
        tickPositions.push(anchorPos.x, anchorPos.y, anchorPos.z);
      }

      const cssObj = new CSS3DObject(item.element);
      const startAtAnchor = reducedMotion || immediate;
      cssObj.position.copy(startAtAnchor ? anchorPos : summaryOriginPos);
      cssObj.quaternion.copy(camera.quaternion);
      cssObj.visible = idx !== focusIdx;
      css3dScene.add(cssObj);

      return {
        index: idx,
        kind: item.kind,
        anchorPos,
        currentPos: (startAtAnchor ? anchorPos : summaryOriginPos).clone(),
        cssObj,
        element: item.element,
        delayMs: startAtAnchor ? 0 : idx * staggerMs,
        unfoldDurMs: startAtAnchor ? 0 : 220,
      };
    });

    if (tickPositions.length > 0) {
      const tickGeo = new THREE.BufferGeometry();
      tickGeo.setAttribute("position", new THREE.Float32BufferAttribute(tickPositions, 3));
      const tickMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(COLORS.frost),
        transparent: true,
        opacity: 0.22,
      });
      summaryTrailGroup.add(new THREE.LineSegments(tickGeo, tickMat));
    }

    summaryTrailGroup.visible = true;
    if (css3dLayer) {
      css3dLayer.hidden = false;
    }

    setSummaryFocusIndex(focusIdx);
    computeProjectedLabels();
  }

  function enterSummaryTrail({ star, items = [] } = {}) {
    if (!star || !items.length) return;
    if (inRoadMode) {
      exitRoadMode();
    }

    // Save pre-trail camera to restore on "Back to the sky"
    savedSummaryCamPos.copy(camera.position);
    savedSummaryTarget.copy(controls.target);

    // Orientation built relative to the CAMERA at the moment of entry
    camera.getWorldDirection(summaryForward).normalize();
    summaryRight.set(1, 0, 0).applyQuaternion(camera.quaternion).normalize();
    summaryUp.crossVectors(summaryRight, summaryForward).normalize();

    summaryOriginStar = star;
    summaryOriginPos.copy(getStarCurrentPos(star));
    selectedStar = star;
    refreshHighlights();

    inSummaryMode = true;
    summaryFocusIdx = 0;
    summaryEnterTime = performance.now();
    glideActive = false;
    curveGlide = null;

    threadsGroup.visible = false;
    constellationGroup.visible = false;
    historyGuideGroup.visible = false;
    geographyGuideGroup.visible = false;
    material.uniforms.uSummaryModeMix.value = 1.0;

    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;

    buildSummaryTrailObjects(items, { focusIdx: 0, immediate: reducedMotion });
  }

  function updateSummaryTrailItems(items = [], focusIdx = 0) {
    if (!inSummaryMode || !items.length) return;
    const clampedFocus = Math.max(0, Math.min(items.length - 1, Number(focusIdx) || 0));
    buildSummaryTrailObjects(items, { focusIdx: clampedFocus, immediate: true });
  }

  function setSummaryFocusIndex(idx) {
    if (!inSummaryMode || summaryCards.length === 0) return 0;
    const clamped = Math.max(0, Math.min(summaryCards.length - 1, Number(idx) || 0));
    summaryFocusIdx = clamped;

    const { camPos, lookTarget } = getSummaryCameraPoseForIndex(clamped);
    if (reducedMotion) {
      camera.position.copy(camPos);
      controls.target.copy(lookTarget);
      controls.update();
      summaryCamTween = null;
    } else {
      summaryCamTween = {
        startTime: performance.now(),
        duration: 500,
        fromPos: camera.position.clone(),
        toPos: camPos,
        fromTarget: controls.target.clone(),
        toTarget: lookTarget,
      };
    }
    return clamped;
  }

  function exitSummaryTrail({ restoreStarSelection = true } = {}) {
    if (!inSummaryMode) return;
    inSummaryMode = false;
    summaryCamTween = null;
    summaryCards = [];
    summarySpineLine = null;
    disposeGroupChildren(summaryTrailGroup);
    summaryTrailGroup.visible = false;
    clearCss3dScene();
    if (css3dLayer) {
      css3dLayer.hidden = true;
    }
    onSummaryFocusScreenUpdate?.({ visible: false });

    material.uniforms.uSummaryModeMix.value = 0.0;
    threadsGroup.visible = true;
    constellationGroup.visible = true;
    historyGuideGroup.visible = currentLens === "history";
    geographyGuideGroup.visible = currentLens === "geography";

    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    if (!restoreStarSelection) {
      selectedStar = null;
      refreshHighlights();
    }

    if (reducedMotion) {
      camera.position.copy(savedSummaryCamPos);
      controls.target.copy(savedSummaryTarget);
      controls.update();
      glideActive = false;
    } else {
      glideCameraPos.copy(savedSummaryCamPos);
      glideTargetPos.copy(savedSummaryTarget);
      glideActive = true;
    }
  }

  controls.addEventListener("start", () => {
    if (!inRoadMode && !inSummaryMode) {
      glideActive = false;
      curveGlide = null;
    }
  });

  function getBufferForLens(lensName) {
    if (lensName === "history") return posHistory;
    if (lensName === "geography") return posGeography;
    return posMeaning;
  }

  function getStarCurrentPos(star) {
    if (!star || star._index === undefined) {
      return new THREE.Vector3(star?.x || 0, star?.y || 0, star?.z || 0);
    }
    const i3 = star._index * 3;
    const t = material.uniforms.uMorphT.value;
    return new THREE.Vector3(
      THREE.MathUtils.lerp(positions[i3], posTo[i3], t),
      THREE.MathUtils.lerp(positions[i3 + 1], posTo[i3 + 1], t),
      THREE.MathUtils.lerp(positions[i3 + 2], posTo[i3 + 2], t)
    );
  }

  function makeArcCurve(p0, p1) {
    const mid = new THREE.Vector3().addVectors(p0, p1).multiplyScalar(0.5);
    const dist = p0.distanceTo(p1);
    mid.y += Math.max(1.4, dist * 0.24);
    mid.z += Math.min(2.2, dist * 0.08);
    return new THREE.QuadraticBezierCurve3(p0.clone(), mid, p1.clone());
  }

  // Trigger a 1.5s GPU morph from current interpolated positions to targetBuffer
  function startPositionMorph(targetBuffer, { toRoadMix = 0.0, duration = 1500 } = {}) {
    const currentMorphT = material.uniforms.uMorphT.value;
    for (let i = 0; i < count * 3; i++) {
      const currVal =
        currentMorphT > 0.001
          ? positions[i] + (posTo[i] - positions[i]) * currentMorphT
          : positions[i];
      positions[i] = currVal;
      posTo[i] = targetBuffer[i];
    }
    positionAttr.needsUpdate = true;
    posToAttr.needsUpdate = true;

    if (reducedMotion || duration <= 0) {
      for (let i = 0; i < count * 3; i++) {
        positions[i] = targetBuffer[i];
      }
      positionAttr.needsUpdate = true;
      geometry.computeBoundingSphere();
      material.uniforms.uMorphT.value = 0.0;
      material.uniforms.uRoadModeMix.value = toRoadMix;
      morphState = null;
      return;
    }

    material.uniforms.uMorphT.value = 0.0;
    morphState = {
      startTime: performance.now(),
      duration,
      fromRoadMix: material.uniforms.uRoadModeMix.value,
      toRoadMix,
    };
  }

  function applyGeographyCameraPose({ immediate = false } = {}) {
    const nextIsPortrait =
      typeof window !== "undefined" && window.innerWidth < window.innerHeight;
    applyUnlocatedLayout(nextIsPortrait, currentLens === "geography" && !inRoadMode && !inSummaryMode);
    refreshUiMetrics();
    const pose = computeGeographyCameraPose();
    controls.maxDistance = Math.max(165, pose.cameraPos.z + 20);
    glideTargetPos.copy(pose.targetPos);
    glideCameraPos.copy(pose.cameraPos);
    curveGlide = null;
    if (immediate) {
      controls.target.copy(glideTargetPos);
      camera.position.copy(glideCameraPos);
      controls.update();
      glideActive = false;
    } else {
      glideActive = true;
    }
  }

  // Switch between the 3 sky lenses: "meaning" | "history" | "geography"
  function setLens(lensName) {
    if (!["meaning", "history", "geography"].includes(lensName)) return;
    currentLens = lensName;

    if (inSummaryMode) {
      exitSummaryTrail({ restoreStarSelection: false });
    }
    if (inRoadMode) {
      exitRoadMode({ targetLens: lensName });
      return;
    }

    historyGuideGroup.visible = lensName === "history";
    geographyGuideGroup.visible = lensName === "geography";
    material.uniforms.uIgnoreYearSlider.value = lensName === "meaning" ? 0.0 : 1.0;

    // Clear 3D threads on lens switch or rebuild them in the new lens coordinates
    clearGroup(threadsGroup);
    activeThreads = [];

    const targetBuf = getBufferForLens(lensName);
    startPositionMorph(targetBuf, { toRoadMix: 0.0, duration: 1500 });

    // Frame camera for the chosen lens
    if (lensName === "history") {
      glideTargetPos.set(0, 0, 0);
      glideCameraPos.set(0, 12, 60);
    } else if (lensName === "geography") {
      applyGeographyCameraPose({ immediate: reducedMotion });
      return;
    } else {
      glideTargetPos.set(0, 0, 0);
      glideCameraPos.set(0, 6, 62);
    }

    curveGlide = null;
    if (reducedMotion) {
      controls.target.copy(glideTargetPos);
      camera.position.copy(glideCameraPos);
      controls.update();
      glideActive = false;
    } else {
      glideActive = true;
    }
  }

  // Build the 3D Talvitie ("Winter Road") geometry & compute star target positions
  // Supports BOTH:
  // - Section Briefing Road (`roadData.stations` + `ghost_stations`): proportional `sqrt(words)` segments, unrolled star trail
  // - Historical Topic Road (`roadData.events` + `eras`): `>30-year` gap compression, event stars flying from sky
  function buildRoadGeometryAndPositions(roadData) {
    clearGroup(roadGroup);
    roadEventLayouts = [];
    roadGhostAnchors = [];
    roadGapAnchors = [];
    iceRoadMaterial = null;
    roadTrailMaterial = null;
    roadDepthFadeEntries = [];

    const addRoadFadeObj = (obj, zCoord) => {
      if (obj.material) {
        if (!obj.material.transparent) obj.material.transparent = true;
        roadDepthFadeEntries.push({
          obj,
          mat: obj.material,
          z: zCoord,
          baseOpacity: obj.material.opacity ?? 1.0,
        });
      }
      roadGroup.add(obj);
      return obj;
    };

    const isTopicRoad = !Array.isArray(roadData.stations) && Array.isArray(roadData.events);
    const stations = isTopicRoad ? roadData.events : (roadData.stations || []);
    const ghostStations = roadData.ghost_stations || [];

    const ghostsByAfterNo = new Map();
    ghostStations.forEach((g, gIdx) => {
      const key = Number(g.after_no) || 1;
      if (!ghostsByAfterNo.has(key)) ghostsByAfterNo.set(key, []);
      ghostsByAfterNo.get(key).push({ ghost: g, index: gIdx });
    });

    const gapSpans = [];
    let currentZ = 0;

    for (let i = 0; i < stations.length; i++) {
      const station = stations[i];

      if (isTopicRoad && i > 0) {
        const prevYear = Number(stations[i - 1]?.event_year) || 1900;
        const currYear = Number(station.event_year) || prevYear;
        const gapYears = Math.max(0, currYear - prevYear);
        if (gapYears > 30) {
          const gapZStart = currentZ;
          const gapZEnd = currentZ - 5.4;
          gapSpans.push({ zStart: gapZStart, zEnd: gapZEnd, gapYears });
          roadGapAnchors.push({
            eventIndex: i,
            gapYears,
            label: t("scene.gapYears", { years: gapYears }),
            pos: new THREE.Vector3(0, -1.35, (gapZStart + gapZEnd) * 0.5),
          });
          currentZ = gapZEnd;
        }
      }

      const words = Math.max(0, Number(station.words) || 400);
      let segLen;
      if (isTopicRoad) {
        const nextEv = stations[i + 1];
        const nextGap = nextEv
          ? Math.max(0, (Number(nextEv.event_year) || 0) - (Number(station.event_year) || 0))
          : 0;
        segLen =
          nextEv && nextGap <= 30
            ? THREE.MathUtils.clamp(8.2 + nextGap * 0.35, 8.2, 15.5)
            : 9.2;
      } else {
        // Section segment length proportional to sqrt(words) with min length (no >30-year gap compression)
        segLen = THREE.MathUtils.clamp(6.5 + Math.sqrt(words) * 0.22, 7.5, 22.0);
      }
      const zStart = currentZ;
      const zEnd = currentZ - segLen;
      const stationNo = station.no ?? i + 1;
      const hasGhostHere = ghostsByAfterNo.has(stationNo);

      const branchAnchors = [];
      const branches = (station.branches || []).slice(0, 2);
      branches.forEach((br, bIdx) => {
        // Avoid overlapping a left-hand ghost station spur on the same station
        const sideSign = hasGhostHere ? (bIdx === 0 ? 1 : -1) : (bIdx === 0 ? -1 : 1);
        const zOffset = hasGhostHere && sideSign < 0 ? 5.6 : 2.2 + bIdx * 1.6;
        const clampedOffset = Math.min(segLen - 1.1, zOffset);
        const endPos = new THREE.Vector3(sideSign * 4.8, -1.1, zStart - clampedOffset);
        branchAnchors.push({
          branch: br,
          sideSign,
          startZ: zStart - Math.max(0.6, clampedOffset - 1.5),
          endPos,
        });
      });

      const posts = Array.isArray(station.posts) ? station.posts : [];
      const postAnchors = [];
      for (let pIdx = 0; pIdx < posts.length; pIdx++) {
        const frac = (pIdx + 1) / (posts.length + 1);
        const postZ = THREE.MathUtils.lerp(zStart, zEnd, frac);
        postAnchors.push({
          post: posts[pIdx],
          index: pIdx,
          z: postZ,
          pos: new THREE.Vector3(LANE_X.fi, -1.26, postZ),
        });
      }

      const yearLabel = isTopicRoad
        ? station.event_year
          ? String(station.event_year)
          : null
        : formatStationYears(station);

      roadEventLayouts.push({
        station,
        event: station,
        index: i,
        no: stationNo,
        z: zStart,
        zStart,
        zEnd,
        segLen,
        yearLabel,
        yearAnchor: new THREE.Vector3(4.35, -1.45, zStart),
        branchAnchors,
        postAnchors,
      });

      currentZ = zEnd;
    }

    const totalLength = Math.abs(currentZ) + 28;
    const roadCenterZ = currentZ * 0.5 - 3;

    // 1. Ice strip plane
    const planeGeo = new THREE.PlaneGeometry(8.6, totalLength, 1, 64);
    planeGeo.rotateX(-Math.PI / 2);
    planeGeo.translate(0, -1.65, roadCenterZ);

    iceRoadMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uOpacity: { value: reducedMotion ? 1.0 : 0.25 },
      },
      vertexShader: ICE_ROAD_VERTEX,
      fragmentShader: ICE_ROAD_FRAGMENT,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    roadGroup.add(new THREE.Mesh(planeGeo, iceRoadMaterial));

    // Subtle lead-in and tail-out lane grooves at road ends
    const leadEndConfigs = [
      { x: LANE_X.fi, color: COLORS.snow, op: 0.42 },
      { x: LANE_X.sv, color: COLORS.frost, op: 0.14 },
      { x: LANE_X.en, color: COLORS.frost, op: 0.14 },
    ];
    for (const lc of leadEndConfigs) {
      const leadInGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lc.x, -1.62, 5.5),
        new THREE.Vector3(lc.x, -1.62, 0),
      ]);
      roadGroup.add(
        new THREE.Line(
          leadInGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(lc.color),
            transparent: true,
            opacity: lc.op,
          })
        )
      );
      const tailGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(lc.x, -1.62, currentZ),
        new THREE.Vector3(lc.x, -1.62, currentZ - 10),
      ]);
      roadGroup.add(
        new THREE.Line(
          tailGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(lc.color),
            transparent: true,
            opacity: lc.op * 0.65,
          })
        )
      );
    }

    // Shared sphere geometries for station beacon tops, lane bulbs, and subsection post tips
    const beaconSphereGeo = new THREE.SphereGeometry(0.135, 14, 14);
    const beaconHaloGeo = new THREE.SphereGeometry(0.24, 14, 14);
    const laneBulbGeo = new THREE.SphereGeometry(0.095, 12, 12);
    const subPostTipGeo = new THREE.SphereGeometry(0.055, 10, 10);

    // 2. Per-station lane segments (fi, sv, en lit by similarity), boundary thresholds, beacon posts, subsection posts & branches
    for (const layout of roadEventLayouts) {
      const { station, zStart, zEnd, branchAnchors, postAnchors } = layout;
      const lanesObj =
        station.lanes && !Array.isArray(station.lanes)
          ? station.lanes
          : {
              fi: true,
              sv: Array.isArray(station.lanes) && station.lanes.includes("sv") ? 0.85 : null,
              en: Array.isArray(station.lanes) && station.lanes.includes("en") ? 0.85 : null,
            };

      const svSim =
        typeof lanesObj.sv === "number" && lanesObj.sv > 0 ? lanesObj.sv : null;
      const enSim =
        typeof lanesObj.en === "number" && lanesObj.en > 0 ? lanesObj.en : null;

      // 2a. Finnish (fi) lane segment: always lit (opacity: 0.88, --snow)
      const fiSegGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(LANE_X.fi, -1.62, zStart),
        new THREE.Vector3(LANE_X.fi, -1.62, zEnd),
      ]);
      roadGroup.add(
        new THREE.Line(
          fiSegGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(COLORS.snow),
            transparent: true,
            opacity: 0.88,
          })
        )
      );

      // 2b. Swedish (sv) lane segment: lit by similarity or faint unlit frost groove (0.07)
      const svSegGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(LANE_X.sv, -1.62, zStart),
        new THREE.Vector3(LANE_X.sv, -1.62, zEnd),
      ]);
      const svOpacity =
        svSim !== null
          ? THREE.MathUtils.clamp(0.18 + svSim * 0.78, 0.2, 0.95)
          : 0.07;
      roadGroup.add(
        new THREE.Line(
          svSegGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(svSim !== null ? COLORS.birch : COLORS.frost),
            transparent: true,
            opacity: svOpacity,
          })
        )
      );

      // 2c. English (en) lane segment: lit by similarity or faint unlit frost groove (0.07)
      const enSegGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(LANE_X.en, -1.62, zStart),
        new THREE.Vector3(LANE_X.en, -1.62, zEnd),
      ]);
      const enOpacity =
        enSim !== null
          ? THREE.MathUtils.clamp(0.18 + enSim * 0.78, 0.2, 0.95)
          : 0.07;
      roadGroup.add(
        new THREE.Line(
          enSegGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(enSim !== null ? COLORS.lichen : COLORS.frost),
            transparent: true,
            opacity: enOpacity,
          })
        )
      );

      // 3a. Wider architectural cross-threshold bar across the ice strip at station boundary (z = zStart)
      const thresholdMainGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-3.85, -1.61, zStart),
        new THREE.Vector3(3.85, -1.61, zStart),
      ]);
      roadGroup.add(
        new THREE.Line(
          thresholdMainGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(COLORS.frost),
            transparent: true,
            opacity: 0.72,
          })
        )
      );

      const thresholdInnerGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.65, -1.605, zStart + 0.09),
        new THREE.Vector3(2.65, -1.605, zStart + 0.09),
      ]);
      roadGroup.add(
        new THREE.Line(
          thresholdInnerGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(COLORS.snow),
            transparent: true,
            opacity: 0.36,
          })
        )
      );

      // 3b. Prominent vertical station boundary beacon post (height ~ 0.85 above road y = -1.62 -> y = -0.77)
      const warYears = station.history?.war_years || station.war_years || [];
      const hasWar = Array.isArray(warYears) && warYears.length > 0;
      const beaconColor = hasWar ? COLORS.lingon : COLORS.snow;

      const fiPostTopY = -1.62 + 0.85;
      const fiPostGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(LANE_X.fi, -1.62, zStart),
        new THREE.Vector3(LANE_X.fi, fiPostTopY, zStart),
      ]);
      addRoadFadeObj(
        new THREE.Line(
          fiPostGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(beaconColor),
            transparent: true,
            opacity: 0.96,
          })
        ),
        zStart
      );

      const beaconBulb = new THREE.Mesh(
        beaconSphereGeo,
        new THREE.MeshBasicMaterial({ color: new THREE.Color(beaconColor), transparent: true, opacity: 1.0 })
      );
      beaconBulb.position.set(LANE_X.fi, fiPostTopY + 0.03, zStart);
      addRoadFadeObj(beaconBulb, zStart);

      const beaconHalo = new THREE.Mesh(
        beaconHaloGeo,
        new THREE.MeshBasicMaterial({
          color: new THREE.Color(beaconColor),
          transparent: true,
          opacity: hasWar ? 0.36 : 0.22,
          depthWrite: false,
        })
      );
      beaconHalo.position.set(LANE_X.fi, fiPostTopY + 0.03, zStart);
      addRoadFadeObj(beaconHalo, zStart);

      // Small lane posts at station boundary for sv and en when similarity > 0
      if (svSim !== null) {
        const svPostTopY = -1.62 + 0.50;
        const svPostGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(LANE_X.sv, -1.62, zStart),
          new THREE.Vector3(LANE_X.sv, svPostTopY, zStart),
        ]);
        addRoadFadeObj(
          new THREE.Line(
            svPostGeo,
            new THREE.LineBasicMaterial({
              color: new THREE.Color(COLORS.birch),
              transparent: true,
              opacity: THREE.MathUtils.clamp(0.24 + svSim * 0.72, 0.25, 0.95),
            })
          ),
          zStart
        );
        const svBulb = new THREE.Mesh(
          laneBulbGeo,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(COLORS.birch),
            transparent: true,
            opacity: THREE.MathUtils.clamp(0.25 + svSim * 0.75, 0.28, 1.0),
          })
        );
        svBulb.position.set(LANE_X.sv, svPostTopY + 0.02, zStart);
        addRoadFadeObj(svBulb, zStart);
      }

      if (enSim !== null) {
        const enPostTopY = -1.62 + 0.50;
        const enPostGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(LANE_X.en, -1.62, zStart),
          new THREE.Vector3(LANE_X.en, enPostTopY, zStart),
        ]);
        addRoadFadeObj(
          new THREE.Line(
            enPostGeo,
            new THREE.LineBasicMaterial({
              color: new THREE.Color(COLORS.lichen),
              transparent: true,
              opacity: THREE.MathUtils.clamp(0.24 + enSim * 0.72, 0.25, 0.95),
            })
          ),
          zStart
        );
        const enBulb = new THREE.Mesh(
          laneBulbGeo,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(COLORS.lichen),
            transparent: true,
            opacity: THREE.MathUtils.clamp(0.25 + enSim * 0.75, 0.28, 1.0),
          })
        );
        enBulb.position.set(LANE_X.en, enPostTopY + 0.02, zStart);
        addRoadFadeObj(enBulb, zStart);
      }

      // 3c. Subsection (`station.posts` ###) delicate vertical posts (height ~ 0.32) along the `fi` lane
      const subPostTopY = -1.62 + 0.32;
      for (const pAnchor of postAnchors) {
        const tickGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(LANE_X.fi - 0.24, -1.615, pAnchor.z),
          new THREE.Vector3(LANE_X.fi + 0.24, -1.615, pAnchor.z),
        ]);
        addRoadFadeObj(
          new THREE.Line(
            tickGeo,
            new THREE.LineBasicMaterial({
              color: new THREE.Color(COLORS.frost),
              transparent: true,
              opacity: 0.44,
            })
          ),
          pAnchor.z
        );

        const subGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(LANE_X.fi, -1.62, pAnchor.z),
          new THREE.Vector3(LANE_X.fi, subPostTopY, pAnchor.z),
        ]);
        addRoadFadeObj(
          new THREE.Line(
            subGeo,
            new THREE.LineBasicMaterial({
              color: new THREE.Color(COLORS.snow),
              transparent: true,
              opacity: 0.7,
            })
          ),
          pAnchor.z
        );

        const subTip = new THREE.Mesh(
          subPostTipGeo,
          new THREE.MeshBasicMaterial({
            color: new THREE.Color(COLORS.snow),
            transparent: true,
            opacity: 0.84,
          })
        );
        subTip.position.set(LANE_X.fi, subPostTopY + 0.015, pAnchor.z);
        addRoadFadeObj(subTip, pAnchor.z);
      }

      // 4. Side branch paths curving outward from the road in --birch
      for (let bIdx = 0; bIdx < branchAnchors.length; bIdx++) {
        const bAnchor = branchAnchors[bIdx];
        const startX = bAnchor.sideSign < 0 ? LANE_X.fi : LANE_X.en;
        const pStart = new THREE.Vector3(startX, -1.58, bAnchor.startZ);
        const pEnd = bAnchor.endPos.clone();
        const pMid = new THREE.Vector3(
          (startX + pEnd.x) * 0.55,
          -1.45,
          (bAnchor.startZ + pEnd.z) * 0.5
        );
        const bCurve = new THREE.QuadraticBezierCurve3(pStart, pMid, pEnd);
        const bGeo = new THREE.BufferGeometry().setFromPoints(bCurve.getPoints(20));
        const bMat = new THREE.LineDashedMaterial({
          color: new THREE.Color(COLORS.birch),
          dashSize: 0.35,
          gapSize: 0.22,
          transparent: true,
          opacity: 0.85,
        });
        const bLine = new THREE.Line(bGeo, bMat);
        bLine.computeLineDistances();
        roadGroup.add(bLine);

        // Small post at branch tip
        const tipPostGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(pEnd.x, -1.62, pEnd.z),
          new THREE.Vector3(pEnd.x, -0.82, pEnd.z),
        ]);
        roadGroup.add(
          new THREE.Line(
            tipPostGeo,
            new THREE.LineBasicMaterial({ color: new THREE.Color(COLORS.birch) })
          )
        );
      }
    }

    // 4b. Compressed >30-year frosted dashed bridges for Historical Topic Road (`isTopicRoad`)
    for (const gSpan of gapSpans) {
      for (const laneKey of ["fi", "sv", "en"]) {
        const gLaneGeo = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(LANE_X[laneKey], -1.62, gSpan.zStart),
          new THREE.Vector3(LANE_X[laneKey], -1.62, gSpan.zEnd),
        ]);
        const gLaneMat = new THREE.LineDashedMaterial({
          color: new THREE.Color(COLORS.frost),
          dashSize: 0.35,
          gapSize: 0.35,
          transparent: true,
          opacity: laneKey === "fi" ? 0.52 : 0.24,
        });
        const gLine = new THREE.Line(gLaneGeo, gLaneMat);
        gLine.computeLineDistances();
        roadGroup.add(gLine);
      }
      const gapMidZ = (gSpan.zStart + gSpan.zEnd) * 0.5;
      const gapCrossGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-2.8, -1.61, gapMidZ),
        new THREE.Vector3(2.8, -1.61, gapMidZ),
      ]);
      const gapCrossMat = new THREE.LineDashedMaterial({
        color: new THREE.Color(COLORS.frost),
        dashSize: 0.25,
        gapSize: 0.25,
        transparent: true,
        opacity: 0.5,
      });
      const gapCross = new THREE.Line(gapCrossGeo, gapCrossMat);
      gapCross.computeLineDistances();
      roadGroup.add(gapCross);
    }

    // 5. Ghost Stations (`ghost_stations`): faded dashed dead-end side road branching off to the left (x = -5.7)
    for (let gIdx = 0; gIdx < ghostStations.length; gIdx++) {
      const ghost = ghostStations[gIdx];
      const parentLayout =
        roadEventLayouts.find((l) => l.no === ghost.after_no) ||
        roadEventLayouts[
          Math.max(
            0,
            Math.min(roadEventLayouts.length - 1, (Number(ghost.after_no) || 1) - 1)
          )
        ];
      if (!parentLayout) continue;

      const startZ = parentLayout.zStart - Math.min(1.5, parentLayout.segLen * 0.18);
      const endZ = startZ - 3.1;
      const pStart = new THREE.Vector3(LANE_X.fi, -1.60, startZ);
      const pMid = new THREE.Vector3(-3.8, -1.56, startZ - 1.15);
      const pEnd = new THREE.Vector3(-5.7, -1.50, endZ);

      const ghostCurve = new THREE.QuadraticBezierCurve3(pStart, pMid, pEnd);
      const ghostGeo = new THREE.BufferGeometry().setFromPoints(ghostCurve.getPoints(24));
      const ghostMat = new THREE.LineDashedMaterial({
        color: new THREE.Color(COLORS.frost),
        dashSize: 0.36,
        gapSize: 0.26,
        transparent: true,
        opacity: 0.65,
      });
      const ghostLine = new THREE.Line(ghostGeo, ghostMat);
      ghostLine.computeLineDistances();
      roadGroup.add(ghostLine);

      // Parallel faint secondary edge dashed line to give the dead-end spur width
      const ghostEdgeCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(LANE_X.fi, -1.61, startZ - 0.36),
        new THREE.Vector3(-3.8, -1.57, startZ - 1.51),
        new THREE.Vector3(-5.7, -1.51, endZ - 0.36)
      );
      const ghostEdgeGeo = new THREE.BufferGeometry().setFromPoints(
        ghostEdgeCurve.getPoints(20)
      );
      const ghostEdgeMat = new THREE.LineDashedMaterial({
        color: new THREE.Color(COLORS.frost),
        dashSize: 0.28,
        gapSize: 0.28,
        transparent: true,
        opacity: 0.36,
      });
      const ghostEdgeLine = new THREE.Line(ghostEdgeGeo, ghostEdgeMat);
      ghostEdgeLine.computeLineDistances();
      roadGroup.add(ghostEdgeLine);

      // Dead-end cross-bar post at x = -5.7
      const deadPostGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-5.7, -1.56, endZ),
        new THREE.Vector3(-5.7, -0.94, endZ),
      ]);
      roadGroup.add(
        new THREE.Line(
          deadPostGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(COLORS.frost),
            transparent: true,
            opacity: 0.78,
          })
        )
      );

      // Horizontal dead-end cross-bar across the top of the dead-end post
      const crossBarTopGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-6.14, -1.04, endZ - 0.14),
        new THREE.Vector3(-5.26, -1.04, endZ + 0.14),
      ]);
      roadGroup.add(
        new THREE.Line(
          crossBarTopGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(COLORS.frost),
            transparent: true,
            opacity: 0.85,
          })
        )
      );

      // Ground dead-end threshold stop-bar
      const crossBarBaseGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-6.20, -1.51, endZ - 0.16),
        new THREE.Vector3(-5.20, -1.51, endZ + 0.16),
      ]);
      roadGroup.add(
        new THREE.Line(
          crossBarBaseGeo,
          new THREE.LineBasicMaterial({
            color: new THREE.Color(COLORS.frost),
            transparent: true,
            opacity: 0.65,
          })
        )
      );

      roadGhostAnchors.push({
        ghost,
        index: gIdx,
        parentIndex: parentLayout.index,
        label: t("scene.sectionRemoved", { year: ghost.removed_year }),
        pos: new THREE.Vector3(-5.7, -0.84, endZ),
      });
    }

    // 6. Compute posRoad & roadMembers for the 1.5s star-to-road transition
    const skyBuf = getBufferForLens(currentLens);
    posRoad.set(skyBuf);
    roadMembers.fill(0.0);

    if (isTopicRoad) {
      // Topic Road (Option A): the topic's stars fly in from the sky onto their event posts
      for (const layout of roadEventLayouts) {
        const ev = layout.station;
        const siblings = ev.wikidata_id ? starsByWikidata.get(ev.wikidata_id) || [] : [];
        const matched =
          siblings.length > 0
            ? siblings
            : [starByKey.get(`${ev.lang || "fi"}:${ev.page_id}`)].filter(Boolean);
        for (const st of matched) {
          if (!st || st._index === undefined) continue;
          roadMembers[st._index] = 2.0;
          const i3 = st._index * 3;
          const lx = LANE_X[st.lang] ?? LANE_X.fi;
          posRoad[i3] = lx;
          posRoad[i3 + 1] = -1.62 + 0.88;
          posRoad[i3 + 2] = layout.z;
        }
      }
      roadMemberAttr.needsUpdate = true;
    } else {
      // Section Briefing Road: ONLY the article's own star (and its wikidata siblings) unrolls into the road
      const articleMeta = roadData.article || roadData.topic || {};
      const articleLang = articleMeta.lang || "fi";
      const articlePageId = Number(articleMeta.page_id);
      const mainArticleStar =
        starByKey.get(`${articleLang}:${articlePageId}`) || selectedStar || null;
      const articleQid =
        articleMeta.wikidata_id || mainArticleStar?.wikidata_id || null;
      const siblingStars = articleQid ? starsByWikidata.get(articleQid) || [] : [];
      const articleStars =
        siblingStars.length > 0
          ? siblingStars
          : mainArticleStar
          ? [mainArticleStar]
          : [];

      const startZ0 = roadEventLayouts[0]?.z ?? 0;
      for (const st of articleStars) {
        if (!st || st._index === undefined) continue;
        roadMembers[st._index] = 2.0;
        const i3 = st._index * 3;
        const lx = LANE_X[st.lang] ?? LANE_X.fi;
        const ly = st.lang === "fi" ? -1.62 + 0.88 : -1.62 + 0.52;
        posRoad[i3] = lx;
        posRoad[i3 + 1] = ly;
        posRoad[i3 + 2] = startZ0;
      }

      roadMemberAttr.needsUpdate = true;

      // 7. Sleek luminous particle/light trail along the road geometry so the article star unrolls into the polar causeway
      const originVec = mainArticleStar
        ? getStarCurrentPos(mainArticleStar)
        : new THREE.Vector3(0, 14, 0);
      const trailCount = Math.min(260, Math.max(120, roadEventLayouts.length * 22));
      const trailPos = new Float32Array(trailCount * 3);
      const trailOrigin = new Float32Array(trailCount * 3);
      const trailColor = new Float32Array(trailCount * 3);
      const trailProgress = new Float32Array(trailCount);
      const trailSize = new Float32Array(trailCount);
      const trailPhase = new Float32Array(trailCount);

      const endRoadZ = Math.min(-10, currentZ);
      for (let k = 0; k < trailCount; k++) {
        const k3 = k * 3;
        const u = k / Math.max(1, trailCount - 1);
        const zVal = THREE.MathUtils.lerp(1.5, endRoadZ, u);

        // Find which station segment zVal falls into so particles follow active lit lanes
        const stLayout =
          roadEventLayouts.find((l) => zVal <= l.zStart + 2.0 && zVal >= l.zEnd) ||
          roadEventLayouts[roadEventLayouts.length - 1];
        const lanesObj = stLayout?.station?.lanes || { fi: true };
        const hasSv = typeof lanesObj.sv === "number" && lanesObj.sv > 0;
        const hasEn = typeof lanesObj.en === "number" && lanesObj.en > 0;

        let laneChoice = "fi";
        if (k % 3 === 1 && hasSv) laneChoice = "sv";
        else if (k % 3 === 2 && hasEn) laneChoice = "en";

        const baseX = LANE_X[laneChoice];
        const jitterX = Math.sin(k * 7.13) * 0.14;
        const jitterY = -1.56 + (Math.cos(k * 5.31) * 0.5 + 0.5) * 0.22;

        trailPos[k3] = baseX + jitterX;
        trailPos[k3 + 1] = jitterY;
        trailPos[k3 + 2] = zVal;

        trailOrigin[k3] = originVec.x;
        trailOrigin[k3 + 1] = originVec.y;
        trailOrigin[k3 + 2] = originVec.z;

        const cRgb = LANG_RGB[laneChoice] || LANG_RGB.fi;
        trailColor[k3] = cRgb[0];
        trailColor[k3 + 1] = cRgb[1];
        trailColor[k3 + 2] = cRgb[2];

        trailProgress[k] = u;
        trailSize[k] = 0.26 + (k % 5) * 0.055;
        trailPhase[k] = k * 0.37;
      }

      const trailGeo = new THREE.BufferGeometry();
      trailGeo.setAttribute("position", new THREE.BufferAttribute(trailPos, 3));
      trailGeo.setAttribute("aOrigin", new THREE.BufferAttribute(trailOrigin, 3));
      trailGeo.setAttribute("aColor", new THREE.BufferAttribute(trailColor, 3));
      trailGeo.setAttribute("aProgress", new THREE.BufferAttribute(trailProgress, 1));
      trailGeo.setAttribute("aSize", new THREE.BufferAttribute(trailSize, 1));
      trailGeo.setAttribute("aPhase", new THREE.BufferAttribute(trailPhase, 1));

      roadTrailMaterial = new THREE.ShaderMaterial({
        uniforms: {
          uUnroll: { value: reducedMotion ? 1.0 : 0.0 },
          uTime: { value: 0.0 },
          uPixelRatio: { value: pixelRatio },
          uReducedMotion: { value: reducedMotion ? 1.0 : 0.0 },
        },
        vertexShader: ROAD_TRAIL_VERTEX,
        fragmentShader: ROAD_TRAIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        depthTest: true,
      });

      const trailPoints = new THREE.Points(trailGeo, roadTrailMaterial);
      trailPoints.frustumCulled = false;
      roadGroup.add(trailPoints);
    }
  }

  function moveCameraToRoadIndex(idx, { immediate = false } = {}) {
    if (roadEventLayouts.length === 0) return;
    const clampedIdx = Math.max(0, Math.min(roadEventLayouts.length - 1, idx));
    activeRoadEventIdx = clampedIdx;
    const targetZ = roadEventLayouts[clampedIdx].z;

    glideCameraPos.set(0, 1.85, targetZ + 12.5);
    glideTargetPos.set(0, -3.55, targetZ - 11.5);
    curveGlide = null;

    if (reducedMotion || immediate) {
      camera.position.copy(glideCameraPos);
      controls.target.copy(glideTargetPos);
      controls.update();
      glideActive = false;
    } else {
      glideActive = true;
    }

    onRoadIndexChange?.(clampedIdx, roadEventLayouts[clampedIdx].station);
  }

  function enterRoadMode(roadData, initialStationIndex = 0) {
    const stations = roadData?.stations || roadData?.events || [];
    if (!roadData || stations.length === 0) return;
    inRoadMode = true;
    activeRoadData = roadData;

    // Clear any lingering sky hover, selection ring, or threads when transitioning onto the winter road
    hoveredStar = null;
    selectedStar = null;
    activeThreads = [];
    refreshHighlights();
    onHoverStar?.(null, 0, 0);
    renderer.domElement.style.cursor = "ns-resize";

    historyGuideGroup.visible = false;
    geographyGuideGroup.visible = false;
    threadsGroup.visible = false;
    constellationGroup.visible = false;
    roadGroup.visible = true;
    controls.enableRotate = false;
    controls.enablePan = false;
    controls.enableZoom = false;

    buildRoadGeometryAndPositions(roadData);
    startPositionMorph(posRoad, { toRoadMix: 1.0, duration: 1500 });

    let startIdx = 0;
    if (
      typeof initialStationIndex === "number" &&
      Number.isFinite(initialStationIndex) &&
      initialStationIndex >= 0 &&
      initialStationIndex < stations.length
    ) {
      startIdx = Math.floor(initialStationIndex);
    }
    moveCameraToRoadIndex(startIdx, { immediate: reducedMotion });
  }

  function exitRoadMode({ targetLens = null } = {}) {
    if (!inRoadMode) return;
    inRoadMode = false;
    activeRoadData = null;
    hoveredStar = null;
    onHoverStar?.(null, 0, 0);
    renderer.domElement.style.cursor = "grab";

    if (targetLens) currentLens = targetLens;

    roadGroup.visible = false;
    threadsGroup.visible = true;
    constellationGroup.visible = true;
    historyGuideGroup.visible = currentLens === "history";
    geographyGuideGroup.visible = currentLens === "geography";
    material.uniforms.uIgnoreYearSlider.value = currentLens === "meaning" ? 0.0 : 1.0;

    controls.enableRotate = true;
    controls.enablePan = true;
    controls.enableZoom = true;

    const skyBuf = getBufferForLens(currentLens);
    startPositionMorph(skyBuf, { toRoadMix: 0.0, duration: 1500 });

    if (currentLens === "history") {
      glideTargetPos.set(0, 0, 0);
      glideCameraPos.set(0, 12, 60);
    } else if (currentLens === "geography") {
      applyGeographyCameraPose({ immediate: reducedMotion });
      return;
    } else {
      glideTargetPos.set(0, 0, 0);
      glideCameraPos.set(0, 6, 62);
    }

    curveGlide = null;
    if (reducedMotion) {
      camera.position.copy(glideCameraPos);
      controls.target.copy(glideTargetPos);
      controls.update();
      glideActive = false;
    } else {
      glideActive = true;
    }
  }

  // Wheel / drag navigation along the Talvitie winter road
  let lastWheelStepTime = 0;
  renderer.domElement.addEventListener(
    "wheel",
    (event) => {
      if (!inRoadMode) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastWheelStepTime < 220) return;
      if (Math.abs(event.deltaY) < 8) return;
      lastWheelStepTime = now;
      const step = event.deltaY > 0 ? 1 : -1;
      moveCameraToRoadIndex(activeRoadEventIdx + step);
    },
    { passive: false }
  );

  function updateEditWarAttributeForYear(yearInt) {
    if (yearInt === lastEditWarYearInt) return;
    lastEditWarYearInt = yearInt;
    for (let i = 0; i < count; i++) {
      const wars = editWarYearsByIndex[i];
      isEditWar[i] = wars.length > 0 && wars.includes(yearInt) ? 1.0 : 0.0;
    }
    editWarAttr.needsUpdate = true;
  }

  function refreshHighlights() {
    highlights.fill(0.0);
    for (let i = 0; i < searchStars.length; i++) {
      if (searchStars[i]._index !== undefined) {
        highlights[searchStars[i]._index] = 1.0;
      }
    }
    for (let i = 0; i < activeThreads.length; i++) {
      const tStar = activeThreads[i].targetStar;
      if (tStar && tStar._index !== undefined) {
        highlights[tStar._index] = 1.5;
      }
    }
    for (let i = 0; i < constellationStars.length; i++) {
      const cStar = constellationStars[i];
      if (cStar && cStar._index !== undefined) {
        highlights[cStar._index] = Math.max(highlights[cStar._index], 1.5);
      }
    }
    if (selectedStar && selectedStar._index !== undefined) {
      highlights[selectedStar._index] = 2.0;
    }
    highlightAttr.needsUpdate = true;
    material.uniforms.uHasSearch.value =
      searchStars.length > 0 || activeThreads.length > 0 ? 1.0 : 0.0;
  }

  function setYear(yearValue) {
    currentYearFloat = yearValue;
    material.uniforms.uYear.value = yearValue;
    updateEditWarAttributeForYear(Math.round(yearValue));
  }

  updateEditWarAttributeForYear(Math.round(currentYearFloat));

  // Render curved 3D Memory Threads from sourceStar to up to 4 targets
  function setThreads(sourceStar, threadsList = []) {
    clearGroup(threadsGroup);
    activeThreads = [];

    if (!sourceStar || !threadsList || threadsList.length === 0) {
      refreshHighlights();
      return;
    }

    const p0 = getStarCurrentPos(sourceStar);

    for (const t of threadsList) {
      const targetStar =
        starByKey.get(`${t.target.lang}:${t.target.page_id}`) || {
          ...t.target,
          first_edit_year: null,
          has_history: false,
        };
      const p1 = getStarCurrentPos(targetStar);
      const curve = makeArcCurve(p0, p1);
      const pts = curve.getPoints(36);
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);

      let lineMat;
      if (t.type === "ghost") {
        lineMat = new THREE.LineDashedMaterial({
          color: new THREE.Color(COLORS.frost),
          dashSize: 0.65,
          gapSize: 0.45,
          transparent: true,
          opacity: 0.85,
        });
      } else {
        const lineColor =
          t.type === "semantic" ? COLORS.lichen : COLORS.snow;
        lineMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(lineColor),
          transparent: true,
          opacity: 0.78,
        });
      }

      const line = new THREE.Line(lineGeo, lineMat);
      if (t.type === "ghost") {
        line.computeLineDistances();
      }
      threadsGroup.add(line);

      activeThreads.push({
        thread: t,
        targetStar,
        curve,
        midPoint: curve.getPoint(0.5),
      });
    }

    refreshHighlights();
  }

  function setConstellationPath(starsList = []) {
    clearGroup(constellationGroup);
    constellationStars = starsList.filter(Boolean);

    if (constellationStars.length >= 2) {
      const allPts = [];
      for (let i = 0; i < constellationStars.length - 1; i++) {
        const a = constellationStars[i];
        const b = constellationStars[i + 1];
        const curve = makeArcCurve(getStarCurrentPos(a), getStarCurrentPos(b));
        const segPts = curve.getPoints(28);
        if (i > 0) segPts.shift();
        allPts.push(...segPts);
      }

      const pathGeo = new THREE.BufferGeometry().setFromPoints(allPts);
      const pathMat = new THREE.LineBasicMaterial({
        color: new THREE.Color(COLORS.birch),
        transparent: true,
        opacity: 0.95,
      });
      const pathLine = new THREE.Line(pathGeo, pathMat);
      constellationGroup.add(pathLine);
    }

    refreshHighlights();
  }

  function glideAlongThread(fromStar, toStar) {
    if (inRoadMode || !fromStar || !toStar) return;
    selectedStar = toStar;
    refreshHighlights();

    const p0 = getStarCurrentPos(fromStar);
    const p1 = getStarCurrentPos(toStar);
    const curve = makeArcCurve(p0, p1);

    const viewDir = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
    if (viewDir.lengthSq() < 0.001) viewDir.set(0, 0.2, 1).normalize();
    const camOffset = viewDir.multiplyScalar(15.5);

    if (reducedMotion) {
      controls.target.copy(p1);
      camera.position.copy(p1).add(camOffset);
      controls.update();
      glideActive = false;
      curveGlide = null;
      return;
    }

    curveGlide = {
      curve,
      startTime: performance.now(),
      duration: 900,
      camOffset,
    };
    glideActive = false;
  }

  // Raycasting for hover and click + road drag
  const raycaster = new THREE.Raycaster();
  raycaster.params.Points.threshold = 0.85;
  const pointer = new THREE.Vector2();
  let pointerDownPos = { x: 0, y: 0 };
  let isPointerDragging = false;
  let roadDragStartY = null;

  function pickStarAtEvent(event) {
    if (inRoadMode) return null;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    const camDist = camera.position.distanceTo(controls.target);
    raycaster.params.Points.threshold = THREE.MathUtils.clamp(camDist * 0.013, 0.3, 1.1);
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObject(points, false);
    if (hits.length === 0) return null;

    const maxYear = Math.floor(currentYearFloat + 0.05);
    let bestStar = null;
    let bestMetric = Infinity;

    for (let i = 0; i < hits.length; i++) {
      const hit = hits[i];
      const star = stars[hit.index];
      if (!star) continue;
      const born = star.created_year ?? star.first_edit_year;
      if (born && born > maxYear) {
        continue;
      }
      const historyPriority = star.has_history ? -0.15 : 0;
      const metric = hit.distanceToRay + hit.distance * 0.002 + historyPriority;
      if (metric < bestMetric) {
        bestMetric = metric;
        bestStar = star;
      }
    }
    return bestStar;
  }

  renderer.domElement.addEventListener("pointerdown", (event) => {
    pointerDownPos = { x: event.clientX, y: event.clientY };
    isPointerDragging = false;
    if (inRoadMode) {
      roadDragStartY = event.clientY;
    }
  });

  renderer.domElement.addEventListener("pointermove", (event) => {
    if (inSummaryMode) return;
    if (inRoadMode) {
      if (event.buttons !== 0 && roadDragStartY !== null) {
        const dy = event.clientY - roadDragStartY;
        if (Math.abs(dy) > 48) {
          const step = dy > 0 ? 1 : -1;
          roadDragStartY = event.clientY;
          moveCameraToRoadIndex(activeRoadEventIdx + step);
        }
      }
      return;
    }

    if (event.buttons !== 0) {
      const moveDist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
      if (moveDist > 5) isPointerDragging = true;
      if (hoveredStar) {
        hoveredStar = null;
        renderer.domElement.style.cursor = "grabbing";
        onHoverStar?.(null, event.clientX, event.clientY);
      }
      return;
    }

    const star = pickStarAtEvent(event);
    hoveredStar = star;
    renderer.domElement.style.cursor = star ? "pointer" : "grab";
    onHoverStar?.(star, event.clientX, event.clientY);
  });

  renderer.domElement.addEventListener("pointerup", (event) => {
    roadDragStartY = null;
    if (inRoadMode || inSummaryMode) return;
    const moveDist = Math.hypot(event.clientX - pointerDownPos.x, event.clientY - pointerDownPos.y);
    if (!isPointerDragging && moveDist < 6 && event.button === 0) {
      const star = pickStarAtEvent(event);
      if (star) {
        selectStar(star, { glide: true });
        onSelectStar?.(star);
      }
    }
    isPointerDragging = false;
    renderer.domElement.style.cursor = hoveredStar ? "pointer" : "grab";
  });

  renderer.domElement.addEventListener("pointerleave", () => {
    roadDragStartY = null;
    isPointerDragging = false;
    if (hoveredStar) {
      hoveredStar = null;
      onHoverStar?.(null, 0, 0);
    }
    renderer.domElement.style.cursor = inRoadMode ? "ns-resize" : "grab";
  });

  const tempVec = new THREE.Vector3();
  const tempDir = new THREE.Vector3();
  const tempBox = new THREE.Box3();
  const tempSphere = new THREE.Sphere();

  function selectStar(star, { glide = true } = {}) {
    selectedStar = star;
    refreshHighlights();

    if (star && glide && !inRoadMode) {
      const starPos = getStarCurrentPos(star);
      tempDir.subVectors(camera.position, controls.target).normalize();
      if (tempDir.lengthSq() < 0.001) tempDir.set(0, 0.2, 1).normalize();

      const rightOffset = new THREE.Vector3()
        .crossVectors(camera.up, tempDir)
        .normalize()
        .multiplyScalar(-3.0);
      glideTargetPos.copy(starPos).add(rightOffset);
      glideCameraPos.copy(glideTargetPos).addScaledVector(tempDir, 15.5);

      curveGlide = null;
      if (reducedMotion) {
        controls.target.copy(glideTargetPos);
        camera.position.copy(glideCameraPos);
        controls.update();
        glideActive = false;
      } else {
        glideActive = true;
      }
    }
  }

  function setSearchResults(matchedStars, { glide = true } = {}) {
    searchStars = matchedStars || [];
    refreshHighlights();

    if (searchStars.length > 0 && glide && !inRoadMode) {
      tempBox.makeEmpty();
      for (const s of searchStars) {
        tempBox.expandByPoint(getStarCurrentPos(s));
      }
      tempBox.getBoundingSphere(tempSphere);

      tempDir.subVectors(camera.position, controls.target).normalize();
      if (tempDir.lengthSq() < 0.001) tempDir.set(0, 0.15, 1).normalize();

      const fitDist = THREE.MathUtils.clamp(tempSphere.radius * 2.35, 16, 68);
      glideTargetPos.copy(tempSphere.center);
      glideCameraPos.copy(tempSphere.center).addScaledVector(tempDir, fitDist);

      curveGlide = null;
      if (reducedMotion) {
        controls.target.copy(glideTargetPos);
        camera.position.copy(glideCameraPos);
        controls.update();
        glideActive = false;
      } else {
        glideActive = true;
      }
    }
  }

  const projVec = new THREE.Vector3();
  function computeProjectedLabels() {
    if (!onFrameLabelsUpdate) return;
    const width = window.innerWidth;
    const height = window.innerHeight;

    if (inSummaryMode) {
      onFrameLabelsUpdate({
        width,
        height,
        starLabels: [],
        threadLabels: [],
        skyClusterRoads: [],
        historyGuides: [],
        geographyGuides: [],
        roadYearLabels: [],
        roadGhostLabels: [],
        roadBranchLabels: [],
        roadPostLabels: [],
        roadGapLabels: [],
      });
      return;
    }

    // In Talvitie road mode: project right-edge historical year numerals, ghost station spurs, compressed gap badges, and active branch markers
    if (inRoadMode) {
      const roadYearLabels = [];
      const roadGhostLabels = [];
      const roadBranchLabels = [];
      const roadGapLabels = [];

      const activeCardEl = document.querySelector("#road-cards-stage .road-card.is-nearest");
      const firstCardEl = document.querySelector("#road-cards-stage .road-card");
      const activeCardRect = activeCardEl ? activeCardEl.getBoundingClientRect() : null;
      const firstCardRect = firstCardEl ? firstCardEl.getBoundingClientRect() : null;
      const hasCardRect = Boolean(activeCardRect && activeCardRect.width > 40);
      const isReadingCard = Boolean(
        activeCardEl && activeCardEl.closest(".road-perspective-deck.is-reading")
      );

      const centerX = width * 0.5;
      const halfCardW = Math.min(335, (width - 56) * 0.5);
      const cardLeft = hasCardRect ? activeCardRect.left : centerX - halfCardW;
      const cardRight = hasCardRect ? activeCardRect.right : centerX + halfCardW;
      const cardTop = hasCardRect ? activeCardRect.top : height - 365;
      const deckTop =
        firstCardRect && firstCardRect.width > 40 ? Math.min(firstCardRect.top, cardTop) : cardTop;

      // Priority order: active station FIRST so it never gets dropped during vertical dedup
      const yearOrder = [
        activeRoadEventIdx,
        activeRoadEventIdx + 1,
        activeRoadEventIdx + 2,
        activeRoadEventIdx + 3,
        activeRoadEventIdx - 1,
      ].filter((idx, pos, arr) => idx >= 0 && idx < roadEventLayouts.length && arr.indexOf(idx) === pos);

      for (const i of yearOrder) {
        if (roadYearLabels.length >= 4) break;
        const layout = roadEventLayouts[i];
        if (!layout.yearLabel) continue;

        projVec.copy(layout.yearAnchor).project(camera);
        if (projVec.z < -1 || projVec.z > 0.992) continue;

        let x = (projVec.x + 1) * 0.5 * width;
        const y = (-projVec.y + 1) * 0.5 * height;
        if (y < 76 || y > height - 148) continue;

        if (y >= deckTop - 16 && x < cardRight + 16) {
          if (cardRight + 96 < width) {
            x = cardRight + 16;
          } else {
            continue;
          }
        }
        x = Math.min(width - 96, Math.max(20, x));

        if (roadYearLabels.some((existing) => Math.abs(existing.y - y) < 34)) {
          continue;
        }

        roadYearLabels.push({
          index: layout.index,
          year: layout.yearLabel,
          label: layout.yearLabel,
          years: layout.station.years || (layout.station.event_year ? [layout.station.event_year] : []),
          isCurrent: layout.index === activeRoadEventIdx,
          x,
          y,
        });
      }

      // Compressed >30-year gaps (Option A Topic Road)
      for (const gAnchor of roadGapAnchors) {
        if (roadGapLabels.length >= 2) break;
        if (gAnchor.eventIndex < activeRoadEventIdx - 1 || gAnchor.eventIndex > activeRoadEventIdx + 3) {
          continue;
        }
        projVec.copy(gAnchor.pos).project(camera);
        if (projVec.z < -1 || projVec.z > 0.992) continue;
        const gx = (projVec.x + 1) * 0.5 * width;
        const gy = (-projVec.y + 1) * 0.5 * height;
        if (gy < 76 || gy > deckTop - 24 || gx < 40 || gx > width - 140) continue;
        if (roadGapLabels.some((g) => Math.abs(g.y - gy) < 32)) continue;
        roadGapLabels.push({
          label: gAnchor.label,
          x: gx - 48,
          y: gy,
        });
      }

      // Project Ghost Stations (`ghost_stations`) cleanly along left shoulder before branches
      const ghostMaxW = 205;
      for (const gAnchor of roadGhostAnchors) {
        if (roadGhostLabels.length >= 2) break;
        if (Math.abs(gAnchor.parentIndex - activeRoadEventIdx) > 2) continue;
        projVec.copy(gAnchor.pos).project(camera);
        if (projVec.z < -1 || projVec.z > 0.992) continue;
        let x = (projVec.x + 1) * 0.5 * width;
        let y = (-projVec.y + 1) * 0.5 * height;
        if (y < 78 || y > height - 155) continue;

        if (y >= deckTop - 28 && x + ghostMaxW > cardLeft - 12 && x < cardRight + 12) {
          if (cardLeft - ghostMaxW - 14 >= 16) {
            x = Math.min(x, cardLeft - ghostMaxW - 14);
          } else {
            y = Math.max(78, deckTop - 36);
          }
        }
        x = Math.max(16, Math.min(width - ghostMaxW - 16, x));
        if (y >= deckTop - 26 && x + ghostMaxW > cardLeft - 10 && x < cardRight + 10) continue;
        if (roadGhostLabels.some((g) => Math.abs(g.y - y) < 34)) continue;

        roadGhostLabels.push({
          ghost: gAnchor.ghost,
          index: gAnchor.index,
          label: gAnchor.label,
          x,
          y,
        });
      }

      // Branches for current active station only; suppressed while reader/ghost modal covers upper vista
      const activeLayout = roadEventLayouts[activeRoadEventIdx];
      const branchMaxW = 224;
      if (activeLayout && !isReadingCard) {
        for (const bAnchor of activeLayout.branchAnchors) {
          projVec.copy(bAnchor.endPos).project(camera);
          if (projVec.z < -1 || projVec.z > 0.992) continue;
          let bx = (projVec.x + 1) * 0.5 * width;
          let by = (-projVec.y + 1) * 0.5 * height;
          if (by < 78 || by > height - 156) continue;

          // Keep projected pills completely outside live card / deck bounds and viewport right edge
          const overlapsCard =
            by + 30 > deckTop - 16 && bx + branchMaxW > cardLeft - 14 && bx < cardRight + 14;
          if (overlapsCard) {
            if (bAnchor.sideSign < 0 && cardLeft - branchMaxW - 16 >= 16) {
              bx = cardLeft - branchMaxW - 16;
            } else if (bAnchor.sideSign >= 0 && cardRight + 16 + branchMaxW <= width - 16) {
              bx = cardRight + 16;
            } else if (cardLeft - branchMaxW - 16 >= 16) {
              bx = cardLeft - branchMaxW - 16;
            } else {
              by = deckTop - 38;
            }
          }

          bx = Math.max(16, Math.min(width - branchMaxW - 16, bx));

          // Re-verify vertical clearance against years, ghosts, and sibling branches
          const hasCollision = (candX, candY) =>
            roadYearLabels.some(
              (ry) => Math.abs(ry.y - candY) < 38 && Math.abs(ry.x - candX) < branchMaxW
            ) ||
            roadGhostLabels.some(
              (rg) => Math.abs(rg.y - candY) < 38 && Math.abs(rg.x - candX) < branchMaxW
            ) ||
            roadBranchLabels.some(
              (rb) => Math.abs(rb.y - candY) < 38 && Math.abs(rb.x - candX) < branchMaxW
            );

          if (hasCollision(bx, by)) {
            if (by - 40 >= 78 && !hasCollision(bx, by - 40)) {
              by -= 40;
            } else if (by + 40 <= height - 156 && !hasCollision(bx, by + 40)) {
              by += 40;
            } else {
              continue;
            }
          }

          if (by < 78 || by > height - 156) continue;
          if (by + 30 > deckTop - 14 && bx + branchMaxW > cardLeft - 12 && bx < cardRight + 12) {
            continue;
          }

          roadBranchLabels.push({
            branch: bAnchor.branch,
            stationIndex: activeLayout.index,
            eventIndex: activeLayout.index,
            x: bx,
            y: by,
          });
        }
      }

      onFrameLabelsUpdate({
        starLabels: [],
        threadLabels: [],
        clusterLabels: [],
        lensGuideLabels: [],
        roadYearLabels,
        roadGhostLabels,
        roadBranchLabels,
        roadPostLabels: [],
        roadGapLabels,
      });
      return;
    }

    const starLabels = [];
    const seen = new Set();
    const candidates = [];

    if (selectedStar) candidates.push({ star: selectedStar, isSelected: true });
    for (const s of searchStars) candidates.push({ star: s, isSelected: false });
    for (const t of activeThreads) {
      if (t.targetStar) {
        candidates.push({
          star: t.targetStar,
          isSelected: false,
          threadType: t.thread.type,
        });
      }
    }

    const rightMargin = selectedStar && width > 900 ? 665 : 210;

    for (const item of candidates) {
      const s = item.star;
      const pk = `${s.lang}:${s.page_id}`;
      if (seen.has(pk)) continue;
      seen.add(pk);

      const pos3 = getStarCurrentPos(s);
      projVec.copy(pos3).project(camera);
      if (projVec.z >= -1 && projVec.z <= 1) {
        const x = (projVec.x + 1) * 0.5 * width;
        const y = (-projVec.y + 1) * 0.5 * height;
        if (x < 28 || x > width - rightMargin || y < 86 || y > height - 165) continue;
        if (x < 550 && y < 210) continue;
        starLabels.push({
          star: s,
          x,
          y,
          isSelected: item.isSelected,
          threadType: item.threadType || null,
        });
      }
    }

    starLabels.sort((a, b) => a.y - b.y);
    for (let i = 1; i < starLabels.length; i++) {
      for (let j = 0; j < i; j++) {
        const dx = Math.abs(starLabels[i].x - starLabels[j].x);
        const dy = starLabels[i].y - starLabels[j].y;
        if (dx < 205 && dy >= 0 && dy < 30) {
          starLabels[i].y = starLabels[j].y + 30;
        }
      }
    }

    const threadLabels = [];
    for (const t of activeThreads) {
      projVec.copy(t.midPoint).project(camera);
      if (projVec.z >= -1 && projVec.z <= 1) {
        const x = (projVec.x + 1) * 0.5 * width;
        const y = (-projVec.y + 1) * 0.5 * height;
        if (x < 40 || x > width - rightMargin || y < 90 || y > height - 165) continue;
        if (x < 550 && y < 210) continue;

        const collidesStar = starLabels.some(
          (sl) => Math.abs(sl.x + 70 - x) < 120 && Math.abs(sl.y - y) < 28
        );
        const collidesThread = threadLabels.some(
          (tl) => Math.abs(tl.x - x) < 130 && Math.abs(tl.y - y) < 26
        );
        if (collidesStar || collidesThread) continue;

        threadLabels.push({
          thread: t.thread,
          targetStar: t.targetStar,
          x,
          y,
        });
      }
    }

    // Project clickable cluster road labels in "meaning" lens when no search/selection is active
    const clusterLabels = [];
    if (
      currentLens === "meaning" &&
      !selectedStar &&
      searchStars.length === 0 &&
      activeThreads.length === 0
    ) {
      for (const cl of SKY_CLUSTER_ROADS) {
        projVec.set(cl.pos[0], cl.pos[1], cl.pos[2]).project(camera);
        if (projVec.z >= -1 && projVec.z <= 1) {
          const x = (projVec.x + 1) * 0.5 * width;
          const y = (-projVec.y + 1) * 0.5 * height;
          if (x > 80 && x < width - 220 && y > 130 && y < height - 180) {
            clusterLabels.push({
              ...cl,
              x,
              y,
            });
          }
        }
      }
    }

    // Project lens guide labels when in "history" or "geography" lens
    const lensGuideLabels = [];
    if (currentLens === "history" || currentLens === "geography") {
      if (!cachedSafeArea && typeof document !== "undefined") {
        refreshUiMetrics();
      }
      const anchors =
        currentLens === "history" ? HISTORY_GUIDE_ANCHORS : GEO_GUIDE_ANCHORS;
      const placedRects = [];
      const GUIDE_LABEL_NUDGES = [[0, 0], [-14, 0], [14, 0], [-26, 0], [26, 0], [0, -14], [0, 14]];
      for (const anc of anchors) {
        projVec.copy(anc.pos).project(camera);
        if (projVec.z < -1 || projVec.z > 1) continue;
        const baseX = (projVec.x + 1) * 0.5 * width;
        const baseY = (-projVec.y + 1) * 0.5 * height;
        const bw = anc.boxW || 80;
        const bh = anc.boxH || 26;
        // Spec 033: a label that collides (Turku next to Helsinki on a small portrait map) is nudged
        // sideways/up/down before it is dropped. Offset 0 comes first, so uncrowded layouts are unchanged.
        for (const [dx, dy] of GUIDE_LABEL_NUDGES) {
          const x = baseX + dx;
          const y = baseY + dy;
          const rx = Math.round(x);
          const ry = Math.round(y);
          const rect = {
            left: rx - bw * 0.5,
            right: rx + bw * 0.5,
            top: ry - bh * 0.5,
            bottom: ry + bh * 0.5,
          };
          if (
            rect.left < 2 ||
            rect.right > width - 2 ||
            rect.top < 2 ||
            rect.bottom > height - 2
          ) {
            continue;
          }
          if (cachedExclusionRects.some((ui) => rectsIntersect(rect, ui, 2))) continue;
          if (placedRects.some((prev) => rectsIntersect(rect, prev, 1))) continue;
          placedRects.push(rect);
          lensGuideLabels.push({ label: anc.label, x, y });
          break;
        }
      }
    }

    onFrameLabelsUpdate({
      starLabels,
      threadLabels,
      clusterLabels,
      lensGuideLabels,
      roadYearLabels: [],
      roadGhostLabels: [],
      roadBranchLabels: [],
      roadPostLabels: [],
      roadGapLabels: [],
    });
  }

  const timer = new THREE.Timer();
  timer.connect(document);

  function animate() {
    timer.update();
    const delta = Math.min(timer.getDelta(), 0.1);
    const elapsed = timer.getElapsed();

    material.uniforms.uTime.value = elapsed;
    if (roadTrailMaterial) {
      roadTrailMaterial.uniforms.uTime.value = elapsed;
    }

    // Update 1.5s GPU morph between lenses or into/out of Talvitie road
    if (morphState) {
      const rawT = Math.min(
        1,
        (performance.now() - morphState.startTime) / morphState.duration
      );
      // Cubic ease-in-out
      const eased =
        rawT < 0.5
          ? 4 * rawT * rawT * rawT
          : 1 - Math.pow(-2 * rawT + 2, 3) / 2;

      material.uniforms.uMorphT.value = eased;
      const roadMix = THREE.MathUtils.lerp(
        morphState.fromRoadMix,
        morphState.toRoadMix,
        eased
      );
      material.uniforms.uRoadModeMix.value = roadMix;
      if (iceRoadMaterial) {
        iceRoadMaterial.uniforms.uOpacity.value = Math.max(0.25, roadMix);
      }
      if (roadTrailMaterial) {
        roadTrailMaterial.uniforms.uUnroll.value = roadMix;
      }

      if (rawT >= 1) {
        for (let i = 0; i < count * 3; i++) {
          positions[i] = posTo[i];
        }
        positionAttr.needsUpdate = true;
        geometry.computeBoundingSphere();
        material.uniforms.uMorphT.value = 0.0;
        material.uniforms.uRoadModeMix.value = morphState.toRoadMix;
        if (iceRoadMaterial) {
          iceRoadMaterial.uniforms.uOpacity.value = 1.0;
        }
        if (roadTrailMaterial) {
          roadTrailMaterial.uniforms.uUnroll.value = morphState.toRoadMix;
        }
        morphState = null;
      }
    }

    if (summaryCamTween) {
      const t = Math.min(1, (performance.now() - summaryCamTween.startTime) / summaryCamTween.duration);
      const eased =
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      camera.position.lerpVectors(summaryCamTween.fromPos, summaryCamTween.toPos, eased);
      controls.target.lerpVectors(summaryCamTween.fromTarget, summaryCamTween.toTarget, eased);
      if (t >= 1) {
        summaryCamTween = null;
      }
    } else if (curveGlide) {
      const t = Math.min(1, (performance.now() - curveGlide.startTime) / curveGlide.duration);
      const eased = THREE.MathUtils.smoothstep(t, 0, 1);
      const posOnCurve = curveGlide.curve.getPoint(eased);
      controls.target.copy(posOnCurve);
      camera.position.copy(posOnCurve).add(curveGlide.camOffset);
      if (t >= 1) {
        curveGlide = null;
      }
    } else if (glideActive) {
      const dampLambda = 5.5;
      controls.target.x = THREE.MathUtils.damp(controls.target.x, glideTargetPos.x, dampLambda, delta);
      controls.target.y = THREE.MathUtils.damp(controls.target.y, glideTargetPos.y, dampLambda, delta);
      controls.target.z = THREE.MathUtils.damp(controls.target.z, glideTargetPos.z, dampLambda, delta);

      camera.position.x = THREE.MathUtils.damp(camera.position.x, glideCameraPos.x, dampLambda, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, glideCameraPos.y, dampLambda, delta);
      camera.position.z = THREE.MathUtils.damp(camera.position.z, glideCameraPos.z, dampLambda, delta);

      if (
        controls.target.distanceToSquared(glideTargetPos) < 0.01 &&
        camera.position.distanceToSquared(glideCameraPos) < 0.02
      ) {
        glideActive = false;
      }
    }

    controls.update(delta);
    if (inRoadMode && roadDepthFadeEntries.length > 0) {
      const camZ = camera.position.z;
      for (let i = 0; i < roadDepthFadeEntries.length; i++) {
        const entry = roadDepthFadeEntries[i];
        const fade = THREE.MathUtils.smoothstep(camZ - entry.z, 9.0, 11.8);
        entry.mat.opacity = entry.baseOpacity * fade;
        entry.obj.visible = fade > 0.015;
      }
    }
    renderer.render(scene, camera);
    if (inSummaryMode && summaryCards.length > 0) {
      const now = performance.now();
      const elapsed = Math.max(0, now - summaryEnterTime);
      const width = window.innerWidth;
      const height = window.innerHeight;
      const fovPx = camera.projectionMatrix.elements[5] * (height * 0.5);

      if (summarySpineLine && summarySpinePointCount > 0) {
        const totalSpineMs = reducedMotion ? 1 : Math.min(820, 260 + summaryCards.length * 48);
        const spineT = reducedMotion ? 1 : Math.min(1, elapsed / totalSpineMs);
        summarySpineLine.geometry.setDrawRange(
          0,
          Math.max(2, Math.round(summarySpinePointCount * spineT))
        );
      }

      let focusedScreenPayload = { visible: false };
      for (let i = 0; i < summaryCards.length; i++) {
        const card = summaryCards[i];
        let unfoldT = 1;
        if (!reducedMotion && card.unfoldDurMs > 0) {
          const localElapsed = Math.max(0, elapsed - card.delayMs);
          const raw = Math.min(1, localElapsed / card.unfoldDurMs);
          unfoldT = 1 - Math.pow(1 - raw, 3);
        }
        card.currentPos.lerpVectors(summaryOriginPos, card.anchorPos, unfoldT);
        card.cssObj.position.copy(card.currentPos);
        card.cssObj.quaternion.copy(camera.quaternion);

        const diff = i - summaryFocusIdx;
        if (diff === 0) {
          // Focused card renders as a crisp pixel-snapped screen-space HTML overlay
          card.cssObj.visible = false;
          summaryProjVec.copy(card.currentPos).project(camera);
          if (summaryProjVec.z >= -1 && summaryProjVec.z <= 1) {
            const sx = (summaryProjVec.x + 1) * 0.5 * width;
            const sy = (-summaryProjVec.y + 1) * 0.5 * height;
            focusedScreenPayload = {
              visible: unfoldT > 0.01,
              x: sx,
              y: sy,
              opacity: unfoldT,
              scale: reducedMotion ? 1 : 0.72 + 0.28 * unfoldT,
            };
          }
        } else if (diff < 0 || unfoldT <= 0.01) {
          // Cards behind the camera (or not yet unfolded) stay hidden
          card.cssObj.visible = false;
        } else {
          const distToCam = Math.max(1.5, card.currentPos.distanceTo(camera.position));
          const relScale =
            diff === 1
              ? 0.78
              : diff === 2
                ? 0.64
                : Math.max(0.42, 0.58 - (diff - 3) * 0.035);
          const worldScale = (distToCam / Math.max(1, fovPx)) * relScale * (0.35 + 0.65 * unfoldT);
          card.cssObj.scale.setScalar(worldScale);
          card.cssObj.visible = true;
        }
      }

      if (css3dRenderer) {
        css3dRenderer.render(css3dScene, camera);
      }
      onSummaryFocusScreenUpdate?.(focusedScreenPayload);
    }
    computeProjectedLabels();
  }

  renderer.setAnimationLoop(animate);

  if (typeof document !== "undefined") {
    refreshUiMetrics();
    document.fonts?.ready?.then(() => refreshUiMetrics());
    if (typeof ResizeObserver !== "undefined") {
      const uiResizeObserver = new ResizeObserver((entries) => {
        const prevTop = cachedSafeArea?.top;
        const prevBottom = cachedSafeArea?.bottom;
        refreshUiMetrics();
        if (
          currentLens === "geography" &&
          !inRoadMode &&
          !inSummaryMode &&
          (cachedSafeArea?.top !== prevTop || cachedSafeArea?.bottom !== prevBottom) &&
          entries.some((e) => e.target.id === "sky-top-bar" || e.target.id === "timeslider-root")
        ) {
          applyGeographyCameraPose({ immediate: reducedMotion || !glideActive });
        }
      });
      for (const id of UI_EXCLUSION_IDS) {
        const el = document.getElementById(id);
        if (el) uiResizeObserver.observe(el);
      }
    }
    if (typeof MutationObserver !== "undefined") {
      const uiAttrObserver = new MutationObserver(() => {
        refreshUiMetrics();
      });
      for (const id of UI_EXCLUSION_IDS) {
        const el = document.getElementById(id);
        if (el) {
          uiAttrObserver.observe(el, { attributes: true, attributeFilter: ["hidden"] });
        }
      }
    }
  }

  window.addEventListener("resize", () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const pr = Math.min(window.devicePixelRatio || 1, 2);
    renderer.setPixelRatio(pr);
    renderer.setSize(w, h);
    if (css3dRenderer) {
      css3dRenderer.setSize(w, h);
    }
    material.uniforms.uPixelRatio.value = pr;
    if (roadTrailMaterial) {
      roadTrailMaterial.uniforms.uPixelRatio.value = pr;
    }
    refreshUiMetrics();
    applyUnlocatedLayout(
      w < h,
      currentLens === "geography" && !inRoadMode && !inSummaryMode
    );
    if (currentLens === "geography" && !inRoadMode && !inSummaryMode) {
      applyGeographyCameraPose({ immediate: true });
    }
  });

  return {
    setYear,
    setLens,
    getCurrentLens() {
      return currentLens;
    },
    enterRoadMode,
    exitRoadMode,
    isRoadMode() {
      return inRoadMode;
    },
    setRoadEventIndex(idx) {
      moveCameraToRoadIndex(idx);
    },
    getRoadEventIndex() {
      return activeRoadEventIdx;
    },
    setRoadStationIndex(idx) {
      moveCameraToRoadIndex(idx);
    },
    getRoadStationIndex() {
      return activeRoadEventIdx;
    },
    selectStar,
    setSearchResults,
    setThreads,
    setConstellationPath,
    glideAlongThread,
    getStarByKey(lang, pageId) {
      return starByKey.get(`${lang}:${Number(pageId)}`) || null;
    },
    isEditWarInYear(star, yearInt) {
      if (!star || star._index === undefined) return false;
      return editWarYearsByIndex[star._index]?.includes(yearInt) || false;
    },
    setReducedMotion(val) {
      reducedMotion = Boolean(val);
      material.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      if (roadTrailMaterial) {
        roadTrailMaterial.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      }
    },
    enterSummaryTrail,
    updateSummaryTrailItems,
    setSummaryFocusIndex,
    exitSummaryTrail,
    isSummaryTrailMode() {
      return inSummaryMode;
    },
    getSummaryFocusIndex() {
      return summaryFocusIdx;
    },
    getSummaryCardCount() {
      return summaryCards.length;
    },
    getRendererInfo() {
      return renderer.info;
    },
    getGeographyOutlineScreenBbox() {
      const w = typeof window !== "undefined" ? window.innerWidth : 1280;
      const h = typeof window !== "undefined" ? window.innerHeight : 720;
      const v = new THREE.Vector3();
      let minX = Infinity;
      let maxX = -Infinity;
      let minY = Infinity;
      let maxY = -Infinity;
      for (const [lat, lon] of FINLAND_BORDER_LATLON) {
        const [gx, gy, gz] = latLonToGeoPoint(lat, lon, -0.2);
        v.set(gx, gy, gz).project(camera);
        const sx = (v.x + 1) * 0.5 * w;
        const sy = (-v.y + 1) * 0.5 * h;
        minX = Math.min(minX, sx);
        maxX = Math.max(maxX, sx);
        minY = Math.min(minY, sy);
        maxY = Math.max(maxY, sy);
      }
      const layout = getUnlocatedLayout(isPortraitGeo);
      let uMinX = Infinity;
      let uMaxX = -Infinity;
      let uMinY = Infinity;
      let uMaxY = -Infinity;
      for (const [ux, uy] of [
        [layout.cx - layout.rCircle, layout.cy],
        [layout.cx + layout.rCircle, layout.cy],
        [layout.cx, layout.cy - layout.rCircle],
        [layout.cx, layout.cy + layout.rCircle],
      ]) {
        v.set(ux, uy, 0).project(camera);
        const sx = (v.x + 1) * 0.5 * w;
        const sy = (-v.y + 1) * 0.5 * h;
        uMinX = Math.min(uMinX, sx);
        uMaxX = Math.max(uMaxX, sx);
        uMinY = Math.min(uMinY, sy);
        uMaxY = Math.max(uMaxY, sy);
      }
      return {
        outlineBbox: { minX, maxX, minY, maxY, width: maxX - minX, height: maxY - minY },
        unlocatedBbox: { minX: uMinX, maxX: uMaxX, minY: uMinY, maxY: uMaxY },
        safeArea: cachedSafeArea,
        isPortraitGeo,
        cameraPos: camera.position.toArray(),
      };
    },
  };
}
