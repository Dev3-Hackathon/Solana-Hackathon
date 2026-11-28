//! ProofPay escrow program.
//!
//! Clients lock SOL in a Job PDA. An AI arbiter key can only PROPOSE a verdict;
//! the program enforces the dispute window, and a human admin settles disputes.
//! The arbiter has no instruction that moves lamports.

use anchor_lang::prelude::*;
use anchor_lang::system_program;

// Replaced automatically by `anchor keys sync`.
declare_id!("3KmsQFECaHRTRWUY2SJEtxAHWopP3bqoSVrcECDvMBWz");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// AI backend signer. Only allowed to call `propose_verdict`.
/// Replace with `solana-keygen pubkey keys/arbiter.json` (see scripts/gen-keys.sh).
pub const ARBITER: Pubkey = pubkey!("6jBZbaCVcBAvHYSzgrQJFuiQB18vXwhCK9EsohsGMoy1");
/// Human dispute resolver. Only allowed to call `resolve_dispute`.
/// Replace with `solana-keygen pubkey keys/admin.json`.
pub const ADMIN: Pubkey = pubkey!("B8y8yNjSd3EhbMfjeUexkdgY5fo5Uq3jYaZ3R6xWSjqG");

pub const JOB_SEED: &[u8] = b"job";
pub const MAX_URI_LEN: usize = 200;
/// Low minimum so tests and live demos can use a short window.
pub const MIN_WINDOW_SECS: i64 = 5;
pub const MAX_WINDOW_SECS: i64 = 7 * 24 * 60 * 60;
/// 0.001 SOL. Keeps payouts above rent-exempt minimum for a brand-new wallet.
pub const MIN_AMOUNT_LAMPORTS: u64 = 1_000_000;

pub const VERDICT_NONE: u8 = 0;
pub const VERDICT_PASS: u8 = 1;
pub const VERDICT_FAIL: u8 = 2;
pub const VERDICT_INCONCLUSIVE: u8 = 3;

// ---------------------------------------------------------------------------
// Program
// ---------------------------------------------------------------------------

#[program]
pub mod escrow {
    use super::*;

    /// Client creates a job. Arbiter and admin are fixed constants, never user input.
    pub fn create_job(
        ctx: Context<CreateJob>,
        job_id: u64,
        freelancer: Pubkey,
        amount: u64,
        spec_hash: [u8; 32],
        deadline: i64,
        dispute_window_secs: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let client = ctx.accounts.client.key();

        require!(amount >= MIN_AMOUNT_LAMPORTS, ErrorCode::InvalidAmount);
        require_keys_neq!(freelancer, client, ErrorCode::InvalidFreelancer);
        require!(deadline > now, ErrorCode::DeadlinePassed);
        require!(
            (MIN_WINDOW_SECS..=MAX_WINDOW_SECS).contains(&dispute_window_secs),
            ErrorCode::InvalidWindow
        );

        ctx.accounts.job.set_inner(Job {
            job_id,
            client,
            freelancer,
            arbiter: ARBITER,
            admin: ADMIN,
            amount,
            spec_hash,
            deliverable_hash: [0u8; 32],
            status: JobStatus::Created,
            verdict: VERDICT_NONE,
            verdict_score: 0,
            verdict_proposed_at: 0,
            dispute_window_secs,
            deadline,
            disputed_by: Pubkey::default(),
            bump: ctx.bumps.job,
            submitted_at: 0,
            deliverable_uri: String::new(),
            verdict_uri: String::new(),
        });

        emit!(JobCreated {
            job: ctx.accounts.job.key(),
            client,
            freelancer,
            amount,
        });
        Ok(())
    }

        /// Pollar path: a relayer (backend) creates the job on behalf of a client
    /// whose wallet can't sign program calls (e.g. a Pollar social-login wallet).
    /// The client is just an address here; refunds always go to it.
    pub fn create_job_for(
        ctx: Context<CreateJobFor>,
        job_id: u64,
        client: Pubkey,
        freelancer: Pubkey,
        amount: u64,
        spec_hash: [u8; 32],
        deadline: i64,
        dispute_window_secs: i64,
    ) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        require!(amount >= MIN_AMOUNT_LAMPORTS, ErrorCode::InvalidAmount);
        require_keys_neq!(freelancer, client, ErrorCode::InvalidFreelancer);
        require!(deadline > now, ErrorCode::DeadlinePassed);
        require!(
            (MIN_WINDOW_SECS..=MAX_WINDOW_SECS).contains(&dispute_window_secs),
            ErrorCode::InvalidWindow
        );

        ctx.accounts.job.set_inner(Job {
            job_id,
            client,
            freelancer,
            arbiter: ARBITER,
            admin: ADMIN,
            amount,
            spec_hash,
            deliverable_hash: [0u8; 32],
            status: JobStatus::Created,
            verdict: VERDICT_NONE,
            verdict_score: 0,
            verdict_proposed_at: 0,
            dispute_window_secs,
            deadline,
            disputed_by: Pubkey::default(),
            bump: ctx.bumps.job,
            submitted_at: 0,
            deliverable_uri: String::new(),
            verdict_uri: String::new(),
        });

        emit!(JobCreated {
            job: ctx.accounts.job.key(),
            client,
            freelancer,
            amount,
        });
        Ok(())
    }

    /// Pollar path: the client paid `amount` SOL straight to the Job PDA with a
    /// plain transfer (Pollar `sendPayment`). Anyone can call this to mark it Funded
    /// once the PDA holds rent + amount.
    pub fn confirm_funding(ctx: Context<ConfirmFunding>) -> Result<()> {
        require!(
            ctx.accounts.job.status == JobStatus::Created,
            ErrorCode::InvalidStatus
        );
        let info = ctx.accounts.job.to_account_info();
        let rent_min = Rent::get()?.minimum_balance(info.data_len());
        let needed = rent_min
            .checked_add(ctx.accounts.job.amount)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(info.lamports() >= needed, ErrorCode::NotFunded);

        ctx.accounts.job.status = JobStatus::Funded;
        emit!(JobFunded {
            job: ctx.accounts.job.key(),
            amount: ctx.accounts.job.amount,
        });
        Ok(())
    }

    /// Client moves `amount` lamports into the Job PDA.
    pub fn fund_job(ctx: Context<FundJob>) -> Result<()> {
        require!(
            ctx.accounts.job.status == JobStatus::Created,
            ErrorCode::InvalidStatus
        );
        let amount = ctx.accounts.job.amount;

        system_program::transfer(
            CpiContext::new(
                ctx.accounts.system_program.to_account_info(),
                system_program::Transfer {
                    from: ctx.accounts.client.to_account_info(),
                    to: ctx.accounts.job.to_account_info(),
                },
            ),
            amount,
        )?;

        ctx.accounts.job.status = JobStatus::Funded;
        emit!(JobFunded {
            job: ctx.accounts.job.key(),
            amount,
        });
        Ok(())
    }

    pub fn accept_job(ctx: Context<FreelancerAction>) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Funded, ErrorCode::InvalidStatus);
        require!(
            Clock::get()?.unix_timestamp < job.deadline,
            ErrorCode::DeadlinePassed
        );
        job.status = JobStatus::Accepted;
        Ok(())
    }

    pub fn submit_work(
        ctx: Context<FreelancerAction>,
        deliverable_uri: String,
        deliverable_hash: [u8; 32],
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Accepted, ErrorCode::InvalidStatus);
        require!(
            Clock::get()?.unix_timestamp <= job.deadline,
            ErrorCode::DeadlinePassed
        );
        require!(
            !deliverable_uri.is_empty() && deliverable_uri.len() <= MAX_URI_LEN,
            ErrorCode::UriTooLong
        );

        job.deliverable_uri = deliverable_uri;
        job.deliverable_hash = deliverable_hash;
        job.submitted_at = Clock::get()?.unix_timestamp;
        job.status = JobStatus::Submitted;

        emit!(WorkSubmitted {
            job: job.key(),
            deliverable_hash,
        });
        Ok(())
    }

    /// Arbiter (AI backend) proposes a verdict. Cannot move funds.
    /// pass/fail -> VerdictProposed (window starts). inconclusive -> Disputed.
    pub fn propose_verdict(
        ctx: Context<ProposeVerdict>,
        verdict: u8,
        score: u8,
        verdict_uri: String,
    ) -> Result<()> {
        let job = &mut ctx.accounts.job;
        require!(job.status == JobStatus::Submitted, ErrorCode::InvalidStatus);
        require!(
            (VERDICT_PASS..=VERDICT_INCONCLUSIVE).contains(&verdict),
            ErrorCode::InvalidVerdict
        );
        require!(score <= 100, ErrorCode::InvalidVerdict);
        require!(verdict_uri.len() <= MAX_URI_LEN, ErrorCode::UriTooLong);

        job.verdict = verdict;
        job.verdict_score = score;
        job.verdict_uri = verdict_uri;
        job.verdict_proposed_at = Clock::get()?.unix_timestamp;
        job.status = if verdict == VERDICT_INCONCLUSIVE {
            JobStatus::Disputed
        } else {
            JobStatus::VerdictProposed
        };

        emit!(VerdictProposed {
            job: job.key(),
            verdict,
            score,
        });
        Ok(())
    }

    /// Client is happy: release to freelancer immediately (skips the window).
    pub fn approve(ctx: Context<Approve>) -> Result<()> {
        let status = ctx.accounts.job.status;
        require!(
            status == JobStatus::Submitted || status == JobStatus::VerdictProposed,
            ErrorCode::InvalidStatus
        );
        let amount = ctx.accounts.job.amount;
        pay_out(
            &ctx.accounts.job.to_account_info(),
            &ctx.accounts.freelancer.to_account_info(),
            amount,
        )?;
        ctx.accounts.job.status = JobStatus::Released;
        emit!(Settled {
            job: ctx.accounts.job.key(),
            released: true,
            amount,
        });
        Ok(())
    }

    /// Client or freelancer escalates to the admin:
    /// - VerdictProposed: contest the AI verdict while the window is open.
    /// - Submitted: no verdict arrived within `dispute_window_secs` of submission
    ///   (backend down / arbiter offline), so funds are not stuck.
    pub fn dispute(ctx: Context<Dispute>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let job = &mut ctx.accounts.job;
        match job.status {
            JobStatus::VerdictProposed => {
                let closes_at = job
                    .verdict_proposed_at
                    .checked_add(job.dispute_window_secs)
                    .ok_or(ErrorCode::MathOverflow)?;
                require!(now < closes_at, ErrorCode::WindowClosed);
            }
            JobStatus::Submitted => {
                let timeout_at = job
                    .submitted_at
                    .checked_add(job.dispute_window_secs)
                    .ok_or(ErrorCode::MathOverflow)?;
                require!(now >= timeout_at, ErrorCode::ReviewNotTimedOut);
            }
            _ => return err!(ErrorCode::InvalidStatus),
        }

        job.status = JobStatus::Disputed;
        job.disputed_by = ctx.accounts.signer.key();
        emit!(Disputed {
            job: job.key(),
            by: job.disputed_by,
        });
        Ok(())
    }

    /// Anyone can settle once the window has passed with no dispute.
    pub fn finalize(ctx: Context<Settle>) -> Result<()> {
        let job = &ctx.accounts.job;
        require!(
            job.status == JobStatus::VerdictProposed,
            ErrorCode::InvalidStatus
        );
        let closes_at = job
            .verdict_proposed_at
            .checked_add(job.dispute_window_secs)
            .ok_or(ErrorCode::MathOverflow)?;
        require!(
            Clock::get()?.unix_timestamp >= closes_at,
            ErrorCode::WindowOpen
        );

        let release = match job.verdict {
            VERDICT_PASS => true,
            VERDICT_FAIL => false,
            _ => return err!(ErrorCode::InvalidVerdict),
        };
        settle(ctx, release)
    }

    /// Admin makes the final human decision on a disputed job.
    pub fn resolve_dispute(ctx: Context<ResolveDispute>, release: bool) -> Result<()> {
        require!(
            ctx.accounts.job.status == JobStatus::Disputed,
            ErrorCode::InvalidStatus
        );
        let amount = ctx.accounts.job.amount;
        let to = if release {
            ctx.accounts.freelancer.to_account_info()
        } else {
            ctx.accounts.client.to_account_info()
        };
        pay_out(&ctx.accounts.job.to_account_info(), &to, amount)?;
        ctx.accounts.job.status = if release {
            JobStatus::Released
        } else {
            JobStatus::Refunded
        };
        emit!(Settled {
            job: ctx.accounts.job.key(),
            released: release,
            amount,
        });
        Ok(())
    }

    /// Client backs out: before acceptance, or after the deadline with no submission.
    pub fn cancel_job(ctx: Context<CancelJob>) -> Result<()> {
        let now = Clock::get()?.unix_timestamp;
        let job = &ctx.accounts.job;
        let refund = match job.status {
            JobStatus::Created => false,
            JobStatus::Funded => true,
            JobStatus::Accepted => {
                require!(now > job.deadline, ErrorCode::DeadlineNotPassed);
                true
            }
            _ => return err!(ErrorCode::InvalidStatus),
        };
        if refund {
            let amount = job.amount;
            pay_out(
                &ctx.accounts.job.to_account_info(),
                &ctx.accounts.client.to_account_info(),
                amount,
            )?;
        }
        ctx.accounts.job.status = JobStatus::Cancelled;
        Ok(())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Move exactly `amount` lamports out of the program-owned Job PDA.
/// The rent-exempt reserve always stays behind.
fn pay_out<'info>(job: &AccountInfo<'info>, to: &AccountInfo<'info>, amount: u64) -> Result<()> {
    let rent_min = Rent::get()?.minimum_balance(job.data_len());
    let job_balance = job.lamports();
    let remaining = job_balance
        .checked_sub(amount)
        .ok_or(ErrorCode::MathOverflow)?;
    require!(remaining >= rent_min, ErrorCode::InsufficientEscrow);
    let to_balance = to
        .lamports()
        .checked_add(amount)
        .ok_or(ErrorCode::MathOverflow)?;

    **job.try_borrow_mut_lamports()? = remaining;
    **to.try_borrow_mut_lamports()? = to_balance;
    Ok(())
}

fn settle(ctx: Context<Settle>, release: bool) -> Result<()> {
    let amount = ctx.accounts.job.amount;
    let to = if release {
        ctx.accounts.freelancer.to_account_info()
    } else {
        ctx.accounts.client.to_account_info()
    };
    pay_out(&ctx.accounts.job.to_account_info(), &to, amount)?;
    ctx.accounts.job.status = if release {
        JobStatus::Released
    } else {
        JobStatus::Refunded
    };
    emit!(Settled {
        job: ctx.accounts.job.key(),
        released: release,
        amount,
    });
    Ok(())
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

#[derive(Accounts)]
#[instruction(job_id: u64)]
pub struct CreateJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(
        init,
        payer = client,
        space = 8 + Job::INIT_SPACE,
        seeds = [JOB_SEED, client.key().as_ref(), &job_id.to_le_bytes()],
        bump
    )]
    pub job: Account<'info, Job>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(job_id: u64, client: Pubkey)]
pub struct CreateJobFor<'info> {
    /// Relayer / fee payer. Pays rent for the Job account; has no rights over it.
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = 8 + Job::INIT_SPACE,
        seeds = [JOB_SEED, client.as_ref(), &job_id.to_le_bytes()],
        bump
    )]
    pub job: Account<'info, Job>,
    pub system_program: Program<'info, System>,
}

/// Permissionless: only checks the Job PDA's balance.
#[derive(Accounts)]
pub struct ConfirmFunding<'info> {
    #[account(mut)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct FundJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut, has_one = client @ ErrorCode::Unauthorized)]
    pub job: Account<'info, Job>,
    pub system_program: Program<'info, System>,
}

/// Shared by accept_job and submit_work.
#[derive(Accounts)]
pub struct FreelancerAction<'info> {
    pub freelancer: Signer<'info>,
    #[account(mut, has_one = freelancer @ ErrorCode::Unauthorized)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct ProposeVerdict<'info> {
    pub arbiter: Signer<'info>,
    #[account(mut, has_one = arbiter @ ErrorCode::Unauthorized)]
    pub job: Account<'info, Job>,
}

#[derive(Accounts)]
pub struct Approve<'info> {
    pub client: Signer<'info>,
    #[account(
        mut,
        has_one = client @ ErrorCode::Unauthorized,
        has_one = freelancer @ ErrorCode::Unauthorized
    )]
    pub job: Account<'info, Job>,
    /// CHECK: must equal job.freelancer (has_one); only receives lamports.
    #[account(mut)]
    pub freelancer: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct Dispute<'info> {
    pub signer: Signer<'info>,
    #[account(
        mut,
        constraint = signer.key() == job.client || signer.key() == job.freelancer
            @ ErrorCode::Unauthorized
    )]
    pub job: Account<'info, Job>,
}

/// Permissionless: no signer besides the fee payer.
#[derive(Accounts)]
pub struct Settle<'info> {
    #[account(
        mut,
        has_one = client @ ErrorCode::Unauthorized,
        has_one = freelancer @ ErrorCode::Unauthorized
    )]
    pub job: Account<'info, Job>,
    /// CHECK: must equal job.client (has_one); only receives lamports.
    #[account(mut)]
    pub client: UncheckedAccount<'info>,
    /// CHECK: must equal job.freelancer (has_one); only receives lamports.
    #[account(mut)]
    pub freelancer: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct ResolveDispute<'info> {
    pub admin: Signer<'info>,
    #[account(
        mut,
        has_one = admin @ ErrorCode::Unauthorized,
        has_one = client @ ErrorCode::Unauthorized,
        has_one = freelancer @ ErrorCode::Unauthorized
    )]
    pub job: Account<'info, Job>,
    /// CHECK: must equal job.client (has_one); only receives lamports.
    #[account(mut)]
    pub client: UncheckedAccount<'info>,
    /// CHECK: must equal job.freelancer (has_one); only receives lamports.
    #[account(mut)]
    pub freelancer: UncheckedAccount<'info>,
}

#[derive(Accounts)]
pub struct CancelJob<'info> {
    #[account(mut)]
    pub client: Signer<'info>,
    #[account(mut, has_one = client @ ErrorCode::Unauthorized)]
    pub job: Account<'info, Job>,
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

/// Fixed-size fields first so their byte offsets never change (useful for
/// memcmp filters): client @16, freelancer @48, status @216. Strings last.
#[account]
#[derive(InitSpace)]
pub struct Job {
    pub job_id: u64,
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub arbiter: Pubkey,
    pub admin: Pubkey,
    pub amount: u64,
    pub spec_hash: [u8; 32],
    pub deliverable_hash: [u8; 32],
    pub status: JobStatus,
    pub verdict: u8,
    pub verdict_score: u8,
    pub verdict_proposed_at: i64,
    pub dispute_window_secs: i64,
    pub deadline: i64,
    pub disputed_by: Pubkey,
    pub bump: u8,
    /// Set in submit_work. Lets either party escalate if no verdict arrives.
    pub submitted_at: i64,
    #[max_len(200)]
    pub deliverable_uri: String,
    #[max_len(200)]
    pub verdict_uri: String,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, Debug, InitSpace)]
pub enum JobStatus {
    Created,
    Funded,
    Accepted,
    Submitted,
    VerdictProposed,
    Disputed,
    Released,
    Refunded,
    Cancelled,
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

#[event]
pub struct JobCreated {
    pub job: Pubkey,
    pub client: Pubkey,
    pub freelancer: Pubkey,
    pub amount: u64,
}

#[event]
pub struct JobFunded {
    pub job: Pubkey,
    pub amount: u64,
}

#[event]
pub struct WorkSubmitted {
    pub job: Pubkey,
    pub deliverable_hash: [u8; 32],
}

#[event]
pub struct VerdictProposed {
    pub job: Pubkey,
    pub verdict: u8,
    pub score: u8,
}

#[event]
pub struct Disputed {
    pub job: Pubkey,
    pub by: Pubkey,
}

#[event]
pub struct Settled {
    pub job: Pubkey,
    pub released: bool,
    pub amount: u64,
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

#[error_code]
pub enum ErrorCode {
    #[msg("Job is not in the required status for this action")]
    InvalidStatus,
    #[msg("Signer is not allowed to perform this action")]
    Unauthorized,
    #[msg("Deadline has passed")]
    DeadlinePassed,
    #[msg("Deadline has not passed yet")]
    DeadlineNotPassed,
    #[msg("Dispute window is still open")]
    WindowOpen,
    #[msg("Dispute window has closed")]
    WindowClosed,
    #[msg("Dispute window out of allowed range")]
    InvalidWindow,
    #[msg("Amount below minimum (0.001 SOL)")]
    InvalidAmount,
    #[msg("Freelancer must be a different wallet from the client")]
    InvalidFreelancer,
    #[msg("URI is empty or longer than 200 bytes")]
    UriTooLong,
    #[msg("Verdict must be 1 (pass), 2 (fail) or 3 (inconclusive), score 0-100")]
    InvalidVerdict,
    #[msg("No verdict yet, but the review timeout has not passed")]
    ReviewNotTimedOut,
    #[msg("Job PDA does not hold the escrow amount yet")]
    NotFunded,
    #[msg("Escrow balance too low")]
    InsufficientEscrow,
    #[msg("Arithmetic overflow")]
    MathOverflow,
}
