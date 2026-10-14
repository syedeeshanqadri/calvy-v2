import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

const SVG_DATA =
  "data:image/svg+xml;base64,PHN2ZyB2ZXJzaW9uPSIxLjIiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyIgdmlld0JveD0iMCAwIDExMSAxMjAiIHdpZHRoPSIxMTEiIGhlaWdodD0iMTIwIj4KCTxzdHlsZT4KCQkuczAgeyBmaWxsOiBub25lO3N0cm9rZTogIzAyODRjNztzdHJva2UtbGluZWNhcDogcm91bmQ7c3Ryb2tlLXdpZHRoOiAxNS42IH0gCgkJLnMxIHsgZmlsbDogIzAyODRjNyB9IAoJPC9zdHlsZT4KCTxnPgoJCTxwYXRoIGNsYXNzPSJzMCIgZD0ibTg5LjE0IDI2LjljLTEyLjY1LTkuODgtMjkuODQtMTEuNjktNDQuMjctNC42NS0xNC40MyA3LjA0LTIzLjU5IDIxLjY5LTIzLjU5IDM3Ljc1IDAgMTYuMDYgOS4xNiAzMC43MSAyMy41OSAzNy43NSAxNC40MyA3LjA0IDMxLjYyIDUuMjMgNDQuMjctNC42NSIvPgoJCTxwYXRoIGZpbGwtcnVsZT0iZXZlbm9kZCIgY2xhc3M9InMxIiBkPSJtODMuNjIgNjguNThoLTExLjE2Yy0xLjY2IDAtMy0xLjM0LTMtM3YtMTEuMTZjMC0xLjY2IDEuMzQtMyAzLTNoMTEuMTZjMS42NiAwIDMgMS4zNCAzIDN2MTEuMTZjMCAxLjY2LTEuMzQgMy0zIDN6Ii8+Cgk8L2c+Cjwvc3ZnPg==";

export default function AppleIcon() {
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
          padding: "30px",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={SVG_DATA} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} />
      </div>
    ),
    { ...size }
  );
}
