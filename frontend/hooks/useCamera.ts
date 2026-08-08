import { useEffect, useRef, useState } from "react";

type CameraStatus = "loading" | "live" | "denied" | "no-device" | "in-use";

export const useCamera = (
  videoRef: React.RefObject<HTMLVideoElement>,
  retryKey: number
) => {
  const [status, setStatus] = useState<CameraStatus>("loading");
  const [devicesFound, setDevicesFound] = useState(0);
  const [errorName, setErrorName] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => {
    let cancelled = false;

    const stopStream = () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };

    const start = async () => {
      setStatus("loading");
      stopStream();
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (cancelled) return;
        const cams = devices.filter((d) => d.kind === "videoinput");
        setDevicesFound(cams.length);
        if (cams.length === 0) {
          setStatus("no-device");
          setErrorName("NotFoundError");
          return;
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 600 }, height: { ideal: 480 } },
          audio: false,
        });
        if (cancelled) return stopStream();
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setStatus("live");
      } catch (err: any) {
        if (cancelled) return;
        const nm = err?.name || "";
        setErrorName(nm);
        if (nm === "NotAllowedError" || nm === "PermissionDeniedError") setStatus("denied");
        else if (nm === "NotFoundError") setStatus("no-device");
        else if (nm === "NotReadableError" || nm === "TrackStartError") setStatus("in-use");
        else setStatus("denied");
      }
    };

    start();
    return () => {
      cancelled = true;
      stopStream();
    };
  }, [videoRef, retryKey]);

  return { status, devicesFound, errorName };
};