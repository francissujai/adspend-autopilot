const params = new URLSearchParams(location.search);
/** ?replay=<cycleId>&speed=N plays a recorded cycle instead of the live state. */
export const REPLAY = params.get("replay");
export const SPEED = Number(params.get("speed")) || 8;
export const OPEN_PARAM = params.get("open");
