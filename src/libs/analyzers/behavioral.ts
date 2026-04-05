import type { BehavioralMetrics, BehavioralSignals } from '../../types.js';

const HUMAN_SCORE_DEFAULT = 50;
const HUMAN_SCORE_MIN = 0;
const HUMAN_SCORE_MAX = 100;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function analyzeBehavior(
  metrics: BehavioralMetrics | undefined,
  enableAdvancedSignals: boolean,
): BehavioralSignals {
  if (!metrics) {
    return {
      hasData: false,
      isRobotic: false,
      factors: [],
      humanScore: HUMAN_SCORE_DEFAULT,
    };
  }

  const factors: string[] = [];
  let humanScore = HUMAN_SCORE_DEFAULT;

  if (metrics.session.interactionEventCount === 0) {
    factors.push('no_prior_interaction');
    humanScore -= 10;
  }

  if (metrics.session.sessionDurationMs > 0 && metrics.session.sessionDurationMs < 1500) {
    factors.push('impossibly_fast_session');
    humanScore -= 15;
  }

  if (enableAdvancedSignals) {
    const mouse = metrics.mouse;
    if (mouse) {
      if (!mouse.hasMovement && !metrics.hasTouchEvents) {
        factors.push('no_mouse_movement');
        humanScore -= 20;
      }

      if (
        mouse.sampleCount > 20 &&
        mouse.velocityStdDev < 20 &&
        mouse.straightnessRatio > 0.92
      ) {
        factors.push('robotic_mouse_pattern');
        humanScore -= 25;
      }

      if (
        mouse.sampleCount > 10 &&
        mouse.velocityStdDev > 50 &&
        mouse.straightnessRatio < 0.7
      ) {
        factors.push('natural_mouse_movement');
        humanScore += 15;
      }
    }

    const keyboard = metrics.keyboard;
    if (keyboard) {
      if (
        keyboard.keystrokeCount > 0 &&
        (keyboard.avgDwellMs < 10 || keyboard.avgFlightMs < 5)
      ) {
        factors.push('instant_typing');
        humanScore -= 20;
      }

      if (keyboard.keystrokeCount > 5 && keyboard.dwellStdDev < 5) {
        factors.push('uniform_typing_rhythm');
        humanScore -= 15;
      }

      if (
        keyboard.keystrokeCount > 5 &&
        keyboard.dwellStdDev > 20 &&
        keyboard.avgDwellMs >= 80 &&
        keyboard.avgDwellMs <= 200
      ) {
        factors.push('natural_typing');
        humanScore += 10;
      }
    }
  }

  humanScore = Math.round(clamp(humanScore, HUMAN_SCORE_MIN, HUMAN_SCORE_MAX));

  return {
    hasData: true,
    isRobotic: humanScore < 30,
    factors,
    humanScore,
  };
}