import crypto from "node:crypto";
import express, { type NextFunction, type Request, type Response, type Router } from "express";
import type { Pool } from "pg";
import { z } from "zod";
import {
  DEMO_AGREEMENT_VERSION,
  HARDCODED_SUPER_ADMIN_EMAIL,
  PRE_DEMO_CONTRACTS,
  type ActorRole,
  type HipaaLogger,
} from "@healthcare/shared-contracts";
import { writeAuditLog } from "./audit.js";
import { verifyPassword } from "./password-hash.js";

const LoginSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(1).max(200),
});

const GoogleVerifySchema = z.object({
  email: z.string().email().max(255),
  full_name: z.string().min(1).max(200).optional(),
  google_sub: z.string().min(1).max(255).optional(),
});

const SignAgreementSchema = z.object({
  email: z.string().email().max(255),
  full_name: z.string().min(2).max(200),
  organization: z.string().max(200).optional(),
  signed_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
  accepted_mnda: z.literal(true),
  accepted_sandbox: z.literal(true),
  accepted_non_phi: z.literal(true),
  accepted_pre_prod_notice: z.literal(true),
});

interface UserAuthRow {
  id: string;
  email: string;
  full_name: string;
  role: ActorRole;
  organization: string | null;
  is_active: boolean;
  is_hardcoded_admin: boolean;
  requires_demo_agreement: boolean;
  password_hash: string | null;
}

function extractIp(req: Request): string | null {
  const fwd = req.headers["x-forwarded-for"];
  if (typeof fwd === "string" && fwd.trim()) {
    return fwd.split(",")[0]!.trim();
  }
  const raw = req.ip ?? req.socket?.remoteAddress ?? null;
  if (!raw) return null;
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

function isSuperAdminEmail(email: string): boolean {
  return email.trim().toLowerCase() === HARDCODED_SUPER_ADMIN_EMAIL;
}

function computeAgreementHash(email: string, fullName: string, signedDate: string): string {
  const canonicalPayload = JSON.stringify({
    version: DEMO_AGREEMENT_VERSION,
    email: email.trim().toLowerCase(),
    full_name: fullName.trim(),
    signed_date: signedDate,
    contracts: PRE_DEMO_CONTRACTS.map((c) => ({
      code: c.code,
      title: c.title,
      governingLaw: c.governingLaw,
    })),
  });
  return crypto.createHash("sha256").update(canonicalPayload).digest("hex");
}

async function getLatestSignedAgreement(pool: Pool, email: string) {
  const res = await pool.query<{
    id: string;
    full_name: string;
    email: string;
    organization: string | null;
    signed_date: string;
    agreement_version: string;
    signed_at: string;
  }>(
    `
    SELECT id, full_name, email, organization, signed_date::text AS signed_date,
           agreement_version, signed_at
    FROM demo_agreements
    WHERE LOWER(email) = LOWER($1) AND agreement_version = $2
    ORDER BY signed_at DESC
    LIMIT 1
    `,
    [email.trim().toLowerCase(), DEMO_AGREEMENT_VERSION],
  );
  return res.rows[0] ?? null;
}

/**
 * Demo Hub Authentication & Pre-Demo Contract Signing Router (/api/v1/demo-auth)
 * - Hardcoded Super-Admin (radiologymgmt@gmail.com) authenticates via Google OAuth
 *   (or optional bootstrap password) and is ALWAYS exempt from pre-demo agreements.
 * - Admin-created Demo Viewers/Users authenticate with email + scrypt password and
 *   must electronically sign the NY Pre-Demo MNDA + Synthetic Sandbox Agreement
 *   (Date, Full Name, Email) prior to accessing the Demo Hub & product portals.
 */
export function createDemoAuthRouter(pool: Pool, logger: HipaaLogger): Router {
  const router = express.Router();

  // POST /api/v1/demo-auth/login — Email + Password login for Admin-created users
  router.post("/login", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = LoginSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Please enter a valid email address and password." });
        return;
      }

      const normalizedEmail = parsed.data.email.trim().toLowerCase();
      const userRes = await pool.query<UserAuthRow>(
        `
        SELECT id, email, full_name, role, organization, is_active,
               is_hardcoded_admin, requires_demo_agreement, password_hash
        FROM users
        WHERE LOWER(email) = $1
        LIMIT 1
        `,
        [normalizedEmail],
      );

      const user = userRes.rows[0];
      if (!user || !user.is_active) {
        res.status(401).json({ error: "Invalid email or password, or account is inactive." });
        return;
      }

      const bootstrapSecret = process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();
      const passwordOk =
        verifyPassword(parsed.data.password, user.password_hash) ||
        (isSuperAdminEmail(user.email) &&
          Boolean(bootstrapSecret) &&
          parsed.data.password.length === bootstrapSecret!.length &&
          crypto.timingSafeEqual(
            Buffer.from(parsed.data.password),
            Buffer.from(bootstrapSecret!),
          ));

      if (!passwordOk) {
        res.status(401).json({ error: "Invalid email or password." });
        return;
      }

      await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [user.id]);

      const superAdmin = user.is_hardcoded_admin || isSuperAdminEmail(user.email);
      const existingAgreement = superAdmin
        ? null
        : await getLatestSignedAgreement(pool, user.email);
      const requiresAgreement = superAdmin ? false : user.requires_demo_agreement && !existingAgreement;
      const agreementSigned = superAdmin || !user.requires_demo_agreement || Boolean(existingAgreement);

      await writeAuditLog(pool, {
        actor_id: user.email,
        actor_role: superAdmin ? "ADMIN" : user.role,
        action: "DEMO_PASSWORD_LOGIN",
        resource_type: "user",
        resource_id: user.id,
        ip_address: extractIp(req),
        metadata: {
          auth_method: "password",
          agreement_signed: agreementSigned,
          is_hardcoded_admin: superAdmin,
        },
      });

      logger.info("Demo user authenticated with password", {
        role: superAdmin ? "ADMIN" : user.role,
        agreement_signed: agreementSigned,
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: superAdmin ? "ADMIN" : user.role,
          organization: user.organization,
          is_hardcoded_admin: superAdmin,
        },
        requires_agreement: requiresAgreement,
        agreement_signed: agreementSigned,
        signed_agreement: existingAgreement,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/demo-auth/google-verify — Server-to-server Google OAuth verification
  router.post("/google-verify", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = GoogleVerifySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid Google identity payload." });
        return;
      }

      const normalizedEmail = parsed.data.email.trim().toLowerCase();
      const superAdmin = isSuperAdminEmail(normalizedEmail);

      if (superAdmin) {
        const upserted = await pool.query<UserAuthRow>(
          `
          INSERT INTO users (
            email, full_name, role, specialty, organization, sso_subject,
            is_active, is_hardcoded_admin, requires_demo_agreement, last_login_at, created_by
          )
          VALUES ($1, $2, 'ADMIN', 'Platform Owner & Clinical Administration', 'RadManagement LLC', $3, TRUE, TRUE, FALSE, NOW(), 'google-oauth')
          ON CONFLICT (email) DO UPDATE SET
            full_name = COALESCE(NULLIF($2, ''), users.full_name),
            role = 'ADMIN',
            sso_subject = COALESCE($3, users.sso_subject),
            is_active = TRUE,
            is_hardcoded_admin = TRUE,
            requires_demo_agreement = FALSE,
            last_login_at = NOW(),
            updated_at = NOW()
          RETURNING id, email, full_name, role, organization, is_active,
                    is_hardcoded_admin, requires_demo_agreement, password_hash
          `,
          [
            normalizedEmail,
            parsed.data.full_name?.trim() || "RadManagement Super-Admin",
            parsed.data.google_sub ?? null,
          ],
        );
        const adminUser = upserted.rows[0]!;

        await writeAuditLog(pool, {
          actor_id: adminUser.email,
          actor_role: "ADMIN",
          action: "DEMO_GOOGLE_LOGIN",
          resource_type: "user",
          resource_id: adminUser.id,
          ip_address: extractIp(req),
          metadata: {
            auth_method: "google_oauth",
            is_hardcoded_admin: true,
            agreement_exempt: true,
          },
        });

        res.json({
          user: {
            id: adminUser.id,
            email: adminUser.email,
            full_name: adminUser.full_name,
            role: "ADMIN",
            organization: adminUser.organization,
            is_hardcoded_admin: true,
          },
          requires_agreement: false,
          agreement_signed: true,
          signed_agreement: null,
        });
        return;
      }

      // Non-super-admin Google login must be pre-authorized in the users table
      const existingRes = await pool.query<UserAuthRow>(
        `
        SELECT id, email, full_name, role, organization, is_active,
               is_hardcoded_admin, requires_demo_agreement, password_hash
        FROM users
        WHERE LOWER(email) = $1 AND is_active = TRUE
        LIMIT 1
        `,
        [normalizedEmail],
      );
      const user = existingRes.rows[0];
      if (!user) {
        res.status(403).json({
          error:
            "This Google account is not authorized to view the demo. Please contact RadManagement LLC to request access or sign in with your issued email and password.",
        });
        return;
      }

      await pool.query(
        "UPDATE users SET sso_subject = COALESCE($1, sso_subject), last_login_at = NOW() WHERE id = $2",
        [parsed.data.google_sub ?? null, user.id],
      );

      const existingAgreement = await getLatestSignedAgreement(pool, user.email);
      const requiresAgreement = user.requires_demo_agreement && !existingAgreement;
      const agreementSigned = !user.requires_demo_agreement || Boolean(existingAgreement);

      await writeAuditLog(pool, {
        actor_id: user.email,
        actor_role: user.role,
        action: "DEMO_GOOGLE_LOGIN",
        resource_type: "user",
        resource_id: user.id,
        ip_address: extractIp(req),
        metadata: { auth_method: "google_oauth", agreement_signed: agreementSigned },
      });

      res.json({
        user: {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
          role: user.role,
          organization: user.organization,
          is_hardcoded_admin: false,
        },
        requires_agreement: requiresAgreement,
        agreement_signed: agreementSigned,
        signed_agreement: existingAgreement,
      });
    } catch (err) {
      next(err);
    }
  });

  // POST /api/v1/demo-auth/sign-agreement — Electronic signature for NY Pre-Demo Contracts
  router.post("/sign-agreement", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const parsed = SignAgreementSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: "All agreement checkboxes, full name, email, and signature date are required.",
          details: parsed.error.flatten(),
        });
        return;
      }

      const d = parsed.data;
      const normalizedEmail = d.email.trim().toLowerCase();

      const userRes = await pool.query<{ id: string; role: ActorRole; organization: string | null }>(
        "SELECT id, role, organization FROM users WHERE LOWER(email) = $1 AND is_active = TRUE LIMIT 1",
        [normalizedEmail],
      );
      const user = userRes.rows[0];
      if (!user) {
        res.status(403).json({ error: "Authorized user account required to execute demo agreements." });
        return;
      }

      const agreementHash = computeAgreementHash(normalizedEmail, d.full_name, d.signed_date);
      const inserted = await pool.query(
        `
        INSERT INTO demo_agreements (
          user_id, email, full_name, organization, signed_date,
          agreement_version, agreements_accepted, agreement_hash, ip_address, user_agent
        )
        VALUES ($1, $2, $3, $4, $5::date, $6, $7::text[], $8, $9::inet, $10)
        RETURNING id, user_id, email, full_name, organization,
                  signed_date::text AS signed_date, agreement_version,
                  agreements_accepted, agreement_hash, signed_at
        `,
        [
          user.id,
          normalizedEmail,
          d.full_name.trim(),
          d.organization?.trim() || user.organization || null,
          d.signed_date,
          DEMO_AGREEMENT_VERSION,
          ["PRE_DEMO_MNDA", "SYNTHETIC_SANDBOX_AGREEMENT", "PRE_PROD_DISCLOSURE"],
          agreementHash,
          extractIp(req),
          req.headers["user-agent"]?.slice(0, 500) ?? null,
        ],
      );

      const record = inserted.rows[0]!;
      await writeAuditLog(pool, {
        actor_id: normalizedEmail,
        actor_role: user.role,
        action: "SIGN_DEMO_AGREEMENT",
        resource_type: "demo_agreement",
        resource_id: record.id as string,
        ip_address: extractIp(req),
        metadata: {
          agreement_version: DEMO_AGREEMENT_VERSION,
          signed_date: d.signed_date,
          agreement_hash: agreementHash,
        },
      });

      logger.info("Recorded electronic Pre-Demo agreement signature", {
        agreement_id: record.id,
        agreement_version: DEMO_AGREEMENT_VERSION,
      });

      res.status(201).json({ agreement: record });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
