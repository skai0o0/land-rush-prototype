process.env.ALLOW_DEV = "true";
import * as assert from "assert";
import { CampusRoom } from "../src/rooms/CampusRoom";
import { formatNotificationText, getNotificationTemplate } from "../../shared/constants/notifications";

const room = new CampusRoom();
const notifications: any[] = [];
room.broadcast = ((type: string, payload: any) => {
  if (type === "game_notification") notifications.push(payload);
}) as any;
room.onCreate({ studentBotsEnabled: true }); // Legacy URL/options must not spawn fake students.
try {
  assert.strictEqual(room.state.players.size, 0, "A fresh campaign has no simulated players");
  for (const command of ["toggle_bots", "toggle_student_bots", "get_student_bots_status"]) {
    assert.strictEqual((room as any).onMessageHandlers[command], undefined, "Bot commands are not registered");
  }
  const client = { sessionId: "event_student", send() {} };
  room.onJoin(client as any, { email: "event_student@hcmut.edu.vn" });
  assert.strictEqual(room.state.players.size, 1, "Only the actual student joins the campaign");
  room.broadcastNotification("terr_captured", { student_name: "Sinh viên", my_school: "hcmut", x: 501, y: 500 }, "territory");
  assert.strictEqual(notifications.length, 1);
  const event = notifications[0];
  assert.strictEqual(event.templateId, "terr_captured");
  assert.strictEqual(event.category, "territory");
  const template = getNotificationTemplate(event.templateId)!;
  assert.ok(template);
  const text = formatNotificationText(template.bodyTemplate, event.vars);
  assert.ok(text.includes("Sinh viên") && text.includes("501"));
  console.log("Runtime isolation and in-game notification tests passed");
} finally {
  room.onDispose();
  (room as any).clock.stop();
}
process.exit(0);
