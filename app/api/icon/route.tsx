import { ImageResponse } from "next/og";
import { NextRequest } from "next/server";

export const runtime = "edge";

const SVG_DATA =
  "data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDExMSAxMjAiIHdpZHRoPSIxMTEiIGhlaWdodD0iMTIwIj4KCTxzdHlsZT4KCQkuczAgeyBmaWxsOiBub25lO3N0cm9rZTogIzAyODRjNztzdHJva2UtbGluZWNhcDogcm91bmQ7c3Ryb2tlLXdpZHRoOiAxNS42IH0gCgkJLnMxIHsgZmlsbDogIzAyODRjNyB9IAoJPC9zdHlsZT4KCTxnPgoJCTxwYXRoIGNsYXNzPSJzMCIgZD0ibTg5LjE0IDI2LjljLTEyLjY1LTkuODgtMjkuODQtMTEuNjktNDQuMjctNC42NS0xNC40MyA3LjA0LTIzLjU5IDIxLjY5LTIzLjU5IDM3Ljc1IDAgMTYuMDYgOS4xNiAzMC43MSAyMy41OSAzNy43NSAxNC40MyA3LjA0IDMxLjYyIDUuMjMgNDQuMjctNC42NSIvPgoJCTxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xhc3M9InMxIiBkPSJtODMuNjIgNjguNThoLTExLjE2Yy0xLjY2IDAtMy0xLjM0LTMtM3YtMTEuMTZjMC0xLjY2IDEuMzQtMyAzLTNoMTEuMTZjMS42NiAwIDMgMS4zNCAzIDN2MTEuMTZjMCAxLjY2LTEuMzQgMy0zIDN6Ii8+Cgk8L2c+Cjwvc3ZnPg==";

export function GET(req: NextRequest) {
  const raw = req.nextUrl.searchParams.get("size") ?? "192";
  const size = Math.min(512, Math.max(32, parseInt(raw) || 192));
  const padding = Math.round(size * 0.18);

  return new ImageResponse(
    (
      <div
        style={{
          background: "#ffffff",
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SVG_DATA} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { "Cache-Control": "public, max-age=31536000, immutable" },
    }
  );
}
