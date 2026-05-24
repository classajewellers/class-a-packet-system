"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function RevenuePage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/reporting");
  }, [router]);
  return null;
}
