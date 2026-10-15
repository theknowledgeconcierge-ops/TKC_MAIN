"use client";
import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Maximize2, X } from "lucide-react";
import type { Book } from "@/lib/catalog";
import type { PreviewPage } from "@/lib/product-content";
import Modal from "./Modal";

export default function BookPreview({ book, pages }: { book: Book; pages: PreviewPage[] }) {
  const [index, setIndex] = useState(0);
  const [zoom, setZoom] = useState(false);
  const images = [{ src: book.cover_image_url, label: "Front cover", alt: `${book.title} by ${book.author} cover` }, ...pages.map((page) => ({ src: page.src, label: `Page ${page.page} · ${page.label}`, alt: `${book.title}, PDF page ${page.page}: ${page.label}` }))];
  const current = images[index];
  const move = (direction: number) => setIndex((value) => (value + direction + images.length) % images.length);
  const navigateWithKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") { event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1); }
  };
  const arrow = "inline-flex size-11 shrink-0 items-center justify-center rounded-full border border-[#d2c7b7] bg-[#fbf9f5] hover:bg-[#ede7dd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8c6d46]";
  return <section id="book-preview" aria-label={`${book.title} preview gallery`} className="scroll-mt-28 min-w-0" data-testid="book-preview">
    <div className="relative flex h-[320px] items-center justify-center border border-[#ddd5c9] bg-[#efeae1] p-5 sm:h-[440px]">
      <Image key={current.src} src={current.src} alt={current.alt} width={1131} height={1600} sizes="(max-width: 639px) 260px, 360px" preload={index === 0} loading={index === 0 ? undefined : "eager"} className="h-full w-auto max-w-full object-contain shadow-[0_12px_25px_rgba(41,35,31,.16)]" data-testid="preview-main-image" />
      <button type="button" onClick={() => setZoom(true)} aria-label="Enlarge current preview" className={`${arrow} absolute bottom-3 right-3`}><Maximize2 className="size-4" /></button>
    </div>
    <div className="mt-3 flex items-center justify-between gap-3">
      <button type="button" aria-label="Previous preview" className={arrow} onKeyDown={navigateWithKeyboard} onClick={() => move(-1)}><ChevronLeft className="size-5" /></button>
      <p aria-live="polite" className="text-center text-xs leading-5 text-[#6e655e]" data-testid="preview-indicator"><span className="block font-medium text-[#29231f]">{index + 1} of {images.length}</span>{current.label}</p>
      <button type="button" aria-label="Next preview" className={arrow} onKeyDown={navigateWithKeyboard} onClick={() => move(1)}><ChevronRight className="size-5" /></button>
    </div>
    <div className="mt-3 grid grid-cols-4 gap-2" aria-label="Choose a preview">{images.map((image, i) => <button type="button" key={image.src} onKeyDown={navigateWithKeyboard} onClick={() => setIndex(i)} aria-label={`Show ${image.label}`} aria-pressed={index === i} className={`flex min-h-20 items-center justify-center border-2 p-2 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${index === i ? "border-[#8c6d46] bg-[#ede7dd]" : "border-transparent bg-[#f3efe8] hover:border-[#c5a880]"}`}>
      <Image src={image.src} width={45} height={64} sizes="45px" alt="" className="h-16 w-auto object-contain" />
    </button>)}</div>
    <p className="mt-3 text-xs leading-5 text-[#6e655e]">Cover + {pages.length} original interior pages. Select a page to look inside.</p>
    <Modal open={zoom} onClose={() => setZoom(false)} label={`${book.title} enlarged preview`}>
      {zoom && <div className="flex h-full flex-col bg-[#f5f0e6]">
        <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[#ddd5c9] px-4 py-3"><p className="text-sm">{book.title} · {index + 1} of {images.length}</p><button type="button" className={arrow} aria-label="Close enlarged preview" onClick={() => setZoom(false)}><X className="size-5" /></button></div>
        <div className="min-h-0 flex-1 overflow-auto p-4 sm:p-8"><Image src={current.src} alt={current.alt} width={1131} height={1600} sizes="(max-width: 639px) 95vw, 850px" loading="eager" className="mx-auto h-auto w-full max-w-[850px] shadow-lg" /></div>
        <div className="flex shrink-0 items-center justify-center gap-6 p-3"><button type="button" aria-label="Previous enlarged preview" className={arrow} onClick={() => move(-1)}><ChevronLeft /></button><span className="text-sm" aria-live="polite">{current.label}</span><button type="button" aria-label="Next enlarged preview" className={arrow} onClick={() => move(1)}><ChevronRight /></button></div>
      </div>}
    </Modal>
  </section>;
}

