const GRID_SIZE = 20;
const MOVE_INTERVAL_MS = 85;
const CANVAS_SIZE = 1000;
const CELL_SIZE = CANVAS_SIZE / GRID_SIZE;
const PAUSE_AFTER_MOUSE_MOVE_MS = 1600;
const ENGAGED_MODE_MAX_LENGTH = 90;

const THEMES = {
  neon: {
    pageBg: 'radial-gradient(circle at 20% 20%, #102444 0%, #050814 60%, #02030a 100%)',
    panelBg: 'rgba(8, 16, 34, 0.75)',
    panelBorder: 'rgba(104, 174, 255, 0.32)',
    panelText: 'rgba(219, 235, 255, 0.95)',
    boardFill: '#071327',
    gridStroke: 'rgba(116, 163, 224, 0.16)',
    foodFill: '#ff5c8a',
    foodGlow: '#ff5c8a',
    headFill: '#74ffd2',
    headGlow: '#66ffcc',
    bodyHueStart: 150,
    bodyGlow: 'rgba(84, 255, 198, 0.3)'
  },
  sunset: {
    pageBg: 'radial-gradient(circle at 20% 20%, #3a1736 0%, #1f1027 55%, #0d0a15 100%)',
    panelBg: 'rgba(35, 16, 39, 0.74)',
    panelBorder: 'rgba(255, 174, 193, 0.38)',
    panelText: 'rgba(255, 233, 240, 0.96)',
    boardFill: '#1f1124',
    gridStroke: 'rgba(255, 174, 193, 0.14)',
    foodFill: '#ff9a4f',
    foodGlow: '#ff9a4f',
    headFill: '#ffd770',
    headGlow: '#ffd770',
    bodyHueStart: 320,
    bodyGlow: 'rgba(255, 159, 201, 0.32)'
  },
  mono: {
    pageBg: 'radial-gradient(circle at 20% 20%, #313131 0%, #141414 60%, #090909 100%)',
    panelBg: 'rgba(24, 24, 24, 0.76)',
    panelBorder: 'rgba(195, 195, 195, 0.35)',
    panelText: 'rgba(241, 241, 241, 0.95)',
    boardFill: '#151515',
    gridStroke: 'rgba(181, 181, 181, 0.14)',
    foodFill: '#f2f2f2',
    foodGlow: '#f2f2f2',
    headFill: '#efefef',
    headGlow: '#ffffff',
    bodyHueStart: 0,
    bodyGlow: 'rgba(221, 221, 221, 0.3)'
  }
};

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const pauseOverlay = document.getElementById('pauseOverlay');
const appRoot = document.querySelector('.app');
const appleCountSelect = document.getElementById('appleCountSelect');
const themeSelect = document.getElementById('themeSelect');

function cellKey({ x, y }) {
  return `${x},${y}`;
}

function buildHamiltonianCycle(width, height) {
  if (height % 2 !== 0) {
    throw new Error('Hamiltonian cycle builder requires even grid height.');
  }

  const cycle = [{ x: 0, y: 0 }];

  for (let x = 1; x < width; x += 1) {
    cycle.push({ x, y: 0 });
  }

  for (let y = 1; y < height; y += 1) {
    if (y % 2 === 1) {
      for (let x = width - 1; x >= 1; x -= 1) {
        cycle.push({ x, y });
      }
    } else {
      for (let x = 1; x < width; x += 1) {
        cycle.push({ x, y });
      }
    }
  }

  for (let y = height - 1; y >= 1; y -= 1) {
    cycle.push({ x: 0, y });
  }

  return cycle;
}

function getNeighbors(point) {
  return [
    { x: point.x + 1, y: point.y },
    { x: point.x - 1, y: point.y },
    { x: point.x, y: point.y + 1 },
    { x: point.x, y: point.y - 1 }
  ].filter(({ x, y }) => x >= 0 && x < GRID_SIZE && y >= 0 && y < GRID_SIZE);
}

function hasPath(start, target, blocked) {
  const queue = [start];
  const visited = new Set([cellKey(start)]);

  while (queue.length > 0) {
    const current = queue.shift();

    if (current.x === target.x && current.y === target.y) {
      return true;
    }

    getNeighbors(current).forEach((neighbor) => {
      const key = cellKey(neighbor);
      if (visited.has(key) || blocked.has(key)) {
        return;
      }

      visited.add(key);
      queue.push(neighbor);
    });
  }

  return false;
}

const cycle = buildHamiltonianCycle(GRID_SIZE, GRID_SIZE);
const cycleLookup = new Map(cycle.map((point, index) => [cellKey(point), index]));

let snake = [{ ...cycle[0] }, { ...cycle[cycle.length - 1] }, { ...cycle[cycle.length - 2] }, { ...cycle[cycle.length - 3] }];
let previousSnake = snake.map((segment) => ({ ...segment }));
let foods = [];
let appleTargetCount = Number.parseInt(appleCountSelect.value, 10) || 1;
let currentTheme = THEMES[themeSelect.value] || THEMES.neon;

let lastTick = performance.now();
let pausedUntil = 0;

function getAvailableFoodCells() {
  const occupied = new Set(snake.map(cellKey));
  foods.forEach((food) => occupied.add(cellKey(food)));
  return cycle.filter((point) => !occupied.has(cellKey(point)));
}

function syncFoodCount() {
  while (foods.length > appleTargetCount) {
    foods.pop();
  }

  while (foods.length < appleTargetCount) {
    const candidates = getAvailableFoodCells();
    if (candidates.length === 0) {
      break;
    }

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    foods.push({ ...selected });
  }
}

function getNearestFood(point) {
  if (foods.length === 0) {
    return null;
  }

  return foods.reduce((best, candidate) => {
    if (!best) {
      return candidate;
    }

    const bestDist = Math.abs(best.x - point.x) + Math.abs(best.y - point.y);
    const candidateDist = Math.abs(candidate.x - point.x) + Math.abs(candidate.y - point.y);
    return candidateDist < bestDist ? candidate : best;
  }, null);
}

function chooseEngagedMove(cycleNext) {
  const targetFood = getNearestFood(snake[0]);
  if (!targetFood || snake.length >= ENGAGED_MODE_MAX_LENGTH || appleTargetCount !== 1) {
    return cycleNext;
  }

  const occupied = new Set(snake.slice(0, -1).map(cellKey));
  const candidates = getNeighbors(snake[0]).filter((candidate) => !occupied.has(cellKey(candidate)));

  if (candidates.length === 0) {
    return cycleNext;
  }

  const safeCandidates = candidates.filter((candidate) => {
    const willGrow = foods.some((food) => food.x === candidate.x && food.y === candidate.y);
    const simulatedSnake = [{ ...candidate }, ...snake.map((segment) => ({ ...segment }))];

    if (!willGrow) {
      simulatedSnake.pop();
    }

    const simKeys = simulatedSnake.map(cellKey);
    if (new Set(simKeys).size !== simKeys.length) {
      return false;
    }

    const simulatedTail = simulatedSnake[simulatedSnake.length - 1];
    const blocked = new Set(simulatedSnake.slice(0, -1).map(cellKey));

    return hasPath(candidate, simulatedTail, blocked);
  });

  const ranked = (safeCandidates.length > 0 ? safeCandidates : candidates).sort((a, b) => {
    const aFoodDist = Math.abs(a.x - targetFood.x) + Math.abs(a.y - targetFood.y);
    const bFoodDist = Math.abs(b.x - targetFood.x) + Math.abs(b.y - targetFood.y);

    if (aFoodDist !== bFoodDist) {
      return aFoodDist - bFoodDist;
    }

    const aCycleDist = (cycleLookup.get(cellKey(a)) - cycleLookup.get(cellKey(snake[0])) + cycle.length) % cycle.length;
    const bCycleDist = (cycleLookup.get(cellKey(b)) - cycleLookup.get(cellKey(snake[0])) + cycle.length) % cycle.length;
    return aCycleDist - bCycleDist;
  });

  return ranked[0] || cycleNext;
}

function moveSnake() {
  previousSnake = snake.map((segment) => ({ ...segment }));

  const head = snake[0];
  const cycleIndex = cycleLookup.get(cellKey(head));
  const cycleNext = cycle[(cycleIndex + 1) % cycle.length];
  const next = chooseEngagedMove(cycleNext);

  snake.unshift({ ...next });

  const eatenFoodIndex = foods.findIndex((food) => food.x === next.x && food.y === next.y);
  if (eatenFoodIndex >= 0) {
    foods.splice(eatenFoodIndex, 1);
    syncFoodCount();
  } else {
    snake.pop();
  }

  if (previousSnake.length < snake.length) {
    previousSnake.push({ ...snake[snake.length - 1] });
  }
}

function roundedRect(x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function applyTheme(themeName) {
  currentTheme = THEMES[themeName] || THEMES.neon;
  document.body.style.setProperty('--page-bg', currentTheme.pageBg);
  document.body.style.setProperty('--panel-bg', currentTheme.panelBg);
  document.body.style.setProperty('--panel-border', currentTheme.panelBorder);
  document.body.style.setProperty('--panel-text', currentTheme.panelText);
}

function draw(progress) {
  ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.fillStyle = currentTheme.boardFill;
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

  ctx.strokeStyle = currentTheme.gridStroke;
  ctx.lineWidth = 1;
  for (let i = 1; i < GRID_SIZE; i += 1) {
    const position = i * CELL_SIZE;
    ctx.beginPath();
    ctx.moveTo(position, 0);
    ctx.lineTo(position, CANVAS_SIZE);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, position);
    ctx.lineTo(CANVAS_SIZE, position);
    ctx.stroke();
  }

  foods.forEach((food) => {
    const fx = food.x * CELL_SIZE;
    const fy = food.y * CELL_SIZE;
    const pad = CELL_SIZE * 0.2;
    roundedRect(fx + pad, fy + pad, CELL_SIZE - pad * 2, CELL_SIZE - pad * 2, CELL_SIZE * 0.22);
    ctx.fillStyle = currentTheme.foodFill;
    ctx.shadowColor = currentTheme.foodGlow;
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  snake.forEach((segment, index) => {
    const prev = previousSnake[index] || segment;
    const x = (prev.x + (segment.x - prev.x) * progress) * CELL_SIZE;
    const y = (prev.y + (segment.y - prev.y) * progress) * CELL_SIZE;
    const padding = index === 0 ? CELL_SIZE * 0.08 : CELL_SIZE * 0.11;

    roundedRect(
      x + padding,
      y + padding,
      CELL_SIZE - padding * 2,
      CELL_SIZE - padding * 2,
      CELL_SIZE * (index === 0 ? 0.28 : 0.24)
    );

    if (index === 0) {
      ctx.fillStyle = currentTheme.headFill;
      ctx.shadowColor = currentTheme.headGlow;
      ctx.shadowBlur = 24;
    } else {
      ctx.fillStyle = `hsl(${currentTheme.bodyHueStart + Math.min(index, 60)}, 80%, ${Math.max(34, 62 - index * 0.4)}%)`;
      ctx.shadowColor = currentTheme.bodyGlow;
      ctx.shadowBlur = 11;
    }

    ctx.fill();
    ctx.shadowBlur = 0;
  });
}

function setPausedState(isPaused) {
  pauseOverlay.classList.toggle('visible', isPaused);
}

async function enterFullscreen() {
  if (document.fullscreenElement || !appRoot) {
    return;
  }

  try {
    await appRoot.requestFullscreen();
  } catch {
    // Ignore fullscreen rejections (e.g. browser policy).
  }
}

function animate(now) {
  const isPaused = now < pausedUntil;

  if (!isPaused && now - lastTick >= MOVE_INTERVAL_MS) {
    moveSnake();
    lastTick = now;
  }

  const progress = isPaused ? 0 : Math.min((now - lastTick) / MOVE_INTERVAL_MS, 1);
  draw(progress);
  setPausedState(isPaused);
  requestAnimationFrame(animate);
}

window.addEventListener('mousemove', () => {
  pausedUntil = performance.now() + PAUSE_AFTER_MOUSE_MOVE_MS;
});

window.addEventListener('keydown', (event) => {
  if (event.key.toLowerCase() === 'f') {
    enterFullscreen();
  }
});

appleCountSelect.addEventListener('change', () => {
  appleTargetCount = Number.parseInt(appleCountSelect.value, 10) || 1;
  syncFoodCount();
});

themeSelect.addEventListener('change', () => {
  applyTheme(themeSelect.value);
});

applyTheme(themeSelect.value);
syncFoodCount();
requestAnimationFrame(animate);
