export const drawHandLandmarks = (canvas: HTMLCanvasElement, landmarks: any) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  for (let i = 0; i < landmarks.length; i++) {
    const p = landmarks[i][0] ?? landmarks[i];
    const x = p.x * width;
    const y = p.y * height;
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, 2 * Math.PI);
    ctx.fillStyle = "#22c55e";
    ctx.fill();
  }
};

export const drawFaceMeshLandmarks = (canvas: HTMLCanvasElement, results: any) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const lm = results.faceLandmarks[0];
  for (let i = 0; i < lm.length; i++) {
    const x = lm[i].x * width;
    const y = lm[i].y * height;
    ctx.beginPath();
    ctx.arc(x, y, 1.5, 0, 2 * Math.PI);
    ctx.fillStyle = "#3b82f6";
    ctx.fill();
  }
};

export const drawPoseLandmarkers = (canvas: HTMLCanvasElement, landmarksList: any) => {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const { width, height } = canvas;
  const landmarkers = landmarksList[0] ?? landmarksList;
  for (let i = 0; i < landmarkers.length; i++) {
    const x = landmarkers[i].x * width;
    const y = landmarkers[i].y * height;
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, 2 * Math.PI);
    ctx.fillStyle = "#f59e0b";
    ctx.fill();
  }
};