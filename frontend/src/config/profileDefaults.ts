import type { ProfileLimits } from '../services/api';
import { FREE_PLAN_LIMITS } from './planLimits.mjs';

export const DEFAULT_PROFILE_LIMITS: ProfileLimits = {
  ...FREE_PLAN_LIMITS,
};
