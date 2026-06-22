import { NextResponse } from "next/server";
import { readUploadFileByName } from "@/lib/storage";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ fileName: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { fileName } = await context.params;
  const uploadFile = await readUploadFileByName(decodeURIComponent(fileName));

  if (!uploadFile) {
    return new NextResponse("Not found", { status: 404 });
  }

  const body = new Uint8Array(uploadFile.buffer.byteLength);
  body.set(uploadFile.buffer);

  return new NextResponse(body, {
    headers: {
      "Content-Type": uploadFile.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "Content-Disposition": `inline; filename="${uploadFile.fileName.replace(/"/g, "")}"`,
      "X-Content-Type-Options": "nosniff"
    }
  });
}
