import { MemoryStore } from "@/lib/server/memory-store";
import { storeContract } from "../shared/store-contract";

storeContract("memory", async () => ({ store: new MemoryStore(), cleanup: async () => {} }));
