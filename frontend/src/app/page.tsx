'use client';

import { useState } from 'react';
import { mockJobSubmitted } from '@/mock';
import JobActionPanel from '@/components/JobActionPanel';

export default function Home() {
  const [role, setRole] = useState<'freelancer' | 'client'>('freelancer');

  const currentWallet =
    role === 'freelancer'
      ? mockJobSubmitted.freelancer
      : mockJobSubmitted.client;

  return (
    <main className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">
        Job Detail (Mock Test)
      </h1>

      <div className="mb-4 p-4 bg-gray-100 rounded space-y-2">
        <p>
          <strong>Status:</strong> {mockJobSubmitted.status}
        </p>

        <p>
          <strong>Submitted At:</strong>{' '}
          {new Date(
            mockJobSubmitted.submittedAt * 1000
          ).toLocaleString()}
        </p>

        <p>
          <strong>Current Role:</strong> {role}
        </p>

        <p>
          <strong>Current Wallet:</strong>{' '}
          {currentWallet.slice(0, 8)}...
        </p>
      </div>

      <div className="flex gap-3 mb-6">
        <button
          onClick={() => setRole('freelancer')}
          className="px-4 py-2 bg-blue-600 text-white rounded"
        >
          Freelancer
        </button>

        <button
          onClick={() => setRole('client')}
          className="px-4 py-2 bg-green-600 text-white rounded"
        >
          Client
        </button>
      </div>

      <JobActionPanel
        job={mockJobSubmitted}
        currentWallet={currentWallet}
        onDispute={() => alert('Calling Solana program: dispute() instruction!')}
        onApprove={() => alert('Calling Solana program: approve() instruction!')}
        onRetryAI={() => alert('Calling Backend: POST /api/jobs/:pda/evaluate')}
      />
    </main>
  );
}
