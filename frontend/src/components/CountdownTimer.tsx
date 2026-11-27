'use client';

import { useEffect, useState, useRef } from 'react';

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

    const onTimeoutRef = useRef(onTimeout);
    const hasTriggeredRef = useRef(false);

    useEffect(() => {
        onTimeoutRef.current = onTimeout;
    }, [onTimeout]);

    useEffect(() => {
        hasTriggeredRef.current = false;
        setIsExpired(false);

        const calculateTimeLeft = () => {
            const nowSecs = Math.floor(Date.now() / 1000);
            const diff = targetTimestampSecs - nowSecs;

            if (diff <= 0) {
                setTimeLeft(0);
                setIsExpired(true);

                if (!hasTriggeredRef.current) {
                    hasTriggeredRef.current = true;
                    onTimeoutRef.current();
                }

                return true;
            }

            setTimeLeft(diff);
            return false;
        };

        const alreadyExpired = calculateTimeLeft();

        if (alreadyExpired) {
            return;
        }

        const timer = setInterval(() => {
            const expired = calculateTimeLeft();

            if (expired) {
                clearInterval(timer);
            }
        }, 1000);

        return () => clearInterval(timer);
    }, [targetTimestampSecs]);

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