# HUSTLRZZ launch readiness

## Product promise

HUSTLRZZ helps a candidate turn a real resume and target role into researched
preparation, realistic voice-or-text rehearsal, and specific content and presence
coaching without uploading camera video.

## Release gates

- Backend unit suite must pass.
- Frontend lint, TypeScript, and production build must pass.
- Production dependency audit must report no high or critical vulnerabilities.
- Railway `/health` must report AI configured and database ready.
- Vercel and Railway deployments must both complete for the same commit.
- Camera and microphone failure must not block typed practice.

## Privacy boundary

- Camera frames and raw microphone audio remain in the browser.
- Browser speech recognition supplies an editable transcript.
- Only the transcript the candidate sends and numerical presence summaries reach
  the coaching API.
- Recent coaching attempt scores are stored in that browser's local storage;
  transcripts are not added to local history.
- Generated feedback is directional coaching, not a hiring, medical, or
  psychological assessment.

## Browser support

- Current Chrome and Edge provide the best speech-recognition experience.
- Safari and Firefox users can always type; camera feedback remains available
  when MediaDevices and WebAssembly are supported.
- Secure HTTPS is required for production camera and microphone permissions.

## Rollout and measurement

Start with a monitored beta before making performance claims.

| Signal | Initial gate |
| --- | --- |
| Preparation completion | At least 70% of started flows |
| Coaching session completion | At least 60% of entered studios |
| API error rate | Under 2% excluding user validation errors |
| Repeat attempt rate | At least 25% within seven days |
| User-rated usefulness | At least 4/5 after a completed report |

Pause rollout if authentication, cross-user data isolation, transcript handling,
or camera privacy boundaries fail. Roll back the latest deployment if the core
preparation, coaching, or interview flows show a sustained error-rate regression.

## Before paid or public GA

- Publish Terms of Service, Privacy Policy, and an AI limitations notice.
- Add production error monitoring and privacy-safe product analytics.
- Complete manual keyboard, screen-reader, mobile, Chrome, Edge, Safari, and
  Firefox acceptance testing.
- Run a closed beta with real candidates and verify that score improvements align
  with human reviewer feedback.
- Rotate any keys ever pasted into chat or screenshots and keep all provider and
  Supabase service credentials in deployment secrets only.
