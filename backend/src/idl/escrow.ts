/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/escrow.json`.
 */
export type Escrow = {
  "address": "3KmsQFECaHRTRWUY2SJEtxAHWopP3bqoSVrcECDvMBWz",
  "metadata": {
    "name": "escrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "ProofPay AI-arbitrated freelance escrow"
  },
  "instructions": [
    {
      "name": "acceptJob",
      "discriminator": [
        43,
        201,
        124,
        1,
        19,
        189,
        96,
        10
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "approve",
      "docs": [
        "Client is happy: release to freelancer immediately (skips the window)."
      ],
      "discriminator": [
        69,
        74,
        217,
        36,
        115,
        117,
        97,
        76
      ],
      "accounts": [
        {
          "name": "client",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "freelancer",
          "writable": true,
          "relations": [
            "job"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "cancelJob",
      "docs": [
        "Client backs out: before acceptance, or after the deadline with no submission."
      ],
      "discriminator": [
        126,
        241,
        155,
        241,
        50,
        236,
        83,
        118
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "createJob",
      "docs": [
        "Client creates a job. Arbiter and admin are fixed constants, never user input."
      ],
      "discriminator": [
        178,
        130,
        217,
        110,
        100,
        27,
        82,
        119
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true
        },
        {
          "name": "job",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  106,
                  111,
                  98
                ]
              },
              {
                "kind": "account",
                "path": "client"
              },
              {
                "kind": "arg",
                "path": "jobId"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "jobId",
          "type": "u64"
        },
        {
          "name": "freelancer",
          "type": "pubkey"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "specHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        },
        {
          "name": "deadline",
          "type": "i64"
        },
        {
          "name": "disputeWindowSecs",
          "type": "i64"
        }
      ]
    },
    {
      "name": "dispute",
      "docs": [
        "Client or freelancer escalates to the admin:",
        "- VerdictProposed: contest the AI verdict while the window is open.",
        "- Submitted: no verdict arrived within `dispute_window_secs` of submission",
        "(backend down / arbiter offline), so funds are not stuck."
      ],
      "discriminator": [
        216,
        92,
        128,
        146,
        202,
        85,
        135,
        73
      ],
      "accounts": [
        {
          "name": "signer",
          "signer": true
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": []
    },
    {
      "name": "finalize",
      "docs": [
        "Anyone can settle once the window has passed with no dispute."
      ],
      "discriminator": [
        171,
        61,
        218,
        56,
        127,
        115,
        12,
        217
      ],
      "accounts": [
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "client",
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "freelancer",
          "writable": true,
          "relations": [
            "job"
          ]
        }
      ],
      "args": []
    },
    {
      "name": "fundJob",
      "docs": [
        "Client moves `amount` lamports into the Job PDA."
      ],
      "discriminator": [
        244,
        198,
        4,
        15,
        41,
        178,
        169,
        187
      ],
      "accounts": [
        {
          "name": "client",
          "writable": true,
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "proposeVerdict",
      "docs": [
        "Arbiter (AI backend) proposes a verdict. Cannot move funds.",
        "pass/fail -> VerdictProposed (window starts). inconclusive -> Disputed."
      ],
      "discriminator": [
        228,
        206,
        140,
        251,
        203,
        78,
        151,
        72
      ],
      "accounts": [
        {
          "name": "arbiter",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "verdict",
          "type": "u8"
        },
        {
          "name": "score",
          "type": "u8"
        },
        {
          "name": "verdictUri",
          "type": "string"
        }
      ]
    },
    {
      "name": "resolveDispute",
      "docs": [
        "Admin makes the final human decision on a disputed job."
      ],
      "discriminator": [
        231,
        6,
        202,
        6,
        96,
        103,
        12,
        230
      ],
      "accounts": [
        {
          "name": "admin",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        },
        {
          "name": "client",
          "writable": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "freelancer",
          "writable": true,
          "relations": [
            "job"
          ]
        }
      ],
      "args": [
        {
          "name": "release",
          "type": "bool"
        }
      ]
    },
    {
      "name": "submitWork",
      "discriminator": [
        158,
        80,
        101,
        51,
        114,
        130,
        101,
        253
      ],
      "accounts": [
        {
          "name": "freelancer",
          "signer": true,
          "relations": [
            "job"
          ]
        },
        {
          "name": "job",
          "writable": true
        }
      ],
      "args": [
        {
          "name": "deliverableUri",
          "type": "string"
        },
        {
          "name": "deliverableHash",
          "type": {
            "array": [
              "u8",
              32
            ]
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "job",
      "discriminator": [
        75,
        124,
        80,
        203,
        161,
        180,
        202,
        80
      ]
    }
  ],
  "events": [
    {
      "name": "disputed",
      "discriminator": [
        186,
        235,
        91,
        209,
        148,
        93,
        152,
        217
      ]
    },
    {
      "name": "jobCreated",
      "discriminator": [
        48,
        110,
        162,
        177,
        67,
        74,
        159,
        131
      ]
    },
    {
      "name": "jobFunded",
      "discriminator": [
        109,
        177,
        206,
        113,
        255,
        142,
        11,
        19
      ]
    },
    {
      "name": "settled",
      "discriminator": [
        232,
        210,
        40,
        17,
        142,
        124,
        145,
        238
      ]
    },
    {
      "name": "verdictProposed",
      "discriminator": [
        114,
        116,
        19,
        96,
        156,
        138,
        193,
        140
      ]
    },
    {
      "name": "workSubmitted",
      "discriminator": [
        136,
        185,
        210,
        174,
        216,
        140,
        64,
        125
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidStatus",
      "msg": "Job is not in the required status for this action"
    },
    {
      "code": 6001,
      "name": "unauthorized",
      "msg": "Signer is not allowed to perform this action"
    },
    {
      "code": 6002,
      "name": "deadlinePassed",
      "msg": "Deadline has passed"
    },
    {
      "code": 6003,
      "name": "deadlineNotPassed",
      "msg": "Deadline has not passed yet"
    },
    {
      "code": 6004,
      "name": "windowOpen",
      "msg": "Dispute window is still open"
    },
    {
      "code": 6005,
      "name": "windowClosed",
      "msg": "Dispute window has closed"
    },
    {
      "code": 6006,
      "name": "invalidWindow",
      "msg": "Dispute window out of allowed range"
    },
    {
      "code": 6007,
      "name": "invalidAmount",
      "msg": "Amount below minimum (0.001 SOL)"
    },
    {
      "code": 6008,
      "name": "invalidFreelancer",
      "msg": "Freelancer must be a different wallet from the client"
    },
    {
      "code": 6009,
      "name": "uriTooLong",
      "msg": "URI is empty or longer than 200 bytes"
    },
    {
      "code": 6010,
      "name": "invalidVerdict",
      "msg": "Verdict must be 1 (pass), 2 (fail) or 3 (inconclusive), score 0-100"
    },
    {
      "code": 6011,
      "name": "reviewNotTimedOut",
      "msg": "No verdict yet, but the review timeout has not passed"
    },
    {
      "code": 6012,
      "name": "insufficientEscrow",
      "msg": "Escrow balance too low"
    },
    {
      "code": 6013,
      "name": "mathOverflow",
      "msg": "Arithmetic overflow"
    }
  ],
  "types": [
    {
      "name": "disputed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "by",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "job",
      "docs": [
        "Fixed-size fields first so their byte offsets never change (useful for",
        "memcmp filters): client @16, freelancer @48, status @216. Strings last."
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "jobId",
            "type": "u64"
          },
          {
            "name": "client",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "arbiter",
            "type": "pubkey"
          },
          {
            "name": "admin",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "specHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "deliverableHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "jobStatus"
              }
            }
          },
          {
            "name": "verdict",
            "type": "u8"
          },
          {
            "name": "verdictScore",
            "type": "u8"
          },
          {
            "name": "verdictProposedAt",
            "type": "i64"
          },
          {
            "name": "disputeWindowSecs",
            "type": "i64"
          },
          {
            "name": "deadline",
            "type": "i64"
          },
          {
            "name": "disputedBy",
            "type": "pubkey"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "submittedAt",
            "docs": [
              "Set in submit_work. Lets either party escalate if no verdict arrives."
            ],
            "type": "i64"
          },
          {
            "name": "deliverableUri",
            "type": "string"
          },
          {
            "name": "verdictUri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "jobCreated",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "client",
            "type": "pubkey"
          },
          {
            "name": "freelancer",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "jobFunded",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "jobStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "created"
          },
          {
            "name": "funded"
          },
          {
            "name": "accepted"
          },
          {
            "name": "submitted"
          },
          {
            "name": "verdictProposed"
          },
          {
            "name": "disputed"
          },
          {
            "name": "released"
          },
          {
            "name": "refunded"
          },
          {
            "name": "cancelled"
          }
        ]
      }
    },
    {
      "name": "settled",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "released",
            "type": "bool"
          },
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "verdictProposed",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "verdict",
            "type": "u8"
          },
          {
            "name": "score",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "workSubmitted",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "job",
            "type": "pubkey"
          },
          {
            "name": "deliverableHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          }
        ]
      }
    }
  ]
};
