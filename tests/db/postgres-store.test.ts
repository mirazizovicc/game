import { describe, it } from "vitest";
import { storeContract } from "../shared/store-contract";
import { ADMIN_URL, createTestDatabase } from "./helpers";

if (!ADMIN_URL) {
  describe("PostgresStore", () => {
    it.skip("skipped: set TEST_DATABASE_URL (see scripts/local-postgres.sh) to run database tests", () => {});
  });
} else {
  storeContract("postgres", async () => {
    const db = await createTestDatabase();
    return { store: db.store, cleanup: db.drop };
  });
}
