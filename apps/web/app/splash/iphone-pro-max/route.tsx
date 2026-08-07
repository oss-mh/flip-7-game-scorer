import { ImageResponse } from "next/og";

import { splashScreen } from "@/lib/pwaIcon";

const SIZE = { width: 1290, height: 2796 };

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(splashScreen(SIZE.width, SIZE.height), SIZE);
}
