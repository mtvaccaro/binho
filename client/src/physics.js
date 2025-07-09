// 2D vector math and collision helpers for Binho game physics

// Vector operations
export function vecAdd(a, b) {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function vecSub(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function vecScale(a, s) {
  return { x: a.x * s, y: a.y * s };
}

export function vecMag(a) {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function vecNorm(a) {
  const mag = vecMag(a);
  return mag === 0 ? { x: 0, y: 0 } : { x: a.x / mag, y: a.y / mag };
}

export function vecDot(a, b) {
  return a.x * b.x + a.y * b.y;
}

// Reflect vector v over normal n (n must be normalized)
export function vecReflect(v, n) {
  const dot = vecDot(v, n);
  return {
    x: v.x - 2 * dot * n.x,
    y: v.y - 2 * dot * n.y,
  };
}

// Circle collision detection (returns true if circles overlap)
export function circlesCollide(a, rA, b, rB) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const distSq = dx * dx + dy * dy;
  const radSum = rA + rB;
  return distSq <= radSum * radSum;
} 