'use client';

import { useState } from 'react';
import type { Job } from '@/types';
import CountdownTimer from './CountdownTimer';

interface JobActionPanelProps {
    job: Job;
    currentWallet: string;
    onDispute: () => void;
    onApprove: () => void;
    onRetryAI: () => void;
}

function toSecs(val: unknown, fallback = 300): number {
    if (typeof val === 'number' && Number.isFinite(val)) return val;
    if (val && typeof (val as { toNumber?: () => number }).toNumber === 'function') {
        return (val as { toNumber: () => number }).toNumber();
    }
    const parsed = Number(val);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export default function JobActionPanel({
    job,
    currentWallet,
    onDispute,
    onApprove,
    onRetryAI
}: JobActionPanelProps) {
    const [isTimeoutReached, setIsTimeoutReached] = useState(false);
    const [isDisputeWindowClosed, setIsDisputeWindowClosed] = useState(false);

    const disputeWindowSecs = toSecs(job.disputeWindowSecs, 300);
    const submittedAtSecs = toSecs(job.submittedAt, 0);
    const verdictProposedAtSecs = toSecs(job.verdictProposedAt, 0);

    const timeoutTarget = submittedAtSecs + disputeWindowSecs;

    const isClient = currentWallet === job.client;
    const isFreelancer = currentWallet === job.freelancer;
    const canAct = isClient || isFreelancer;

    if (job.status === 'Submitted') {
        return (
            <div className="p-4 border border-yellow-300 bg-yellow-50 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-yellow-800">
                        Waiting for AI review
                    </h3>

                    {!isTimeoutReached && (
                        <div className="text-sm text-gray-600">
                            Auto-dispute available in:{' '}
                            <CountdownTimer
                                targetTimestampSecs={timeoutTarget}
                                onTimeout={() => setIsTimeoutReached(true)}
                            />
                        </div>
                    )}
                </div>

                {canAct && (
                    <div className="flex flex-wrap gap-3">
                        {isClient && (
                            <button
                                onClick={onApprove}
                                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                            >
                                Approve
                            </button>
                        )}

                        {isFreelancer && (
                            <button
                                onClick={onRetryAI}
                                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
                            >
                                Retry AI review
                            </button>
                        )}

                        {isTimeoutReached && (
                            <button
                                onClick={onDispute}
                                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-bold animate-pulse"
                            >
                                Dispute (no verdict yet)
                            </button>
                        )}
                    </div>
                )}
            </div>
        );
    }

    if (job.status === 'VerdictProposed') {
        const disputeDeadline = verdictProposedAtSecs + disputeWindowSecs;

        return (
            <div className="p-4 border border-orange-300 bg-orange-50 rounded-lg space-y-4">
                <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-orange-800">
                        AI verdict posted. You can dispute until the window closes.
                    </h3>

                    <div className="text-sm text-gray-600">
                        Time left to dispute:{' '}
                        <CountdownTimer
                            targetTimestampSecs={disputeDeadline}
                            onTimeout={() => setIsDisputeWindowClosed(true)}
                            expiredText="Dispute window closed"
                        />
                    </div>
                </div>

                {canAct && !isDisputeWindowClosed && (
                    <div className="flex gap-3">
                        <button
                            onClick={onDispute}
                            className="px-4 py-2 bg-orange-600 text-white rounded hover:bg-orange-700 transition"
                        >
                            Dispute Verdict
                        </button>
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="p-4 border border-gray-200 bg-gray-50 rounded-lg">
            <p className="text-gray-500">
                No actions available for status: {job.status}
            </p>
        </div>
    );
}