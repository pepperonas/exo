/**
 * The modules' dispatcher steps. One fresh set per load: steps keep small
 * session state of their own (the ssh config cache, the diet's loop guard).
 */
import type { Step } from '../core/dispatcher/dispatcher'
import { ciStep } from './cockpit/ci'
import { donecheckStep } from './cockpit/donecheck'
import { sidebarStep } from './cockpit/sidebar'
import { testlightStep } from './cockpit/testlight'
import { achievementsStep } from './extras/achievements'
import { cinemaStep } from './extras/cinema'
import { hoursStep } from './rueckblick/hours'
import { lessonsStep, recapStep } from './rueckblick/recap'
import { brakeStep } from './waechter/brake'
import { dietStep } from './waechter/diet'
import { prodStep } from './waechter/prod'
import { secretsStep } from './waechter/secrets'

export function createSteps(): Step[] {
  return [
    secretsStep(),
    prodStep(),
    dietStep(),
    brakeStep(),
    testlightStep(),
    sidebarStep(),
    donecheckStep(),
    ciStep(),
    recapStep(),
    lessonsStep(),
    hoursStep(),
    achievementsStep(),
    cinemaStep(),
  ]
}
