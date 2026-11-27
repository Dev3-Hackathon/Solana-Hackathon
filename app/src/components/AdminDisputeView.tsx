// app/src/components/AdminDisputeView.tsx
'use client';

import { useEffect, useState } from 'react';
import { fetchJobReport, ReportResponse } from '@/lib/api';

interface AdminDisputeViewProps {
    jobPda: string;
    onRelease: () => void;
    onRefund: () => void;
}

export default function AdminDisputeView({ jobPda, onRelease, onRefund }: AdminDisputeViewProps) {
    const [state, setState] = useState<ReportResponse>({
        success: true,
        isTimeout: false,
        message: '',
        data: null,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        fetchJobReport(jobPda).then((res) => {
            setState(res);
            setLoading(false);
        });
    }, [jobPda]);

    if (loading) {
        return <p className="text-gray-500 animate-pulse">Loading AI Report...</p>;
    }

    // Y22 Core UI: Gracefully handle timeout disputes (404)
    if (state.isTimeout) {
        return (
            <div className="p-6 border border-gray-300 bg-gray-50 rounded-lg text-center space-y-4">
                <div className="text-4xl"></div>
                <p className="text-gray-700 font-semibold text-lg">{state.message}</p>
                <p className="text-gray-500 text-sm">
                    The AI review timed out. Please manually review the deliverable and resolve the dispute below.
                </p>

                {/* Admin action buttons */}
                <div className="flex justify-center gap-4 pt-4 border-t border-gray-200">
                    <button
                        onClick={onRelease}
                        className="px-6 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition font-medium"
                    >
                        Release Funds (to Freelancer)
                    </button>
                    <button
                        onClick={onRefund}
                        className="px-6 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition font-medium"
                    >
                        Refund (to Client)
                    </button>
                </div>
            </div>
        );
    }

    // Normal case: AI report is available
    if (state.success && state.data) {
        return (
            <div className="p-6 border border-green-300 bg-green-50 rounded-lg space-y-4">
                <h3 className="text-xl font-bold text-green-800">
                    AI Verdict: {state.data.verdict.toUpperCase()} (Score: {state.data.score})
                </h3>
                <p className="text-gray-700">{state.data.summary}</p>

                {/* Detailed criteria list can be rendered here */}

                <div className="flex justify-end gap-4 pt-4 border-t border-green-200">
                    <button
                        onClick={onRelease}
                        className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 transition"
                    >
                        Release
                    </button>
                    <button
                        onClick={onRefund}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
                    >
                        Refund
                    </button>
                </div>
            </div>
        );
    }

    // Other network errors
    return <p className="text-red-500 font-medium">{state.message}</p>;
}