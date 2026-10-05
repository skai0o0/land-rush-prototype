import * as assert from "assert";
import { firstLandmarkGoal, uniStopAvailability, durationText } from "../../shared/engine/studentGuidance";

const now = 1000000;
assert.strictEqual(uniStopAvailability("hcmut", "hcmut", now + 12000, now, true).canClaim, false);
assert.strictEqual(uniStopAvailability("hcmut", "hcmut", 0, now, true).canClaim, true, "Another student's independent cooldown does not block this student");
assert.strictEqual(uniStopAvailability("dtu", "hcmut", now + 12000, now, true).status, "foreign");
assert.strictEqual(uniStopAvailability("hcmut", "hcmut", now + 12000, now, true).remainingSeconds, 12, "Returning ownership keeps the same student's cooldown");
assert.strictEqual(uniStopAvailability("hcmut", "hcmut", now, now, true).canClaim, true, "Cooldown ends at the exact timestamp");
assert.strictEqual(uniStopAvailability("", "hcmut", 0, now, true).canClaim, false);
assert.strictEqual(uniStopAvailability("hcmut", "hcmut", 0, now, false).status, "syncing", "No claim before private profile arrives");
assert.strictEqual(durationText(3601), "1 giờ 1 giây");

const landmarks = [
  { id: "far", landmarkKey: "fansipan", x: 900, y: 900, width: 40, height: 40 },
  { id: "near", landmarkKey: "halong", x: 120, y: 120, width: 40, height: 40 }
];
assert.strictEqual(firstLandmarkGoal({ x: 100, y: 100 }, landmarks)!.id, "near");
assert.strictEqual(firstLandmarkGoal({ x: 950, y: 950 }, landmarks)!.id, "far", "Different schools use their own HQ");
const moved = landmarks.map(lm => lm.id === "near" ? { ...lm, x: 990, y: 990 } : lm);
assert.strictEqual(firstLandmarkGoal({ x: 100, y: 100 }, moved)!.id, "far", "Editor relocation recomputes the suggestion");
assert.strictEqual(firstLandmarkGoal(undefined, landmarks), undefined);
assert.strictEqual(firstLandmarkGoal({ x: 100, y: 100 }, []), undefined);
const tied = [ { ...landmarks[1], id: "b" }, { ...landmarks[1], id: "a" } ];
assert.strictEqual(firstLandmarkGoal({ x: 100, y: 100 }, tied)!.id, "a", "Snapshot ordering cannot change tied suggestions");
assert.strictEqual(firstLandmarkGoal({ x: 0, y: 0 }, [
  { id: "a", landmarkKey: "farther", x: 10, y: 2, width: 1, height: 1 },
  { id: "b", landmarkKey: "closer", x: 10, y: 1, width: 1, height: 1 }
])!.id, "b", "Rounded display distances must not change the nearest choice");
console.log("Student guidance: private cooldowns, ownership, profile readiness and HQ-based goals passed");
