import { ImageResponse } from "next/og";

import { appIconMark } from "@/lib/pwaIcon";

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(appIconMark(512, { maskable: true }), { width: 512, height: 512 });
}
