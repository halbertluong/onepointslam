'use client';

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface CoinTossAnimationProps {
  player1Name: string;
  player2Name: string;
  onResult: (serverId: 'player1' | 'player2') => void;
  title?: string;
  resultLabel?: string;
  icon?: string;
}

export default function CoinTossAnimation({
  player1Name,
  player2Name,
  onResult,
  title = 'Coin Toss — Server Selection',
  resultLabel = 'serves first',
  icon = '🎾',
}: CoinTossAnimationProps) {
  const [phase, setPhase] = useState<'idle' | 'flipping' | 'result'>('idle');
  const [displayed, setDisplayed] = useState<string>(player1Name);
  const [winner, setWinner] = useState<'player1' | 'player2' | null>(null);

  const startFlip = useCallback(() => {
    setPhase('flipping');
    const result: 'player1' | 'player2' = Math.random() < 0.5 ? 'player1' : 'player2';
    const winnerName = result === 'player1' ? player1Name : player2Name;

    let elapsed = 0;
    const interval = 80;
    const duration = 1500;

    const timer = setInterval(() => {
      elapsed += interval;
      setDisplayed(Math.random() < 0.5 ? player1Name : player2Name);
      if (elapsed >= duration) {
        clearInterval(timer);
        setDisplayed(winnerName);
        setWinner(result);
        setPhase('result');
        setTimeout(() => onResult(result), 600);
      }
    }, interval);
  }, [player1Name, player2Name, onResult]);

  return (
    <div className="flex flex-col items-center gap-6 p-6">
      <div className="text-center">
        <p className="text-sm font-medium text-slate-500 uppercase tracking-widest mb-2">
          {title}
        </p>
        <p className="text-slate-600 text-sm">
          {player1Name} vs {player2Name}
        </p>
      </div>

      {/* Coin visual */}
      <div className="relative w-40 h-40 flex items-center justify-center">
        <motion.div
          className="w-36 h-36 rounded-full flex items-center justify-center shadow-2xl text-center px-3"
          style={{ backgroundColor: 'var(--tenant-primary)' }}
          animate={
            phase === 'flipping'
              ? { rotateY: [0, 180, 360, 540, 720, 900, 1080], scale: [1, 1.05, 1] }
              : phase === 'result'
              ? { scale: [1, 1.15, 1] }
              : {}
          }
          transition={{ duration: phase === 'flipping' ? 1.5 : 0.3 }}
        >
          <AnimatePresence mode="wait">
            <motion.span
              key={displayed}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.06 }}
              className="text-white font-bold text-sm leading-tight"
            >
              {phase === 'idle' ? icon : displayed}
            </motion.span>
          </AnimatePresence>
        </motion.div>
      </div>

      {phase === 'result' && winner && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <p className="text-2xl font-bold" style={{ color: 'var(--tenant-primary)' }}>
            {winner === 'player1' ? player1Name : player2Name}
          </p>
          <p className="text-slate-500 mt-1">{resultLabel}</p>
        </motion.div>
      )}

      {phase === 'idle' && (
        <button
          onClick={startFlip}
          className="btn-primary tap-target w-full max-w-xs rounded-2xl text-lg"
        >
          Flip Coin
        </button>
      )}

      {phase === 'flipping' && (
        <p className="text-slate-400 animate-pulse text-sm">Flipping...</p>
      )}
    </div>
  );
}
