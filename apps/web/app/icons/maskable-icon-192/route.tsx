import { ImageResponse } from "next/og";

import { appIconMark } from "@/lib/pwaIcon";

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(appIconMark(192, { maskable: true }), { width: 192, height: 192 });
}
