// app/src/components/CountdownTimer.tsx
'use client';

import { useEffect, useState } from 'react';

interface CountdownTimerProps {
    targetTimestampSecs: number;
    onTimeout: () => void;
    expiredText?: string;
}

export default function CountdownTimer({
    targetTimestampSecs,
    onTimeout,
    expiredText = "Time's up!"
}: CountdownTimerProps) {
    const [timeLeft, setTimeLeft] = useState<number>(0);
    const [isExpired, setIsExpired] = useState<boolean>(false);

    useEffect(() => {
        const calculateTimeLeft = () => {
            const nowSecs = Math.floor(Date.now() / 1000);
            const diff = targetTimestampSecs - nowSecs;

            if (diff <= 0) {
                setTimeLeft(0);
                setIsExpired(true);
                onTimeout();
                return;
            }

            setTimeLeft(diff);
        };

        calculateTimeLeft();
        const timer = setInterval(calculateTimeLeft, 1000);

        return () => clearInterval(timer);
    }, [targetTimestampSecs, onTimeout]);

    if (isExpired) {
        return <span className="text-red-600 font-bold">{expiredText}</span>;
    }

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;

    return (
        <span className="font-mono text-blue-600 font-semibold">
            {minutes}:{seconds.toString().padStart(2, '0')}
        </span>
    );
}