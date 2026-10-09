"use client";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
export default function Modal({
  open,
  onClose,
  children,
  label,
  dialogRef,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  label: string;
  dialogRef?: RefObject<HTMLDialogElement | null>;
}) {
  const localRef = useRef<HTMLDialogElement>(null);
  const ref = dialogRef ?? localRef;
  useEffect(() => {
    const dialog = ref.current;
    if (open && dialog && !dialog.open) dialog.showModal();
    else if (!open && dialog?.open) dialog.close();
  }, [open, ref]);
  return (
    <dialog
      ref={ref}
      aria-label={label}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 text-inherit backdrop:bg-[#181412]/40 backdrop:backdrop-blur-[2px]"
    >
      {children}
    </dialog>
  );
}
