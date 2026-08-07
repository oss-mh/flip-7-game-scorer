import { ImageResponse } from "next/og";

import { splashScreen } from "@/lib/pwaIcon";

const SIZE = { width: 750, height: 1334 };

export const dynamic = "force-static";

export async function GET() {
  return new ImageResponse(splashScreen(SIZE.width, SIZE.height), SIZE);
}
