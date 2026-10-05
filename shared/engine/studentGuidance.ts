export interface GoalLandmark {
  id: string;
  landmarkKey: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A suggestion anchored to the school's HQ, independent of camera/student position. */
export function firstLandmarkGoal(hq: { x: number; y: number } | undefined, landmarks: readonly GoalLandmark[]) {
  if (!hq) return undefined;
  return landmarks.map(landmark => {
    const x = landmark.x + (landmark.width - 1) / 2;
    const y = landmark.y + (landmark.height - 1) / 2;
    const exactDistance = Math.hypot(x - hq.x, y - hq.y);
    return { ...landmark, focusX: x, focusY: y, distance: Math.round(exactDistance), exactDistance };
  }).sort((a, b) => a.exactDistance - b.exactDistance || a.id.localeCompare(b.id))[0];
}

export type UniStopStatus = "syncing" | "unowned" | "foreign" | "cooldown" | "ready";
export function uniStopAvailability(ownerSchoolId: string, schoolId: string, cooldownUntil: number, now: number, profileReady: boolean) {
  const remainingSeconds = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const status: UniStopStatus = !profileReady ? "syncing" : !ownerSchoolId ? "unowned" : ownerSchoolId !== schoolId ? "foreign" : remainingSeconds > 0 ? "cooldown" : "ready";
  return { status, remainingSeconds, canClaim: status === "ready" };
}

export function durationText(seconds: number): string {
  const value = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(value / 3600), m = Math.floor(value % 3600 / 60), s = value % 60;
  return [h ? `${h} giờ` : "", m ? `${m} phút` : "", `${s} giây`].filter(Boolean).join(" ");
}
