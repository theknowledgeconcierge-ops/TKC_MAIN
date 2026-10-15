export function whatsappPurchaseUrl(title: string) {
  return `https://wa.me/919557156634?text=${encodeURIComponent(`I want to buy ${title}`)}`;
}

export default function WhatsAppPurchase({ title }: { title: string }) {
  return <a href={whatsappPurchaseUrl(title)} target="_blank" rel="noopener noreferrer"
    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg border border-[#117b43] bg-[#117b43] px-4 py-3 text-sm font-semibold text-white transition-colors hover:border-[#0d6233] hover:bg-[#0d6233] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#117b43]"
    data-testid="whatsapp-purchase" aria-label={`Buy ${title} through WhatsApp`}>
    <svg viewBox="0 0 24 24" className="size-5 shrink-0" fill="currentColor" aria-hidden="true">
      <path d="M20.52 3.48A11.9 11.9 0 0 0 12.05 0C5.47 0 .11 5.35.1 11.94c0 2.1.55 4.16 1.6 5.97L0 24l6.25-1.64a11.94 11.94 0 0 0 5.8 1.48h.01c6.58 0 11.94-5.36 11.94-11.94 0-3.19-1.24-6.19-3.48-8.42ZM12.06 21.82a9.9 9.9 0 0 1-5.05-1.38l-.36-.21-3.71.97.99-3.62-.24-.37a9.88 9.88 0 0 1-1.51-5.27c0-5.47 4.45-9.92 9.92-9.92a9.85 9.85 0 0 1 7.02 2.91 9.85 9.85 0 0 1 2.9 7.02c0 5.47-4.45 9.92-9.96 9.92Zm5.44-7.43c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.18.2-.35.22-.65.07-.3-.15-1.26-.46-2.4-1.48-.89-.79-1.49-1.77-1.66-2.07-.18-.3-.02-.46.13-.61.14-.13.3-.35.45-.52.15-.18.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.21-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.08c.15.2 2.1 3.21 5.09 4.5.71.3 1.27.48 1.7.62.71.23 1.36.2 1.87.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.08-.12-.28-.2-.57-.35Z" />
    </svg>
    Buy through WhatsApp
  </a>;
}
