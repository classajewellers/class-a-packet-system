"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The piece page loads photos from /api/attachments for inventory_piece.
 * This asks for the same photo, and only once the row is near the screen.
 */
export function PieceThumb({ pieceId }: { pieceId: string | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!pieceId) return;
    const el = ref.current;
    if (!el) return;
    let cancelled = false;
    const load = () => {
      const params = new URLSearchParams({
        record_type: "inventory_piece",
        record_id: pieceId,
        attachment_type: "photo",
      });
      void fetch(`/api/attachments?${params}`, { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (cancelled || !json) return;
          const rows = Array.isArray(json.attachments) ? json.attachments : [];
          const photo = rows.find((row: { file_type?: string; signed_url?: string | null }) => (
            row?.file_type === "image" && row.signed_url
          ));
          if (photo?.signed_url) setSrc(photo.signed_url);
        })
        .catch(() => {});
    };
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => { cancelled = true; };
    }
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      observer.disconnect();
      load();
    }, { rootMargin: "120px" });
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [pieceId]);

  return (
    <div ref={ref} style={{ width: 40, height: 40, flex: "0 0 40px", borderRadius: 8, background: "#F3F4F6", overflow: "hidden" }}>
      {src && (
        <img src={src} alt="" width={40} height={40} loading="lazy" style={{ width: 40, height: 40, objectFit: "cover", display: "block" }} />
      )}
    </div>
  );
}
