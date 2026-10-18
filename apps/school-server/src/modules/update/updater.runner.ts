/**
 * The updater's privileged launcher. It is the shared elevation runner
 * (CBT-04 section 6.4); the updater names are kept so existing call sites and
 * tests read naturally.
 */
export {
  ELEVATION_RUNNER as UPDATER_RUNNER,
  ElevatingProcessRunner as ElevatingUpdaterRunner,
} from '../../common/process/elevation.runner';
export type {
  ElevationOutcome as UpdaterOutcome,
  ElevationRequest as UpdaterRequest,
  ElevationRunner as UpdaterRunner,
} from '../../common/process/elevation.runner';
