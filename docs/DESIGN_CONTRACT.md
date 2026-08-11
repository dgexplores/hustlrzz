# Hustlrzz design contract

## Product character

Hustlrzz is a modern interview training environment. It should feel intelligent, precise, calm, and responsive. It must not look like a generic AI landing page or a career-services brochure.

## Visual system

- Cool monochrome surfaces with one cobalt interaction color.
- System grotesk typography with tight display tracking and readable body leading.
- Monospace is reserved for measurements, timing, and technical identifiers.
- Soft 14-16px surfaces are used only where they group real product functions.
- No warm paper palette, serif display type, neon gradients, glow effects, decorative grids, numbered section labels, or stock photography.

## Product flow

Navigation uses familiar feature names: Home, Prepare, Interview, Coaching, and Progress. Every screen opens with one direct sentence explaining the task. Secondary detail appears only where it supports the next action.

## Motion

- Press feedback begins immediately and uses a subtle 0.97 scale.
- Hover and control transitions stay between 160ms and 200ms.
- Page entry motion is used once to establish hierarchy and never blocks input.
- Continuous movement is reserved for real states such as listening or processing.
- Reduced motion removes positional animation while preserving state feedback.

## Materials and accessibility

- Translucency is limited to navigation and the primary product preview.
- A solid fallback is provided for reduced-transparency preferences.
- Light and dark modes preserve the same hierarchy and cobalt identity.
- Inputs, buttons, placeholders, labels, and error states must meet WCAG AA contrast.
