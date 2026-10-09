import { NextResponse } from "next/server";
import { getRuntimeInfo } from "@/lib/server/container";

/** Tells clients (and operators) which backend mode is active. Contains no secrets. */
export function GET() {
  return NextResponse.json(getRuntimeInfo());
}
