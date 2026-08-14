"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const OFFSET = 12;
const SHOW_DELAY_MS = 350;

export default function TitleTooltip() {
  const [mounted, setMounted] = useState(false);
  const [text, setText] = useState<string | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const targetRef = useRef<HTMLElement | null>(null);
  const originalTitles = useRef(new WeakMap<HTMLElement, string>());
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const clearShowTimer = () => {
      if (showTimerRef.current) {
        clearTimeout(showTimerRef.current);
        showTimerRef.current = null;
      }
    };

    const restore = (el: HTMLElement) => {
      const original = originalTitles.current.get(el);
      if (original != null) {
        el.setAttribute("title", original);
        originalTitles.current.delete(el);
      }
    };

    const hide = () => {
      clearShowTimer();
      if (targetRef.current) restore(targetRef.current);
      targetRef.current = null;
      setText(null);
    };

    const setTarget = (el: HTMLElement) => {
      if (el === targetRef.current) return;
      if (targetRef.current) restore(targetRef.current);
      clearShowTimer();
      setText(null);

      const value = el.getAttribute("title");
      if (!value) {
        targetRef.current = null;
        return;
      }
      originalTitles.current.set(el, value);
      el.removeAttribute("title");
      targetRef.current = el;

      showTimerRef.current = setTimeout(() => {
        if (targetRef.current === el) setText(value);
      }, SHOW_DELAY_MS);
    };

    const resolve = (x: number, y: number) => {
      const deepest = document.elementFromPoint(x, y) as HTMLElement | null;
      return deepest?.closest<HTMLElement>("[title]") ?? null;
    };

    const onMove = (e: MouseEvent) => {
      setPos({ x: e.clientX, y: e.clientY });
      if (rafRef.current != null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const el = resolve(e.clientX, e.clientY);
        if (el) setTarget(el);
        else hide();
      });
    };

    const onLeaveWindow = () => hide();

    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mousedown", hide, true);
    document.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    document.addEventListener("mouseleave", onLeaveWindow);

    return () => {
      document.removeEventListener("mousemove", onMove, true);
      document.removeEventListener("mousedown", hide, true);
      document.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
      document.removeEventListener("mouseleave", onLeaveWindow);
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      hide();
    };
  }, []);

  if (!mounted || !text) return null;

  const viewportW = window.innerWidth;
  const viewportH = window.innerHeight;
  const estWidth = Math.min(280, text.length * 6 + 24);
  const flipX = pos.x + OFFSET + estWidth > viewportW;
  const flipY = pos.y + OFFSET + 40 > viewportH;

  return createPortal(
    <div
      className="pointer-events-none fixed z-[100] max-w-[280px] animate-fade-in rounded-md border border-border bg-panel px-2.5 py-1.5 text-xs leading-snug text-fg shadow-lg"
      style={{
        left: flipX ? pos.x - OFFSET : pos.x + OFFSET,
        top: flipY ? pos.y - OFFSET : pos.y + OFFSET,
        transform: `translate(${flipX ? "-100%" : "0"}, ${flipY ? "-100%" : "0"})`,
      }}
    >
      {text}
    </div>,
    document.body,
  );
}
