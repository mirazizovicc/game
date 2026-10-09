import { describe, it } from "vitest";
import { serviceSuite } from "../shared/service-suite";
import { ADMIN_URL, createTestDatabase } from "./helpers";

if (!ADMIN_URL) {
  describe("game service on Postgres", () => {
    it.skip("skipped: set TEST_DATABASE_URL (see scripts/local-postgres.sh) to run database tests", () => {});
  });
} else {
  serviceSuite("postgres store", async () => {
    const db = await createTestDatabase();
    return { store: db.store, cleanup: db.drop };
  });
}
