import { useState, useEffect, useRef } from "react";
import { type SlideData } from "../../types";

export function SlideViewport({
  slides,
  presentationName,
  onEnd,
  onSpeak,
  onStopSpeaking,
  onWaitUntilDone,
  onPlayingChange,
  avatarHidden,
}: {
  slides: SlideData[];
  presentationName: string;
  onEnd: () => void;
  onSpeak: (text: string) => void;
  onStopSpeaking: () => void;
  onWaitUntilDone: () => Promise<void>;
  onPlayingChange?: (playing: boolean, reason: "manual" | "end") => void;
  avatarHidden?: boolean;
}) {
  const [page, setPage] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const isPlayingRef = useRef(false);
  const total = slides.length;

  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  function changePlayState(value: boolean, reason: "manual" | "end" = "manual") {
    setIsPlaying(value);
    onPlayingChange?.(value, reason);
  }

  useEffect(() => {
    setPage(0);
    changePlayState(false, "manual");
  }, [presentationName]);

  useEffect(() => {
    if (!isPlaying) return;
    const slide = slides[page];
    if (!slide) return;
    onStopSpeaking();
    slide.paragraphs.forEach((p) => onSpeak(p));
  }, [page, slides, isPlaying]);

  useEffect(() => {
    if (!isPlaying || total === 0) return;
    let cancelled = false;

    (async () => {
      await onWaitUntilDone();
      if (cancelled || !isPlayingRef.current) return;
      if (page < total - 1) {
        setPage((p) => p + 1);
      } else {
        changePlayState(false, "end");
        onEnd();
      }
    })();

    return () => { cancelled = true; };
  }, [isPlaying, page, total]);

  const slide = slides[page];

  function goTo(idx: number) {
    onStopSpeaking();
    setPage(Math.max(0, Math.min(total - 1, idx)));
  }

  return (
    <div className="slideWrap">
      <div className={`slideCanvas${avatarHidden ? " slideCanvasExpanded" : ""}`}>
        {slide ? (
          <img
            src={`/uploads/${encodeURIComponent(presentationName)}/${encodeURIComponent(slide.image)}`}
            alt={`Slide ${page + 1}`}
            className="slideImg"
          />
        ) : (
          <div className="slidePlaceholder">
            <div className="text-sm text-gray-600">No slides loaded</div>
            <div className="text-2xl font-semibold mt-2">Select a presentation</div>
            <div className="text-sm text-gray-500 mt-2 max-w-md">
              Use the Select button or ask the assistant to start a presentation.
            </div>
          </div>
        )}
      </div>

      <div className="slideControlsWrapper">
        <div className="slideControlsTop">
          <button className="slideControlBtn" onClick={() => goTo(0)} title="Go to start" disabled={total === 0}>
            <img src="/start.png" alt="Start" className="slideControlIcon" />
          </button>
          <button className="slideControlBtn" onClick={() => goTo(page - 1)} title="Previous slide" disabled={page === 0 || total === 0}>
            <img src="/left.png" alt="Previous" className="slideControlIconLarge" />
          </button>

          <div className="progressBar">
            <div className="progressFill" style={{ width: total ? `${((page + 1) / total) * 100}%` : "0%" }} />
            <div className="progressText">{total ? `${page + 1} of ${total}` : "—"}</div>
          </div>

          <button className="slideControlBtn" onClick={() => goTo(page + 1)} title="Next slide" disabled={page >= total - 1 || total === 0}>
            <img src="/right.png" alt="Next" className="slideControlIconLarge" />
          </button>
          <button className="slideControlBtn" onClick={() => goTo(total - 1)} title="Go to end" disabled={total === 0}>
            <img src="/end.png" alt="End" className="slideControlIcon" />
          </button>
        </div>

        <div className="slideControlsBottom">
          <button
            className="slideControlBtn"
            disabled={total === 0}
            onClick={() => {
              if (isPlaying) {
                changePlayState(false, "manual");
                onStopSpeaking();
              } else {
                if (page >= total - 1) setPage(0);
                changePlayState(true);
              }
            }}
            title={isPlaying ? "Stop" : "Play"}
          >
            <img
              src={isPlaying ? "/stop.png" : "/play.png"}
              alt={isPlaying ? "Stop" : "Play"}
              className="slideControlIcon"
            />
          </button>
        </div>
      </div>
    </div>
  );
}
