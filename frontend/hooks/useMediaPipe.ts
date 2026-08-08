import { useEffect, useRef, useState } from "react";
import {
  FilesetResolver,
  HandLandmarker,
  FaceLandmarker,
  PoseLandmarker,
} from "@mediapipe/tasks-vision";
import { initializeHandDetection } from "../lib/mediapipe/handDetection";
import { initializeFaceDetection } from "../lib/mediapipe/faceDetection";
import { initializePoseDetection } from "../lib/mediapipe/poseDetection";
import { isFacingForward, isBadPosture } from "../lib/analytics";
import { drawHandLandmarks, drawFaceMeshLandmarks, drawPoseLandmarkers } from "../lib/drawing";
import { useMetrics } from "@/context/MetricsContext";

export const useMediapipe = (
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  overlayEnabled: boolean,
  enabled = true
) => {
  const [handPresence, setHandPresence] = useState(false);
  const [facePresence, setFacePresence] = useState(false);
  const [posePresence, setPosePresence] = useState(false);

  const [handDetectionCounter, setHandDetectionCounter] = useState(0);
  const [handDetectionDuration, setHandDetectionDuration] = useState(0);
  const [notFacingCounter, setNotFacingCounter] = useState(0);
  const [notFacingDuration, setNotFacingDuration] = useState(0);
  const [badPostureDetectionCounter, setBadPostureDetectionCounter] = useState(0);
  const [badPostureDuration, setBadPostureDuration] = useState(0);

  const isHandOnScreenRef = useRef(false);
  const handDetectionStartTimeRef = useRef(0);
  const notFacingStartTimeRef = useRef<number | null>(null);
  const notFacingRef = useRef(false);
  const hasBadPostureRef = useRef(false);
  const badPostureStartTimeRef = useRef(0);

  const CONFIRM_FRAMES = 10;
  const notFacingStreakRef = useRef(0);
  const facingStreakRef = useRef(0);
  const badPostureStreakRef = useRef(0);
  const goodPostureStreakRef = useRef(0);

  const handDetectorRef = useRef<HandLandmarker>();
  const faceDetectorRef = useRef<FaceLandmarker>();
  const poseDetectorRef = useRef<PoseLandmarker>();

  const { updateMetrics } = useMetrics();

  useEffect(() => {
    const timer = setTimeout(() => {
      updateMetrics({
        handDetectionCounter,
        handDetectionDuration,
        notFacingCounter,
        notFacingDuration,
        badPostureDetectionCounter,
        badPostureDuration,
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [
    updateMetrics,
    handDetectionCounter,
    handDetectionDuration,
    notFacingCounter,
    notFacingDuration,
    badPostureDetectionCounter,
    badPostureDuration,
  ]);

  useEffect(() => {
    if (!enabled) return;
    let animationFrameId: number;

    const setupDetectors = async () => {
      // TFLite/WASM prints benign INFO logs ("Created TensorFlow Lite XNNPACK
      // delegate for CPU"). Swallow them so they don't flood the console.
      const originalLog = console.log.bind(console);
      const noisy = (msg: unknown) =>
        typeof msg === "string" && msg.includes("TensorFlow Lite");
      console.log = (...args: unknown[]) => {
        if (!args.some(noisy)) originalLog(...args);
      };
      try {
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
        );
        handDetectorRef.current = await initializeHandDetection(vision);
        faceDetectorRef.current = await initializeFaceDetection(vision);
        poseDetectorRef.current = await initializePoseDetection(vision);
      } finally {
        console.log = originalLog;
      }
    };

    const detect = () => {
      const currentTime = performance.now();
      if (videoRef.current && videoRef.current.readyState >= 2 && canvasRef.current) {
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
        }

        if (handDetectorRef.current) {
          const hr = handDetectorRef.current.detectForVideo(videoRef.current, currentTime);
          setHandPresence(hr.handednesses.length > 0);
          if (hr.landmarks.length > 0) {
            if (!isHandOnScreenRef.current) {
              setHandDetectionCounter((p) => p + 1);
              handDetectionStartTimeRef.current = currentTime;
              isHandOnScreenRef.current = true;
            }
          } else if (isHandOnScreenRef.current && handDetectionStartTimeRef.current) {
            setHandDetectionDuration((p) => p + (currentTime - handDetectionStartTimeRef.current) / 1000);
            handDetectionStartTimeRef.current = 0;
            isHandOnScreenRef.current = false;
          }
          if (overlayEnabled && hr.landmarks) drawHandLandmarks(canvas, hr.landmarks);
        }

        if (faceDetectorRef.current) {
          const fr = faceDetectorRef.current.detectForVideo(videoRef.current, currentTime);
          const hasFace = fr.faceLandmarks && fr.faceLandmarks.length > 0;
          setFacePresence(hasFace);
          if (hasFace) {
            if (overlayEnabled) drawFaceMeshLandmarks(canvas, fr);
            const lookingForward = isFacingForward(fr.faceLandmarks[0]);
            if (!lookingForward) {
              notFacingStreakRef.current += 1;
              facingStreakRef.current = 0;
              if (!notFacingRef.current && notFacingStreakRef.current >= CONFIRM_FRAMES) {
                notFacingRef.current = true;
                notFacingStartTimeRef.current = currentTime;
                setNotFacingCounter((p) => p + 1);
              }
            } else {
              facingStreakRef.current += 1;
              notFacingStreakRef.current = 0;
              if (notFacingRef.current && facingStreakRef.current >= CONFIRM_FRAMES) {
                setNotFacingDuration((p) => p + (currentTime - (notFacingStartTimeRef.current ?? currentTime)) / 1000);
                notFacingStartTimeRef.current = null;
                notFacingRef.current = false;
              }
            }
          }
        }

        if (poseDetectorRef.current) {
          const pr = poseDetectorRef.current.detectForVideo(videoRef.current, currentTime);
          const hasPose = pr.landmarks && pr.landmarks.length > 0;
          setPosePresence(hasPose);
          if (hasPose) {
            const badPosture = isBadPosture(pr.landmarks[0]);
            if (badPosture) {
              badPostureStreakRef.current += 1;
              goodPostureStreakRef.current = 0;
              if (!hasBadPostureRef.current && badPostureStreakRef.current >= CONFIRM_FRAMES) {
                setBadPostureDetectionCounter((p) => p + 1);
                badPostureStartTimeRef.current = currentTime;
                hasBadPostureRef.current = true;
              }
            } else {
              goodPostureStreakRef.current += 1;
              badPostureStreakRef.current = 0;
              if (hasBadPostureRef.current && goodPostureStreakRef.current >= CONFIRM_FRAMES) {
                setBadPostureDuration((p) => p + (currentTime - (badPostureStartTimeRef.current || currentTime)) / 1000);
                badPostureStartTimeRef.current = 0;
                hasBadPostureRef.current = false;
              }
            }
            if (overlayEnabled && pr.landmarks) drawPoseLandmarkers(canvas, pr.landmarks);
          }
        }
      }
      animationFrameId = requestAnimationFrame(detect);
    };

    setupDetectors().then(() => detect());
    return () => {
      cancelAnimationFrame(animationFrameId);
      handDetectorRef.current?.close();
      faceDetectorRef.current?.close();
      poseDetectorRef.current?.close();
    };
  }, [videoRef, canvasRef, overlayEnabled, enabled]);

  return {
    handPresence,
    facePresence,
    posePresence,
    handDetectionCounter,
    handDetectionDuration,
    notFacingCounter,
    notFacingDuration,
    badPostureDetectionCounter,
    badPostureDuration,
    isHandOnScreenRef,
    notFacingRef,
    hasBadPostureRef,
  };
};