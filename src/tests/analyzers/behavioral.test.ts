import { describe, expect, it } from 'vitest';
import { analyzeBehavior } from '../../libs/analyzers/behavioral.js';
import type { BehavioralMetrics } from '../../types.js';

function makeMetrics(overrides: Partial<BehavioralMetrics> = {}): BehavioralMetrics {
  return {
    mouse: {
      sampleCount: 30,
      avgVelocityPxMs: 0.6,
      velocityStdDev: 60,
      straightnessRatio: 0.55,
      avgAcceleration: 0.08,
      hasMovement: true,
    },
    keyboard: {
      keystrokeCount: 12,
      avgDwellMs: 120,
      dwellStdDev: 28,
      avgFlightMs: 95,
      flightStdDev: 22,
      estimatedWpm: 42,
    },
    scroll: {
      eventCount: 8,
      avgVelocityPxMs: 1.1,
      velocityStdDev: 0.4,
      directionChangeCount: 2,
      totalDistancePx: 1200,
    },
    session: {
      sessionDurationMs: 4000,
      timeToFirstInteractionMs: 300,
      interactionEventCount: 10,
      touchEventCount: 0,
    },
    collectionDurationMs: 4000,
    hasTouchEvents: false,
    ...overrides,
  };
}

describe('analyzeBehavior', () => {
  it('returns a neutral result when no behavioral metrics are provided', () => {
    const signals = analyzeBehavior(undefined, false);
    expect(signals.hasData).toBe(false);
    expect(signals.humanScore).toBe(50);
    expect(signals.factors).toEqual([]);
  });

  it('rewards natural movement and typing patterns when advanced analysis is enabled', () => {
    const signals = analyzeBehavior(makeMetrics(), true);
    expect(signals.factors).toContain('natural_mouse_movement');
    expect(signals.factors).toContain('natural_typing');
    expect(signals.humanScore).toBeGreaterThan(50);
    expect(signals.isRobotic).toBe(false);
  });

  it('detects robotic mouse behavior', () => {
    const signals = analyzeBehavior(makeMetrics({
      mouse: {
        sampleCount: 40,
        avgVelocityPxMs: 0.7,
        velocityStdDev: 4,
        straightnessRatio: 0.97,
        avgAcceleration: 0.01,
        hasMovement: true,
      },
    }), true);
    expect(signals.factors).toContain('robotic_mouse_pattern');
  });

  it('detects instant and uniform typing patterns', () => {
    const signals = analyzeBehavior(makeMetrics({
      keyboard: {
        keystrokeCount: 10,
        avgDwellMs: 6,
        dwellStdDev: 2,
        avgFlightMs: 4,
        flightStdDev: 1,
        estimatedWpm: 180,
      },
    }), true);
    expect(signals.factors).toContain('instant_typing');
    expect(signals.factors).toContain('uniform_typing_rhythm');
  });

  it('keeps advanced factors disabled on the free path while preserving session heuristics', () => {
    const signals = analyzeBehavior(makeMetrics({
      mouse: {
        sampleCount: 40,
        avgVelocityPxMs: 0.7,
        velocityStdDev: 4,
        straightnessRatio: 0.97,
        avgAcceleration: 0.01,
        hasMovement: true,
      },
      session: {
        sessionDurationMs: 700,
        timeToFirstInteractionMs: null,
        interactionEventCount: 0,
        touchEventCount: 0,
      },
      collectionDurationMs: 700,
    }), false);
    expect(signals.factors).toContain('no_prior_interaction');
    expect(signals.factors).toContain('impossibly_fast_session');
    expect(signals.factors).not.toContain('robotic_mouse_pattern');
  });
});