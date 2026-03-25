import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, X } from "lucide-react";
import { type Presentation } from "../../services/gemini";
import { cn } from "../../utils";

export function PresentationDialog({
  open, onClose, onSelect, presentations,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (name: string) => void;
  presentations: Presentation[];
}) {
  const [existingName, setExistingName] = useState(presentations[0]?.name ?? "");
  const [dropdownOpen, setDropdownOpen] = useState(false);

  useEffect(() => {
    if (open && presentations.length) setExistingName(presentations[0].name);
  }, [open, presentations]);

  const selected = useMemo(() => presentations.find(p => p.name === existingName), [existingName, presentations]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="modalOverlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="modalBackdrop" onClick={onClose} />
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.985 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.985 }}
            transition={{ duration: 0.2 }}
            className="presModalWrap"
          >
            <div className="presModal">
              <button className="presCloseBtn" onClick={onClose} title="Close"><X className="h-5 w-5" /></button>
              <div className="presModalHeader">
                <div className="presModalTitle">Select presentation</div>
                <div className="presModalSubtitle">Pick a presentation from the library</div>
              </div>
              <div className="presForm">
                <div className="presFieldRow">
                  <div className="presFieldLabel">Select a presentation</div>
                  {presentations.length === 0 ? (
                    <div className="text-sm text-gray-400 italic">No presentations available</div>
                  ) : (
                    <div className="presSelectWrap">
                      <button className="presSelectBtn" onClick={() => setDropdownOpen(v => !v)}>
                        <span>
                          {selected?.name ?? "Select..."}
                          {selected && <span className="presSelectLang"> — {selected.language.toUpperCase()}</span>}
                        </span>
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      {dropdownOpen && (
                        <div className="presDropdown">
                          {presentations.map(p => (
                            <button
                              key={p.name}
                              className={cn("presDropdownItem", p.name === existingName && "presDropdownItemActive")}
                              onClick={() => { setExistingName(p.name); setDropdownOpen(false); }}
                            >
                              {p.name} — {p.language.toUpperCase()}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {selected && (
                  <div className="presPreviewCard">
                    <div className="presPreviewTitle">{selected.name}</div>
                    <div className="presPreviewDesc">{selected.description}</div>
                    <div className="presPreviewLang">Language: {selected.language.toUpperCase()}</div>
                  </div>
                )}
              </div>
              <div className="presFooter">
                <button className="presCancelBtn" onClick={onClose}>Cancel</button>
                <button className="presSubmitBtn" disabled={!existingName}
                  onClick={() => { if (existingName) { onSelect(existingName); onClose(); } }}>
                  Open
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
