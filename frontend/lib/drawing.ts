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
