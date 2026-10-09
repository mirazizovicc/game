import { MemoryStore } from "@/lib/server/memory-store";
import { serviceSuite } from "../shared/service-suite";

serviceSuite("memory store", async () => ({ store: new MemoryStore(), cleanup: async () => {} }));
