"use client";

import { useAuth } from "@clerk/nextjs";
import { useEffect } from "react";
import { setTokenGetter } from "@/lib/api";

export default function AuthBridge() {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      setTokenGetter(getToken);
    }
  }, [isLoaded, isSignedIn, getToken]);
  return null;
}
