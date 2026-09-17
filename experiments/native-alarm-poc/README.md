# Rotina Family — Native Alarm POC

Status: EXPERIMENTAL / TEST ONLY

This directory is an isolated Sprint 3 proof of concept. It does not replace the Rotina Family PWA and it is not loaded by the production web application.

## Goal

Validate one capability only:

> With the Rotina Family PWA closed and the Android device locked, an alarm explicitly scheduled by the user must be able to start at the scheduled time without requiring a Push notification click.

## Architectural boundary

- The PWA remains the primary Rotina Family application.
- Firebase remains the authoritative application data source.
- Existing OneSignal Push behavior is unchanged.
- Production PWA files, service worker and Push runtime must not depend on this experiment.
- Native alarm code lives only inside this experimental boundary until the proof is approved.

## Acceptance test

1. Schedule a test alarm for a few minutes in the future.
2. Close the PWA completely.
3. Lock the Android device.
4. Wait without touching the Push notification.
5. PASS: Android starts the alarm at the scheduled time and provides a stop action.
6. FAIL: the alarm requires reopening the PWA or tapping Push before it can start.

## Decision after the POC

Only after the acceptance test passes will we design the production integration contract. If the POC fails, this experimental code is discarded without changing the production PWA.
