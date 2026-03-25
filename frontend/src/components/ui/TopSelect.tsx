import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "../../utils";

export function TopSelect({
  imgSrc, icon, label, value, options, onChange,
}: {
  imgSrc?: string;
  icon?: React.ReactNode;
  label?: string;
  value: string;
  options: { id: string; name: string }[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.id === value);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  return (
    <div className="topSelectWrap" ref={wrapRef}>
      <button className="topSelectBtn" onClick={() => setOpen((v) => !v)}>
        {imgSrc ? <img src={imgSrc} alt="" className="topSelectImg" /> : icon ? <div className="topSelectIcon">{icon}</div> : null}
        {label && <div className="topSelectLabel">{label}:</div>}
        <div className="topSelectValue">{selected?.name ?? "Select..."}</div>
        <ChevronDown className="topSelectChevron" />
      </button>
      {open && (
        <div className="topSelectDropdown">
          {options.map((o) => (
            <button
              key={o.id}
              className={cn("topSelectDropdownItem", o.id === value && "topSelectDropdownItemActive")}
              onClick={() => { onChange(o.id); setOpen(false); }}
            >
              {o.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
