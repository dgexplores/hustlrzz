import { useEffect, useRef, useState } from "react";
import { FaceLandmarker, FilesetResolver, HandLandmarker, PoseLandmarker } from "@mediapipe/tasks-vision";
import { initializeHandDetection } from "../lib/mediapipe/handDetection";
import { initializeFaceDetection } from "../lib/mediapipe/faceDetection";
import { initializePoseDetection } from "../lib/mediapipe/poseDetection";
import { isBadPosture, isFacingForward } from "../lib/analytics";
import { drawHandLandmarks, drawPoseLandmarkers } from "../lib/drawing";
import { useMetrics } from "@/context/MetricsContext";

const FRAME_INTERVAL_MS = 1000 / 15;
const CONFIRM_FRAMES = 8;
const GESTURE_DISTANCE = 0.035;
const GESTURE_COOLDOWN_MS = 500;

export const useMediapipe = (
  videoRef: React.RefObject<HTMLVideoElement>,
  canvasRef: React.RefObject<HTMLCanvasElement>,
  overlayEnabled: boolean,
  enabled = true,
) => {
  const [processingError, setProcessingError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [handDetectionCounter, setHandDetectionCounter] = useState(0);
  const [handDetectionDuration, setHandDetectionDuration] = useState(0);
  const [notFacingCounter, setNotFacingCounter] = useState(0);
  const [notFacingDuration, setNotFacingDuration] = useState(0);
  const [badPostureDetectionCounter, setBadPostureDetectionCounter] = useState(0);
  const [badPostureDuration, setBadPostureDuration] = useState(0);
  const isHandOnScreenRef = useRef(false);
  const isEyeContactRef = useRef(true);
  const notFacingRef = useRef(false);
  const hasBadPostureRef = useRef(false);
  const handStartRef = useRef(0);
  const handWristRef = useRef<Array<{ x: number; y: number }>>([]);
  const lastGestureAtRef = useRef(0);
  const eyeAwayStartRef = useRef(0);
  const postureStartRef = useRef(0);
  const eyeAwayFramesRef = useRef(0);
  const eyeContactFramesRef = useRef(0);
  const poorPostureFramesRef = useRef(0);
  const goodPostureFramesRef = useRef(0);
  const handDetectorRef = useRef<HandLandmarker>();
  const faceDetectorRef = useRef<FaceLandmarker>();
  const poseDetectorRef = useRef<PoseLandmarker>();
  const { updateMetrics } = useMetrics();

  useEffect(() => {
    updateMetrics({ handDetectionCounter, handDetectionDuration, notFacingCounter, notFacingDuration, badPostureDetectionCounter, badPostureDuration });
  }, [updateMetrics, handDetectionCounter, handDetectionDuration, notFacingCounter, notFacingDuration, badPostureDetectionCounter, badPostureDuration]);

  useEffect(() => {
    if (!enabled) return;
    let frame = 0;
    let cancelled = false;
    let lastProcessed = 0;

    const begin = async () => {
      try {
        const vision = await FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm");
        const [hand, face, pose] = await Promise.all([initializeHandDetection(vision), initializeFaceDetection(vision), initializePoseDetection(vision)]);
        if (cancelled) return;
        handDetectorRef.current = hand; faceDetectorRef.current = face; poseDetectorRef.current = pose;
        setReady(true);
      } catch {
        if (!cancelled) setProcessingError("Posture feedback could not start. Your interview can continue normally.");
      }
    };

    const transitionEyeContact = (lookingForward: boolean, now: number) => {
      if (lookingForward) {
        eyeContactFramesRef.current += 1; eyeAwayFramesRef.current = 0;
        if (notFacingRef.current && eyeContactFramesRef.current >= CONFIRM_FRAMES) {
          setNotFacingDuration((value) => value + (now - eyeAwayStartRef.current) / 1000);
          notFacingRef.current = false; isEyeContactRef.current = true;
        }
      } else {
        eyeAwayFramesRef.current += 1; eyeContactFramesRef.current = 0;
        if (!notFacingRef.current && eyeAwayFramesRef.current >= CONFIRM_FRAMES) {
          setNotFacingCounter((value) => value + 1);
          eyeAwayStartRef.current = now; notFacingRef.current = true; isEyeContactRef.current = false;
        }
      }
    };

    const transitionPosture = (needsAdjustment: boolean, now: number) => {
      if (needsAdjustment) {
        poorPostureFramesRef.current += 1; goodPostureFramesRef.current = 0;
        if (!hasBadPostureRef.current && poorPostureFramesRef.current >= CONFIRM_FRAMES) {
          setBadPostureDetectionCounter((value) => value + 1);
          postureStartRef.current = now; hasBadPostureRef.current = true;
        }
      } else {
        goodPostureFramesRef.current += 1; poorPostureFramesRef.current = 0;
        if (hasBadPostureRef.current && goodPostureFramesRef.current >= CONFIRM_FRAMES) {
          setBadPostureDuration((value) => value + (now - postureStartRef.current) / 1000);
          hasBadPostureRef.current = false;
        }
      }
    };

    const detect = () => {
      frame = requestAnimationFrame(detect);
      const video = videoRef.current;
      if (!ready || !video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
      const now = performance.now();
      if (now - lastProcessed < FRAME_INTERVAL_MS) return;
      lastProcessed = now;
      const canvas = canvasRef.current;
      if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      }
      const context = canvas?.getContext("2d");
      context?.clearRect(0, 0, canvas?.width || 0, canvas?.height || 0);
      const hand = handDetectorRef.current?.detectForVideo(video, now);
      if (hand) {
        const visible = hand.landmarks.length > 0;
        if (visible && !isHandOnScreenRef.current) { handStartRef.current = now; isHandOnScreenRef.current = true; }
        if (!visible && isHandOnScreenRef.current) { setHandDetectionDuration((value) => value + (now - handStartRef.current) / 1000); isHandOnScreenRef.current = false; }
        const wrists = hand.landmarks.map((landmarks) => landmarks[0]).filter(Boolean);
        const moved = wrists.some((wrist, index) => {
          const previous = handWristRef.current[index];
          return previous && Math.hypot(wrist.x - previous.x, wrist.y - previous.y) >= GESTURE_DISTANCE;
        });
        if (moved && now - lastGestureAtRef.current >= GESTURE_COOLDOWN_MS) {
          setHandDetectionCounter((value) => value + 1);
          lastGestureAtRef.current = now;
        }
        handWristRef.current = wrists.map((wrist) => ({ x: wrist.x, y: wrist.y }));
        if (overlayEnabled && canvas) drawHandLandmarks(canvas, hand.landmarks);
      }
      const face = faceDetectorRef.current?.detectForVideo(video, now);
      if (face?.faceLandmarks?.[0]) transitionEyeContact(isFacingForward(face.faceLandmarks[0]), now);
      const pose = poseDetectorRef.current?.detectForVideo(video, now);
      if (pose?.landmarks?.[0]) {
        transitionPosture(isBadPosture(pose.landmarks[0]), now);
        if (overlayEnabled && canvas) drawPoseLandmarkers(canvas, pose.landmarks);
      }
    };

    begin();
    detect();
    return () => {
      cancelled = true; cancelAnimationFrame(frame);
      handDetectorRef.current?.close(); faceDetectorRef.current?.close(); poseDetectorRef.current?.close();
      handDetectorRef.current = undefined; faceDetectorRef.current = undefined; poseDetectorRef.current = undefined;
    };
  }, [canvasRef, enabled, overlayEnabled, videoRef, ready]);

  return { ready, processingError, handDetectionCounter, handDetectionDuration, notFacingCounter, notFacingDuration, badPostureDetectionCounter, badPostureDuration, isHandOnScreenRef, isEyeContactRef, hasBadPostureRef };
};
