import { Landmark } from "./types";

const GAZE_MIN = 0.35;
const GAZE_MAX = 0.65;

export const isFacingForward = (landmarks: Landmark[]): boolean => {
  if (landmarks.length < 473) return false;
  const rightEyeOuter = landmarks[33];
  const rightEyeInner = landmarks[133];
  const irisLandmarks = landmarks.slice(468, 468 + 5);
  if (irisLandmarks.length < 5) return false;
  const irisCenter = irisLandmarks.reduce(
    (acc, cur) => ({ x: acc.x + cur.x, y: acc.y + cur.y, z: 0, visibility: 0 }),
    { x: 0, y: 0, z: 0, visibility: 0 }
  );
  irisCenter.x /= irisLandmarks.length;
  irisCenter.y /= irisLandmarks.length;
  const AB = { x: rightEyeInner.x - rightEyeOuter.x, y: rightEyeInner.y - rightEyeOuter.y };
  const AI = { x: irisCenter.x - rightEyeOuter.x, y: irisCenter.y - rightEyeOuter.y };
  const dot = AI.x * AB.x + AI.y * AB.y;
  const norm2 = AB.x * AB.x + AB.y * AB.y;
  if (norm2 === 0) return false;
  const t = dot / norm2;
  return t >= GAZE_MIN && t <= GAZE_MAX;
};

const SLUMP_RATIO = 0.55;

export const isBadPosture = (landmarks: Landmark[]): boolean => {
  const head = landmarks[0]; // nose
  const leftShoulder = landmarks[11];
  const rightShoulder = landmarks[12];
  if (!head || !leftShoulder || !rightShoulder) return false;
  const shoulderWidth = Math.hypot(
    leftShoulder.x - rightShoulder.x,
    leftShoulder.y - rightShoulder.y
  );
  if (shoulderWidth < 1e-4) return false;
  const midShouldersY = (leftShoulder.y + rightShoulder.y) / 2;
  const headGap = midShouldersY - head.y;
  return headGap < SLUMP_RATIO * shoulderWidth;
};