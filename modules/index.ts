/**
 * The modules' dispatcher steps. One fresh set per load: steps keep small
 * session state of their own (the ssh config cache, the diet's loop guard).
 */
import type { Step } from '../core/dispatcher/dispatcher'
import { brakeStep } from './waechter/brake'
import { dietStep } from './waechter/diet'
import { prodStep } from './waechter/prod'
import { secretsStep } from './waechter/secrets'

export function createSteps(): Step[] {
  return [secretsStep(), prodStep(), dietStep(), brakeStep()]
}
