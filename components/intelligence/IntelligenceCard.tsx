"use client";

import { useEffect, useId, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Volume2, VolumeX } from "lucide-react";

export interface CardData {
  id: number;
  category: string;
  categoryColor: string;
  headline: string;
  source: string;
  time: string;
  videoId: string;
}

declare global {
  interface Window {
    YT?: {
      Player: new (id: string, config: YTPlayerConfig) => PlayerHandle;
    };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface YTPlayerConfig {
  videoId: string;
  playerVars?: Record<string, number | string>;
  events?: {
    onReady?: (event: { target: PlayerHandle }) => void;
    onMuteChange?: (event: { target: PlayerHandle; data: number }) => void;
    onStateChange?: (event: { target: PlayerHandle; data: number }) => void;
  };
}

interface PlayerHandle {
  mute: () => void;
  unMute: () => void;
  playVideo: () => void;
  destroy: () => void;
  getPlayerState: () => number;
  getMute: () => boolean;
  setVolume: (vol: number) => void;
  getVolume: () => number;
}

let ytApiReady = false;
const ytQueue: (() => void)[] = [];

function ensureYouTubeApi() {
  if (window.YT && window.YT.Player) {
    ytApiReady = true;
    const pending = ytQueue.splice(0);
    pending.forEach((fn) => fn());
    return;
  }
  if (document.getElementById("yt-iframe-api")) return;
  const tag = document.createElement("script");
  tag.id = "yt-iframe-api";
  tag.src = "https://www.youtube.com/iframe_api";
  tag.async = true;
  document.head.appendChild(tag);
  window.onYouTubeIframeAPIReady = () => {
    ytApiReady = true;
    const pending = ytQueue.splice(0);
    pending.forEach((fn) => fn());
  };
}

export default function IntelligenceCard({ card }: { card: CardData }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<PlayerHandle | null>(null);
  const [muted, setMuted] = useState(true);
  const baseId = useId();
  const uidRef = useRef(`intel-yt-${baseId.replaceAll(":", "")}`);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    host.innerHTML = "";
    const target = document.createElement("div");
    target.id = uidRef.current;
    target.style.width = "100%";
    target.style.height = "100%";
    host.appendChild(target);

    let player: PlayerHandle | null = null;

    const create = () => {
      if (!window.YT?.Player) return;
      player = new window.YT.Player(uidRef.current, {
        videoId: card.videoId,
        playerVars: {
          autoplay: 1,
          mute: 1,
          loop: 1,
          playlist: card.videoId,
          controls: 0,
          rel: 0,
          modestbranding: 1,
          iv_load_policy: 3,
          playsinline: 1,
        },
        events: {
          onReady: (e: { target: PlayerHandle }) => {
            e.target.mute();
            e.target.setVolume(100);
            e.target.playVideo();
            setMuted(true);
          },
          onStateChange: (e: { target: PlayerHandle }) => {
            if (e.target && e.target.getMute) setMuted(e.target.getMute());
          },
        },
      });
      playerRef.current = player;
    };

    ensureYouTubeApi();
    if (ytApiReady) create();
    else ytQueue.push(create);

    return () => {
      player?.destroy?.();
      playerRef.current = null;
    };
  }, [card.videoId]);

  const toggleMute = () => {
    const p = playerRef.current;
    if (!p || !p.getMute) return;

    const isMuted = p.getMute();
    const wasMuted = isMuted !== false;

    if (wasMuted) {
      p.unMute();
      p.setVolume(100);
      setMuted(false);
    } else {
      p.mute();
      setMuted(true);
    }
  };

  return (
    <motion.div
      className="intel-card"
      whileHover={{
        translateY: -10,
        scale: 1.03,
        transition: { duration: 0.35, ease: "easeOut" },
      }}
    >
      <div className="intel-card-video">
        <div className="intel-card-video-host" ref={hostRef} />
        <div className="intel-card-video-guard" />
        <div className="intel-card-video-scrim scrim-top" />
        <div className="intel-card-video-scrim scrim-bottom" />
        <button
          type="button"
          className="intel-card-mute-btn"
          onClick={toggleMute}
          aria-label={muted ? "Unmute video" : "Mute video"}
        >
          {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
        </button>
      </div>
      <div className="intel-card-body">
        <span className="intel-card-category" style={{ color: card.categoryColor }}>
          {card.category}
        </span>
        <h3 className="intel-card-headline">{card.headline}</h3>
        <p className="intel-card-meta">
          {card.source} &middot; {card.time}
        </p>
      </div>
    </motion.div>
  );
}