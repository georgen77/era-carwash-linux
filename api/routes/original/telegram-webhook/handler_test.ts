import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

import { buildSlotButtonText, parseSlotManagementCallback } from "./handler.ts";

Deno.test("buildSlotButtonText uses apartment short name, full date and cleaner", () => {
  assertEquals(
    buildSlotButtonText({
      apartment: "piral_2",
      checkout_date: "2026-04-04",
      cleaner_name: "Марьяна Иванова",
    }),
    "О2 · 04.04.2026 · Марьяна",
  );
});

Deno.test("buildSlotButtonText shows free slots clearly", () => {
  assertEquals(
    buildSlotButtonText({
      apartment: "salvador",
      checkout_date: "2026-04-06",
      cleaner_name: null,
    }),
    "Сал · 06.04.2026 · свободно",
  );
});

Deno.test("parseSlotManagementCallback supports current compact callbacks", () => {
  assertEquals(parseSlotManagementCallback("sd:slot-1"), { kind: "detail", slotId: "slot-1" });
  assertEquals(parseSlotManagementCallback("rp:slot-2"), { kind: "replace_menu", slotId: "slot-2" });
  assertEquals(parseSlotManagementCallback("rc:slot-3:4"), { kind: "replace_pick", slotId: "slot-3", cleanerIdx: 4 });
  assertEquals(parseSlotManagementCallback("rm:slot-4"), { kind: "remove", slotId: "slot-4" });
});

Deno.test("parseSlotManagementCallback supports legacy replace/delete callbacks", () => {
  assertEquals(parseSlotManagementCallback("replace_slot-1"), { kind: "replace_menu", slotId: "slot-1" });
  assertEquals(parseSlotManagementCallback("delete:slot-2"), { kind: "remove", slotId: "slot-2" });
  assertEquals(parseSlotManagementCallback("schedule_slot-3"), { kind: "detail", slotId: "slot-3" });
});