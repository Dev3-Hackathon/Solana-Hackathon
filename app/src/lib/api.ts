// app/src/lib/api.ts
import { Verdict } from '@/types';

export interface ReportResponse {
    success: boolean;
    isTimeout: boolean;
    message: string;
    data: Verdict | null;
}

export async function fetchJobReport(jobPda: string): Promise<ReportResponse> {
    try {
        const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/reports/${jobPda}`);


        if (res.status === 404) {
            const errorData = await res.json();
            if (errorData.code === 'REPORT_NOT_FOUND') {
                return {
                    success: false,
                    isTimeout: true,
                    message: "No AI verdict was posted (review timed out).",
                    data: null
                };
            }
        }

        if (!res.ok) {
            throw new Error(`HTTP error! status: ${res.status}`);
        }

        const data: Verdict = await res.json();
        return { success: true, isTimeout: false, message: '', data };

    } catch (error) {
        console.error("Error fetching report:", error);
        return { success: false, isTimeout: false, message: "Failed to load AI report.", data: null };
    }
}