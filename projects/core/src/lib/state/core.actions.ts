import { createAction, props } from '@ngrx/store';
import { AppResponseModel, AppStylingModel } from '@tailormap-viewer/api';

const prefix = '[Core]';

export const loadApplication = createAction(
  `${prefix} Load Application`,
  props<{ id?: number; name?: string; version?: string }>(),
);
export const loadApplicationSuccess = createAction(
  `${prefix} Application Load Success`,
  props<{ application: AppResponseModel }>(),
);
export const loadApplicationFailed = createAction(
  `${prefix} Application Load Failed`,
  props<{ error?: string }>(),
);
export const setRouteBeforeLogin = createAction(
  `${prefix} Set Route Before Login`,
  props<{ route: string }>(),
);
export const setLoginDetails = createAction(
  `${prefix} Set Login Details`,
  props<{ loggedIn: boolean; user?: { username?: string } }>(),
);
export const updateApplicationStyle = createAction(
  `${prefix} Update Application Style`,
  props<{ style: AppStylingModel }>(),
);
