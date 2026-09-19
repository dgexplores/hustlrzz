"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useReducedMotion, useSpring, useMotionValue, animate } from "motion/react";

export const CRITICAL_DAMPING = { damping: 25, stiffness: 200 };
export const MOMENTUM_SPRING = { damping: 20, stiffness: 180 };
export const PRESS_SPRING = { damping: 30, stiffness: 400 };

export function usePressable(initialScale = 1) {
  const scale = useSpring(initialScale, PRESS_SPRING);
  const isPressed = useRef(false);

  const handlers = {
    onPointerDown: () => {
      isPressed.current = true;
      scale.set(0.97);
    },
    onPointerUp: () => {
      isPressed.current = false;
      scale.set(1);
    },
    onPointerLeave: () => {
      if (isPressed.current) {
        isPressed.current = false;
        scale.set(1);
      }
    },
  };

  return { scale, handlers };
}

export function useHoverSpring(initialScale = 1, hoverScale = 1.03) {
  const reduce = useReducedMotion();
  const scale = useSpring(initialScale, reduce ? { ...CRITICAL_DAMPING, stiffness: 1000 } : CRITICAL_DAMPING);
  const isHovered = useRef(false);

  const handlers = {
    onPointerEnter: () => {
      isHovered.current = true;
      scale.set(hoverScale);
    },
    onPointerLeave: () => {
      isHovered.current = false;
      scale.set(1);
    },
  };

  return { scale, handlers };
}

export function usePressAndHover(pressScale = 0.97, hoverScale = 1.03) {
  const reduce = useReducedMotion();
  const scale = useSpring(1, reduce ? { ...CRITICAL_DAMPING, stiffness: 1000 } : CRITICAL_DAMPING);
  const isPressed = useRef(false);
  const isHovered = useRef(false);

  const handlers = {
    onPointerDown: () => {
      isPressed.current = true;
      scale.set(pressScale);
    },
    onPointerUp: () => {
      isPressed.current = false;
      scale.set(isHovered.current ? hoverScale : 1);
    },
    onPointerLeave: () => {
      if (isPressed.current) {
        isPressed.current = false;
      }
      isHovered.current = false;
      scale.set(1);
    },
    onPointerEnter: () => {
      isHovered.current = true;
      if (!isPressed.current) scale.set(hoverScale);
    },
  };

  return { scale, handlers };
}

export function useSpringValue(initial: number, config = CRITICAL_DAMPING) {
  const reduce = useReducedMotion();
  return useSpring(initial, reduce ? { ...config, stiffness: 1000 } : config);
}

export function useFlexSpring(initial = 1, expanded = 2.4) {
  const reduce = useReducedMotion();
  const flex = useSpring(initial, reduce ? { ...CRITICAL_DAMPING, stiffness: 1000 } : MOMENTUM_SPRING);
  const [isExpanded, setIsExpanded] = useState(false);

  const toggle = useCallback(() => {
    setIsExpanded((prev) => {
      flex.set(prev ? 1 : expanded);
      return !prev;
    });
  }, [flex, expanded]);

  const expand = useCallback(() => {
    setIsExpanded(true);
    flex.set(expanded);
  }, [flex, expanded]);

  const collapse = useCallback(() => {
    setIsExpanded(false);
    flex.set(1);
  }, [flex]);

  return { flex, isExpanded, toggle, expand, collapse };
}

export function useScrollReveal(ref: React.RefObject<HTMLElement>, delay = 0) {
  const reduce = useReducedMotion();
  const opacity = useSpring(reduce ? 1 : 0, reduce ? { stiffness: 1000 } : { damping: 25, stiffness: 180 });
  const y = useSpring(reduce ? 0 : 30, reduce ? { stiffness: 1000 } : { damping: 25, stiffness: 180 });

  useEffect(() => {
    if (reduce) return;
    const timer = setTimeout(() => {
      opacity.set(1);
      y.set(0);
    }, delay);
    return () => clearTimeout(timer);
  }, [opacity, y, delay, reduce]);

  return { opacity, y };
}

export function animateSpring(
  target: number,
  options: { velocity?: number; onComplete?: () => void } = {}
) {
  const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  return animate(0, target, {
    ...(reduce ? { duration: 0.01 } : MOMENTUM_SPRING),
    velocity: options.velocity,
    onComplete: options.onComplete,
  });
}

export function projectMomentum(velocity: number, decelerationRate = 0.998) {
  return (velocity / 1000) * decelerationRate / (1 - decelerationRate);
}

export function rubberband(overshoot: number, dimension: number, constant = 0.55) {
  return (overshoot * dimension * constant) / (dimension + constant * Math.abs(overshoot));
}

export function useDragWithMomentum(
  onDragEnd: (velocity: number, projected: number) => void,
  bounds?: { min: number; max: number }
) {
  const position = useMotionValue(0);
  const velocityHistory = useRef<Array<{ x: number; t: number }>>([]);

  const handlers = {
    onPointerDown: (e: React.PointerEvent) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      velocityHistory.current = [{ x: e.clientX, t: performance.now() }];
    },
    onPointerMove: (e: React.PointerEvent) => {
      const now = performance.now();
      velocityHistory.current.push({ x: e.clientX, t: now });
      if (velocityHistory.current.length > 5) velocityHistory.current.shift();

      let nextX = e.clientX - velocityHistory.current[0].x;
      if (bounds) {
        if (nextX < bounds.min) nextX = rubberband(bounds.min - nextX, bounds.max - bounds.min) + bounds.min;
        if (nextX > bounds.max) nextX = bounds.max - rubberband(nextX - bounds.max, bounds.max - bounds.min);
      }
      position.set(nextX);
    },
    onPointerUp: (e: React.PointerEvent) => {
      e.currentTarget.releasePointerCapture(e.pointerId);
      if (velocityHistory.current.length < 2) return;
      const first = velocityHistory.current[0];
      const last = velocityHistory.current[velocityHistory.current.length - 1];
      const dt = (last.t - first.t) / 1000;
      if (dt > 0) {
        const velocity = (last.x - first.x) / dt;
        const projected = projectMomentum(velocity);
        onDragEnd(velocity, projected);
      }
      position.set(0);
    },
  };

  return { position, handlers };
}

export function useInterruptibleSpring(target: number, config = CRITICAL_DAMPING) {
  const value = useSpring(target, config);

  const setTarget = useCallback(
    (newTarget: number) => {
      value.set(newTarget);
    },
    [value]
  );

  return { value, setTarget };
}